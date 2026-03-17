import { describe, it, expect } from "vitest";
import { SubjectContinuityConfirmationImpl } from "../subject-continuity-confirmation.js";
import {
  SubjectReportType,
  type SubjectReport,
  type PsiMetric,
} from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function makePsi(value: number, threshold: number): PsiMetric {
  const now = Date.now();
  return {
    value,
    threshold,
    phi: { value: 3.0, baseline: 2.0, timestamp_ms: now },
    causalContinuity: { intact: true, chainLength: 100, lastVerified_ms: now },
    experientialBinding: { coherence: 0.95, fragmentCount: 1, timestamp_ms: now },
    timestamp_ms: now,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SubjectContinuityConfirmationImpl", () => {
  it("starts with no reports", () => {
    const scc = new SubjectContinuityConfirmationImpl();
    expect(scc.getAllReports()).toEqual([]);
  });

  describe("recordBaseline", () => {
    it("stores a baseline report", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      const report = makeReport({ type: SubjectReportType.Baseline, atStepIndex: null });
      scc.recordBaseline(report);
      expect(scc.getAllReports()).toHaveLength(1);
      expect(scc.getAllReports()[0].type).toBe(SubjectReportType.Baseline);
    });

    it("rejects non-baseline reports", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      const report = makeReport({ type: SubjectReportType.DuringTransfer });
      expect(() => scc.recordBaseline(report)).toThrow("Expected BASELINE report");
    });
  });

  describe("recordDuringTransfer", () => {
    it("stores a during-transfer report", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      const report = makeReport({ type: SubjectReportType.DuringTransfer, atStepIndex: 3 });
      scc.recordDuringTransfer(report);
      expect(scc.getAllReports()).toHaveLength(1);
      expect(scc.getAllReports()[0].type).toBe(SubjectReportType.DuringTransfer);
    });

    it("rejects non-during-transfer reports", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      const report = makeReport({ type: SubjectReportType.PostTransfer });
      expect(() => scc.recordDuringTransfer(report)).toThrow("Expected DURING_TRANSFER report");
    });
  });

  describe("recordPostTransfer", () => {
    it("stores a post-transfer report", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      const report = makeReport({ type: SubjectReportType.PostTransfer, atStepIndex: null });
      scc.recordPostTransfer(report);
      expect(scc.getAllReports()).toHaveLength(1);
      expect(scc.getAllReports()[0].type).toBe(SubjectReportType.PostTransfer);
    });

    it("rejects non-post-transfer reports", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      const report = makeReport({ type: SubjectReportType.Baseline });
      expect(() => scc.recordPostTransfer(report)).toThrow("Expected POST_TRANSFER report");
    });
  });

  describe("crossValidate", () => {
    it("returns null if no reports exist", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      const psi = makePsi(3.0, 2.0);
      expect(scc.crossValidate(psi)).toBeNull();
    });

    it("cross-validates against the most recent report", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      scc.recordDuringTransfer(makeReport({ continuityIntact: true, timestamp_ms: 1000 }));
      scc.recordDuringTransfer(makeReport({ continuityIntact: false, timestamp_ms: 2000 }));

      const psi = makePsi(3.0, 2.0); // objective says continuity preserved
      const result = scc.crossValidate(psi);

      expect(result).not.toBeNull();
      expect(result!.concordant).toBe(false); // objective yes, subjective no
      expect(result!.discrepancy).toBe("objective-only");
    });

    it("concordant when both agree", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      scc.recordDuringTransfer(makeReport({ continuityIntact: true }));

      const psi = makePsi(3.0, 2.0);
      const result = scc.crossValidate(psi);

      expect(result).not.toBeNull();
      expect(result!.concordant).toBe(true);
      expect(result!.discrepancy).toBe("none");
    });
  });

  describe("getAllReports", () => {
    it("returns reports in insertion order", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      scc.recordBaseline(makeReport({ type: SubjectReportType.Baseline, atStepIndex: null, timestamp_ms: 100 }));
      scc.recordDuringTransfer(makeReport({ atStepIndex: 1, timestamp_ms: 200 }));
      scc.recordDuringTransfer(makeReport({ atStepIndex: 2, timestamp_ms: 300 }));
      scc.recordPostTransfer(makeReport({ type: SubjectReportType.PostTransfer, atStepIndex: null, timestamp_ms: 400 }));

      const reports = scc.getAllReports();
      expect(reports).toHaveLength(4);
      expect(reports[0].type).toBe(SubjectReportType.Baseline);
      expect(reports[1].type).toBe(SubjectReportType.DuringTransfer);
      expect(reports[2].type).toBe(SubjectReportType.DuringTransfer);
      expect(reports[3].type).toBe(SubjectReportType.PostTransfer);
    });

    it("returns a copy — mutations don't affect internal state", () => {
      const scc = new SubjectContinuityConfirmationImpl();
      scc.recordBaseline(makeReport({ type: SubjectReportType.Baseline, atStepIndex: null }));

      const reports = scc.getAllReports();
      reports.length = 0; // mutate the returned array

      expect(scc.getAllReports()).toHaveLength(1); // internal state unaffected
    });
  });
});
