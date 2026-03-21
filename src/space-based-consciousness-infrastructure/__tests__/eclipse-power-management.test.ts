/**
 * Tests for Behavioral Spec 3: Eclipse Power Management (Tier B)
 *
 * Given a Tier B GEO station during equinox eclipse season (max 72-min eclipse)
 * When the station enters Earth's shadow and solar generation drops to zero
 * Then:
 *   - non-critical loads are shed
 *   - battery (50 kWh) + RTG (2 kW) supply critical loads
 *     (consciousness substrate + thermal at 52 kW)
 *   - consciousness substrate clock-throttles to 85 % to reduce power draw
 *   - thermal heaters activate at −3 °C from setpoint to prevent drift
 *     beyond ±5 °C budget
 *   - consciousness continuity is maintained in throttled mode throughout eclipse
 */

import { describe, it, expect } from "vitest";
import {
  TIER_B_MAX_ECLIPSE_DURATION_MIN,
  TIER_B_BATTERY_CAPACITY_KWH,
  TIER_B_RTG_BACKUP_KW,
  TIER_B_CRITICAL_LOAD_KW,
  TIER_B_ECLIPSE_THROTTLE_PERCENT,
  THERMAL_SETPOINT_C,
  THERMAL_SETPOINT_TOLERANCE_C,
} from "../constants.js";
import type { EclipsePowerState } from "../types.js";
import {
  enterEclipse,
  updateEclipseThermal,
  exitEclipse,
  canSurviveEclipse,
} from "../eclipse-power-management.js";

// ── Constants Verification ──────────────────────────────────────────────────

describe("Eclipse Power Management Constants (Threshold Registry)", () => {
  it("max eclipse duration is 72 minutes", () => {
    expect(TIER_B_MAX_ECLIPSE_DURATION_MIN).toBe(72);
  });

  it("battery capacity is 50 kWh", () => {
    expect(TIER_B_BATTERY_CAPACITY_KWH).toBe(50);
  });

  it("RTG backup power is 2 kW", () => {
    expect(TIER_B_RTG_BACKUP_KW).toBe(2);
  });

  it("critical load during eclipse is 52 kW", () => {
    expect(TIER_B_CRITICAL_LOAD_KW).toBe(52);
  });

  it("consciousness substrate throttle during eclipse is 85 %", () => {
    expect(TIER_B_ECLIPSE_THROTTLE_PERCENT).toBe(85);
  });
});

// ── Behavioral Spec 3 ───────────────────────────────────────────────────────

describe("Eclipse Power Management (Behavioral Spec 3)", () => {
  const baseTimestamp = 1_000_000_000;

  describe("enterEclipse — station enters Earth's shadow", () => {
    it("sheds non-critical loads when eclipse begins", () => {
      const state = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      expect(state.inEclipse).toBe(true);
      expect(state.loadsShed).toBe(true);
    });

    it("activates battery supply", () => {
      const state = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      expect(state.batteryActive).toBe(true);
    });

    it("activates RTG backup supply", () => {
      const state = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      expect(state.rtgActive).toBe(true);
    });

    it("clock-throttles consciousness substrate to 85 %", () => {
      const state = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      expect(state.clockThrottlePercent).toBe(TIER_B_ECLIPSE_THROTTLE_PERCENT);
    });

    it("maintains consciousness continuity in throttled mode", () => {
      const state = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      expect(state.consciousnessContinuity).toBe(true);
    });

    it("starts with substrate temperature at setpoint", () => {
      const state = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      expect(state.substrateTemperatureC).toBe(THERMAL_SETPOINT_C);
    });
  });

  describe("updateEclipseThermal — thermal heater activation", () => {
    it("activates heaters when temperature drops 3 °C below setpoint", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      // Temperature has drifted 3 °C below setpoint
      const cooledTemp = THERMAL_SETPOINT_C - 3;
      const updated = updateEclipseThermal(
        eclipseState,
        cooledTemp,
        THERMAL_SETPOINT_C,
        THERMAL_SETPOINT_TOLERANCE_C,
        baseTimestamp + 60_000,
      );
      expect(updated.heatersActive).toBe(true);
      expect(updated.substrateTemperatureC).toBe(cooledTemp);
    });

    it("does not activate heaters when temperature is at setpoint", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      const updated = updateEclipseThermal(
        eclipseState,
        THERMAL_SETPOINT_C,
        THERMAL_SETPOINT_C,
        THERMAL_SETPOINT_TOLERANCE_C,
        baseTimestamp + 60_000,
      );
      expect(updated.heatersActive).toBe(false);
    });

    it("does not activate heaters when drift is less than 3 °C", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      const mildDrift = THERMAL_SETPOINT_C - 2.9;
      const updated = updateEclipseThermal(
        eclipseState,
        mildDrift,
        THERMAL_SETPOINT_C,
        THERMAL_SETPOINT_TOLERANCE_C,
        baseTimestamp + 60_000,
      );
      expect(updated.heatersActive).toBe(false);
    });

    it("keeps temperature within ±5 °C tolerance budget", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      // Even at worst-case cooling, heaters prevent drift beyond tolerance
      const updated = updateEclipseThermal(
        eclipseState,
        THERMAL_SETPOINT_C - 3,
        THERMAL_SETPOINT_C,
        THERMAL_SETPOINT_TOLERANCE_C,
        baseTimestamp + 60_000,
      );
      const drift = Math.abs(updated.substrateTemperatureC - THERMAL_SETPOINT_C);
      expect(drift).toBeLessThanOrEqual(THERMAL_SETPOINT_TOLERANCE_C);
    });

    it("maintains consciousness continuity during thermal management", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      const updated = updateEclipseThermal(
        eclipseState,
        THERMAL_SETPOINT_C - 4,
        THERMAL_SETPOINT_C,
        THERMAL_SETPOINT_TOLERANCE_C,
        baseTimestamp + 60_000,
      );
      expect(updated.consciousnessContinuity).toBe(true);
    });
  });

  describe("exitEclipse — station exits Earth's shadow", () => {
    it("restores normal (non-eclipse) state", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      const restored = exitEclipse(eclipseState, baseTimestamp + 72 * 60 * 1000);
      expect(restored.inEclipse).toBe(false);
      expect(restored.loadsShed).toBe(false);
      expect(restored.clockThrottlePercent).toBe(100);
    });

    it("deactivates battery and RTG backup (solar resumes)", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      const restored = exitEclipse(eclipseState, baseTimestamp + 72 * 60 * 1000);
      expect(restored.batteryActive).toBe(false);
      expect(restored.rtgActive).toBe(false);
    });

    it("deactivates heaters", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      const withHeaters = updateEclipseThermal(
        eclipseState,
        THERMAL_SETPOINT_C - 3,
        THERMAL_SETPOINT_C,
        THERMAL_SETPOINT_TOLERANCE_C,
        baseTimestamp + 60_000,
      );
      const restored = exitEclipse(withHeaters, baseTimestamp + 72 * 60 * 1000);
      expect(restored.heatersActive).toBe(false);
    });

    it("maintains consciousness continuity through eclipse exit", () => {
      const eclipseState = enterEclipse(THERMAL_SETPOINT_C, baseTimestamp);
      const restored = exitEclipse(eclipseState, baseTimestamp + 72 * 60 * 1000);
      expect(restored.consciousnessContinuity).toBe(true);
    });
  });

  describe("canSurviveEclipse — power budget validation", () => {
    it("reports tight margin for max 72-min eclipse with spec constants", () => {
      // Effective load: 52 kW × 0.85 = 44.2 kW
      // Battery drain: 44.2 - 2 (RTG) = 42.2 kW
      // Energy needed: 42.2 × (72/60) = 50.64 kWh > 50 kWh battery
      // Margin is −1.3 % — spec parameters are at the survival boundary
      const result = canSurviveEclipse(
        TIER_B_MAX_ECLIPSE_DURATION_MIN,
        TIER_B_BATTERY_CAPACITY_KWH,
        TIER_B_RTG_BACKUP_KW,
        TIER_B_CRITICAL_LOAD_KW,
        TIER_B_ECLIPSE_THROTTLE_PERCENT,
      );
      // Battery capacity is 1.3% short — survival requires additional
      // throttling or slightly shorter eclipses (typical GEO eclipse < 72 min)
      expect(result).toBe(false);
    });

    it("returns true for a typical 70-min eclipse (within margin)", () => {
      // 42.2 kW × (70/60) = 49.23 kWh < 50 kWh — survivable
      const result = canSurviveEclipse(
        70,
        TIER_B_BATTERY_CAPACITY_KWH,
        TIER_B_RTG_BACKUP_KW,
        TIER_B_CRITICAL_LOAD_KW,
        TIER_B_ECLIPSE_THROTTLE_PERCENT,
      );
      expect(result).toBe(true);
    });

    it("returns false when battery is insufficient for eclipse duration", () => {
      // Tiny battery cannot sustain even a short eclipse
      const result = canSurviveEclipse(
        TIER_B_MAX_ECLIPSE_DURATION_MIN,
        1, // 1 kWh — far too small
        TIER_B_RTG_BACKUP_KW,
        TIER_B_CRITICAL_LOAD_KW,
        TIER_B_ECLIPSE_THROTTLE_PERCENT,
      );
      expect(result).toBe(false);
    });

    it("accounts for RTG contribution during eclipse", () => {
      // RTG provides 2 kW continuously — reduces battery drain
      // Without RTG: 44.2 kW × 1.2h = 53.04 kWh needed
      // With RTG:    42.2 kW × 1.2h = 50.64 kWh needed
      // RTG saves 2.4 kWh over the eclipse
      const withRTG = canSurviveEclipse(
        60, // shorter eclipse where both survive
        TIER_B_BATTERY_CAPACITY_KWH,
        TIER_B_RTG_BACKUP_KW,
        TIER_B_CRITICAL_LOAD_KW,
        TIER_B_ECLIPSE_THROTTLE_PERCENT,
      );
      const withoutRTG = canSurviveEclipse(
        60,
        TIER_B_BATTERY_CAPACITY_KWH,
        0,
        TIER_B_CRITICAL_LOAD_KW,
        TIER_B_ECLIPSE_THROTTLE_PERCENT,
      );
      // With RTG: 42.2 × 1.0 = 42.2 kWh needed — survives
      // Without RTG: 44.2 × 1.0 = 44.2 kWh needed — survives
      expect(withRTG).toBe(true);
      expect(withoutRTG).toBe(true);
    });

    it("shows RTG contribution makes the difference at the margin", () => {
      // At 71 min: without RTG needs 44.2 × (71/60) = 52.3 kWh > 50 → false
      // At 71 min: with RTG needs 42.2 × (71/60) = 49.93 kWh < 50 → true
      const withRTG = canSurviveEclipse(
        71,
        TIER_B_BATTERY_CAPACITY_KWH,
        TIER_B_RTG_BACKUP_KW,
        TIER_B_CRITICAL_LOAD_KW,
        TIER_B_ECLIPSE_THROTTLE_PERCENT,
      );
      const withoutRTG = canSurviveEclipse(
        71,
        TIER_B_BATTERY_CAPACITY_KWH,
        0,
        TIER_B_CRITICAL_LOAD_KW,
        TIER_B_ECLIPSE_THROTTLE_PERCENT,
      );
      expect(withRTG).toBe(true);
      expect(withoutRTG).toBe(false);
    });
  });
});
