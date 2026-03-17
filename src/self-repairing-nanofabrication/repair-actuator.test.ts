/**
 * Molecular Repair Actuator — Tests
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Red step: these tests define the expected behavior of repair actuators.
 */

import { describe, it, expect, vi } from "vitest";
import { createRepairActuator } from "./repair-actuator.js";
import {
  Severity,
  DamageCategory,
  RepairStatus,
  type RepairOrder,
  type FeedstockAllocation,
  type SensorReading,
  SensorType,
} from "./types.js";

function makeRepairOrder(
  overrides: Partial<RepairOrder> = {}
): RepairOrder {
  return {
    id: "repair-1",
    regionId: "region-01",
    damageType: DamageCategory.Mechanical,
    severity: Severity.Medium,
    priorityScore: 3,
    repairPlanId: "plan-mechanical-medium",
    estimatedDuration_ms: 5000,
    requiresOffload: false,
    ...overrides,
  };
}

function makeFeedstock(
  overrides: Partial<FeedstockAllocation> = {}
): FeedstockAllocation {
  return {
    materialType: "silicon",
    quantity: 10,
    sourceReservoir: "reservoir-main",
    ...overrides,
  };
}

describe("RepairActuator", () => {
  describe("repair()", () => {
    it("returns a successful RepairReport for a valid repair order", async () => {
      const verifier = vi.fn().mockReturnValue(true);
      const actuator = createRepairActuator({ verify: verifier });

      const report = await actuator.repair(makeRepairOrder(), makeFeedstock());

      expect(report.repairOrderId).toBe("repair-1");
      expect(report.status).toBe(RepairStatus.Success);
      expect(report.duration_ms).toBeGreaterThanOrEqual(0);
      expect(report.verificationPassed).toBe(true);
    });

    it("includes materials consumed matching the feedstock allocation", async () => {
      const verifier = vi.fn().mockReturnValue(true);
      const actuator = createRepairActuator({ verify: verifier });

      const feedstock = makeFeedstock({ materialType: "carbon", quantity: 5 });
      const report = await actuator.repair(makeRepairOrder(), feedstock);

      expect(report.materialsConsumed).toEqual([
        { materialType: "carbon", quantity: 5 },
      ]);
    });

    it("returns FAILED status when verification fails", async () => {
      const verifier = vi.fn().mockReturnValue(false);
      const actuator = createRepairActuator({ verify: verifier });

      const report = await actuator.repair(makeRepairOrder(), makeFeedstock());

      expect(report.status).toBe(RepairStatus.Failed);
      expect(report.verificationPassed).toBe(false);
    });

    it("calls the verifier with the region ID", async () => {
      const verifier = vi.fn().mockReturnValue(true);
      const actuator = createRepairActuator({ verify: verifier });

      await actuator.repair(
        makeRepairOrder({ regionId: "region-42" }),
        makeFeedstock()
      );

      expect(verifier).toHaveBeenCalledWith("region-42");
    });

    it("records positive duration for completed repairs", async () => {
      const verifier = vi.fn().mockReturnValue(true);
      const actuator = createRepairActuator({ verify: verifier });

      const report = await actuator.repair(makeRepairOrder(), makeFeedstock());

      expect(report.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof report.duration_ms).toBe("number");
    });

    it("handles different damage categories without error", async () => {
      const verifier = vi.fn().mockReturnValue(true);
      const actuator = createRepairActuator({ verify: verifier });

      for (const damageType of [
        DamageCategory.Mechanical,
        DamageCategory.Radiation,
        DamageCategory.Thermal,
        DamageCategory.Chemical,
      ]) {
        const report = await actuator.repair(
          makeRepairOrder({ damageType }),
          makeFeedstock()
        );
        expect(report.status).toBe(RepairStatus.Success);
      }
    });
  });
});
