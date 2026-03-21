/**
 * Identity Persistence Verification — Core Verification Logic
 *
 * Implements the composite verdict, drift alerting, and precondition/postcondition
 * guards for the four-dimension identity verification protocol.
 *
 * Card 0.2.2.3: Identity Persistence Verification
 * Architecture: docs/identity-persistence/ARCHITECTURE.md
 */

import type {
  BaselineProfile,
  IdentityCheckResult,
  IdentityVerdict,
  DriftAlert,
  DriftSeverity,
  Verdict,
  VerificationDimension,
  EdgeCaseFlag,
} from "./types.js";

import {
  OVERALL_CONFIDENCE_THRESHOLD,
  BASELINE_TEST_RETEST_MIN,
  BASELINE_MIN_OCCASIONS,
  DRIFT_WARNING_MULTIPLIER,
  DRIFT_CRITICAL_MULTIPLIER,
} from "./types.js";

// ── Validation Result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Precondition Guards ──────────────────────────────────────────────────────

/**
 * Validate a BaselineProfile against contract preconditions.
 *
 * Checks:
 *   - test_retest_reliability >= BASELINE_TEST_RETEST_MIN (0.8)
 *   - measurement_occasions >= BASELINE_MIN_OCCASIONS (3)
 */
export function validateBaselineProfile(baseline: BaselineProfile): ValidationResult {
  const errors: string[] = [];

  if (baseline.test_retest_reliability < BASELINE_TEST_RETEST_MIN) {
    errors.push(
      `test_retest_reliability (${baseline.test_retest_reliability}) must be >= ${BASELINE_TEST_RETEST_MIN}`,
    );
  }

  if (baseline.measurement_occasions < BASELINE_MIN_OCCASIONS) {
    errors.push(
      `measurement_occasions (${baseline.measurement_occasions}) must be >= ${BASELINE_MIN_OCCASIONS}`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Postcondition Guards ─────────────────────────────────────────────────────

/**
 * Validate an IdentityCheckResult against contract postconditions.
 *
 * Checks:
 *   - score ∈ [0.0, 1.0]
 *   - confidence ∈ [0.0, 1.0]
 *   - evidence array is non-empty
 *   - If confidence < OVERALL_CONFIDENCE_THRESHOLD, verdict MUST be INCONCLUSIVE
 */
export function validateIdentityCheckResult(result: IdentityCheckResult): ValidationResult {
  const errors: string[] = [];

  if (result.score < 0.0 || result.score > 1.0) {
    errors.push(`score (${result.score}) must be in [0.0, 1.0]`);
  }

  if (result.confidence < 0.0 || result.confidence > 1.0) {
    errors.push(`confidence (${result.confidence}) must be in [0.0, 1.0]`);
  }

  if (result.evidence.length === 0) {
    errors.push("evidence array must be non-empty");
  }

  if (result.confidence < OVERALL_CONFIDENCE_THRESHOLD && result.verdict !== "INCONCLUSIVE") {
    errors.push(
      `confidence (${result.confidence}) < ${OVERALL_CONFIDENCE_THRESHOLD} requires verdict = INCONCLUSIVE, got ${result.verdict}`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Composite Verdict ────────────────────────────────────────────────────────

const ALL_DIMENSIONS: VerificationDimension[] = [
  "STRUCTURAL",
  "FUNCTIONAL",
  "EXPERIENTIAL",
  "TEMPORAL",
];

export interface ComputeVerdictOptions {
  subject_id: string;
  transfer_id: string;
  flags: EdgeCaseFlag[];
  /** If true, temporal_score is set to null (T+0 case) */
  temporal_score_null?: boolean;
}

/**
 * Compute the composite IdentityVerdict from four dimension check results.
 *
 * Contract (IdentityVerdict):
 *   - overall_verdict = PASS iff ALL four dimension verdicts = PASS AND ALL confidences >= 0.95
 *   - overall_verdict = FAIL if ANY dimension verdict = FAIL with confidence >= 0.95
 *   - overall_verdict = INCONCLUSIVE otherwise
 *   - No dimension can be skipped — all four must be evaluated
 *   - temporal_score may be null at T+0; temporal verdict defaults to INCONCLUSIVE
 */
export function computeOverallVerdict(
  dimensionResults: IdentityCheckResult[],
  timestamp: Date,
  options: ComputeVerdictOptions,
): IdentityVerdict {
  // Invariant: all four dimensions must be present
  const presentDimensions = new Set(dimensionResults.map(r => r.dimension));
  for (const dim of ALL_DIMENSIONS) {
    if (!presentDimensions.has(dim)) {
      throw new Error(
        `All four dimensions must be evaluated. Missing: ${dim}`,
      );
    }
  }

  // Index results by dimension
  const byDimension = new Map<VerificationDimension, IdentityCheckResult>();
  for (const result of dimensionResults) {
    byDimension.set(result.dimension, result);
  }

  const structural = byDimension.get("STRUCTURAL")!;
  const functional = byDimension.get("FUNCTIONAL")!;
  const experiential = byDimension.get("EXPERIENTIAL")!;
  const temporal = byDimension.get("TEMPORAL")!;

  // Handle T+0 temporal null case
  const temporalScoreNull = options.temporal_score_null === true;
  const temporalVerdict: Verdict = temporalScoreNull ? "INCONCLUSIVE" : temporal.verdict;

  // Collect all verdicts and confidences
  const verdicts: Verdict[] = [
    structural.verdict,
    functional.verdict,
    experiential.verdict,
    temporalVerdict,
  ];
  const confidences = [
    structural.confidence,
    functional.confidence,
    experiential.confidence,
    temporalScoreNull ? 0 : temporal.confidence,
  ];

  // Decision logic per contract
  let overall_verdict: Verdict;

  // FAIL: any dimension FAIL with confidence >= 0.95
  const hasHighConfidenceFail = dimensionResults.some(
    r =>
      r.dimension !== "TEMPORAL" &&
      r.verdict === "FAIL" &&
      r.confidence >= OVERALL_CONFIDENCE_THRESHOLD,
  );
  const temporalFail =
    !temporalScoreNull &&
    temporal.verdict === "FAIL" &&
    temporal.confidence >= OVERALL_CONFIDENCE_THRESHOLD;

  if (hasHighConfidenceFail || temporalFail) {
    overall_verdict = "FAIL";
  }
  // PASS: all four PASS AND all confidences >= 0.95
  else if (
    verdicts.every(v => v === "PASS") &&
    confidences.every(c => c >= OVERALL_CONFIDENCE_THRESHOLD)
  ) {
    overall_verdict = "PASS";
  }
  // INCONCLUSIVE: anything else
  else {
    overall_verdict = "INCONCLUSIVE";
  }

  // Compute minimum confidence across dimensions
  const minConfidence = Math.min(...confidences);

  return {
    subject_id: options.subject_id,
    transfer_id: options.transfer_id,
    timestamp,

    structural_score: structural.score,
    functional_score: functional.score,
    experiential_score: experiential.score,
    temporal_score: temporalScoreNull ? null : temporal.score,

    structural_verdict: structural.verdict,
    functional_verdict: functional.verdict,
    experiential_verdict: experiential.verdict,
    temporal_verdict: temporalVerdict,

    overall_verdict,
    confidence: minConfidence,

    flags: options.flags,
    drift_status: null,
  };
}

// ── Drift Severity Classification ────────────────────────────────────────────

/**
 * Classify drift severity based on drift rate relative to biological variance.
 *
 * Contract (DriftAlert):
 *   - NORMAL: drift_rate <= biological_variance
 *   - WARNING: biological_variance < drift_rate <= 1.5 × biological_variance
 *   - CRITICAL: drift_rate > 2 × biological_variance OR any single dimension fails
 */
export function classifyDriftSeverity(
  driftRate: number,
  biologicalVariance: number,
  anyDimensionFailed: boolean,
): DriftSeverity {
  if (anyDimensionFailed) {
    return "CRITICAL";
  }

  if (driftRate > DRIFT_CRITICAL_MULTIPLIER * biologicalVariance) {
    return "CRITICAL";
  }

  if (driftRate > DRIFT_WARNING_MULTIPLIER * biologicalVariance) {
    return "WARNING";
  }

  return "NORMAL";
}

// ── DriftAlert Computation ───────────────────────────────────────────────────

export interface DriftAlertInput {
  timestamp: Date;
  dimension: VerificationDimension;
  drift_rate: number;
  cumulative_drift: number;
  biological_variance: number;
  any_dimension_failed: boolean;
}

/**
 * Compute a DriftAlert from monitoring data.
 *
 * Contract:
 *   - threshold_breach = true iff severity = CRITICAL
 *   - cumulative_drift is monotonically non-decreasing (caller responsibility)
 *   - Alerts are generated for every monitoring interval
 */
export function computeDriftAlert(input: DriftAlertInput): DriftAlert {
  const severity = classifyDriftSeverity(
    input.drift_rate,
    input.biological_variance,
    input.any_dimension_failed,
  );

  return {
    timestamp: input.timestamp,
    dimension: input.dimension,
    drift_rate: input.drift_rate,
    cumulative_drift: input.cumulative_drift,
    severity,
    threshold_breach: severity === "CRITICAL",
  };
}
