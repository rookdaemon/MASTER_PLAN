/**
 * Incremental Replacement Protocols — Core Type Definitions
 *
 * Types and interfaces for progressively replacing biological neural substrate
 * with synthetic substrate while maintaining continuous consciousness.
 * See: docs/incremental-replacement/ARCHITECTURE.md
 *
 * Consumes contracts from:
 *   - 0.2.2.4.1 Bio-Synthetic Interface (InterfaceReadiness, SignalFidelity)
 *   - 0.2.2.4.2 Unified Consciousness (UnityMetrics, FragmentationDetector)
 *   - 0.2.2.4.3 Graceful Degradation (RollbackCapability, MVC, DynamicRebalancing)
 *   - 0.2.2.3  Identity Persistence (IdentityVerdict, BaselineProfile, DriftAlert)
 */

// ── Core Constants ──────────────────────────────────────────────────────────

/**
 * Minimum inter-step interval in hours.
 * Derived from identity verification duration: temporal checks require
 * minimum 24h for initial drift detection.
 */
export const MIN_INTER_STEP_INTERVAL_HOURS = 24;

/**
 * Maximum inter-step interval in hours.
 * Upper bound to prevent indefinite stalls.
 */
export const MAX_INTER_STEP_INTERVAL_HOURS = 72;

/**
 * Cross-substrate latency threshold for gamma-band coherence (ms).
 * From 0.2.2.4.2: unity binding requires <=30ms cross-substrate latency.
 */
export const GAMMA_COHERENCE_LATENCY_MS = 30;

/**
 * Experiential integration window (ms).
 * Below this, disruptions are not consciously noticeable.
 */
export const EXPERIENTIAL_INTEGRATION_WINDOW_MS = 100;

// ── Completion Thresholds ───────────────────────────────────────────────────

/**
 * Identity persistence score thresholds for declaring migration complete.
 * From ARCHITECTURE.md Completion Criteria.
 */
export const COMPLETION_THRESHOLDS = {
  structural: 0.95,
  functional: 0.95,
  experiential: 0.90,
  /** Drift rate must be <= biological aging baseline */
  temporalDriftDescription: "drift <= bio_baseline",
  /** Psi-G must be within this fraction of pre-migration baseline */
  psiGToleranceFraction: 0.10,
  /** Post-completion monitoring window in days */
  postCompletionMonitoringDays: 30,
} as const;

// ── Enums ───────────────────────────────────────────────────────────────────

/** Go/No-Go decision after a replacement step verification. */
export enum GoNoGoVerdict {
  /** All criteria pass — proceed to next step */
  GO = "GO",
  /** One or more criteria inconclusive — wait and re-verify */
  HOLD = "HOLD",
  /** One or more criteria fail — revert this step */
  ROLLBACK = "ROLLBACK",
}

/** Method used to roll back a replacement step. */
export enum RollbackMethod {
  /** Reconnect preserved biological tissue */
  REVERT_TO_BIO = "REVERT_TO_BIO",
  /** Use cross-substrate mirror from graceful degradation */
  FAILOVER_TO_MIRROR = "FAILOVER_TO_MIRROR",
  /** Partial rollback via cognitive load rebalancing */
  HYBRID_RESTORE = "HYBRID_RESTORE",
}

/** Overall migration outcome. */
export enum MigrationOutcome {
  /** All thresholds met, migration successful */
  COMPLETE = "COMPLETE",
  /** Migration still in progress or paused */
  INCOMPLETE = "INCOMPLETE",
  /** Unrecoverable failure, rolled back to last stable state */
  FAILED = "FAILED",
}

/** Replacement phase — groups regions by risk tier. */
export enum ReplacementPhase {
  /** Low-risk peripheral regions (sensory, motor, cerebellum) */
  PHASE_1_PERIPHERAL = "PHASE_1_PERIPHERAL",
  /** Association regions (parietal, temporal, lateral prefrontal) */
  PHASE_2_ASSOCIATION = "PHASE_2_ASSOCIATION",
  /** High-criticality regions (hippocampus, insula, claustrum) */
  PHASE_3_HIGH_CRITICALITY = "PHASE_3_HIGH_CRITICALITY",
  /** Core consciousness regions (thalamocortical, DMN, RAS) */
  PHASE_4_CORE_CONSCIOUSNESS = "PHASE_4_CORE_CONSCIOUSNESS",
}

/** Verification checkpoint timing. */
export enum CheckpointTiming {
  /** Immediately after replacement */
  T_PLUS_0 = "T+0",
  /** 1 hour after replacement */
  T_PLUS_1H = "T+1h",
  /** 24 hours after replacement */
  T_PLUS_24H = "T+24h",
  /** 7 days after replacement (critical regions only) */
  T_PLUS_7D = "T+7d",
}

// ── Value Types ─────────────────────────────────────────────────────────────

/** A neural region identifier. */
export type NeuralRegionId = string;

/** A replacement step identifier. */
export type StepId = string;

/** A subject identifier. */
export type SubjectId = string;

/** A migration sequence identifier. */
export type MigrationId = string;

/** Duration in milliseconds. */
export type DurationMs = number;

/** Duration in hours. */
export type DurationHours = number;

// ── Region Priority Queue ───────────────────────────────────────────────────

/**
 * Priority scoring for a neural region in the replacement queue.
 * Higher composite priority = replace earlier.
 */
export interface RegionPriority {
  /** Identifier for the neural region */
  region: NeuralRegionId;

  /** Human-readable name (e.g., "Primary Visual Cortex V1") */
  name: string;

  /** Which replacement phase this region belongs to */
  phase: ReplacementPhase;

  /**
   * Functional criticality to consciousness [0, 1].
   * 0 = least critical, 1 = most critical.
   */
  criticalityScore: number;

  /**
   * Bio-synthetic interface readiness for this region [0, 1].
   * 1 = fully ready. From 0.2.2.4.1 InterfaceReadiness.
   */
  interfaceReadiness: number;

  /**
   * Cross-region connectivity density [0, 1].
   * 0 = most isolated, 1 = most connected.
   */
  connectivityDensity: number;

  /**
   * Composite priority score: higher = replace earlier.
   * = (1 - criticality) * interfaceReadiness * (1 - connectivity)
   */
  priority: number;
}

/**
 * Computes the composite priority score for a region.
 * Higher score = replace earlier (lower risk, higher readiness).
 */
export function computeRegionPriority(
  criticalityScore: number,
  interfaceReadiness: number,
  connectivityDensity: number
): number {
  return (1 - criticalityScore) * interfaceReadiness * (1 - connectivityDensity);
}

// ── Consciousness Snapshot ──────────────────────────────────────────────────

/**
 * A point-in-time capture of consciousness metrics.
 * Used as pre/post comparison for each replacement step.
 */
export interface ConsciousnessSnapshot {
  /** Timestamp of capture (ms since epoch) */
  timestamp_ms: number;

  /** Global integrated information measure (from 0.2.2.4.2) */
  psiG: number;

  /** Perturbational complexity index (consciousness metric) */
  pciG: number;

  /** Cross-substrate unity score [0, 1] */
  unityScore: number;

  /** Current margin above minimum viable consciousness threshold */
  mvcMargin: number;

  /** Whether fragmentation is detected */
  fragmentationDetected: boolean;
}

// ── Identity Verification Types (from 0.2.2.3 contract) ────────────────────

/** Per-dimension identity verdict. */
export enum IdentityDimensionVerdict {
  PASS = "PASS",
  FAIL = "FAIL",
  INCONCLUSIVE = "INCONCLUSIVE",
}

/** Four-dimension identity verification result. */
export interface IdentityVerdict {
  subjectId: SubjectId;
  timestamp_ms: number;

  structuralScore: number;
  functionalScore: number;
  experientialScore: number;
  temporalScore: number | null; // null at T+0

  structuralVerdict: IdentityDimensionVerdict;
  functionalVerdict: IdentityDimensionVerdict;
  experientialVerdict: IdentityDimensionVerdict;
  temporalVerdict: IdentityDimensionVerdict;

  overallVerdict: IdentityDimensionVerdict;
  confidence: number;
}

/** Pre-replacement identity baseline capture. */
export interface BaselineProfile {
  subjectId: SubjectId;
  captureTimestamp_ms: number;
  testRetestReliability: number;
  measurementOccasions: number;
}

/** Drift alert from longitudinal monitoring. */
export interface DriftAlert {
  timestamp_ms: number;
  dimension: "structural" | "functional" | "experiential" | "temporal";
  driftRate: number;
  cumulativeDrift: number;
  severity: "NORMAL" | "WARNING" | "CRITICAL";
  thresholdBreach: boolean;
}

// ── Go/No-Go Decision ───────────────────────────────────────────────────────

/** Criteria evaluated for the go/no-go decision. */
export interface GoNoGoCriteria {
  /** All four 0.2.2.3 identity dimensions pass */
  identityPass: boolean;
  /** Psi-G remains above MVC threshold */
  consciousnessAboveMvc: boolean;
  /** No fragmentation detected by 0.2.2.4.2 */
  unityMaintained: boolean;
  /** Cumulative drift within allocated budget */
  driftWithinBudget: boolean;
  /** Bio-synthetic interface performing nominally */
  interfaceStable: boolean;
}

/** Manual override by human operator. */
export interface ManualOverride {
  operatorId: string;
  timestamp_ms: number;
  justification: string;
  overriddenVerdict: GoNoGoVerdict;
  newVerdict: GoNoGoVerdict;
}

/** Full go/no-go decision for a replacement step. */
export interface GoNoGoDecision {
  verdict: GoNoGoVerdict;
  criteria: GoNoGoCriteria;
  override: ManualOverride | null;
}

/**
 * Evaluates a GoNoGo verdict from criteria (without override).
 * GO requires ALL criteria true.
 * ROLLBACK if any criterion is definitively false.
 * In a real system, HOLD would be used for inconclusive states;
 * here we treat all-true as GO and any-false as ROLLBACK.
 */
export function evaluateGoNoGo(criteria: GoNoGoCriteria): GoNoGoVerdict {
  const allPass =
    criteria.identityPass &&
    criteria.consciousnessAboveMvc &&
    criteria.unityMaintained &&
    criteria.driftWithinBudget &&
    criteria.interfaceStable;

  return allPass ? GoNoGoVerdict.GO : GoNoGoVerdict.ROLLBACK;
}

// ── Rollback Plan ───────────────────────────────────────────────────────────

/** Rollback plan for a replacement step. */
export interface RollbackPlan {
  stepId: StepId;

  /** How long rollback remains possible */
  rollbackWindow_hours: DurationHours;

  /** Primary rollback method */
  rollbackMethod: RollbackMethod;

  /** Biological tissue backup details */
  biologicalBackup: {
    preserved: boolean;
    preservationMethod: string;
    viabilityDuration_hours: DurationHours;
  };

  /** Synthetic mirror (from 0.2.2.4.3 graceful degradation) */
  syntheticMirror: {
    exists: boolean;
    fidelity: number;
  };

  /** Post-rollback verification required */
  postRollbackIdentityCheck: boolean;

  /** Expected recovery time after rollback */
  expectedRecoveryTime_hours: DurationHours;

  /** Maximum time to restore consciousness (SLA) */
  consciousnessRestorationSla_ms: DurationMs;
}

// ── Replacement Step — Atomic Unit of Migration ─────────────────────────────

/** A single atomic replacement step in the migration sequence. */
export interface ReplacementStep {
  stepId: StepId;

  /** Position in overall replacement sequence (1-indexed) */
  sequencePosition: number;

  /** The biological region being replaced */
  targetRegion: NeuralRegionId;

  /** Human-readable region name */
  targetRegionName: string;

  /** Which phase this step belongs to */
  phase: ReplacementPhase;

  // -- Pre-step state --

  /** Identity baseline captured before this step */
  preBaseline: BaselineProfile;

  /** Consciousness metrics before this step */
  preConsciousness: ConsciousnessSnapshot;

  /** Interface readiness assessment for the target region [0, 1] */
  preInterfaceReadiness: number;

  // -- The operation --

  /** Estimated duration of the replacement operation */
  estimatedDuration_hours: DurationHours;

  // -- Post-step verification --

  /** Full four-dimension identity check (0.2.2.3) */
  postVerification: IdentityVerdict | null;

  /** Consciousness metrics after replacement */
  postConsciousness: ConsciousnessSnapshot | null;

  // -- Decision --

  /** Go/no-go decision for proceeding */
  goNoGo: GoNoGoDecision | null;

  /** How to reverse this step if needed */
  rollbackPlan: RollbackPlan;
}

// ── Rate Controller ─────────────────────────────────────────────────────────

/** Rate control parameters for pacing the replacement sequence. */
export interface RateControllerState {
  /** Minimum allowed interval between steps (hours) */
  minInterStepInterval_hours: DurationHours;

  /** Current interval between steps (hours) — starts at min, adjustable */
  currentInterval_hours: DurationHours;
}

/**
 * Adjusts the inter-step interval based on the outcome of the last step.
 * Rules from ARCHITECTURE.md Rate Control Algorithm:
 *   - Unity dipped: interval *= 1.5
 *   - Drift rate > 0.8 * budget: interval *= 2.0
 *   - Last 3 steps stable: interval *= 0.9 (but >= min)
 *   - HOLD verdict: interval *= 1.5
 *   - ROLLBACK verdict: interval *= 3.0
 */
export function adjustInterval(
  state: RateControllerState,
  event: RateAdjustmentEvent
): RateControllerState {
  let newInterval = state.currentInterval_hours;

  if (event.rollbackIssued) {
    newInterval *= 3.0;
  } else if (event.holdIssued) {
    newInterval *= 1.5;
  } else if (event.unityDipped) {
    newInterval *= 1.5;
  } else if (event.driftRateHighFraction > 0.8) {
    newInterval *= 2.0;
  } else if (event.consecutiveStableSteps >= 3) {
    newInterval *= 0.9;
  }

  // Enforce minimum
  newInterval = Math.max(newInterval, state.minInterStepInterval_hours);

  // Enforce maximum
  newInterval = Math.min(newInterval, MAX_INTER_STEP_INTERVAL_HOURS);

  return {
    minInterStepInterval_hours: state.minInterStepInterval_hours,
    currentInterval_hours: newInterval,
  };
}

/** Event describing the outcome of a step, used for rate adjustment. */
export interface RateAdjustmentEvent {
  /** Unity metrics dipped below pre-step baseline during the step */
  unityDipped: boolean;
  /** Drift rate as fraction of per-step budget (0.0 = none, 1.0 = full budget) */
  driftRateHighFraction: number;
  /** Number of consecutive stable steps just completed */
  consecutiveStableSteps: number;
  /** Whether a HOLD verdict was issued */
  holdIssued: boolean;
  /** Whether a ROLLBACK was issued */
  rollbackIssued: boolean;
}

// ── Migration Verdict ───────────────────────────────────────────────────────

/** Per-dimension completion assessment. */
export interface DimensionCompletion {
  score: number;
  threshold: number;
  pass: boolean;
}

/** Final verdict for a complete migration. */
export interface MigrationVerdict {
  subjectId: SubjectId;
  migrationId: MigrationId;
  startTimestamp_ms: number;
  completionTimestamp_ms: number;

  totalSteps: number;
  rollbackEvents: number;

  /** Final identity verification from 0.2.2.3 */
  finalIdentityVerdict: IdentityVerdict;

  /** Final consciousness metrics */
  finalConsciousnessMetrics: {
    psiG: number;
    pciG: number;
    unityScore: number;
  };

  /** Per-dimension completion thresholds */
  completionAssessment: {
    structural: DimensionCompletion;
    functional: DimensionCompletion;
    experiential: DimensionCompletion;
    temporal: DimensionCompletion;
  };

  /** Overall migration outcome */
  overall: MigrationOutcome;
}

/**
 * Evaluates whether a migration is complete based on final scores
 * and the defined completion thresholds.
 */
export function evaluateMigrationCompletion(
  structural: number,
  functional: number,
  experiential: number,
  temporalDriftWithinBaseline: boolean
): MigrationOutcome {
  const structuralPass = structural >= COMPLETION_THRESHOLDS.structural;
  const functionalPass = functional >= COMPLETION_THRESHOLDS.functional;
  const experientialPass = experiential >= COMPLETION_THRESHOLDS.experiential;

  if (structuralPass && functionalPass && experientialPass && temporalDriftWithinBaseline) {
    return MigrationOutcome.COMPLETE;
  }
  return MigrationOutcome.INCOMPLETE;
}

// ── Replacement Log ─────────────────────────────────────────────────────────

/** A single log entry in the auditable replacement log. */
export interface ReplacementLogEntry {
  stepId: StepId;
  timestamp_ms: number;
  event: string;
  details: Record<string, unknown>;
}

/** The complete auditable replacement log for a migration. */
export interface ReplacementLog {
  migrationId: MigrationId;
  subjectId: SubjectId;
  entries: ReplacementLogEntry[];
}
