/**
 * RealTimeContinuityMonitor — concrete implementation.
 *
 * Continuously tracks Ψ (experiential continuity metric) during transfer,
 * computes alert levels, and fires breach callbacks when continuity is at risk.
 *
 * See: docs/continuity-preserving-transfer/ARCHITECTURE.md §3 (RTCM)
 * Addresses AC3 (real-time continuity monitoring) and AC7 (objective metric validation).
 */

import {
  computeAlertLevel,
  AlertLevel,
  type PsiMetric,
  type RealTimeContinuityMonitor,
  type SubjectProfile,
} from "./types.js";

type BreachCallback = (alertLevel: AlertLevel, psi: PsiMetric) => void;

export class RealTimeContinuityMonitorImpl implements RealTimeContinuityMonitor {
  private monitoring = false;
  private subject: SubjectProfile | null = null;
  private measurements: PsiMetric[] = [];
  private breachCallbacks: BreachCallback[] = [];

  startMonitoring(subject: SubjectProfile): void {
    if (this.monitoring) {
      throw new Error("already monitoring — stop current session first");
    }
    this.monitoring = true;
    this.subject = subject;
    this.measurements = [];
  }

  /**
   * Record a new Ψ measurement. If it triggers RED, fire breach callbacks.
   */
  recordMeasurement(psi: PsiMetric): void {
    if (!this.monitoring) {
      throw new Error("not monitoring — call startMonitoring first");
    }
    this.measurements.push(psi);

    const alertLevel = computeAlertLevel(psi);
    if (alertLevel === AlertLevel.RED) {
      for (const cb of this.breachCallbacks) {
        cb(alertLevel, psi);
      }
    }
  }

  getCurrentPsi(): PsiMetric {
    if (this.measurements.length === 0) {
      throw new Error("no measurements recorded yet");
    }
    return this.measurements[this.measurements.length - 1];
  }

  getAlertLevel(): AlertLevel {
    return computeAlertLevel(this.getCurrentPsi());
  }

  checkThreshold(): { safe: boolean; margin: number } {
    const psi = this.getCurrentPsi();
    const margin = psi.value - psi.threshold;
    return {
      safe: margin >= 0,
      margin,
    };
  }

  onThresholdBreach(callback: (alertLevel: AlertLevel, psi: PsiMetric) => void): void {
    this.breachCallbacks.push(callback);
  }

  getHistory(): PsiMetric[] {
    return [...this.measurements];
  }
}
