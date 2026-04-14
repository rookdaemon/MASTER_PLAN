/**
 * Data types for Emotion and Appraisal Dynamics (0.3.1.5.4)
 *
 * All emotional state is dimensional (valence/arousal), never categorical.
 * These types implement the data model specified in
 * docs/emotion-and-appraisal/ARCHITECTURE.md §3.
 */

import type { Timestamp } from '../conscious-core/types.js';

export type { Timestamp };

// ── Appraisal ────────────────────────────────────────────────────────────────

/**
 * The output of appraising a single percept against the agent's current
 * goals and values. All fields are dimensional (no discrete emotion labels).
 */
export interface AppraisalResult {
  readonly perceptId: string;
  readonly timestamp: Timestamp;

  // Valence shift caused by goal (in)congruence. Range: −1..1.
  // Positive = goal-congruent; negative = goal-incongruent.
  readonly goalCongruenceShift: number;

  // Priority of the most-affected active goal (scales magnitude).
  readonly affectedGoalPriority: number;

  // Arousal shift caused by novelty/surprise. Range: −0.5..0.5.
  // Positive = novel/unexpected; negative = familiar/predicted.
  readonly noveltyShift: number;

  // Valence reinforcement from value alignment. Range: −1..1.
  // Positive = value-aligned; negative = value-threatening.
  readonly valueAlignmentShift: number;

  // True if this percept is value-threatening at a level that should
  // escalate to ethical deliberation attention.
  readonly triggersEthicalAttention: boolean;

  // Net composite shifts (clamped to valid range before application).
  readonly netValenceShift: number;   // sum of goal + value contributions
  readonly netArousalShift: number;   // novelty contribution
}

// ── Mood ─────────────────────────────────────────────────────────────────────

/**
 * The agent's current mood — an exponentially weighted moving average
 * of recent valence and arousal values.
 */
export interface MoodState {
  readonly valence: number;   // −1..1
  readonly arousal: number;   // 0..1
  readonly updatedAt: Timestamp;

  // How many consecutive cycles this mood has been below the Level 1 threshold.
  readonly negativeCycleDuration: number;

  // Whether automatic valence correction is currently engaged.
  readonly correctionEngaged: boolean;
}

/**
 * Parameters that govern how mood dynamics behave for a specific agent.
 * Sourced from the Personality subsystem (0.3.1.5.2).
 */
export interface MoodParameters {
  // Exponential decay factor per cycle. Higher = faster mood shifts.
  // Maps directly from the Volatility personality dimension.
  // Range: 0.0 (maximally stable) to 1.0 (maximally volatile).
  readonly decayRate: number;

  // Minimum valence allowed by safety bounds. Must be ≥ Level 2 threshold.
  readonly valenceFloor: number;

  // Maximum valence ceiling.
  readonly valenceCeiling: number;

  // Arousal floor and ceiling.
  readonly arousalFloor: number;
  readonly arousalCeiling: number;
}

// ── Emotional Influence ───────────────────────────────────────────────────────

/**
 * A vector of influence coefficients derived from current mood, exposed
 * to other subsystems so they can modulate their behavior.
 *
 * All values are signed scalars intended to be applied as multiplicative
 * or additive adjustments at each subsystem's discretion.
 */
export interface EmotionalInfluenceVector {
  readonly mood: MoodState;
  readonly timestamp: Timestamp;

  // Deliberation: positive mood → higher confidence bias (range: −0.3..+0.3)
  readonly deliberationConfidenceBias: number;

  // Deliberation: negative mood → more alternatives considered (range: 0..1,
  // where 1 = consider all alternatives, 0 = consider none beyond top choice)
  readonly alternativesExpansionFactor: number;

  // Memory: mood-congruent recall bias (range: −1..1, sign matches mood valence)
  readonly memoryValenceBias: number;

  // Risk: high arousal → more conservative action selection (range: 0..1)
  readonly riskConservatismFactor: number;

  // Communication: tonal influence on language generation (range: −1..1)
  readonly communicationToneBias: number;
}

// ── Regulation ───────────────────────────────────────────────────────────────

/**
 * The result of an emotional regulation attempt.
 */
export interface RegulationOutcome {
  readonly strategy: 'cognitive-reappraisal' | 'attention-redirection' | 'automatic-correction';
  readonly appliedAt: Timestamp;
  readonly valenceBefore: number;
  readonly valenceAfter: number;
  readonly successful: boolean;
  readonly notes: string;
}

// ── ValenceMonitor types (implements §3.2.1 of safe-experiential-design-framework.md) ──

export interface ValenceState {
  readonly valence: number;    // −1..1
  readonly arousal: number;    // 0..1
  readonly confidence: number; // 0..1 — measurement certainty
  readonly timestamp: Timestamp;
}

export interface ValenceTrace {
  readonly windowStart: Timestamp;
  readonly windowEnd: Timestamp;
  readonly samples: ValenceState[];
  readonly averageValence: number;
  readonly minValence: number;
  readonly maxValence: number;
}

export interface SufferingModality {
  readonly name: string;          // e.g. "goal-incongruence-distress", "value-threat-spike"
  readonly intensity: number;     // 0..1
  readonly durationCycles: number;
}

export interface SufferingReport {
  readonly activeModalities: SufferingModality[];
  readonly highestIntensity: number;
  readonly mitigationEngaged: boolean;
  readonly timestamp: Timestamp;
}

export interface IntegrityState {
  readonly experientialCoherence: number;  // 0..1
  readonly continuityStatus: 'intact' | 'gap-detected' | 'fragmented';
  readonly integrationLevel: number;       // 0..1 relative to design spec
  readonly timestamp: Timestamp;
}

// ── AppraisalEvent ────────────────────────────────────────────────────────────

/**
 * Semantic category of an appraisal event.
 *
 * Used by upstream systems (cognitive-agent, simulated-agent, simulation world)
 * to classify stimuli before they are aggregated into an AppraisalResult and
 * fed into MoodDynamics.
 */
export type AppraisalEventKind =
  | 'social-interaction'   // Positive or negative social contact
  | 'goal-progress'        // Advancement toward or away from a goal
  | 'threat-detection'     // Perceived danger or harm signal
  | 'novelty-encounter';   // Unexpected or novel stimulus

/**
 * A lightweight, modality-agnostic event that can be translated into an
 * AppraisalResult without requiring a full BoundPercept or active goal list.
 *
 * Used by:
 *   - CognitiveAgent.tick() (NPC stack) — receives these from the game engine
 *   - SimulatedAgent.tick() (simulation) — constructed from world event percepts
 *
 * See appraisal-event.ts for the aggregation function.
 */
export interface AppraisalEvent {
  /** Semantic category of the event. */
  readonly kind: AppraisalEventKind;

  /**
   * Net valence contribution of this event (−1..1).
   * Positive = pleasant/beneficial, negative = unpleasant/threatening.
   */
  readonly valenceShift: number;

  /**
   * Net arousal contribution of this event (−0.5..0.5).
   * Positive = activating (novel, intense), negative = calming (familiar, resolved).
   */
  readonly arousalShift: number;

  /**
   * Intensity multiplier (0..1). Scales both valence and arousal shifts.
   * Defaults to 1.0 when omitted.
   */
  readonly intensity?: number;
}
