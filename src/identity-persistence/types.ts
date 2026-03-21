/**
 * Identity Persistence Verification — Core Type Definitions
 *
 * Types, interfaces, and threshold constants for the four-dimension
 * identity verification protocol defined in:
 *   docs/identity-persistence/ARCHITECTURE.md
 *   plan/0.2.2.3-identity-persistence-verification.md
 *
 * Card 0.2.2.3: Identity Persistence Verification
 *
 * Implements:
 *   - IdentityCheck contract (per-dimension verification)
 *   - IdentityVerdict contract (composite verdict)
 *   - DriftAlert contract (temporal monitoring)
 *   - Threshold Registry (7 named constants)
 */

// ── Threshold Registry ───────────────────────────────────────────────────────
// Every constant from the card's Threshold Registry, with exact names and values.

/** Below this confidence, verdict MUST be INCONCLUSIVE. [0.9, 0.99] */
export const OVERALL_CONFIDENCE_THRESHOLD = 0.95;

/** Minimum ICC for baseline test-retest reliability. [0.7, 0.9] */
export const BASELINE_TEST_RETEST_MIN = 0.8;

/** Minimum number of baseline measurement occasions. [2, 10] */
export const BASELINE_MIN_OCCASIONS = 3;

/** WARNING drift threshold multiplier (× biological variance). [1.2, 2.0] */
export const DRIFT_WARNING_MULTIPLIER = 1.5;

/** CRITICAL drift threshold multiplier (× biological variance). [1.5, 3.0] */
export const DRIFT_CRITICAL_MULTIPLIER = 2.0;

/** Minimum inter-rater reliability (Cohen's κ) for subjective report scoring. [0.7, 0.9] */
export const INTER_RATER_RELIABILITY_MIN = 0.8;

/** Calibration invariant: self-comparison score floor. [0.9, 1.0] */
export const SELF_COMPARISON_SCORE_FLOOR = 0.95;

// ── Enums ────────────────────────────────────────────────────────────────────

export type VerificationDimension =
  | "STRUCTURAL"
  | "FUNCTIONAL"
  | "EXPERIENTIAL"
  | "TEMPORAL";

export type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export type DriftSeverity = "NORMAL" | "WARNING" | "CRITICAL";

export type EdgeCaseFlag =
  | "partial-transfer"
  | "branching"
  | "substrate-switch"
  | "gradual-drift";

// ── Evidence ─────────────────────────────────────────────────────────────────

export interface Evidence {
  /** Human-readable label for this evidence item */
  label: string;
  /** Numeric or descriptive value */
  value: unknown;
  /** Source check that produced this evidence */
  source: string;
}

// ── BaselineProfile ──────────────────────────────────────────────────────────

export interface BaselineProfile {
  subject_id: string;
  capture_timestamp: Date;
  /** Intra-subject consistency (ICC) over repeated measures */
  test_retest_reliability: number;
  /** Number of baseline measurement occasions */
  measurement_occasions: number;
  /** Biological variance rate for drift detection (score delta per unit time) */
  biological_variance: number;
  /** Opaque per-dimension baseline data keyed by check name */
  dimension_data: Record<string, unknown>;
}

// ── SystemModel (from consciousness-metrics) ─────────────────────────────────
// Minimal re-export / structural type for dependency injection.
// The real SystemModel lives in consciousness-metrics; this is the shape we require.

export interface SystemModel {
  /** Unique identifier for this system instance */
  id: string;
  /** Substrate type */
  substrate: string;
  /** Structural description — graph-level */
  nodes: ReadonlyArray<{ id: string; type: string }>;
  edges: ReadonlyArray<{ source: string; target: string; weight: number }>;
  /** State space dimensionality */
  state_space_dimension: number;
  /** Opaque model-specific data for downstream checks */
  metadata: Record<string, unknown>;
}

// ── TimeSpec ─────────────────────────────────────────────────────────────────

export interface TimeSpec {
  /** Duration value */
  value: number;
  /** Duration unit */
  unit: "ms" | "s" | "min" | "hr" | "day" | "week" | "month" | "year";
}

// ── IdentityCheck (per-dimension check result) ──────────────────────────────

export interface IdentityCheckInput {
  source_model: SystemModel;
  target_model: SystemModel;
  source_baseline: BaselineProfile;
  observation_window: TimeSpec;
}

export interface IdentityCheckResult {
  /** Name of the specific check (e.g. "structural-topology-match") */
  name: string;
  /** Which dimension this check belongs to */
  dimension: VerificationDimension;
  /** Similarity score ∈ [0.0, 1.0] */
  score: number;
  /** Verdict for this check */
  verdict: Verdict;
  /** Confidence ∈ [0.0, 1.0] */
  confidence: number;
  /** Supporting evidence (non-empty) */
  evidence: Evidence[];
}

// ── IdentityVerdict (composite verdict) ──────────────────────────────────────

export interface IdentityVerdict {
  subject_id: string;
  transfer_id: string;
  timestamp: Date;

  structural_score: number;
  functional_score: number;
  experiential_score: number;
  /** null at T+0 (first post-transfer assessment) */
  temporal_score: number | null;

  structural_verdict: Verdict;
  functional_verdict: Verdict;
  experiential_verdict: Verdict;
  temporal_verdict: Verdict;

  overall_verdict: Verdict;
  confidence: number;

  flags: EdgeCaseFlag[];
  drift_status: DriftAlert | null;
}

// ── DriftAlert ───────────────────────────────────────────────────────────────

export interface DriftAlert {
  timestamp: Date;
  /** Which dimension is drifting */
  dimension: VerificationDimension;
  /** Rate of change per unit time */
  drift_rate: number;
  /** Total divergence from baseline (monotonically non-decreasing) */
  cumulative_drift: number;
  /** Severity classification */
  severity: DriftSeverity;
  /** true if and only if severity = CRITICAL */
  threshold_breach: boolean;
}

// ── Monitoring Schedule ──────────────────────────────────────────────────────

export interface MonitoringSchedule {
  /** Scheduled check times post-transfer */
  intervals: TimeSpec[];
}

/** Default longitudinal monitoring schedule from Behavioral Spec Scenario 1 */
export const DEFAULT_MONITORING_SCHEDULE: MonitoringSchedule = {
  intervals: [
    { value: 1, unit: "day" },
    { value: 1, unit: "week" },
    { value: 1, unit: "month" },
    { value: 1, unit: "year" },
  ],
};

// ── IdentityCheck Interface (for implementors) ──────────────────────────────

/**
 * Contract interface that each dimension-specific check must implement.
 * Abstracts the measurement protocol so checks are injectable and mockable.
 */
export interface IdentityCheck {
  /** Unique check name */
  readonly name: string;
  /** Which dimension this check assesses */
  readonly dimension: VerificationDimension;

  /**
   * Execute the identity check.
   *
   * Preconditions (caller must ensure):
   *   - source_model and target_model are valid SystemModel instances
   *   - source_baseline has test_retest_reliability >= BASELINE_TEST_RETEST_MIN
   *   - source_baseline has measurement_occasions >= BASELINE_MIN_OCCASIONS
   *
   * Postconditions:
   *   - score ∈ [0.0, 1.0]
   *   - verdict is PASS, FAIL, or INCONCLUSIVE
   *   - confidence ∈ [0.0, 1.0]
   *   - evidence is non-empty
   *   - If confidence < OVERALL_CONFIDENCE_THRESHOLD, verdict MUST be INCONCLUSIVE
   */
  execute(input: IdentityCheckInput): IdentityCheckResult;
}
