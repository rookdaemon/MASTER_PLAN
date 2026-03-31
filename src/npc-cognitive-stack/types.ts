/**
 * Data types for the NPC Cognitive Stack (npc-cognitive-stack)
 *
 * Provides a unified, game- and simulation-friendly facade over the four core
 * cognitive modules:
 *   - personality/        (PersonalityModel — Big Five + optional traits)
 *   - emotion-appraisal/  (MoodDynamics, EmotionalInfluence, EmotionalRegulation)
 *   - social-cognition/   (SocialCognitionModule — theory of mind, trust, empathy)
 *   - intrinsic-motivation/ (DriveSystem — curiosity, social, homeostatic, etc.)
 *
 * Designed to run independently of agent-runtime's 8-phase conscious loop.
 * The tick-based update cycle is game-loop friendly (fixed or variable timestep).
 */

import type { Timestamp, Duration } from '../conscious-core/types.js';
import type { TraitDimensionId } from '../personality/types.js';
import type { PersonalitySnapshot } from '../personality/types.js';
import type { MoodState } from '../emotion-appraisal/types.js';
import type {
  DriveGoalCandidate,
  DriveState,
  DriveType,
  ActivityRecord,
  DriveDiagnostic,
  DriveSnapshot,
  ExperientialStateDelta,
} from '../intrinsic-motivation/types.js';
import type { EmotionalInfluenceVector, RegulationOutcome } from '../emotion-appraisal/types.js';

// Re-export commonly needed primitive types for consumer convenience
export type {
  Timestamp,
  Duration,
  TraitDimensionId,
  ActivityRecord,
  DriveGoalCandidate,
  DriveState,
  DriveType,
  DriveDiagnostic,
  MoodState,
  EmotionalInfluenceVector,
  RegulationOutcome,
  ExperientialStateDelta,
};

// ── Agent Configuration ───────────────────────────────────────────────────────

/**
 * Configuration for constructing a CognitiveAgent.
 *
 * Minimal setup requires only an agentId. All other settings have sensible
 * defaults suitable for game NPCs.
 */
export interface CognitiveAgentConfig {
  /** Unique identifier for this agent (NPC name, UUID, etc.). */
  readonly agentId: string;

  /**
   * Initial trait values (0..1). Omitted traits use defaults:
   *   openness: 0.65, deliberateness: 0.60, warmth: 0.55,
   *   assertiveness: 0.50, volatility: 0.40
   */
  readonly initialTraits?: Partial<Record<TraitDimensionId, number>>;

  /** Starting valence (−1..1). Default: 0.0 (neutral). */
  readonly initialMoodValence?: number;

  /** Starting arousal (0..1). Default: 0.5 (mid). */
  readonly initialMoodArousal?: number;
}

// ── Tick Input ────────────────────────────────────────────────────────────────

/**
 * Everything the CognitiveAgent needs to run one update tick.
 *
 * All fields represent the agent's current context — world state, recent
 * activity, and social history. These are injected rather than queried
 * directly so that the cognitive stack remains decoupled from any specific
 * simulation engine or world representation.
 */
export interface CognitiveTickInput {
  /** Current wall-clock or simulation time (epoch ms or sim step ms). */
  readonly now: Timestamp;

  /**
   * Current valence of the agent's experiential state (−1..1).
   * When omitted, the current mood valence is used.
   */
  readonly currentValence?: number;

  /**
   * Current arousal of the agent's experiential state (0..1).
   * When omitted, the current mood arousal is used.
   */
  readonly currentArousal?: number;

  /**
   * Average uncertainty across the agent's world model (0..1).
   * High uncertainty drives curiosity. Pass 0 if not tracking this.
   */
  readonly worldModelUncertainty: number;

  /**
   * Time elapsed since the agent's last meaningful social interaction (ms).
   * Drives the social motivation. Pass 0 if the agent is currently socializing.
   */
  readonly timeSinceLastSocialInteraction: Duration;

  /**
   * Recent activity log — used by boredom, mastery, and homeostatic drives.
   * Ordered oldest-first. May be empty.
   */
  readonly recentActivity: ActivityRecord[];

  /**
   * Current cognitive load estimate (0..1).
   * Pass 0.4 as a neutral baseline if not tracking this.
   */
  readonly currentCognitiveLoad: number;

  /**
   * Current novelty estimate for incoming stimuli (0..1).
   * Pass 0.4 as a neutral baseline if not tracking this.
   */
  readonly currentNovelty: number;

  /**
   * Self-model coherence score (0..1).
   * Low coherence activates the existential drive. Pass 0.9 as a stable baseline.
   */
  readonly selfModelCoherence: number;
}

// ── Tick Result ───────────────────────────────────────────────────────────────

/**
 * Everything the CognitiveAgent produces in one tick.
 *
 * Consumers use this to:
 *   - Submit goalCandidates to their own goal/planning system
 *   - Apply experientialDelta to their simulation's emotional state
 *   - Read moodState for NPC dialogue tone and behavior selection
 *   - Read influenceVector to bias deliberation, memory, risk decisions
 *   - Observe driveStates for debug visualization and NPC scheduling
 */
export interface CognitiveTickResult {
  /** Updated drive states after this tick. */
  readonly driveStates: Map<DriveType, DriveState>;

  /**
   * Goal candidates generated by active drives this tick.
   * The consumer is responsible for routing these to their planning system.
   * Empty if no drives fired or all fires were suppressed by cooldowns.
   */
  readonly goalCandidates: DriveGoalCandidate[];

  /** Current mood state after EWMA update. */
  readonly moodState: MoodState;

  /**
   * Emotional influence vector derived from the current mood.
   * Use this to bias deliberation confidence, memory retrieval, risk tolerance,
   * and communication tone in your NPC's decision logic.
   */
  readonly influenceVector: EmotionalInfluenceVector;

  /**
   * Emotional regulation outcome if any threshold was crossed this tick.
   * Null when mood is within healthy bounds.
   */
  readonly regulationOutcome: RegulationOutcome | null;

  /**
   * Valence and arousal deltas contributed by the drives.
   * The consumer merges these into their simulation's experiential state.
   */
  readonly experientialDelta: ExperientialStateDelta;

  /** Diagnostic log for observability and debugging. */
  readonly diagnostics: DriveDiagnostic[];
}

// ── Snapshot (Serialization) ──────────────────────────────────────────────────

/**
 * A fully serializable snapshot of the agent's cognitive state.
 *
 * Suitable for:
 *   - Game save/load
 *   - Agent persistence across sessions
 *   - State migration between hosts
 *
 * Format is plain JSON-serializable objects (no Maps, no functions).
 */
export interface CognitiveSnapshot {
  /** Agent identifier — must match the agent that produced this snapshot. */
  readonly agentId: string;

  /** Personality trait values at time of snapshot. */
  readonly personalitySnapshot: PersonalitySnapshot;

  /** Drive states at time of snapshot. */
  readonly driveSnapshot: DriveSnapshot;

  /** Mood state at time of snapshot. */
  readonly moodSnapshot: MoodState;

  /** Wall-clock time when the snapshot was taken. */
  readonly snapshotAt: Timestamp;
}
