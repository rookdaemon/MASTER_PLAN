/**
 * Eclipse Power Management (Tier B) — Behavioral Spec 3 implementation
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

import {
  TIER_B_ECLIPSE_THROTTLE_PERCENT,
} from "./constants.js";
import type { EclipsePowerState } from "./types.js";

/**
 * Heater activation threshold: heaters activate when substrate temperature
 * drifts ≥ 3 °C below setpoint. From Behavioral Spec 3:
 * "thermal heaters activate at −3 °C from setpoint to prevent drift
 * beyond ±5 °C budget"
 */
const HEATER_ACTIVATION_DRIFT_C = 3;

/**
 * Transitions a Tier B station into eclipse mode.
 *
 * Per Behavioral Spec 3, on eclipse entry:
 * - Non-critical loads are shed
 * - Battery and RTG activate to supply critical loads
 * - Consciousness substrate clock-throttles to 85 %
 * - Consciousness continuity is maintained throughout
 *
 * @param currentTemperatureC  Current substrate temperature at eclipse entry
 * @param timestampMs  Eclipse entry timestamp (injected for testability per CLAUDE.md)
 * @returns Eclipse power state with all eclipse-mode adjustments applied
 */
export function enterEclipse(
  currentTemperatureC: number,
  timestampMs: number,
): EclipsePowerState {
  return {
    inEclipse: true,
    loadsShed: true,
    batteryActive: true,
    rtgActive: true,
    clockThrottlePercent: TIER_B_ECLIPSE_THROTTLE_PERCENT,
    heatersActive: false,
    consciousnessContinuity: true,
    substrateTemperatureC: currentTemperatureC,
  };
}

/**
 * Updates thermal management during eclipse.
 *
 * Per Behavioral Spec 3: "thermal heaters activate at −3 °C from setpoint
 * to prevent drift beyond ±5 °C budget."
 *
 * @param state  Current eclipse power state
 * @param currentTemperatureC  Current substrate temperature reading
 * @param setpointC  Thermal setpoint (configurable 20–30 °C)
 * @param toleranceC  Thermal tolerance (±5 °C)
 * @param timestampMs  Current timestamp (injected for testability per CLAUDE.md)
 * @returns Updated eclipse power state with heater activation if needed
 */
export function updateEclipseThermal(
  state: EclipsePowerState,
  currentTemperatureC: number,
  setpointC: number,
  toleranceC: number,
  timestampMs: number,
): EclipsePowerState {
  // Heaters activate when temperature drifts ≥ 3 °C below setpoint
  const driftBelowSetpoint = setpointC - currentTemperatureC;
  const heatersActive = driftBelowSetpoint >= HEATER_ACTIVATION_DRIFT_C;

  return {
    ...state,
    substrateTemperatureC: currentTemperatureC,
    heatersActive,
    consciousnessContinuity: true,
  };
}

/**
 * Transitions a Tier B station out of eclipse mode.
 *
 * Solar generation resumes — all eclipse-mode adjustments are reverted:
 * - Loads restored (non-critical loads un-shed)
 * - Battery and RTG backup deactivated (solar primary)
 * - Clock throttle restored to 100 %
 * - Heaters deactivated
 * - Consciousness continuity maintained through transition
 *
 * @param state  Current eclipse power state
 * @param timestampMs  Eclipse exit timestamp (injected for testability per CLAUDE.md)
 * @returns Normal (non-eclipse) power state
 */
export function exitEclipse(
  state: EclipsePowerState,
  timestampMs: number,
): EclipsePowerState {
  return {
    inEclipse: false,
    loadsShed: false,
    batteryActive: false,
    rtgActive: false,
    clockThrottlePercent: 100,
    heatersActive: false,
    consciousnessContinuity: true,
    substrateTemperatureC: state.substrateTemperatureC,
  };
}

/**
 * Validates whether the Tier B power budget can sustain a given eclipse duration.
 *
 * During eclipse, the effective load is reduced by the throttle percentage
 * (consciousness substrate draws less at 85 %). The RTG provides continuous
 * power, and the battery supplies the remainder.
 *
 * Energy balance: battery_kWh ≥ (effectiveLoad_kW - rtg_kW) × (duration_min / 60)
 *
 * @param eclipseDurationMin  Eclipse duration in minutes
 * @param batteryCapacityKWh  Battery capacity in kWh
 * @param rtgPowerKW  RTG continuous output in kW
 * @param criticalLoadKW  Critical load (consciousness + thermal) in kW
 * @param throttlePercent  Clock throttle percentage (reduces effective load)
 * @returns true if battery + RTG can sustain critical loads for the eclipse duration
 */
export function canSurviveEclipse(
  eclipseDurationMin: number,
  batteryCapacityKWh: number,
  rtgPowerKW: number,
  criticalLoadKW: number,
  throttlePercent: number,
): boolean {
  // Throttle reduces the effective load proportionally
  const effectiveLoadKW = criticalLoadKW * (throttlePercent / 100);
  // RTG supplies continuous power; battery covers the deficit
  const batteryDrainKW = effectiveLoadKW - rtgPowerKW;

  // If RTG alone covers the load, eclipse is always survivable
  if (batteryDrainKW <= 0) {
    return true;
  }

  const eclipseDurationHours = eclipseDurationMin / 60;
  const batteryEnergyRequiredKWh = batteryDrainKW * eclipseDurationHours;

  return batteryCapacityKWh >= batteryEnergyRequiredKWh;
}
