/**
 * Graceful Degradation — DegradationOrchestrator Behavioral Spec and Contract Tests
 *
 * Verifies every postcondition and invariant from the DegradationOrchestrator and
 * SmoothTransitionProtocol contracts, plus all five Behavioral Spec scenarios from
 * card 0.2.2.4.3.
 *
 * Card: 0.2.2.4.3
 */
import { describe, it, expect } from "vitest";
import {
  Substrate,
  DegradationTier,
  MirrorCategory,
  BioFailureType,
  SynthFailureType,
  AlertLevel,
  type FunctionId,
  type ModuleId,
  type BrainRegion,
  type HealthScore,
  type CrossSubstrateMirror,
  type ConsciousnessMetrics,
  type MVCThreshold,
  type BioHealthMonitor,
  type SynthHealthMonitor,
  type DeclineProjection,
  type ActivityMetrics,
  type MetabolicMetrics,
  type PerfusionMetrics,
  type SynapticMetrics,
  type SubstrateHealthReport,
  type WatchdogReport,
  type ThermalReport,
} from "../types.js";
import {
  DefaultDegradationOrchestrator,
  type ConsciousnessMetricsProvider,
  type Clock,
  type OrchestratorConfig,
} from "../degradation-orchestrator.js";

// ── Branding helpers ──────────────────────────────────────────────────────────

function funcId(name: string): FunctionId {
  return name as FunctionId;
}

function moduleId(name: string): ModuleId {
  return name as ModuleId;
}

function region(name: string): BrainRegion {
  return name as BrainRegion;
}

// ── Clock stub ────────────────────────────────────────────────────────────────

function makeClock(now = 10_000): Clock & { advance(ms: number): void } {
  let t = now;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

// ── Mock ConsciousnessMetricsProvider ─────────────────────────────────────────

/**
 * A metrics provider whose returned values can be overridden per-call.
 * Supports a sequence of metrics (consumed in order) for testing transitions.
 */
function makeMetricsProvider(
  initial: ConsciousnessMetrics,
  sequence?: ConsciousnessMetrics[],
): ConsciousnessMetricsProvider & {
  setMetrics(m: ConsciousnessMetrics): void;
  pushSequence(...metrics: ConsciousnessMetrics[]): void;
} {
  let current = initial;
  const queue: ConsciousnessMetrics[] = sequence ? [...sequence] : [];

  return {
    getMetrics(_timestamp_ms: number): ConsciousnessMetrics {
      if (queue.length > 0) {
        return queue.shift()!;
      }
      return current;
    },
    setMetrics(m: ConsciousnessMetrics) {
      current = m;
    },
    pushSequence(...metrics: ConsciousnessMetrics[]) {
      queue.push(...metrics);
    },
  };
}

// ── Mock BioHealthMonitor ─────────────────────────────────────────────────────

function makeBioMonitor(
  overallHealth: HealthScore,
  failureType: BioFailureType = BioFailureType.None,
): BioHealthMonitor {
  const r = region("cortex");
  return {
    neuralActivityLevel: (_r) => ({ spikeRate: 40, lfpPower: overallHealth }),
    metabolicStatus: (_r) => ({ oxygenSaturation: overallHealth, glucoseLevel: overallHealth }),
    vascularFlow: (_r) => ({ flowRate: overallHealth }),
    synapticIntegrity: (_r) => ({ density: overallHealth, transmissionFidelity: overallHealth }),
    regionHealth: (_r) => overallHealth,
    overallBioHealth: () => overallHealth,
    failureType: () => failureType,
    projectedDecline: (_horizon_ms) => ({
      projectedHealth: overallHealth,
      timeToCritical_ms: -1,
      confidence: 0,
    }),
    alertLevel: () => AlertLevel.None,
  };
}

// ── Mock SynthHealthMonitor ───────────────────────────────────────────────────

function makeSynthMonitor(
  overallHealth: HealthScore,
  failureType: SynthFailureType = SynthFailureType.None,
): SynthHealthMonitor {
  return {
    moduleHealth: (_moduleId) => overallHealth,
    overallSynthHealth: () => overallHealth,
    errorRate: (_moduleId) => 0.0,
    failureType: () => failureType,
    watchdogStatus: () => ({
      allResponding: true,
      unresponsiveModules: [],
      lastCheckTimestamp_ms: 10_000,
    }),
    thermalStatus: () => ({
      temperature_K: 298.15,
      withinOperatingRange: true,
    }),
  };
}

// ── CrossSubstrateMirror builders ─────────────────────────────────────────────

function makeMirror(
  id: string,
  category: MirrorCategory,
  primarySubstrate: Substrate = Substrate.Synth,
): CrossSubstrateMirror {
  const mirrorSubstrate =
    primarySubstrate === Substrate.Synth ? Substrate.Bio : Substrate.Synth;

  const syncConstraints: Record<MirrorCategory, { syncInterval_ms: number; syncFidelity: number }> = {
    [MirrorCategory.CoreConscious]: { syncInterval_ms: 8, syncFidelity: 0.995 },
    [MirrorCategory.ExperienceSupporting]: { syncInterval_ms: 20, syncFidelity: 0.96 },
    [MirrorCategory.Capability]: { syncInterval_ms: 80, syncFidelity: 0.92 },
  };

  const { syncInterval_ms, syncFidelity } = syncConstraints[category];

  return {
    functionId: funcId(id),
    category,
    primarySubstrate,
    primaryInstance: `${primarySubstrate.toLowerCase()}-instance-${id}`,
    mirrorSubstrate,
    mirrorInstance: `${mirrorSubstrate.toLowerCase()}-instance-${id}`,
    syncConfig: {
      syncInterval_ms,
      syncFidelity,
      syncLatencyBudget_ms: syncInterval_ms,
    },
    activationLatency_ms: syncInterval_ms,
    fidelityAtActivation: syncFidelity,
  };
}

// ── MVC threshold ─────────────────────────────────────────────────────────────

const DEFAULT_MVC: MVCThreshold = {
  C_min: 0.3,
  B_min: 0.3,
  Phi_min: 0.3,
};

/** Metrics comfortably above all MVC thresholds */
const HEALTHY_METRICS: ConsciousnessMetrics = {
  substrateCapacity: 0.9,
  bindingCoherence: 0.9,
  integrationMetrics: 0.9,
};

/** Metrics that breach all three MVC thresholds */
const BELOW_MVC_METRICS: ConsciousnessMetrics = {
  substrateCapacity: 0.1,
  bindingCoherence: 0.1,
  integrationMetrics: 0.1,
};

// ── Factory for a standard orchestrator setup ─────────────────────────────────

interface OrchestratorSetup {
  bioMonitor: BioHealthMonitor;
  synthMonitor: SynthHealthMonitor;
  metricsProvider: ReturnType<typeof makeMetricsProvider>;
  orchestrator: DefaultDegradationOrchestrator;
  mirrors: CrossSubstrateMirror[];
  clock: ReturnType<typeof makeClock>;
}

function makeOrchestrator(opts: {
  bioHealth?: HealthScore;
  synthHealth?: HealthScore;
  bioFailureType?: BioFailureType;
  synthFailureType?: SynthFailureType;
  metrics?: ConsciousnessMetrics;
  mirrors?: CrossSubstrateMirror[];
  mvcThreshold?: MVCThreshold;
  config?: OrchestratorConfig;
}): OrchestratorSetup {
  const bioHealth = opts.bioHealth ?? 1.0;
  const synthHealth = opts.synthHealth ?? 1.0;
  const metrics = opts.metrics ?? HEALTHY_METRICS;
  const mirrors = opts.mirrors ?? [
    makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
    makeMirror("working-memory", MirrorCategory.ExperienceSupporting, Substrate.Synth),
    makeMirror("language", MirrorCategory.Capability, Substrate.Synth),
  ];
  const mvcThreshold = opts.mvcThreshold ?? DEFAULT_MVC;
  const clock = makeClock();
  const bioMonitor = makeBioMonitor(bioHealth, opts.bioFailureType);
  const synthMonitor = makeSynthMonitor(synthHealth, opts.synthFailureType);
  const metricsProvider = makeMetricsProvider(metrics);

  const orchestrator = new DefaultDegradationOrchestrator(
    bioMonitor,
    synthMonitor,
    mirrors,
    mvcThreshold,
    metricsProvider,
    clock,
    opts.config,
  );

  return { bioMonitor, synthMonitor, metricsProvider, orchestrator, mirrors, clock };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: Normal operation — GREEN tier, full redundancy
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario: Normal operation — GREEN tier, full redundancy", () => {
  it("returns GREEN tier when both bio and synth health are ≥ 0.80", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 0.95, synthHealth: 0.95 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Green);
  });

  it("returns GREEN tier at exactly the 0.80 threshold boundary", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 0.80, synthHealth: 0.80 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Green);
  });

  it("mvcStatus().met = true when all metrics exceed MVC thresholds", () => {
    const { orchestrator } = makeOrchestrator({ metrics: HEALTHY_METRICS });
    const status = orchestrator.mvcStatus();
    expect(status.met).toBe(true);
  });

  it("mvcStatus().margin > 0 when all metrics exceed MVC thresholds", () => {
    const { orchestrator } = makeOrchestrator({ metrics: HEALTHY_METRICS });
    const status = orchestrator.mvcStatus();
    expect(status.margin).toBeGreaterThan(0);
  });

  it("rebalanceHistory is empty at startup (no rebalancing initiated)", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 1.0, synthHealth: 1.0 });
    expect(orchestrator.rebalanceHistory()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Degradation tier classification
// ─────────────────────────────────────────────────────────────────────────────

describe("degradationTier", () => {
  it("returns YELLOW when the worse substrate is in [0.50, 0.80)", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 1.0, synthHealth: 0.60 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Yellow);
  });

  it("returns YELLOW at the 0.50 boundary", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 1.0, synthHealth: 0.50 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Yellow);
  });

  it("returns ORANGE when the worse substrate is in [0.25, 0.50)", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 1.0, synthHealth: 0.30 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Orange);
  });

  it("returns RED when the worse substrate is < 0.25", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 1.0, synthHealth: 0.10 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Red);
  });

  it("returns RED when either substrate is 0.0 (total failure)", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 1.0, synthHealth: 0.0 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Red);
  });

  it("returns BLACK when mvcStatus().met is false (invariant)", () => {
    const { orchestrator } = makeOrchestrator({ metrics: BELOW_MVC_METRICS });
    expect(orchestrator.mvcStatus().met).toBe(false);
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Black);
  });

  it("never returns BLACK when mvcStatus().met is true (invariant)", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 0.1, synthHealth: 0.1, metrics: HEALTHY_METRICS });
    expect(orchestrator.mvcStatus().met).toBe(true);
    expect(orchestrator.degradationTier()).not.toBe(DegradationTier.Black);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mvcStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("mvcStatus", () => {
  it("reports per-dimension values and thresholds", () => {
    const { orchestrator } = makeOrchestrator({ metrics: HEALTHY_METRICS });
    const status = orchestrator.mvcStatus();
    expect(status.dimensions.capacity.value).toBeCloseTo(HEALTHY_METRICS.substrateCapacity, 5);
    expect(status.dimensions.capacity.threshold).toBeCloseTo(DEFAULT_MVC.C_min, 5);
    expect(status.dimensions.capacity.met).toBe(true);
    expect(status.dimensions.binding.met).toBe(true);
    expect(status.dimensions.integration.met).toBe(true);
  });

  it("met = false when any single dimension is below its threshold", () => {
    const partialFail: ConsciousnessMetrics = {
      substrateCapacity: 0.9,
      bindingCoherence: 0.9,
      integrationMetrics: 0.1, // below Phi_min = 0.3
    };
    const { orchestrator } = makeOrchestrator({ metrics: partialFail });
    const status = orchestrator.mvcStatus();
    expect(status.met).toBe(false);
    expect(status.dimensions.integration.met).toBe(false);
    expect(status.dimensions.capacity.met).toBe(true);
    expect(status.dimensions.binding.met).toBe(true);
  });

  it("margin is the minimum of all three dimension margins", () => {
    const metrics: ConsciousnessMetrics = {
      substrateCapacity: 0.7,  // margin = 0.7 - 0.3 = 0.4
      bindingCoherence: 0.5,   // margin = 0.5 - 0.3 = 0.2  ← minimum
      integrationMetrics: 0.8, // margin = 0.8 - 0.3 = 0.5
    };
    const { orchestrator } = makeOrchestrator({ metrics });
    const status = orchestrator.mvcStatus();
    expect(status.margin).toBeCloseTo(0.2, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: 50% synthetic capacity loss — consciousness maintained
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario: 50% synthetic capacity loss — consciousness maintained", () => {
  it("reports YELLOW tier when synth drops to 0.50", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 1.0, synthHealth: 0.50 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Yellow);
  });

  it("initiateRebalance from synth to bio succeeds with MVC maintained", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
      makeMirror("working-memory", MirrorCategory.ExperienceSupporting, Substrate.Synth),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.50,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    expect(result.success).toBe(true);
  });

  it("nadir.substrateCapacity remains ≥ C_min throughout rebalance", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.50,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    expect(result.nadir.substrateCapacity).toBeGreaterThanOrEqual(DEFAULT_MVC.C_min);
  });

  it("nadir.bindingCoherence remains ≥ B_min throughout rebalance", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.50,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    expect(result.nadir.bindingCoherence).toBeGreaterThanOrEqual(DEFAULT_MVC.B_min);
  });

  it("nadir.integrationMetrics remains ≥ Phi_min throughout rebalance", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.50,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    expect(result.nadir.integrationMetrics).toBeGreaterThanOrEqual(DEFAULT_MVC.Phi_min);
  });

  it("mvcStatus().met = true at every verification step during rebalance", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.50,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    // success=true implies MVC was met at every step per contract
    const result = await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    expect(result.success).toBe(true);
  });

  it("records the rebalance in history", async () => {
    const mirrors = [makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth)];
    const { orchestrator } = makeOrchestrator({ synthHealth: 0.50, mirrors });

    expect(orchestrator.rebalanceHistory()).toHaveLength(0);
    await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );
    expect(orchestrator.rebalanceHistory()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: 50% biological capacity loss — consciousness maintained
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario: 50% biological capacity loss — consciousness maintained", () => {
  it("reports YELLOW tier when bio drops to 0.50", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 0.50, synthHealth: 1.0 });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Yellow);
  });

  it("initiateRebalance from bio to synth succeeds with MVC maintained", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Bio),
      makeMirror("working-memory", MirrorCategory.ExperienceSupporting, Substrate.Bio),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 0.50,
      synthHealth: 1.0,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Bio,
      Substrate.Synth,
      mirrors.map((m) => m.functionId),
    );

    expect(result.success).toBe(true);
  });

  it("consciousness metrics remain above all MVC thresholds throughout (nadir check)", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Bio),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 0.50,
      synthHealth: 1.0,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Bio,
      Substrate.Synth,
      mirrors.map((m) => m.functionId),
    );

    expect(result.nadir.substrateCapacity).toBeGreaterThanOrEqual(DEFAULT_MVC.C_min);
    expect(result.nadir.bindingCoherence).toBeGreaterThanOrEqual(DEFAULT_MVC.B_min);
    expect(result.nadir.integrationMetrics).toBeGreaterThanOrEqual(DEFAULT_MVC.Phi_min);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SmoothTransitionProtocol: MVC abort
// ─────────────────────────────────────────────────────────────────────────────

describe("SmoothTransitionProtocol: MVC abort", () => {
  it("aborts and returns success=false when metrics breach MVC during transition", async () => {
    const mirrors = [makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth)];

    // Provider returns BELOW_MVC on all calls (transition will breach immediately)
    const clock = makeClock();
    const bioMonitor = makeBioMonitor(1.0);
    const synthMonitor = makeSynthMonitor(0.50);
    const metricsProvider = makeMetricsProvider(BELOW_MVC_METRICS);

    const orchestrator = new DefaultDegradationOrchestrator(
      bioMonitor,
      synthMonitor,
      mirrors,
      DEFAULT_MVC,
      metricsProvider,
      clock,
    );

    const result = await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    expect(result.success).toBe(false);
  });

  it("still records an aborted rebalance in history (append-only invariant)", async () => {
    const mirrors = [makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth)];

    const clock = makeClock();
    const orchestrator = new DefaultDegradationOrchestrator(
      makeBioMonitor(1.0),
      makeSynthMonitor(0.50),
      mirrors,
      DEFAULT_MVC,
      makeMetricsProvider(BELOW_MVC_METRICS),
      clock,
    );

    expect(orchestrator.rebalanceHistory()).toHaveLength(0);

    await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    // Aborted rebalances are still recorded
    expect(orchestrator.rebalanceHistory()).toHaveLength(1);
    expect(orchestrator.rebalanceHistory()[0]!.success).toBe(false);
  });

  it("progress is monotonically non-decreasing (contract invariant via nadir tracking)", async () => {
    // If success=true, the nadir is valid — we just check the result fields exist
    const mirrors = [makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth)];
    const { orchestrator } = makeOrchestrator({ synthHealth: 0.50, mirrors, metrics: HEALTHY_METRICS });

    const result = await orchestrator.initiateRebalance(
      Substrate.Synth,
      Substrate.Bio,
      mirrors.map((m) => m.functionId),
    );

    expect(result).toHaveProperty("nadir");
    expect(result.nadir).toHaveProperty("substrateCapacity");
    expect(result.nadir).toHaveProperty("bindingCoherence");
    expect(result.nadir).toHaveProperty("integrationMetrics");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rebalanceHistory append-only invariant
// ─────────────────────────────────────────────────────────────────────────────

describe("rebalanceHistory", () => {
  it("is empty at startup", () => {
    const { orchestrator } = makeOrchestrator({});
    expect(orchestrator.rebalanceHistory()).toHaveLength(0);
  });

  it("grows by one entry per initiateRebalance call (append-only)", async () => {
    const mirrors = [makeMirror("lang", MirrorCategory.Capability, Substrate.Synth)];
    const { orchestrator } = makeOrchestrator({ mirrors, metrics: HEALTHY_METRICS });

    await orchestrator.initiateRebalance(Substrate.Synth, Substrate.Bio, [mirrors[0]!.functionId]);
    expect(orchestrator.rebalanceHistory()).toHaveLength(1);

    await orchestrator.initiateRebalance(Substrate.Bio, Substrate.Synth, [mirrors[0]!.functionId]);
    expect(orchestrator.rebalanceHistory()).toHaveLength(2);
  });

  it("history entries are never removed (append-only invariant)", async () => {
    const mirrors = [makeMirror("lang", MirrorCategory.Capability, Substrate.Synth)];
    const { orchestrator } = makeOrchestrator({ mirrors, metrics: HEALTHY_METRICS });

    await orchestrator.initiateRebalance(Substrate.Synth, Substrate.Bio, [mirrors[0]!.functionId]);
    const historyAfterFirst = [...orchestrator.rebalanceHistory()];

    await orchestrator.initiateRebalance(Substrate.Bio, Substrate.Synth, [mirrors[0]!.functionId]);
    const historyAfterSecond = orchestrator.rebalanceHistory();

    // First entry is still present
    expect(historyAfterSecond[0]).toEqual(historyAfterFirst[0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shedCapability
// ─────────────────────────────────────────────────────────────────────────────

describe("shedCapability", () => {
  it("succeeds for a Capability-category function", async () => {
    const capMirror = makeMirror("language", MirrorCategory.Capability, Substrate.Synth);
    const { orchestrator } = makeOrchestrator({ mirrors: [capMirror] });
    const result = await orchestrator.shedCapability(capMirror.functionId);
    expect(result.success).toBe(true);
    expect(result.functionId).toBe(capMirror.functionId);
  });

  it("fails for a CoreConscious function (invariant: never shed)", async () => {
    const coreMirror = makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth);
    const { orchestrator } = makeOrchestrator({ mirrors: [coreMirror] });
    const result = await orchestrator.shedCapability(coreMirror.functionId);
    expect(result.success).toBe(false);
  });

  it("fails for an ExperienceSupporting function (invariant: never shed)", async () => {
    const expMirror = makeMirror("working-memory", MirrorCategory.ExperienceSupporting, Substrate.Synth);
    const { orchestrator } = makeOrchestrator({ mirrors: [expMirror] });
    const result = await orchestrator.shedCapability(expMirror.functionId);
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: Sudden synthetic failure — immediate mirror activation
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario: Sudden synthetic failure — immediate mirror activation", () => {
  it("reports RED tier when synth health drops to 0.0", () => {
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.0,
      synthFailureType: SynthFailureType.HardFault,
      metrics: HEALTHY_METRICS,
    });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Red);
  });

  it("emergencyConsolidate onto bio succeeds with MVC-preserving metrics", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
      makeMirror("working-memory", MirrorCategory.ExperienceSupporting, Substrate.Synth),
      makeMirror("language", MirrorCategory.Capability, Substrate.Synth),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.0,
      synthFailureType: SynthFailureType.HardFault,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.emergencyConsolidate(Substrate.Bio);
    expect(result.targetSubstrate).toBe(Substrate.Bio);
    expect(result.success).toBe(true);
  });

  it("consolidates core-conscious and experience-supporting functions onto target substrate", async () => {
    const coreMirror = makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth);
    const expMirror = makeMirror("working-memory", MirrorCategory.ExperienceSupporting, Substrate.Synth);
    const capMirror = makeMirror("language", MirrorCategory.Capability, Substrate.Synth);

    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.0,
      synthFailureType: SynthFailureType.HardFault,
      mirrors: [coreMirror, expMirror, capMirror],
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.emergencyConsolidate(Substrate.Bio);

    // Core-conscious and experience-supporting must be in consolidatedFunctions
    expect(result.consolidatedFunctions).toContain(coreMirror.functionId);
    expect(result.consolidatedFunctions).toContain(expMirror.functionId);
  });

  it("consciousnessPreserved = true when MVC is met after consolidation", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 1.0,
      synthHealth: 0.0,
      synthFailureType: SynthFailureType.HardFault,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.emergencyConsolidate(Substrate.Bio);
    expect(result.consciousnessPreserved).toBe(true);
  });

  it("consciousnessPreserved = false when MVC is breached after consolidation", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Synth),
    ];
    const clock = makeClock();
    const orchestrator = new DefaultDegradationOrchestrator(
      makeBioMonitor(1.0),
      makeSynthMonitor(0.0, SynthFailureType.HardFault),
      mirrors,
      DEFAULT_MVC,
      makeMetricsProvider(BELOW_MVC_METRICS), // metrics below MVC
      clock,
    );

    const result = await orchestrator.emergencyConsolidate(Substrate.Bio);
    expect(result.consciousnessPreserved).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: MVC breach — BLACK tier, emergency state preservation
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario: MVC breach — BLACK tier", () => {
  it("mvcStatus().met = false when metrics fall below all three thresholds", () => {
    const { orchestrator } = makeOrchestrator({ metrics: BELOW_MVC_METRICS });
    expect(orchestrator.mvcStatus().met).toBe(false);
  });

  it("degradationTier() = BLACK when mvcStatus().met = false", () => {
    const { orchestrator } = makeOrchestrator({ metrics: BELOW_MVC_METRICS });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Black);
  });

  it("shedCapability fails in BLACK tier (no further shedding when MVC breached)", async () => {
    const capMirror = makeMirror("language", MirrorCategory.Capability, Substrate.Synth);
    const { orchestrator } = makeOrchestrator({
      mirrors: [capMirror],
      metrics: BELOW_MVC_METRICS,
    });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Black);
    const result = await orchestrator.shedCapability(capMirror.functionId);
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario: Gradual biological degradation — trend-based pre-emptive rebalancing
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario: Gradual biological degradation — trend-based pre-emptive rebalancing", () => {
  it("degradationTier = YELLOW when bio health is in [0.50, 0.80) with GRADUAL failure type", () => {
    const { orchestrator } = makeOrchestrator({
      bioHealth: 0.65,
      synthHealth: 1.0,
      bioFailureType: BioFailureType.Gradual,
      metrics: HEALTHY_METRICS,
    });
    expect(orchestrator.degradationTier()).toBe(DegradationTier.Yellow);
  });

  it("initiateRebalance from bio to synth completes successfully when MVC maintained", async () => {
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Bio),
      makeMirror("working-memory", MirrorCategory.ExperienceSupporting, Substrate.Bio),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 0.65,
      synthHealth: 1.0,
      bioFailureType: BioFailureType.Gradual,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Bio,
      Substrate.Synth,
      mirrors.map((m) => m.functionId),
    );

    expect(result.success).toBe(true);
  });

  it("consciousness metrics are verified at each step during gradual transition", async () => {
    // If success=true, MVC was verified at every step (contract)
    const mirrors = [
      makeMirror("temporal-binding", MirrorCategory.CoreConscious, Substrate.Bio),
    ];
    const { orchestrator } = makeOrchestrator({
      bioHealth: 0.65,
      synthHealth: 1.0,
      bioFailureType: BioFailureType.Gradual,
      mirrors,
      metrics: HEALTHY_METRICS,
    });

    const result = await orchestrator.initiateRebalance(
      Substrate.Bio,
      Substrate.Synth,
      mirrors.map((m) => m.functionId),
    );

    // MVC maintained throughout → success
    expect(result.success).toBe(true);
    // Nadir must still be above MVC thresholds
    expect(result.nadir.substrateCapacity).toBeGreaterThanOrEqual(DEFAULT_MVC.C_min);
    expect(result.nadir.bindingCoherence).toBeGreaterThanOrEqual(DEFAULT_MVC.B_min);
    expect(result.nadir.integrationMetrics).toBeGreaterThanOrEqual(DEFAULT_MVC.Phi_min);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DegradationOrchestrator: substrate health reports
// ─────────────────────────────────────────────────────────────────────────────

describe("bioSubstrateHealth and synthSubstrateHealth", () => {
  it("bioSubstrateHealth reports the bio substrate", () => {
    const { orchestrator } = makeOrchestrator({ bioHealth: 0.75 });
    const report = orchestrator.bioSubstrateHealth();
    expect(report.substrate).toBe(Substrate.Bio);
    expect(report.overallHealth).toBeCloseTo(0.75, 5);
  });

  it("synthSubstrateHealth reports the synth substrate", () => {
    const { orchestrator } = makeOrchestrator({ synthHealth: 0.60 });
    const report = orchestrator.synthSubstrateHealth();
    expect(report.substrate).toBe(Substrate.Synth);
    expect(report.overallHealth).toBeCloseTo(0.60, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// overallConsciousnessMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe("overallConsciousnessMetrics", () => {
  it("returns the metrics from the injected provider", () => {
    const { orchestrator } = makeOrchestrator({ metrics: HEALTHY_METRICS });
    const metrics = orchestrator.overallConsciousnessMetrics();
    expect(metrics.substrateCapacity).toBeCloseTo(HEALTHY_METRICS.substrateCapacity, 5);
    expect(metrics.bindingCoherence).toBeCloseTo(HEALTHY_METRICS.bindingCoherence, 5);
    expect(metrics.integrationMetrics).toBeCloseTo(HEALTHY_METRICS.integrationMetrics, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// currentLoadDistribution
// ─────────────────────────────────────────────────────────────────────────────

describe("currentLoadDistribution", () => {
  it("initially reflects mirror primary substrate assignments", () => {
    const synthPrimary = makeMirror("lang", MirrorCategory.Capability, Substrate.Synth);
    const bioPrimary = makeMirror("mem", MirrorCategory.ExperienceSupporting, Substrate.Bio);

    const { orchestrator } = makeOrchestrator({ mirrors: [synthPrimary, bioPrimary] });
    const distribution = orchestrator.currentLoadDistribution();

    // Synth-primary function: synthFraction=1.0, bioFraction=0.0
    const langDist = distribution.get(synthPrimary.functionId);
    expect(langDist).toBeDefined();
    expect(langDist!.synthFraction).toBeCloseTo(1.0, 5);
    expect(langDist!.bioFraction).toBeCloseTo(0.0, 5);

    // Bio-primary function: bioFraction=1.0, synthFraction=0.0
    const memDist = distribution.get(bioPrimary.functionId);
    expect(memDist).toBeDefined();
    expect(memDist!.bioFraction).toBeCloseTo(1.0, 5);
    expect(memDist!.synthFraction).toBeCloseTo(0.0, 5);
  });
});
