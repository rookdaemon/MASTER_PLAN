/**
 * Emulation Validation — Validation Logic
 *
 * Implements the three-layer validation protocol for brain emulations
 * as specified in docs/emulation-validation/ARCHITECTURE.md
 *
 * Card 0.2.2.1.4: Emulation Validation
 */

import type {
  Layer1Result,
  Layer2Result,
  Layer3Result,
  DomainResult,
  MetricResult,
  TestDomain,
  NeuralMetric,
  LayerStatus,
  OverallVerdict,
  FailureClassification,
  ValidationResult,
  ConsciousnessAssessment,
  FirstPersonResult,
  DivergenceIndex,
  TemporalDriftAssessment,
} from "./types.js";

import {
  BEHAVIORAL_THRESHOLDS,
  NEURAL_METRIC_TOLERANCES,
} from "./types.js";

// ── Layer 1: Behavioral Equivalence ─────────────────────────────────────────

/**
 * Evaluate Layer 1 status from domain results.
 * - All domains pass → PASS
 * - ≥ 3 domains fail → FAIL
 * - 1-2 domains fail → PARTIAL
 */
export function evaluateLayer1(domainResults: DomainResult[]): Layer1Result {
  const resultMap = new Map<TestDomain, DomainResult>();
  let failedCount = 0;
  let totalScore = 0;

  for (const result of domainResults) {
    resultMap.set(result.domain, result);
    if (!result.passed) failedCount++;
    totalScore += result.score;
  }

  const overallScore = domainResults.length > 0 ? totalScore / domainResults.length : 0;

  let status: LayerStatus;
  if (failedCount === 0) {
    status = "PASS";
  } else if (failedCount >= 3) {
    status = "FAIL";
  } else {
    status = "PARTIAL";
  }

  return { status, domainResults: resultMap, overallScore, failedDomainCount: failedCount };
}

/**
 * Check whether a domain score meets its threshold.
 * Uses the metric-specific logic from the architecture.
 */
export function evaluateDomainResult(
  domain: TestDomain,
  score: number,
  details: string = "",
): DomainResult {
  const spec = BEHAVIORAL_THRESHOLDS[domain];

  // For metrics where higher is better (accuracy, likert-mean),
  // score must meet or exceed threshold.
  // For "within-SD" metrics, score represents # of SDs from baseline —
  // must be ≤ threshold.
  // For "indistinguishability-rate", judges must NOT be able to distinguish
  // at > threshold accuracy — so the *distinguishability* score must be ≤ threshold.
  let passed: boolean;
  switch (spec.metric) {
    case "accuracy":
    case "likert-mean":
      passed = score >= spec.threshold;
      break;
    case "within-SD":
    case "within-test-retest-band":
      // score = number of SDs from baseline; must be ≤ threshold
      passed = score <= spec.threshold;
      break;
    case "indistinguishability-rate":
      // score = judge accuracy at distinguishing; must be ≤ threshold
      // (if judges can't tell them apart better than threshold, it passes)
      passed = score <= spec.threshold;
      break;
    default:
      passed = false;
  }

  return { domain, passed, score, threshold: spec.threshold, details };
}

// ── Layer 2: Neural-Dynamic Equivalence ─────────────────────────────────────

/**
 * Evaluate a single neural metric against its tolerance.
 */
export function evaluateNeuralMetric(
  metric: NeuralMetric,
  value: number,
  details: string = "",
): MetricResult {
  const spec = NEURAL_METRIC_TOLERANCES[metric];

  let passed: boolean;
  switch (spec.unit) {
    case "pearson-r":
    case "cosine-similarity":
      // Higher is better; must meet or exceed tolerance
      passed = value >= spec.tolerance;
      break;
    case "kl-divergence-nats":
    case "frobenius-norm-pct":
    case "peak-lag-error-ms":
    case "pct-of-reference":
      // Lower is better; must be ≤ tolerance
      passed = value <= spec.tolerance;
      break;
    default:
      passed = false;
  }

  return { metric, passed, value, tolerance: spec.tolerance, details };
}

/**
 * Compute the composite divergence index D(t).
 * D(t) = Σ_i w_i · d_i(t) where d_i is normalized divergence.
 */
export function computeDivergenceIndex(
  metricResults: MetricResult[],
  weights: Map<NeuralMetric, number>,
  threshold: number,
): DivergenceIndex {
  const contributions = new Map<NeuralMetric, number>();
  let value = 0;

  for (const result of metricResults) {
    const w = weights.get(result.metric) ?? 1.0;
    // Normalize: how far from passing? 0 = exactly at tolerance, >0 = failing
    const spec = NEURAL_METRIC_TOLERANCES[result.metric];
    let normalizedDivergence: number;

    switch (spec.unit) {
      case "pearson-r":
      case "cosine-similarity":
        // tolerance is minimum; divergence = how far below
        normalizedDivergence = Math.max(0, (spec.tolerance - result.value) / spec.tolerance);
        break;
      case "kl-divergence-nats":
      case "frobenius-norm-pct":
      case "peak-lag-error-ms":
      case "pct-of-reference":
        // tolerance is maximum; divergence = how far above
        normalizedDivergence = spec.tolerance > 0
          ? Math.max(0, (result.value - spec.tolerance) / spec.tolerance)
          : (result.value > 0 ? 1 : 0);
        break;
      default:
        normalizedDivergence = 0;
    }

    const contribution = w * normalizedDivergence;
    contributions.set(result.metric, contribution);
    value += contribution;
  }

  return { value, threshold, contributions };
}

/**
 * Assess temporal drift from a series of divergence index measurements.
 * Linear regression on D(t) samples; fail if projected to exceed D_max within 10 years.
 */
export function assessTemporalDrift(
  samples: { timeHours: number; divergenceValue: number }[],
  dMax: number,
): TemporalDriftAssessment {
  if (samples.length < 2) {
    return { driftRate: 0, projectedExceedanceHours: null, acceptable: true };
  }

  // Simple linear regression: D(t) = a + b*t
  const n = samples.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const s of samples) {
    sumX += s.timeHours;
    sumY += s.divergenceValue;
    sumXY += s.timeHours * s.divergenceValue;
    sumX2 += s.timeHours * s.timeHours;
  }

  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;

  const driftRate = slope;

  let projectedExceedanceHours: number | null = null;
  if (slope > 0) {
    // Solve: intercept + slope * t = dMax → t = (dMax - intercept) / slope
    const t = (dMax - intercept) / slope;
    projectedExceedanceHours = t > 0 ? t : 0;
  }

  // 10 years in hours ≈ 87,600
  const TEN_YEARS_HOURS = 10 * 365.25 * 24;
  const acceptable = slope <= 0 || (projectedExceedanceHours !== null && projectedExceedanceHours > TEN_YEARS_HOURS);

  return { driftRate, projectedExceedanceHours, acceptable };
}

/**
 * Evaluate Layer 2 from metric results.
 */
export function evaluateLayer2(
  metricResults: MetricResult[],
  divergenceIndex: DivergenceIndex,
  temporalDrift: TemporalDriftAssessment | null,
): Layer2Result {
  const resultMap = new Map<NeuralMetric, MetricResult>();
  let failedCount = 0;

  for (const result of metricResults) {
    resultMap.set(result.metric, result);
    if (!result.passed) failedCount++;
  }

  let status: LayerStatus;
  if (failedCount === 0 && divergenceIndex.value <= divergenceIndex.threshold) {
    status = "PASS";
  } else if (failedCount === metricResults.length) {
    status = "FAIL";
  } else {
    status = "PARTIAL";
  }

  // Temporal drift can override to FAIL
  if (temporalDrift && !temporalDrift.acceptable) {
    status = "FAIL";
  }

  return { status, metricResults: resultMap, divergenceIndex, temporalDrift };
}

// ── Layer 3: Experiential Equivalence ───────────────────────────────────────

/**
 * Evaluate Layer 3A: consciousness metrics.
 */
export function evaluateConsciousness(assessment: ConsciousnessAssessment): boolean {
  return assessment.allPassed;
}

/**
 * Evaluate first-person verification result.
 *
 * Phase 1 pass: mean semantic similarity ≥ 0.80 AND expert same-quality rate ≥ 0.75
 * Phase 2 pass: both ratings ≥ 4/5
 * Phase 3 pass: no fundamental absences reported
 */
export function evaluateFirstPerson(fp: FirstPersonResult): boolean {
  return fp.phase1Passed && fp.phase2Passed && fp.phase3Passed;
}

/**
 * Evaluate Layer 3 overall.
 */
export function evaluateLayer3(
  consciousness: ConsciousnessAssessment,
  firstPerson: FirstPersonResult | null,
): Layer3Result {
  const failureFlags: FailureClassification[] = [];

  if (!consciousness.allPassed) {
    failureFlags.push("false-positive-zombie");
    return {
      status: "FAIL",
      consciousnessMetrics: consciousness,
      firstPersonVerification: firstPerson,
      failureFlags,
    };
  }

  // If no first-person verification available, provisional only
  if (firstPerson === null) {
    return {
      status: "PROVISIONAL",
      consciousnessMetrics: consciousness,
      firstPersonVerification: null,
      failureFlags,
    };
  }

  if (firstPerson.hasFundamentalAbsence) {
    failureFlags.push("false-positive-zombie");
    return {
      status: "FAIL",
      consciousnessMetrics: consciousness,
      firstPersonVerification: firstPerson,
      failureFlags,
    };
  }

  const passed = evaluateFirstPerson(firstPerson);
  return {
    status: passed ? "PASS" : "FAIL",
    consciousnessMetrics: consciousness,
    firstPersonVerification: firstPerson,
    failureFlags,
  };
}

// ── Overall Verdict ─────────────────────────────────────────────────────────

/**
 * Determine overall verdict from all three layers.
 * Implements the sequencing logic from ARCHITECTURE.md.
 */
export function determineVerdict(
  layer1: Layer1Result,
  layer2: Layer2Result,
  layer3: Layer3Result,
): { verdict: OverallVerdict; failureModes: FailureClassification[]; recommendations: string[] } {
  const failureModes: FailureClassification[] = [...layer3.failureFlags];
  const recommendations: string[] = [];

  // Layer 1 FAIL → overall FAILED
  if (layer1.status === "FAIL") {
    recommendations.push("Layer 1 failed with ≥3 domain failures. Root cause investigation required before proceeding.");
    return { verdict: "FAILED", failureModes, recommendations };
  }

  // Layer 2 FAIL → overall FAILED
  if (layer2.status === "FAIL") {
    if (layer2.temporalDrift && !layer2.temporalDrift.acceptable) {
      failureModes.push("temporal-drift");
      recommendations.push("Temporal drift detected. Feed back to 0.2.2.1.3 for simulation stability improvements.");
    } else {
      recommendations.push("Neural-dynamic equivalence failed. Review fidelity parameters from 0.2.2.1.1.");
    }
    return { verdict: "FAILED", failureModes, recommendations };
  }

  // Layer 3 FAIL → check for false-negative (substrate offset)
  if (layer3.status === "FAIL") {
    // If layer 1 is PARTIAL and layer 3 has consciousness but first-person failed,
    // this may be a substrate offset
    if (layer1.status === "PARTIAL" && layer3.consciousnessMetrics.allPassed) {
      failureModes.push("false-negative-substrate-offset");
      recommendations.push("Possible substrate offset: behavioral divergence with consciousness confirmed. Targeted recalibration recommended.");
    }
    return { verdict: "FAILED", failureModes, recommendations };
  }

  // Layer 2 PARTIAL → check for degraded fidelity
  if (layer2.status === "PARTIAL") {
    if (layer3.status === "PASS" || layer3.status === "PROVISIONAL") {
      failureModes.push("degraded-fidelity");
      recommendations.push("Partial neural-dynamic match. Map divergent regions against consciousness-critical areas per F1 theory.");
      // Still can be provisionally validated if layer 3 passes
    }
  }

  // Layer 3 PROVISIONAL → overall PROVISIONALLY_VALIDATED
  if (layer3.status === "PROVISIONAL") {
    recommendations.push("First-person verification not completed (original unavailable). Full validation requires living-original protocol.");
    return { verdict: "PROVISIONALLY_VALIDATED", failureModes, recommendations };
  }

  // All layers pass
  if (layer1.status === "PASS" && layer2.status === "PASS" && layer3.status === "PASS") {
    return { verdict: "VALIDATED", failureModes: [], recommendations: [] };
  }

  // Mixed partial results → INCONCLUSIVE
  recommendations.push("Mixed results across layers. Further investigation needed.");
  return { verdict: "INCONCLUSIVE", failureModes, recommendations };
}

/**
 * Determine whether Layer 2 should run based on Layer 1 result.
 * Layer 2 runs only if Layer 1 is PASS or PARTIAL with ≤ 2 failures.
 */
export function shouldRunLayer2(layer1: Layer1Result): boolean {
  return layer1.status === "PASS" || (layer1.status === "PARTIAL" && layer1.failedDomainCount <= 2);
}

/**
 * Determine whether Layer 3A should run based on Layer 2 result.
 */
export function shouldRunLayer3A(layer2: Layer2Result): boolean {
  return layer2.status === "PASS" || layer2.status === "PARTIAL";
}

/**
 * Determine whether Layer 3B (first-person) should run based on Layer 3A.
 */
export function shouldRunLayer3B(consciousness: ConsciousnessAssessment): boolean {
  return consciousness.allPassed;
}
