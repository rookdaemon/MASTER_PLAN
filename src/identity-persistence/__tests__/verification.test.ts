/**
 * Identity Persistence Verification — Verification Logic Tests
 *
 * Tests for composite verdict, drift alerting, and precondition guards.
 * Covers all three Behavioral Spec scenarios from the card:
 *   Scenario 1: Successful Transfer Verification
 *   Scenario 2: Copy Detection
 *   Scenario 3: Post-Transfer Drift Detection
 *
 * Card 0.2.2.3: Identity Persistence Verification
 */
import { describe, it, expect } from "vitest";
import {
  validateBaselineProfile,
  validateIdentityCheckResult,
  computeOverallVerdict,
  computeDriftAlert,
  classifyDriftSeverity,
} from "../verification.js";
import type {
  BaselineProfile,
  IdentityCheckResult,
  Verdict,
  DriftSeverity,
} from "../types.js";
import {
  OVERALL_CONFIDENCE_THRESHOLD,
  BASELINE_TEST_RETEST_MIN,
  BASELINE_MIN_OCCASIONS,
  DRIFT_WARNING_MULTIPLIER,
  DRIFT_CRITICAL_MULTIPLIER,
  SELF_COMPARISON_SCORE_FLOOR,
} from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeValidBaseline(overrides: Partial<BaselineProfile> = {}): BaselineProfile {
  return {
    subject_id: "subject-1",
    capture_timestamp: new Date("2026-01-01"),
    test_retest_reliability: 0.9,
    measurement_occasions: 5,
    biological_variance: 0.02,
    dimension_data: {},
    ...overrides,
  };
}

function makeDimensionResult(
  dimension: IdentityCheckResult["dimension"],
  overrides: Partial<IdentityCheckResult> = {},
): IdentityCheckResult {
  return {
    name: `${dimension.toLowerCase()}-check`,
    dimension,
    score: 0.97,
    verdict: "PASS" as Verdict,
    confidence: 0.98,
    evidence: [{ label: "test", value: 0.97, source: "test-check" }],
    ...overrides,
  };
}

// ── Precondition Guards: BaselineProfile ─────────────────────────────────────

describe("validateBaselineProfile", () => {
  it("accepts a valid baseline", () => {
    const result = validateBaselineProfile(makeValidBaseline());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects baseline with test_retest_reliability < BASELINE_TEST_RETEST_MIN", () => {
    const result = validateBaselineProfile(
      makeValidBaseline({ test_retest_reliability: 0.7 }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("test_retest_reliability"))).toBe(true);
  });

  it("rejects baseline with measurement_occasions < BASELINE_MIN_OCCASIONS", () => {
    const result = validateBaselineProfile(
      makeValidBaseline({ measurement_occasions: 2 }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("measurement_occasions"))).toBe(true);
  });

  it("rejects baseline with both violations", () => {
    const result = validateBaselineProfile(
      makeValidBaseline({ test_retest_reliability: 0.5, measurement_occasions: 1 }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

// ── Postcondition Guards: IdentityCheckResult ────────────────────────────────

describe("validateIdentityCheckResult", () => {
  it("accepts a valid check result", () => {
    const result = validateIdentityCheckResult(makeDimensionResult("STRUCTURAL"));
    expect(result.valid).toBe(true);
  });

  it("rejects score outside [0, 1]", () => {
    const r1 = validateIdentityCheckResult(
      makeDimensionResult("STRUCTURAL", { score: -0.1 }),
    );
    expect(r1.valid).toBe(false);

    const r2 = validateIdentityCheckResult(
      makeDimensionResult("STRUCTURAL", { score: 1.1 }),
    );
    expect(r2.valid).toBe(false);
  });

  it("rejects confidence outside [0, 1]", () => {
    const result = validateIdentityCheckResult(
      makeDimensionResult("STRUCTURAL", { confidence: 1.5 }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects empty evidence array", () => {
    const result = validateIdentityCheckResult(
      makeDimensionResult("STRUCTURAL", { evidence: [] }),
    );
    expect(result.valid).toBe(false);
  });

  it("enforces confidence < threshold → verdict MUST be INCONCLUSIVE", () => {
    // A result claiming PASS but with low confidence violates the contract
    const result = validateIdentityCheckResult(
      makeDimensionResult("STRUCTURAL", {
        verdict: "PASS",
        confidence: 0.90,
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("INCONCLUSIVE"))).toBe(true);
  });

  it("allows INCONCLUSIVE with low confidence", () => {
    const result = validateIdentityCheckResult(
      makeDimensionResult("STRUCTURAL", {
        verdict: "INCONCLUSIVE",
        confidence: 0.90,
      }),
    );
    expect(result.valid).toBe(true);
  });
});

// ── Composite Verdict (IdentityVerdict contract) ─────────────────────────────

describe("computeOverallVerdict", () => {
  it("returns PASS when all four dimensions PASS with confidence >= 0.95", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL"),
      makeDimensionResult("FUNCTIONAL"),
      makeDimensionResult("EXPERIENTIAL"),
      makeDimensionResult("TEMPORAL"),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
    });
    expect(verdict.overall_verdict).toBe("PASS");
  });

  it("returns FAIL when any dimension is FAIL with confidence >= 0.95", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL"),
      makeDimensionResult("FUNCTIONAL"),
      makeDimensionResult("EXPERIENTIAL", { verdict: "FAIL", score: 0.3, confidence: 0.98 }),
      makeDimensionResult("TEMPORAL"),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
    });
    expect(verdict.overall_verdict).toBe("FAIL");
  });

  it("returns INCONCLUSIVE when any dimension is INCONCLUSIVE", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL"),
      makeDimensionResult("FUNCTIONAL"),
      makeDimensionResult("EXPERIENTIAL", { verdict: "INCONCLUSIVE", confidence: 0.90 }),
      makeDimensionResult("TEMPORAL"),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
    });
    expect(verdict.overall_verdict).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE when confidence < 0.95 on any dimension", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL"),
      makeDimensionResult("FUNCTIONAL", { confidence: 0.92, verdict: "INCONCLUSIVE" }),
      makeDimensionResult("EXPERIENTIAL"),
      makeDimensionResult("TEMPORAL"),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
    });
    expect(verdict.overall_verdict).toBe("INCONCLUSIVE");
  });

  it("requires all four dimensions — throws if any is missing", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL"),
      makeDimensionResult("FUNCTIONAL"),
      makeDimensionResult("EXPERIENTIAL"),
      // TEMPORAL missing
    ];
    expect(() =>
      computeOverallVerdict(dimensions, new Date("2026-03-01"), {
        subject_id: "s1",
        transfer_id: "t1",
        flags: [],
      }),
    ).toThrow(/all four dimensions/i);
  });

  it("handles temporal_score = null at T+0 → temporal verdict defaults to INCONCLUSIVE, overall cannot be PASS", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL"),
      makeDimensionResult("FUNCTIONAL"),
      makeDimensionResult("EXPERIENTIAL"),
      makeDimensionResult("TEMPORAL", { score: 0, verdict: "INCONCLUSIVE", confidence: 0.0 }),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
      temporal_score_null: true,
    });
    expect(verdict.temporal_score).toBeNull();
    expect(verdict.temporal_verdict).toBe("INCONCLUSIVE");
    expect(verdict.overall_verdict).not.toBe("PASS");
  });

  it("includes edge-case flags in the verdict", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL"),
      makeDimensionResult("FUNCTIONAL"),
      makeDimensionResult("EXPERIENTIAL"),
      makeDimensionResult("TEMPORAL"),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: ["partial-transfer", "substrate-switch"],
    });
    expect(verdict.flags).toContain("partial-transfer");
    expect(verdict.flags).toContain("substrate-switch");
  });

  it("populates all dimension scores correctly", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL", { score: 0.95 }),
      makeDimensionResult("FUNCTIONAL", { score: 0.92 }),
      makeDimensionResult("EXPERIENTIAL", { score: 0.88 }),
      makeDimensionResult("TEMPORAL", { score: 0.90 }),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
    });
    expect(verdict.structural_score).toBe(0.95);
    expect(verdict.functional_score).toBe(0.92);
    expect(verdict.experiential_score).toBe(0.88);
    expect(verdict.temporal_score).toBe(0.90);
  });
});

// ── Behavioral Spec Scenario 1: Successful Transfer Verification ─────────────

describe("Scenario 1: Successful Transfer Verification", () => {
  it("passes with valid baseline and all dimensions passing", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL", { score: 0.97, confidence: 0.98 }),
      makeDimensionResult("FUNCTIONAL", { score: 0.96, confidence: 0.97 }),
      makeDimensionResult("EXPERIENTIAL", { score: 0.95, confidence: 0.96 }),
      makeDimensionResult("TEMPORAL", { verdict: "INCONCLUSIVE", score: 0, confidence: 0.0 }),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
      temporal_score_null: true,
    });
    // At T+0, temporal is INCONCLUSIVE so overall cannot be PASS
    expect(verdict.temporal_verdict).toBe("INCONCLUSIVE");
    expect(verdict.overall_verdict).toBe("INCONCLUSIVE");
  });
});

// ── Behavioral Spec Scenario 2: Copy Detection ──────────────────────────────

describe("Scenario 2: Copy Detection", () => {
  it("detects copy — structural PASS, functional PASS, experiential FAIL → overall ≠ PASS", () => {
    const dimensions = [
      makeDimensionResult("STRUCTURAL", { verdict: "PASS", score: 0.98, confidence: 0.99 }),
      makeDimensionResult("FUNCTIONAL", { verdict: "PASS", score: 0.97, confidence: 0.98 }),
      makeDimensionResult("EXPERIENTIAL", { verdict: "FAIL", score: 0.30, confidence: 0.97 }),
      makeDimensionResult("TEMPORAL", { verdict: "INCONCLUSIVE", score: 0, confidence: 0.0 }),
    ];
    const verdict = computeOverallVerdict(dimensions, new Date("2026-03-01"), {
      subject_id: "s1",
      transfer_id: "t1",
      flags: [],
      temporal_score_null: true,
    });
    expect(verdict.overall_verdict).not.toBe("PASS");
    expect(verdict.structural_verdict).toBe("PASS");
    expect(verdict.functional_verdict).toBe("PASS");
    expect(verdict.experiential_verdict).toBe("FAIL");
  });
});

// ── Behavioral Spec Scenario 3: Post-Transfer Drift Detection ────────────────

describe("Scenario 3: Post-Transfer Drift Detection", () => {
  const biologicalVariance = 0.02;

  it("classifies drift_rate <= biological_variance as NORMAL", () => {
    expect(classifyDriftSeverity(0.01, biologicalVariance, false)).toBe("NORMAL");
    expect(classifyDriftSeverity(0.02, biologicalVariance, false)).toBe("NORMAL");
  });

  it("classifies drift_rate > 1.5× biological_variance as WARNING", () => {
    const warningRate = biologicalVariance * DRIFT_WARNING_MULTIPLIER + 0.001;
    expect(classifyDriftSeverity(warningRate, biologicalVariance, false)).toBe("WARNING");
  });

  it("classifies drift_rate > 2× biological_variance as CRITICAL", () => {
    const criticalRate = biologicalVariance * DRIFT_CRITICAL_MULTIPLIER + 0.001;
    expect(classifyDriftSeverity(criticalRate, biologicalVariance, false)).toBe("CRITICAL");
  });

  it("classifies as CRITICAL when any dimension fails, regardless of drift rate", () => {
    expect(classifyDriftSeverity(0.01, biologicalVariance, true)).toBe("CRITICAL");
  });

  it("computes DriftAlert with correct threshold_breach flag", () => {
    const normalAlert = computeDriftAlert({
      timestamp: new Date("2026-04-01"),
      dimension: "STRUCTURAL",
      drift_rate: 0.01,
      cumulative_drift: 0.05,
      biological_variance: biologicalVariance,
      any_dimension_failed: false,
    });
    expect(normalAlert.severity).toBe("NORMAL");
    expect(normalAlert.threshold_breach).toBe(false);

    const criticalAlert = computeDriftAlert({
      timestamp: new Date("2026-04-01"),
      dimension: "FUNCTIONAL",
      drift_rate: 0.05,
      cumulative_drift: 0.20,
      biological_variance: biologicalVariance,
      any_dimension_failed: false,
    });
    expect(criticalAlert.severity).toBe("CRITICAL");
    expect(criticalAlert.threshold_breach).toBe(true);
  });

  it("WARNING alert has threshold_breach = false", () => {
    // drift_rate between 1.5× and 2× biological variance
    const warningRate = biologicalVariance * 1.6;
    const alert = computeDriftAlert({
      timestamp: new Date("2026-04-01"),
      dimension: "EXPERIENTIAL",
      drift_rate: warningRate,
      cumulative_drift: 0.10,
      biological_variance: biologicalVariance,
      any_dimension_failed: false,
    });
    expect(alert.severity).toBe("WARNING");
    expect(alert.threshold_breach).toBe(false);
  });
});

// ── Calibration Invariant: Self-comparison ───────────────────────────────────

describe("Calibration Invariant", () => {
  it("self_comparison_score_floor is 0.95 — a system compared against itself must score at least this", () => {
    // This is a constant check; the runtime enforcement is in the checks themselves
    expect(SELF_COMPARISON_SCORE_FLOOR).toBe(0.95);
  });
});
