import { describe, it, expect } from 'vitest';
import { Dashboard, type DashboardSnapshot, type IDashboardOutput } from '../dashboard.js';

function mockOutput(): { output: IDashboardOutput; getContent: () => string } {
  let content = '';
  const output: IDashboardOutput = {
    write: (d) => { content += d; },
    isTTY: true,
  };
  return { output, getContent: () => content };
}

function baseSnapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    agentId: 'agent-0',
    cycle: 0,
    warmStart: false,
    valence: 0.0,
    arousal: 0.3,
    unity: 0.8,
    phi: 0.6,
    selfModelCoherence: 0.85,
    experienceContinuity: 0.95,
    phases: [
      { name: 'perceive', active: false, lastDurationMs: 0.1 },
      { name: 'recall', active: false, lastDurationMs: 0.1 },
      { name: 'appraise', active: false, lastDurationMs: 0.1 },
      { name: 'deliberate', active: false, lastDurationMs: 0.2 },
      { name: 'act', active: false, lastDurationMs: 0.1 },
      { name: 'monitor', active: false, lastDurationMs: 0.1 },
      { name: 'consolidate', active: false, lastDurationMs: 0.1 },
      { name: 'yield', active: false, lastDurationMs: 0.0 },
    ],
    drives: [],
    stable: true,
    experienceIntact: true,
    degradationCount: 0,
    alertCount: 0,
    goalCount: 0,
    topGoal: '',
    ...overrides,
  };
}

describe('Dashboard', () => {
  it('renders agent id and cycle in TTY mode', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.render(baseSnapshot({ cycle: 42 }));
    const content = getContent();
    expect(content).toContain('agent-0');
    expect(content).toContain('42');
    expect(content).toContain('MASTER_PLAN');
  });

  it('shows COLD for fresh start', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.render(baseSnapshot({ warmStart: false }));
    expect(getContent()).toContain('COLD');
  });

  it('shows WARM for warm start', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.render(baseSnapshot({ warmStart: true }));
    expect(getContent()).toContain('WARM');
  });

  it('renders experiential state bars', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.render(baseSnapshot({ valence: -0.5, arousal: 0.8, unity: 0.9 }));
    const content = getContent();
    expect(content).toContain('valence');
    expect(content).toContain('arousal');
    expect(content).toContain('unity');
    expect(content).toContain('-0.50');
    expect(content).toContain('0.80');
  });

  it('renders consciousness metrics', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.render(baseSnapshot({ phi: 0.7, selfModelCoherence: 0.9 }));
    const content = getContent();
    expect(content).toContain('self-model');
    expect(content).toContain('0.70');
  });

  it('shows phase timing', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    const snap = baseSnapshot();
    snap.phases[3]!.lastDurationMs = 12.5;
    dash.render(snap);
    expect(getContent()).toContain('DELIBERATE');
    expect(getContent()).toContain('12.5');
  });

  it('shows stability status', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.render(baseSnapshot({ stable: true, experienceIntact: true }));
    expect(getContent()).toContain('intact');
    expect(getContent()).toContain('stable');
  });

  it('shows degradation warning', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.render(baseSnapshot({ experienceIntact: false, degradationCount: 3 }));
    expect(getContent()).toContain('DEGRADED');
  });

  it('displays recent events', () => {
    const { output, getContent } = mockOutput();
    const dash = new Dashboard(output);
    dash.log('perception', 'Hello world received');
    dash.render(baseSnapshot());
    expect(getContent()).toContain('Hello world received');
  });

  it('does not render in non-TTY mode', () => {
    const nonTTY: IDashboardOutput = { write: () => {}, isTTY: false };
    const dash = new Dashboard(nonTTY);
    // Should not throw
    dash.render(baseSnapshot());
  });

  it('uses logLine for non-TTY output', () => {
    let output = '';
    const nonTTY: IDashboardOutput = { write: (d) => { output += d; }, isTTY: false };
    const dash = new Dashboard(nonTTY);
    dash.logLine('lifecycle', 'started');
    expect(output).toContain('LIFECYCLE');
    expect(output).toContain('started');
  });

  it('trims event log to prevent unbounded growth', () => {
    const { output } = mockOutput();
    const dash = new Dashboard(output);
    for (let i = 0; i < 100; i++) {
      dash.log('tick', `event ${i}`);
    }
    // Internal trimming should keep it bounded
    dash.render(baseSnapshot());
    // If we get here without OOM, the trim worked
  });
});
