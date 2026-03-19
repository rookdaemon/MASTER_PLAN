/**
 * Data types for Intrinsic Motivation and Drive System (0.3.1.5.8)
 *
 * Drives are the bridge between internal state (emotion, world model, activity
 * history) and goal formation. They transform experiential states into new goals
 * registered with the Goal Coherence Engine, giving the agent reasons to act
 * that arise from within rather than from external commands.
 *
 * Five drive dimensions:
 *   - curiosity: information-seeking, triggered by high world-model uncertainty
 *   - social: interaction-seeking, triggered by social deprivation
 *   - homeostatic: range-maintenance (arousal, cognitive load, novelty)
 *   - boredom: goal-switching signal, compound trigger
 *   - mastery: reward signal for capability improvement (no goal candidate)
 *
 * Builds on:
 *   - AgencyGoal, GoalAddResult (src/agency-stability/types.ts)
 *   - ExperientialState (src/conscious-core/types.ts)
 */

import type { Timestamp, Duration, ExperientialState } from '../conscious-core/types.js';
import type { AgencyGoal, GoalId } from '../agency-stability/types.js';

// ── Primitives ──────────────────────────────────────────────────

export type DriveId = string;

/** The drive dimensions. */
export type DriveType =
  | 'curiosity'
  | 'social'
  | 'homeostatic-arousal'
  | 'homeostatic-load'
  | 'homeostatic-novelty'
  | 'boredom'
  | 'mastery'
  | 'existential';

// ── Personality Parameters ───────────────────────────────────────

/**
 * Personality parameters that control drive strengths and preferred ranges.
 * Sourced from the personality model (0.3.1.5.2).
 *
 * All values are normalized 0..1 unless otherwise noted.
 */
export interface DrivePersonalityParams {
  /** Openness / curiosity dimension — scales the curiosity drive threshold and goal strength. */
  readonly curiosityTrait: number; // 0..1

  /** Warmth / sociability dimension — scales the social drive threshold. */
  readonly warmthTrait: number; // 0..1

  /**
   * Volatility / neuroticism dimension — controls arousal tolerance range.
   * High volatility → narrow preferred arousal band (more easily dysregulated).
   * Low volatility → wide preferred band (comfortable across arousal levels).
   */
  readonly volatilityTrait: number; // 0..1

  /** Preferred arousal midpoint (homeostasis setpoint). */
  readonly preferredArousal: number; // 0..1

  /** Preferred cognitive load midpoint (homeostasis setpoint). */
  readonly preferredLoad: number; // 0..1

  /** Preferred novelty exposure midpoint (homeostasis setpoint). */
  readonly preferredNovelty: number; // 0..1

  /** Openness dimension — scales the existential drive's self-questioning intensity. */
  readonly opennessTrait: number; // 0..1

  /** Deliberateness dimension — scales the existential drive toward systematic examination. */
  readonly deliberatenessTrait: number; // 0..1
}

// ── Activity Record ──────────────────────────────────────────────

/**
 * A record of a single recent activity (action taken or goal pursued).
 * Used by boredom and mastery drives to assess engagement and progress.
 */
export interface ActivityRecord {
  readonly timestamp: Timestamp;

  /** Human-readable description of the activity. */
  readonly description: string;

  /**
   * Novelty score of the activity at the time it occurred (0..1).
   * Decreases with repetition; used for boredom detection.
   */
  readonly novelty: number;

  /** Arousal level during the activity (0..1 from ExperientialState). */
  readonly arousal: number;

  /**
   * Whether the agent made meaningful progress toward a goal during this activity.
   * Used by boredom (progress low = possible boredom) and mastery (progress high = growth).
   */
  readonly goalProgress: 'advancing' | 'stalled' | 'completed';

  /**
   * Optional: self-prediction error at the end of the activity (0..1).
   * Decreasing error over time is the mastery drive trigger.
   */
  readonly selfPredictionError?: number;
}

// ── Drive Context ────────────────────────────────────────────────

/**
 * All inputs the drive system needs to compute drive states and goal candidates.
 * Dependencies are injected rather than queried directly, keeping DriveSystem
 * decoupled from the world model, personality system, and activity logger.
 */
export interface DriveContext {
  /** Current experiential state — provides valence, arousal, continuity token. */
  readonly currentState: ExperientialState;

  /**
   * Average uncertainty across the world model's active beliefs (0..1).
   * High uncertainty triggers curiosity.
   */
  readonly worldModelUncertainty: number;

  /**
   * Time elapsed since the last meaningful social interaction (ms).
   * Exceeding the personality-scaled threshold triggers the social drive.
   */
  readonly timeSinceLastSocialInteraction: Duration;

  /**
   * Recent activity history — used by boredom, mastery, and homeostatic drives.
   * Ordered oldest-first. May be empty if no history is available.
   */
  readonly recentActivity: ActivityRecord[];

  /**
   * Current cognitive load estimate (0..1).
   * Sourced from the substrate or cognitive monitor.
   */
  readonly currentCognitiveLoad: number;

  /**
   * Current novelty estimate for incoming stimuli (0..1).
   * May come from the perception layer or world model.
   */
  readonly currentNovelty: number;

  /** Personality parameters for this agent. */
  readonly personality: DrivePersonalityParams;

  /**
   * Current self-model coherence score (0..1).
   * Low coherence triggers the existential drive — the agent feels the need to
   * examine its own nature, origins, and values.
   */
  readonly selfModelCoherence: number;

  /** Current wall clock time (epoch ms), used for cooldown tracking. */
  readonly now: Timestamp;
}

// ── Drive State ──────────────────────────────────────────────────

/**
 * The live state of a single drive between ticks.
 * Persisted in DriveSystem so drives can track their own cooldowns and history.
 */
export interface DriveState {
  readonly driveType: DriveType;

  /**
   * Current drive strength (0..1).
   * 0 = fully satiated / dormant; 1 = maximally activated.
   */
  readonly strength: number;

  /**
   * Whether this drive is currently active (strength above threshold).
   * A drive can be above threshold without generating a goal if on cooldown.
   */
  readonly active: boolean;

  /**
   * Timestamp when this drive last generated a goal candidate.
   * Used for cooldown: drives cannot re-fire until cooldown expires.
   */
  readonly lastFiredAt: Timestamp | null;

  /**
   * Extended cooldown deadline, set when a goal candidate is rejected by the
   * Goal Coherence Engine. Forces the drive to wait longer before retrying.
   */
  readonly extendedCooldownUntil: Timestamp | null;

  /**
   * Number of consecutive ticks above the activation threshold.
   * Boredom requires sustained activation; this counter enables that check.
   */
  readonly consecutiveActiveTickCount: number;
}

// ── Drive Goal Candidate ─────────────────────────────────────────

/**
 * A goal candidate generated by a drive, ready to be submitted to
 * IGoalCoherenceEngine.addGoal().
 *
 * The drive system does not create AgencyGoal directly — it creates a candidate
 * that is validated and converted before submission. This keeps goal creation
 * under coherence-engine governance.
 */
export interface DriveGoalCandidate {
  /** The drive that produced this candidate. */
  readonly sourceDrive: DriveType;

  /**
   * The proposed goal description.
   * Should be concrete enough for goal coherence evaluation.
   */
  readonly description: string;

  /**
   * Suggested priority (0..1) based on drive strength.
   * The coherence engine may override this.
   */
  readonly suggestedPriority: number;

  /**
   * The terminal goal(s) this candidate should trace to.
   * Provided as hints to assist derivation tracing; the engine verifies independently.
   */
  readonly terminalGoalHints: GoalId[];

  /**
   * The experiential basis that motivated this goal candidate.
   * Satisfies the experientialBasis field on AgencyGoal.
   */
  readonly experientialBasis: ExperientialState;

  /** Timestamp when this candidate was generated. */
  readonly generatedAt: Timestamp;
}

// ── Drive Tick Result ────────────────────────────────────────────

/**
 * Everything the drive system produces in a single tick.
 * Consumed by the 0.3.1.5.9 runtime loop.
 */
export interface DriveTickResult {
  /**
   * Goal candidates ready for submission to IGoalCoherenceEngine.addGoal().
   * Empty if no drives fired or all fires were suppressed by cooldowns.
   */
  readonly goalCandidates: DriveGoalCandidate[];

  /**
   * Experiential state delta contributed by the drives.
   * Drives produce felt states — boredom creates negative valence, mastery creates
   * positive valence, curiosity increases arousal, social deprivation decreases valence.
   *
   * This is expressed as partial overrides merged into the next ExperientialState
   * by the conscious core.
   */
  readonly experientialDelta: ExperientialStateDelta;

  /** Updated drive states after this tick — replaces the previous states. */
  readonly updatedDriveStates: Map<DriveType, DriveState>;

  /**
   * Diagnostic log entries for this tick (non-goal events, rejections, etc.).
   * Used for observability and debugging.
   */
  readonly diagnostics: DriveDiagnostic[];
}

/**
 * Partial changes to an ExperientialState contributed by drives.
 * Only non-null fields are applied.
 */
export interface ExperientialStateDelta {
  /** Valence change (−1..1 additive, clamped after application). */
  readonly valenceDelta: number | null;

  /** Arousal change (−1..1 additive, clamped 0..1 after application). */
  readonly arousalDelta: number | null;
}

// ── Drive Diagnostic ────────────────────────────────────────────

/**
 * A single diagnostic event from one tick, for logging and observability.
 */
export interface DriveDiagnostic {
  readonly driveType: DriveType;
  readonly event:
    | 'fired'
    | 'suppressed-cooldown'
    | 'suppressed-extended-cooldown'
    | 'satiated'
    | 'coherence-rejected'
    | 'coherence-accepted'
    | 'mastery-reward';
  readonly message: string;
  readonly timestamp: Timestamp;
}
