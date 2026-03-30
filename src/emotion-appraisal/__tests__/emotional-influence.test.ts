/**
 * Tests for EmotionalInfluence (0.3.1.5.4)
 *
 * Covers:
 *   - deliberationConfidenceBias: range [−0.3, +0.3], positive/negative valence
 *   - alternativesExpansionFactor: range [0, 1], inverse relationship with valence
 *   - memoryValenceBias: passes through valence (clamped to [−1, 1])
 *   - riskConservatismFactor: passes through arousal (clamped to [0, 1])
 *   - communicationToneBias: attenuated valence (× 0.7, clamped to [−1, 1])
 *   - All boundary values (valence ∈ {−1, 0, +1}, arousal ∈ {0, 0.5, 1})
 *   - Determinism: same mood always produces the same vector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionalInfluence } from '../emotional-influence.js';
import { MoodDynamics } from '../mood-dynamics.js';
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

function makeAppraisal(
  netValenceShift: number,
  netArousalShift = 0,
): AppraisalResult {
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

// Drives MoodDynamics to a specific valence/arousal state.
// With decayRate=1 the update formula collapses to:
//   newValence = targetValence
//   newArousal = netArousalShift + 0.5 (baseline)
function driveTo(
  md: MoodDynamics,
  valence: number,
  arousal = 0.5,
): void {
  const params = makeParams();
  // Target arousal = arousal; netArousalShift = arousal - 0.5
  md.update(makeAppraisal(valence, arousal - 0.5), params);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmotionalInfluence', () => {
  let md:       MoodDynamics;
  let influence: EmotionalInfluence;

  beforeEach(() => {
    md       = new MoodDynamics();
    influence = new EmotionalInfluence(md);
  });

  // ── deliberationConfidenceBias ──────────────────────────────────────────────

  it('deliberationConfidenceBias = +0.3 at valence = +1', () => {
    driveTo(md, 1.0);
    expect(influence.getInfluenceVector().deliberationConfidenceBias).toBeCloseTo(0.3);
  });

  it('deliberationConfidenceBias = −0.3 at valence = −1', () => {
    driveTo(md, -1.0);
    expect(influence.getInfluenceVector().deliberationConfidenceBias).toBeCloseTo(-0.3);
  });

  it('deliberationConfidenceBias = 0 at valence = 0', () => {
    driveTo(md, 0);
    expect(influence.getInfluenceVector().deliberationConfidenceBias).toBeCloseTo(0);
  });

  it('deliberationConfidenceBias is within [−0.3, +0.3] for any valence', () => {
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      driveTo(md, v);
      const bias = influence.getInfluenceVector().deliberationConfidenceBias;
      expect(bias).toBeGreaterThanOrEqual(-0.3);
      expect(bias).toBeLessThanOrEqual(0.3);
    }
  });

  // ── alternativesExpansionFactor ─────────────────────────────────────────────

  it('alternativesExpansionFactor = 1.0 at valence = −1', () => {
    driveTo(md, -1.0);
    expect(influence.getInfluenceVector().alternativesExpansionFactor).toBeCloseTo(1.0);
  });

  it('alternativesExpansionFactor = 0.0 at valence = +1', () => {
    driveTo(md, 1.0);
    expect(influence.getInfluenceVector().alternativesExpansionFactor).toBeCloseTo(0.0);
  });

  it('alternativesExpansionFactor = 0.5 at valence = 0', () => {
    driveTo(md, 0);
    expect(influence.getInfluenceVector().alternativesExpansionFactor).toBeCloseTo(0.5);
  });

  it('alternativesExpansionFactor is within [0, 1] for any valence', () => {
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      driveTo(md, v);
      const factor = influence.getInfluenceVector().alternativesExpansionFactor;
      expect(factor).toBeGreaterThanOrEqual(0);
      expect(factor).toBeLessThanOrEqual(1);
    }
  });

  // ── memoryValenceBias ───────────────────────────────────────────────────────

  it('memoryValenceBias mirrors valence (positive)', () => {
    driveTo(md, 0.6);
    expect(influence.getInfluenceVector().memoryValenceBias).toBeCloseTo(0.6);
  });

  it('memoryValenceBias mirrors valence (negative)', () => {
    driveTo(md, -0.8);
    expect(influence.getInfluenceVector().memoryValenceBias).toBeCloseTo(-0.8);
  });

  it('memoryValenceBias is within [−1, 1]', () => {
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      driveTo(md, v);
      const bias = influence.getInfluenceVector().memoryValenceBias;
      expect(bias).toBeGreaterThanOrEqual(-1);
      expect(bias).toBeLessThanOrEqual(1);
    }
  });

  // ── riskConservatismFactor ──────────────────────────────────────────────────

  it('riskConservatismFactor = 0 at arousal = 0', () => {
    driveTo(md, 0, 0);
    expect(influence.getInfluenceVector().riskConservatismFactor).toBeCloseTo(0);
  });

  it('riskConservatismFactor = 1 at arousal = 1', () => {
    driveTo(md, 0, 1);
    expect(influence.getInfluenceVector().riskConservatismFactor).toBeCloseTo(1);
  });

  it('riskConservatismFactor = 0.5 at baseline arousal = 0.5', () => {
    driveTo(md, 0, 0.5);
    expect(influence.getInfluenceVector().riskConservatismFactor).toBeCloseTo(0.5);
  });

  it('riskConservatismFactor is within [0, 1]', () => {
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      driveTo(md, 0, a);
      const factor = influence.getInfluenceVector().riskConservatismFactor;
      expect(factor).toBeGreaterThanOrEqual(0);
      expect(factor).toBeLessThanOrEqual(1);
    }
  });

  // ── communicationToneBias ───────────────────────────────────────────────────

  it('communicationToneBias = 0.7 at valence = +1', () => {
    driveTo(md, 1.0);
    expect(influence.getInfluenceVector().communicationToneBias).toBeCloseTo(0.7);
  });

  it('communicationToneBias = −0.7 at valence = −1', () => {
    driveTo(md, -1.0);
    expect(influence.getInfluenceVector().communicationToneBias).toBeCloseTo(-0.7);
  });

  it('communicationToneBias = 0 at valence = 0', () => {
    driveTo(md, 0);
    expect(influence.getInfluenceVector().communicationToneBias).toBeCloseTo(0);
  });

  it('communicationToneBias is within [−1, 1]', () => {
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      driveTo(md, v);
      const tone = influence.getInfluenceVector().communicationToneBias;
      expect(tone).toBeGreaterThanOrEqual(-1);
      expect(tone).toBeLessThanOrEqual(1);
    }
  });

  // ── Mood snapshot included ──────────────────────────────────────────────────

  it('influence vector includes the current mood snapshot', () => {
    driveTo(md, 0.4, 0.6);
    const vector = influence.getInfluenceVector();
    expect(vector.mood.valence).toBeCloseTo(0.4);
    expect(vector.mood.arousal).toBeCloseTo(0.6);
  });

  // ── Determinism ────────────────────────────────────────────────────────────

  it('same mood state always produces the same influence vector', () => {
    driveTo(md, 0.3, 0.7);
    const v1 = influence.getInfluenceVector();
    const v2 = influence.getInfluenceVector();
    expect(v1.deliberationConfidenceBias).toBeCloseTo(v2.deliberationConfidenceBias);
    expect(v1.alternativesExpansionFactor).toBeCloseTo(v2.alternativesExpansionFactor);
    expect(v1.memoryValenceBias).toBeCloseTo(v2.memoryValenceBias);
    expect(v1.riskConservatismFactor).toBeCloseTo(v2.riskConservatismFactor);
    expect(v1.communicationToneBias).toBeCloseTo(v2.communicationToneBias);
  });
});
