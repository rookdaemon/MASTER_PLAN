/**
 * InvariantChecker — validates contract invariants from card 0.4.1.1.
 *
 * Each method corresponds to an invariant from the Contracts section:
 * - Radiation: MTBF ≥ tier threshold
 * - Thermal: Temperature within ±tolerance of setpoint
 * - Power: Uptime ≥ 99.9 %
 * - Communication: Sync lag ≤ lag class threshold
 * - Maintenance: MTTR within continuity threshold; consciousness maintained
 */

import {
  PlatformTier,
  SyncLagClass,
  TIER_MTBF_HOURS,
  POWER_UPTIME_PERCENT,
  SYNC_LAG_TIGHT_MS,
  SYNC_LAG_LOOSE_S,
  SYNC_LAG_EVENTUAL_HOURS,
  TIER_C_HOT_SWAP_MAX_HOURS,
} from "./constants.js";
import type { InvariantChecker } from "./types.js";

/**
 * Returns the sync lag threshold in milliseconds for a given lag class.
 * Converts from the Threshold Registry units (ms, s, h) to a uniform ms.
 */
function syncLagThresholdMs(lagClass: SyncLagClass): number {
  switch (lagClass) {
    case SyncLagClass.Tight:
      return SYNC_LAG_TIGHT_MS;
    case SyncLagClass.Loose:
      return SYNC_LAG_LOOSE_S * 1000;
    case SyncLagClass.Eventual:
      return SYNC_LAG_EVENTUAL_HOURS * 3600 * 1000;
  }
}

/**
 * Returns the maximum MTTR in hours for a given tier.
 * Tier C specifies ≤ 4 h hot-swap (from Threshold Registry).
 * Tier B has the same MTTR target (per platform-tiers.md: MTTR ≤ 4 h).
 * Tier A allows up to 24 h (per platform-tiers.md: module replacement within 24 h).
 */
function maxMttrHours(tier: PlatformTier): number {
  switch (tier) {
    case PlatformTier.A:
      return 24;
    case PlatformTier.B:
      return TIER_C_HOT_SWAP_MAX_HOURS; // 4 h — same as Tier C
    case PlatformTier.C:
      return TIER_C_HOT_SWAP_MAX_HOURS; // 4 h
  }
}

function createInvariantCheckerImpl(): InvariantChecker {
  return {
    checkRadiationInvariant(mtbfHours: number, tier: PlatformTier): boolean {
      return mtbfHours >= TIER_MTBF_HOURS[tier];
    },

    checkThermalInvariant(
      temperatureC: number,
      setpointC: number,
      toleranceC: number,
    ): boolean {
      return Math.abs(temperatureC - setpointC) <= toleranceC;
    },

    checkPowerInvariant(uptimePercent: number): boolean {
      return uptimePercent >= POWER_UPTIME_PERCENT;
    },

    checkSyncLagInvariant(lagMs: number, lagClass: SyncLagClass): boolean {
      return lagMs <= syncLagThresholdMs(lagClass);
    },

    checkMaintenanceInvariant(
      mttrHours: number,
      continuitySatisfied: boolean,
      tier: PlatformTier,
    ): boolean {
      if (!continuitySatisfied) return false;
      return mttrHours <= maxMttrHours(tier);
    },
  };
}

/** Factory function — creates an InvariantChecker instance */
export function createInvariantChecker(): InvariantChecker {
  return createInvariantCheckerImpl();
}
