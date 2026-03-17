import { describe, it, expect } from "vitest";
import {
  computeAlertLevel,
  crossValidate,
  AlertLevel,
  PSI_GREEN_MULTIPLIER,
  DEFAULT_BATCH_SIZE,
  MIN_PACING_INTERVAL_MS,
  DEFAULT_GRACE_PERIOD_MS,
  MAX_LOOP_REPLACEMENT_FRACTION,
  NeuronSubstrateState,
  BrainRegionPriority,
  SubjectReportType,
  type PsiMetric,
  type SubjectReport,
} from "../types.js";

// ── Helper: create a PsiMetric with sensible defaults ─────────────────────

function makePsi(overrides: Partial<PsiMetric> & { value: number; threshold: number }): PsiMetric {
  const now = Date.now();
  return {
    phi: { value: 3.0, baseline: 2.0, timestamp_ms: now },
    causalContinuity: { intact: true, chainLength: 100, lastVerified_ms: now },
    experientialBinding: { coherence: 0.95, fragmentCount: 1, timestamp_ms: now },
    timestamp_ms: now,
    ...overrides,
  };
}

function makeReport(overrides: Partial<SubjectReport> = {}): SubjectReport {
  return {
    type: SubjectReportType.DuringTransfer,
    timestamp_ms: Date.now(),
    continuityIntact: true,
    description: "Experience feels continuous",
    atStepIndex: 5,
    ...overrides,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

describe("Continuity-Preserving Transfer — Types", () => {
  describe("constants", () => {
    it("DEFAULT_BATCH_SIZE is a conservative small number", () => {
      expect(DEFAULT_BATCH_SIZE).toBe(10);
      expect(DEFAULT_BATCH_SIZE).toBeGreaterThan(0);
      expect(DEFAULT_BATCH_SIZE).toBeLessThanOrEqual(100);
    });

    it("MIN_PACING_INTERVAL_MS is 1 hour", () => {
      expect(MIN_PACING_INTERVAL_MS).toBe(3_600_000);
    });

    it("DEFAULT_GRACE_PERIOD_MS is 72 hours", () => {
      expect(DEFAULT_GRACE_PERIOD_MS).toBe(72 * 3_600_000);
    });

    it("MAX_LOOP_REPLACEMENT_FRACTION is 10%", () => {
      expect(MAX_LOOP_REPLACEMENT_FRACTION).toBe(0.10);
    });

    it("PSI_GREEN_MULTIPLIER is 1.5", () => {
      expect(PSI_GREEN_MULTIPLIER).toBe(1.5);
    });
  });

  // ── Alert Level Computation ───────────────────────────────────────────

  describe("computeAlertLevel", () => {
    const threshold = 2.0;

    it("returns GREEN when Ψ ≥ 1.5 × threshold", () => {
      const psi = makePsi({ value: 3.0, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.GREEN);
    });

    it("returns GREEN at exactly 1.5 × threshold", () => {
      const psi = makePsi({ value: 3.0, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.GREEN);
    });

    it("returns YELLOW when threshold ≤ Ψ < 1.5 × threshold", () => {
      const psi = makePsi({ value: 2.5, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.YELLOW);
    });

    it("returns YELLOW at exactly threshold", () => {
      const psi = makePsi({ value: 2.0, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.YELLOW);
    });

    it("returns RED when Ψ < threshold", () => {
      const psi = makePsi({ value: 1.9, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.RED);
    });

    it("returns RED at zero", () => {
      const psi = makePsi({ value: 0, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.RED);
    });

    it("boundary: just below GREEN threshold returns YELLOW", () => {
      const psi = makePsi({ value: 2.999, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.YELLOW);
    });

    it("boundary: just below YELLOW threshold returns RED", () => {
      const psi = makePsi({ value: 1.999, threshold });
      expect(computeAlertLevel(psi)).toBe(AlertLevel.RED);
    });
  });

  // ── Cross-Validation ──────────────────────────────────────────────────

  describe("crossValidate", () => {
    const threshold = 2.0;

    it("concordant when both agree continuity is preserved", () => {
      const psi = makePsi({ value: 3.0, threshold });
      const report = makeReport({ continuityIntact: true });
      const result = crossValidate(psi, report);
      expect(result.concordant).toBe(true);
      expect(result.objectiveContinuity).toBe(true);
      expect(result.subjectiveContinuity).toBe(true);
      expect(result.discrepancy).toBe("none");
    });

    it("concordant when both agree continuity is lost", () => {
      const psi = makePsi({ value: 1.0, threshold });
      const report = makeReport({ continuityIntact: false });
      const result = crossValidate(psi, report);
      expect(result.concordant).toBe(true);
      expect(result.objectiveContinuity).toBe(false);
      expect(result.subjectiveContinuity).toBe(false);
      expect(result.discrepancy).toBe("none");
    });

    it("discordant: objective says yes, subject says no", () => {
      const psi = makePsi({ value: 3.0, threshold });
      const report = makeReport({ continuityIntact: false });
      const result = crossValidate(psi, report);
      expect(result.concordant).toBe(false);
      expect(result.discrepancy).toBe("objective-only");
    });

    it("discordant: subject says yes, objective says no", () => {
      const psi = makePsi({ value: 1.0, threshold });
      const report = makeReport({ continuityIntact: true });
      const result = crossValidate(psi, report);
      expect(result.concordant).toBe(false);
      expect(result.discrepancy).toBe("subjective-only");
    });

    it("timestamp is max of both inputs", () => {
      const psi = makePsi({ value: 3.0, threshold, timestamp_ms: 1000 });
      const report = makeReport({ timestamp_ms: 2000 });
      const result = crossValidate(psi, report);
      expect(result.timestamp_ms).toBe(2000);
    });
  });

  // ── Enum Coverage ─────────────────────────────────────────────────────

  describe("enums", () => {
    it("NeuronSubstrateState has all expected states", () => {
      expect(NeuronSubstrateState.Biological).toBe("BIOLOGICAL");
      expect(NeuronSubstrateState.Absorbing).toBe("ABSORBING");
      expect(NeuronSubstrateState.Synthetic).toBe("SYNTHETIC");
      expect(NeuronSubstrateState.SyntheticFinal).toBe("SYNTHETIC_FINAL");
      expect(NeuronSubstrateState.RollingBack).toBe("ROLLING_BACK");
    });

    it("BrainRegionPriority orders periphery before core", () => {
      expect(BrainRegionPriority.Periphery).toBeLessThan(BrainRegionPriority.Association);
      expect(BrainRegionPriority.Association).toBeLessThan(BrainRegionPriority.HigherAssociation);
      expect(BrainRegionPriority.HigherAssociation).toBeLessThan(BrainRegionPriority.CoreIntegration);
    });

    it("AlertLevel has GREEN, YELLOW, RED", () => {
      expect(AlertLevel.GREEN).toBe("GREEN");
      expect(AlertLevel.YELLOW).toBe("YELLOW");
      expect(AlertLevel.RED).toBe("RED");
    });

    it("SubjectReportType covers all phases", () => {
      expect(SubjectReportType.Baseline).toBe("BASELINE");
      expect(SubjectReportType.DuringTransfer).toBe("DURING_TRANSFER");
      expect(SubjectReportType.PostTransfer).toBe("POST_TRANSFER");
    });
  });
});
