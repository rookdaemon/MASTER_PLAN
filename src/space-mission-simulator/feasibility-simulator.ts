/**
 * Space Mission Feasibility Simulator — Core Orchestrator
 *
 * Integrates the four standalone modules into a single, cross-cutting
 * feasibility assessment:
 *
 *   1. interstellar-propulsion/ — validates envelope constraints and simulates
 *      transit physics (laser-sail acceleration + magsail deceleration)
 *   2. colony-seeding/          — assesses destination viability via the
 *      four-criterion GO/ABORT/DORMANCY decision engine
 *   3. energy/                  — checks origin energy budget for laser array
 *      affordability and fail-safe reserve maintenance
 *   4. radiation-hardened-computation/ — projects TID accumulation over the
 *      transit and confirms TMR continuity under peak flux
 *
 * All dependencies are injected via `SimulatorDependencies` so each
 * sub-assessment can be unit-tested or mocked independently.
 */

import {
  validatePropulsionEnvelopePreconditions,
  validateMaterialRequirementsPreconditions,
  simulateMission,
  createDefaultPropulsionConfig,
} from "../interstellar-propulsion/propulsion.js";
import type { PropulsionSystemConfig } from "../interstellar-propulsion/types.js";
import { MAX_TRANSIT_DURATION_YEARS } from "../interstellar-propulsion/types.js";

import { ViabilityDecisionEngine } from "../colony-seeding/viability-decision-engine.js";
import {
  SpectralClass,
} from "../colony-seeding/types.js";
import type { SystemMap, ColonySite } from "../colony-seeding/types.js";

import {
  simulateDegradation,
} from "../radiation-hardened-computation/degradation-model.js";
import {
  SUBSTRATE_DATABASE,
  calculateSEU_BER,
} from "../radiation-hardened-computation/substrate.js";

import type {
  MissionProfile,
  FeasibilityReport,
  PropulsionFeasibility,
  ColonyFeasibility,
  EnergyFeasibility,
  RadiationFeasibility,
} from "./types.js";
import { FeasibilityVerdict } from "./types.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** BER acceptance criterion: < 10⁻¹² errors per bit-hour with TMR */
const TMR_BER_THRESHOLD = 1e-12;

/** Speed of light in m/s */
const C_M_PER_S = 299_792_458;

/** Seconds per year (Julian year) */
const SECONDS_PER_YEAR = 365.25 * 86400;

/**
 * Nuclear backup deceleration: Orion/Z-pinch sustained g available for braking.
 * At 0.1 g sustained the full Δv = cruise_velocity is absorbed in much less
 * than a year, making the nuclear-backup deceleration phase negligible compared
 * to the transit.
 */
const NUCLEAR_BACKUP_DECEL_G = 0.1;

// ── Sub-assessment functions ──────────────────────────────────────────────────

/**
 * Assess propulsion feasibility.
 *
 * Validates envelope preconditions, checks material replication feasibility,
 * and runs the full mission simulation to obtain transit physics.
 */
function assessPropulsion(profile: MissionProfile): PropulsionFeasibility {
  // Envelope preconditions
  const envelopeResult = validatePropulsionEnvelopePreconditions({
    payloadMass_kg: profile.probe.mass_kg,
    payloadDiameter_m: profile.probe.diameter_m,
    structuralIntegrityRating_g: profile.probe.structuralIntegrityRating_g,
  });

  // Material replication feasibility
  const materialResult = validateMaterialRequirementsPreconditions({
    availableElements: new Set(profile.destination.availableElements as any),
    sufficientThroughput: true,
  });

  // Propulsion system config
  const config: PropulsionSystemConfig = {
    laserSail: {
      sailDiameter_m: profile.propulsion.sailDiameter_m,
      sailArealDensity_g_per_m2: 1,
      redundantAreaMargin: 0.20,
      laserArrayPower_W: profile.propulsion.laserArrayPower_W,
      targetCruiseVelocity_c: profile.propulsion.targetCruiseVelocity_c,
    },
    magsail: {
      loopDiameter_km: profile.propulsion.magsailLoopDiameter_km,
      designIsmDensity_protons_per_cm3: profile.ismConditions.density_protons_per_cm3,
      expectedDecelerationDuration_years: 80,
    },
    nuclearBackup: createDefaultPropulsionConfig().nuclearBackup,
  };

  const sim = simulateMission(
    config,
    profile.destination.distance_ly,
    profile.ismConditions.density_protons_per_cm3,
  );

  const nuclearBackupRequired =
    profile.ismConditions.density_protons_per_cm3 < 0.01;

  // When ISM density is too low for effective magsail braking, the nuclear
  // backup drive provides the deceleration.  At NUCLEAR_BACKUP_DECEL_G the
  // required Δv (= cruise velocity) is absorbed in a fraction of a year, so
  // the nuclear deceleration duration is negligible.  Re-compute total transit
  // accordingly so infeasible magsail durations do not block an otherwise
  // viable nuclear-backup mission.
  const nuclearDecelDuration_years = nuclearBackupRequired
    ? (profile.propulsion.targetCruiseVelocity_c * C_M_PER_S) /
      (NUCLEAR_BACKUP_DECEL_G * 9.80665 * SECONDS_PER_YEAR)
    : 0;

  const cruiseDuration_years =
    profile.destination.distance_ly / profile.propulsion.targetCruiseVelocity_c;
  const accelDuration_years = sim.accelerationDuration_s / SECONDS_PER_YEAR;

  const effectiveTransitDuration_years = nuclearBackupRequired
    ? accelDuration_years + cruiseDuration_years + nuclearDecelDuration_years
    : sim.totalTransitDuration_years;

  return {
    envelopeValid: envelopeResult.valid,
    envelopeErrors: envelopeResult.errors,
    achievedCruiseVelocity_c: sim.cruiseVelocity_c,
    transitDuration_years: effectiveTransitDuration_years,
    maxDecelerationG: sim.maxDecelerationG,
    transitWithinLimit: effectiveTransitDuration_years <= MAX_TRANSIT_DURATION_YEARS,
    nuclearBackupRequired,
    replicationFeasible: materialResult.valid,
  };
}

/**
 * Assess colony seeding feasibility.
 *
 * Runs the ViabilityDecisionEngine against a synthesised SystemMap derived
 * from the mission profile's destination parameters.
 */
function assessColony(profile: MissionProfile): ColonyFeasibility {
  const systemMap: SystemMap = {
    starType: SpectralClass.G,
    bodies: [
      {
        id: "primary-asteroid-belt",
        type: "asteroid",
        mass_kg: 2e20,
        orbitalRadius_au: 2.5,
        composition: {
          structuralMetals_kg: profile.destination.structuralMetals_kg,
          semiconductors_kg: profile.destination.semiconductors_kg,
          organics_kg: 0,
          waterIce_kg: 0,
        },
      },
    ],
    radiationProfile: {
      stellarLuminosity_Lsun: 1.0,
      particleFlux_per_cm2_s: profile.destination.particleFlux_per_cm2_s,
      peakEventsPerCentury: 10,
      withinHardenedTolerance: profile.destination.withinHardenedTolerance,
    },
    resourceInventory: {
      structuralMetals_kg: profile.destination.structuralMetals_kg,
      semiconductors_kg: profile.destination.semiconductors_kg,
      organics_kg: 0,
      waterIce_kg: 0,
    },
    energyBudget: {
      solarPower_w: profile.destination.solarPower_w,
      meetsMinimumThreshold: profile.destination.meetsMinimumEnergyThreshold,
    },
  };

  const engine = new ViabilityDecisionEngine();
  const assessment = engine.evaluate(systemMap);
  const siteOrAbort = engine.selectColonySite(systemMap);

  // selectColonySite returns ColonySite on GO, AbortDecision otherwise.
  // Within AbortDecision: retryAfter_years present → DORMANCY, absent → ABORT.
  let decisionLabel: "GO" | "ABORT" | "DORMANCY";
  if ("orbitalPosition" in siteOrAbort) {
    decisionLabel = "GO";
  } else if ("retryAfter_years" in siteOrAbort && siteOrAbort.retryAfter_years !== undefined) {
    decisionLabel = "DORMANCY";
  } else {
    decisionLabel = "ABORT";
  }

  return {
    meetsEnergyRequirement: assessment.meetsEnergyRequirement,
    meetsResourceRequirement: assessment.meetsResourceRequirement,
    withinRadiationTolerance: assessment.withinRadiationTolerance,
    hasStableOrbit: assessment.hasStableOrbit,
    decision: decisionLabel,
    viabilityScore: assessment.viabilityScore,
  };
}

/**
 * Assess energy feasibility at the origin.
 *
 * Checks whether the laser array power draw is within the available origin
 * energy budget and whether fail-safe reserves are maintained.
 */
function assessEnergy(profile: MissionProfile): EnergyFeasibility {
  const laserArrayAffordable =
    profile.propulsion.laserArrayPower_W <=
    profile.originEnergy.availableLaserPower_W;

  const originPowerBalance_W =
    profile.originEnergy.availableLaserPower_W -
    profile.propulsion.laserArrayPower_W;

  return {
    laserArrayAffordable,
    failSafeReservesMaintained: profile.originEnergy.failSafeReservesActive,
    originPowerBalance_W,
  };
}

/**
 * Assess radiation-hardened computation feasibility.
 *
 * Simulates TID accumulation over the transit, checks substrate tolerance,
 * projects final performance fraction, and validates TMR BER.
 */
function assessRadiation(
  profile: MissionProfile,
  transitDuration_years: number,
): RadiationFeasibility {
  const substrate = SUBSTRATE_DATABASE["SiC"];
  const annualDose = profile.radiation.annualDose_rad_per_year;

  // Simulate degradation over the transit period
  const steps = simulateDegradation(
    {
      substrate,
      annualDose_rad: annualDose,
      particleFlux_per_cm2_per_s: profile.destination.particleFlux_per_cm2_s,
      operatingTemp_K: 300,
    },
    Math.max(1, Math.ceil(transitDuration_years)),
    Math.max(1, Math.min(10, Math.floor(transitDuration_years / 10))),
  );

  const lastStep = steps[steps.length - 1];
  const estimatedTransitTID_rad = lastStep?.cumulativeTID_rad ?? annualDose * transitDuration_years;
  const estimatedPerformanceFraction = lastStep?.performanceFraction ?? 1.0;

  const withinSubstrateTolerance =
    estimatedTransitTID_rad <= substrate.tidTolerance_rad;

  // Compute TMR-corrected BER under peak flux
  const ber = calculateSEU_BER(substrate, profile.radiation.peakFlux_particles_per_cm2_s, {
    tmrEnabled: true,
  });
  const tmrSufficient = ber < TMR_BER_THRESHOLD;

  return {
    estimatedTransitTID_rad,
    withinSubstrateTolerance,
    estimatedPerformanceFraction,
    tmrSufficient,
  };
}

// ── Verdict synthesis ────────────────────────────────────────────────────────

function synthesiseVerdict(
  propulsion: PropulsionFeasibility,
  colony: ColonyFeasibility,
  energy: EnergyFeasibility,
  radiation: RadiationFeasibility,
  laserArrayPower_W: number,
): { verdict: FeasibilityVerdict; blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // ── Hard blockers ──────────────────────────────────────────────────────────

  if (!propulsion.envelopeValid) {
    blockers.push(...propulsion.envelopeErrors.map((e) => `[Propulsion] ${e}`));
  }

  if (!propulsion.transitWithinLimit) {
    blockers.push(
      `[Propulsion] Transit duration ${propulsion.transitDuration_years.toFixed(1)} yr exceeds ` +
        `${MAX_TRANSIT_DURATION_YEARS} yr maximum`,
    );
  }

  if (colony.decision === "ABORT") {
    blockers.push(
      "[Colony] Destination system is not viable — ABORT decision (fatal site failure)",
    );
  }

  if (!energy.laserArrayAffordable) {
    blockers.push(
      `[Energy] Laser array requires ${(laserArrayPower_W / 1e9).toFixed(1)} GW ` +
        "but origin energy budget is insufficient",
    );
  }

  if (!radiation.withinSubstrateTolerance) {
    blockers.push(
      `[Radiation] Estimated transit TID ${radiation.estimatedTransitTID_rad.toExponential(2)} rad ` +
        "exceeds SiC substrate tolerance (10 Mrad)",
    );
  }

  // ── Warnings ───────────────────────────────────────────────────────────────

  if (colony.decision === "DORMANCY") {
    warnings.push(
      "[Colony] Destination is marginal — DORMANCY recommended; retryable after survey period",
    );
  }

  if (!energy.failSafeReservesMaintained) {
    warnings.push(
      "[Energy] Fail-safe reserves NOT active during launch — risk of consciousness interruption",
    );
  }

  if (propulsion.nuclearBackupRequired) {
    warnings.push(
      "[Propulsion] ISM density < 0.01 protons/cm³ — nuclear backup deceleration required",
    );
  }

  if (!propulsion.replicationFeasible) {
    warnings.push(
      "[Propulsion] Propulsion replication at destination may be limited by available elements",
    );
  }

  if (!radiation.tmrSufficient) {
    warnings.push(
      "[Radiation] TMR BER exceeds 10⁻¹² threshold under peak flux — additional shielding recommended",
    );
  }

  if (radiation.estimatedPerformanceFraction < 0.95) {
    warnings.push(
      `[Radiation] Estimated performance at arrival is ${(radiation.estimatedPerformanceFraction * 100).toFixed(1)}% ` +
        "(>5% degradation)",
    );
  }

  const verdict =
    blockers.length > 0
      ? FeasibilityVerdict.INFEASIBLE
      : warnings.length > 0
        ? FeasibilityVerdict.MARGINAL
        : FeasibilityVerdict.FEASIBLE;

  return { verdict, blockers, warnings };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a complete space mission feasibility simulation.
 *
 * @param profile - The mission profile describing all input parameters.
 * @returns A `FeasibilityReport` with per-module breakdowns and an overall verdict.
 *
 * @example
 * ```ts
 * import { simulate } from "./space-mission-simulator/index.js";
 *
 * const report = simulate({
 *   name: "Alpha Centauri Run 1",
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
export function simulate(profile: MissionProfile): FeasibilityReport {
  const propulsion = assessPropulsion(profile);
  const colony = assessColony(profile);
  const energy = assessEnergy(profile);
  const radiation = assessRadiation(profile, propulsion.transitDuration_years);

  const { verdict, blockers, warnings } = synthesiseVerdict(
    propulsion,
    colony,
    energy,
    radiation,
    profile.propulsion.laserArrayPower_W,
  );

  return {
    missionName: profile.name,
    verdict,
    blockers,
    warnings,
    propulsion,
    colony,
    energy,
    radiation,
  };
}
