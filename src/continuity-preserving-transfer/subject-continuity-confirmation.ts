/**
 * SubjectContinuityConfirmation — concrete implementation.
 *
 * Manages subject self-reports of experiential continuity and
 * cross-validates them against objective Ψ metrics.
 *
 * See: docs/continuity-preserving-transfer/ARCHITECTURE.md §5 (SCC)
 * Addresses AC6 (subject continuity confirmation) and AC7 (objective metric validation).
 */

import {
  crossValidate,
  SubjectReportType,
  type CrossValidationResult,
  type PsiMetric,
  type SubjectContinuityConfirmation,
  type SubjectReport,
} from "./types.js";

export class SubjectContinuityConfirmationImpl implements SubjectContinuityConfirmation {
  private reports: SubjectReport[] = [];

  recordBaseline(report: SubjectReport): void {
    if (report.type !== SubjectReportType.Baseline) {
      throw new Error(`Expected BASELINE report, got ${report.type}`);
    }
    this.reports.push(report);
  }

  recordDuringTransfer(report: SubjectReport): void {
    if (report.type !== SubjectReportType.DuringTransfer) {
      throw new Error(`Expected DURING_TRANSFER report, got ${report.type}`);
    }
    this.reports.push(report);
  }

  recordPostTransfer(report: SubjectReport): void {
    if (report.type !== SubjectReportType.PostTransfer) {
      throw new Error(`Expected POST_TRANSFER report, got ${report.type}`);
    }
    this.reports.push(report);
  }

  crossValidate(psi: PsiMetric): CrossValidationResult | null {
    if (this.reports.length === 0) {
      return null;
    }
    const latestReport = this.reports[this.reports.length - 1];
    return crossValidate(psi, latestReport);
  }

  getAllReports(): SubjectReport[] {
    return [...this.reports];
  }
}
