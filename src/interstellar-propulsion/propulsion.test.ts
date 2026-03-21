import { describe, it, expect } from "vitest";
import {
  validatePropulsionEnvelopePreconditions,
  validateMaterialRequirementsPreconditions,
  validateReplicationSpecPreconditions,
  computeSailArea,
  computeSailMass,
  computeAccelerationDuration,
  computeTransitDuration,
  computeDecelerationDuration,
  computeNuclearBackupFuelMass,
  determineMissionPhaseSequence,
  assessMaterialFeasibility,
  assessReplicationFeasibility,
  createDefaultPropulsionConfig,
  simulateMission,
} from "./propulsion.js";
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
  type MaterialRequirementsPreconditions,
  type ReplicationSpecPreconditions,
  type PropulsionSystemConfig,
  type MissionState,
} from "./types.js";

// ── Threshold Registry Constants ────────────────────────────────────────────

describe("Threshold Registry constants", () => {
  it("cruise velocity range is 0.05–0.10 c", () => {
    expect(CRUISE_VELOCITY_MIN_C).toBe(0.05);
    expect(CRUISE_VELOCITY_MAX_C).toBe(0.10);
  });

  it("max payload mass is 10,000 kg", () => {
    expect(MAX_PAYLOAD_MASS_KG).toBe(10_000);
  });

  it("sail areal density is 1 g/m²", () => {
    expect(SAIL_AREAL_DENSITY_G_PER_M2).toBe(1);
  });

  it("sail diameter range is 100–500 m", () => {
    expect(SAIL_DIAMETER_MIN_M).toBe(100);
    expect(SAIL_DIAMETER_MAX_M).toBe(500);
  });

  it("laser array power range is 10–100 GW", () => {
    expect(LASER_ARRAY_POWER_MIN_W).toBe(10e9);
    expect(LASER_ARRAY_POWER_MAX_W).toBe(100e9);
  });

  it("magsail loop diameter range is 50–200 km", () => {
    expect(MAGSAIL_LOOP_DIAMETER_MIN_KM).toBe(50);
    expect(MAGSAIL_LOOP_DIAMETER_MAX_KM).toBe(200);
  });

  it("ISM density design minimum is 0.1 proton/cm³", () => {
    expect(ISM_DENSITY_DESIGN_MIN_PROTONS_PER_CM3).toBe(0.1);
  });

  it("ISM density nuclear threshold is 0.01 proton/cm³", () => {
    expect(ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3).toBe(0.01);
  });

  it("deceleration duration is 80 years", () => {
    expect(DECELERATION_DURATION_YEARS).toBe(80);
  });

  it("nuclear backup fuel ratio is 2:1", () => {
    expect(NUCLEAR_BACKUP_FUEL_RATIO).toBe(2);
  });

  it("redundant sail area margin is 20%", () => {
    expect(REDUNDANT_SAIL_AREA_MARGIN).toBe(0.20);
  });
});

// ── PropulsionEnvelope Precondition Guards ───────────────────────────────────

describe("validatePropulsionEnvelopePreconditions", () => {
  const validInput: PropulsionEnvelopePreconditions = {
    payloadMass_kg: 5000,
    payloadDiameter_m: 30,
    structuralIntegrityRating_g: 10,
  };

  it("accepts valid payload within all limits", () => {
    const result = validatePropulsionEnvelopePreconditions(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects payload mass exceeding MAX_PAYLOAD_MASS_KG", () => {
    const result = validatePropulsionEnvelopePreconditions({
      ...validInput,
      payloadMass_kg: 10_001,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects payload diameter exceeding MAX_PAYLOAD_DIAMETER_M", () => {
    const result = validatePropulsionEnvelopePreconditions({
      ...validInput,
      payloadDiameter_m: 51,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects structural integrity below MIN_STRUCTURAL_INTEGRITY_G", () => {
    const result = validatePropulsionEnvelopePreconditions({
      ...validInput,
      structuralIntegrityRating_g: 9,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts boundary values exactly at limits", () => {
    const result = validatePropulsionEnvelopePreconditions({
      payloadMass_kg: MAX_PAYLOAD_MASS_KG,
      payloadDiameter_m: MAX_PAYLOAD_DIAMETER_M,
      structuralIntegrityRating_g: MIN_STRUCTURAL_INTEGRITY_G,
    });
    expect(result.valid).toBe(true);
  });
});

// ── MaterialRequirements Precondition Guards ────────────────────────────────

describe("validateMaterialRequirementsPreconditions", () => {
  const validInput: MaterialRequirementsPreconditions = {
    availableElements: new Set(["Si", "Al", "Y", "Ba", "Cu", "O", "H"]),
    sufficientThroughput: true,
  };

  it("accepts when all required elements and throughput are available", () => {
    const result = validateMaterialRequirementsPreconditions(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects when a required element is missing", () => {
    const result = validateMaterialRequirementsPreconditions({
      availableElements: new Set(["Si", "Al", "Y", "Ba", "Cu", "O"]), // missing H
      sufficientThroughput: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects when throughput is insufficient", () => {
    const result = validateMaterialRequirementsPreconditions({
      ...validInput,
      sufficientThroughput: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── ReplicationSpec Precondition Guards ─────────────────────────────────────

describe("validateReplicationSpecPreconditions", () => {
  it("accepts when blueprints and manufacturing are available", () => {
    const result = validateReplicationSpecPreconditions({
      blueprintsAvailable: true,
      manufacturingOperational: true,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects when blueprints are missing", () => {
    const result = validateReplicationSpecPreconditions({
      blueprintsAvailable: false,
      manufacturingOperational: true,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects when manufacturing is not operational", () => {
    const result = validateReplicationSpecPreconditions({
      blueprintsAvailable: true,
      manufacturingOperational: false,
    });
    expect(result.valid).toBe(false);
  });
});

// ── Sail Computations ───────────────────────────────────────────────────────

describe("computeSailArea", () => {
  it("returns area in m² for a given sail diameter including redundancy margin", () => {
    const diameter = 200; // m
    const baseArea = Math.PI * (diameter / 2) ** 2;
    const expected = baseArea * (1 + REDUNDANT_SAIL_AREA_MARGIN);
    expect(computeSailArea(diameter, REDUNDANT_SAIL_AREA_MARGIN)).toBeCloseTo(expected, 1);
  });
});

describe("computeSailMass", () => {
  it("returns mass in kg from area and areal density", () => {
    const area = 10000; // m²
    // areal density is g/m² so mass = area * density / 1000
    const expected = area * SAIL_AREAL_DENSITY_G_PER_M2 / 1000;
    expect(computeSailMass(area, SAIL_AREAL_DENSITY_G_PER_M2)).toBeCloseTo(expected, 3);
  });
});

// ── Acceleration Duration ───────────────────────────────────────────────────

describe("computeAccelerationDuration", () => {
  it("returns duration in seconds to reach target velocity given acceleration", () => {
    const targetV_c = 0.05;
    const acceleration_m_per_s2 = 5;
    const c = 299_792_458; // m/s
    const targetV_m_per_s = targetV_c * c;
    const expected = targetV_m_per_s / acceleration_m_per_s2;
    expect(computeAccelerationDuration(targetV_c, acceleration_m_per_s2)).toBeCloseTo(expected, 0);
  });
});

// ── Transit Duration ────────────────────────────────────────────────────────

describe("computeTransitDuration", () => {
  it("returns transit duration in years for 4.37 ly at 0.05c within 200 years", () => {
    const duration = computeTransitDuration(4.37, 0.05);
    expect(duration).toBeLessThanOrEqual(MAX_TRANSIT_DURATION_YEARS);
    // 4.37 / 0.05 = 87.4 years
    expect(duration).toBeCloseTo(87.4, 0);
  });

  it("returns transit duration in years for 10 ly at 0.10c", () => {
    const duration = computeTransitDuration(10, 0.10);
    // 10 / 0.10 = 100 years
    expect(duration).toBeCloseTo(100, 0);
  });
});

// ── Deceleration Duration ───────────────────────────────────────────────────

describe("computeDecelerationDuration", () => {
  it("returns nominal deceleration duration at design ISM density", () => {
    const duration = computeDecelerationDuration(
      0.05,
      100, // magsail diameter km
      10_000, // payload mass kg
      1.0, // ISM density protons/cm³ (nominal)
    );
    // At nominal density, should be around 80 years
    expect(duration).toBeCloseTo(DECELERATION_DURATION_YEARS, -1);
  });

  it("returns longer duration at lower ISM density", () => {
    const nominalDuration = computeDecelerationDuration(0.05, 100, 10_000, 1.0);
    const lowDensityDuration = computeDecelerationDuration(0.05, 100, 10_000, 0.1);
    expect(lowDensityDuration).toBeGreaterThan(nominalDuration);
  });
});

// ── Nuclear Backup Fuel Mass ────────────────────────────────────────────────

describe("computeNuclearBackupFuelMass", () => {
  it("returns fuel mass based on NUCLEAR_BACKUP_FUEL_RATIO", () => {
    const payloadMass = 5000;
    const expected = payloadMass * NUCLEAR_BACKUP_FUEL_RATIO;
    expect(computeNuclearBackupFuelMass(payloadMass)).toBe(expected);
  });
});

// ── Mission Phase Sequence (Behavioral Spec) ────────────────────────────────

describe("determineMissionPhaseSequence", () => {
  it("returns standard sequence with sufficient ISM density", () => {
    const phases = determineMissionPhaseSequence(0.5); // 0.5 proton/cm³
    expect(phases).toEqual([
      MissionPhase.Acceleration,
      MissionPhase.Cruise,
      MissionPhase.MagsailDeceleration,
      MissionPhase.OrbitalInsertion,
    ]);
  });

  it("includes nuclear backup when ISM density is below nuclear threshold", () => {
    const phases = determineMissionPhaseSequence(0.005); // below 0.01
    expect(phases).toContain(MissionPhase.NuclearBackupDeceleration);
    expect(phases).toEqual([
      MissionPhase.Acceleration,
      MissionPhase.Cruise,
      MissionPhase.MagsailDeceleration,
      MissionPhase.NuclearBackupDeceleration,
      MissionPhase.OrbitalInsertion,
    ]);
  });
});

// ── Material Feasibility Assessment ─────────────────────────────────────────

describe("assessMaterialFeasibility", () => {
  it("returns all fabricated when all elements and throughput available", () => {
    const result = assessMaterialFeasibility({
      availableElements: new Set(["Si", "Al", "Y", "Ba", "Cu", "O", "H"]),
      sufficientThroughput: true,
    });
    expect(result.laserArrayFabricated).toBe(true);
    expect(result.magsailFabricated).toBe(true);
    expect(result.nuclearBackupFabricated).toBe(true);
  });

  it("reports magsail not fabricated when Y is missing", () => {
    const result = assessMaterialFeasibility({
      availableElements: new Set(["Si", "Al", "Ba", "Cu", "O", "H"]),
      sufficientThroughput: true,
    });
    expect(result.magsailFabricated).toBe(false);
  });

  it("reports laser array not fabricated when Si is missing", () => {
    const result = assessMaterialFeasibility({
      availableElements: new Set(["Al", "Y", "Ba", "Cu", "O", "H"]),
      sufficientThroughput: true,
    });
    expect(result.laserArrayFabricated).toBe(false);
  });

  it("reports nuclear backup not fabricated when H is missing", () => {
    const result = assessMaterialFeasibility({
      availableElements: new Set(["Si", "Al", "Y", "Ba", "Cu", "O"]),
      sufficientThroughput: true,
    });
    expect(result.nuclearBackupFabricated).toBe(false);
  });
});

// ── Replication Feasibility ─────────────────────────────────────────────────

describe("assessReplicationFeasibility", () => {
  it("passes all verification tests and performance tolerance when preconditions met", () => {
    const result = assessReplicationFeasibility({
      blueprintsAvailable: true,
      manufacturingOperational: true,
    });
    expect(result.performanceWithinTolerance).toBe(true);
    for (const test of [
      ReplicationVerificationTest.SailReflectivity,
      ReplicationVerificationTest.MagsailCriticalCurrent,
      ReplicationVerificationTest.LaserBeamQuality,
      ReplicationVerificationTest.StructuralIntegrity,
    ]) {
      expect(result.verificationTestsPassed.get(test)).toBe(true);
    }
  });

  it("fails all verification when blueprints are missing", () => {
    const result = assessReplicationFeasibility({
      blueprintsAvailable: false,
      manufacturingOperational: true,
    });
    expect(result.performanceWithinTolerance).toBe(false);
  });
});

// ── Default Config ──────────────────────────────────────────────────────────

describe("createDefaultPropulsionConfig", () => {
  it("creates a config using all threshold registry values", () => {
    const config = createDefaultPropulsionConfig();
    expect(config.laserSail.sailArealDensity_g_per_m2).toBe(SAIL_AREAL_DENSITY_G_PER_M2);
    expect(config.laserSail.redundantAreaMargin).toBe(REDUNDANT_SAIL_AREA_MARGIN);
    expect(config.laserSail.targetCruiseVelocity_c).toBeGreaterThanOrEqual(CRUISE_VELOCITY_MIN_C);
    expect(config.laserSail.targetCruiseVelocity_c).toBeLessThanOrEqual(CRUISE_VELOCITY_MAX_C);
    expect(config.magsail.designIsmDensity_protons_per_cm3).toBe(ISM_DENSITY_DESIGN_MIN_PROTONS_PER_CM3);
    expect(config.magsail.expectedDecelerationDuration_years).toBe(DECELERATION_DURATION_YEARS);
    expect(config.nuclearBackup.fuelRatio).toBe(NUCLEAR_BACKUP_FUEL_RATIO);
    expect(config.nuclearBackup.fuelType).toBe("deuterium");
  });
});

// ── Mission Simulation (Behavioral Spec Scenarios) ──────────────────────────

describe("simulateMission", () => {
  it("Scenario 1: probe accelerates to cruise velocity during laser-sail phase", () => {
    const config = createDefaultPropulsionConfig();
    const result = simulateMission(config, 4.37, 1.0);
    // Probe must reach cruise velocity
    expect(result.cruiseVelocity_c).toBeGreaterThanOrEqual(CRUISE_VELOCITY_MIN_C);
    expect(result.cruiseVelocity_c).toBeLessThanOrEqual(CRUISE_VELOCITY_MAX_C);
    // Acceleration phase is days-to-weeks (not months)
    expect(result.accelerationDuration_s).toBeGreaterThan(0);
    expect(result.accelerationDuration_s).toBeLessThan(30 * 86400); // < 30 days
  });

  it("Scenario 2: cruise phase — no active propulsion, sail reconfigured as shield", () => {
    const config = createDefaultPropulsionConfig();
    const result = simulateMission(config, 4.37, 1.0);
    expect(result.phases).toContain(MissionPhase.Cruise);
    expect(result.cruiseTemperature_K).toBe(CRUISE_TEMPERATURE_K);
  });

  it("Scenario 3: magsail deceleration at ≤0.001g over ~80 years", () => {
    const config = createDefaultPropulsionConfig();
    const result = simulateMission(config, 4.37, 1.0);
    expect(result.phases).toContain(MissionPhase.MagsailDeceleration);
    expect(result.maxDecelerationG).toBeLessThanOrEqual(MAX_DECELERATION_G);
  });

  it("Scenario 4: arrival velocity ≤10 km/s for orbital insertion", () => {
    const config = createDefaultPropulsionConfig();
    const result = simulateMission(config, 4.37, 1.0);
    expect(result.arrivalVelocity_km_per_s).toBeLessThanOrEqual(MAX_ARRIVAL_VELOCITY_KM_PER_S);
    expect(result.phases).toContain(MissionPhase.OrbitalInsertion);
  });

  it("Scenario 5: nuclear backup activates when ISM density < 0.01 proton/cm³", () => {
    const config = createDefaultPropulsionConfig();
    const result = simulateMission(config, 4.37, 0.005);
    expect(result.phases).toContain(MissionPhase.NuclearBackupDeceleration);
  });

  it("total transit ≤200 years for 4.37 ly target", () => {
    const config = createDefaultPropulsionConfig();
    const result = simulateMission(config, 4.37, 1.0);
    expect(result.totalTransitDuration_years).toBeLessThanOrEqual(MAX_TRANSIT_DURATION_YEARS);
  });

  // Contract invariants
  it("thermal exposure never exceeds 400 K", () => {
    const config = createDefaultPropulsionConfig();
    const result = simulateMission(config, 4.37, 1.0);
    expect(result.maxThermalExposure_K).toBeLessThanOrEqual(MAX_THERMAL_EXPOSURE_K);
  });
});
