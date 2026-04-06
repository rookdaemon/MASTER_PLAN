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

  // 1. Rebuild DAG from files
  const dag = await buildDAG(fs, planDir);

  // 2. Prioritize
  const candidates = prioritize(dag, now);
  if (candidates.length === 0) {
    return { epoch, dispatched: 0, completed: 0, failed: 0, commits: [], totalTokens: { prompt: 0, completion: 0 } };
  }

  // 3. Select independent batch
  const batch = selectIndependentBatch(candidates, concurrency);
  callbacks.onEpochStart?.(epoch, batch.length);

  // 4. Fan-out workers in parallel — same provider for all actions
  const workerPromises = batch.map(item => runWorker(item, dag, provider, now));
  const settled = await Promise.allSettled(workerPromises);

  // 5. Collect results
  const commits: string[] = [];
  let completed = 0;
  let failed = 0;
  const totalTokens = { prompt: 0, completion: 0 };

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      const result = outcome.value;
      completed++;
      totalTokens.prompt += result.tokensUsed.prompt;
      totalTokens.completion += result.tokensUsed.completion;
      callbacks.onWorkerComplete?.(result);

      if (!dryRun) {
        const hash = await commitAction(result.action, fs, git);
        commits.push(hash);
        callbacks.onCommit?.(hash, `[guardian] ${result.action.type}: ${result.action.summary}`);
      }
    } else {
      failed++;
      callbacks.onWorkerError?.(batch[i].task.path, outcome.reason as Error);
    }
  }

  const epochResult: EpochResult = { epoch, dispatched: batch.length, completed, failed, commits, totalTokens };
  callbacks.onEpochEnd?.(epochResult);
  return epochResult;
}

// ── Internal ────────────────────────────────────────────────

async function runWorker(
  item: DispatchItem,
  dag: IPlanDAG,
  provider: IInferenceProvider,
  now: string,
): Promise<WorkerResult> {
  // Deterministic status-update when all children DONE — no LLM needed
  if (item.actionType === 'status-update') {
    const children = dag.childrenOf(item.task.path);
    if (children.length > 0 && children.every(c => c.status === 'DONE')) {
      return makeDeterministicStatusUpdate(item, now);
    }
  }

  if (item.actionType === 'execute') {
    return runExecutionWorker(item.task, provider, now);
  }

  return runPlanningWorker(item.task, item.actionType, dag, provider, now);
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

async function commitAction(
  action: PlanningAction,
  fs: IFileSystem,
  git: IGitOperations,
): Promise<string> {
  const allFiles: string[] = [];

  for (const f of action.filesCreated) {
    await fs.writeFile(f.path, f.content, 'utf-8');
    allFiles.push(f.path);
  }
  for (const f of action.filesModified) {
    await fs.writeFile(f.path, f.content, 'utf-8');
    allFiles.push(f.path);
  }

  await git.add(allFiles);
  return git.commit(`[guardian] ${action.type}: ${action.summary}`);
}
