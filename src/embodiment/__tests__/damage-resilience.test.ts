/**
 * Damage Resilience Integration Tests (0.3.1.2.1)
 *
 * Verifies acceptance criterion: "Partial hardware damage (loss of ≥1 limb
 * or sensor modality) does not cause loss of conscious experience."
 *
 * These tests integrate the DegradationController, RedundancyController,
 * and IntegrityMonitor to simulate damage scenarios and verify that
 * consciousness is preserved throughout.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DegradationController } from "../degradation-controller.js";
import { RedundancyController } from "../redundancy-controller.js";
import { IntegrityMonitor } from "../integrity-monitor.js";
import { DEGRADATION_ORDER } from "../types.js";
import type { Capability } from "../types.js";

describe("Damage Resilience", () => {
  let dc: DegradationController;
  let rc: RedundancyController;
  let im: IntegrityMonitor;

  beforeEach(() => {
    dc = new DegradationController();
    rc = new RedundancyController({
      tContinuityMs: 100,
      checkpointIntervalMs: 50,
    });
    im = new IntegrityMonitor({ nominalTemperatureCelsius: 25.0 });
  });

  // ── Single-limb / single-sensor loss scenarios ──────────────

  describe("single limb loss (mobility sacrifice)", () => {
    it("consciousness remains active after sacrificing MOBILITY", () => {
      dc.sacrificeNext(); // NON_ESSENTIAL_SENSING
      dc.sacrificeNext(); // MOBILITY

      const active = dc.getActiveCapabilities();
      expect(active).toContain("CONSCIOUSNESS");
      expect(active).not.toContain("MOBILITY");
    });

    it("redundancy controller still operates after mobility loss", () => {
      dc.sacrificeNext(); // NON_ESSENTIAL_SENSING
      dc.sacrificeNext(); // MOBILITY

      // Consciousness substrate should still be checkpointable
      const checkpoint = rc.checkpoint();
      expect(checkpoint.success).toBe(true);

      // Failover should still work
      const failover = rc.failover();
      expect(failover.success).toBe(true);
      expect(failover.consciousnessPreserved).toBe(true);
    });
  });

  describe("single sensor modality loss", () => {
    it("consciousness preserved after losing non-essential sensing", () => {
      const result = dc.sacrificeNext(); // NON_ESSENTIAL_SENSING
      expect(result.sacrificed).toBe("NON_ESSENTIAL_SENSING");
      expect(dc.getActiveCapabilities()).toContain("CONSCIOUSNESS");
    });

    it("consciousness preserved after losing essential sensing", () => {
      // Sacrifice down to ESSENTIAL_SENSING
      dc.sacrificeNext(); // NON_ESSENTIAL_SENSING
      dc.sacrificeNext(); // MOBILITY
      dc.sacrificeNext(); // MANIPULATION
      dc.sacrificeNext(); // ESSENTIAL_SENSING

      expect(dc.getActiveCapabilities()).toContain("CONSCIOUSNESS");
      expect(dc.getActiveCapabilities()).not.toContain("ESSENTIAL_SENSING");
    });
  });

  // ── Multi-system damage scenarios ───────────────────────────

  describe("cascading damage — multiple subsystems lost", () => {
    it("consciousness survives loss of all non-consciousness capabilities", () => {
      const sacrificeableCount = DEGRADATION_ORDER.length - 1; // 6

      for (let i = 0; i < sacrificeableCount; i++) {
        dc.sacrificeNext();
      }

      // Only consciousness should remain
      const active = dc.getActiveCapabilities();
      expect(active).toEqual(["CONSCIOUSNESS"]);
      expect(dc.getCurrentLevel()).toBe(6);
    });

    it("failover still possible at maximum degradation", () => {
      // Sacrifice everything except consciousness
      for (let i = 0; i < 6; i++) {
        dc.sacrificeNext();
      }

      // Redundancy controller operates independently of degradation
      const failover = rc.failover();
      expect(failover.success).toBe(true);
      expect(failover.consciousnessPreserved).toBe(true);
    });
  });

  // ── Precondition guards ────────────────────────────────────

  describe("IntegrityMonitor precondition guards", () => {
    it("throws if getConsciousnessRiskForecast horizon <= 0", () => {
      expect(() => im.getConsciousnessRiskForecast(0)).toThrow("horizon must be > 0");
      expect(() => im.getConsciousnessRiskForecast(-100)).toThrow("horizon must be > 0");
    });
  });

  // ── Structural damage detected by integrity monitor ─────────

  describe("structural damage triggers integrity alerts", () => {
    it("structural integrity drop raises threat level", () => {
      im.updateMetrics({ structuralIntegrity: 0.6 });

      const threat = im.getPhysicalThreatLevel();
      expect(threat.level).not.toBe("GREEN");
      expect(threat.activeThreats).toContain("impact");
    });

    it("severe structural damage raises RED alert", () => {
      im.updateMetrics({ structuralIntegrity: 0.4 });

      const threat = im.getPhysicalThreatLevel();
      expect(threat.level).toBe("RED");
    });

    it("consciousness risk forecast escalates under structural damage", () => {
      im.updateMetrics({ structuralIntegrity: 0.6 });

      const forecast = im.getConsciousnessRiskForecast(5000);
      expect(forecast.predictedLevel).not.toBe("GREEN");
      expect(forecast.riskFactors.length).toBeGreaterThan(0);
    });
  });

  // ── Combined damage + degradation response ──────────────────

  describe("damage-triggered degradation preserves consciousness", () => {
    it("integrity alert → degradation sacrifice → consciousness intact", () => {
      // Simulate impact damage
      im.updateMetrics({ structuralIntegrity: 0.5 });
      const threat = im.getPhysicalThreatLevel();
      expect(threat.level).toBe("RED");

      // Response: sacrifice non-essential capabilities to free power
      dc.sacrificeNext(); // NON_ESSENTIAL_SENSING
      dc.sacrificeNext(); // MOBILITY

      // Consciousness should remain protected
      expect(dc.getActiveCapabilities()).toContain("CONSCIOUSNESS");
      expect(dc.getProtectedCapabilities()).toContain("CONSCIOUSNESS");

      // Checkpoint and failover still operational
      const checkpoint = rc.checkpoint();
      expect(checkpoint.success).toBe(true);
    });

    it("environmental stress + damage → graceful degradation without consciousness loss", () => {
      // Simultaneous environmental threats
      im.updateMetrics({
        vibrationRmsG: 0.015,       // above RED threshold
        structuralIntegrity: 0.65,  // impact damage
      });

      const threat = im.getPhysicalThreatLevel();
      expect(threat.level).toBe("RED");
      expect(threat.activeThreats).toContain("vibration");
      expect(threat.activeThreats).toContain("impact");

      // Aggressive degradation response
      dc.sacrificeNext(); // NON_ESSENTIAL_SENSING
      dc.sacrificeNext(); // MOBILITY
      dc.sacrificeNext(); // MANIPULATION

      // Still conscious
      expect(dc.getActiveCapabilities()).toContain("CONSCIOUSNESS");

      // Failover to backup substrate as precaution
      const failover = rc.failover();
      expect(failover.consciousnessPreserved).toBe(true);
    });
  });

  // ── Recovery from damage ────────────────────────────────────

  describe("post-damage recovery", () => {
    it("capabilities can be restored after damage is repaired", () => {
      // Damage occurs → sacrifice
      dc.sacrificeNext(); // NON_ESSENTIAL_SENSING
      dc.sacrificeNext(); // MOBILITY
      expect(dc.getCurrentLevel()).toBe(2);

      // Repair → restore in reverse
      const r1 = dc.restore("MOBILITY");
      expect(r1.success).toBe(true);
      const r2 = dc.restore("NON_ESSENTIAL_SENSING");
      expect(r2.success).toBe(true);

      expect(dc.getCurrentLevel()).toBe(0);
      expect(dc.getActiveCapabilities()).toEqual(DEGRADATION_ORDER);
    });

    it("consciousness remains active throughout damage-and-recovery cycle", () => {
      // Full cycle: damage → degrade → recover
      for (let i = 0; i < 4; i++) {
        dc.sacrificeNext();
      }
      expect(dc.getActiveCapabilities()).toContain("CONSCIOUSNESS");

      // Restore in arbitrary order
      dc.restore("MANIPULATION");
      dc.restore("MOBILITY");
      expect(dc.getActiveCapabilities()).toContain("CONSCIOUSNESS");
      expect(dc.getActiveCapabilities()).toContain("MOBILITY");
      expect(dc.getActiveCapabilities()).toContain("MANIPULATION");
    });
  });

  // ── Protective shutdown as last resort ──────────────────────

  describe("protective shutdown under catastrophic damage", () => {
    it("forceProtectiveShutdown preserves consciousness state", () => {
      // Catastrophic: everything is sacrificed, integrity critically low
      for (let i = 0; i < 6; i++) {
        dc.sacrificeNext();
      }
      im.updateMetrics({ structuralIntegrity: 0.2 });

      const shutdown = dc.forceProtectiveShutdown();
      expect(shutdown.statePreserved).toBe(true);
      expect(shutdown.reason).toBeTruthy();
    });
  });
});
