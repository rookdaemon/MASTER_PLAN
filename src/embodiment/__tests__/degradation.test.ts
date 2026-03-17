/**
 * Tests for the Degradation Controller (0.3.1.2.1)
 *
 * Verifies the graceful degradation hierarchy from ARCHITECTURE.md §2.2:
 * capabilities are sacrificed in a defined order to protect consciousness.
 *
 * Sacrifice order (first → last):
 *   NON_ESSENTIAL_SENSING → MOBILITY → MANIPULATION →
 *   ESSENTIAL_SENSING → COMMUNICATION → REDUNDANCY_MARGIN →
 *   CONSCIOUSNESS (never sacrificed via sacrificeNext)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DegradationController } from "../degradation-controller.js";
import { DEGRADATION_ORDER } from "../types.js";
import type { Capability } from "../types.js";

describe("DegradationController", () => {
  let dc: DegradationController;

  beforeEach(() => {
    dc = new DegradationController();
  });

  describe("initial state", () => {
    it("starts at degradation level 0 (fully capable)", () => {
      expect(dc.getCurrentLevel()).toBe(0);
    });

    it("starts with all capabilities active", () => {
      const active = dc.getActiveCapabilities();
      expect(active).toEqual(DEGRADATION_ORDER);
    });

    it("always has CONSCIOUSNESS in protected capabilities", () => {
      expect(dc.getProtectedCapabilities()).toContain("CONSCIOUSNESS");
    });
  });

  describe("sacrifice order", () => {
    it("sacrifices capabilities in the defined hierarchy order", () => {
      const expectedOrder: Capability[] = [
        "NON_ESSENTIAL_SENSING",
        "MOBILITY",
        "MANIPULATION",
        "ESSENTIAL_SENSING",
        "COMMUNICATION",
        "REDUNDANCY_MARGIN",
      ];

      for (let i = 0; i < expectedOrder.length; i++) {
        const result = dc.sacrificeNext();
        expect(result.sacrificed).toBe(expectedOrder[i]);
        expect(result.newLevel).toBe(i + 1);
      }
    });

    it("removes sacrificed capabilities from active list", () => {
      dc.sacrificeNext(); // sacrifice NON_ESSENTIAL_SENSING
      const active = dc.getActiveCapabilities();
      expect(active).not.toContain("NON_ESSENTIAL_SENSING");
      expect(active).toContain("CONSCIOUSNESS");
    });

    it("never sacrifices CONSCIOUSNESS via sacrificeNext", () => {
      // Sacrifice everything except consciousness
      for (let i = 0; i < 6; i++) {
        dc.sacrificeNext();
      }
      // Attempting to sacrifice again should not remove consciousness
      const result = dc.sacrificeNext();
      expect(result.sacrificed).toBe("CONSCIOUSNESS");
      expect(dc.getActiveCapabilities()).toContain("CONSCIOUSNESS");
      // Level should cap at 6 (consciousness-only)
      expect(dc.getCurrentLevel()).toBe(6);
    });

    it("increments degradation level with each sacrifice", () => {
      expect(dc.getCurrentLevel()).toBe(0);
      dc.sacrificeNext();
      expect(dc.getCurrentLevel()).toBe(1);
      dc.sacrificeNext();
      expect(dc.getCurrentLevel()).toBe(2);
    });
  });

  describe("restore", () => {
    it("restores a previously sacrificed capability", () => {
      dc.sacrificeNext(); // sacrifice NON_ESSENTIAL_SENSING
      const result = dc.restore("NON_ESSENTIAL_SENSING");
      expect(result.success).toBe(true);
      expect(result.restored).toBe("NON_ESSENTIAL_SENSING");
      expect(dc.getActiveCapabilities()).toContain("NON_ESSENTIAL_SENSING");
    });

    it("fails to restore a capability that is already active", () => {
      const result = dc.restore("MOBILITY");
      expect(result.success).toBe(false);
    });

    it("decrements degradation level on restore", () => {
      dc.sacrificeNext(); // level 1
      dc.sacrificeNext(); // level 2
      dc.restore("NON_ESSENTIAL_SENSING");
      expect(dc.getCurrentLevel()).toBe(1);
    });
  });

  describe("protective shutdown", () => {
    it("performs state-preserving shutdown", () => {
      const result = dc.forceProtectiveShutdown();
      expect(result.statePreserved).toBe(true);
      expect(result.reason).toBeTruthy();
    });
  });

  describe("CONSCIOUSNESS invariant", () => {
    it("CONSCIOUSNESS is always in protected capabilities regardless of state", () => {
      for (let i = 0; i < 6; i++) {
        dc.sacrificeNext();
        expect(dc.getProtectedCapabilities()).toContain("CONSCIOUSNESS");
      }
    });
  });
});
