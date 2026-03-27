/**
 * Tests for MoodDynamics (0.3.1.5.4)
 *
 * Covers:
 *   - EWMA update toward appraisal signal
 *   - EWMA decay toward baseline when appraisal is null
 *   - Gradual correction applied over multiple cycles, clears on completion
 *   - Safety bounds (valenceFloor / valenceCeiling, arousalFloor / arousalCeiling)
 *   - negativeCycleDuration increments / resets
 *   - getMoodAtCycle / getMoodHistory access
 *   - History depth limit respected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MoodDynamics } from '../mood-dynamics.js';
import type { AppraisalResult, MoodParameters } from '../types.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const NOW = 1_000_000;

function makeParams(overrides: Partial<MoodParameters> = {}): MoodParameters {
  return {
    decayRate:      0.3,
    valenceFloor:   -1,
    valenceCeiling:  1,
    arousalFloor:    0,
    arousalCeiling:  1,
    ...overrides,
  };
}

function makeAppraisal(netValenceShift: number, netArousalShift = 0): AppraisalResult {
  return {
    perceptId:             'test-percept',
    timestamp:             NOW,
    goalCongruenceShift:   netValenceShift,
    affectedGoalPriority:  1,
    noveltyShift:          netArousalShift,
    valueAlignmentShift:   0,
    triggersEthicalAttention: false,
    netValenceShift,
    netArousalShift,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MoodDynamics', () => {
  let md: MoodDynamics;

  beforeEach(() => {
    md = new MoodDynamics();
  });

  // ── Initial state ───────────────────────────────────────────────────────────

  it('initialises to baseline valence=0, arousal=0.5', () => {
    const mood = md.getCurrentMood();
    expect(mood.valence).toBe(0);
    expect(mood.arousal).toBe(0.5);
    expect(mood.negativeCycleDuration).toBe(0);
    expect(mood.correctionEngaged).toBe(false);
  });

  it('accepts custom initial valence / arousal', () => {
    const md2 = new MoodDynamics(-0.3, 0.8);
    expect(md2.getCurrentMood().valence).toBeCloseTo(-0.3);
    expect(md2.getCurrentMood().arousal).toBeCloseTo(0.8);
  });

  // ── EWMA with appraisal ─────────────────────────────────────────────────────

  it('moves valence toward the appraisal signal each cycle (EWMA)', () => {
    const params = makeParams({ decayRate: 0.5 });
    // Start at 0; target = 1.0 → new valence = 0.5 * 0 + 0.5 * 1.0 = 0.5
    const next = md.update(makeAppraisal(1.0), params);
    expect(next.valence).toBeCloseTo(0.5);
  });

  it('moves arousal toward appraisal signal + baseline arousal', () => {
    const params = makeParams({ decayRate: 0.5 });
    // Baseline arousal = 0.5; appraisal netArousalShift = 0.3
    // Target arousal = 0.3 + 0.5 = 0.8
    // new arousal = 0.5 * 0.5 + 0.5 * 0.8 = 0.65
    const next = md.update(makeAppraisal(0, 0.3), params);
    expect(next.arousal).toBeCloseTo(0.65);
  });

  it('applies higher decay rate for faster mood change', () => {
    const fastParams = makeParams({ decayRate: 0.9 });
    const slowParams = makeParams({ decayRate: 0.1 });

    const fastMd = new MoodDynamics();
    const slowMd = new MoodDynamics();

    const fastNext = fastMd.update(makeAppraisal(1.0), fastParams);
    const slowNext = slowMd.update(makeAppraisal(1.0), slowParams);

    expect(fastNext.valence).toBeGreaterThan(slowNext.valence);
  });

  // ── EWMA with null appraisal (decay toward baseline) ───────────────────────

  it('decays valence toward baseline 0 when appraisal is null', () => {
    const md2 = new MoodDynamics(1.0); // start high
    const params = makeParams({ decayRate: 0.3 });
    const next = md2.update(null, params);
    // newValence = 0.7 * 1.0 + 0.3 * 0.0 = 0.7
    expect(next.valence).toBeCloseTo(0.7);
  });

  it('decays arousal toward baseline 0.5 when appraisal is null', () => {
    const md2 = new MoodDynamics(0, 0.0); // start arousal low
    const params = makeParams({ decayRate: 0.4 });
    const next = md2.update(null, params);
    // newArousal = 0.6 * 0.0 + 0.4 * 0.5 = 0.2
    expect(next.arousal).toBeCloseTo(0.2);
  });

  // ── Safety bounds ───────────────────────────────────────────────────────────

  it('clamps valence at valenceCeiling', () => {
    const params = makeParams({ decayRate: 1.0, valenceCeiling: 0.5 });
    const next = md.update(makeAppraisal(1.0), params);
    expect(next.valence).toBeLessThanOrEqual(0.5);
  });

  it('clamps valence at valenceFloor', () => {
    const params = makeParams({ decayRate: 1.0, valenceFloor: -0.5 });
    const next = md.update(makeAppraisal(-1.0), params);
    expect(next.valence).toBeGreaterThanOrEqual(-0.5);
  });

  it('clamps arousal at arousalCeiling', () => {
    const params = makeParams({ decayRate: 1.0, arousalCeiling: 0.6 });
    // netArousalShift = 0.5 + 0.5 baseline = 1.0 target but capped at 0.6
    const next = md.update(makeAppraisal(0, 0.5), params);
    expect(next.arousal).toBeLessThanOrEqual(0.6);
  });

  it('clamps arousal at arousalFloor', () => {
    const params = makeParams({ decayRate: 1.0, arousalFloor: 0.3 });
    const md2 = new MoodDynamics(0, 0.0);
    const next = md2.update(makeAppraisal(0, -0.5), params);
    expect(next.arousal).toBeGreaterThanOrEqual(0.3);
  });

  // ── negativeCycleDuration ───────────────────────────────────────────────────

  it('increments negativeCycleDuration when valence stays below −0.1', () => {
    const md2 = new MoodDynamics(-0.5);
    const params = makeParams({ decayRate: 0.1 });

    const s1 = md2.update(makeAppraisal(-0.5), params);
    expect(s1.negativeCycleDuration).toBe(1);

    const s2 = md2.update(makeAppraisal(-0.5), params);
    expect(s2.negativeCycleDuration).toBe(2);
  });

  it('resets negativeCycleDuration to 0 when valence rises above −0.1', () => {
    const md2 = new MoodDynamics(-0.5);
    const params = makeParams({ decayRate: 0.9 });

    md2.update(makeAppraisal(-0.5), params);
    md2.update(makeAppraisal(-0.5), params);

    // Apply strong positive appraisal to lift valence above −0.1
    const recovered = md2.update(makeAppraisal(1.0), params);
    expect(recovered.valence).toBeGreaterThan(-0.1);
    expect(recovered.negativeCycleDuration).toBe(0);
  });

  // ── Gradual correction ──────────────────────────────────────────────────────

  it('applies correction gradually — correctionEngaged is true during correction', () => {
    const params = makeParams({ decayRate: 0.1 });
    md.applyGradualCorrection(0.5, 4);

    const s1 = md.update(null, params);
    expect(s1.correctionEngaged).toBe(true);

    const s2 = md.update(null, params);
    expect(s2.correctionEngaged).toBe(true);
  });

  it('correction clears after the specified number of cycles', () => {
    const params = makeParams({ decayRate: 0.1 });
    md.applyGradualCorrection(0.5, 2);

    md.update(null, params); // cycle 1
    const s2 = md.update(null, params); // cycle 2 — last cycle
    expect(s2.correctionEngaged).toBe(false);
    expect(s2.valence).toBeCloseTo(0.5, 2);
  });

  it('applying a new correction replaces the pending one (overwrite behavior)', () => {
    const params = makeParams({ decayRate: 0.1 });
    md.applyGradualCorrection(-0.5, 10);
    md.applyGradualCorrection(0.8, 2); // overwrite

    const s1 = md.update(null, params);
    const s2 = md.update(null, params);
    // Should reach 0.8 after 2 cycles, not be converging toward -0.5
    expect(s2.valence).toBeCloseTo(0.8, 2);
  });

  it('correction target is clamped to [−1, 1]', () => {
    const params = makeParams({ decayRate: 1.0 });
    md.applyGradualCorrection(5.0, 1); // out-of-range target
    const s1 = md.update(null, params);
    expect(s1.valence).toBeLessThanOrEqual(1);
  });

  it('cycle count is minimum 1 even if 0 is provided', () => {
    const params = makeParams({ decayRate: 0.0 });
    md.applyGradualCorrection(0.5, 0); // should be normalised to 1
    const s1 = md.update(null, params);
    expect(s1.correctionEngaged).toBe(false); // completed in 1 cycle
    expect(s1.valence).toBeCloseTo(0.5);
  });

  // ── History ─────────────────────────────────────────────────────────────────

  it('getMoodHistory returns states from the last N cycles', () => {
    const params = makeParams({ decayRate: 0.3 });
    md.update(makeAppraisal(0.1), params);
    md.update(makeAppraisal(0.2), params);
    md.update(makeAppraisal(0.3), params);

    const history = md.getMoodHistory(2);
    expect(history).toHaveLength(2);
  });

  it('getMoodAtCycle(0) returns current mood', () => {
    const params = makeParams({ decayRate: 0.5 });
    const updated = md.update(makeAppraisal(0.5), params);
    const atCycle0 = md.getMoodAtCycle(0);
    expect(atCycle0?.valence).toBeCloseTo(updated.valence);
  });

  it('getMoodAtCycle(1) returns the previous cycle mood', () => {
    const params = makeParams({ decayRate: 0.5 });
    const s1 = md.update(makeAppraisal(0.2), params);
    md.update(makeAppraisal(0.8), params);
    const prev = md.getMoodAtCycle(1);
    expect(prev?.valence).toBeCloseTo(s1.valence);
  });

  it('getMoodAtCycle returns null beyond history depth', () => {
    expect(md.getMoodAtCycle(999)).toBeNull();
  });

  it('history does not exceed 200 entries', () => {
    const params = makeParams({ decayRate: 0.1 });
    for (let i = 0; i < 250; i++) {
      md.update(null, params);
    }
    const history = md.getMoodHistory(250);
    expect(history.length).toBeLessThanOrEqual(200);
  });
});
