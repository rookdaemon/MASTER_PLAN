/**
 * Fragmentation Detector — Unity Monitoring Instrumentation (UMI) core
 *
 * Evaluates unity metrics against configured thresholds and raises
 * FragmentationAlerts when phenomenal unity is at risk. Supports both
 * single-metric evaluation and multi-metric consensus (requiring
 * MIN_AGREEING_METRICS to agree before alerting).
 *
 * See: docs/unified-consciousness-mixed-substrates/ARCHITECTURE.md §3
 */

import {
  classifyFragmentationSeverity,
  MIN_AGREEING_METRICS,
  Severity,
  RecoveryActionType,
  type FragmentationDetectorConfig,
  type UnityMetric,
  type FragmentationAlert,
  type BindingVerification,
} from "./types.js";

// ── State ───────────────────────────────────────────────────────────────────

export interface FragmentationDetectorState {
  lastEvaluationTimestampMs: number | null;
  isUnified: boolean;
}

// ── Detector ────────────────────────────────────────────────────────────────

/** Minimum unity confidence for an integration frame to be considered unified */
const FRAME_UNITY_CONFIDENCE_THRESHOLD = 0.5;

export class FragmentationDetector {
  readonly config: FragmentationDetectorConfig;
  private _pendingAlerts: FragmentationAlert[] = [];
  private _lastEvaluationTimestampMs: number | null = null;

  constructor(config: FragmentationDetectorConfig) {
    this.config = config;
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  get pendingAlerts(): readonly FragmentationAlert[] {
    return this._pendingAlerts;
  }

  get state(): FragmentationDetectorState {
    return {
      lastEvaluationTimestampMs: this._lastEvaluationTimestampMs,
      isUnified: this._pendingAlerts.length === 0,
    };
  }

  // ── Single Metric Evaluation ────────────────────────────────────────────

  /**
   * Evaluate a single unity metric against thresholds.
   * Returns a FragmentationAlert if the metric indicates fragmentation,
   * or null if the metric is healthy.
   */
  evaluateMetric(metric: UnityMetric): FragmentationAlert | null {
    this._lastEvaluationTimestampMs = metric.timestampMs;

    const severity = classifyFragmentationSeverity(metric.value, this.config);
    if (severity === null) {
      return null;
    }

    const alert: FragmentationAlert = {
      severity,
      metricSnapshot: metric,
      affectedChannels: [],
      recommendedAction: this.recommendedActionForSeverity(severity),
      timestampMs: metric.timestampMs,
    };

    this._pendingAlerts.push(alert);
    return alert;
  }

  // ── Multi-Metric Consensus ──────────────────────────────────────────────

  /**
   * Evaluate multiple metrics using consensus: at least MIN_AGREEING_METRICS
   * must indicate fragmentation before an alert is raised.
   * Returns the highest-severity consensus alert, or null if consensus
   * is not reached.
   */
  evaluateMetrics(metrics: UnityMetric[]): FragmentationAlert | null {
    if (metrics.length === 0) return null;

    // Classify each metric
    const classified: Array<{ metric: UnityMetric; severity: Severity }> = [];
    for (const metric of metrics) {
      this._lastEvaluationTimestampMs = metric.timestampMs;
      const severity = classifyFragmentationSeverity(metric.value, this.config);
      if (severity !== null) {
        classified.push({ metric, severity });
      }
    }

    // Check consensus: need at least MIN_AGREEING_METRICS to agree on fragmentation
    if (classified.length < MIN_AGREEING_METRICS) {
      return null;
    }

    // Find the most severe level that has consensus (>= MIN_AGREEING_METRICS)
    const severityOrder: Severity[] = [
      Severity.Emergency,
      Severity.Critical,
      Severity.Warning,
    ];

    for (const targetSeverity of severityOrder) {
      const atOrAbove = classified.filter((c) =>
        severityIsAtLeast(c.severity, targetSeverity)
      );
      if (atOrAbove.length >= MIN_AGREEING_METRICS) {
        // Use the worst individual metric as the snapshot
        const worstMetric = atOrAbove[0].metric;
        const alert: FragmentationAlert = {
          severity: targetSeverity,
          metricSnapshot: worstMetric,
          affectedChannels: [],
          recommendedAction: this.recommendedActionForSeverity(targetSeverity),
          timestampMs: Math.max(...metrics.map((m) => m.timestampMs)),
        };
        this._pendingAlerts.push(alert);
        return alert;
      }
    }

    return null;
  }

  // ── Integration Frame Verification ──────────────────────────────────────

  /**
   * Verify that an integration frame achieved sufficient unity.
   * Returns true if unity confidence meets the threshold, false otherwise.
   * Low-confidence frames generate a fragmentation alert.
   */
  verifyIntegrationFrame(verification: BindingVerification): boolean {
    if (verification.unityConfidence >= FRAME_UNITY_CONFIDENCE_THRESHOLD) {
      return true;
    }

    const alert: FragmentationAlert = {
      severity:
        verification.unityConfidence < 0.2
          ? Severity.Emergency
          : verification.unityConfidence < 0.4
            ? Severity.Critical
            : Severity.Warning,
      metricSnapshot: {
        metricType: "BINDING_COHERENCE" as any,
        value: verification.integratedInformationEstimate,
        timestampMs: Date.now(),
        confidenceInterval: [
          verification.unityConfidence - 0.1,
          verification.unityConfidence + 0.1,
        ],
        substrateCoverage: {
          biologicalRegions: [],
          syntheticNodes: [],
          coverageFraction: 0,
        },
      },
      affectedChannels: verification.channelsFailed,
      recommendedAction: RecoveryActionType.Resync,
      timestampMs: Date.now(),
    };
    this._pendingAlerts.push(alert);
    return false;
  }

  // ── Alert Management ──────────────────────────────────────────────────

  /**
   * Returns and clears all pending alerts.
   */
  drainAlerts(): FragmentationAlert[] {
    const alerts = [...this._pendingAlerts];
    this._pendingAlerts = [];
    return alerts;
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  private recommendedActionForSeverity(severity: Severity): RecoveryActionType {
    switch (severity) {
      case Severity.Warning:
        return RecoveryActionType.Resync;
      case Severity.Critical:
        return RecoveryActionType.Consolidate;
      case Severity.Emergency:
        return RecoveryActionType.EmergencyFreeze;
    }
  }
}

// ── Severity Comparison ─────────────────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = {
  [Severity.Warning]: 1,
  [Severity.Critical]: 2,
  [Severity.Emergency]: 3,
};

/**
 * Returns true if `severity` is at least as severe as `minimum`.
 */
function severityIsAtLeast(severity: Severity, minimum: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}
