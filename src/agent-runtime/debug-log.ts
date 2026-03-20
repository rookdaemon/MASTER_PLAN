/**
 * Debug Event Logger — Agent Runtime
 *
 * Comprehensive timestamped event log written to a debug.log file.
 * Inspired by PLANAR's debug-log.ts — append-only with a cap to prevent
 * unbounded growth.
 *
 * All agent-loop phases, subsystem calls, drive firings, ethical judgments,
 * stability checks, I/O events, and lifecycle transitions are logged here
 * so a post-hoc trace of the newborn mind's first moments is available.
 *
 * Injectable deps for testability (per Claude.md).
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ── Constants ────────────────────────────────────────────────

const MAX_LINES = 2000;
const DEFAULT_LOG_FILE = "debug.log";

// ── Injectable deps ──────────────────────────────────────────

export interface DebugLogDeps {
  appendFileSync(path: string, data: string): void;
  readFileSync(path: string): string;
  writeFileSync(path: string, data: string): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, opts: { recursive: boolean }): void;
}

const nodeDeps: DebugLogDeps = {
  appendFileSync: (p, d) => appendFileSync(p, d),
  readFileSync: (p) => readFileSync(p, "utf-8"),
  writeFileSync: (p, d) => writeFileSync(p, d),
  existsSync: (p) => existsSync(p),
  mkdirSync: (p, o) => mkdirSync(p, o),
};

// ── Event types ──────────────────────────────────────────────

export type DebugEventCategory =
  | 'lifecycle'       // start, stop, checkpoint, shutdown
  | 'tick'            // tick start/end, cycle count
  | 'phase'           // individual phase start/end with timing
  | 'perception'      // raw input received, percept constructed
  | 'memory'          // retrieve, consolidate
  | 'emotion'         // appraisal results
  | 'deliberation'    // decision made, ethical judgment
  | 'action'          // action executed, output sent
  | 'drive'           // drive update, goal candidates, existential drive
  | 'monitor'         // experience integrity, consciousness metrics
  | 'sentinel'        // stability checks, alerts
  | 'identity'        // checkpoint, drift, narrative
  | 'io'              // adapter connect/disconnect, send/receive
  | 'llm'             // LLM inference calls, responses, token usage
  | 'error'           // any error
  | 'state';          // experiential state snapshots

export interface DebugEvent {
  timestamp: string;     // ISO 8601
  category: DebugEventCategory;
  message: string;
  data?: Record<string, unknown>;
}

// ── Core logger ──────────────────────────────────────────────

export class DebugLogger {
  private readonly _logFile: string;
  private readonly _deps: DebugLogDeps;
  private _initialized = false;

  constructor(logFile: string = DEFAULT_LOG_FILE, deps: DebugLogDeps = nodeDeps) {
    this._logFile = logFile;
    this._deps = deps;
  }

  /** Write a startup banner and ensure the directory exists. */
  banner(agentId: string, warmStart: boolean): void {
    this._ensureDir();
    const ts = new Date().toISOString();
    const banner =
      `\n${"=".repeat(72)}\n` +
      `  MASTER_PLAN Agent Runtime — ${agentId}\n` +
      `  Started at ${ts}  |  ${warmStart ? "WARM start" : "COLD start (newborn)"}\n` +
      `${"=".repeat(72)}\n`;
    this._deps.appendFileSync(this._logFile, banner);
    this._initialized = true;
    this._cap();
  }

  /** Log a structured event. */
  log(category: DebugEventCategory, message: string, data?: Record<string, unknown>): void {
    if (!this._initialized) {
      this._ensureDir();
      this._initialized = true;
    }

    const ts = new Date().toISOString();
    let entry = `[${ts}] [${category.toUpperCase().padEnd(13)}] ${message}`;
    if (data !== undefined) {
      // Single-line JSON for easy grep
      entry += `  | ${JSON.stringify(data)}`;
    }
    entry += "\n";

    this._deps.appendFileSync(this._logFile, entry);
    this._cap();
  }

  /** Convenience: log start/end of a phase with timing. */
  phaseStart(phase: string, cycle: number): void {
    this.log('phase', `PHASE ${phase.toUpperCase()} START`, { cycle });
  }

  phaseEnd(phase: string, cycle: number, durationMs: number): void {
    this.log('phase', `PHASE ${phase.toUpperCase()} END (${durationMs.toFixed(1)}ms)`, { cycle, durationMs });
  }

  /** Convenience: log a tick boundary. */
  tickStart(cycle: number): void {
    this.log('tick', `── Tick ${cycle} ──────────────────────────────`);
  }

  tickEnd(cycle: number, tickMs: number, intact: boolean): void {
    this.log('tick', `── Tick ${cycle} END (${tickMs.toFixed(1)}ms, intact=${intact}) ──`);
  }

  /** Convenience: log an error with context. */
  error(message: string, err: unknown): void {
    const errMsg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' | ') : undefined;
    this.log('error', message, { error: errMsg, stack });
  }

  /** Get the log file path for external reference. */
  get logFile(): string {
    return this._logFile;
  }

  // ── Internal ───────────────────────────────────────────────

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
      const lines = content.split("\n");
      if (lines.length > MAX_LINES) {
        const trimmed = lines.slice(lines.length - MAX_LINES).join("\n");
        this._deps.writeFileSync(this._logFile, trimmed);
      }
    } catch {
      // Best-effort capping
    }
  }
}

// ── Noop logger for tests that don't care about logging ──────

export class NoopDebugLogger extends DebugLogger {
  constructor() {
    const noopDeps: DebugLogDeps = {
      appendFileSync: () => {},
      readFileSync: () => "",
      writeFileSync: () => {},
      existsSync: () => false,
      mkdirSync: () => {},
    };
    super("noop.log", noopDeps);
  }
  override banner(): void {}
  override log(): void {}
}
