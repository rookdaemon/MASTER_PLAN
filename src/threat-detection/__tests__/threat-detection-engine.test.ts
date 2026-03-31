/**
 * Tests for DefaultThreatDetectionEngine
 *
 * Verifies the contract defined by IThreatDetectionEngine:
 * - assess() returns a well-formed ThreatAssessment
 * - threat level is correctly derived from severity × confidence
 * - degradation tier and alert level escalate with increasing severity
 * - the world-model belief store is updated per observation
 * - a causal prediction is generated for each observation
 * - a consistency report is produced
 * - reset() returns the engine to a clean state
 * - the injectable Clock is used for timestamps
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { DefaultThreatDetectionEngine, type Clock } from '../threat-detection-engine.js';
import { DegradationTier, AlertLevel } from '../types.js';
import type { Observation } from '../types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeClock(initial = 1_000_000): Clock & { advance(ms: number): void } {
  let t = initial;
  return {
    now: () => t,
    advance(ms: number) { t += ms; },
  };
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-test-1',
    timestamp: 0,
    source: 'sensor',
    category: 'infrastructure-failure',
    description: 'Test observation — power anomaly detected.',
    severity: 0.3,
    confidence: 0.8,
    domainTags: ['power', 'infrastructure'],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DefaultThreatDetectionEngine', () => {
  let clock: Clock & { advance(ms: number): void };
  let engine: DefaultThreatDetectionEngine;

  beforeEach(() => {
    clock = makeClock();
    engine = new DefaultThreatDetectionEngine({ clock });
  });

  it('returns a ThreatAssessment with the triggering observation', () => {
    const obs = makeObservation();
    const assessment = engine.assess(obs);
    expect(assessment.triggeringObservation).toBe(obs);
  });

  it('uses the injected clock for the assessment timestamp', () => {
    const obs = makeObservation();
    const assessment = engine.assess(obs);
    expect(assessment.timestamp).toBe(1_000_000);
  });

  it('respects an explicit now override', () => {
    const obs = makeObservation();
    const assessment = engine.assess(obs, 9_999);
    expect(assessment.timestamp).toBe(9_999);
  });

  it('threat level = severity × confidence, clamped to [0, 1]', () => {
    const obs = makeObservation({ severity: 0.5, confidence: 0.8 });
    const assessment = engine.assess(obs);
    expect(assessment.threatLevel).toBeCloseTo(0.4, 5);
  });

  it('threat level clamps to 1.0 for maximum severity and confidence', () => {
    const obs = makeObservation({ severity: 1.0, confidence: 1.0 });
    const assessment = engine.assess(obs);
    expect(assessment.threatLevel).toBe(1.0);
  });

  it('threat level is 0 for zero severity', () => {
    const obs = makeObservation({ severity: 0.0, confidence: 1.0 });
    const assessment = engine.assess(obs);
    expect(assessment.threatLevel).toBe(0.0);
  });

  it('returns GREEN tier and None alert for low-severity observation', () => {
    const obs = makeObservation({ severity: 0.05, confidence: 0.9 });
    const assessment = engine.assess(obs);
    expect(assessment.degradationTier).toBe(DegradationTier.Green);
    expect(assessment.alertLevel).toBe(AlertLevel.None);
  });

  it('returns YELLOW tier and Warning alert for moderate threat', () => {
    // worst = 0.5 × 0.9 = 0.45 → bioHealth = 0.55, synthHealth ≈ 0.595 → worst = 0.55 → GREEN
    // need worstThreatLevel such that bioHealth < 0.8: threatLevel > 0.20
    // threat = 0.35 × 1.0 = 0.35 → bioHealth = 0.65 → GREEN
    // threat = 0.22 × 1.0 = 0.22 → bioHealth = 0.78 → GREEN
    // YELLOW: worst < 0.8 && worst >= 0.5 → bioHealth in [0.5, 0.8) → threat in (0.2, 0.5]
    const obs = makeObservation({ severity: 0.45, confidence: 1.0 });
    const assessment = engine.assess(obs);
    expect(assessment.degradationTier).toBe(DegradationTier.Yellow);
    expect(assessment.alertLevel).toBe(AlertLevel.Warning);
  });

  it('returns ORANGE tier and Critical alert for high-severity threat', () => {
    // ORANGE: bioHealth in [0.25, 0.5) → threat in (0.5, 0.75]
    const obs = makeObservation({ severity: 0.65, confidence: 1.0 });
    const assessment = engine.assess(obs);
    expect(assessment.degradationTier).toBe(DegradationTier.Orange);
    expect(assessment.alertLevel).toBe(AlertLevel.Critical);
  });

  it('returns RED tier and Emergency alert for critical threat', () => {
    // RED: bioHealth < 0.25 → threat > 0.75
    const obs = makeObservation({ severity: 0.9, confidence: 1.0 });
    const assessment = engine.assess(obs);
    expect(assessment.degradationTier).toBe(DegradationTier.Red);
    expect(assessment.alertLevel).toBe(AlertLevel.Emergency);
  });

  it('tier escalates monotonically with successive severe observations', () => {
    const low  = makeObservation({ id: 'o1', severity: 0.1, confidence: 1.0 });
    const mid  = makeObservation({ id: 'o2', severity: 0.5, confidence: 1.0 });
    const high = makeObservation({ id: 'o3', severity: 0.9, confidence: 1.0 });

    const a1 = engine.assess(low);
    const a2 = engine.assess(mid);
    const a3 = engine.assess(high);

    const tierOrder = [
      DegradationTier.Green,
      DegradationTier.Yellow,
      DegradationTier.Orange,
      DegradationTier.Red,
      DegradationTier.Black,
    ];
    const idx = (t: DegradationTier) => tierOrder.indexOf(t);

    expect(idx(a2.degradationTier)).toBeGreaterThanOrEqual(idx(a1.degradationTier));
    expect(idx(a3.degradationTier)).toBeGreaterThanOrEqual(idx(a2.degradationTier));
  });

  it('populates updatedBeliefs with the new belief ID', () => {
    const obs = makeObservation();
    const assessment = engine.assess(obs);
    expect(assessment.updatedBeliefs).toHaveLength(1);
    expect(typeof assessment.updatedBeliefs[0]).toBe('string');
  });

  it('generates a causal prediction with a non-empty consequent', () => {
    const obs = makeObservation();
    const assessment = engine.assess(obs);
    expect(assessment.causalPrediction).toBeDefined();
    expect(assessment.causalPrediction.antecedent).toContain(obs.description);
    expect(assessment.causalPrediction.consequent.length).toBeGreaterThan(0);
  });

  it('produces a consistency report', () => {
    const obs = makeObservation();
    const assessment = engine.assess(obs);
    expect(assessment.consistencyReport).toBeDefined();
    expect(typeof assessment.consistencyReport.overallConsistent).toBe('boolean');
  });

  it('propagates threatCategory from observation', () => {
    const obs = makeObservation({ category: 'physical-impact' });
    const assessment = engine.assess(obs);
    expect(assessment.threatCategory).toBe('physical-impact');
  });

  it('includes a non-empty recommendedResponse', () => {
    const obs = makeObservation();
    const assessment = engine.assess(obs);
    expect(assessment.recommendedResponse.length).toBeGreaterThan(0);
  });

  it('upserts entity when affectedEntityId is provided', () => {
    const obs = makeObservation({ affectedEntityId: 'entity:test-node' });
    // Should not throw; entity update happens silently inside assess()
    expect(() => engine.assess(obs)).not.toThrow();
  });

  describe('reset()', () => {
    it('restores GREEN tier after a high-severity assessment', () => {
      const highObs = makeObservation({ id: 'h1', severity: 0.9, confidence: 1.0 });
      engine.assess(highObs);

      engine.reset();

      const lowObs = makeObservation({ id: 'l1', severity: 0.05, confidence: 0.9 });
      const afterReset = engine.assess(lowObs);
      expect(afterReset.degradationTier).toBe(DegradationTier.Green);
    });

    it('clears world-model beliefs after reset', () => {
      const obs = makeObservation();
      engine.assess(obs);

      engine.reset();

      // After reset the next assessment should have exactly one belief (the new one)
      const obs2 = makeObservation({ id: 'obs-2' });
      const assessment = engine.assess(obs2);
      expect(assessment.updatedBeliefs).toHaveLength(1);
    });
  });
});
