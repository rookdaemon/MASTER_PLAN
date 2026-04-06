/**
 * Scheduler — Main loop orchestrator for the Plan Guardian.
 *
 * Each epoch: rebuild DAG → prioritize → select batch → fan-out workers → serial commits.
 * Uses a single inference provider for everything — the system is designed so that
 * even a 7B model can handle any action, because quality comes from the prompts.
 *
 * Domain: Plan Guardian
 */

import type { IFileSystem } from '../agent-runtime/filesystem.js';
import type {
  GuardianConfig,
  IGitOperations,
  PlanningAction,
  WorkerResult,
  DispatchItem,
} from './interfaces.js';
import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';
import type { IPlanDAG } from './interfaces.js';
import { buildDAG } from './dag.js';
import { prioritize, selectIndependentBatch } from './priority.js';
import { runPlanningWorker } from './worker.js';
import { runExecutionWorker } from './executor.js';
import {
  buildSnapshotWithActions,
  validateActionIntegrity,
  validateGraphIntegrity,
} from './integrity.js';
import { normalizePlanPath, parseActionOutput } from './actions.js';

export interface EpochResult {
  epoch: number;
  dispatched: number;
  completed: number;
  failed: number;
  commits: string[];
  totalTokens: { prompt: number; completion: number };
}

export interface SchedulerCallbacks {
  onEpochStart?(epoch: number, batchSize: number): void;
  onWorkerComplete?(result: WorkerResult): void;
  onWorkerError?(task: string, error: Error): void;
  onCommit?(hash: string, message: string): void;
  onEpochEnd?(result: EpochResult): void;
}

export async function runScheduler(
  config: GuardianConfig,
  callbacks: SchedulerCallbacks = {},
): Promise<EpochResult[]> {
  const results: EpochResult[] = [];

  for (let epoch = 0; epoch < config.maxIterations; epoch++) {
    const epochResult = await runEpoch(epoch, config, callbacks);
    results.push(epochResult);

    if (epochResult.dispatched === 0) break;
  }

  return results;
}

export async function runEpoch(
  epoch: number,
  config: GuardianConfig,
  callbacks: SchedulerCallbacks = {},
): Promise<EpochResult> {
  const { fs, git, clock, planDir, concurrency, provider, dryRun } = config;
  const now = clock.now();

  const dag = await buildDAG(fs, planDir);
  const candidates = prioritize(dag, now);
  if (candidates.length === 0) {
    return { epoch, dispatched: 0, completed: 0, failed: 0, commits: [], totalTokens: { prompt: 0, completion: 0 } };
  }

  const batch = selectIndependentBatch(candidates, concurrency);
  callbacks.onEpochStart?.(epoch, batch.length);

  const workerPromises = batch.map(item => runWorker(item, dag, provider, now, config));
  const settled = await Promise.allSettled(workerPromises);

  const successful: WorkerResult[] = [];
  const commits: string[] = [];
  let failed = 0;
  const totalTokens = { prompt: 0, completion: 0 };

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      const result = outcome.value;
      successful.push(result);
      totalTokens.prompt += result.tokensUsed.prompt;
      totalTokens.completion += result.tokensUsed.completion;
      callbacks.onWorkerComplete?.(result);
    } else {
      failed++;
      callbacks.onWorkerError?.(batch[i].task.path, outcome.reason as Error);
    }
  }

  if (!dryRun && successful.length > 0) {
    const baselineNodes = dag.nodes;
    for (const result of successful) {
      const verdict = validateActionIntegrity(result.action, baselineNodes, config);
      if (config.strictIntegrity && !verdict.valid) {
        throw new Error(`Integrity violation in ${result.action.targetPath}: ${verdict.errors.join('; ')}`);
      }
    }

    const snapshot = buildSnapshotWithActions(
      baselineNodes,
      successful.map(r => r.action),
    );
    const graphVerdict = validateGraphIntegrity(snapshot, planDir);
    if (config.strictIntegrity && !graphVerdict.valid) {
      throw new Error(`Epoch graph integrity failed: ${graphVerdict.errors.join('; ')}`);
    }

    const allFiles = collectFiles(successful.map(r => r.action));
    await writeAllFiles(fs, allFiles);
    await git.add([...allFiles.keys()]);

    const staged = (await git.stagedPaths()).map(normalizePlanPath).sort();
    const expected = [...allFiles.keys()].map(normalizePlanPath).sort();
    const extras = staged.filter(p => !expected.includes(p));
    if (extras.length > 0) {
      throw new Error(`Refusing commit: unrelated staged files detected: ${extras.join(', ')}`);
    }

    const message = `[guardian] epoch ${epoch}: ${successful.length} action(s)`;
    const hash = await git.commit(message, config.quarantineBranch);
    commits.push(hash);
    callbacks.onCommit?.(hash, message);
  }

  const epochResult: EpochResult = {
    epoch,
    dispatched: batch.length,
    completed: successful.length,
    failed,
    commits,
    totalTokens,
  };
  callbacks.onEpochEnd?.(epochResult);
  return epochResult;
}

// ── Internal ────────────────────────────────────────────────

async function runWorker(
  item: DispatchItem,
  dag: IPlanDAG,
  provider: IInferenceProvider,
  now: string,
  config: GuardianConfig,
): Promise<WorkerResult> {
  if (item.actionType === 'status-update') {
    const children = dag.childrenOf(item.task.path);
    if (children.length > 0 && children.every(c => c.status === 'DONE')) {
      return makeDeterministicStatusUpdate(item, now);
    }
  }

  if (item.actionType === 'execute') {
    return runExecutionWorker(item.task, provider, now);
  }

  const validateText = config.strictIntegrity
    ? (text: string): string[] => {
        try {
          return runTextValidation(text, item.actionType, item.task.path, now, dag, config);
        } catch (err) {
          return [err instanceof Error ? err.message : String(err)];
        }
      }
    : undefined;

  return runPlanningWorker(item.task, item.actionType, dag, provider, now, 4096, validateText);
}

function runTextValidation(
  text: string,
  actionType: DispatchItem['actionType'],
  targetPath: string,
  now: string,
  dag: IPlanDAG,
  config: GuardianConfig,
): string[] {
  const action = parseActionOutput(text, actionType, targetPath, now);
  if (action.filesCreated.length === 0 && action.filesModified.length === 0) {
    return ['No plan-file/artifact writes parsed'];
  }

  const baseline = dag.nodes;
  const verdict = validateActionIntegrity(action, baseline, config);
  return verdict.errors;
}

function makeDeterministicStatusUpdate(item: DispatchItem, now: string): WorkerResult {
  const task = item.task;
  const updatedBody = task.body.replace(
    /^(# [\d.]+ .+)\[[\w]+\]/m,
    `$1[DONE]`,
  ) + `\n## Revision History\n- ${now}: status ${task.status} → DONE (all children completed)\n`;

  const fmLines: string[] = [];
  if (task.frontmatter.parent) fmLines.push(`parent: ${task.frontmatter.parent}`);
  if (task.frontmatter.root) fmLines.push(`root: ${task.frontmatter.root}`);
  if (task.frontmatter.children?.length) {
    fmLines.push('children:');
    for (const c of task.frontmatter.children) fmLines.push(`  - ${c}`);
  }
  if (task.frontmatter['blocked-by']?.length) {
    fmLines.push('blocked-by:');
    for (const b of task.frontmatter['blocked-by']) fmLines.push(`  - ${b}`);
  }
  if (task.frontmatter['depends-on']?.length) {
    fmLines.push('depends-on:');
    for (const d of task.frontmatter['depends-on']) fmLines.push(`  - ${d}`);
  }

  const content = `---\n${fmLines.join('\n')}\n---\n${updatedBody}`;

  return {
    action: {
      type: 'status-update',
      targetPath: task.path,
      summary: `${task.path.split('/').pop()?.replace('.md', '')} → DONE (all children completed)`,
      filesCreated: [],
      filesModified: [{ path: task.path, content }],
      writeSet: [task.path],
    },
    tokensUsed: { prompt: 0, completion: 0 },
    latencyMs: 0,
  };
}

function collectFiles(actions: readonly PlanningAction[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const action of actions) {
    for (const f of action.filesCreated) files.set(normalizePlanPath(f.path), f.content);
    for (const f of action.filesModified) files.set(normalizePlanPath(f.path), f.content);
  }
  return files;
}

async function writeAllFiles(fs: IFileSystem, files: ReadonlyMap<string, string>): Promise<void> {
  for (const [path, content] of files) {
    await fs.writeFile(path, content, 'utf-8');
  }
}
