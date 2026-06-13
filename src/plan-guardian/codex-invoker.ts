/**
 * Codex CLI invoker for Plan Guardian agentic mode.
 *
 * Mirrors substrate's Codex CLI backend: non-interactive `codex exec`, JSONL
 * output for streaming-friendly logs, stdin prompt, ephemeral session, and a
 * mockable process boundary.
 */

import { execFileSync } from 'node:child_process';
import type { ParsedClaudeOutput } from './claude-invoker.js';

export type ExecFileSyncLike = (
  file: string,
  args: readonly string[],
  options: {
    stdio: ['pipe', 'pipe', 'inherit'];
    encoding: 'utf-8';
    timeout: number;
    maxBuffer: number;
    cwd?: string;
    input?: string;
  },
) => string;

export interface CodexArgsInput {
  systemPrompt: string;
  cardPath: string;
  rootPlanFile: string;
  instruction?: string;
  model?: string;
  contextNote?: string;
  cwd: string;
}

export interface CodexInvocation {
  args: string[];
  stdin: string;
}

const DEFAULT_INSTRUCTION =
  'Do the next thing for this card. Perform exactly one operation, ' +
  'edit the plan file(s) directly on disk, and exit.';

export class NodeCodexInvoker {
  constructor(
    private readonly resolvePath: () => string = () => 'codex',
    private readonly execFile: ExecFileSyncLike = execFileSync as ExecFileSyncLike,
  ) {}

  invoke(args: string[], timeoutMs: number, cwd?: string, stdin?: string): string | null {
    try {
      return this.execFile(this.resolvePath(), args, {
        stdio: ['pipe', 'pipe', 'inherit'],
        encoding: 'utf-8',
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        ...(cwd ? { cwd } : {}),
        ...(stdin !== undefined ? { input: stdin } : {}),
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'stdout' in err) {
        const stdout = (err as { stdout: unknown }).stdout;
        if (typeof stdout === 'string' && stdout.trim().length > 0) return stdout;
      }
      throw err;
    }
  }
}

export function buildCodexArgs(input: CodexArgsInput): CodexInvocation {
  const note = input.contextNote ? `\n\n${input.contextNote}` : '';
  const userTurn = `@${input.cardPath} @${input.rootPlanFile}\n\n${input.instruction ?? DEFAULT_INSTRUCTION}${note}`;
  const stdin = `SYSTEM INSTRUCTIONS:\n${input.systemPrompt}\n\n---\n\n${userTurn}`;
  const args = [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '--json',
    '--color',
    'never',
    '--skip-git-repo-check',
    '--ephemeral',
  ];
  if (input.model) args.push('-m', input.model);
  args.push('-C', input.cwd, '-');
  return { args, stdin };
}

export function parseCodexOutput(output: string | null, _nowMs: number): ParsedClaudeOutput {
  if (!output || output.trim().length === 0) {
    return { rateLimited: false };
  }

  const messages: string[] = [];
  let errorMessage: string | undefined;

  for (const line of output.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (!event) continue;

    const text = agentMessageText(event);
    if (text !== null) messages.push(text);

    const message = eventMessage(event);
    if (message && isRateLimitMessage(message)) {
      return { rateLimited: true, retryAfterSecs: retryAfterSeconds(message) };
    }
    if (message) errorMessage = message;
  }

  if (errorMessage) {
    return { rateLimited: false, isError: true, errorMessage };
  }

  return {
    rateLimited: false,
    ...(messages.length > 0 ? { result: messages.join('\n') } : {}),
  };
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function agentMessageText(event: Record<string, unknown>): string | null {
  if (event.type !== 'item.completed') return null;
  const item = event.item;
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  return record.type === 'agent_message' && typeof record.text === 'string' ? record.text : null;
}

function eventMessage(event: Record<string, unknown>): string | undefined {
  if (typeof event.message === 'string') return event.message;
  if (typeof event.error === 'string') return event.error;
  const error = event.error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
  }
  return undefined;
}

function isRateLimitMessage(message: string): boolean {
  return /429|rate.?limit|too many requests|overloaded/i.test(message);
}

function retryAfterSeconds(message: string): number {
  const match = message.match(/retry(?:-| )?after:?\s*(\d+)/i) ?? message.match(/(\d+)\s*seconds?/i);
  return match ? Number.parseInt(match[1], 10) : 60;
}
