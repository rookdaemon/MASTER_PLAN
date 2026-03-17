/**
 * Hot-Swap Coordinator — Tests
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Ensures repairs never interrupt active conscious processes by coordinating
 * with the redundancy layer (0.2.1.4).
 */

import { describe, it, expect, vi } from "vitest";
import { createHotSwapCoordinator } from "./hot-swap-coordinator.js";
import {
  LockType,
  type RedundancyLayer,
  type OffloadRequest,
} from "./types.js";

function makeRedundancyLayer(
  overrides: Partial<RedundancyLayer> = {}
): RedundancyLayer {
  return {
    offload: vi.fn().mockResolvedValue({ success: true, fallbackRegionId: "fallback-01" }),
    restore: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe("HotSwapCoordinator", () => {
  describe("requestOffload()", () => {
    it("delegates to redundancy layer and returns OffloadAck", async () => {
      const layer = makeRedundancyLayer();
      const coordinator = createHotSwapCoordinator({ redundancyLayer: layer });

      const request: OffloadRequest = {
        regionId: "region-01",
        reason: "mechanical damage repair",
        estimatedDuration_ms: 5000,
      };
      const ack = await coordinator.requestOffload(request);

      expect(ack.success).toBe(true);
      expect(ack.fallbackRegionId).toBe("fallback-01");
      expect(layer.offload).toHaveBeenCalledWith(request);
    });

    it("returns failure when redundancy layer cannot offload", async () => {
      const layer = makeRedundancyLayer({
        offload: vi.fn().mockResolvedValue({ success: false, fallbackRegionId: null }),
      });
      const coordinator = createHotSwapCoordinator({ redundancyLayer: layer });

      const ack = await coordinator.requestOffload({
        regionId: "region-01",
        reason: "repair",
        estimatedDuration_ms: 1000,
      });

      expect(ack.success).toBe(false);
      expect(ack.fallbackRegionId).toBeNull();
    });
  });

  describe("lockRegion()", () => {
    it("locks a region for exclusive repair access", async () => {
      const coordinator = createHotSwapCoordinator({
        redundancyLayer: makeRedundancyLayer(),
      });

      const ack = await coordinator.lockRegion({
        regionId: "region-01",
        lockType: LockType.Exclusive,
      });

      expect(ack.success).toBe(true);
    });

    it("rejects locking an already-locked region", async () => {
      const coordinator = createHotSwapCoordinator({
        redundancyLayer: makeRedundancyLayer(),
      });

      await coordinator.lockRegion({ regionId: "region-01", lockType: LockType.Exclusive });
      const ack = await coordinator.lockRegion({ regionId: "region-01", lockType: LockType.Exclusive });

      expect(ack.success).toBe(false);
    });

    it("allows locking different regions concurrently", async () => {
      const coordinator = createHotSwapCoordinator({
        redundancyLayer: makeRedundancyLayer(),
        maxConcurrentLocks: 3,
      });

      const ack1 = await coordinator.lockRegion({ regionId: "region-01", lockType: LockType.Exclusive });
      const ack2 = await coordinator.lockRegion({ regionId: "region-02", lockType: LockType.Exclusive });

      expect(ack1.success).toBe(true);
      expect(ack2.success).toBe(true);
    });

    it("rejects lock when max concurrent locks reached", async () => {
      const coordinator = createHotSwapCoordinator({
        redundancyLayer: makeRedundancyLayer(),
        maxConcurrentLocks: 1,
      });

      await coordinator.lockRegion({ regionId: "region-01", lockType: LockType.Exclusive });
      const ack = await coordinator.lockRegion({ regionId: "region-02", lockType: LockType.Exclusive });

      expect(ack.success).toBe(false);
    });
  });

  describe("unlockRegion()", () => {
    it("unlocks a previously locked region", async () => {
      const coordinator = createHotSwapCoordinator({
        redundancyLayer: makeRedundancyLayer(),
      });

      await coordinator.lockRegion({ regionId: "region-01", lockType: LockType.Exclusive });
      const ack = await coordinator.unlockRegion("region-01");

      expect(ack.success).toBe(true);
    });

    it("returns failure when unlocking a region that is not locked", async () => {
      const coordinator = createHotSwapCoordinator({
        redundancyLayer: makeRedundancyLayer(),
      });

      const ack = await coordinator.unlockRegion("region-01");

      expect(ack.success).toBe(false);
    });

    it("allows re-locking a region after unlock", async () => {
      const coordinator = createHotSwapCoordinator({
        redundancyLayer: makeRedundancyLayer(),
      });

      await coordinator.lockRegion({ regionId: "region-01", lockType: LockType.Exclusive });
      await coordinator.unlockRegion("region-01");
      const ack = await coordinator.lockRegion({ regionId: "region-01", lockType: LockType.Exclusive });

      expect(ack.success).toBe(true);
    });
  });

  describe("requestRestore()", () => {
    it("delegates restore to redundancy layer", async () => {
      const layer = makeRedundancyLayer();
      const coordinator = createHotSwapCoordinator({ redundancyLayer: layer });

      const ack = await coordinator.requestRestore({ regionId: "region-01" });

      expect(ack.success).toBe(true);
      expect(layer.restore).toHaveBeenCalledWith({ regionId: "region-01" });
    });

    it("returns failure when redundancy layer restore fails", async () => {
      const layer = makeRedundancyLayer({
        restore: vi.fn().mockResolvedValue({ success: false }),
      });
      const coordinator = createHotSwapCoordinator({ redundancyLayer: layer });

      const ack = await coordinator.requestRestore({ regionId: "region-01" });

      expect(ack.success).toBe(false);
    });
  });
});
