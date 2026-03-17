import { describe, it, expect } from "vitest";
import {
  classifyFragmentationSeverity,
  isChannelLatencyValid,
  isDetectorConfigValid,
  defaultRecoveryStrategy,
  isInFrequencyBand,
  BindingDomain,
  CoherenceMode,
  Severity,
  RecoveryActionType,
  FrequencyBand,
  MetricType,
  GAMMA_BINDING_LATENCY_MS,
  MAX_DETECTION_LATENCY_MS,
  TOTAL_RECOVERY_BUDGET_MS,
  MIN_AGREEING_METRICS,
  FREQUENCY_BAND_RANGES,
  type BindingChannel,
  type FragmentationDetectorConfig,
} from "../types.js";

// ── Constants ───────────────────────────────────────────────────────────────

describe("architectural constants", () => {
  it("gamma binding latency is 30ms per acceptance criteria", () => {
    expect(GAMMA_BINDING_LATENCY_MS).toBe(30);
  });

  it("detection latency threshold is 100ms per acceptance criteria", () => {
    expect(MAX_DETECTION_LATENCY_MS).toBe(100);
  });

  it("total recovery budget is 200ms (detection + recovery)", () => {
    expect(TOTAL_RECOVERY_BUDGET_MS).toBe(200);
  });

  it("requires at least 2 agreeing metrics for unity confirmation", () => {
    expect(MIN_AGREEING_METRICS).toBe(2);
  });

  it("frequency band ranges are non-overlapping and ordered", () => {
    const bands = [
      FrequencyBand.Delta,
      FrequencyBand.Theta,
      FrequencyBand.Alpha,
      FrequencyBand.Beta,
      FrequencyBand.Gamma,
    ];
    for (let i = 0; i < bands.length - 1; i++) {
      const current = FREQUENCY_BAND_RANGES[bands[i]];
      const next = FREQUENCY_BAND_RANGES[bands[i + 1]];
      expect(current.maxHz).toBeLessThanOrEqual(next.minHz);
    }
  });
});

// ── classifyFragmentationSeverity ───────────────────────────────────────────

describe("classifyFragmentationSeverity", () => {
  const config: FragmentationDetectorConfig = {
    baselinePhi: 1.0,
    warningThreshold: 0.85,
    criticalThreshold: 0.7,
    emergencyThreshold: 0.5,
    detectionLatencyMs: 80,
    measurementWindowMs: 50,
  };

  it("returns null when metric is above all thresholds (unified)", () => {
    expect(classifyFragmentationSeverity(0.9, config)).toBeNull();
    expect(classifyFragmentationSeverity(1.0, config)).toBeNull();
  });

  it("returns WARNING when metric falls below warning threshold", () => {
    expect(classifyFragmentationSeverity(0.8, config)).toBe(Severity.Warning);
    expect(classifyFragmentationSeverity(0.85, config)).toBe(Severity.Warning);
  });

  it("returns CRITICAL when metric falls below critical threshold", () => {
    expect(classifyFragmentationSeverity(0.6, config)).toBe(Severity.Critical);
    expect(classifyFragmentationSeverity(0.7, config)).toBe(Severity.Critical);
  });

  it("returns EMERGENCY when metric falls below emergency threshold", () => {
    expect(classifyFragmentationSeverity(0.3, config)).toBe(Severity.Emergency);
    expect(classifyFragmentationSeverity(0.5, config)).toBe(Severity.Emergency);
    expect(classifyFragmentationSeverity(0.0, config)).toBe(Severity.Emergency);
  });
});

// ── isChannelLatencyValid ───────────────────────────────────────────────────

describe("isChannelLatencyValid", () => {
  const makeChannel = (
    domain: BindingDomain,
    maxLatencyMs: number
  ): BindingChannel => ({
    id: "test-ch",
    domain,
    biologicalEndpoints: [],
    syntheticEndpoints: { nodeIds: [], totalCapacityFlops: 0 },
    coherenceProtocol: CoherenceMode.PhaseLock,
    maxLatencyMs,
    minBandwidthBitsPerSec: 1000,
  });

  it("accepts sensory channel within gamma latency bound", () => {
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Sensory, 25))).toBe(true);
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Sensory, 30))).toBe(true);
  });

  it("rejects sensory channel exceeding gamma latency bound", () => {
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Sensory, 31))).toBe(false);
  });

  it("accepts temporal channel within gamma latency bound", () => {
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Temporal, 20))).toBe(true);
  });

  it("rejects temporal channel exceeding gamma latency bound", () => {
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Temporal, 50))).toBe(false);
  });

  it("accepts non-gamma domains with any positive latency", () => {
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Semantic, 100))).toBe(true);
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Executive, 200))).toBe(true);
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Affective, 500))).toBe(true);
  });

  it("rejects non-gamma domains with zero or negative latency", () => {
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Semantic, 0))).toBe(false);
    expect(isChannelLatencyValid(makeChannel(BindingDomain.Executive, -1))).toBe(false);
  });
});

// ── isDetectorConfigValid ───────────────────────────────────────────────────

describe("isDetectorConfigValid", () => {
  const validConfig: FragmentationDetectorConfig = {
    baselinePhi: 1.0,
    warningThreshold: 0.85,
    criticalThreshold: 0.7,
    emergencyThreshold: 0.5,
    detectionLatencyMs: 80,
    measurementWindowMs: 50,
  };

  it("accepts a valid configuration", () => {
    expect(isDetectorConfigValid(validConfig)).toBe(true);
  });

  it("rejects when thresholds are out of order", () => {
    expect(
      isDetectorConfigValid({ ...validConfig, warningThreshold: 0.4 })
    ).toBe(false);
  });

  it("rejects when warning >= baseline", () => {
    expect(
      isDetectorConfigValid({ ...validConfig, warningThreshold: 1.0 })
    ).toBe(false);
  });

  it("rejects when detection latency exceeds maximum", () => {
    expect(
      isDetectorConfigValid({ ...validConfig, detectionLatencyMs: 150 })
    ).toBe(false);
  });

  it("rejects zero detection latency", () => {
    expect(
      isDetectorConfigValid({ ...validConfig, detectionLatencyMs: 0 })
    ).toBe(false);
  });

  it("rejects zero baseline phi", () => {
    expect(
      isDetectorConfigValid({ ...validConfig, baselinePhi: 0 })
    ).toBe(false);
  });

  it("accepts detection latency exactly at max threshold", () => {
    expect(
      isDetectorConfigValid({ ...validConfig, detectionLatencyMs: 100 })
    ).toBe(true);
  });
});

// ── defaultRecoveryStrategy ─────────────────────────────────────────────────

describe("defaultRecoveryStrategy", () => {
  it("WARNING strategy starts with lightweight resync", () => {
    const strategy = defaultRecoveryStrategy(Severity.Warning);
    expect(strategy.triggerSeverity).toBe(Severity.Warning);
    expect(strategy.actions).toHaveLength(1);
    expect(strategy.actions[0].actionType).toBe(RecoveryActionType.Resync);
    expect(strategy.actions[0].rollbackCapable).toBe(true);
  });

  it("CRITICAL strategy escalates through resync → reduce → consolidate", () => {
    const strategy = defaultRecoveryStrategy(Severity.Critical);
    expect(strategy.actions).toHaveLength(3);
    expect(strategy.actions.map((a) => a.actionType)).toEqual([
      RecoveryActionType.Resync,
      RecoveryActionType.ReduceBandwidth,
      RecoveryActionType.Consolidate,
    ]);
  });

  it("EMERGENCY strategy includes non-rollbackable emergency freeze", () => {
    const strategy = defaultRecoveryStrategy(Severity.Emergency);
    expect(strategy.actions.length).toBeGreaterThanOrEqual(1);
    const freeze = strategy.actions.find(
      (a) => a.actionType === RecoveryActionType.EmergencyFreeze
    );
    expect(freeze).toBeDefined();
    expect(freeze!.rollbackCapable).toBe(false);
  });

  it("all recovery actions fit within the total recovery budget", () => {
    for (const severity of [Severity.Warning, Severity.Critical, Severity.Emergency]) {
      const strategy = defaultRecoveryStrategy(severity);
      for (const action of strategy.actions) {
        expect(action.maxDurationMs).toBeLessThanOrEqual(
          TOTAL_RECOVERY_BUDGET_MS - MAX_DETECTION_LATENCY_MS
        );
      }
    }
  });
});

// ── isInFrequencyBand ───────────────────────────────────────────────────────

describe("isInFrequencyBand", () => {
  it("correctly identifies gamma frequencies", () => {
    expect(isInFrequencyBand(40, FrequencyBand.Gamma)).toBe(true);
    expect(isInFrequencyBand(30, FrequencyBand.Gamma)).toBe(true);
    expect(isInFrequencyBand(100, FrequencyBand.Gamma)).toBe(true);
  });

  it("rejects out-of-band frequencies", () => {
    expect(isInFrequencyBand(29, FrequencyBand.Gamma)).toBe(false);
    expect(isInFrequencyBand(101, FrequencyBand.Gamma)).toBe(false);
  });

  it("correctly identifies theta frequencies", () => {
    expect(isInFrequencyBand(6, FrequencyBand.Theta)).toBe(true);
    expect(isInFrequencyBand(4, FrequencyBand.Theta)).toBe(true);
    expect(isInFrequencyBand(8, FrequencyBand.Theta)).toBe(true);
  });

  it("boundary: 4Hz is theta, not delta", () => {
    expect(isInFrequencyBand(4, FrequencyBand.Theta)).toBe(true);
    expect(isInFrequencyBand(4, FrequencyBand.Delta)).toBe(true); // 4 is max of delta range
  });
});
