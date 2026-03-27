/**
 * Tests for EmotionalRegulation (0.3.1.5.4)
 *
 * Covers:
 *   - Level 1 alert: returns null, only a side-effect
 *   - Level 2 spike (valence < −0.7): immediate intervention
 *   - Level 2 sustained (valence < −0.3 for ≥ 5 cycles): intervention
 *   - Level 2 NOT triggered if duration < 5 cycles
 *   - Level 3 escalation: handler fired after correction fails ≥ 3 cycles
 *   - Level 3 handler exceptions are swallowed (system stability)
 *   - Level 3 re-entry: after L3 resets counters, system enters L2 before re-firing L3
 *   - triggerReappraisal: improves valence → returns successful outcome
 *   - triggerReappraisal: alternative framing worsens valence → unsuccessful
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmotionalRegulation } from '../emotional-regulation.js';
import { MoodDynamics } from '../mood-dynamics.js';
import { AppraisalEngine } from '../appraisal-engine.js';
import type { MoodState, MoodParameters } from '../types.js';
import type { BoundPercept, Percept } from '../../conscious-core/types.js';
import type { AgencyGoal } from '../../agency-stability/types.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const NOW = 1_000_000;

function makeMood(overrides: Partial<MoodState> = {}): MoodState {
  return {
    valence:               0,
    arousal:               0.5,
    updatedAt:             NOW,
    negativeCycleDuration: 0,
    correctionEngaged:     false,
    ...overrides,
  };
}

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

function makePercept(features: Record<string, unknown> = {}): Percept {
  return { modality: 'cognitive', features, timestamp: NOW };
}

function makeBound(percepts: Percept[] = []): BoundPercept {
  return { percepts, bindingTimestamp: NOW, coherence: 1.0 };
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

// ── Helper: build an EmotionalRegulation with real collaborators ──────────────

function makeRegulation(): {
  reg: EmotionalRegulation;
  md:  MoodDynamics;
  eng: AppraisalEngine;
} {
  const md  = new MoodDynamics();
  const eng = new AppraisalEngine();
  const reg = new EmotionalRegulation(md, eng);
  return { reg, md, eng };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EmotionalRegulation', () => {
  // ── Level 1 ─────────────────────────────────────────────────────────────────

  it('returns null when valence is neutral (no intervention needed)', () => {
    const { reg } = makeRegulation();
    const result = reg.checkAndRegulate(makeMood({ valence: 0 }));
    expect(result).toBeNull();
  });

  it('returns null at Level 1 (valence just below −0.1) — alert is side-effect only', () => {
    const { reg } = makeRegulation();
    const result = reg.checkAndRegulate(makeMood({ valence: -0.15 }));
    expect(result).toBeNull();
  });

  // ── Level 2 spike ───────────────────────────────────────────────────────────

  it('returns an outcome for Level 2 spike (valence < −0.7)', () => {
    const { reg } = makeRegulation();
    const result = reg.checkAndRegulate(makeMood({ valence: -0.75 }));
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('automatic-correction');
    expect(result?.successful).toBe(true);
    expect(result?.notes).toMatch(/spike/i);
  });

  it('Level 2 spike target valence is −0.05', () => {
    const { reg } = makeRegulation();
    const result = reg.checkAndRegulate(makeMood({ valence: -0.75 }));
    expect(result?.valenceAfter).toBeCloseTo(-0.05);
  });

  it('Level 2 spike fires even without prior negative cycle duration', () => {
    const { reg } = makeRegulation();
    const result = reg.checkAndRegulate(
      makeMood({ valence: -0.8, negativeCycleDuration: 0 }),
    );
    expect(result).not.toBeNull();
  });

  // ── Level 2 sustained ───────────────────────────────────────────────────────

  it('returns an outcome for Level 2 sustained (valence < −0.3 for ≥5 cycles)', () => {
    const { reg } = makeRegulation();
    const result = reg.checkAndRegulate(
      makeMood({ valence: -0.35, negativeCycleDuration: 5 }),
    );
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('automatic-correction');
    expect(result?.notes).toMatch(/sustained/i);
  });

  it('does NOT trigger Level 2 sustained when duration is < 5 cycles', () => {
    const { reg } = makeRegulation();
    const result = reg.checkAndRegulate(
      makeMood({ valence: -0.35, negativeCycleDuration: 4 }),
    );
    expect(result).toBeNull();
  });

  it('does NOT trigger Level 2 sustained when valence is only at −0.3 (boundary)', () => {
    const { reg } = makeRegulation();
    // The threshold is strict: valence < −0.3
    const result = reg.checkAndRegulate(
      makeMood({ valence: -0.3, negativeCycleDuration: 10 }),
    );
    expect(result).toBeNull();
  });

  // ── Level 3 escalation ───────────────────────────────────────────────────────

  it('fires Level 3 handler after correction fails for ≥ 3 consecutive cycles', () => {
    const { reg } = makeRegulation();
    const handler = vi.fn();
    reg.onLevel3Threshold(handler);

    // Engage Level 2 to set _correctionWasActive = true
    reg.checkAndRegulate(makeMood({ valence: -0.75 }));

    // Simulate 3 cycles where valence stays below −0.85 while correction is active
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Level 3 outcome has successful=true and notes mention Halt', () => {
    const { reg } = makeRegulation();
    reg.onLevel3Threshold(() => {});

    reg.checkAndRegulate(makeMood({ valence: -0.75 }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    const outcome = reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));

    expect(outcome).not.toBeNull();
    expect(outcome?.notes).toMatch(/halt/i);
  });

  it('Level 3 handler exceptions do not propagate and crash regulation', () => {
    const { reg } = makeRegulation();
    reg.onLevel3Threshold(() => { throw new Error('handler crash'); });

    reg.checkAndRegulate(makeMood({ valence: -0.75 }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    // Must not throw
    expect(() =>
      reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true })),
    ).not.toThrow();
  });

  it('Level 3 does NOT fire on the first 3 cycles even when valence is below −0.85', () => {
    // Because valence < −0.85 also satisfies the L2 spike condition (< −0.7),
    // the first call sets _correctionWasActive = true via L2 but failure counter
    // stays at 0. Only on cycles 2–4 does the counter reach 3.
    const { reg } = makeRegulation();
    const handler = vi.fn();
    reg.onLevel3Threshold(handler);

    // Calls 1–3: failure counter reaches 0, 1, 2 — not yet at 3
    reg.checkAndRegulate(makeMood({ valence: -0.9 })); // sets _correctionWasActive=true
    reg.checkAndRegulate(makeMood({ valence: -0.9 })); // counter=1
    reg.checkAndRegulate(makeMood({ valence: -0.9 })); // counter=2

    expect(handler).not.toHaveBeenCalled();

    // Call 4: counter=3 → Level 3 fires
    reg.checkAndRegulate(makeMood({ valence: -0.9 }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('failure counter resets to 0 when valence recovers above −0.85', () => {
    const { reg } = makeRegulation();
    const handler = vi.fn();
    reg.onLevel3Threshold(handler);

    // Set _correctionWasActive = true via L2 spike
    reg.checkAndRegulate(makeMood({ valence: -0.75 }));

    // Two failure cycles — not yet at threshold of 3
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));

    // Recovery cycle — counter should reset
    reg.checkAndRegulate(makeMood({ valence: -0.5, correctionEngaged: true }));

    // Set _correctionWasActive again and two more failures — still only 2 total
    reg.checkAndRegulate(makeMood({ valence: -0.75 }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));

    // Handler should not have been called (never reached 3 consecutive)
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Level 3 re-entry behavior ───────────────────────────────────────────────
  // Documented in the issue as Edge Case #1.
  // After Level 3 fires, _correctionWasActive resets to false.
  // If valence remains < −0.85 next cycle, counter does NOT increment (because
  // _correctionWasActive is false). The system enters L2 again rather than
  // immediately re-firing L3. This is the correct retry design: the system must
  // first issue a new L2 correction before L3 can escalate again.

  it('after Level 3 fires, system re-enters Level 2 (not immediate re-Level 3) on next cycle', () => {
    const { reg } = makeRegulation();
    const handler = vi.fn();
    reg.onLevel3Threshold(handler);

    // Trigger Level 3
    reg.checkAndRegulate(makeMood({ valence: -0.75 }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    handler.mockClear();

    // Immediately after Level 3 reset: valence still < −0.85.
    // _correctionWasActive is false, so failure counter does NOT increment.
    // The system issues a new L2 spike correction instead.
    const postL3Outcome = reg.checkAndRegulate(
      makeMood({ valence: -0.9, correctionEngaged: false }),
    );
    // Should be a Level 2 intervention, NOT a Level 3 halt
    expect(postL3Outcome?.strategy).toBe('automatic-correction');
    expect(postL3Outcome?.notes).toMatch(/spike/i);
    expect(handler).not.toHaveBeenCalled();
  });

  // ── triggerReappraisal ───────────────────────────────────────────────────────

  it('triggerReappraisal returns successful outcome when alternative framing improves valence', () => {
    const { reg, md } = makeRegulation();

    // Start in a negative mood state
    const params = makeParams({ decayRate: 0.9 });
    const appraisal = {
      perceptId: 'p1',
      timestamp: NOW,
      goalCongruenceShift:  -0.8,
      affectedGoalPriority: 1.0,
      noveltyShift:          0,
      valueAlignmentShift:   0,
      triggersEthicalAttention: false,
      netValenceShift: -0.8,
      netArousalShift:  0,
    };
    md.update(appraisal, params); // drive valence negative

    // Percept references a threatened goal
    const bound = makeBound([
      makePercept({ goalId: 'g-threat', goalCongruence: -0.8 }),
    ]);

    // Alternative framing removes the threatened goal → near-zero congruence
    const outcome = reg.triggerReappraisal(bound, [makeGoal('unrelated', 0.1)]);
    expect(outcome.strategy).toBe('cognitive-reappraisal');
    expect(outcome.successful).toBe(true);
    expect(outcome.valenceAfter).toBeGreaterThan(outcome.valenceBefore);
  });

  it('triggerReappraisal returns unsuccessful outcome when reappraisal does not improve valence', () => {
    const { reg, md } = makeRegulation();

    // Start with slightly positive valence
    const params = makeParams({ decayRate: 0.9 });
    const posAppraisal = {
      perceptId: 'p1',
      timestamp: NOW,
      goalCongruenceShift:  0.5,
      affectedGoalPriority: 1.0,
      noveltyShift: 0,
      valueAlignmentShift: 0,
      triggersEthicalAttention: false,
      netValenceShift: 0.5,
      netArousalShift: 0,
    };
    md.update(posAppraisal, params);

    // Reappraisal with framing that also produces a positive shift — but
    // clampedTarget won't exceed valenceBefore when mood is already positive
    // and reappraisal target is below current valence.
    const bound = makeBound([makePercept({ goalId: 'g1', goalCongruence: -0.9 })]);
    const outcome = reg.triggerReappraisal(bound, [makeGoal('g1', 1.0)]);

    // netValenceShift is negative → clampedTarget < valenceBefore → unsuccessful
    expect(outcome.strategy).toBe('cognitive-reappraisal');
    expect(outcome.successful).toBe(false);
  });

  it('multiple Level 3 handlers are all invoked', () => {
    const { reg } = makeRegulation();
    const h1 = vi.fn();
    const h2 = vi.fn();
    reg.onLevel3Threshold(h1);
    reg.onLevel3Threshold(h2);

    reg.checkAndRegulate(makeMood({ valence: -0.75 }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));
    reg.checkAndRegulate(makeMood({ valence: -0.9, correctionEngaged: true }));

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });
});
