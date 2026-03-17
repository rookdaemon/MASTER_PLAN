import { describe, it, expect, beforeEach } from "vitest";
import {
  FragmentationDetector,
  type FragmentationDetectorState,
} from "../fragmentation-detector.js";
import {
  MetricType,
  Severity,
  RecoveryActionType,
  MIN_AGREEING_METRICS,
  MAX_DETECTION_LATENCY_MS,
  type UnityMetric,
  type FragmentationDetectorConfig,
  type FragmentationAlert,
  type SubstrateCoverage,
} from "../types.js";

// ── Test Helpers ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: FragmentationDetectorConfig = {
  baselinePhi: 1.0,
  warningThreshold: 0.85,
  criticalThreshold: 0.7,
  emergencyThreshold: 0.5,
  detectionLatencyMs: 80,
  measurementWindowMs: 50,
};

const DEFAULT_COVERAGE: SubstrateCoverage = {
  biologicalRegions: ["cortex-v1", "cortex-pfc"],
  syntheticNodes: ["node-a", "node-b"],
  coverageFraction: 0.9,
};

function makeMetric(
  type: MetricType,
  value: number,
  timestampMs: number = Date.now()
): UnityMetric {
  return {
    metricType: type,
    value,
    timestampMs,
    confidenceInterval: [value - 0.05, value + 0.05],
    substrateCoverage: DEFAULT_COVERAGE,
  };
}

// ── Construction ────────────────────────────────────────────────────────────

describe("FragmentationDetector", () => {
  let detector: FragmentationDetector;

  beforeEach(() => {
    detector = new FragmentationDetector(DEFAULT_CONFIG);
  });

  describe("construction", () => {
    it("creates a detector with the given config", () => {
      expect(detector.config).toEqual(DEFAULT_CONFIG);
    });

    it("starts with no alerts", () => {
      expect(detector.pendingAlerts).toHaveLength(0);
    });
  });

  // ── Single Metric Evaluation ────────────────────────────────────────────

  describe("evaluateMetric", () => {
    it("returns null for a healthy metric above all thresholds", () => {
      const metric = makeMetric(MetricType.Phi, 0.95);
      const alert = detector.evaluateMetric(metric);
      expect(alert).toBeNull();
    });

    it("returns WARNING when metric is at warning threshold", () => {
      const metric = makeMetric(MetricType.Phi, 0.85);
      const alert = detector.evaluateMetric(metric);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe(Severity.Warning);
    });

    it("returns CRITICAL when metric is below critical threshold", () => {
      const metric = makeMetric(MetricType.Phi, 0.65);
      const alert = detector.evaluateMetric(metric);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe(Severity.Critical);
    });

    it("returns EMERGENCY when metric is below emergency threshold", () => {
      const metric = makeMetric(MetricType.Phi, 0.3);
      const alert = detector.evaluateMetric(metric);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe(Severity.Emergency);
    });

    it("includes the metric snapshot in the alert", () => {
      const metric = makeMetric(MetricType.Phi, 0.6);
      const alert = detector.evaluateMetric(metric);
      expect(alert!.metricSnapshot).toEqual(metric);
    });
  });

  // ── Multi-Metric Consensus ──────────────────────────────────────────────

  describe("evaluateMetrics (consensus)", () => {
    it("returns null when all metrics are healthy", () => {
      const metrics = [
        makeMetric(MetricType.Phi, 0.95),
        makeMetric(MetricType.NeuralComplexity, 0.92),
        makeMetric(MetricType.BindingCoherence, 0.90),
      ];
      const alert = detector.evaluateMetrics(metrics);
      expect(alert).toBeNull();
    });

    it("returns null when only one metric is below threshold (consensus requires >= 2)", () => {
      const metrics = [
        makeMetric(MetricType.Phi, 0.80), // below warning
        makeMetric(MetricType.NeuralComplexity, 0.92), // healthy
        makeMetric(MetricType.BindingCoherence, 0.90), // healthy
      ];
      const alert = detector.evaluateMetrics(metrics);
      expect(alert).toBeNull();
    });

    it("returns alert when MIN_AGREEING_METRICS agree on fragmentation", () => {
      const metrics = [
        makeMetric(MetricType.Phi, 0.80), // below warning
        makeMetric(MetricType.NeuralComplexity, 0.82), // below warning
        makeMetric(MetricType.BindingCoherence, 0.90), // healthy
      ];
      const alert = detector.evaluateMetrics(metrics);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe(Severity.Warning);
    });

    it("uses the most severe consensus severity", () => {
      const metrics = [
        makeMetric(MetricType.Phi, 0.60), // critical
        makeMetric(MetricType.NeuralComplexity, 0.65), // critical
        makeMetric(MetricType.BindingCoherence, 0.80), // warning
      ];
      const alert = detector.evaluateMetrics(metrics);
      expect(alert).not.toBeNull();
      // Two metrics at critical, one at warning → consensus severity is critical
      expect(alert!.severity).toBe(Severity.Critical);
    });

    it("returns null for empty metrics array", () => {
      expect(detector.evaluateMetrics([])).toBeNull();
    });
  });

  // ── State ────────────────────────────────────────────────────────────────

  describe("state tracking", () => {
    it("tracks last evaluation timestamp", () => {
      const now = Date.now();
      const metric = makeMetric(MetricType.Phi, 0.95, now);
      detector.evaluateMetric(metric);
      expect(detector.state.lastEvaluationTimestampMs).toBe(now);
    });

    it("accumulates pending alerts when fragmentation detected", () => {
      const m1 = makeMetric(MetricType.Phi, 0.80, 1000);
      const m2 = makeMetric(MetricType.Phi, 0.60, 2000);
      detector.evaluateMetric(m1);
      detector.evaluateMetric(m2);
      expect(detector.pendingAlerts).toHaveLength(2);
    });

    it("drainAlerts returns and clears pending alerts", () => {
      detector.evaluateMetric(makeMetric(MetricType.Phi, 0.80));
      detector.evaluateMetric(makeMetric(MetricType.Phi, 0.60));
      const drained = detector.drainAlerts();
      expect(drained).toHaveLength(2);
      expect(detector.pendingAlerts).toHaveLength(0);
    });

    it("reports isUnified=true when no recent alerts", () => {
      expect(detector.state.isUnified).toBe(true);
    });

    it("reports isUnified=false when there are pending alerts", () => {
      detector.evaluateMetric(makeMetric(MetricType.Phi, 0.80));
      expect(detector.state.isUnified).toBe(false);
    });
  });

  // ── Integration Frame Verification ──────────────────────────────────────

  describe("verifyIntegrationFrame", () => {
    it("returns true when binding verification has sufficient unity confidence", () => {
      const result = detector.verifyIntegrationFrame({
        frameId: 1,
        channelsBound: ["ch-1", "ch-2"],
        channelsFailed: [],
        integratedInformationEstimate: 0.95,
        unityConfidence: 0.9,
      });
      expect(result).toBe(true);
    });

    it("returns false and raises alert when unity confidence is low", () => {
      const result = detector.verifyIntegrationFrame({
        frameId: 2,
        channelsBound: ["ch-1"],
        channelsFailed: ["ch-2", "ch-3"],
        integratedInformationEstimate: 0.4,
        unityConfidence: 0.3,
      });
      expect(result).toBe(false);
      expect(detector.pendingAlerts.length).toBeGreaterThan(0);
    });
  });
});
