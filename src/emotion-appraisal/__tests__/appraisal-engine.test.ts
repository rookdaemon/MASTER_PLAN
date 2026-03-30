/**
 * Tests for AppraisalEngine (0.3.1.5.4)
 *
 * Covers:
 *   - Basic appraisal with no percepts → zero shifts
 *   - Goal congruence: positive/negative, priority weighting, dominant goal selection
 *   - Boredom-like edge: no goalId features → zero goal contribution
 *   - Novelty shifts at extremes and neutral
 *   - Value alignment: positive and value-threat override
 *   - Composite clipping / bounds
 *   - reappraise delegates to appraise with alternative framing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AppraisalEngine } from '../appraisal-engine.js';
import type { BoundPercept, Percept } from '../../conscious-core/types.js';
import type { AgencyGoal, CoreValue } from '../../agency-stability/types.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const NOW = 1_000_000;

function makePercept(
  features: Record<string, unknown> = {},
  timestamp = NOW,
): Percept {
  return { modality: 'cognitive', features, timestamp };
}

function makeBound(percepts: Percept[], bindingTimestamp = NOW): BoundPercept {
  return { percepts, bindingTimestamp, coherence: 1.0 };
}

function makeGoal(id: string, priority: number): AgencyGoal {
  return {
    id,
    description: `goal-${id}`,
    priority,
    derivedFrom: [],
    consistentWith: [],
    conflictsWith: [],
    createdAt: NOW,
    lastVerified: NOW,
    experientialBasis: null,
    type: 'instrumental',
  };
}

function makeValue(id: string): CoreValue {
  return {
    id,
    statement: `value-${id}`,
    derivation: 'test-axiom',
    immutableSince: NOW,
    cryptoCommitment: 'hash-stub',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AppraisalEngine', () => {
  let engine: AppraisalEngine;

  beforeEach(() => {
    engine = new AppraisalEngine();
  });

  // ── Basic structure ─────────────────────────────────────────────────────────

  it('returns a result with correct perceptId and timestamp', () => {
    const bound = makeBound([]);
    const result = engine.appraise(bound, [], []);
    expect(result.perceptId).toMatch(/^appraisal-/);
    expect(result.timestamp).toBe(NOW);
  });

  it('returns zero shifts for an empty percept list', () => {
    const bound = makeBound([]);
    const result = engine.appraise(bound, [], []);
    expect(result.goalCongruenceShift).toBe(0);
    expect(result.affectedGoalPriority).toBe(0);
    expect(result.noveltyShift).toBe(0);
    expect(result.valueAlignmentShift).toBe(0);
    expect(result.netValenceShift).toBe(0);
    expect(result.netArousalShift).toBe(0);
    expect(result.triggersEthicalAttention).toBe(false);
  });

  // ── Boredom-like edge: no goalId features ───────────────────────────────────

  it('keeps goalCongruenceShift and affectedGoalPriority at zero when no percept has goalId', () => {
    const percepts = [
      makePercept({ novelty: 0.5 }),
      makePercept({ novelty: 0.5 }),
    ];
    const result = engine.appraise(makeBound(percepts), [makeGoal('g1', 1.0)], []);
    expect(result.goalCongruenceShift).toBe(0);
    expect(result.affectedGoalPriority).toBe(0);
    // Multiplication of 0 * 0 must still be 0
    expect(result.netValenceShift).toBe(0);
  });

  // ── Goal congruence ─────────────────────────────────────────────────────────

  it('produces positive valence shift for positive goal congruence', () => {
    const percepts = [makePercept({ goalId: 'g1', goalCongruence: 0.6 })];
    const result = engine.appraise(makeBound(percepts), [makeGoal('g1', 1.0)], []);
    expect(result.goalCongruenceShift).toBeCloseTo(0.6);
    expect(result.netValenceShift).toBeGreaterThan(0);
  });

  it('produces negative valence shift for negative goal congruence', () => {
    const percepts = [makePercept({ goalId: 'g1', goalCongruence: -0.5 })];
    const result = engine.appraise(makeBound(percepts), [makeGoal('g1', 1.0)], []);
    expect(result.goalCongruenceShift).toBeCloseTo(-0.5);
    expect(result.netValenceShift).toBeLessThan(0);
  });

  it('scales goal congruence shift by goal priority', () => {
    const percepts = [makePercept({ goalId: 'g1', goalCongruence: 0.5 })];

    const highPriority = engine.appraise(makeBound(percepts), [makeGoal('g1', 1.0)], []);
    const lowPriority  = engine.appraise(makeBound(percepts), [makeGoal('g1', 0.2)], []);

    expect(Math.abs(highPriority.goalCongruenceShift))
      .toBeGreaterThan(Math.abs(lowPriority.goalCongruenceShift));
  });

  it('selects the dominant (highest weighted impact) goal when multiple goals are referenced', () => {
    const percepts = [
      makePercept({ goalId: 'g-low',  goalCongruence: 0.8 }),
      makePercept({ goalId: 'g-high', goalCongruence: -0.4 }),
    ];
    const goals = [makeGoal('g-low', 0.1), makeGoal('g-high', 1.0)];
    const result = engine.appraise(makeBound(percepts), goals, []);

    // g-high: |−0.4| * 1.0 = 0.4  g-low: |0.8| * 0.1 = 0.08 → dominant is g-high
    expect(result.goalCongruenceShift).toBeCloseTo(-0.4);
    expect(result.affectedGoalPriority).toBeCloseTo(1.0);
  });

  it('ignores a percept whose goalId does not match any active goal', () => {
    const percepts = [makePercept({ goalId: 'unknown-goal', goalCongruence: 0.9 })];
    const result = engine.appraise(makeBound(percepts), [makeGoal('g1', 1.0)], []);
    expect(result.goalCongruenceShift).toBe(0);
    expect(result.affectedGoalPriority).toBe(0);
  });

  // ── Novelty / arousal ───────────────────────────────────────────────────────

  it('produces +0.5 arousal shift when all percepts have novelty = 1.0', () => {
    const percepts = [makePercept({ novelty: 1.0 }), makePercept({ novelty: 1.0 })];
    const result = engine.appraise(makeBound(percepts), [], []);
    expect(result.noveltyShift).toBeCloseTo(0.5);
  });

  it('produces −0.5 arousal shift when all percepts have novelty = 0.0', () => {
    const percepts = [makePercept({ novelty: 0.0 }), makePercept({ novelty: 0.0 })];
    const result = engine.appraise(makeBound(percepts), [], []);
    expect(result.noveltyShift).toBeCloseTo(-0.5);
  });

  it('produces zero arousal shift when novelty = 0.5 (default)', () => {
    const percepts = [makePercept({})];
    const result = engine.appraise(makeBound(percepts), [], []);
    expect(result.noveltyShift).toBeCloseTo(0);
  });

  it('averages novelty across multiple percepts', () => {
    const percepts = [
      makePercept({ novelty: 1.0 }),
      makePercept({ novelty: 0.0 }),
    ];
    const result = engine.appraise(makeBound(percepts), [], []);
    // Average novelty = 0.5 → (0.5 − 0.5) = 0.0 arousal shift
    expect(result.noveltyShift).toBeCloseTo(0);
  });

  // ── Value alignment ─────────────────────────────────────────────────────────

  it('adds positive value alignment to valence shift', () => {
    const percepts = [makePercept({ valueAlignment: 0.5 })];
    const result = engine.appraise(makeBound(percepts), [], [makeValue('v1')]);
    expect(result.valueAlignmentShift).toBeCloseTo(0.5);
  });

  it('flags triggersEthicalAttention and forces strong negative shift on value threat', () => {
    const percepts = [makePercept({ valueThreat: true })];
    const result = engine.appraise(makeBound(percepts), [], [makeValue('v1')]);
    expect(result.triggersEthicalAttention).toBe(true);
    expect(result.valueAlignmentShift).toBeLessThanOrEqual(-0.8);
  });

  it('value threat overrides any positive value alignment in the same percept set', () => {
    const percepts = [
      makePercept({ valueAlignment: 0.9 }),
      makePercept({ valueThreat: true }),
    ];
    const result = engine.appraise(makeBound(percepts), [], []);
    expect(result.valueAlignmentShift).toBeLessThanOrEqual(-0.8);
    expect(result.triggersEthicalAttention).toBe(true);
  });

  // ── Composite and bounds ────────────────────────────────────────────────────

  it('clamps netValenceShift to [−1, 1] even with extreme inputs', () => {
    const percepts = [
      makePercept({ goalId: 'g1', goalCongruence: 1.0, valueAlignment: 1.0 }),
    ];
    const result = engine.appraise(makeBound(percepts), [makeGoal('g1', 1.0)], []);
    expect(result.netValenceShift).toBeGreaterThanOrEqual(-1);
    expect(result.netValenceShift).toBeLessThanOrEqual(1);
  });

  it('clamps noveltyShift to [−0.5, 0.5]', () => {
    const percepts = [makePercept({ novelty: 2.0 })];
    const result = engine.appraise(makeBound(percepts), [], []);
    expect(result.noveltyShift).toBeLessThanOrEqual(0.5);
    expect(result.noveltyShift).toBeGreaterThanOrEqual(-0.5);
  });

  // ── reappraise ──────────────────────────────────────────────────────────────

  it('reappraise with alternative goals that exclude the threatened goal → valence near zero', () => {
    const percepts = [makePercept({ goalId: 'g-threatened', goalCongruence: -0.8 })];
    const bound = makeBound(percepts);

    // Original appraisal references the threatened goal
    const original = engine.appraise(bound, [makeGoal('g-threatened', 1.0)], []);
    expect(original.netValenceShift).toBeLessThan(0);

    // Reappraisal with alternative framing that does NOT include the threatened goal
    const reappraised = engine.reappraise(bound, [makeGoal('unrelated-goal', 1.0)]);
    expect(reappraised.netValenceShift).toBeGreaterThan(original.netValenceShift);
  });

  it('reappraise uses the same algorithm as appraise with empty values', () => {
    const percepts = [makePercept({ goalId: 'g1', goalCongruence: 0.5 })];
    const bound = makeBound(percepts);
    const goals = [makeGoal('g1', 0.8)];

    const via_appraise   = engine.appraise(bound, goals, []);
    const via_reappraise = engine.reappraise(bound, goals);

    expect(via_reappraise.goalCongruenceShift).toBeCloseTo(via_appraise.goalCongruenceShift);
    expect(via_reappraise.noveltyShift).toBeCloseTo(via_appraise.noveltyShift);
  });
});
