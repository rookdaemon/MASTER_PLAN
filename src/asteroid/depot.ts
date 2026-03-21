/**
 * Resource Depot & Distribution Network
 * Domain: 0.4.1.2 — Subsystem 4
 *
 * Manages inventory, fulfills distribution requests, and tracks supply gaps.
 */

import type {
  ResourceDepot,
  ConsumerEndpoint,
  MaterialType,
  DepotSimulationResult,
  SupplyGap,
  ProcessedProduct,
  OrbitalPosition,
} from './types.js';
import { DEPOT_CAPACITY_DEFAULT, DEMAND_MET_THRESHOLD, SUPPLY_GAP_TOLERANCE } from './constants.js';

/**
 * Create a new resource depot with initial capacity and no inventory.
 */
export function createDepot(
  depotId: string,
  location: OrbitalPosition,
  consumers: ConsumerEndpoint[],
  capacityPerMaterial: number = DEPOT_CAPACITY_DEFAULT,
): ResourceDepot {
  if (capacityPerMaterial <= 0) {
    throw new RangeError('capacityPerMaterial must be > 0');
  }
  const allMaterials: MaterialType[] = [
    'iron', 'nickel', 'platinum_group',
    'water', 'lox', 'lh2', 'ammonia',
    'carbon_feedstock', 'slag',
  ];

  const inventory = new Map<MaterialType, number>();
  const capacity = new Map<MaterialType, number>();

  for (const mat of allMaterials) {
    inventory.set(mat, 0);
    capacity.set(mat, capacityPerMaterial);
  }

  return { depotId, location, inventory, capacity, consumers };
}

/**
 * Add processed products to depot inventory (respecting capacity).
 */
export function addToInventory(
  depot: ResourceDepot,
  products: ProcessedProduct[],
): void {
  for (const product of products) {
    if (product.material === 'slag') continue; // Slag stored separately
    const current = depot.inventory.get(product.material) ?? 0;
    const cap = depot.capacity.get(product.material) ?? Infinity;
    depot.inventory.set(product.material, Math.min(current + product.massKg, cap));
  }
}

/**
 * Attempt to fulfill a consumer's daily demand from depot inventory.
 * Returns the amount actually dispensed (may be less than requested).
 */
export function dispenseMaterial(
  depot: ResourceDepot,
  material: MaterialType,
  requestedKg: number,
): number {
  const available = depot.inventory.get(material) ?? 0;
  const dispensed = Math.min(available, requestedKg);
  depot.inventory.set(material, available - dispensed);
  return dispensed;
}

/**
 * Simulate depot operations over a given number of days.
 *
 * Each day:
 * 1. Receive incoming supply (from a supply function)
 * 2. Fulfill consumer demands
 * 3. Track supply gaps (days where demand > available)
 *
 * @param depot The resource depot
 * @param totalDays Number of days to simulate
 * @param dailySupplyFn Function returning products delivered on a given day
 */
export function simulateDepot(
  depot: ResourceDepot,
  totalDays: number,
  dailySupplyFn: (day: number) => ProcessedProduct[],
): DepotSimulationResult {
  if (totalDays <= 0) {
    throw new RangeError('totalDays must be > 0');
  }
  const supplyGaps: SupplyGap[] = [];

  // Track ongoing gaps per consumer+material
  const activeGaps = new Map<string, { startDay: number }>();

  const gapKey = (consumerId: string, material: MaterialType): string =>
    `${consumerId}:${material}`;

  for (let day = 1; day <= totalDays; day++) {
    // 1. Receive daily supply
    const supply = dailySupplyFn(day);
    addToInventory(depot, supply);

    // 2. Serve each consumer's demand
    for (const consumer of depot.consumers) {
      for (const demand of consumer.demandForecast) {
        const dispensed = dispenseMaterial(depot, demand.material, demand.dailyRateKg);
        const key = gapKey(consumer.id, demand.material);

        if (dispensed < demand.dailyRateKg * DEMAND_MET_THRESHOLD) {
          // Supply gap: not meeting demand
          if (!activeGaps.has(key)) {
            activeGaps.set(key, { startDay: day });
          }
        } else {
          // Demand met — close any active gap
          const active = activeGaps.get(key);
          if (active) {
            supplyGaps.push({
              consumerId: consumer.id,
              material: demand.material,
              startDay: active.startDay,
              endDay: day - 1,
              durationDays: day - active.startDay,
            });
            activeGaps.delete(key);
          }
        }
      }
    }
  }

  // Close any still-open gaps
  for (const [key, active] of activeGaps.entries()) {
    const [consumerId, material] = key.split(':') as [string, MaterialType];
    supplyGaps.push({
      consumerId,
      material,
      startDay: active.startDay,
      endDay: totalDays,
      durationDays: totalDays - active.startDay + 1,
    });
  }

  const maxGapDays = supplyGaps.length > 0
    ? Math.max(...supplyGaps.map((g) => g.durationDays))
    : 0;

  return {
    totalDaysSimulated: totalDays,
    supplyGaps,
    maxGapDays,
    allConsumersServed: maxGapDays <= SUPPLY_GAP_TOLERANCE,
    finalInventory: new Map(depot.inventory),
  };
}
