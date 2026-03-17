/**
 * Feedstock Management — Tests
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Tests for material reservoir, recycling, allocation, and emergency reserves.
 */

import { describe, it, expect } from "vitest";
import { createFeedstockManager } from "./feedstock-manager.js";

describe("FeedstockManager", () => {
  describe("inventory()", () => {
    it("returns initial inventory matching configured materials", () => {
      const mgr = createFeedstockManager({
        materials: [
          { materialType: "silicon", initialQuantity: 100 },
          { materialType: "carbon", initialQuantity: 50 },
        ],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1,
      });

      const inv = mgr.inventory();
      expect(inv).toHaveLength(2);

      const silicon = inv.find((e) => e.materialType === "silicon")!;
      expect(silicon.available).toBe(100);
      expect(silicon.reserved).toBe(0);
      expect(silicon.recyclingInProgress).toBe(0);

      const carbon = inv.find((e) => e.materialType === "carbon")!;
      expect(carbon.available).toBe(50);
    });
  });

  describe("request()", () => {
    it("grants a request when sufficient material is available", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 100 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1,
      });

      const result = mgr.request({ materialType: "silicon", quantity: 50 });
      expect(result.granted).toBe(true);
      if (result.granted) {
        expect(result.allocation.materialType).toBe("silicon");
        expect(result.allocation.quantity).toBe(50);
        expect(result.allocation.sourceReservoir).toBe("reservoir-main");
      }
    });

    it("reduces available inventory after granting a request", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 100 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1,
      });

      mgr.request({ materialType: "silicon", quantity: 40 });

      const inv = mgr.inventory();
      const silicon = inv.find((e) => e.materialType === "silicon")!;
      expect(silicon.available).toBe(60);
    });

    it("denies a request when quantity exceeds available (minus emergency reserve)", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 100 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1, // reserves 10 units
      });

      // Available for non-emergency use: 100 - 10 = 90
      const result = mgr.request({ materialType: "silicon", quantity: 95 });
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.reason).toContain("insufficient");
      }
    });

    it("denies a request for an unknown material type", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 100 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1,
      });

      const result = mgr.request({ materialType: "unobtanium", quantity: 1 });
      expect(result.granted).toBe(false);
      if (!result.granted) {
        expect(result.reason).toContain("unknown");
      }
    });

    it("allows requesting up to exactly the non-reserved amount", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 100 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1, // reserves 10
      });

      const result = mgr.request({ materialType: "silicon", quantity: 90 });
      expect(result.granted).toBe(true);
    });
  });

  describe("recycle()", () => {
    it("increases available inventory by recycled quantity adjusted for purity", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 50 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1,
      });

      // Recycle 20 units at 90% purity => 18 units recovered
      mgr.recycle({ materialType: "silicon", quantity: 20, purity: 0.9 });

      const inv = mgr.inventory();
      const silicon = inv.find((e) => e.materialType === "silicon")!;
      expect(silicon.available).toBe(68); // 50 + 18
    });

    it("handles perfect purity recycling", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "carbon", initialQuantity: 10 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.0,
      });

      mgr.recycle({ materialType: "carbon", quantity: 5, purity: 1.0 });

      const inv = mgr.inventory();
      const carbon = inv.find((e) => e.materialType === "carbon")!;
      expect(carbon.available).toBe(15);
    });

    it("ignores recycling deposits for unknown material types", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 50 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1,
      });

      // Should not throw
      mgr.recycle({ materialType: "unobtanium", quantity: 100, purity: 1.0 });

      const inv = mgr.inventory();
      expect(inv).toHaveLength(1);
    });
  });

  describe("emergency reserves", () => {
    it("protects emergency reserve from normal allocation", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 100 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.2, // reserves 20
      });

      // Drain non-reserved: 80 units
      mgr.request({ materialType: "silicon", quantity: 80 });

      // Trying to get 1 more should fail (only emergency reserve left)
      const result = mgr.request({ materialType: "silicon", quantity: 1 });
      expect(result.granted).toBe(false);
    });

    it("recalculates emergency reserve when inventory grows from recycling", () => {
      const mgr = createFeedstockManager({
        materials: [{ materialType: "silicon", initialQuantity: 100 }],
        reservoirId: "reservoir-main",
        emergencyReserveFraction: 0.1, // initial reserve: 10
      });

      // Use 90 (all non-reserved)
      mgr.request({ materialType: "silicon", quantity: 90 });

      // Recycle 50 units at full purity
      mgr.recycle({ materialType: "silicon", quantity: 50, purity: 1.0 });

      // Now available = 10 + 50 = 60, reserve = 60 * 0.1 = 6, allocatable = 54
      const result = mgr.request({ materialType: "silicon", quantity: 54 });
      expect(result.granted).toBe(true);
    });
  });
});
