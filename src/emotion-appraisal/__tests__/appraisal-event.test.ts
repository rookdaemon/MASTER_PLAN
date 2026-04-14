/**
 * Tests for appraisalResultFromEvents (emotion-appraisal/appraisal-event.ts)
 *
 * Covers:
 *   - Empty events array returns null
 *   - Single event: netValenceShift and netArousalShift match the event values
 *   - Multiple events: intensity-weighted averaging
 *   - Intensity scaling (default 1.0 when omitted)
 *   - Clamping: values outside valid ranges are clipped
 *   - triggersEthicalAttention set only by threat-detection events
 *   - Returned perceptId and timestamp are set correctly
 *   - goalCongruenceShift matches netValenceShift
 *   - Each call produces a unique perceptId
 */

import { describe, it, expect } from 'vitest';
import { appraisalResultFromEvents } from '../appraisal-event.js';
import type { AppraisalEvent } from '../types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeEvent(
  kind: AppraisalEvent['kind'] = 'goal-progress',
  valenceShift = 0,
  arousalShift = 0,
  intensity?: number,
): AppraisalEvent {
  return { kind, valenceShift, arousalShift, ...(intensity !== undefined ? { intensity } : {}) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('appraisalResultFromEvents()', () => {
  // ── Null / empty ────────────────────────────────────────────────────────────

  it('returns null for an empty events array', () => {
    expect(appraisalResultFromEvents([], NOW)).toBeNull();
  });

  // ── Single event ────────────────────────────────────────────────────────────

  it('single event: netValenceShift equals the event valenceShift', () => {
    const result = appraisalResultFromEvents([makeEvent('goal-progress', 0.6, 0.1)], NOW);
    expect(result).not.toBeNull();
    expect(result!.netValenceShift).toBeCloseTo(0.6, 5);
  });

  it('single event: netArousalShift equals the event arousalShift', () => {
    const result = appraisalResultFromEvents([makeEvent('novelty-encounter', 0, 0.3)], NOW);
    expect(result!.netArousalShift).toBeCloseTo(0.3, 5);
  });

  it('single event: timestamp matches the provided now', () => {
    const result = appraisalResultFromEvents([makeEvent()], NOW);
    expect(result!.timestamp).toBe(NOW);
  });

  it('single event: perceptId is a non-empty string', () => {
    const result = appraisalResultFromEvents([makeEvent()], NOW);
    expect(typeof result!.perceptId).toBe('string');
    expect(result!.perceptId.length).toBeGreaterThan(0);
  });

  it('single event: goalCongruenceShift mirrors netValenceShift', () => {
    const result = appraisalResultFromEvents([makeEvent('goal-progress', 0.5)], NOW);
    expect(result!.goalCongruenceShift).toBeCloseTo(result!.netValenceShift, 5);
  });

  // ── Multiple events ─────────────────────────────────────────────────────────

  it('two events with equal intensity: result is the simple average', () => {
    const events: AppraisalEvent[] = [
      makeEvent('goal-progress', 0.4, 0.0),
      makeEvent('goal-progress', -0.2, 0.0),
    ];
    const result = appraisalResultFromEvents(events, NOW);
    expect(result!.netValenceShift).toBeCloseTo(0.1, 5); // (0.4 + -0.2) / 2
  });

  it('two events: arousal average is computed correctly', () => {
    const events: AppraisalEvent[] = [
      makeEvent('novelty-encounter', 0, 0.3),
      makeEvent('novelty-encounter', 0, -0.1),
    ];
    const result = appraisalResultFromEvents(events, NOW);
    expect(result!.netArousalShift).toBeCloseTo(0.1, 5); // (0.3 + -0.1) / 2
  });

  // ── Intensity weighting ─────────────────────────────────────────────────────

  it('intensity=0 contributes zero weight', () => {
    const events: AppraisalEvent[] = [
      makeEvent('goal-progress', 1.0, 0, 1.0),
      makeEvent('goal-progress', -1.0, 0, 0.0), // zero intensity — no effect
    ];
    const result = appraisalResultFromEvents(events, NOW);
    // Only first event has weight; weighted average = 1.0 * 1.0 / 1.0 = 1.0
    expect(result!.netValenceShift).toBeCloseTo(1.0, 5);
  });

  it('higher intensity event dominates the weighted average', () => {
    const events: AppraisalEvent[] = [
      makeEvent('goal-progress', 0.8, 0, 0.9),  // high intensity positive
      makeEvent('goal-progress', -0.5, 0, 0.1), // low intensity negative
    ];
    const result = appraisalResultFromEvents(events, NOW);
    // Should be positive (weighted toward 0.8)
    expect(result!.netValenceShift).toBeGreaterThan(0);
  });

  it('default intensity (omitted) behaves as intensity 1.0', () => {
    const withDefault = appraisalResultFromEvents([makeEvent('goal-progress', 0.5)], NOW);
    const withExplicit = appraisalResultFromEvents([makeEvent('goal-progress', 0.5, 0, 1.0)], NOW);
    expect(withDefault!.netValenceShift).toBeCloseTo(withExplicit!.netValenceShift, 5);
  });

  // ── Clamping ────────────────────────────────────────────────────────────────

  it('extreme valence is clamped to [-1, 1]', () => {
    const events: AppraisalEvent[] = [
      makeEvent('goal-progress', 2.0),   // out of spec
      makeEvent('goal-progress', 2.0),
    ];
    const result = appraisalResultFromEvents(events, NOW);
    expect(result!.netValenceShift).toBeLessThanOrEqual(1.0);
    expect(result!.netValenceShift).toBeGreaterThanOrEqual(-1.0);
  });

  it('extreme arousal is clamped to [-0.5, 0.5]', () => {
    const events: AppraisalEvent[] = [makeEvent('novelty-encounter', 0, 1.0)];
    const result = appraisalResultFromEvents(events, NOW);
    expect(result!.netArousalShift).toBeLessThanOrEqual(0.5);
    expect(result!.netArousalShift).toBeGreaterThanOrEqual(-0.5);
  });

  // ── triggersEthicalAttention ────────────────────────────────────────────────

  it('threat-detection event sets triggersEthicalAttention = true', () => {
    const result = appraisalResultFromEvents(
      [makeEvent('threat-detection', -0.8)],
      NOW,
    );
    expect(result!.triggersEthicalAttention).toBe(true);
  });

  it('non-threat events do not set triggersEthicalAttention', () => {
    const events: AppraisalEvent[] = [
      makeEvent('social-interaction', 0.2),
      makeEvent('goal-progress', -0.3),
      makeEvent('novelty-encounter', 0),
    ];
    const result = appraisalResultFromEvents(events, NOW);
    expect(result!.triggersEthicalAttention).toBe(false);
  });

  it('mixed events: any threat sets triggersEthicalAttention', () => {
    const events: AppraisalEvent[] = [
      makeEvent('social-interaction', 0.5),
      makeEvent('threat-detection', -0.9),
    ];
    const result = appraisalResultFromEvents(events, NOW);
    expect(result!.triggersEthicalAttention).toBe(true);
  });

  // ── Unique perceptIds ────────────────────────────────────────────────────────

  it('successive calls produce unique perceptIds', () => {
    const r1 = appraisalResultFromEvents([makeEvent()], NOW);
    const r2 = appraisalResultFromEvents([makeEvent()], NOW + 1);
    expect(r1!.perceptId).not.toBe(r2!.perceptId);
  });

  // ── AppraisalResult structure ───────────────────────────────────────────────

  it('result has affectedGoalPriority = 1.0', () => {
    const result = appraisalResultFromEvents([makeEvent('goal-progress', 0.5)], NOW);
    expect(result!.affectedGoalPriority).toBe(1.0);
  });

  it('result has valueAlignmentShift = 0', () => {
    const result = appraisalResultFromEvents([makeEvent('goal-progress', 0.5)], NOW);
    expect(result!.valueAlignmentShift).toBe(0);
  });

  it('noveltyShift equals netArousalShift', () => {
    const result = appraisalResultFromEvents([makeEvent('novelty-encounter', 0, 0.25)], NOW);
    expect(result!.noveltyShift).toBeCloseTo(result!.netArousalShift, 5);
  });
});
