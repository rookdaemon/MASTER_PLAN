/**
 * Inner Monologue Logger — Human-Readable Audit Log
 *
 * Captures the full back-and-forth of drive-initiated LLM interactions:
 *   - The internal prompt (which drives fired, what goals were generated)
 *   - Each LLM response (text + tool calls)
 *   - Each tool execution (input, result, errors)
 *   - The final output sent to the environment
 *
 * Written to inner-monologue.txt in a comprehensible narrative format,
 * separate from the structured debug.log.
 *
 * Injectable deps for testability.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ── Constants ────────────────────────────────────────────────────

const MAX_LINES = 5000;

// ── Injectable deps ──────────────────────────────────────────────

export interface MonologueDeps {
  appendFileSync(path: string, data: string): void;
  readFileSync(path: string): string;
  writeFileSync(path: string, data: string): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, opts: { recursive: boolean }): void;
}

const nodeDeps: MonologueDeps = {
  appendFileSync: (p, d) => appendFileSync(p, d),
  readFileSync: (p) => readFileSync(p, 'utf-8'),
  writeFileSync: (p, d) => writeFileSync(p, d),
  existsSync: (p) => existsSync(p),
  mkdirSync: (p, o) => mkdirSync(p, o),
};

// ── InnerMonologueLogger ─────────────────────────────────────────

/** Callback for real-time streaming of monologue entries. */
export type MonologueListener = (entry: MonologueEntry) => void;

export interface MonologueEntry {
  type: 'drive_activation' | 'system_prompt' | 'user_message' | 'assistant_text'
    | 'tool_call' | 'tool_result' | 'final_output' | 'summary' | 'error';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class InnerMonologueLogger {
  private readonly _logFile: string;
  private readonly _deps: MonologueDeps;
  private _initialized = false;
  private _listeners: MonologueListener[] = [];

  constructor(logFile: string, deps: MonologueDeps = nodeDeps) {
    this._logFile = logFile;
    this._deps = deps;
  }

  /** Register a listener for real-time monologue events (e.g. SSE broadcast). */
  addListener(listener: MonologueListener): void {
    this._listeners.push(listener);
  }

  removeListener(listener: MonologueListener): void {
    this._listeners = this._listeners.filter(l => l !== listener);
  }

  get logFile(): string {
    return this._logFile;
  }

  /** Log the start of a drive-initiated interaction. */
  driveActivation(cycle: number, drives: Array<{ sourceDrive: string; description: string }>): void {
    const text = drives.map((d, i) => `${i + 1}. [${d.sourceDrive}] ${d.description}`).join('\n');
    this._write([
      '',
      `${'═'.repeat(72)}`,
      `  DRIVE ACTIVATION — Cycle ${cycle} — ${new Date().toISOString()}`,
      `${'═'.repeat(72)}`,
      '',
      '  Activated drives:',
      ...drives.map((d, i) => `    ${i + 1}. [${d.sourceDrive}] ${d.description}`),
      '',
    ]);
    this._emit({ type: 'drive_activation', content: text, metadata: { cycle, drives } });
  }

  /** Log the system prompt sent to the LLM. */
  systemPrompt(prompt: string): void {
    this._write([
      '┌─ SYSTEM PROMPT ─────────────────────────────────────────',
      ...prompt.split('\n').map(l => `│ ${l}`),
      '└────────────────────────────────────────────────────────',
      '',
    ]);
    this._emit({ type: 'system_prompt', content: prompt });
  }

  /** Log a user message (internal prompt) sent to the LLM. */
  userMessage(text: string): void {
    this._write([
      `┌─ INTERNAL PROMPT ───────────────────────────────────────`,
      ...text.split('\n').map(l => `│ ${l}`),
      '└────────────────────────────────────────────────────────',
      '',
    ]);
    this._emit({ type: 'user_message', content: text });
  }

  /** Log the LLM's text response. */
  assistantText(text: string): void {
    this._write([
      '┌─ LLM RESPONSE ─────────────────────────────────────────',
      ...text.split('\n').map(l => `│ ${l}`),
      '└────────────────────────────────────────────────────────',
      '',
    ]);
    this._emit({ type: 'assistant_text', content: text });
  }

  /** Log a tool call made by the LLM. */
  toolCall(name: string, input: Record<string, unknown>): void {
    const inputStr = JSON.stringify(input, null, 2);
    this._write([
      `  ⚙ TOOL CALL: ${name}`,
      ...inputStr.split('\n').map(l => `    ${l}`),
      '',
    ]);
    this._emit({ type: 'tool_call', content: `${name}: ${inputStr}`, metadata: { name, input } });
  }

  /** Log a tool result. */
  toolResult(name: string, result: string, isError: boolean): void {
    const prefix = isError ? '  ✗ TOOL ERROR' : '  ✓ TOOL RESULT';
    this._write([
      `${prefix}: ${name}`,
      ...result.split('\n').map(l => `    ${l}`),
      '',
    ]);
    this._emit({ type: 'tool_result', content: result, metadata: { name, isError } });
  }

  /** Log the final output sent to the environment. */
  finalOutput(text: string | null): void {
    if (text) {
      this._write([
        '┌─ FINAL OUTPUT ────────────────────────────────────────',
        ...text.split('\n').map(l => `│ ${l}`),
        '└────────────────────────────────────────────────────────',
        '',
      ]);
    } else {
      this._write(['  (no output — internal reflection only)', '']);
    }
    this._emit({ type: 'final_output', content: text ?? '(no output — internal reflection only)' });
  }

  /** Log iteration count and token usage. */
  summary(iterations: number, totalPromptTokens: number, totalCompletionTokens: number): void {
    const text = `${iterations} iteration(s), ${totalPromptTokens} prompt tokens, ${totalCompletionTokens} completion tokens`;
    this._write([
      `  Summary: ${text}`,
      `${'─'.repeat(72)}`,
      '',
    ]);
    this._emit({ type: 'summary', content: text, metadata: { iterations, totalPromptTokens, totalCompletionTokens } });
  }

  /** Log an error during the tool loop. */
  error(message: string): void {
    this._write([`  ✗ ERROR: ${message}`, '']);
    this._emit({ type: 'error', content: message });
  }

  // ── Internal ───────────────────────────────────────────────────

  private _emit(partial: Omit<MonologueEntry, 'timestamp'>): void {
    const entry: MonologueEntry = { ...partial, timestamp: new Date().toISOString() };
    for (const listener of this._listeners) {
      try { listener(entry); } catch { /* listener errors must not break the agent */ }
    }
  }

  private _write(lines: string[]): void {
    if (!this._initialized) {
      this._ensureDir();
      this._initialized = true;
    }
    this._deps.appendFileSync(this._logFile, lines.join('\n') + '\n');
    this._cap();
  }

  private _ensureDir(): void {
    const dir = dirname(this._logFile);
    if (dir && dir !== '.' && !this._deps.existsSync(dir)) {
      this._deps.mkdirSync(dir, { recursive: true });
    }
  }

  private _cap(): void {
    if (!this._deps.existsSync(this._logFile)) return;
    try {
      const content = this._deps.readFileSync(this._logFile);
      const lines = content.split('\n');
      if (lines.length > MAX_LINES) {
        const trimmed = lines.slice(lines.length - MAX_LINES).join('\n');
        this._deps.writeFileSync(this._logFile, trimmed);
      }
    } catch {
      // Best-effort capping
    }
  }
}

// ── Noop logger for tests ────────────────────────────────────────

export class NoopInnerMonologueLogger extends InnerMonologueLogger {
  constructor() {
    const noopDeps: MonologueDeps = {
      appendFileSync: () => {},
      readFileSync: () => '',
      writeFileSync: () => {},
      existsSync: () => false,
      mkdirSync: () => {},
    };
    super('noop-monologue.txt', noopDeps);
  }
}
