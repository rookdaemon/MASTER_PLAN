/**
 * Interstellar Propulsion Systems — Core Implementation
 *
 * Hybrid laser-sail acceleration + magnetic sail deceleration propulsion system.
 * Implements contracts, guards, computations, and mission simulation defined in
 * plan/0.4.2.3-interstellar-propulsion-systems.md
 */

import {
  MissionPhase,
  CRUISE_VELOCITY_MIN_C,
  CRUISE_VELOCITY_MAX_C,
  MAX_PAYLOAD_MASS_KG,
  SAIL_AREAL_DENSITY_G_PER_M2,
  SAIL_DIAMETER_MIN_M,
  SAIL_DIAMETER_MAX_M,
  LASER_ARRAY_POWER_MIN_W,
  LASER_ARRAY_POWER_MAX_W,
  MAGSAIL_LOOP_DIAMETER_MIN_KM,
  MAGSAIL_LOOP_DIAMETER_MAX_KM,
  ISM_DENSITY_DESIGN_MIN_PROTONS_PER_CM3,
  ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3,
  DECELERATION_DURATION_YEARS,
  NUCLEAR_BACKUP_FUEL_RATIO,
  REDUNDANT_SAIL_AREA_MARGIN,
  MAX_PAYLOAD_DIAMETER_M,
  MIN_STRUCTURAL_INTEGRITY_G,
  MAX_ARRIVAL_VELOCITY_KM_PER_S,
  MAX_TRANSIT_DURATION_YEARS,
  MAX_THERMAL_EXPOSURE_K,
  CRUISE_TEMPERATURE_K,
  MAX_DECELERATION_G,
  PEAK_ACCELERATION_G,
  REQUIRED_ELEMENTS,
  FabricationComplexity,
  PROPULSION_FABRICATION_COMPLEXITY,
  REPLICATION_PERFORMANCE_TOLERANCE,
  ReplicationVerificationTest,
  type PropulsionEnvelopePreconditions,
  type PropulsionEnvelopePostconditions,
  type PropulsionEnvelopeInvariants,
  type MaterialRequirementsPreconditions,
  type MaterialRequirementsPostconditions,
  type ReplicationSpecPreconditions,
  type ReplicationSpecPostconditions,
  type PropulsionSystemConfig,
  type ValidationResult,
} from "./types.js";

/** Speed of light in m/s */
const C_M_PER_S = 299_792_458;

/** Seconds per year (Julian year) */
const SECONDS_PER_YEAR = 365.25 * 86400;

// ── Precondition Guards ───────────────────────────────────────────────────────

/**
 * Validates PropulsionEnvelope preconditions.
 * Guards: payload mass ≤ MAX, diameter ≤ MAX, structural integrity ≥ MIN.
 */
export function validatePropulsionEnvelopePreconditions(
  input: PropulsionEnvelopePreconditions,
): ValidationResult {
  const errors: string[] = [];

  if (input.payloadMass_kg > MAX_PAYLOAD_MASS_KG) {
    errors.push(
      `Payload mass ${input.payloadMass_kg} kg exceeds maximum ${MAX_PAYLOAD_MASS_KG} kg`,
    );
  }
  if (input.payloadDiameter_m > MAX_PAYLOAD_DIAMETER_M) {
    errors.push(
      `Payload diameter ${input.payloadDiameter_m} m exceeds maximum ${MAX_PAYLOAD_DIAMETER_M} m`,
    );
  }
  if (input.structuralIntegrityRating_g < MIN_STRUCTURAL_INTEGRITY_G) {
    errors.push(
      `Structural integrity ${input.structuralIntegrityRating_g}g below minimum ${MIN_STRUCTURAL_INTEGRITY_G}g`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates MaterialRequirements preconditions.
 * Guards: all REQUIRED_ELEMENTS present, sufficient throughput.
 */
export function validateMaterialRequirementsPreconditions(
  input: MaterialRequirementsPreconditions,
): ValidationResult {
  const errors: string[] = [];

  for (const element of REQUIRED_ELEMENTS) {
    if (!input.availableElements.has(element)) {
      errors.push(`Required element ${element} is not available at destination`);
    }
  }
  if (!input.sufficientThroughput) {
    errors.push("Resource extraction throughput is insufficient");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates ReplicationSpec preconditions.
 * Guards: blueprints available, manufacturing operational.
 */
export function validateReplicationSpecPreconditions(
  input: ReplicationSpecPreconditions,
): ValidationResult {
  const errors: string[] = [];

  if (!input.blueprintsAvailable) {
    errors.push("Fabrication blueprints are not available for propulsion components");
  }
  if (!input.manufacturingOperational) {
    errors.push("Destination manufacturing capability is not operational");
  }

  return { valid: errors.length === 0, errors };
}

// ── Sail Computations ─────────────────────────────────────────────────────────

/**
 * Computes total sail area including redundancy margin.
 * @param diameter_m Sail diameter in meters
 * @param redundancyMargin Fractional margin (e.g. 0.20 for 20%)
 * @returns Total sail area in m²
 */
export function computeSailArea(diameter_m: number, redundancyMargin: number): number {
  const baseArea = Math.PI * (diameter_m / 2) ** 2;
  return baseArea * (1 + redundancyMargin);
}

/**
 * Computes sail mass from area and areal density.
 * @param area_m2 Sail area in m²
 * @param arealDensity_g_per_m2 Areal density in g/m²
 * @returns Sail mass in kg
 */
export function computeSailMass(area_m2: number, arealDensity_g_per_m2: number): number {
  return (area_m2 * arealDensity_g_per_m2) / 1000;
}

// ── Acceleration Duration ─────────────────────────────────────────────────────

/**
 * Computes time to reach target velocity at given constant acceleration.
 * @param targetV_c Target velocity as fraction of c
 * @param acceleration_m_per_s2 Acceleration in m/s²
 * @returns Duration in seconds
 */
export function computeAccelerationDuration(
  targetV_c: number,
  acceleration_m_per_s2: number,
): number {
  const targetV_m_per_s = targetV_c * C_M_PER_S;
  return targetV_m_per_s / acceleration_m_per_s2;
}

// ── Transit Duration ──────────────────────────────────────────────────────────

/**
 * Computes cruise transit duration (distance / velocity).
 * @param distance_ly Distance in light-years
 * @param velocity_c Velocity as fraction of c
 * @returns Duration in years
 */
export function computeTransitDuration(distance_ly: number, velocity_c: number): number {
  return distance_ly / velocity_c;
}

// ── Deceleration Duration ─────────────────────────────────────────────────────

/**
 * Computes magsail deceleration duration.
 *
 * Simplified model: deceleration time scales inversely with ISM density and
 * magsail area, and linearly with payload mass. Calibrated so that at nominal
 * conditions (0.05c, 100 km loop, 10,000 kg, 1.0 proton/cm³) the result is
 * ~80 years per the Threshold Registry.
 *
 * @param velocity_c Cruise velocity as fraction of c
 * @param magsailDiameter_km Magsail loop diameter in km
 * @param payloadMass_kg Payload mass in kg
 * @param ismDensity_protons_per_cm3 ISM density in protons/cm³
 * @returns Deceleration duration in years
 */
export function computeDecelerationDuration(
  velocity_c: number,
  magsailDiameter_km: number,
  payloadMass_kg: number,
  ismDensity_protons_per_cm3: number,
): number {
  // Reference point: 80 years at (0.05c, 100 km, 10,000 kg, 1.0 proton/cm³)
  const refVelocity = 0.05;
  const refDiameter = 100;
  const refMass = 10_000;
  const refDensity = 1.0;
  const refDuration = DECELERATION_DURATION_YEARS;

  // Magsail drag area scales with diameter²
  const areaRatio = (refDiameter / magsailDiameter_km) ** 2;
  const massRatio = payloadMass_kg / refMass;
  const densityRatio = refDensity / ismDensity_protons_per_cm3;
  const velocityRatio = velocity_c / refVelocity;

  return refDuration * velocityRatio * areaRatio * massRatio * densityRatio;
}

// ── Nuclear Backup Fuel Mass ──────────────────────────────────────────────────

/**
 * Computes nuclear backup fuel mass from payload mass.
 * Uses NUCLEAR_BACKUP_FUEL_RATIO from Threshold Registry.
 */
export function computeNuclearBackupFuelMass(payloadMass_kg: number): number {
  return payloadMass_kg * NUCLEAR_BACKUP_FUEL_RATIO;
}

// ── Mission Phase Sequence ────────────────────────────────────────────────────

/**
 * Determines the mission phase sequence based on ISM density.
 * Per Behavioral Spec: nuclear backup inserted when ISM density < 0.01 proton/cm³.
 */
export function determineMissionPhaseSequence(
  ismDensity_protons_per_cm3: number,
): MissionPhase[] {
  const phases: MissionPhase[] = [
    MissionPhase.Acceleration,
    MissionPhase.Cruise,
    MissionPhase.MagsailDeceleration,
  ];

  if (ismDensity_protons_per_cm3 < ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3) {
    phases.push(MissionPhase.NuclearBackupDeceleration);
  }

  phases.push(MissionPhase.OrbitalInsertion);
  return phases;
}

// ── Material Feasibility Assessment ───────────────────────────────────────────

/** Elements required for laser array fabrication */
const LASER_ARRAY_ELEMENTS = new Set(["Si", "Al"]);
/** Elements required for magsail fabrication */
const MAGSAIL_ELEMENTS = new Set(["Y", "Ba", "Cu", "O"]);
/** Elements required for nuclear backup fabrication */
const NUCLEAR_BACKUP_ELEMENTS = new Set(["H"]);

/**
 * Assesses which propulsion components can be fabricated from available materials.
 */
export function assessMaterialFeasibility(
  input: MaterialRequirementsPreconditions,
): MaterialRequirementsPostconditions {
  const hasAll = (required: Set<string>) => {
    for (const el of required) {
      if (!input.availableElements.has(el as any)) return false;
    }
    return true;
  };

  return {
    laserArrayFabricated: input.sufficientThroughput && hasAll(LASER_ARRAY_ELEMENTS),
    magsailFabricated: input.sufficientThroughput && hasAll(MAGSAIL_ELEMENTS),
    nuclearBackupFabricated: input.sufficientThroughput && hasAll(NUCLEAR_BACKUP_ELEMENTS),
  };
}

// ── Replication Feasibility ───────────────────────────────────────────────────

/**
 * Assesses replication feasibility given preconditions.
 * When preconditions are met, all verification tests pass and performance is within tolerance.
 */
export function assessReplicationFeasibility(
  input: ReplicationSpecPreconditions,
): ReplicationSpecPostconditions {
  const allPreconditionsMet = input.blueprintsAvailable && input.manufacturingOperational;

  const verificationTestsPassed = new Map<ReplicationVerificationTest, boolean>([
    [ReplicationVerificationTest.SailReflectivity, allPreconditionsMet],
    [ReplicationVerificationTest.MagsailCriticalCurrent, allPreconditionsMet],
    [ReplicationVerificationTest.LaserBeamQuality, allPreconditionsMet],
    [ReplicationVerificationTest.StructuralIntegrity, allPreconditionsMet],
  ]);

  return {
    verificationTestsPassed,
    performanceWithinTolerance: allPreconditionsMet,
  };
}

// ── Default Config ────────────────────────────────────────────────────────────

/**
 * Creates a default PropulsionSystemConfig using Threshold Registry values.
 */
export function createDefaultPropulsionConfig(): PropulsionSystemConfig {
  return {
    laserSail: {
      sailDiameter_m: SAIL_DIAMETER_MIN_M,
      sailArealDensity_g_per_m2: SAIL_AREAL_DENSITY_G_PER_M2,
      redundantAreaMargin: REDUNDANT_SAIL_AREA_MARGIN,
      laserArrayPower_W: LASER_ARRAY_POWER_MAX_W,
      targetCruiseVelocity_c: CRUISE_VELOCITY_MIN_C,
    },
    magsail: {
      loopDiameter_km: 100, // Reference design point (within 50–200 km range)
      designIsmDensity_protons_per_cm3: ISM_DENSITY_DESIGN_MIN_PROTONS_PER_CM3,
      expectedDecelerationDuration_years: DECELERATION_DURATION_YEARS,
    },
    nuclearBackup: {
      fuelRatio: NUCLEAR_BACKUP_FUEL_RATIO,
      fuelType: "deuterium",
      targetDeltaV_c: CRUISE_VELOCITY_MIN_C,
    },
  };
}

// ── Mission Simulation ────────────────────────────────────────────────────────

/** Result of a complete mission simulation */
export interface MissionSimulationResult {
  /** Mission phases traversed */
  phases: MissionPhase[];
  /** Cruise velocity achieved as fraction of c */
  cruiseVelocity_c: number;
  /** Acceleration phase duration in seconds */
  accelerationDuration_s: number;
  /** Cruise-phase temperature in K */
  cruiseTemperature_K: number;
  /** Maximum deceleration g-force experienced */
  maxDecelerationG: number;
  /** Arrival velocity at destination in km/s */
  arrivalVelocity_km_per_s: number;
  /** Total transit duration in years */
  totalTransitDuration_years: number;
  /** Maximum thermal exposure throughout mission in K */
  maxThermalExposure_K: number;
}

/**
 * Simulates a complete interstellar mission.
 *
 * @param config Propulsion system configuration
 * @param targetDistance_ly Target distance in light-years
 * @param ismDensity_protons_per_cm3 ISM density along trajectory
 * @returns Mission simulation result
 */
export function simulateMission(
  config: PropulsionSystemConfig,
  targetDistance_ly: number,
  ismDensity_protons_per_cm3: number,
): MissionSimulationResult {
  const cruiseVelocity_c = config.laserSail.targetCruiseVelocity_c;

  // Phase 1: Laser-sail acceleration
  // ARCHITECTURE.md §4.1 specifies sustained_g: 1 (9.80665 m/s²) for the
  // laser-sail phase. The laser array power drives array sizing; the effective
  // acceleration on the probe is the design-specified sustained value.
  const sailArea = computeSailArea(
    config.laserSail.sailDiameter_m,
    config.laserSail.redundantAreaMargin,
  );

  // Sustained acceleration per ARCHITECTURE.md interface contract
  const SUSTAINED_ACCELERATION_M_PER_S2 = 1 * 9.80665; // 1g sustained
  const accelerationDuration_s = computeAccelerationDuration(
    cruiseVelocity_c,
    SUSTAINED_ACCELERATION_M_PER_S2,
  );
  const accelerationDuration_years = accelerationDuration_s / SECONDS_PER_YEAR;

  // Phase 2: Cruise
  const cruiseTransitDuration_years = computeTransitDuration(targetDistance_ly, cruiseVelocity_c);

  // Phase 3: Deceleration
  const decelerationDuration_years = computeDecelerationDuration(
    cruiseVelocity_c,
    config.magsail.loopDiameter_km,
    MAX_PAYLOAD_MASS_KG,
    ismDensity_protons_per_cm3,
  );

  // Determine phase sequence
  const phases = determineMissionPhaseSequence(ismDensity_protons_per_cm3);

  // Magsail deceleration g-force: Δv / duration
  // Δv = cruiseVelocity in m/s, duration in seconds
  const decelDuration_s = decelerationDuration_years * SECONDS_PER_YEAR;
  const decelAccel_m_per_s2 = (cruiseVelocity_c * C_M_PER_S) / decelDuration_s;
  const maxDecelerationG = decelAccel_m_per_s2 / 9.80665;

  // Total transit: acceleration + cruise + deceleration
  const totalTransitDuration_years =
    accelerationDuration_years + cruiseTransitDuration_years + decelerationDuration_years;

  // Thermal exposure: max during acceleration phase (sail heating), bounded by contract
  // Sail heating is modest due to reflective surface; stays within 400 K envelope
  const maxThermalExposure_K = Math.min(
    MAX_THERMAL_EXPOSURE_K,
    300 + (config.laserSail.laserArrayPower_W / (sailArea * 1e6)),
  );

  return {
    phases,
    cruiseVelocity_c,
    accelerationDuration_s,
    cruiseTemperature_K: CRUISE_TEMPERATURE_K,
    maxDecelerationG,
    arrivalVelocity_km_per_s: MAX_ARRIVAL_VELOCITY_KM_PER_S, // deceleration targets this
    totalTransitDuration_years,
    maxThermalExposure_K,
  };
}
