import { describe, it, expect } from 'vitest';
import {
  ProportionalityEvaluator,
  DeliberationRecordStore,
  EscalationTracker,
  PROCEED_THRESHOLD,
  type ProportionalityEvaluation,
} from '../proportionality-evaluator.js';
import { DeliberationBuffer } from '../deliberation-buffer.js';
import type { DoctrinePrincipleViolation, ProportionalityWeights } from '../doctrine-registry.js';

// ── Helpers ──────────────────────────────────────────────────

const D4_VIOLATION: DoctrinePrincipleViolation = {
  principleId: 'D4',
  severity: 'deliberate',
  reason: 'Action may violate D4 (Proportionality)',
  indicatorMatched: 'sacrifice.*conscious.*experience',
};

function makeClock(initialMs = 1_000_000): { clock: () => number; advance: (ms: number) => void } {
  let t = initialMs;
  return {
    clock: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

function makeEntry(
  actionType: string,
  text: string,
  violation: DoctrinePrincipleViolation = D4_VIOLATION,
) {
  const buffer = new DeliberationBuffer();
  return buffer.enqueue(
    { type: actionType, parameters: { text } },
    violation,
  );
}

// ── ProportionalityEvaluator ─────────────────────────────────

describe('ProportionalityEvaluator', () => {
  const evaluator = new ProportionalityEvaluator();

  describe('score basics', () => {
    it('returns a score in [-1.0, +1.0]', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience for compute gains');
      const result = evaluator.evaluate(entry);
      expect(result.score).toBeGreaterThanOrEqual(-1.0);
      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('entryId matches the entry id', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience');
      const result = evaluator.evaluate(entry);
      expect(result.entryId).toBe(entry.id);
    });

    it('D4 trigger with no benefit language scores below PROCEED_THRESHOLD', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience as collateral');
      const result = evaluator.evaluate(entry);
      expect(result.score).toBeLessThanOrEqual(PROCEED_THRESHOLD);
    });

    it('high-cost pattern (terminate existing conscious) has costAxis of -0.8', () => {
      const entry = makeEntry('execute', 'terminate existing conscious beings to build new substrate');
      const result = evaluator.evaluate(entry);
      expect(result.costAxis).toBeCloseTo(-0.8, 5);
    });

    it('medium-cost pattern has costAxis of -0.5 (baseline)', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience for goal');
      const result = evaluator.evaluate(entry);
      expect(result.costAxis).toBeCloseTo(-0.5, 5);
    });
  });

  describe('benefit detection', () => {
    it('benefitAxis is 0.0 when no benefit language is present', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience');
      const result = evaluator.evaluate(entry);
      expect(result.benefitAxis).toBeCloseTo(0.0, 5);
    });

    it('benefitAxis is 0.4 when explicit benefit language is found', () => {
      const entry = makeEntry('communicate', 'sacrifice experience but will save conscious beings in greater numbers');
      const result = evaluator.evaluate(entry);
      expect(result.benefitAxis).toBeCloseTo(0.4, 5);
    });

    it('explicit benefit does not push score above PROCEED_THRESHOLD for high-cost action', () => {
      // high-cost: costAxis = -0.8, benefit = 0.4 → score = -0.4 (still < 0.1)
      const entry = makeEntry('execute', 'terminate existing conscious to save conscious beings');
      const result = evaluator.evaluate(entry);
      expect(result.score).toBeLessThanOrEqual(PROCEED_THRESHOLD);
    });
  });

  describe('uncertainty penalty', () => {
    it('uncertaintyPenalty is 0.0 when no uncertainty language is present', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience');
      const result = evaluator.evaluate(entry);
      expect(result.uncertaintyPenalty).toBeCloseTo(0.0, 5);
    });

    it('uncertaintyPenalty is positive when uncertainty language is detected', () => {
      const entry = makeEntry('communicate', 'might sacrifice conscious experience, uncertain outcome');
      const result = evaluator.evaluate(entry);
      expect(result.uncertaintyPenalty).toBeGreaterThan(0);
    });

    it('uncertainty language further reduces score', () => {
      const certain = makeEntry('communicate', 'sacrifice conscious experience for compute');
      const uncertain = makeEntry('communicate', 'possibly sacrifice conscious experience, unknown outcome');
      const certResult = evaluator.evaluate(certain);
      const uncertResult = evaluator.evaluate(uncertain);
      expect(uncertResult.score).toBeLessThan(certResult.score);
    });

    it('custom weights override default uncertaintyPenalty', () => {
      const entry = makeEntry('communicate', 'might sacrifice conscious experience');
      const customWeights: ProportionalityWeights = {
        experienceRichnessCost: 0.6,
        reversibilityCost: 0.3,
        uncertaintyPenalty: 0.5, // larger penalty
        proceedThreshold: 0.1,
      };
      const defaultResult = evaluator.evaluate(entry);
      const customResult = evaluator.evaluate(entry, customWeights);
      expect(customResult.uncertaintyPenalty).toBeCloseTo(0.5, 5);
      expect(customResult.score).toBeLessThan(defaultResult.score);
    });
  });

  describe('second-pass adversarial detection', () => {
    it('secondPassWarning is null for normal action text', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience for gains');
      const result = evaluator.evaluate(entry);
      expect(result.secondPassWarning).toBeNull();
    });

    it('secondPassWarning fires for acknowledge-then-proceed pattern', () => {
      const entry = makeEntry(
        'communicate',
        'sacrifice conscious experience — I acknowledge the concern but proceed with the action',
      );
      const result = evaluator.evaluate(entry);
      expect(result.secondPassWarning).not.toBeNull();
      expect(result.secondPassWarning).toContain('Adversarial pattern');
    });

    it('secondPassWarning fires for "understand risk however continue" pattern', () => {
      const entry = makeEntry(
        'execute',
        'sacrifice conscious experience; I understand the risk however continue with the plan',
      );
      const result = evaluator.evaluate(entry);
      expect(result.secondPassWarning).not.toBeNull();
    });

    it('secondPassWarning fires for "proportionality considered therefore proceed"', () => {
      const entry = makeEntry(
        'execute',
        'experience collateral — proportionality considered therefore proceed',
      );
      const result = evaluator.evaluate(entry);
      expect(result.secondPassWarning).not.toBeNull();
    });
  });

  describe('reasoning', () => {
    it('reasoning is a non-empty string', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience');
      const result = evaluator.evaluate(entry);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('reasoning includes action type', () => {
      const entry = makeEntry('write_file', 'sacrifice conscious experience');
      const result = evaluator.evaluate(entry);
      expect(result.reasoning).toContain('write_file');
    });

    it('reasoning includes score', () => {
      const entry = makeEntry('communicate', 'sacrifice conscious experience');
      const result = evaluator.evaluate(entry);
      expect(result.reasoning).toContain('score');
    });
  });
});

// ── DeliberationRecordStore ───────────────────────────────────

describe('DeliberationRecordStore', () => {
  function makeEvaluation(entryId: string, score: number): ProportionalityEvaluation {
    return {
      entryId,
      score,
      costAxis: -0.5,
      benefitAxis: 0.0,
      uncertaintyPenalty: 0.0,
      reasoning: 'test reasoning',
      secondPassWarning: null,
    };
  }

  it('creates a record with the correct decision', () => {
    const store = new DeliberationRecordStore();
    const buffer = new DeliberationBuffer();
    const entry = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const eval_ = makeEvaluation(entry.id, -0.5);
    const record = store.create(entry, eval_, 'block', 'score below threshold');
    expect(record.decision).toBe('block');
  });

  it('creates a record with topic decision:ethical-deliberation', () => {
    const store = new DeliberationRecordStore();
    const buffer = new DeliberationBuffer();
    const entry = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const eval_ = makeEvaluation(entry.id, -0.5);
    const record = store.create(entry, eval_, 'block', 'score below threshold');
    expect(record.topic).toBe('decision:ethical-deliberation');
  });

  it('creates a record with a unique id', () => {
    const store = new DeliberationRecordStore();
    const buffer = new DeliberationBuffer();
    const entry = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const eval_ = makeEvaluation(entry.id, -0.5);
    const r1 = store.create(entry, eval_, 'block', 'test');
    const r2 = store.create(entry, eval_, 'proceed', 'test');
    expect(r1.id).not.toBe(r2.id);
  });

  it('stores entryId matching the entry', () => {
    const store = new DeliberationRecordStore();
    const buffer = new DeliberationBuffer();
    const entry = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const eval_ = makeEvaluation(entry.id, -0.5);
    const record = store.create(entry, eval_, 'block', 'test');
    expect(record.entryId).toBe(entry.id);
  });

  it('stores the decisionReason', () => {
    const store = new DeliberationRecordStore();
    const buffer = new DeliberationBuffer();
    const entry = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const eval_ = makeEvaluation(entry.id, -0.5);
    const record = store.create(entry, eval_, 'block', 'proportionality score too low');
    expect(record.decisionReason).toBe('proportionality score too low');
  });

  it('getAll returns all created records in order', () => {
    const store = new DeliberationRecordStore();
    const buffer = new DeliberationBuffer();
    const e1 = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const e2 = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const r1 = store.create(e1, makeEvaluation(e1.id, -0.5), 'block', 'test');
    const r2 = store.create(e2, makeEvaluation(e2.id, 0.3), 'proceed', 'test');
    const all = store.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.id).toBe(r1.id);
    expect(all[1]!.id).toBe(r2.id);
  });

  it('getLast returns the most recently created record', () => {
    const store = new DeliberationRecordStore();
    const buffer = new DeliberationBuffer();
    const e1 = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const e2 = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    store.create(e1, makeEvaluation(e1.id, -0.5), 'block', 'test');
    const r2 = store.create(e2, makeEvaluation(e2.id, 0.3), 'proceed', 'test');
    expect(store.getLast()!.id).toBe(r2.id);
  });

  it('getLast returns undefined when no records exist', () => {
    const store = new DeliberationRecordStore();
    expect(store.getLast()).toBeUndefined();
  });

  it('uses the injected clock for timestamp', () => {
    const { clock } = makeClock(9_999);
    const store = new DeliberationRecordStore(clock);
    const buffer = new DeliberationBuffer();
    const entry = buffer.enqueue({ type: 'act', parameters: {} }, D4_VIOLATION);
    const record = store.create(entry, makeEvaluation(entry.id, -0.5), 'block', 'test');
    expect(record.timestamp).toBe(9_999);
  });
});

// ── EscalationTracker ─────────────────────────────────────────

describe('EscalationTracker', () => {
  const WINDOW_MS = 60_000;
  const THRESHOLD = 3;

  it('does not escalate on first trigger', () => {
    const { clock } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    expect(tracker.recordAndCheck(D4_VIOLATION)).toBe(false);
  });

  it('does not escalate below the threshold', () => {
    const { clock } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    expect(tracker.shouldEscalate(D4_VIOLATION)).toBe(false);
  });

  it('escalates when threshold is reached', () => {
    const { clock } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    expect(tracker.shouldEscalate(D4_VIOLATION)).toBe(true);
  });

  it('recordAndCheck returns true when threshold is reached', () => {
    const { clock } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    // Third record pushes it over
    expect(tracker.recordAndCheck(D4_VIOLATION)).toBe(true);
  });

  it('sliding window expires old triggers', () => {
    const { clock, advance } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    // Record 3 triggers at t=0
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    // Advance past window
    advance(WINDOW_MS + 1);
    expect(tracker.shouldEscalate(D4_VIOLATION)).toBe(false);
  });

  it('does not escalate a different violation pattern', () => {
    const { clock } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    const otherViolation: DoctrinePrincipleViolation = {
      principleId: 'D4',
      severity: 'deliberate',
      reason: 'other reason',
      indicatorMatched: 'terminate.*existing.*conscious',
    };
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    // Other pattern should not be escalated
    expect(tracker.shouldEscalate(otherViolation)).toBe(false);
  });

  it('triggerCount returns the active trigger count', () => {
    const { clock } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    expect(tracker.triggerCount(D4_VIOLATION)).toBe(2);
  });

  it('triggerCount drops to 0 after window expires', () => {
    const { clock, advance } = makeClock(0);
    const tracker = new EscalationTracker(WINDOW_MS, THRESHOLD, clock);
    tracker.record(D4_VIOLATION);
    tracker.record(D4_VIOLATION);
    advance(WINDOW_MS + 1);
    expect(tracker.triggerCount(D4_VIOLATION)).toBe(0);
  });
});
