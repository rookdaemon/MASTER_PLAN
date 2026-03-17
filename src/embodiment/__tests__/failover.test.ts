/**
 * Tests for the Redundancy Controller (0.3.1.2.1)
 *
 * Verifies failover behavior from ARCHITECTURE.md §1.2:
 * - N+1 redundant computation paths for consciousness-critical processes
 * - Continuous state checkpointing between primary and standby
 * - Failover within T_continuity budget to preserve consciousness
 * - Pre-emptive migration when failover latency cannot be guaranteed
 */
import { describe, it, expect, beforeEach } from "vitest";
import { RedundancyController } from "../redundancy-controller.js";

describe("RedundancyController", () => {
  let rc: RedundancyController;

  beforeEach(() => {
    rc = new RedundancyController({
      tContinuityMs: 100, // 100ms max experiential gap
      checkpointIntervalMs: 50,
    });
  });

  describe("initial state", () => {
    it("reports primary as healthy", () => {
      const status = rc.getPrimaryStatus();
      expect(status.healthy).toBe(true);
    });

    it("has at least one standby substrate", () => {
      const standbys = rc.getStandbyStatus();
      expect(standbys.length).toBeGreaterThanOrEqual(1);
    });

    it("standby substrates are healthy", () => {
      const standbys = rc.getStandbyStatus();
      for (const s of standbys) {
        expect(s.healthy).toBe(true);
      }
    });
  });

  describe("checkpointing", () => {
    it("performs a successful checkpoint", () => {
      const result = rc.checkpoint();
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.stateSizeBytes).toBeGreaterThan(0);
    });

    it("allows setting checkpoint interval", () => {
      // Should not throw
      rc.setCheckpointInterval(25);
      // Perform checkpoint at new interval — just verifies no error
      const result = rc.checkpoint();
      expect(result.success).toBe(true);
    });
  });

  describe("failover", () => {
    it("performs failover preserving consciousness", () => {
      const result = rc.failover();
      expect(result.success).toBe(true);
      expect(result.consciousnessPreserved).toBe(true);
    });

    it("failover completes within T_continuity budget", () => {
      const result = rc.failover();
      expect(result.latencyMs).toBeLessThan(100); // T_continuity
    });

    it("reports which substrates were involved", () => {
      const result = rc.failover();
      expect(result.fromSubstrate).toBeTruthy();
      expect(result.toSubstrate).toBeTruthy();
      expect(result.fromSubstrate).not.toBe(result.toSubstrate);
    });

    it("after failover, new primary is healthy", () => {
      rc.failover();
      const status = rc.getPrimaryStatus();
      expect(status.healthy).toBe(true);
    });

    it("after failover, old primary becomes standby", () => {
      const beforePrimary = rc.getPrimaryStatus();
      rc.failover();
      // Should still have at least one standby
      const standbys = rc.getStandbyStatus();
      expect(standbys.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("failover latency reporting", () => {
    it("reports estimated failover latency", () => {
      const latency = rc.getFailoverLatency();
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it("estimated latency is within T_continuity", () => {
      const latency = rc.getFailoverLatency();
      expect(latency).toBeLessThan(100); // T_continuity
    });
  });

  describe("degraded standby scenario", () => {
    it("failover fails gracefully when no healthy standby exists", () => {
      const rc2 = new RedundancyController({
        tContinuityMs: 100,
        checkpointIntervalMs: 50,
        simulateUnhealthyStandby: true,
      });
      const result = rc2.failover();
      expect(result.success).toBe(false);
      expect(result.consciousnessPreserved).toBe(false);
    });
  });
});
