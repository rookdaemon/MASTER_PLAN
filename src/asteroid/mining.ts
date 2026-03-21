/**
 * Asteroid Extraction (Mining) Simulation
 * Domain: 0.4.1.2 — Subsystem 2
 *
 * Simulates autonomous mining operations on asteroid targets.
 */

import type {
  AsteroidCandidate,
  MiningOperation,
  ExtractionResult,
  LogEntry,
  ResourceMap,
} from './types.js';
import { totalResourceMass } from './prospecting.js';
import {
  BASE_EXTRACTION_RATE_FRACTION,
  VOLATILE_RATIO_THRESHOLD,
  DAILY_EFFICIENCY_RANGE_LOW,
  DAILY_EFFICIENCY_RANGE_HIGH,
  FAULT_PROBABILITY,
  ENERGY_PER_KG_EXTRACTION,
} from './constants.js';

/**
 * Determine extraction method based on spectral type.
 */
export function recommendExtractionMethod(
  candidate: AsteroidCandidate,
): MiningOperation {
  const comp = candidate.estimatedComposition;
  const volatileRatio =
    (comp.volatiles.water_ice + comp.volatiles.co2 + comp.volatiles.ammonia) /
    totalResourceMass(comp);

  // C-type asteroids rich in volatiles → scoop/ablation
  // M-type metallic → drill
  // S-type silicate → mass-driver
  const method =
    candidate.spectralType === 'M'
      ? 'drill' as const
      : volatileRatio > VOLATILE_RATIO_THRESHOLD
        ? 'ablation' as const
        : 'mass-driver' as const;

  const anchorage =
    candidate.spectralType === 'D' ? 'halo-orbit' as const : 'surface-anchor' as const;

  return {
    targetId: candidate.designation,
    anchorageSystem: anchorage,
    extractionMethod: method,
    extractionRate: estimateExtractionRate(candidate),
    autonomyLevel: 'fully-autonomous',
    operationalLifetime: 365,
  };
}

/**
 * Estimate daily extraction rate (kg/day) based on asteroid properties.
 */
function estimateExtractionRate(candidate: AsteroidCandidate): number {
  const total = totalResourceMass(candidate.estimatedComposition);
  // Base rate: extract a fraction of total per day, scaled by accessibility
  const baseRate = total * BASE_EXTRACTION_RATE_FRACTION;
  return baseRate * candidate.accessibilityScore;
}

/**
 * Simulate a mining operation over its operational lifetime.
 *
 * Simulates daily extraction with:
 * - Random efficiency variation (85-100% of nominal rate)
 * - Occasional equipment faults (autonomous recovery, no Earth commands)
 * - Full autonomy tracking (no Earth-based commands issued)
 *
 * @param operation Mining operation configuration
 * @param durationDays Number of days to simulate (default: operation lifetime)
 * @param seed Random seed for reproducibility
 */
export function simulateMining(
  operation: MiningOperation,
  composition: ResourceMap,
  durationDays?: number,
  seed: number = 42,
): ExtractionResult {
  const days = durationDays ?? operation.operationalLifetime;
  if (days <= 0) {
    throw new RangeError('durationDays must be > 0');
  }
  const log: LogEntry[] = [];
  let totalOre = 0;
  let totalVolatiles = 0;
  let totalEnergy = 0;
  let autonomousDays = 0;

  // Simple seeded PRNG (mulberry32)
  let state = seed;
  const random = (): number => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const totalMass = totalResourceMass(composition);
  const volatileFraction =
    (composition.volatiles.water_ice +
      composition.volatiles.co2 +
      composition.volatiles.ammonia) /
    totalMass;

  const energyPerKg = ENERGY_PER_KG_EXTRACTION;

  log.push({ timestamp: 0, event: 'MINING_START', details: `Target: ${operation.targetId}` });

  for (let day = 1; day <= days; day++) {
    // Equipment fault: ~2% chance per day, resolved autonomously (1-day pause)
    if (random() < FAULT_PROBABILITY) {
      log.push({
        timestamp: day,
        event: 'FAULT_DETECTED',
        details: 'Autonomous recovery initiated',
      });
      autonomousDays++; // Still autonomous — no Earth command needed
      continue;
    }

    // Daily efficiency: 85-100% of nominal
    const efficiency = DAILY_EFFICIENCY_RANGE_LOW + random() * (DAILY_EFFICIENCY_RANGE_HIGH - DAILY_EFFICIENCY_RANGE_LOW);
    const dailyExtraction = operation.extractionRate * efficiency;

    const oreToday = dailyExtraction * (1 - volatileFraction);
    const volatilesToday = dailyExtraction * volatileFraction;

    totalOre += oreToday;
    totalVolatiles += volatilesToday;
    totalEnergy += dailyExtraction * energyPerKg;
    autonomousDays++;

    if (day % 30 === 0) {
      log.push({
        timestamp: day,
        event: 'STATUS_REPORT',
        details: `Ore: ${totalOre.toFixed(0)} kg, Volatiles: ${totalVolatiles.toFixed(0)} kg`,
      });
    }
  }

  const theoreticalMax = operation.extractionRate * days;

  log.push({
    timestamp: days,
    event: 'MINING_COMPLETE',
    details: `Achieved ${(((totalOre + totalVolatiles) / theoreticalMax) * 100).toFixed(1)}% of theoretical max`,
  });

  return {
    bulkOreMass: totalOre,
    capturedVolatileMass: totalVolatiles,
    energyConsumed: totalEnergy,
    operationLog: log,
    daysAutonomous: autonomousDays,
    theoreticalMaxMass: theoreticalMax,
  };
}
