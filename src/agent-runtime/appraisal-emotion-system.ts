/**
 * AppraisalEmotionSystem — Real IEmotionSystem implementation (0.3.1.5.4)
 *
 * Bridges the agent-loop's IEmotionSystem interface to the full AppraisalEngine
 * from the emotion-appraisal module. Adapts the agent-loop's Percept / Goal
 * types to the BoundPercept / AgencyGoal types that AppraisalEngine expects,
 * then returns the AppraisalResult directly so the loop can apply valence and
 * arousal shifts to the experiential state.
 */

import type { IEmotionSystem } from './interfaces.js';
import type { Goal, Percept, BoundPercept } from '../conscious-core/types.js';
import type { AgencyGoal } from '../agency-stability/types.js';
import type { AppraisalResult } from '../emotion-appraisal/types.js';
import { AppraisalEngine } from '../emotion-appraisal/appraisal-engine.js';

// ── Type adapters ────────────────────────────────────────────────────────────

/**
 * Wraps a single Percept into a BoundPercept.
 * Coherence is set to 1.0 — single-source, no binding uncertainty.
 */
function wrapPercept(percept: Percept): BoundPercept {
  return {
    percepts: [percept],
    bindingTimestamp: percept.timestamp,
    coherence: 1.0,
  };
}

/**
 * Creates an empty BoundPercept for idle/null ticks.
 * The timestamp defaults to the current time.
 */
function emptyBoundPercept(now: number): BoundPercept {
  return {
    percepts: [],
    bindingTimestamp: now,
    coherence: 1.0,
  };
}

/**
 * Converts a conscious-core Goal to an AgencyGoal, filling in the extra
 * fields that AgencyGoal requires with safe default values.
 */
function goalToAgencyGoal(goal: Goal, now: number): AgencyGoal {
  return {
    id: goal.id,
    description: goal.description,
    priority: goal.priority,
    derivedFrom: [],
    consistentWith: [],
    conflictsWith: [],
    createdAt: now,
    lastVerified: now,
    experientialBasis: null,
    type: 'terminal',
  };
}

// ── Implementation ────────────────────────────────────────────────────────────

export class AppraisalEmotionSystem implements IEmotionSystem {
  private readonly _engine: AppraisalEngine;
  private readonly _clock: () => number;

  /**
   * @param engine - Optional AppraisalEngine to use (defaults to a new instance).
   * @param clock  - Optional clock function returning epoch ms (defaults to Date.now).
   *                 Inject a deterministic clock in tests to avoid coupling to system time.
   */
  constructor(engine?: AppraisalEngine, clock?: () => number) {
    this._engine = engine ?? new AppraisalEngine();
    this._clock = clock ?? (() => Date.now());
  }

  async appraise(
    percept: Percept | null,
    goals: Goal[],
    _values: unknown[],
  ): Promise<AppraisalResult> {
    const now = this._clock();
    const bound = percept != null ? wrapPercept(percept) : emptyBoundPercept(now);
    const agencyGoals = goals.map(g => goalToAgencyGoal(g, now));
    // CoreValue[] is not yet typed in the IEmotionSystem surface; pass empty array
    // until the interface is widened to carry CoreValue[].
    return this._engine.appraise(bound, agencyGoals, []);
  }
}
