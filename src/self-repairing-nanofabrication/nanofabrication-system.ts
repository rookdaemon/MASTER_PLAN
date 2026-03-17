/**
 * Nanofabrication System — Top-Level Orchestrator
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Orchestrates the full detect-diagnose-repair cycle across all monitored regions.
 * Ties together damage sensing, diagnosis, feedstock management, repair actuators,
 * and hot-swap coordination into a closed-loop autonomous repair system.
 */

import {
  LockType,
  type DamageSensor,
  type DiagnosisEngine,
  type FeedstockManager,
  type RepairActuator,
  type HotSwapCoordinator,
  type RepairReport,
  type RepairOrder,
  type InventoryEntry,
  type NanofabricationSystem,
} from "./types.js";

// ── Configuration ───────────────────────────────────────────────────────────

export interface NanofabricationSystemConfig {
  regions: string[];
  sensor: DamageSensor;
  diagnosisEngine: DiagnosisEngine;
  feedstockManager: FeedstockManager;
  repairActuator: RepairActuator;
  hotSwapCoordinator: HotSwapCoordinator;
  /** Default material type to request for repairs */
  defaultMaterialType?: string;
  /** Default material quantity per repair */
  defaultMaterialQuantity?: number;
}

const DEFAULT_MATERIAL_TYPE = "silicon";
const DEFAULT_MATERIAL_QUANTITY = 10;

// ── Factory ─────────────────────────────────────────────────────────────────

export function createNanofabricationSystem(
  config: NanofabricationSystemConfig
): NanofabricationSystem {
  const {
    regions,
    sensor,
    diagnosisEngine,
    feedstockManager,
    repairActuator,
    hotSwapCoordinator,
  } = config;

  const materialType = config.defaultMaterialType ?? DEFAULT_MATERIAL_TYPE;
  const materialQuantity = config.defaultMaterialQuantity ?? DEFAULT_MATERIAL_QUANTITY;

  return {
    monitoredRegions(): string[] {
      return [...regions];
    },

    feedstockStatus(): InventoryEntry[] {
      return feedstockManager.inventory();
    },

    async runCycle(): Promise<RepairReport[]> {
      // Step 1: DETECT — read sensors for all regions
      const readings = regions.map((regionId) => sensor.read(regionId));

      // Step 2: Evaluate readings for degradation alerts
      const alerts = sensor.evaluate(readings);

      if (alerts.length === 0) {
        return [];
      }

      // Step 3: DIAGNOSE — classify and prioritize each alert
      const orders: RepairOrder[] = alerts.map((alert) =>
        diagnosisEngine.diagnose(alert)
      );

      // Sort by priority (highest first)
      orders.sort((a, b) => b.priorityScore - a.priorityScore);

      // Step 4: REPAIR — execute each repair order
      const reports: RepairReport[] = [];

      for (const order of orders) {
        // Request feedstock
        const feedstockResponse = feedstockManager.request({
          materialType,
          quantity: materialQuantity,
        });

        if (!feedstockResponse.granted) {
          // Cannot repair without feedstock — skip this order
          continue;
        }

        // If offload required, coordinate with hot-swap
        if (order.requiresOffload) {
          const offloadAck = await hotSwapCoordinator.requestOffload({
            regionId: order.regionId,
            reason: `${order.damageType} damage repair (${order.severity})`,
            estimatedDuration_ms: order.estimatedDuration_ms,
          });

          if (!offloadAck.success) {
            // Cannot safely offload — defer repair
            continue;
          }
        }

        // Lock region for exclusive repair access
        const lockAck = await hotSwapCoordinator.lockRegion({
          regionId: order.regionId,
          lockType: LockType.Exclusive,
        });

        if (!lockAck.success) {
          // Cannot acquire lock — defer repair
          continue;
        }

        // Execute repair
        const report = await repairActuator.repair(
          order,
          feedstockResponse.allocation
        );

        // Unlock region
        await hotSwapCoordinator.unlockRegion(order.regionId);

        // Restore region if it was offloaded
        if (order.requiresOffload) {
          await hotSwapCoordinator.requestRestore({
            regionId: order.regionId,
          });
        }

        reports.push(report);
      }

      return reports;
    },
  };
}
