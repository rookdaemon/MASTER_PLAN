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

import type { IFileSystem } from '../agent-runtime/filesystem.js';
import type { DispatchItem, IGitOperations, PlanningAction, WorkerResult } from './interfaces.js';
import { buildClaudeArgs, parseClaudeOutput, type ClaudeInvoker } from './claude-invoker.js';
import { buildAgenticSystemPrompt } from './prompts.js';
import { normalizePlanPath } from './actions.js';

export interface AgenticWorkerDeps {
  invoker: ClaudeInvoker;
  fs: IFileSystem;
  git: IGitOperations;
}

export interface AgenticWorkerConfig {
  rootPlanFile: string;
  planDir: string;
  claudeTimeoutMs: number;
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
  const args = buildClaudeArgs({
    systemPrompt,
    cardPath: item.task.path,
    rootPlanFile: config.rootPlanFile,
  });

  const output = deps.invoker.invoke(args, config.claudeTimeoutMs);
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

  const filesCreated = await readFiles(deps.fs, changed.created);
  const filesModified = await readFiles(deps.fs, changed.modified);
  const writeSet = [...changed.created, ...changed.modified, ...changed.deleted].map(normalizePlanPath);

  const id = item.task.path.split('/').pop()?.replace(/\.md$/, '') ?? item.task.numericId;
  const totalChanged = filesCreated.length + filesModified.length + changed.deleted.length;
  const summary =
    totalChanged === 0
      ? `${id}: ${item.actionType} (no change)`
      : `${id}: ${item.actionType} (${totalChanged} file${totalChanged === 1 ? '' : 's'} changed)`;

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

async function readFiles(fs: IFileSystem, paths: string[]): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  for (const path of paths) {
    out.push({ path: normalizePlanPath(path), content: await fs.readFile(path, 'utf-8') });
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
