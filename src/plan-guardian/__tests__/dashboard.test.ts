import { describe, it, expect } from 'vitest';
import { renderDashboard, formatDuration, GuardianDashboard, type DashboardState } from '../dashboard.js';

const T0 = 1_000_000;

function baseState(over: Partial<DashboardState> = {}): DashboardState {
  return {
    mode: 'agentic',
    concurrency: 5,
    modelPolicy: 'floor=haiku ceiling=opus eff=max',
    startedAtMs: T0,
    epoch: 3,
    commits: 7,
    failures: 1,
    rateLimited: 0,
    costUsd: 0.42,
    active: [],
    recent: [],
    ...over,
  };
}

describe('formatDuration', () => {
  it('formats seconds, minutes, hours', () => {
    expect(formatDuration(5_000)).toBe('5s');
    expect(formatDuration(65_000)).toBe('1m05s');
    expect(formatDuration(3_725_000)).toBe('1h02m');
  });
});

describe('renderDashboard', () => {
  it('shows mode, epoch, worker count, model policy, and tallies', () => {
    const out = renderDashboard(baseState(), T0 + 90_000);
    expect(out).toContain('Plan Guardian — AGENTIC');
    expect(out).toContain('epoch 3');
    expect(out).toContain('elapsed 1m30s');
    expect(out).toContain('floor=haiku ceiling=opus');
    expect(out).toContain('commits 7');
    expect(out).toContain('~$0.42');
  });

  it('lists active workers with their card, action, and model in use', () => {
    const out = renderDashboard(
      baseState({
        active: [
          { path: 'plan/0.5.1-interstellar-probe-swarms.md', action: 'decompose', model: 'opus·high', startedAtMs: T0 },
          { path: 'plan/0.7.4-doctrine.md', action: 'refine', model: 'sonnet·medium', startedAtMs: T0 + 5_000 },
        ],
      }),
      T0 + 10_000,
    );
    expect(out).toContain('ACTIVE (2)');
    expect(out).toContain('0.5.1-interstellar-probe'); // id is shown (truncated to the column width)
    expect(out).toContain('decompose');
    expect(out).toContain('opus·high');
    expect(out).toContain('sonnet·medium');
  });

  it('renders a plan status tally when stats are present', () => {
    const out = renderDashboard(
      baseState({ stats: { total: 106, byStatus: { PLAN: 80, ARCHITECT: 3, IMPLEMENT: 2, REVIEW: 1, DONE: 20 } } }),
      T0,
    );
    expect(out).toContain('plan: 20/106 DONE');
    expect(out).toContain('80 PLAN');
  });

  it('shows (idle) when no workers are active', () => {
    expect(renderDashboard(baseState(), T0)).toContain('(idle)');
  });
});

describe('GuardianDashboard controller', () => {
  function fixedClock(times: number[]): () => number {
    let i = 0;
    return () => times[Math.min(i++, times.length - 1)];
  }

  it('tracks active workers across start/complete and accumulates cost + commits', () => {
    const written: string[] = [];
    const dash = new GuardianDashboard(
      { mode: 'agentic', concurrency: 5, modelPolicy: 'p' },
      { write: s => written.push(s), now: fixedClock([T0]) },
    );

    dash.epochStart(1);
    dash.workerStart('plan/0.5.1-x.md', 'decompose', 'opus·high');
    dash.workerStart('plan/0.7.4-y.md', 'refine', 'sonnet·medium');
    expect(dash.snapshot().active).toHaveLength(2);

    dash.workerComplete('plan/0.5.1-x.md', '0.5.1 decompose (2 files)', 0.03);
    expect(dash.snapshot().active.map(w => w.path)).toEqual(['plan/0.7.4-y.md']);
    expect(dash.snapshot().costUsd).toBeCloseTo(0.03, 6);

    dash.commit('[guardian] epoch 1: 0.5.1 decompose');
    expect(dash.snapshot().commits).toBe(1);

    dash.workerError('plan/0.7.4-y.md', 'claude CLI error: 401', false);
    expect(dash.snapshot().active).toHaveLength(0);
    expect(dash.snapshot().failures).toBe(1);
    expect(dash.snapshot().recent.some(l => l.startsWith('✗'))).toBe(true);
  });

  it('counts rate-limited failures separately', () => {
    const dash = new GuardianDashboard(
      { mode: 'agentic', concurrency: 2, modelPolicy: 'p' },
      { write: () => {}, now: () => T0 },
    );
    dash.workerStart('plan/a.md', 'refine');
    dash.workerError('plan/a.md', 'Rate limited: free-models-per-min', true);
    expect(dash.snapshot().rateLimited).toBe(1);
    expect(dash.snapshot().failures).toBe(1);
  });
});
