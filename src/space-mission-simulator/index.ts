/**
 * Space Mission Feasibility Simulator
 *
 * Unified API surface that bridges the four standalone modules:
 *   - energy/
 *   - colony-seeding/
 *   - interstellar-propulsion/
 *   - radiation-hardened-computation/
 *
 * Primary entry point: `simulate(profile)` → `FeasibilityReport`
 *
 * @example
 * ```ts
 * import { simulate } from "@master-plan/space-mission-simulator";
 *
 * const report = simulate({
 *   name: "Alpha Centauri A — Baseline Mission",
 *   probe: { mass_kg: 5000, diameter_m: 20, structuralIntegrityRating_g: 15 },
 *   propulsion: {
 *     sailDiameter_m: 200,
 *     laserArrayPower_W: 50e9,
 *     targetCruiseVelocity_c: 0.05,
 *     magsailLoopDiameter_km: 100,
 *   },
 *   destination: {
 *     distance_ly: 4.37,
 *     solarPower_w: 2e9,
 *     meetsMinimumEnergyThreshold: true,
 *     structuralMetals_kg: 5e18,
 *     semiconductors_kg: 1e12,
 *     particleFlux_per_cm2_s: 4,
 *     withinHardenedTolerance: true,
 *     orbitalStability_Myr: 500,
 *     availableElements: ["Si", "Al", "Y", "Ba", "Cu", "O", "H"],
 *   },
 *   originEnergy: { availableLaserPower_W: 60e9, failSafeReservesActive: true },
 *   ismConditions: { density_protons_per_cm3: 0.1 },
 *   radiation: { annualDose_rad_per_year: 100, peakFlux_particles_per_cm2_s: 4 },
 * });
 *
 * console.log(report.verdict); // "FEASIBLE"
 * ```
 */

export { simulate } from "./feasibility-simulator.js";
export type {
  MissionProfile,
  FeasibilityReport,
  ProbeSpec,
  PropulsionParameters,
  DestinationSystem,
  OriginEnergyConfig,
  IsmConditions,
  RadiationEnvironment,
  PropulsionFeasibility,
  ColonyFeasibility,
  EnergyFeasibility,
  RadiationFeasibility,
} from "./types.js";
export { FeasibilityVerdict } from "./types.js";
