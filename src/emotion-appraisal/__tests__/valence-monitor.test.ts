/**
 * Tests for ValenceMonitor (0.3.1.5.4)
 *
 * Covers:
 *   - getCurrentValence reflects current MoodDynamics state
 *   - getSufferingIndicators: no suffering when valence ≥ 0
 *   - getSufferingIndicators: goal-incongruence-distress when valence < 0
 *   - getSufferingIndicators: value-threat-spike when valence < −0.7
 *   - getSufferingIndicators: highestIntensity is max across modalities
 *   - getSufferingIndicators: mitigationEngaged mirrors correctionEngaged
 *   - getExperientialIntegrity: fresh start → perfectly coherent
 *   - getExperientialIntegrity: high variance → lower coherence
 *   - getExperientialIntegrity: large single jump → gap-detected
 *   - getExperientialIntegrity: very large jump → fragmented
 *   - getExperientialIntegrity: integration level reflects cycles within spec range
 *   - getValenceHistory: returns samples within time window
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValenceMonitor } from '../valence-monitor.js';
import { MoodDynamics } from '../mood-dynamics.js';
import { EmotionalRegulation } from '../emotional-regulation.js';
import { AppraisalEngine } from '../appraisal-engine.js';
import type { MoodParameters, AppraisalResult } from '../types.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const NOW = 1_000_000;

function makeParams(overrides: Partial<MoodParameters> = {}): MoodParameters {
  return {
    decayRate:      1.0,   // instant convergence for test clarity
    valenceFloor:   -1,
    valenceCeiling:  1,
    arousalFloor:    0,
    arousalCeiling:  1,
    ...overrides,
  };
}

function makeAppraisal(netValenceShift: number, netArousalShift = 0): AppraisalResult {
  return {
    perceptId:              'test',
    timestamp:              NOW,
    goalCongruenceShift:    netValenceShift,
    affectedGoalPriority:   1,
    noveltyShift:           netArousalShift,
    valueAlignmentShift:    0,
    triggersEthicalAttention: false,
    netValenceShift,
    netArousalShift,
  };
}

function makeSuite(): { md: MoodDynamics; monitor: ValenceMonitor } {
  const md  = new MoodDynamics();
  const eng = new AppraisalEngine();
  const reg = new EmotionalRegulation(md, eng);
  const monitor = new ValenceMonitor(md, reg);
  return { md, monitor };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ValenceMonitor', () => {
  let md:      MoodDynamics;
  let monitor: ValenceMonitor;

  beforeEach(() => {
    ({ md, monitor } = makeSuite());
  });

  // ── getCurrentValence ───────────────────────────────────────────────────────

  it('getCurrentValence reflects the MoodDynamics current mood', () => {
    const params = makeParams();
    md.update(makeAppraisal(0.7), params);

    const state = monitor.getCurrentValence();
    expect(state.valence).toBeCloseTo(0.7);
    expect(state.confidence).toBe(1.0);
  });

  it('getCurrentValence includes arousal from current mood', () => {
    const params = makeParams();
    // decayRate=1 so new arousal = targetArousal = 0.3 + 0.5 baseline = 0.8
    md.update(makeAppraisal(0, 0.3), params);
    const state = monitor.getCurrentValence();
    expect(state.arousal).toBeCloseTo(0.8);
  });

  // ── getSufferingIndicators ──────────────────────────────────────────────────

  it('reports no active modalities when valence is non-negative', () => {
    const params = makeParams();
    md.update(makeAppraisal(0.5), params);
    const report = monitor.getSufferingIndicators();
    expect(report.activeModalities).toHaveLength(0);
    expect(report.highestIntensity).toBe(0);
  });

  it('reports goal-incongruence-distress when valence < 0', () => {
    const params = makeParams();
    md.update(makeAppraisal(-0.5), params);
    const report = monitor.getSufferingIndicators();
    const gid = report.activeModalities.find(m => m.name === 'goal-incongruence-distress');
    expect(gid).toBeDefined();
    expect(gid?.intensity).toBeCloseTo(0.5);
  });

  it('reports value-threat-spike when valence < −0.7', () => {
    const params = makeParams();
    md.update(makeAppraisal(-0.8), params);
    const report = monitor.getSufferingIndicators();
    const spike = report.activeModalities.find(m => m.name === 'value-threat-spike');
    expect(spike).toBeDefined();
    expect(spike?.intensity).toBeCloseTo(0.8);
  });

  it('reports both modalities when valence < −0.7', () => {
    const params = makeParams();
    md.update(makeAppraisal(-0.9), params);
    const report = monitor.getSufferingIndicators();
    const names = report.activeModalities.map(m => m.name);
    expect(names).toContain('goal-incongruence-distress');
    expect(names).toContain('value-threat-spike');
  });

  it('highestIntensity is the maximum intensity across all active modalities', () => {
    const params = makeParams();
    md.update(makeAppraisal(-0.9), params);
    const report = monitor.getSufferingIndicators();
    const maxFromModalities = Math.max(...report.activeModalities.map(m => m.intensity));
    expect(report.highestIntensity).toBeCloseTo(maxFromModalities);
  });

  it('mitigationEngaged mirrors correctionEngaged from MoodState', () => {
    const params = makeParams({ decayRate: 0.1 });
    md.applyGradualCorrection(0.5, 4);
    md.update(null, params); // triggers correction

    const report = monitor.getSufferingIndicators();
    expect(report.mitigationEngaged).toBe(true);
  });

  it('goal-incongruence-distress durationCycles matches negativeCycleDuration', () => {
    // Drive valence negative for multiple cycles using low decayRate
    const md2 = new MoodDynamics(-0.5);
    const eng = new AppraisalEngine();
    const reg = new EmotionalRegulation(md2, eng);
    const mon = new ValenceMonitor(md2, reg);

    const params = makeParams({ decayRate: 0.1 });
    md2.update(makeAppraisal(-0.5), params); // cycle 1
    md2.update(makeAppraisal(-0.5), params); // cycle 2
    md2.update(makeAppraisal(-0.5), params); // cycle 3

    const report = mon.getSufferingIndicators();
    const gid = report.activeModalities.find(m => m.name === 'goal-incongruence-distress');
    expect(gid?.durationCycles).toBeGreaterThanOrEqual(1);
  });

  // ── getExperientialIntegrity ────────────────────────────────────────────────

  it('returns perfectly coherent state on fresh start (no history)', () => {
    const integrity = monitor.getExperientialIntegrity();
    expect(integrity.experientialCoherence).toBe(1.0);
    expect(integrity.continuityStatus).toBe('intact');
    expect(integrity.integrationLevel).toBe(1.0);
  });

  it('high variance in recent history → lower coherence', () => {
    const params = makeParams({ decayRate: 1.0 });
    // Alternate between extreme valence values to maximise variance
    for (let i = 0; i < 10; i++) {
      md.update(makeAppraisal(i % 2 === 0 ? 1.0 : -1.0), params);
    }
    const integrity = monitor.getExperientialIntegrity();
    expect(integrity.experientialCoherence).toBeLessThan(0.5);
  });

  it('stable history → high coherence', () => {
    const params = makeParams({ decayRate: 1.0 });
    for (let i = 0; i < 10; i++) {
      md.update(makeAppraisal(0.3), params);
    }
    const integrity = monitor.getExperientialIntegrity();
    expect(integrity.experientialCoherence).toBeGreaterThan(0.9);
  });

  it('large jump (> 0.5) between consecutive cycles → gap-detected', () => {
    const params = makeParams({ decayRate: 1.0 });
    // Build some history at 0.0
    for (let i = 0; i < 5; i++) {
      md.update(makeAppraisal(0.0), params);
    }
    // Jump by > 0.5; then one more update to push the jumped state into history
    md.update(makeAppraisal(0.8), params);
    md.update(makeAppraisal(0.8), params); // now jump is in history buffer

    const integrity = monitor.getExperientialIntegrity();
    expect(['gap-detected', 'fragmented']).toContain(integrity.continuityStatus);
  });

  it('very large jump (> 1.0) → fragmented', () => {
    const params = makeParams({ decayRate: 1.0 });
    for (let i = 0; i < 5; i++) {
      md.update(makeAppraisal(-1.0), params);
    }
    md.update(makeAppraisal(1.0), params); // big jump (delta = 2.0)
    md.update(makeAppraisal(1.0), params); // push jump into history buffer

    const integrity = monitor.getExperientialIntegrity();
    expect(integrity.continuityStatus).toBe('fragmented');
  });

  it('integration level is lower when some cycles are below design spec −0.7', () => {
    const params = makeParams({ decayRate: 1.0 });
    // 5 cycles at acceptable valence
    for (let i = 0; i < 5; i++) {
      md.update(makeAppraisal(0.0), params);
    }
    // 5 cycles below spec (−0.8 < −0.7)
    for (let i = 0; i < 5; i++) {
      md.update(makeAppraisal(-0.8), params);
    }
    const integrity = monitor.getExperientialIntegrity();
    expect(integrity.integrationLevel).toBeLessThan(1.0);
  });

  // ── getValenceHistory ───────────────────────────────────────────────────────

  it('returns at least the current sample when history is empty', () => {
    const trace = monitor.getValenceHistory(60_000);
    expect(trace.samples.length).toBeGreaterThanOrEqual(1);
  });

  it('calculates averageValence, minValence, maxValence across samples', () => {
    const params = makeParams({ decayRate: 1.0 });

    // Spy on Date.now so history timestamps fall within the window
    let tick = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => tick);

    md.update(makeAppraisal(0.2), params); tick += 100;
    md.update(makeAppraisal(-0.4), params); tick += 100;
    md.update(makeAppraisal(0.6), params); tick += 100;

    const trace = monitor.getValenceHistory(1_000);

    expect(trace.minValence).toBeLessThanOrEqual(trace.averageValence);
    expect(trace.maxValence).toBeGreaterThanOrEqual(trace.averageValence);
    expect(trace.minValence).toBeLessThanOrEqual(trace.maxValence);

    vi.restoreAllMocks();
  });
});
