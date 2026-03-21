/**
 * Identity Persistence Verification — Public API
 *
 * Card 0.2.2.3: Identity Persistence Verification
 */

export {
  // Threshold Registry constants
  OVERALL_CONFIDENCE_THRESHOLD,
  BASELINE_TEST_RETEST_MIN,
  BASELINE_MIN_OCCASIONS,
  DRIFT_WARNING_MULTIPLIER,
  DRIFT_CRITICAL_MULTIPLIER,
  INTER_RATER_RELIABILITY_MIN,
  SELF_COMPARISON_SCORE_FLOOR,
  DEFAULT_MONITORING_SCHEDULE,
} from "./types.js";

export type {
  // Core types
  VerificationDimension,
  Verdict,
  DriftSeverity,
  EdgeCaseFlag,
  Evidence,
  BaselineProfile,
  SystemModel,
  TimeSpec,
  MonitoringSchedule,
  IdentityCheckInput,
  IdentityCheckResult,
  IdentityVerdict,
  DriftAlert,
  IdentityCheck,
} from "./types.js";

export {
  // Validation guards
  validateBaselineProfile,
  validateIdentityCheckResult,
  // Composite verdict
  computeOverallVerdict,
  // Drift alerting
  classifyDriftSeverity,
  computeDriftAlert,
} from "./verification.js";

export type {
  ValidationResult,
  ComputeVerdictOptions,
  DriftAlertInput,
} from "./verification.js";
