/**
 * Console Dashboard — Agent Runtime
 *
 * Live ANSI terminal display inspired by PLANAR's dashboard.ts.
 * Renders agent state, phase progress, drive activity, and recent events
 * in a continuously-refreshed view.
 *
 * Designed for TTY stdout; degrades to simple line output on non-TTY.
 */

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MAX_LOG_LINES = 14;

// ── ANSI helpers ─────────────────────────────────────────────

function bold(s: string): string { return `\x1B[1m${s}\x1B[22m`; }
function dim(s: string): string { return `\x1B[2m${s}\x1B[22m`; }
function green(s: string): string { return `\x1B[32m${s}\x1B[39m`; }
function yellow(s: string): string { return `\x1B[33m${s}\x1B[39m`; }
function cyan(s: string): string { return `\x1B[36m${s}\x1B[39m`; }
function red(s: string): string { return `\x1B[31m${s}\x1B[39m`; }
function magenta(s: string): string { return `\x1B[35m${s}\x1B[39m`; }

function formatElapsed(since: Date, now: Date = new Date()): string {
  const ms = now.getTime() - since.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ── Types ────────────────────────────────────────────────────

export interface DashboardEvent {
  timestamp: Date;
  category: string;
  message: string;
}

export interface DriveState {
  name: string;
  strength: number;          // 0–1
  lastFired?: Date;
}

export interface PhaseState {
  name: string;
  active: boolean;
  lastDurationMs: number;
}

export interface DashboardSnapshot {
  agentId: string;
  cycle: number;
  warmStart: boolean;
  /** Current experiential state summary */
  valence: number;
  arousal: number;
  unity: number;
  /** Consciousness metrics */
  phi: number;
  selfModelCoherence: number;
  experienceContinuity: number;
  /** Phase timing from last tick */
  phases: PhaseState[];
  /** Drive readout */
  drives: DriveState[];
  /** Stability */
  stable: boolean;
  experienceIntact: boolean;
  degradationCount: number;
  alertCount: number;
  /** Goals */
  goalCount: number;
  topGoal: string;
}

// ── Dashboard output target (injectable) ─────────────────────

export interface IDashboardOutput {
  write(data: string): void;
  isTTY: boolean;
}

const stdoutOutput: IDashboardOutput = {
  write: (d) => process.stdout.write(d),
  isTTY: process.stdout.isTTY === true,
};

// ── Dashboard ────────────────────────────────────────────────

export class Dashboard {
  private _events: DashboardEvent[] = [];
  private _frame = 0;
  private _startedAt = new Date();
  private _enabled: boolean;
  private _output: IDashboardOutput;

  constructor(output: IDashboardOutput = stdoutOutput) {
    this._enabled = output.isTTY;
    this._output = output;
  }

  /** Add an event to the activity feed. */
  log(category: string, message: string): void {
    this._events.push({ timestamp: new Date(), category, message });
    if (this._events.length > MAX_LOG_LINES * 2) {
      this._events = this._events.slice(-MAX_LOG_LINES);
    }
  }

  /** Render the full dashboard. Call on every tick (or periodically). */
  render(snap: DashboardSnapshot): void {
    if (!this._enabled) return;

    this._frame++;
    const elapsed = formatElapsed(this._startedAt);
    const spinner = SPINNER[this._frame % SPINNER.length];
    const lines: string[] = [];

    // ── Header ───────────────────────────────────────────────
    lines.push("");
    lines.push(
      `${bold("MASTER_PLAN")} ${green(spinner)}  ` +
      `${dim("agent:")} ${cyan(snap.agentId)}  ` +
      `${dim("cycle:")} ${bold(String(snap.cycle))}  ` +
      `${dim("elapsed:")} ${elapsed}  ` +
      `${snap.warmStart ? yellow("WARM") : magenta("COLD")}`
    );
    lines.push(dim("─".repeat(76)));

    // ── Experiential State ───────────────────────────────────
    const vBar = barGraph(snap.valence, -1, 1, 12);
    const aBar = barGraph(snap.arousal, 0, 1, 12);
    const uBar = barGraph(snap.unity, 0, 1, 12);
    lines.push(
      `  ${dim("Experience")}  ` +
      `valence ${vBar} ${fmtFloat(snap.valence)}  ` +
      `arousal ${aBar} ${fmtFloat(snap.arousal)}  ` +
      `unity ${uBar} ${fmtFloat(snap.unity)}`
    );

    // ── Consciousness Metrics ────────────────────────────────
    const pBar = barGraph(snap.phi, 0, 1, 10);
    const sBar = barGraph(snap.selfModelCoherence, 0, 1, 10);
    const cBar = barGraph(snap.experienceContinuity, 0, 1, 10);
    lines.push(
      `  ${dim("Consciousness")}  ` +
      `Φ ${pBar} ${fmtFloat(snap.phi)}  ` +
      `self-model ${sBar} ${fmtFloat(snap.selfModelCoherence)}  ` +
      `continuity ${cBar} ${fmtFloat(snap.experienceContinuity)}`
    );

    // ── Phase Timing ─────────────────────────────────────────
    lines.push(dim("─".repeat(76)));
    const phaseStr = snap.phases.map(p => {
      const label = p.name.toUpperCase().padEnd(11);
      const ms = p.lastDurationMs.toFixed(1).padStart(6) + "ms";
      if (p.active) return green(`  ▶ ${label} ${ms}`);
      return dim(`    ${label} ${ms}`);
    }).join("\n");
    lines.push(phaseStr);

    // ── Drives ───────────────────────────────────────────────
    lines.push(dim("─".repeat(76)));
    if (snap.drives.length > 0) {
      const driveStr = snap.drives.map(d => {
        const bar = barGraph(d.strength, 0, 1, 15);
        const label = d.name.padEnd(16);
        const str = fmtFloat(d.strength);
        return `  ${dim(label)} ${bar} ${str}`;
      }).join("\n");
      lines.push(driveStr);
    } else {
      lines.push(dim("  (no drive data yet)"));
    }

    // ── Status bar ───────────────────────────────────────────
    lines.push(dim("─".repeat(76)));
    const intactStr = snap.experienceIntact ? green("✓ intact") : red("✗ DEGRADED");
    const stableStr = snap.stable ? green("✓ stable") : red("✗ UNSTABLE");
    lines.push(
      `  ${dim("Experience:")} ${intactStr}  ` +
      `${dim("Stability:")} ${stableStr}  ` +
      `${dim("Degradations:")} ${snap.degradationCount}  ` +
      `${dim("Alerts:")} ${snap.alertCount}  ` +
      `${dim("Goals:")} ${snap.goalCount} ${snap.topGoal ? dim(`(${truncate(snap.topGoal, 30)})`) : ""}`
    );

    // ── Event log ────────────────────────────────────────────
    lines.push("");
    lines.push(dim("  Recent activity:"));
    const recent = this._events.slice(-MAX_LOG_LINES);
    if (recent.length === 0) {
      lines.push(dim("    (no activity yet)"));
    } else {
      for (const evt of recent) {
        const time = evt.timestamp.toLocaleTimeString();
        lines.push(
          `    ${dim(time)} ${cyan(evt.category.padEnd(14))} ${evt.message}`
        );
      }
    }
    lines.push("");

    // ── Draw ─────────────────────────────────────────────────
    // Clear screen and move cursor to top-left
    this._output.write("\x1B[2J\x1B[H");
    this._output.write(lines.join("\n"));
  }

  /** Simple line-by-line output for non-TTY environments. */
  logLine(category: string, message: string): void {
    if (this._enabled) return; // TTY mode uses render()
    const ts = new Date().toISOString();
    this._output.write(`[${ts}] [${category.toUpperCase().padEnd(13)}] ${message}\n`);
  }

  /** Cleanup — show cursor. */
  cleanup(): void {
    if (!this._enabled) return;
    this._output.write("\x1B[?25h");
  }
}

// ── Helpers ──────────────────────────────────────────────────

function barGraph(value: number, min: number, max: number, width: number): string {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const filled = Math.round(normalized * width);
  return green("█".repeat(filled)) + dim("░".repeat(width - filled));
}

function fmtFloat(n: number): string {
  const s = n.toFixed(2);
  return s.startsWith("-") ? red(s) : s;
}
