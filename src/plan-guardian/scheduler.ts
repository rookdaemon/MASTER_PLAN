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
  PlanFile,
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
import { runSanityPass } from './sanity-pass.js';

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
  onWorkerStart?(task: string, actionType: DispatchItem['actionType']): void;
  onWorkerComplete?(result: WorkerResult): void;
  onWorkerError?(task: string, error: Error): void;
  onCommit?(hash: string, message: string): void;
  onEpochEnd?(result: EpochResult): void;
  /** Called once when a soft-stop is requested (e.g. ESC pressed). */
  onSoftStop?(): void;
}

/** A handle returned by runScheduler that lets callers request a soft stop. */
export interface SchedulerHandle {
  /** Request a clean exit after the current epoch finishes. */
  stop(): void;
  /** Resolves when the scheduler has fully exited. */
  done: Promise<EpochResult[]>;
}

export function runScheduler(
  config: GuardianConfig,
  callbacks: SchedulerCallbacks = {},
): SchedulerHandle {
  let stopRequested = false;

  const done = (async (): Promise<EpochResult[]> => {
  const results: EpochResult[] = [];

  for (let epoch = 0; epoch < config.maxIterations; epoch++) {
    if (stopRequested) break;
    const epochResult = await runEpoch(epoch, config, callbacks);
    results.push(epochResult);

    if (epochResult.dispatched === 0) break;
  }

  return results;
  })();

  return {
    stop() {
      if (!stopRequested) {
        stopRequested = true;
        callbacks.onSoftStop?.();
      }
    },
    done,
  };
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

  const workerPromises = batch.map(item => {
    callbacks.onWorkerStart?.(item.task.path, item.actionType);
    return runWorker(item, dag, provider, now, config);
  });
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
    } else {
      failed++;
      callbacks.onWorkerError?.(batch[i].task.path, outcome.reason as Error);
    }
  }

  let accepted: WorkerResult[] = successful;

  if (!dryRun && successful.length > 0) {
    const baselineNodes = dag.nodes;
    const integrityAccepted: WorkerResult[] = [];

    for (const result of successful) {
      const verdict = validateActionIntegrity(result.action, baselineNodes, config);
      if (config.strictIntegrity && !verdict.valid) {
        failed++;
        callbacks.onWorkerError?.(
          result.action.targetPath,
          new Error(`Integrity violation in ${result.action.targetPath}: ${verdict.errors.join('; ')}`),
        );
        continue;
      }
      integrityAccepted.push(result);
    }

    accepted = integrityAccepted;

    if (accepted.length > 0 && config.strictIntegrity) {
      const sanityAccepted: WorkerResult[] = [];
      for (const result of accepted) {
        // Deterministic status updates intentionally avoid model calls.
        const modelGenerated = (result.tokensUsed.prompt + result.tokensUsed.completion) > 0;
        if (!modelGenerated) {
          sanityAccepted.push(result);
          continue;
        }

        const sanityErrors = await runActionSanityPass(
          result.action,
          baselineNodes,
          provider,
          config.maxTokensPerCall,
          config.planDir,
        );
        if (sanityErrors.length > 0) {
          failed++;
          callbacks.onWorkerError?.(
            result.action.targetPath,
            new Error(`Sanity PASS gate failed in ${result.action.targetPath}: ${sanityErrors.join('; ')}`),
          );
          continue;
        }
        sanityAccepted.push(result);
      }
      accepted = sanityAccepted;
    }

    if (accepted.length > 0) {
      const snapshot = buildSnapshotWithActions(
        baselineNodes,
        accepted.map(r => r.action),
      );
      const graphVerdict = validateGraphIntegrity(snapshot, planDir);
      if (config.strictIntegrity && !graphVerdict.valid) {
        const msg = `Epoch graph integrity failed: ${graphVerdict.errors.join('; ')}`;
        for (const result of accepted) {
          failed++;
          callbacks.onWorkerError?.(result.action.targetPath, new Error(msg));
        }
        accepted = [];
      }
    }

    if (accepted.length > 0) {
      const allFiles = collectFiles(accepted.map(r => r.action));
      await writeAllFiles(fs, allFiles);
      await git.add([...allFiles.keys()]);

      const staged = (await git.stagedPaths()).map(normalizePlanPath).sort();
      const expected = [...allFiles.keys()].map(normalizePlanPath).sort();
      const extras = staged.filter(p => !expected.includes(p));
      if (extras.length > 0) {
        throw new Error(`Refusing commit: unrelated staged files detected: ${extras.join(', ')}`);
      }

      // No-op writes (same file content) should not crash the guardian loop.
      if (staged.length > 0) {
        const summaries = accepted.map(r => r.action.summary).join('; ');
        const message = `[guardian] epoch ${epoch}: ${summaries}`;
        const hash = await git.commit(message, config.quarantineBranch);
        commits.push(hash);
        callbacks.onCommit?.(hash, message);
      }
    }
  }

  for (const result of accepted) {
    callbacks.onWorkerComplete?.(result);
  }

  const epochResult: EpochResult = {
    epoch,
    dispatched: batch.length,
    completed: accepted.length,
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

  return runPlanningWorker(
    item.task,
    item.actionType,
    dag,
    provider,
    now,
    config.maxTokensPerCall,
    validateText,
  );
}

function runTextValidation(
  text: string,
  actionType: DispatchItem['actionType'],
  targetPath: string,
  now: string,
  dag: IPlanDAG,
  config: GuardianConfig,
): string[] {
  let action;
  try {
    action = parseActionOutput(text, actionType, targetPath, now);
  } catch (parseErr) {
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    return [`Parse error: ${parseMsg}`];
  }
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

async function runActionSanityPass(
  action: PlanningAction,
  baselineNodes: ReadonlyMap<string, PlanFile>,
  provider: IInferenceProvider,
  maxTokensPerCall: number,
  planDir: string,
): Promise<string[]> {
  const errors: string[] = [];
  const writes = [...action.filesCreated, ...action.filesModified];

  for (const write of writes) {
    const path = normalizePlanPath(write.path);
    if (!path.endsWith('.md') || !path.startsWith(`${planDir}/`)) continue;

    const baselineNode = baselineNodes.get(path);
    const oldCard = baselineNode ? serializePlanNode(baselineNode) : '<NONE>';
    const result = await runSanityPass(
      provider,
      {
        path,
        oldCard,
        proposedCard: write.content,
      },
      Math.min(maxTokensPerCall, 256),
    );

    if (!result.pass) {
      const compact = result.raw.length > 200 ? `${result.raw.slice(0, 200)}...` : result.raw;
      errors.push(`${path}: expected PASS, got "${compact || '<empty>'}"`);
    }
  }

  return errors;
}

function serializePlanNode(node: PlanFile): string {
  const lines: string[] = [];
  if (node.frontmatter.parent) lines.push(`parent: ${node.frontmatter.parent}`);
  if (node.frontmatter.root) lines.push(`root: ${node.frontmatter.root}`);
  if (node.frontmatter.children?.length) {
    lines.push('children:');
    for (const c of node.frontmatter.children) lines.push(`  - ${c}`);
  }
  if (node.frontmatter['blocked-by']?.length) {
    lines.push('blocked-by:');
    for (const b of node.frontmatter['blocked-by']) lines.push(`  - ${b}`);
  }
  if (node.frontmatter['depends-on']?.length) {
    lines.push('depends-on:');
    for (const d of node.frontmatter['depends-on']) lines.push(`  - ${d}`);
  }
  return `---\n${lines.join('\n')}\n---\n${node.body}`;
}

async function writeAllFiles(fs: IFileSystem, files: ReadonlyMap<string, string>): Promise<void> {
  for (const [path, content] of files) {
    await fs.writeFile(path, content, 'utf-8');
  }
}
