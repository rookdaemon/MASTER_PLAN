/**
 * Hot-Swap Coordinator — Implementation
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Ensures repairs never interrupt active conscious processes by coordinating
 * with the redundancy layer (0.2.1.4). Manages region locks and the
 * offload/restore lifecycle per ARCHITECTURE.md protocol.
 */

import {
  type OffloadRequest,
  type OffloadAck,
  type RestoreRequest,
  type RestoreAck,
  type RegionLock,
  type LockAck,
  type UnlockAck,
  type RedundancyLayer,
  type HotSwapCoordinator,
} from "./types.js";

// ── Configuration ───────────────────────────────────────────────────────────

export interface HotSwapCoordinatorConfig {
  /** The redundancy layer (0.2.1.4) for offload/restore operations */
  redundancyLayer: RedundancyLayer;
  /** Maximum number of regions that can be locked simultaneously.
   *  Bounded to preserve minimum redundancy margin. */
  maxConcurrentLocks?: number;
}

const DEFAULT_MAX_CONCURRENT_LOCKS = 4;

// ── Factory ─────────────────────────────────────────────────────────────────

export function createHotSwapCoordinator(
  config: HotSwapCoordinatorConfig
): HotSwapCoordinator {
  const { redundancyLayer } = config;
  const maxLocks = config.maxConcurrentLocks ?? DEFAULT_MAX_CONCURRENT_LOCKS;

  // Track currently locked regions
  const lockedRegions = new Set<string>();

  return {
    async requestOffload(request: OffloadRequest): Promise<OffloadAck> {
      return redundancyLayer.offload(request);
    },

    async lockRegion(lock: RegionLock): Promise<LockAck> {
      // Reject if already locked
      if (lockedRegions.has(lock.regionId)) {
        return { success: false };
      }

      // Reject if max concurrent locks reached
      if (lockedRegions.size >= maxLocks) {
        return { success: false };
      }

      lockedRegions.add(lock.regionId);
      return { success: true };
    },

    async unlockRegion(regionId: string): Promise<UnlockAck> {
      if (!lockedRegions.has(regionId)) {
        return { success: false };
      }

      lockedRegions.delete(regionId);
      return { success: true };
    },

    async requestRestore(request: RestoreRequest): Promise<RestoreAck> {
      return redundancyLayer.restore(request);
    },
  };
}
