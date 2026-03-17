/**
 * Molecular Repair Actuator — Implementation
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Performs in-situ repair at the molecular scale. Receives a RepairOrder
 * and FeedstockAllocation, executes the repair, and verifies the result
 * via the sensing layer.
 */

import {
  RepairStatus,
  type RepairOrder,
  type FeedstockAllocation,
  type RepairReport,
  type RepairActuator,
} from "./types.js";

// ── Configuration ───────────────────────────────────────────────────────────

export interface RepairActuatorConfig {
  /**
   * Post-repair verification function.
   * In a real system this re-invokes the damage sensing layer
   * to confirm the repair was successful.
   * Returns true if the region passes integrity checks.
   */
  verify: (regionId: string) => boolean;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createRepairActuator(
  config: RepairActuatorConfig
): RepairActuator {
  return {
    async repair(
      order: RepairOrder,
      feedstock: FeedstockAllocation
    ): Promise<RepairReport> {
      const startTime = performance.now();

      // Step 1: Disassemble damaged structure (simulated)
      // In a real system, molecular disassemblers would break down
      // the damaged region and reclaim materials.

      // Step 2: Assemble replacement from feedstock (simulated)
      // Molecular assemblers build the replacement structure
      // using the allocated feedstock materials.

      // Step 3: Verify repair via sensing layer
      const verificationPassed = config.verify(order.regionId);

      const endTime = performance.now();
      const duration_ms = Math.round(endTime - startTime);

      const status = verificationPassed
        ? RepairStatus.Success
        : RepairStatus.Failed;

      return {
        repairOrderId: order.id,
        status,
        duration_ms,
        materialsConsumed: [
          {
            materialType: feedstock.materialType,
            quantity: feedstock.quantity,
          },
        ],
        verificationPassed,
      };
    },
  };
}
