/**
 * Graceful Degradation — BioHealthMonitor Contract Tests
 *
 * Verifies every postcondition and invariant from the BioHealthMonitor contract
 * specified in card 0.2.2.4.3.
 *
 * Card: 0.2.2.4.3
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  AlertLevel,
  BioFailureType,
  type BrainRegion,
  type ActivityMetrics,
  type MetabolicMetrics,
  type PerfusionMetrics,
  type SynapticMetrics,
} from "../types.js";
import {
  DefaultBioHealthMonitor,
  computeRegionHealthScore,
  type BioSignalSource,
  type Clock,
} from "../bio-health-monitor.js";

// ── Test Helpers ─────────────────────────────────────────────────────────────

function region(name: string): BrainRegion {
  return name as BrainRegion;
}

/** Stub clock with controllable time */
function makeClock(now = 1000): Clock & { advance(ms: number): void } {
  let t = now;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

/** Default fully-healthy metrics */
const HEALTHY_ACTIVITY: ActivityMetrics = { spikeRate: 40, lfpPower: 0.9 };
const HEALTHY_METABOLIC: MetabolicMetrics = {
  oxygenSaturation: 0.95,
  glucoseLevel: 0.90,
};
const HEALTHY_VASCULAR: PerfusionMetrics = { flowRate: 0.90 };
const HEALTHY_SYNAPTIC: SynapticMetrics = {
  density: 0.90,
  transmissionFidelity: 0.90,
};

/** Build a simple stubbed signal source for one or more regions */
interface RegionSignals {
  activity?: ActivityMetrics;
  metabolic?: MetabolicMetrics;
  vascular?: PerfusionMetrics;
  synaptic?: SynapticMetrics;
}

function makeSignalSource(
  regionSignals: Record<string, RegionSignals>,
  fallback?: RegionSignals,
): BioSignalSource {
  function get<T>(
    region: BrainRegion,
    key: keyof RegionSignals,
    def: T,
  ): T {
    const rs = regionSignals[region as string];
    if (rs && key in rs) return rs[key] as T;
    if (fallback && key in fallback) return fallback[key] as T;
    return def;
  }
  return {
    getActivity: (r, _ts) =>
      get(r, "activity", HEALTHY_ACTIVITY),
    getMetabolic: (r, _ts) =>
      get(r, "metabolic", HEALTHY_METABOLIC),
    getVascular: (r, _ts) =>
      get(r, "vascular", HEALTHY_VASCULAR),
    getSynaptic: (r, _ts) =>
      get(r, "synaptic", HEALTHY_SYNAPTIC),
  };
}

// ── computeRegionHealthScore (pure helper) ────────────────────────────────────

describe("computeRegionHealthScore", () => {
  it("returns 1.0 for all-perfect metrics", () => {
    const score = computeRegionHealthScore(
      { spikeRate: 50, lfpPower: 1.0 },
      { oxygenSaturation: 1.0, glucoseLevel: 1.0 },
      { flowRate: 1.0 },
      { density: 1.0, transmissionFidelity: 1.0 },
    );
    expect(score).toBe(1.0);
  });

  it("returns 0.0 for all-zero metrics", () => {
    const score = computeRegionHealthScore(
      { spikeRate: 0, lfpPower: 0 },
      { oxygenSaturation: 0, glucoseLevel: 0 },
      { flowRate: 0 },
      { density: 0, transmissionFidelity: 0 },
    );
    expect(score).toBe(0.0);
  });

  it("clamps result to [0, 1]", () => {
    const score = computeRegionHealthScore(
      { spikeRate: 100, lfpPower: 2.0 },
      { oxygenSaturation: 2.0, glucoseLevel: 2.0 },
      { flowRate: 2.0 },
      { density: 2.0, transmissionFidelity: 2.0 },
    );
    expect(score).toBe(1.0);
  });

  it("averages the four sub-groups", () => {
    // group scores: neural=0.4, metabolic=0.5, vascular=0.6, synaptic=0.7
    // average = (0.4+0.5+0.6+0.7)/4 = 0.55
    const score = computeRegionHealthScore(
      { spikeRate: 0, lfpPower: 0.4 },
      { oxygenSaturation: 0.5, glucoseLevel: 0.5 },
      { flowRate: 0.6 },
      { density: 0.7, transmissionFidelity: 0.7 },
    );
    expect(score).toBeCloseTo(0.55, 5);
  });
});

// ── regionHealth ──────────────────────────────────────────────────────────────

describe("BioHealthMonitor.regionHealth", () => {
  it("returns a value in [0.0, 1.0] for a registered region", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({ cortex: { activity: HEALTHY_ACTIVITY } }),
      makeClock(),
    );
    const score = monitor.regionHealth(r);
    expect(score).toBeGreaterThanOrEqual(0.0);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("reflects the underlying signal source values", () => {
    const r = region("cortex");
    // Deterministic signals → deterministic health
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({
        cortex: {
          activity: { spikeRate: 0, lfpPower: 1.0 },
          metabolic: { oxygenSaturation: 1.0, glucoseLevel: 1.0 },
          vascular: { flowRate: 1.0 },
          synaptic: { density: 1.0, transmissionFidelity: 1.0 },
        },
      }),
      makeClock(),
    );
    expect(monitor.regionHealth(r)).toBe(1.0);
  });
});

// ── overallBioHealth ──────────────────────────────────────────────────────────

describe("BioHealthMonitor.overallBioHealth", () => {
  it("returns 0.0 when no regions are registered", () => {
    const monitor = new DefaultBioHealthMonitor(
      [],
      makeSignalSource({}),
      makeClock(),
    );
    expect(monitor.overallBioHealth()).toBe(0.0);
  });

  it("returns the single region's health when only one region is registered", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({
        cortex: {
          activity: { spikeRate: 0, lfpPower: 0.8 },
          metabolic: { oxygenSaturation: 0.8, glucoseLevel: 0.8 },
          vascular: { flowRate: 0.8 },
          synaptic: { density: 0.8, transmissionFidelity: 0.8 },
        },
      }),
      makeClock(),
    );
    const overall = monitor.overallBioHealth();
    const individual = monitor.regionHealth(r);
    // overall must equal individual when only one region
    expect(overall).toBeCloseTo(individual, 5);
  });

  it("returns the minimum health across all regions (invariant)", () => {
    const healthy = region("cortex");
    const sick = region("hippocampus");
    const monitor = new DefaultBioHealthMonitor(
      [healthy, sick],
      makeSignalSource({
        cortex: {
          activity: { spikeRate: 40, lfpPower: 1.0 },
          metabolic: { oxygenSaturation: 1.0, glucoseLevel: 1.0 },
          vascular: { flowRate: 1.0 },
          synaptic: { density: 1.0, transmissionFidelity: 1.0 },
        },
        hippocampus: {
          activity: { spikeRate: 0, lfpPower: 0.1 },
          metabolic: { oxygenSaturation: 0.2, glucoseLevel: 0.2 },
          vascular: { flowRate: 0.1 },
          synaptic: { density: 0.1, transmissionFidelity: 0.1 },
        },
      }),
      makeClock(),
    );
    const overall = monitor.overallBioHealth();
    const healthyScore = monitor.regionHealth(healthy);
    const sickScore = monitor.regionHealth(sick);

    expect(overall).toBeLessThanOrEqual(healthyScore);
    expect(overall).toBeLessThanOrEqual(sickScore);
    expect(overall).toBeCloseTo(sickScore, 5);
  });
});

// ── failureType ───────────────────────────────────────────────────────────────

describe("BioHealthMonitor.failureType", () => {
  it("returns NONE when all signals are healthy", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({ cortex: {} }),
      makeClock(),
    );
    expect(monitor.failureType()).toBe(BioFailureType.None);
  });

  it("returns SUDDEN when LFP power drops below threshold and spikeRate is silent", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({
        cortex: {
          activity: { spikeRate: 0.0, lfpPower: 0.01 }, // below defaults (0.05, 1.0)
        },
      }),
      makeClock(),
    );
    expect(monitor.failureType()).toBe(BioFailureType.Sudden);
  });

  it("returns NONE when LFP dropout is present but spikeRate is above silence threshold", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({
        cortex: {
          activity: { spikeRate: 5.0, lfpPower: 0.01 },
        },
      }),
      makeClock(),
    );
    // Spike rate is above neuralSilenceHz default (1.0), so not SUDDEN
    expect(monitor.failureType()).not.toBe(BioFailureType.Sudden);
  });

  it("returns GRADUAL after accumulating consistently declining trend", () => {
    const r = region("cortex");
    const clock = makeClock(0);

    // Signal source returns health that decreases over time
    let callCount = 0;
    const source: BioSignalSource = {
      getActivity: (_r, _ts) => ({ spikeRate: 10, lfpPower: Math.max(0, 1.0 - callCount * 0.05) }),
      getMetabolic: () => ({ oxygenSaturation: 0.5, glucoseLevel: 0.5 }),
      getVascular: () => ({ flowRate: 0.5 }),
      getSynaptic: () => ({ density: 0.5, transmissionFidelity: 0.5 }),
    };

    const monitor = new DefaultBioHealthMonitor([r], source, clock, {
      minSamplesForProjection: 3,
      gradualSlopeThreshold: -1e-5,
    });

    // Sample health 10 times, each time advancing 1000ms and dropping health
    for (let i = 0; i < 10; i++) {
      callCount++;
      monitor.regionHealth(r);
      clock.advance(1000);
    }

    expect(monitor.failureType()).toBe(BioFailureType.Gradual);
  });
});

// ── projectedDecline ──────────────────────────────────────────────────────────

describe("BioHealthMonitor.projectedDecline", () => {
  it("returns timeToCritical_ms = -1 when no decline trend detected", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({ cortex: {} }),
      makeClock(),
    );
    const projection = monitor.projectedDecline(60_000);
    expect(projection.timeToCritical_ms).toBe(-1);
  });

  it("returns confidence ≥ 0.0 always", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({ cortex: {} }),
      makeClock(),
    );
    const projection = monitor.projectedDecline(60_000);
    expect(projection.confidence).toBeGreaterThanOrEqual(0.0);
  });

  it("returns projectedHealth in [0, 1]", () => {
    const r = region("cortex");
    const monitor = new DefaultBioHealthMonitor(
      [r],
      makeSignalSource({ cortex: {} }),
      makeClock(),
    );
    const projection = monitor.projectedDecline(60_000);
    expect(projection.projectedHealth).toBeGreaterThanOrEqual(0.0);
    expect(projection.projectedHealth).toBeLessThanOrEqual(1.0);
  });

  it("returns positive timeToCritical_ms when health is declining toward critical", () => {
    const r = region("cortex");
    const clock = makeClock(0);

    // Linearly declining signal: health drops ~0.01 per 1000ms
    let tick = 0;
    const source: BioSignalSource = {
      getActivity: () => ({ spikeRate: 10, lfpPower: Math.max(0, 0.9 - tick * 0.01) }),
      getMetabolic: () => ({ oxygenSaturation: 0.9, glucoseLevel: 0.9 }),
      getVascular: () => ({ flowRate: 0.9 }),
      getSynaptic: () => ({ density: 0.9, transmissionFidelity: 0.9 }),
    };

    const monitor = new DefaultBioHealthMonitor([r], source, clock, {
      minSamplesForProjection: 3,
    });

    // Build history with consistent negative slope
    for (let i = 0; i < 10; i++) {
      tick++;
      monitor.regionHealth(r);
      clock.advance(1000);
    }

    const projection = monitor.projectedDecline(60_000);
    expect(projection.timeToCritical_ms).toBeGreaterThan(0);
  });

  it("returns higher confidence with more samples", () => {
    const r = region("cortex");
    const clock = makeClock(0);

    let tick = 0;
    const source: BioSignalSource = {
      getActivity: () => ({ spikeRate: 10, lfpPower: Math.max(0, 1.0 - tick * 0.01) }),
      getMetabolic: () => ({ oxygenSaturation: 0.9, glucoseLevel: 0.9 }),
      getVascular: () => ({ flowRate: 0.9 }),
      getSynaptic: () => ({ density: 0.9, transmissionFidelity: 0.9 }),
    };

    const monitor = new DefaultBioHealthMonitor([r], source, clock, {
      minSamplesForProjection: 3,
    });

    // Sample 3 times (minimum)
    for (let i = 0; i < 3; i++) {
      tick++;
      monitor.regionHealth(r);
      clock.advance(1000);
    }
    const lowConfidence = monitor.projectedDecline(60_000).confidence;

    // Sample 20 more times
    for (let i = 0; i < 20; i++) {
      tick++;
      monitor.regionHealth(r);
      clock.advance(1000);
    }
    const highConfidence = monitor.projectedDecline(60_000).confidence;

    expect(highConfidence).toBeGreaterThanOrEqual(lowConfidence);
  });
});

// ── alertLevel ────────────────────────────────────────────────────────────────

describe("BioHealthMonitor.alertLevel", () => {
  function monitorWithHealth(health: number): DefaultBioHealthMonitor {
    const r = region("r");
    // Construct signals that produce the desired health score.
    // health = (lfpPower + (O2+glucose)/2 + flowRate + (density+fidelity)/2) / 4
    // Simplest: set all four group scores to `health`.
    const source: BioSignalSource = {
      getActivity: () => ({ spikeRate: 10, lfpPower: health }),
      getMetabolic: () => ({ oxygenSaturation: health, glucoseLevel: health }),
      getVascular: () => ({ flowRate: health }),
      getSynaptic: () => ({ density: health, transmissionFidelity: health }),
    };
    return new DefaultBioHealthMonitor([r], source, makeClock());
  }

  it("returns NONE when overallBioHealth ≥ 0.80", () => {
    expect(monitorWithHealth(1.0).alertLevel()).toBe(AlertLevel.None);
    expect(monitorWithHealth(0.80).alertLevel()).toBe(AlertLevel.None);
  });

  it("returns WARNING when 0.50 ≤ overallBioHealth < 0.80", () => {
    expect(monitorWithHealth(0.79).alertLevel()).toBe(AlertLevel.Warning);
    expect(monitorWithHealth(0.50).alertLevel()).toBe(AlertLevel.Warning);
  });

  it("returns CRITICAL when 0.25 ≤ overallBioHealth < 0.50", () => {
    expect(monitorWithHealth(0.49).alertLevel()).toBe(AlertLevel.Critical);
    expect(monitorWithHealth(0.25).alertLevel()).toBe(AlertLevel.Critical);
  });

  it("returns EMERGENCY when overallBioHealth < 0.25", () => {
    expect(monitorWithHealth(0.24).alertLevel()).toBe(AlertLevel.Emergency);
    expect(monitorWithHealth(0.0).alertLevel()).toBe(AlertLevel.Emergency);
  });

  it("alert level is monotonically determined by overallBioHealth (invariant)", () => {
    const levels = [0.0, 0.1, 0.24, 0.25, 0.49, 0.50, 0.79, 0.80, 1.0].map(
      (h) => monitorWithHealth(h).alertLevel(),
    );
    // Verify the order matches enum order (lower health → higher alert)
    const expected = [
      AlertLevel.Emergency,
      AlertLevel.Emergency,
      AlertLevel.Emergency,
      AlertLevel.Critical,
      AlertLevel.Critical,
      AlertLevel.Warning,
      AlertLevel.Warning,
      AlertLevel.None,
      AlertLevel.None,
    ];
    expect(levels).toEqual(expected);
  });
});

// ── Other interface methods (neuralActivityLevel, metabolicStatus, etc.) ──────

describe("BioHealthMonitor passthrough signal methods", () => {
  const r = region("cortex");
  const source = makeSignalSource({
    cortex: {
      activity: { spikeRate: 42, lfpPower: 0.8 },
      metabolic: { oxygenSaturation: 0.92, glucoseLevel: 0.85 },
      vascular: { flowRate: 0.88 },
      synaptic: { density: 0.77, transmissionFidelity: 0.80 },
    },
  });
  const monitor = new DefaultBioHealthMonitor([r], source, makeClock());

  it("neuralActivityLevel returns the source activity metrics", () => {
    const metrics = monitor.neuralActivityLevel(r);
    expect(metrics.spikeRate).toBe(42);
    expect(metrics.lfpPower).toBe(0.8);
  });

  it("metabolicStatus returns the source metabolic metrics", () => {
    const metrics = monitor.metabolicStatus(r);
    expect(metrics.oxygenSaturation).toBe(0.92);
    expect(metrics.glucoseLevel).toBe(0.85);
  });

  it("vascularFlow returns the source perfusion metrics", () => {
    expect(monitor.vascularFlow(r).flowRate).toBe(0.88);
  });

  it("synapticIntegrity returns the source synaptic metrics", () => {
    const metrics = monitor.synapticIntegrity(r);
    expect(metrics.density).toBe(0.77);
    expect(metrics.transmissionFidelity).toBe(0.80);
  });
});
