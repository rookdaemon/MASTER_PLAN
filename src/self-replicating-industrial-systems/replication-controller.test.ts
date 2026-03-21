/**
 * Red step: Tests for ReplicationController implementation.
 * These tests should FAIL until replication-controller.ts is implemented.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createReplicationController } from "./replication-controller.js";
import type {
  FeedstockPipeline,
  FabricationReplicator,
  FidelityVerifier,
  EnergySubsystem,
  SystemInstance,
  ReplicationControllerConfig,
  MaterialStock,
  BOM,
  ClosureReport,
  FidelityReport,
  GenerationChain,
  FulfillmentStatus,
  CycleStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function stubFeedstock(overrides: Partial<FeedstockPipeline> = {}): FeedstockPipeline {
  return {
    request: () => "token-1",
    status: () => ({ ready: true, etaSeconds: 0, fractionFulfilled: 1.0 }),
    queryInventory: () =>
      [
        {
          spec: { family: "structural-metal", name: "iron", minPurity: 0.95 },
          availableKg: 10_000,
          intakeRateKgPerDay: 500,
        },
      ] satisfies MaterialStock[],
    ...overrides,
  };
}

function stubFabricator(overrides: Partial<FabricationReplicator> = {}): FabricationReplicator {
  return {
    getBOM: (moduleId) => ({
      moduleId,
      entries: [{ spec: { family: "structural-metal", name: "iron", minPurity: 0.95 }, quantityKg: 100 }],
      canonicalHash: "abc123",
    }),
    scheduleCopy: () => "job-1",
    assemblyClosure: () => ({
      closed: true,
      openModules: [],
      totalModules: 5,
      closedModules: 5,
    }),
    ...overrides,
  };
}

function stubFidelity(overrides: Partial<FidelityVerifier> = {}): FidelityVerifier {
  return {
    canonicalHash: () => "abc123",
    verify: (instance) => ({
      instanceId: instance.instanceId,
      pass: true,
      moduleResults: instance.modules.map((m) => ({
        moduleId: m,
        checksumMatch: true,
        benchmarkPass: true,
      })),
      generation: instance.generation,
    }),
    genealogy: (id) => ({
      instanceId: id,
      generation: 0,
      parentId: null,
      children: [],
      replicatedAt: Date.now(),
    }),
    ...overrides,
  };
}

function stubEnergy(overrides: Partial<EnergySubsystem> = {}): EnergySubsystem {
  return {
    currentOutput: () => 50_000,
    projectedOutputAfterReplication: (n) => 50_000 * Math.pow(2, n),
    triggerSelfReplication: () => "energy-job-1",
    ...overrides,
  };
}

function makeSeed(): SystemInstance {
  return {
    instanceId: "seed-0",
    generation: 0,
    parentId: null,
    modules: ["mod-compute", "mod-fabrication", "mod-energy", "mod-refinery", "mod-assembly"],
    createdAt: Date.now(),
    activated: true,
  };
}

const FIXED_NOW_MS = 1_700_000_000_000; // deterministic epoch ms for tests

function makeConfig(overrides: Partial<ReplicationControllerConfig> = {}): ReplicationControllerConfig {
  return {
    feedstock: stubFeedstock(),
    fabricator: stubFabricator(),
    fidelity: stubFidelity(),
    energy: stubEnergy(),
    seedInstance: makeSeed(),
    energyBudgetWh: 10_000,
    now: () => FIXED_NOW_MS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReplicationController", () => {
  it("can be created from config", () => {
    const controller = createReplicationController(makeConfig());
    expect(controller).toBeDefined();
    expect(controller.startCycle).toBeTypeOf("function");
    expect(controller.abortCycle).toBeTypeOf("function");
    expect(controller.cycleStatus).toBeTypeOf("function");
  });

  it("startCycle returns a CycleId", () => {
    const controller = createReplicationController(makeConfig());
    const cycleId = controller.startCycle();
    expect(cycleId).toBeTypeOf("string");
    expect(cycleId.length).toBeGreaterThan(0);
  });

  it("cycleStatus returns status for a started cycle", () => {
    const controller = createReplicationController(makeConfig());
    const cycleId = controller.startCycle();
    const status = controller.cycleStatus(cycleId);
    expect(status.cycleId).toBe(cycleId);
    expect(status.parentInstanceId).toBe("seed-0");
    expect(status.targetGeneration).toBe(1);
    expect(status.energyBudgetWh).toBe(10_000);
  });

  it("throws on cycleStatus for unknown cycle", () => {
    const controller = createReplicationController(makeConfig());
    expect(() => controller.cycleStatus("nonexistent")).toThrow();
  });

  it("abortCycle sets phase to aborted", () => {
    const controller = createReplicationController(makeConfig());
    const cycleId = controller.startCycle();
    controller.abortCycle(cycleId);
    const status = controller.cycleStatus(cycleId);
    expect(status.phase).toBe("aborted");
  });

  it("MUST NOT start cycle when energy is insufficient", () => {
    const controller = createReplicationController(
      makeConfig({
        energy: stubEnergy({ currentOutput: () => 0 }),
      })
    );
    expect(() => controller.startCycle()).toThrow(/energy/i);
  });

  it("MUST NOT start cycle when closure is not achieved", () => {
    const controller = createReplicationController(
      makeConfig({
        fabricator: stubFabricator({
          assemblyClosure: () => ({
            closed: false,
            openModules: ["mod-missing"],
            totalModules: 5,
            closedModules: 4,
          }),
        }),
      })
    );
    expect(() => controller.startCycle()).toThrow(/closure/i);
  });

  it("cycle starts in resource-check phase", () => {
    const controller = createReplicationController(makeConfig());
    const cycleId = controller.startCycle();
    const status = controller.cycleStatus(cycleId);
    expect(status.phase).toBe("resource-check");
  });

  it("logs provenance with generation number, parent ID, and deterministic timestamp", () => {
    const controller = createReplicationController(makeConfig());
    const cycleId = controller.startCycle();
    const status = controller.cycleStatus(cycleId);
    expect(status.parentInstanceId).toBe("seed-0");
    expect(status.targetGeneration).toBe(1);
    // startedAt must equal the injected clock value — not Date.now()
    expect(status.startedAt).toBe(FIXED_NOW_MS);
  });
});
