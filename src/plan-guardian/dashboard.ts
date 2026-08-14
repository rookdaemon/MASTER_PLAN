/**
 * Live TUI dashboard for the Plan Guardian.
 *
 * Shows the active worker(s) — which card, action, and model·effort is in use —
 * plus a plan-status tally and running epoch/commit/cost/failure counts. Driven
 * by the scheduler callbacks. `renderDashboard` is a pure function of state
 * (testable); the controller owns the redraw loop + injected writer/clock.
 *
 * Domain: Plan Guardian
 */

import type { PlanStatus } from './interfaces.js';

export interface ActiveWorker {
  path: string;
  action: string;
  /** Resolved model·effort tag, e.g. "opus·high" (or "procedural"). */
  model: string;
  startedAtMs: number;
}

export interface PlanStats {
  total: number;
  byStatus: Record<PlanStatus, number>;
}

export interface DashboardState {
  mode: string;
  concurrency: number;
  modelPolicy: string;
  startedAtMs: number;
  epoch: number;
  commits: number;
  failures: number;
  rateLimited: number;
  costUsd: number;
  active: ActiveWorker[];
  recent: string[];
  stats?: PlanStats;
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const PHASES: PlanStatus[] = ['PLAN', 'ARCHITECT', 'IMPLEMENT', 'REVIEW', 'DONE'];
const CLEAR = '\x1b[2J\x1b[H';

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m${String(sec).padStart(2, '0')}s`;
  return `${h}h${String(m % 60).padStart(2, '0')}m`;
}

function shortId(path: string): string {
  return path.split('/').pop()?.replace(/\.md$/, '') ?? path;
}

/** Pure render — returns the full screen (ANSI clear + content lines). */
export function renderDashboard(state: DashboardState, nowMs: number): string {
  const lines: string[] = [];
  const elapsed = formatDuration(nowMs - state.startedAtMs);

  lines.push(`Plan Guardian — ${state.mode.toUpperCase()}`);
  lines.push(
    `epoch ${state.epoch} · ${state.active.length}/${state.concurrency} workers · elapsed ${elapsed}`,
  );
  lines.push(`model policy: ${state.modelPolicy}`);

  if (state.stats) {
    const done = state.stats.byStatus.DONE ?? 0;
    const parts = PHASES.filter(p => p !== 'DONE')
      .map(p => `${state.stats!.byStatus[p] ?? 0} ${p}`)
      .join(' · ');
    lines.push(`plan: ${done}/${state.stats.total} DONE · ${parts}`);
  }

  lines.push(
    `commits ${state.commits} · failures ${state.failures} · rate-limited ${state.rateLimited} · ~$${state.costUsd.toFixed(2)}`,
  );

  const frame = SPINNER[Math.floor(nowMs / 100) % SPINNER.length];
  lines.push('');
  lines.push(`ACTIVE (${state.active.length})`);
  if (state.active.length === 0) {
    lines.push('  (idle)');
  } else {
    for (const w of [...state.active].sort((a, b) => a.startedAtMs - b.startedAtMs)) {
      const dur = formatDuration(nowMs - w.startedAtMs);
      lines.push(
        `  ${frame} ${shortId(w.path).padEnd(30).slice(0, 30)} ${w.action.padEnd(13)} ${w.model.padEnd(12)} ${dur}`,
      );
    }
  }

  if (state.recent.length > 0) {
    lines.push('');
    lines.push('RECENT');
    for (const e of state.recent.slice(-6)) lines.push(`  ${e}`);
  }

  return CLEAR + lines.join('\n') + '\n';
}

export interface DashboardDeps {
  write(s: string): void;
  now(): number;
}

/**
 * Controller: accumulates state from scheduler events and redraws on an
 * interval. Event methods mirror the SchedulerCallbacks surface.
 */
export class GuardianDashboard {
  private readonly state: DashboardState;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    init: { mode: string; concurrency: number; modelPolicy: string },
    private readonly deps: DashboardDeps,
  ) {
    this.state = {
      mode: init.mode,
      concurrency: init.concurrency,
      modelPolicy: init.modelPolicy,
      startedAtMs: deps.now(),
      epoch: 0,
      commits: 0,
      failures: 0,
      rateLimited: 0,
      costUsd: 0,
      active: [],
      recent: [],
    };
  }

  /** Snapshot for tests / final render. */
  snapshot(): DashboardState {
    return { ...this.state, active: [...this.state.active], recent: [...this.state.recent] };
  }

  setStats(stats: PlanStats): void {
    this.state.stats = stats;
  }

  epochStart(epoch: number): void {
    this.state.epoch = epoch;
  }

  workerStart(path: string, action: string, model = '—'): void {
    this.state.active.push({ path, action, model, startedAtMs: this.deps.now() });
  }

  workerComplete(path: string, summary: string, costUsd?: number): void {
    this.removeActive(path);
    if (typeof costUsd === 'number') this.state.costUsd += costUsd;
    this.pushRecent(`✓ ${summary}`);
  }

  workerError(path: string, message: string, rateLimited = false): void {
    this.removeActive(path);
    this.state.failures += 1;
    if (rateLimited) this.state.rateLimited += 1;
    this.pushRecent(`✗ ${shortId(path)}: ${message.split('\n')[0].slice(0, 80)}`);
  }

  commit(message: string): void {
    this.state.commits += 1;
    this.pushRecent(`→ ${message.replace(/^\[guardian\] /, '')}`);
  }

  render(): string {
    return renderDashboard(this.state, this.deps.now());
  }

  start(intervalMs = 250): void {
    if (this.timer) return;
    this.deps.write(this.render());
    this.timer = setInterval(() => this.deps.write(this.render()), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.deps.write(this.render());
  }

  private removeActive(path: string): void {
    this.state.active = this.state.active.filter(w => w.path !== path);
  }

  private pushRecent(line: string): void {
    this.state.recent.push(line);
    if (this.state.recent.length > 20) this.state.recent.shift();
  }
}
