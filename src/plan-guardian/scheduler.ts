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
  rateLimitFailures: number;
  rateLimitBackoffHintMs: number;
  rateLimitReasons: string[];
  dispatchedTaskPaths: string[];
  rateLimitedTasks: RateLimitedTask[];
  commits: string[];
  totalTokens: { prompt: number; completion: number };
}

export interface RateLimitedTask {
  path: string;
  reason: string;
  hintMs: number;
}

export interface SchedulerCallbacks {
  onEpochStart?(epoch: number, batchSize: number): void;
  onWorkerStart?(task: string, actionType: DispatchItem['actionType']): void;
  onWorkerComplete?(result: WorkerResult): void;
  onWorkerError?(task: string, error: Error): void;
  onCommit?(hash: string, message: string): void;
  onEpochEnd?(result: EpochResult): void;
  onRateLimitBackoff?(delayMs: number, failures: number, reasons: readonly string[]): void;
  /** Called once when a soft-stop is requested (e.g. ESC pressed). */
  onSoftStop?(): void;
}

const INITIAL_RATE_LIMIT_BACKOFF_MS = 5_000;
const MAX_RATE_LIMIT_BACKOFF_MS = 2 * 60 * 60 * 1000;

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
  const blockedTasks = new Map<string, BlockedTaskState>();
  const initialBackoffMs = getInitialRateLimitBackoffMs(config);

  const done = (async (): Promise<EpochResult[]> => {
  const results: EpochResult[] = [];

  let epoch = 0;
  let cycleCount = 0;
  let activeQueue: QueuedDispatchItem[] | null = null;
  let epochAggregate: EpochResult | null = null;

  while (cycleCount < config.maxIterations) {
    if (stopRequested) break;

    if (activeQueue == null) {
      activeQueue = await buildEpochQueue(config, blockedTasks);
      if (activeQueue.length === 0) {
        const empty: EpochResult = {
          epoch,
          dispatched: 0,
          completed: 0,
          failed: 0,
          rateLimitFailures: 0,
          rateLimitBackoffHintMs: 0,
          rateLimitReasons: [],
          dispatchedTaskPaths: [],
          rateLimitedTasks: [],
          commits: [],
          totalTokens: { prompt: 0, completion: 0 },
        };
        callbacks.onEpochEnd?.(empty);
        results.push(empty);
        break;
      }

      callbacks.onEpochStart?.(epoch, activeQueue.length);
      epochAggregate = {
        epoch,
        dispatched: 0,
        completed: 0,
        failed: 0,
        rateLimitFailures: 0,
        rateLimitBackoffHintMs: 0,
        rateLimitReasons: [],
        dispatchedTaskPaths: [],
        rateLimitedTasks: [],
        commits: [],
        totalTokens: { prompt: 0, completion: 0 },
      };
    }

    const nowMs = getClockMs(config);
    const epochResult = await runEpoch(
      epoch,
      config,
      { ...callbacks, onEpochStart: undefined, onEpochEnd: undefined },
      blockedTasks,
      activeQueue,
    );
    cycleCount += 1;

    epochAggregate = mergeEpochResults(epochAggregate!, epochResult);

    const rateLimitedPaths = new Set(epochResult.rateLimitedTasks.map(task => task.path));
    const consumedPaths = new Set(
      epochResult.dispatchedTaskPaths.filter(path => !rateLimitedPaths.has(path)),
    );
    activeQueue = activeQueue.filter(item => !consumedPaths.has(item.path));

    for (const path of consumedPaths) {
      blockedTasks.delete(path);
    }

    for (const task of epochResult.rateLimitedTasks) {
      const previous = blockedTasks.get(task.path);
      // When a model selector is active, trust hintMs directly — the model-level
      // circuit breaker already handles exponential backoff, so avoid compounding
      // at the task level too.
      const delayMs = config.modelSelector
        ? clampBackoffMs(task.hintMs > 0 ? task.hintMs : initialBackoffMs)
        : clampBackoffMs(Math.max(
            previous ? Math.min(previous.lastDelayMs * 2, MAX_RATE_LIMIT_BACKOFF_MS) : initialBackoffMs,
            task.hintMs,
          ));
      blockedTasks.set(task.path, {
        path: task.path,
        reason: task.reason,
        lastDelayMs: delayMs,
        resumeAtMs: nowMs + delayMs,
      });
    }

    if (activeQueue.length === 0) {
      callbacks.onEpochEnd?.(epochAggregate);
      results.push(epochAggregate);
      activeQueue = null;
      epochAggregate = null;
      epoch += 1;
      continue;
    }

    if (cycleCount >= config.maxIterations) {
      break;
    }

    const nextResumeAtMs = Math.min(...activeQueue.map(item => blockedTasks.get(item.path)?.resumeAtMs ?? nowMs));
    const delayMs = clampBackoffMs(Math.max(0, nextResumeAtMs - nowMs));
    if (delayMs > 0) {
      callbacks.onRateLimitBackoff?.(
        delayMs,
        activeQueue.length,
        summarizeBlockedReasons(blockedTasks),
      );
      await config.sleeper.sleep(delayMs);
    }
  }

  if (epochAggregate) {
    callbacks.onEpochEnd?.(epochAggregate);
    results.push(epochAggregate);
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
  blockedTasks: ReadonlyMap<string, BlockedTaskState> = new Map(),
  queuedBatch?: readonly QueuedDispatchItem[],
): Promise<EpochResult> {
  const { fs, git, clock, planDir, concurrency, provider, dryRun } = config;
  const now = clock.now();
  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now();

  const dag = await buildDAG(fs, planDir);
  const batch = queuedBatch
    ? buildDispatchBatchFromQueue(queuedBatch, dag, blockedTasks, nowMs)
    : selectIndependentBatch(
        prioritize(dag, now).filter(candidate => {
          const blocked = blockedTasks.get(candidate.task.path);
          return !blocked || blocked.resumeAtMs <= nowMs;
        }),
        concurrency,
      );
  if (batch.length === 0) {
    return {
      epoch,
      dispatched: 0,
      completed: 0,
      failed: 0,
      rateLimitFailures: 0,
      rateLimitBackoffHintMs: 0,
      rateLimitReasons: [],
      dispatchedTaskPaths: [],
      rateLimitedTasks: [],
      commits: [],
      totalTokens: { prompt: 0, completion: 0 },
    };
  }

  if (!queuedBatch) {
    callbacks.onEpochStart?.(epoch, batch.length);
  }

  const successful: WorkerResult[] = [];
  const commits: string[] = [];
  let failed = 0;
  let rateLimitFailures = 0;
  let rateLimitBackoffHintMs = 0;
  const rateLimitReasonCounts = new Map<string, number>();
  const rateLimitedTasks: RateLimitedTask[] = [];
  const totalTokens = { prompt: 0, completion: 0 };

  const dispatchedTaskPaths: string[] = [];
  let stopSubmittingForRateLimit = false;

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    if (stopSubmittingForRateLimit) break;

    callbacks.onWorkerStart?.(item.task.path, item.actionType);
    dispatchedTaskPaths.push(item.task.path);

    const outcome = await dispatchWithFallback(item, dag, provider, now, nowMs, config);

    if (outcome.kind === 'ok') {
      successful.push(outcome.result);
      totalTokens.prompt += outcome.result.tokensUsed.prompt;
      totalTokens.completion += outcome.result.tokensUsed.completion;
    } else if (outcome.kind === 'rate-limited') {
      failed++;
      rateLimitFailures++;
      const { hintMs, reason } = outcome;
      rateLimitBackoffHintMs = Math.max(rateLimitBackoffHintMs, hintMs);
      rateLimitReasonCounts.set(reason, (rateLimitReasonCounts.get(reason) ?? 0) + 1);
      rateLimitedTasks.push({ path: item.task.path, reason, hintMs });
      for (let j = i + 1; j < batch.length; j++) {
        rateLimitedTasks.push({ path: batch[j].task.path, reason, hintMs });
      }
      stopSubmittingForRateLimit = true;
      callbacks.onWorkerError?.(item.task.path, new Error(`Rate limited: ${reason}`));
    } else {
      failed++;
      callbacks.onWorkerError?.(item.task.path, outcome.error as Error);
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

        const sanityProvider = config.modelSelector?.selectProvider(nowMs)?.provider ?? provider;
        const sanityErrors = await runActionSanityPass(
          result.action,
          baselineNodes,
          sanityProvider,
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
    rateLimitFailures,
    rateLimitBackoffHintMs,
    rateLimitReasons: [...rateLimitReasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason]) => reason),
    dispatchedTaskPaths,
    rateLimitedTasks,
    commits,
    totalTokens,
  };
  callbacks.onEpochEnd?.(epochResult);
  return epochResult;
}

// ── Internal ────────────────────────────────────────────────

/**
 * Dispatch a single task, transparently rotating through models on rate-limit.
 *
 * When `config.modelSelector` is present, the function tries each available
 * model in priority order. Only when ALL models are exhausted does it return
 * `{ kind: 'rate-limited' }`. Non-rate-limit errors always surface immediately.
 */
type DispatchOutcome =
  | { kind: 'ok'; result: WorkerResult }
  | { kind: 'rate-limited'; hintMs: number; reason: string }
  | { kind: 'error'; error: unknown };

async function dispatchWithFallback(
  item: DispatchItem,
  dag: IPlanDAG,
  baseProvider: IInferenceProvider,
  now: string,
  nowMs: number,
  config: GuardianConfig,
): Promise<DispatchOutcome> {
  const selector = config.modelSelector;

  if (!selector) {
    try {
      return { kind: 'ok', result: await runWorker(item, dag, baseProvider, now, config) };
    } catch (err) {
      if (isRateLimitError(err)) {
        return {
          kind: 'rate-limited',
          hintMs: parseRateLimitBackoffHintMs(err, nowMs),
          reason: extractRateLimitReason(err),
        };
      }
      return { kind: 'error', error: err };
    }
  }

  // Walk the priority list until one model succeeds or all are exhausted.
  const tried = new Set<string>();
  for (;;) {
    const selected = selector.selectProvider(nowMs);
    if (!selected || tried.has(selected.modelId)) {
      // Every model has been tried and rate-limited.
      const hintMs = Math.max(0, selector.nextAvailableAtMs(nowMs) - nowMs);
      return { kind: 'rate-limited', hintMs, reason: 'all-models-rate-limited' };
    }
    tried.add(selected.modelId);
    try {
      return { kind: 'ok', result: await runWorker(item, dag, selected.provider, now, config) };
    } catch (err) {
      if (isRateLimitError(err)) {
        selector.recordRateLimit(selected.modelId, parseRateLimitBackoffHintMs(err, nowMs), nowMs);
        // Loop to try the next available model.
      } else {
        return { kind: 'error', error: err };
      }
    }
  }
}

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

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('429')
    || normalized.includes('too many requests')
    || normalized.includes('rate limit');
}

function parseRateLimitBackoffHintMs(err: unknown, nowMs: number): number {
  const message = err instanceof Error ? err.message : String(err ?? '');

  // Prefer explicit reset timestamp hints when present.
  const resetMatch = message.match(/x-ratelimit-reset\"?\s*[:=]\s*\"?([0-9]{10,13})/i);
  if (resetMatch) {
    const rawReset = Number.parseInt(resetMatch[1], 10);
    if (Number.isFinite(rawReset) && rawReset > 0) {
      // 10 digits => seconds epoch; 13 digits => milliseconds epoch.
      const resetMs = rawReset < 1_000_000_000_000 ? rawReset * 1000 : rawReset;
      const delta = resetMs - nowMs;
      if (delta > 0) return clampBackoffMs(delta);
    }
  }

  // Fallback: parse Retry-After (seconds).
  const match = message.match(/retry-after\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return 0;
  const seconds = Number.parseFloat(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return clampBackoffMs(Math.round(seconds * 1000));
}

function getInitialRateLimitBackoffMs(config: GuardianConfig): number {
  const rpm = config.modelMetadata?.rateLimits?.requestsPerMinute;
  if (typeof rpm !== 'number' || !Number.isFinite(rpm) || rpm <= 0) {
    return INITIAL_RATE_LIMIT_BACKOFF_MS;
  }
  const seeded = Math.ceil(60_000 / rpm);
  return clampBackoffMs(Math.max(INITIAL_RATE_LIMIT_BACKOFF_MS, seeded));
}

function clampBackoffMs(value: number): number {
  return Math.max(INITIAL_RATE_LIMIT_BACKOFF_MS, Math.min(value, MAX_RATE_LIMIT_BACKOFF_MS));
}

function extractRateLimitReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const reasonMatch = message.match(/rate limit exceeded\s*:\s*([^\.\n\"]+)/i);
  if (reasonMatch && reasonMatch[1].trim().length > 0) {
    return reasonMatch[1].trim();
  }

  const bucketMatch = message.match(/free-models-per-min|requests-per-minute|requests-per-day/i);
  if (bucketMatch) return bucketMatch[0];

  return 'rate-limit';
}

interface BlockedTaskState {
  path: string;
  reason: string;
  lastDelayMs: number;
  resumeAtMs: number;
}

function getClockMs(config: GuardianConfig): number {
  const now = config.clock.now();
  const parsed = Date.parse(now);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function summarizeBlockedReasons(blockedTasks: ReadonlyMap<string, BlockedTaskState>): string[] {
  const reasonCounts = new Map<string, number>();
  for (const blocked of blockedTasks.values()) {
    reasonCounts.set(blocked.reason, (reasonCounts.get(blocked.reason) ?? 0) + 1);
  }

  return [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason]) => reason);
}

interface QueuedDispatchItem {
  path: string;
  actionType: DispatchItem['actionType'];
  writeSet: string[];
}

async function buildEpochQueue(
  config: GuardianConfig,
  blockedTasks: ReadonlyMap<string, BlockedTaskState>,
): Promise<QueuedDispatchItem[]> {
  const dag = await buildDAG(config.fs, config.planDir);
  const now = config.clock.now();
  const nowMs = getClockMs(config);
  const candidates = prioritize(dag, now).filter(candidate => {
    const blocked = blockedTasks.get(candidate.task.path);
    return !blocked || blocked.resumeAtMs <= nowMs;
  });
  const batch = selectIndependentBatch(candidates, config.concurrency);
  return batch.map(item => ({
    path: item.task.path,
    actionType: item.actionType,
    writeSet: item.writeSet,
  }));
}

function buildDispatchBatchFromQueue(
  queuedBatch: readonly QueuedDispatchItem[],
  dag: IPlanDAG,
  blockedTasks: ReadonlyMap<string, BlockedTaskState>,
  nowMs: number,
): DispatchItem[] {
  const batch: DispatchItem[] = [];
  for (const item of queuedBatch) {
    const blocked = blockedTasks.get(item.path);
    if (blocked && blocked.resumeAtMs > nowMs) {
      continue;
    }

    const task = dag.nodes.get(item.path);
    if (!task || task.status === 'DONE') {
      continue;
    }

    batch.push({
      task,
      actionType: item.actionType,
      writeSet: item.writeSet,
    });
  }
  return batch;
}

function mergeEpochResults(base: EpochResult, delta: EpochResult): EpochResult {
  const reasonCounts = new Map<string, number>();
  for (const reason of [...base.rateLimitReasons, ...delta.rateLimitReasons]) {
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  return {
    epoch: base.epoch,
    dispatched: base.dispatched + delta.dispatched,
    completed: base.completed + delta.completed,
    failed: base.failed + delta.failed,
    rateLimitFailures: base.rateLimitFailures + delta.rateLimitFailures,
    rateLimitBackoffHintMs: Math.max(base.rateLimitBackoffHintMs, delta.rateLimitBackoffHintMs),
    rateLimitReasons: [...reasonCounts.keys()],
    dispatchedTaskPaths: [...base.dispatchedTaskPaths, ...delta.dispatchedTaskPaths],
    rateLimitedTasks: [...base.rateLimitedTasks, ...delta.rateLimitedTasks],
    commits: [...base.commits, ...delta.commits],
    totalTokens: {
      prompt: base.totalTokens.prompt + delta.totalTokens.prompt,
      completion: base.totalTokens.completion + delta.totalTokens.completion,
    },
  };
}
