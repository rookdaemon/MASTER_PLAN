/**
 * Feedstock Management — Implementation
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Maintains material supply for indefinite autonomous repair without
 * external resupply. Manages reservoirs, recycling, and emergency reserves.
 */

import {
  type FeedstockRequest,
  type FeedstockResponse,
  type FeedstockAllocation,
  type RecycleDeposit,
  type InventoryEntry,
  type FeedstockManager,
} from "./types.js";

// ── Configuration ───────────────────────────────────────────────────────────

export interface MaterialConfig {
  materialType: string;
  initialQuantity: number;
}

export interface FeedstockManagerConfig {
  materials: MaterialConfig[];
  reservoirId: string;
  /** Fraction of current inventory reserved for CRITICAL repairs (0.0 - 1.0) */
  emergencyReserveFraction: number;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createFeedstockManager(
  config: FeedstockManagerConfig
): FeedstockManager {
  const reservoirId = config.reservoirId;
  const emergencyFraction = config.emergencyReserveFraction;

  // Internal mutable state: available quantity per material
  const stock = new Map<string, number>();
  // Emergency reserve is fixed based on initial quantity, not current stock
  const emergencyReserve = new Map<string, number>();
  for (const mat of config.materials) {
    stock.set(mat.materialType, mat.initialQuantity);
    emergencyReserve.set(
      mat.materialType,
      Math.floor(mat.initialQuantity * emergencyFraction)
    );
  }

  function allocatable(materialType: string): number {
    const available = stock.get(materialType) ?? 0;
    const reserved = emergencyReserve.get(materialType) ?? 0;
    return Math.max(0, available - reserved);
  }

  return {
    request(req: FeedstockRequest): FeedstockResponse {
      if (!stock.has(req.materialType)) {
        return { granted: false, reason: `unknown material type: ${req.materialType}` };
      }

      const canAllocate = allocatable(req.materialType);
      if (req.quantity > canAllocate) {
        return {
          granted: false,
          reason: `insufficient ${req.materialType}: requested ${req.quantity}, allocatable ${canAllocate}`,
        };
      }

      // Deduct from stock
      const current = stock.get(req.materialType)!;
      stock.set(req.materialType, current - req.quantity);

      const allocation: FeedstockAllocation = {
        materialType: req.materialType,
        quantity: req.quantity,
        sourceReservoir: reservoirId,
      };

      return { granted: true, allocation };
    },

    recycle(deposit: RecycleDeposit): void {
      if (!stock.has(deposit.materialType)) {
        // Ignore deposits for unknown material types
        return;
      }

      // Recovered quantity is adjusted by purity
      const recovered = Math.floor(deposit.quantity * deposit.purity);
      const current = stock.get(deposit.materialType)!;
      const newTotal = current + recovered;
      stock.set(deposit.materialType, newTotal);

      // Recalculate emergency reserve based on new total
      emergencyReserve.set(
        deposit.materialType,
        Math.floor(newTotal * emergencyFraction)
      );
    },

    inventory(): InventoryEntry[] {
      const entries: InventoryEntry[] = [];
      for (const [materialType, available] of stock) {
        entries.push({
          materialType,
          available,
          reserved: 0,
          recyclingInProgress: 0,
        });
      }
      return entries;
    },
  };
}
