/**
 * Claude CLI Invoker — the "Ralph Wiggum" brain for agentic mode.
 *
 * A thin, mockable abstraction over the Claude Code CLI. Instead of calling an
 * inference *API* and parsing returned text into file blocks (the provider
 * path), agentic mode shells out to `claude --dangerously-skip-permissions`,
 * which reads the `@`-referenced files and edits them on disk itself. The
 * wrapper just observes the resulting diff.
 *
 * Everything environment-specific (the child process, the binary path) is
 * injected via `ClaudeInvoker`, so the worker is fully testable with a mock.
 *
 * Domain: Plan Guardian (agentic mode)
 */

import { execFileSync } from 'node:child_process';
import { resolveClaudePath } from './resolve-claude.js';

// ── Injectable invocation seam ───────────────────────────────

/** Abstraction over a single agentic CLI invocation. */
export interface ClaudeInvoker {
  /**
   * Run `claude` with `args`, returning its stdout (or null on empty output).
   * `cwd` (optional) runs the call inside that directory — used to isolate a
   * call to a git worktree. Implementations should still return captured stdout
   * on non-zero exit so the caller can parse rate-limit / error envelopes.
   */
  invoke(
    args: string[],
    timeoutMs: number,
    cwd?: string,
    stdin?: string,
    onStdout?: (chunk: string) => void,
  ): string | null | Promise<string | null>;
}

/** Production invoker: `execFileSync` against the resolved `claude` binary. */
export class NodeClaudeInvoker implements ClaudeInvoker {
  constructor(private readonly resolvePath: () => string = resolveClaudePath) {}

  invoke(args: string[], timeoutMs: number, cwd?: string): string | null {
    const claudePath = this.resolvePath();
    try {
      return execFileSync(claudePath, args, {
        stdio: ['pipe', 'pipe', 'inherit'],
        encoding: 'utf-8',
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        ...(cwd ? { cwd } : {}),
      });
    } catch (err: unknown) {
      // On rate limits the CLI exits non-zero but still prints a JSON envelope
      // on stdout — surface that so the caller can classify it. A hard failure
      // (e.g. bad flags) produces no stdout JSON; re-throw so it's reported as a
      // real error rather than silently masked as a no-op.
      if (err && typeof err === 'object' && 'stdout' in err) {
        const stdout = (err as { stdout: unknown }).stdout;
        if (typeof stdout === 'string' && stdout.trim().length > 0) return stdout;
      }
      throw err;
    }
  }
}

// ── Argv construction ────────────────────────────────────────

export interface ClaudeArgsInput {
  systemPrompt: string;
  /** The card the agent works on (passed as an @-file reference). */
  cardPath: string;
  /** The plan root, for whole-plan context (passed as an @-file reference). */
  rootPlanFile: string;
  /** Optional override of the user-turn instruction. */
  instruction?: string;
  /** `--model` alias/id (e.g. 'opus'); omit to use the CLI default. */
  model?: string;
  /** `--effort` level (low|medium|high|xhigh|max); omit to use the CLI default. */
  effort?: string;
  /** `--fallback-model` used when the primary is overloaded. */
  fallbackModel?: string;
  /** Extra context appended to the user turn (e.g. "all children are DONE — verify this card"). */
  contextNote?: string;
}

const DEFAULT_INSTRUCTION =
  'Do the next thing for this card. Perform exactly one operation, ' +
  'edit the plan file(s) directly on disk, and exit.';

/**
 * Build the Ralph-Wiggum argv. Mirrors PLANAR's wrapper: non-interactive
 * (`--print`), machine-readable (`--output-format json`), permissionless
 * (`--dangerously-skip-permissions`). Uses an EPHEMERAL session
 * (`--no-session-persistence`) rather than a fixed `--session-id`: the
 * guardian's state lives in the card file, not in a CLI session, and reusing a
 * fixed id across epochs collides ("Session ID … is already in use").
 *
 * Uses `--append-system-prompt` (not `--system-prompt`): the latter REPLACES
 * Claude Code's default system prompt, stripping its agentic tool-use
 * scaffolding so it just prints text and never edits files. Appending keeps the
 * full agent and adds our planning guidance.
 */
export function buildClaudeArgs(input: ClaudeArgsInput): string[] {
  const note = input.contextNote ? `\n\n${input.contextNote}` : '';
  const userTurn = `@${input.cardPath} @${input.rootPlanFile}\n\n${input.instruction ?? DEFAULT_INSTRUCTION}${note}`;
  const args = [
    '--dangerously-skip-permissions',
    '--print',
    '--output-format',
    'json',
    '--no-session-persistence',
  ];
  if (input.model) args.push('--model', input.model);
  if (input.effort) args.push('--effort', input.effort);
  if (input.fallbackModel) args.push('--fallback-model', input.fallbackModel);
  args.push('--append-system-prompt', input.systemPrompt, '--', userTurn);
  return args;
}

// ── Output parsing ───────────────────────────────────────────

export interface ParsedClaudeOutput {
  /** Dollar cost reported by the CLI for this turn, if any. */
  costUsd?: number;
  rateLimited: boolean;
  /** Seconds to wait before retrying, when rate limited. */
  retryAfterSecs?: number;
  /** True if the CLI reported a non-rate-limit error (e.g. auth/exec failure). */
  isError?: boolean;
  /** Error message when isError is true. */
  errorMessage?: string;
  /** The final assistant text, when present. */
  result?: string;
}

const DEFAULT_RETRY_SECS = 60;
const OVERLOADED_RETRY_SECS = 30;

/**
 * Parse the CLI's `--output-format json` envelope. `nowMs` is injected (not
 * read from the clock) so `resetsAt` → `retryAfterSecs` is deterministic.
 */
export function parseClaudeOutput(output: string | null, nowMs: number): ParsedClaudeOutput {
  if (!output || output.trim().length === 0) {
    return { rateLimited: false };
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(output) as Record<string, unknown>;
  } catch {
    return { rateLimited: false };
  }

  if (json.type === 'rate_limit_event') {
    const info = json.rate_limit_info as { resetsAt?: unknown } | undefined;
    const resetsAt = typeof info?.resetsAt === 'number' ? info.resetsAt : undefined;
    const retryAfterSecs =
      resetsAt !== undefined ? Math.max(0, Math.ceil((resetsAt * 1000 - nowMs) / 1000)) : DEFAULT_RETRY_SECS;
    return { rateLimited: true, retryAfterSecs };
  }

  const error = json.error as { type?: string; retry_after?: unknown } | undefined;
  if (error?.type === 'rate_limit_error') {
    return {
      rateLimited: true,
      retryAfterSecs: typeof error.retry_after === 'number' ? error.retry_after : DEFAULT_RETRY_SECS,
    };
  }
  if (error?.type === 'overloaded_error') {
    return {
      rateLimited: true,
      retryAfterSecs: typeof error.retry_after === 'number' ? error.retry_after : OVERLOADED_RETRY_SECS,
    };
  }

  const result: ParsedClaudeOutput = { rateLimited: false };
  // Claude Code reports cost as `total_cost_usd`; older builds used `cost_usd`.
  const cost = (json.total_cost_usd ?? json.cost_usd) as unknown;
  if (typeof cost === 'number') result.costUsd = cost;
  if (typeof json.result === 'string') result.result = json.result;

  // A non-rate-limit error (e.g. 401 auth failure, exec error) must be surfaced,
  // not silently treated as a no-op. The CLI sets is_error/subtype on the result
  // envelope; it still exits 0 in some cases, so we detect it from the payload.
  const subtype = typeof json.subtype === 'string' ? json.subtype : '';
  if (json.is_error === true || subtype.startsWith('error')) {
    result.isError = true;
    result.errorMessage = typeof json.result === 'string' && json.result.length > 0 ? json.result : `claude error (${subtype || 'unknown'})`;
  }
  return result;
}
