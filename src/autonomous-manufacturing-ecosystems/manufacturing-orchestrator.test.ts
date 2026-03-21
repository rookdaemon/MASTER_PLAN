/**
 * Manufacturing Orchestrator — Tests
 *
 * Card: 0.3.2.1 Autonomous Manufacturing Ecosystems
 *
 * Verifies the orchestration layer against the acceptance criteria defined in
 * docs/autonomous-manufacturing-ecosystems/ARCHITECTURE.md.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createManufacturingOrchestrator,
  type OrchestratorConfig,
  MIN_NODES_PER_LAYER,
  REPLICATION_UTILISATION_THRESHOLD,
  REPLICATION_SUSTAINED_DAYS,
  TARGET_RECOVERY_RATE,
  MAX_SINGLE_NODE_THROUGHPUT_LOSS,
  MAX_RECOVERY_HOURS,
  INVENTORY_BUFFER_DAYS,
  DEMAND_SPIKE_SCALING_DAYS,
  FAILOVER_DETECTION_SECONDS,
} from "./manufacturing-orchestrator.js";
import type {
  DemandForecast,
  BillOfMaterials,
  DisruptionEvent,
  ResourceExtractor,
  Refinery,
  Fabricator,
  Assembler,
  Recycler,
  Clock,
  Timer,
} from "./types.js";

// ── Clock & Timer Stubs ──────────────────────────────────────────────────────

function createFakeClock(startMs = 1_000_000): Clock & { advance(ms: number): void; current: number } {
  let current = startMs;
  return {
    get current() { return current; },
    now() { return current; },
    advance(ms: number) { current += ms; },
  };
}

function createFakeTimer(): Timer & { flush(): void; pending: Array<{ callback: () => void; delayMs: number }> } {
  const pending: Array<{ callback: () => void; delayMs: number }> = [];
  return {
    pending,
    schedule(callback: () => void, delayMs: number) {
      pending.push({ callback, delayMs });
    },
    flush() {
      while (pending.length > 0) {
        const entry = pending.shift()!;
        entry.callback();
      }
    },
  };
}

// ── Stub Factories ────────────────────────────────────────────────────────────

function makeNodes(layer: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `layer${layer}-node${i + 1}`);
}

function stubExtractor(): ResourceExtractor {
  return {
    extract: (spec) => ({
      materialId: spec.materialId,
      flowRateKgPerDay: spec.quantityKg,
      purity: 0.85,
      sourceIds: ["source-1", "source-2", "source-3"],
    }),
    status: () => ({
      active: true,
      currentOutputKgPerDay: 1000,
      activeSupplySources: ["source-1", "source-2", "source-3"],
      selfRepairInProgress: false,
    }),
    estimateYield: (site) => ({
      siteId: site.siteId,
      materialId: site.materialId,
      forecastedYieldKg: site.estimatedReserveKg * 0.9,
      confidenceLevel: 0.8,
    }),
  };
}

function stubRefinery(): Refinery {
  return {
    process: (raw, spec) => ({
      feedstockId: spec.feedstockId,
      flowRateKgPerDay: raw.flowRateKgPerDay * 0.98,
      purity: spec.targetPurity,
    }),
    purity: (sample) => ({
      sampleId: sample.sampleId,
      materialId: sample.materialId,
      measuredPurity: 0.9999,
      meetsSpec: true,
    }),
    adapt: () => {},
  };
}

function stubFabricator(clock?: Clock): Fabricator {
  let replicaCount = 0;
  const getNow = clock ? () => clock.now() : () => 0;
  return {
    produce: (design, qty) => ({
      batchId: `batch-${design.designId}-${getNow()}`,
      designId: design.designId,
      quantity: qty,
      producedAt: getNow(),
    }),
    verify: (batch) => ({
      batchId: batch.batchId,
      passCount: batch.quantity,
      failCount: 0,
      yieldFraction: 1.0,
      defectCategories: [],
    }),
    selfReplicate: (_targetSpec) => {
      replicaCount++;
      return stubFabricator(clock);
    },
  };
}

function stubAssembler(clock?: Clock): Assembler {
  const getNow = clock ? () => clock.now() : () => 0;
  return {
    assemble: (bom) => ({
      systemId: `system-${bom.bomId}`,
      components: [],
      assembledAt: getNow(),
    }),
    test: (system) => ({
      systemId: system.systemId,
      passed: true,
      consciousnessSubstrateValidated: true,
      failureReasons: [],
    }),
    install: (system, location) => ({
      systemId: system.systemId,
      location,
      installedAt: getNow(),
      success: true,
    }),
  };
}

function stubRecycler(): Recycler {
  return {
    disassemble: (system) => ({
      streamId: `stream-${system.systemId}`,
      materials: [{ materialId: "silicon", massKg: 10, purity: 0.9 }],
    }),
    sort: (stream) => ({
      streamId: stream.streamId,
      sorted: [...stream.materials].sort((a, b) =>
        a.materialId.localeCompare(b.materialId)
      ),
    }),
    reintroduce: () => {},
  };
}

function makeBom(id: string): BillOfMaterials {
  return {
    bomId: id,
    items: [
      {
        design: {
          designId: `comp-${id}`,
          version: "1.0",
          feedstockRequirements: [
            { feedstockId: "silicon", targetPurity: 0.9999, quantityKg: 1 },
          ],
          isFabricatorDesign: false,
        },
        quantity: 10,
      },
    ],
  };
}

function makeConfig(
  opts: { nodeCount?: number; clock?: Clock; timer?: Timer } = {}
): OrchestratorConfig {
  const { nodeCount = 5 } = opts;
  const clock = opts.clock ?? createFakeClock();
  const timer = opts.timer ?? createFakeTimer();

  const layers = [1, 2, 3, 4, 5] as const;
  const layerNodes = {} as Record<1 | 2 | 3 | 4 | 5, string[]>;
  for (const l of layers) layerNodes[l] = makeNodes(l, nodeCount);

  const extractors = new Map(
    layerNodes[1].map((id) => [id, stubExtractor()] as const)
  );
  const refineries = new Map(
    layerNodes[2].map((id) => [id, stubRefinery()] as const)
  );
  const fabricators = new Map(
    layerNodes[3].map((id) => [id, stubFabricator(clock)] as const)
  );
  const assemblers = new Map(
    layerNodes[4].map((id) => [id, stubAssembler(clock)] as const)
  );
  const recyclers = new Map(
    layerNodes[5].map((id) => [id, stubRecycler()] as const)
  );

  return {
    minNodesPerLayer: MIN_NODES_PER_LAYER,
    replicationUtilisationThreshold: REPLICATION_UTILISATION_THRESHOLD,
    replicationSustainedDays: REPLICATION_SUSTAINED_DAYS,
    targetRecoveryRate: TARGET_RECOVERY_RATE,
    maxSingleNodeThroughputLoss: MAX_SINGLE_NODE_THROUGHPUT_LOSS,
    maxRecoveryHours: MAX_RECOVERY_HOURS,
    inventoryBufferDays: INVENTORY_BUFFER_DAYS,
    demandSpikeScalingDays: DEMAND_SPIKE_SCALING_DAYS,
    failoverDetectionSeconds: FAILOVER_DETECTION_SECONDS,
    layerNodes,
    clock,
    timer,
    extractors,
    refineries,
    fabricators,
    assemblers,
    recyclers,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ManufacturingOrchestrator", () => {
  let config: OrchestratorConfig;
  let fakeClock: ReturnType<typeof createFakeClock>;
  let fakeTimer: ReturnType<typeof createFakeTimer>;

  beforeEach(() => {
    fakeClock = createFakeClock();
    fakeTimer = createFakeTimer();
    config = makeConfig({ clock: fakeClock, timer: fakeTimer });
  });

  // ── plan() ─────────────────────────────────────────────────────────────────

  describe("plan()", () => {
    it("returns a plan covering all five layers for each BOM", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const demand: DemandForecast = {
        forecastId: "forecast-1",
        projectedPopulation: 1000,
        horizonDays: 180,
        requiredBoms: [makeBom("bom-A"), makeBom("bom-B")],
      };

      const plan = orchestrator.plan(demand);

      expect(plan.forecastId).toBe("forecast-1");
      expect(plan.phases).toHaveLength(2);
      for (const phase of plan.phases) {
        expect(phase.layerAllocations).toHaveLength(5);
        const layers = phase.layerAllocations.map((a) => a.layer).sort();
        expect(layers).toEqual([1, 2, 3, 4, 5]);
      }
    });

    it("assigns node IDs from each layer", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const demand: DemandForecast = {
        forecastId: "forecast-2",
        projectedPopulation: 500,
        horizonDays: 90,
        requiredBoms: [makeBom("bom-C")],
      };

      const plan = orchestrator.plan(demand);
      const phase = plan.phases[0];

      for (const allocation of phase.layerAllocations) {
        expect(allocation.nodeIds.length).toBeGreaterThan(0);
      }
    });
  });

  // ── execute() ──────────────────────────────────────────────────────────────

  describe("execute()", () => {
    it("returns a handle with planId matching the executed plan", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const demand: DemandForecast = {
        forecastId: "forecast-3",
        projectedPopulation: 200,
        horizonDays: 60,
        requiredBoms: [makeBom("bom-D")],
      };

      const plan = orchestrator.plan(demand);
      const handle = orchestrator.execute(plan);

      expect(handle.planId).toBe(plan.planId);
    });

    it("reports progress reaching 1.0 after all phases complete", async () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const boms = [makeBom("bom-E"), makeBom("bom-F")];
      const demand: DemandForecast = {
        forecastId: "forecast-4",
        projectedPopulation: 100,
        horizonDays: 30,
        requiredBoms: boms,
      };

      const plan = orchestrator.plan(demand);
      const handle = orchestrator.execute(plan);

      // Flush one microtask tick per phase (each phase awaits once internally)
      for (let i = 0; i < boms.length * 2 + 1; i++) {
        await Promise.resolve();
      }

      expect(handle.progress()).toBe(1.0);
    });

    it("stops progressing after cancel() called before first yield", async () => {
      const manyBoms = Array.from({ length: 10 }, (_, i) => makeBom(`bom-${i}`));
      const orchestrator = createManufacturingOrchestrator(config);
      const demand: DemandForecast = {
        forecastId: "forecast-5",
        projectedPopulation: 10000,
        horizonDays: 365,
        requiredBoms: manyBoms,
      };

      const plan = orchestrator.plan(demand);
      const handle = orchestrator.execute(plan);

      // Cancel immediately — before any async phase runs
      handle.cancel();

      // Flush all microtasks
      for (let i = 0; i < 25; i++) await Promise.resolve();

      expect(handle.progress()).toBeLessThan(1.0);
    });
  });

  // ── monitor() ──────────────────────────────────────────────────────────────

  describe("monitor()", () => {
    it("reports full health with no disruptions", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const report = orchestrator.monitor();

      expect(report.overallHealthFraction).toBe(1.0);
      expect(report.throughputFraction).toBe(1.0);
      expect(report.activeDisruptions).toHaveLength(0);
      for (const layer of [1, 2, 3, 4, 5] as const) {
        expect(report.layerHealth[layer]).toBe(1.0);
      }
    });
  });

  // ── rebalance() ────────────────────────────────────────────────────────────

  describe("rebalance()", () => {
    it("degrades throughput by less than 10% on a single-node failure (≥5 nodes)", () => {
      const orchestrator = createManufacturingOrchestrator(config); // 5 nodes/layer
      const disruption: DisruptionEvent = {
        eventId: "evt-1",
        affectedNodeId: "layer1-node1",
        layer: 1,
        estimatedRecoveryHours: 72,
      };

      orchestrator.rebalance(disruption);
      const report = orchestrator.monitor();

      // A single-node disruption across 5 nodes: throughput loss per-node = 1/5 = 0.20,
      // but capped at 9%, so layer-1 throughput drops by at most 0.09.
      const layer1Throughput = 1.0 - (1 / Math.max(1, config.layerNodes[1].length));
      // The cap ensures < 10% loss
      expect(report.throughputFraction).toBeGreaterThan(0.9);
    });

    it("records the disruption as active", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const disruption: DisruptionEvent = {
        eventId: "evt-2",
        affectedNodeId: "layer3-node2",
        layer: 3,
        estimatedRecoveryHours: 24,
      };

      orchestrator.rebalance(disruption);
      const report = orchestrator.monitor();

      expect(report.activeDisruptions).toHaveLength(1);
      expect(report.activeDisruptions[0].eventId).toBe("evt-2");
    });

    it("layer health reflects the number of disrupted nodes", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const disruption: DisruptionEvent = {
        eventId: "evt-3",
        affectedNodeId: "layer2-node1",
        layer: 2,
        estimatedRecoveryHours: 12,
      };

      orchestrator.rebalance(disruption);
      const report = orchestrator.monitor();

      // 1 disruption across 5 nodes → 80% health for layer 2
      expect(report.layerHealth[2]).toBeCloseTo(4 / 5, 5);
    });

    it("recovers throughput when timer fires (within maxRecoveryHours)", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const disruption: DisruptionEvent = {
        eventId: "evt-recovery",
        affectedNodeId: "layer1-node1",
        layer: 1,
        estimatedRecoveryHours: MAX_RECOVERY_HOURS,
      };

      orchestrator.rebalance(disruption);
      expect(orchestrator.monitor().throughputFraction).toBeGreaterThan(0.9);

      // Flush the scheduled recovery
      fakeTimer.flush();

      const reportAfter = orchestrator.monitor();
      expect(reportAfter.throughputFraction).toBe(1.0);
      expect(reportAfter.activeDisruptions).toHaveLength(0);
    });
  });

  // ── checkReplication() ──────────────────────────────────────────────────────

  describe("checkReplication()", () => {
    it("does NOT trigger replication before sustained period elapses", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const startMs = fakeClock.now();
      const almostSustainedMs = (REPLICATION_SUSTAINED_DAYS - 1) * 24 * 60 * 60 * 1000;

      // First check starts the timer
      const result1 = orchestrator.checkReplication(0.85, startMs);
      expect(result1).toBeNull();

      // Check again just before the sustained period
      const result2 = orchestrator.checkReplication(0.85, startMs + almostSustainedMs);
      expect(result2).toBeNull();

      // Layer 3 node count should not have changed
      expect(config.layerNodes[3]).toHaveLength(5);
    });

    it("triggers replication after sustained utilisation exceeds threshold for replicationSustainedDays", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const startMs = fakeClock.now();
      const sustainedMs = REPLICATION_SUSTAINED_DAYS * 24 * 60 * 60 * 1000;

      // First check at high utilisation — starts the clock
      orchestrator.checkReplication(0.85, startMs);

      // Check after sustained period — should trigger replication
      const newNodeId = orchestrator.checkReplication(0.85, startMs + sustainedMs);
      expect(newNodeId).not.toBeNull();
      expect(newNodeId).toContain("layer3-replica");

      // Layer 3 should now have one more fabricator
      expect(config.layerNodes[3]).toHaveLength(6);
      expect(config.fabricators.has(newNodeId!)).toBe(true);
    });

    it("resets the sustained timer when utilisation drops below threshold", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const startMs = fakeClock.now();
      const halfSustainedMs = (REPLICATION_SUSTAINED_DAYS / 2) * 24 * 60 * 60 * 1000;
      const fullSustainedMs = REPLICATION_SUSTAINED_DAYS * 24 * 60 * 60 * 1000;

      // Start high utilisation
      orchestrator.checkReplication(0.85, startMs);

      // Drop below threshold halfway through
      orchestrator.checkReplication(0.70, startMs + halfSustainedMs);

      // Go high again after the drop
      orchestrator.checkReplication(0.85, startMs + halfSustainedMs + 1);

      // Check at what would have been the original sustained time — should NOT trigger
      // because the timer was reset
      const result = orchestrator.checkReplication(0.85, startMs + fullSustainedMs);
      expect(result).toBeNull();
      expect(config.layerNodes[3]).toHaveLength(5);
    });

    it("does not trigger when utilisation is exactly at threshold (not above)", () => {
      const orchestrator = createManufacturingOrchestrator(config);
      const startMs = fakeClock.now();
      const sustainedMs = REPLICATION_SUSTAINED_DAYS * 24 * 60 * 60 * 1000;

      orchestrator.checkReplication(REPLICATION_UTILISATION_THRESHOLD, startMs);
      const result = orchestrator.checkReplication(REPLICATION_UTILISATION_THRESHOLD, startMs + sustainedMs);
      expect(result).toBeNull();
    });
  });

  // ── Threshold Constants ─────────────────────────────────────────────────────

  describe("Threshold Constants", () => {
    it("exports all threshold constants with correct values from Threshold Registry", () => {
      expect(MIN_NODES_PER_LAYER).toBe(3);
      expect(REPLICATION_UTILISATION_THRESHOLD).toBe(0.80);
      expect(REPLICATION_SUSTAINED_DAYS).toBe(30);
      expect(TARGET_RECOVERY_RATE).toBe(0.95);
      expect(MAX_SINGLE_NODE_THROUGHPUT_LOSS).toBe(0.09);
      expect(MAX_RECOVERY_HOURS).toBe(72);
      expect(INVENTORY_BUFFER_DAYS).toBe(90);
      expect(DEMAND_SPIKE_SCALING_DAYS).toBe(180);
      expect(FAILOVER_DETECTION_SECONDS).toBe(60);
    });
  });
});
