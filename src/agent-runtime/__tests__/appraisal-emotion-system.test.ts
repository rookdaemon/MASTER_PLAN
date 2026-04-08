/**
 * Tests for AppraisalEmotionSystem (0.3.1.5.4)
 *
 * Covers:
 *   - Null percept → zero shifts (neutral appraisal)
 *   - Valid percept with goal-congruent features → positive valence shift
 *   - Valid percept with goal-incongruent features → negative valence shift
 *   - Novel percept → positive arousal shift
 *   - Familiar percept → negative arousal shift
 *   - Value-threat percept → strong negative valence shift
 *   - Goals passed through correctly (priority weighting)
 */

import { describe, it, expect } from 'vitest';
import { AppraisalEmotionSystem } from '../appraisal-emotion-system.js';
import type { Percept, Goal } from '../../conscious-core/types.js';
import type { AppraisalResult } from '../../emotion-appraisal/types.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const NOW = 2_000_000;

function makePercept(features: Record<string, unknown> = {}): Percept {
  return { modality: 'text', features, timestamp: NOW };
}

function makeGoal(id: string, priority: number): Goal {
  return { id, description: `goal-${id}`, priority };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const FIXED_NOW = 3_000_000;
const fixedClock = () => FIXED_NOW;

describe('AppraisalEmotionSystem', () => {
  describe('null percept', () => {
    it('returns zero net shifts when percept is null', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const result = await system.appraise(null, [], []) as AppraisalResult;
      expect(result.netValenceShift).toBe(0);
      expect(result.netArousalShift).toBe(0);
    });

    it('returns a structurally valid AppraisalResult for null percept', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const result = await system.appraise(null, [], []) as AppraisalResult;
      expect(result).toHaveProperty('perceptId');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('goalCongruenceShift');
      expect(result).toHaveProperty('noveltyShift');
      expect(result).toHaveProperty('valueAlignmentShift');
      expect(result).toHaveProperty('netValenceShift');
      expect(result).toHaveProperty('netArousalShift');
    });
  });

  describe('goal congruence', () => {
    it('positive goalCongruence → positive netValenceShift', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const goal = makeGoal('goal-1', 1.0);
      const percept = makePercept({ goalId: 'goal-1', goalCongruence: 0.8, novelty: 0.5 });
      const result = await system.appraise(percept, [goal], []) as AppraisalResult;
      expect(result.netValenceShift).toBeGreaterThan(0);
    });

    it('negative goalCongruence → negative netValenceShift', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const goal = makeGoal('goal-2', 1.0);
      const percept = makePercept({ goalId: 'goal-2', goalCongruence: -0.8, novelty: 0.5 });
      const result = await system.appraise(percept, [goal], []) as AppraisalResult;
      expect(result.netValenceShift).toBeLessThan(0);
    });

    it('goal priority scales the valence shift magnitude', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const highPriorityGoal = makeGoal('goal-hi', 1.0);
      const lowPriorityGoal = makeGoal('goal-lo', 0.1);
      const congruence = 0.5;

      const hi = await system.appraise(
        makePercept({ goalId: 'goal-hi', goalCongruence: congruence, novelty: 0.5 }),
        [highPriorityGoal],
        [],
      ) as AppraisalResult;

      const lo = await system.appraise(
        makePercept({ goalId: 'goal-lo', goalCongruence: congruence, novelty: 0.5 }),
        [lowPriorityGoal],
        [],
      ) as AppraisalResult;

      expect(Math.abs(hi.netValenceShift)).toBeGreaterThan(Math.abs(lo.netValenceShift));
    });

    it('percept with no matching goal id → zero goal shift', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const goal = makeGoal('goal-x', 1.0);
      const percept = makePercept({ goalId: 'goal-unrelated', goalCongruence: 1.0, novelty: 0.5 });
      const result = await system.appraise(percept, [goal], []) as AppraisalResult;
      expect(result.goalCongruenceShift).toBe(0);
    });
  });

  describe('novelty / arousal', () => {
    it('novel percept → positive arousal shift', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const percept = makePercept({ novelty: 1.0 });
      const result = await system.appraise(percept, [], []) as AppraisalResult;
      expect(result.netArousalShift).toBeGreaterThan(0);
    });

    it('familiar percept → negative arousal shift', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const percept = makePercept({ novelty: 0.0 });
      const result = await system.appraise(percept, [], []) as AppraisalResult;
      expect(result.netArousalShift).toBeLessThan(0);
    });

    it('neutral novelty (0.5) → zero arousal shift', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const percept = makePercept({ novelty: 0.5 });
      const result = await system.appraise(percept, [], []) as AppraisalResult;
      expect(result.netArousalShift).toBeCloseTo(0);
    });
  });

  describe('value alignment', () => {
    it('value-threat percept → strong negative valence shift', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const percept = makePercept({ valueThreat: true, novelty: 0.5 });
      const result = await system.appraise(percept, [], []) as AppraisalResult;
      expect(result.netValenceShift).toBeLessThan(-0.5);
      expect(result.triggersEthicalAttention).toBe(true);
    });
  });

  describe('output bounds', () => {
    it('netValenceShift is clamped to [-1, 1]', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const goal = makeGoal('g', 1.0);
      const percept = makePercept({ goalId: 'g', goalCongruence: 1.0, valueThreat: false, valueAlignment: 1.0, novelty: 0.5 });
      const result = await system.appraise(percept, [goal], []) as AppraisalResult;
      expect(result.netValenceShift).toBeGreaterThanOrEqual(-1);
      expect(result.netValenceShift).toBeLessThanOrEqual(1);
    });

    it('netArousalShift is clamped to [-0.5, 0.5]', async () => {
      const system = new AppraisalEmotionSystem(undefined, fixedClock);
      const percept = makePercept({ novelty: 1.0 });
      const result = await system.appraise(percept, [], []) as AppraisalResult;
      expect(result.netArousalShift).toBeGreaterThanOrEqual(-0.5);
      expect(result.netArousalShift).toBeLessThanOrEqual(0.5);
    });
  });

  describe('custom engine injection', () => {
    it('accepts an injected AppraisalEngine for testability', async () => {
      const { AppraisalEngine } = await import('../../emotion-appraisal/appraisal-engine.js');
      const engine = new AppraisalEngine();
      const system = new AppraisalEmotionSystem(engine, fixedClock);
      const result = await system.appraise(null, [], []) as AppraisalResult;
      expect(result.netValenceShift).toBe(0);
    });
  });
});
