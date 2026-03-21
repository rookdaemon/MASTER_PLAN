/**
 * Tests for InvariantChecker — validates contract invariants from card 0.4.1.1.
 *
 * Each test maps directly to an invariant from the Contracts section:
 * - Radiation: MTBF ≥ threshold per tier
 * - Thermal: Substrate temp within ±tolerance of setpoint
 * - Power: ≥ 99.9 % uptime
 * - Communication: Sync lag within lag class threshold
 * - Maintenance: MTTR within continuity threshold
 */

import { describe, it, expect } from "vitest";
import { PlatformTier, SyncLagClass } from "../constants.js";
import {
  MTBF_TIER_A_HOURS,
  MTBF_TIER_B_HOURS,
  MTBF_TIER_C_HOURS,
  THERMAL_SETPOINT_C,
  THERMAL_SETPOINT_TOLERANCE_C,
  POWER_UPTIME_PERCENT,
  SYNC_LAG_TIGHT_MS,
  SYNC_LAG_LOOSE_S,
  SYNC_LAG_EVENTUAL_HOURS,
  TIER_C_HOT_SWAP_MAX_HOURS,
} from "../constants.js";
import { createInvariantChecker } from "../invariant-checker.js";

describe("InvariantChecker", () => {
  const checker = createInvariantChecker();

  // ── Radiation Invariant ───────────────────────────────────────────────────

  describe("checkRadiationInvariant", () => {
    it("passes when Tier A MTBF meets threshold (10⁵ h)", () => {
      expect(checker.checkRadiationInvariant(MTBF_TIER_A_HOURS, PlatformTier.A)).toBe(true);
    });

    it("passes when Tier A MTBF exceeds threshold", () => {
      expect(checker.checkRadiationInvariant(MTBF_TIER_A_HOURS * 2, PlatformTier.A)).toBe(true);
    });

    it("fails when Tier A MTBF is below threshold", () => {
      expect(checker.checkRadiationInvariant(MTBF_TIER_A_HOURS - 1, PlatformTier.A)).toBe(false);
    });

    it("passes when Tier B MTBF meets threshold (5×10⁵ h)", () => {
      expect(checker.checkRadiationInvariant(MTBF_TIER_B_HOURS, PlatformTier.B)).toBe(true);
    });

    it("fails when Tier B MTBF is below threshold", () => {
      expect(checker.checkRadiationInvariant(MTBF_TIER_B_HOURS - 1, PlatformTier.B)).toBe(false);
    });

    it("passes when Tier C MTBF meets threshold (10⁶ h)", () => {
      expect(checker.checkRadiationInvariant(MTBF_TIER_C_HOURS, PlatformTier.C)).toBe(true);
    });

    it("fails when Tier C MTBF is below threshold", () => {
      expect(checker.checkRadiationInvariant(MTBF_TIER_C_HOURS - 1, PlatformTier.C)).toBe(false);
    });
  });

  // ── Thermal Invariant ─────────────────────────────────────────────────────

  describe("checkThermalInvariant", () => {
    const setpoint = THERMAL_SETPOINT_C;
    const tolerance = THERMAL_SETPOINT_TOLERANCE_C;

    it("passes when temperature equals setpoint", () => {
      expect(checker.checkThermalInvariant(setpoint, setpoint, tolerance)).toBe(true);
    });

    it("passes at upper boundary (setpoint + tolerance)", () => {
      expect(checker.checkThermalInvariant(setpoint + tolerance, setpoint, tolerance)).toBe(true);
    });

    it("passes at lower boundary (setpoint - tolerance)", () => {
      expect(checker.checkThermalInvariant(setpoint - tolerance, setpoint, tolerance)).toBe(true);
    });

    it("fails just above upper boundary", () => {
      expect(checker.checkThermalInvariant(setpoint + tolerance + 0.1, setpoint, tolerance)).toBe(false);
    });

    it("fails just below lower boundary", () => {
      expect(checker.checkThermalInvariant(setpoint - tolerance - 0.1, setpoint, tolerance)).toBe(false);
    });

    it("works with custom setpoint (20 °C min)", () => {
      expect(checker.checkThermalInvariant(20, 20, tolerance)).toBe(true);
      expect(checker.checkThermalInvariant(25, 20, tolerance)).toBe(true);
      expect(checker.checkThermalInvariant(25.1, 20, tolerance)).toBe(false);
    });

    it("works with custom setpoint (30 °C max)", () => {
      expect(checker.checkThermalInvariant(30, 30, tolerance)).toBe(true);
      expect(checker.checkThermalInvariant(35, 30, tolerance)).toBe(true);
      expect(checker.checkThermalInvariant(35.1, 30, tolerance)).toBe(false);
    });
  });

  // ── Power Invariant ───────────────────────────────────────────────────────

  describe("checkPowerInvariant", () => {
    it("passes when uptime meets threshold (99.9 %)", () => {
      expect(checker.checkPowerInvariant(POWER_UPTIME_PERCENT)).toBe(true);
    });

    it("passes when uptime exceeds threshold", () => {
      expect(checker.checkPowerInvariant(100)).toBe(true);
    });

    it("fails when uptime is below threshold", () => {
      expect(checker.checkPowerInvariant(POWER_UPTIME_PERCENT - 0.1)).toBe(false);
    });

    it("fails at 99.0 % (documented failure case)", () => {
      expect(checker.checkPowerInvariant(99.0)).toBe(false);
    });
  });

  // ── Communication Sync Lag Invariant ──────────────────────────────────────

  describe("checkSyncLagInvariant", () => {
    it("passes when Tight lag is at threshold (100 ms)", () => {
      expect(checker.checkSyncLagInvariant(SYNC_LAG_TIGHT_MS, SyncLagClass.Tight)).toBe(true);
    });

    it("passes when Tight lag is below threshold", () => {
      expect(checker.checkSyncLagInvariant(50, SyncLagClass.Tight)).toBe(true);
    });

    it("fails when Tight lag exceeds threshold", () => {
      expect(checker.checkSyncLagInvariant(SYNC_LAG_TIGHT_MS + 1, SyncLagClass.Tight)).toBe(false);
    });

    it("passes when Loose lag is at threshold (10 s = 10000 ms)", () => {
      expect(checker.checkSyncLagInvariant(SYNC_LAG_LOOSE_S * 1000, SyncLagClass.Loose)).toBe(true);
    });

    it("fails when Loose lag exceeds threshold", () => {
      expect(checker.checkSyncLagInvariant(SYNC_LAG_LOOSE_S * 1000 + 1, SyncLagClass.Loose)).toBe(false);
    });

    it("passes when Eventual lag is at threshold (48 h = 172800000 ms)", () => {
      const thresholdMs = SYNC_LAG_EVENTUAL_HOURS * 3600 * 1000;
      expect(checker.checkSyncLagInvariant(thresholdMs, SyncLagClass.Eventual)).toBe(true);
    });

    it("fails when Eventual lag exceeds threshold", () => {
      const thresholdMs = SYNC_LAG_EVENTUAL_HOURS * 3600 * 1000;
      expect(checker.checkSyncLagInvariant(thresholdMs + 1, SyncLagClass.Eventual)).toBe(false);
    });
  });

  // ── Maintenance Invariant ─────────────────────────────────────────────────

  describe("checkMaintenanceInvariant", () => {
    it("passes when MTTR is within hot-swap limit and continuity is maintained", () => {
      expect(checker.checkMaintenanceInvariant(TIER_C_HOT_SWAP_MAX_HOURS, true, PlatformTier.C)).toBe(true);
    });

    it("fails when consciousness continuity is not maintained", () => {
      expect(checker.checkMaintenanceInvariant(1, false, PlatformTier.C)).toBe(false);
    });

    it("fails when MTTR exceeds hot-swap limit for Tier C", () => {
      expect(checker.checkMaintenanceInvariant(TIER_C_HOT_SWAP_MAX_HOURS + 1, true, PlatformTier.C)).toBe(false);
    });

    it("passes for Tier A with reasonable MTTR and continuity", () => {
      expect(checker.checkMaintenanceInvariant(24, true, PlatformTier.A)).toBe(true);
    });

    it("passes for Tier B with MTTR within 4h and continuity", () => {
      expect(checker.checkMaintenanceInvariant(4, true, PlatformTier.B)).toBe(true);
    });
  });
});
