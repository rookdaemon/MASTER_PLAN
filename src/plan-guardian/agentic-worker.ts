/**
 * Agentic Worker — runs the Claude Code CLI on a single card (Ralph-Wiggum).
 *
 * Unlike the provider worker (which calls an inference API and parses returned
 * text into file blocks that the scheduler then writes), the agentic worker
 * shells out to `claude`, which edits the plan files directly on disk. The
 * worker then OBSERVES the resulting git diff and packages it as a normal
 * `PlanningAction`, so the scheduler's integrity → commit pipeline is reused.
 *
 * Rate limits are surfaced by throwing a rate-limit-shaped Error, which the
 * scheduler's existing `isRateLimitError` / backoff machinery already handles.
 *
 * Domain: Plan Guardian (agentic mode)
 */

import { join } from 'node:path';
import type { IFileSystem } from '../agent-runtime/filesystem.js';
import type { DispatchItem, IGitOperations, PlanningAction, WorkerResult } from './interfaces.js';
import { buildClaudeArgs, parseClaudeOutput, type ClaudeInvoker } from './claude-invoker.js';
import { buildAgenticSystemPrompt } from './prompts.js';
import { normalizePlanPath } from './actions.js';
import { selectModelEffort, type ModelEffort, type ModelPolicyBounds, type ModelTier } from './agentic-model-policy.js';

export interface AgenticWorkerDeps {
  invoker: ClaudeInvoker;
  fs: IFileSystem;
  git: IGitOperations;
}

export interface AgenticWorkerConfig {
  rootPlanFile: string;
  planDir: string;
  claudeTimeoutMs: number;
  /** Optional bounds for the per-card model/effort policy. */
  modelBounds?: ModelPolicyBounds;
  /**
   * Directory Claude runs in and whose changed files are read back. Defaults to
   * '.' (the main tree). In parallel mode this is the agent's git worktree, so
   * its edits are isolated; the returned action paths stay repo-relative.
   */
  worktreeDir?: string;
  /** Precomputed model/effort (so the orchestrator can decide once + display it). */
  modelEffort?: ModelEffort;
  /** Extra context appended to the user turn (e.g. a completion-review note). */
  contextNote?: string;
}

/** One tier down, for --fallback-model on overload. Opus→sonnet→haiku→none. */
function fallbackFor(model: ModelTier): string | undefined {
  return model === 'opus' ? 'sonnet' : model === 'sonnet' ? 'haiku' : undefined;
}

export interface ChangedFiles {
  created: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Run one agentic operation on `item.task`. Returns a `WorkerResult` whose
 * action reflects the files Claude changed on disk. Throws a rate-limit-shaped
 * error if the CLI was rate limited.
 */
export async function runAgenticWorker(
  item: DispatchItem,
  deps: AgenticWorkerDeps,
  now: string,
  nowMs: number,
  config: AgenticWorkerConfig,
): Promise<WorkerResult> {
  const systemPrompt = buildAgenticSystemPrompt(item.actionType);
  const { model, effort } = config.modelEffort ?? selectModelEffort(item.task, item.actionType, config.modelBounds);
  const args = buildClaudeArgs({
    systemPrompt,
    cardPath: item.task.path,
    rootPlanFile: config.rootPlanFile,
    model,
    effort,
    fallbackModel: fallbackFor(model),
    contextNote: config.contextNote,
  });

  const worktreeDir = config.worktreeDir ?? '.';
  const cwd = worktreeDir === '.' ? undefined : worktreeDir;
  const output = deps.invoker.invoke(args, config.claudeTimeoutMs, cwd);
  const parsed = parseClaudeOutput(output, nowMs);

  if (parsed.rateLimited) {
    const secs = parsed.retryAfterSecs ?? 60;
    // Message is shaped so the scheduler's isRateLimitError() matches it and
    // parseRateLimitBackoffHintMs() can read the delay.
    throw new Error(`429 rate limit (claude cli) for ${item.task.path}; retry-after: ${secs}`);
  }

  if (parsed.isError) {
    // Surface auth/exec errors as a real failure instead of masking as a no-op.
    throw new Error(`claude CLI error for ${item.task.path}: ${parsed.errorMessage ?? 'unknown error'}`);
  }

  const changed = parseGitStatusPorcelain(await deps.git.status());

  // Read changed files from the worktree, but record repo-relative paths so the
  // action applies cleanly to the main tree.
  const filesCreated = await readFiles(deps.fs, changed.created, worktreeDir);
  const filesModified = await readFiles(deps.fs, changed.modified, worktreeDir);
  const writeSet = [...changed.created, ...changed.modified, ...changed.deleted].map(normalizePlanPath);

  const id = item.task.path.split('/').pop()?.replace(/\.md$/, '') ?? item.task.numericId;
  const totalChanged = filesCreated.length + filesModified.length + changed.deleted.length;
  const tag = `${model}·${effort}`;
  const summary =
    totalChanged === 0
      ? `${id}: ${item.actionType} [${tag}] (no change)`
      : `${id}: ${item.actionType} [${tag}] (${totalChanged} file${totalChanged === 1 ? '' : 's'} changed)`;

  const action: PlanningAction = {
    type: item.actionType,
    targetPath: item.task.path,
    summary,
    filesCreated,
    filesModified,
    writeSet,
  };

  const result: WorkerResult = {
    action,
    tokensUsed: { prompt: 0, completion: 0 },
    latencyMs: 0,
  };
  if (parsed.costUsd !== undefined) result.costUsd = parsed.costUsd;
  return result;
}

async function readFiles(
  fs: IFileSystem,
  paths: string[],
  worktreeDir: string,
): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  for (const path of paths) {
    const readPath = worktreeDir === '.' ? path : join(worktreeDir, path);
    out.push({ path: normalizePlanPath(path), content: await fs.readFile(readPath, 'utf-8') });
  }
  return out;
}

/**
 * Parse `git status --porcelain` (v1) into created / modified / deleted paths.
 * Untracked (`??`) and added (`A`) → created; `D` → deleted; renames split into
 * delete-old + create-new; everything else with a change → modified.
 */
export function parseGitStatusPorcelain(porcelain: string): ChangedFiles {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const rawLine of porcelain.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.length < 4) continue;

    const x = line[0];
    const y = line[1];
    const rest = line.slice(3).trim();

    if (rest.includes(' -> ')) {
      const [oldPath, newPath] = rest.split(' -> ').map(s => unquote(s.trim()));
      deleted.push(oldPath);
      created.push(newPath);
      continue;
    }

    const path = unquote(rest);
    if (x === '?') {
      created.push(path);
    } else if (x === 'D' || y === 'D') {
      deleted.push(path);
    } else if (x === 'A') {
      created.push(path);
    } else {
      modified.push(path);
    }
  }

  return { created, modified, deleted };
}

function unquote(path: string): string {
  if (path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1);
  }
  return path;
}
