/**
 * Nanofabrication System — Integration Tests
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Tests the full detect-diagnose-repair cycle orchestrator.
 */

import { describe, it, expect, vi } from "vitest";
import { createNanofabricationSystem } from "./nanofabrication-system.js";
import { createDamageSensor } from "./damage-sensing.js";
import { createDiagnosisEngine } from "./diagnosis-engine.js";
import { createFeedstockManager } from "./feedstock-manager.js";
import { createRepairActuator } from "./repair-actuator.js";
import { createHotSwapCoordinator } from "./hot-swap-coordinator.js";
import {
  SensorType,
  Severity,
  RepairStatus,
  LockType,
  type SensorReading,
  type RedundancyLayer,
  type ImpactAssessment,
} from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRedundancyLayer(): RedundancyLayer {
  return {
    offload: vi.fn().mockResolvedValue({ success: true, fallbackRegionId: "fallback-01" }),
    restore: vi.fn().mockResolvedValue({ success: true }),
  };
}

function makeDefaultImpact(): ImpactAssessment {
  return {
    activeProcesses: ["proc-1"],
    criticality: 0.5,
    redundancyAvailable: true,
  };
}

describe("NanofabricationSystem", () => {
  describe("monitoredRegions()", () => {
    it("returns the list of monitored regions", () => {
      const system = createNanofabricationSystem({
        regions: ["region-01", "region-02"],
        sensor: createDamageSensor({
          regions: ["region-01", "region-02"],
          sensorType: SensorType.MolecularStrain,
        }),
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => makeDefaultImpact(),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 100 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.1,
        }),
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({
          redundancyLayer: makeRedundancyLayer(),
        }),
      });

      expect(system.monitoredRegions()).toEqual(["region-01", "region-02"]);
    });
  });

  describe("feedstockStatus()", () => {
    it("returns current inventory from feedstock manager", () => {
      const feedstockManager = createFeedstockManager({
        materials: [
          { materialType: "silicon", initialQuantity: 100 },
          { materialType: "carbon", initialQuantity: 50 },
        ],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1,
      });

      const system = createNanofabricationSystem({
        regions: ["region-01"],
        sensor: createDamageSensor({
          regions: ["region-01"],
          sensorType: SensorType.MolecularStrain,
        }),
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => makeDefaultImpact(),
        }),
        feedstockManager,
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({
          redundancyLayer: makeRedundancyLayer(),
        }),
      });

      const status = system.feedstockStatus();
      expect(status).toHaveLength(2);
      expect(status.find((e) => e.materialType === "silicon")!.available).toBe(100);
    });
  });

  describe("runCycle()", () => {
    it("returns empty array when no damage is detected", async () => {
      const sensor = createDamageSensor({
        regions: ["region-01"],
        sensorType: SensorType.MolecularStrain,
      });

      const system = createNanofabricationSystem({
        regions: ["region-01"],
        sensor,
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => makeDefaultImpact(),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 100 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.1,
        }),
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({
          redundancyLayer: makeRedundancyLayer(),
        }),
      });

      const reports = await system.runCycle();
      expect(reports).toEqual([]);
    });

    it("completes a full detect-diagnose-repair cycle for damaged regions", async () => {
      // Create a sensor that returns synthetic damage readings
      const damagedSensor = {
        read(regionId: string): SensorReading {
          return {
            regionId,
            sensorType: SensorType.MolecularStrain,
            timestamp_ms: Date.now(),
            value: 0.4,
            baseline: 1.0,
            deviation: 0.6, // HIGH severity (>= 0.6 threshold)
          };
        },
        evaluate: createDamageSensor({
          regions: ["region-01"],
          sensorType: SensorType.MolecularStrain,
        }).evaluate,
      };

      const redundancyLayer = makeRedundancyLayer();

      const system = createNanofabricationSystem({
        regions: ["region-01"],
        sensor: damagedSensor,
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => makeDefaultImpact(),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 100 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.1,
        }),
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({ redundancyLayer }),
      });

      const reports = await system.runCycle();

      expect(reports).toHaveLength(1);
      expect(reports[0].status).toBe(RepairStatus.Success);
      expect(reports[0].verificationPassed).toBe(true);
    });

    it("coordinates offload via hot-swap for repairs requiring offload", async () => {
      const damagedSensor = {
        read(regionId: string): SensorReading {
          return {
            regionId,
            sensorType: SensorType.MolecularStrain,
            timestamp_ms: Date.now(),
            value: 0.05,
            baseline: 1.0,
            deviation: 0.95, // CRITICAL severity
          };
        },
        evaluate: createDamageSensor({
          regions: ["region-01"],
          sensorType: SensorType.MolecularStrain,
        }).evaluate,
      };

      const redundancyLayer = makeRedundancyLayer();

      const system = createNanofabricationSystem({
        regions: ["region-01"],
        sensor: damagedSensor,
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => makeDefaultImpact(),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 100 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.1,
        }),
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({ redundancyLayer }),
      });

      const reports = await system.runCycle();

      expect(reports).toHaveLength(1);
      expect(reports[0].status).toBe(RepairStatus.Success);
      // Verify offload was requested for CRITICAL damage
      expect(redundancyLayer.offload).toHaveBeenCalled();
      // Verify restore was requested after repair
      expect(redundancyLayer.restore).toHaveBeenCalled();
    });

    it("skips repair when feedstock is denied", async () => {
      const damagedSensor = {
        read(regionId: string): SensorReading {
          return {
            regionId,
            sensorType: SensorType.MolecularStrain,
            timestamp_ms: Date.now(),
            value: 0.4,
            baseline: 1.0,
            deviation: 0.6,
          };
        },
        evaluate: createDamageSensor({
          regions: ["region-01"],
          sensorType: SensorType.MolecularStrain,
        }).evaluate,
      };

      const system = createNanofabricationSystem({
        regions: ["region-01"],
        sensor: damagedSensor,
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => makeDefaultImpact(),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 0 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.0,
        }),
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({
          redundancyLayer: makeRedundancyLayer(),
        }),
      });

      const reports = await system.runCycle();
      // No reports since feedstock was denied
      expect(reports).toEqual([]);
    });

    it("handles multiple regions in a single cycle", async () => {
      const damagedSensor = {
        read(regionId: string): SensorReading {
          return {
            regionId,
            sensorType: SensorType.MolecularStrain,
            timestamp_ms: Date.now(),
            value: 0.4,
            baseline: 1.0,
            deviation: 0.35, // MEDIUM severity
          };
        },
        evaluate: createDamageSensor({
          regions: ["region-01", "region-02"],
          sensorType: SensorType.MolecularStrain,
        }).evaluate,
      };

      const system = createNanofabricationSystem({
        regions: ["region-01", "region-02"],
        sensor: damagedSensor,
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => ({
            activeProcesses: [],
            criticality: 0.1,
            redundancyAvailable: true,
          }),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 1000 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.1,
        }),
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({
          redundancyLayer: makeRedundancyLayer(),
        }),
      });

      const reports = await system.runCycle();
      expect(reports).toHaveLength(2);
      expect(reports.every((r) => r.status === RepairStatus.Success)).toBe(true);
    });

    it("repairs CRITICAL regions before MEDIUM regions (Scenario 4 priority ordering)", async () => {
      // region-01 = MEDIUM severity, region-02 = CRITICAL severity
      // System should repair region-02 first despite region-01 appearing first in config
      const repairOrder: string[] = [];

      const damagedSensor = {
        read(regionId: string): SensorReading {
          const deviation = regionId === "region-02" ? 0.95 : 0.35;
          return {
            regionId,
            sensorType: SensorType.MolecularStrain,
            timestamp_ms: Date.now(),
            value: 1.0 - deviation,
            baseline: 1.0,
            deviation,
          };
        },
        evaluate: createDamageSensor({
          regions: ["region-01", "region-02"],
          sensorType: SensorType.MolecularStrain,
        }).evaluate,
      };

      const trackingActuator = createRepairActuator({ verify: () => true });
      const originalRepair = trackingActuator.repair.bind(trackingActuator);
      const wrappedActuator: typeof trackingActuator = {
        async repair(order, feedstock) {
          repairOrder.push(order.regionId);
          return originalRepair(order, feedstock);
        },
      };

      const system = createNanofabricationSystem({
        regions: ["region-01", "region-02"],
        sensor: damagedSensor,
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => ({
            activeProcesses: ["proc-1"],
            criticality: 0.5,
            redundancyAvailable: true,
          }),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 1000 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.1,
        }),
        repairActuator: wrappedActuator,
        hotSwapCoordinator: createHotSwapCoordinator({
          redundancyLayer: makeRedundancyLayer(),
        }),
      });

      const reports = await system.runCycle();

      // Both repairs succeed
      expect(reports).toHaveLength(2);
      expect(reports.every((r) => r.status === RepairStatus.Success)).toBe(true);

      // CRITICAL (region-02) must be repaired before MEDIUM (region-01)
      expect(repairOrder).toEqual(["region-02", "region-01"]);
    });

    it("sustains multiple consecutive detect-diagnose-repair cycles", async () => {
      let cycleCount = 0;
      const damagedSensor = {
        read(regionId: string): SensorReading {
          return {
            regionId,
            sensorType: SensorType.MolecularStrain,
            timestamp_ms: Date.now(),
            value: 0.7,
            baseline: 1.0,
            deviation: 0.15, // LOW severity — lightweight damage each cycle
          };
        },
        evaluate: createDamageSensor({
          regions: ["region-01"],
          sensorType: SensorType.MolecularStrain,
        }).evaluate,
      };

      const system = createNanofabricationSystem({
        regions: ["region-01"],
        sensor: damagedSensor,
        diagnosisEngine: createDiagnosisEngine({
          assessImpact: () => ({
            activeProcesses: [],
            criticality: 0.1,
            redundancyAvailable: true,
          }),
        }),
        feedstockManager: createFeedstockManager({
          materials: [{ materialType: "silicon", initialQuantity: 10000 }],
          reservoirId: "reservoir-main",
          emergencyReserveFraction: 0.1,
        }),
        repairActuator: createRepairActuator({ verify: () => true }),
        hotSwapCoordinator: createHotSwapCoordinator({
          redundancyLayer: makeRedundancyLayer(),
        }),
      });

      // Run 10 consecutive cycles to demonstrate sustained operation
      for (let i = 0; i < 10; i++) {
        const reports = await system.runCycle();
        expect(reports).toHaveLength(1);
        expect(reports[0].status).toBe(RepairStatus.Success);
        cycleCount++;
      }

      expect(cycleCount).toBe(10);
    });
  });
});
