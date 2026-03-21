/**
 * Interstellar Propulsion Systems — Core Type Definitions
 *
 * Types and interfaces for the hybrid laser-sail acceleration +
 * magnetic sail deceleration propulsion architecture defined in
 * plan/0.4.2.3-interstellar-propulsion-systems.md
 *
 * Contracts implemented:
 *   PropulsionEnvelope — Interface with 0.4.2.1 Probe Architectures
 *   PropulsionMaterialRequirements — Interface with 0.4.2.2 Stellar Resource Extraction
 *   PropulsionReplicationSpec — Interface with 0.4.2.4 Self-Replication Protocols
 */

// ── Mission Phases ──────────────────────────────────────────────────────────

export enum MissionPhase {
  /** Laser-sail acceleration from origin system */
  Acceleration = "ACCELERATION",
  /** Interstellar cruise at constant velocity */
  Cruise = "CRUISE",
  /** Magnetic sail deceleration approaching destination */
  MagsailDeceleration = "MAGSAIL_DECELERATION",
  /** Nuclear backup deceleration (low-ISM-density fallback) */
  NuclearBackupDeceleration = "NUCLEAR_BACKUP_DECELERATION",
  /** Final orbital insertion at destination */
  OrbitalInsertion = "ORBITAL_INSERTION",
}

// ── Threshold Registry Constants ────────────────────────────────────────────
// All values from card §Threshold Registry. Names match registry entries.

/** Cruise velocity range as fraction of c */
export const CRUISE_VELOCITY_MIN_C = 0.05;
export const CRUISE_VELOCITY_MAX_C = 0.10;

/** Maximum payload mass in kg */
export const MAX_PAYLOAD_MASS_KG = 10_000;

/** Sail areal density in g/m² */
export const SAIL_AREAL_DENSITY_G_PER_M2 = 1;

/** Sail diameter range in meters */
export const SAIL_DIAMETER_MIN_M = 100;
export const SAIL_DIAMETER_MAX_M = 500;

/** Laser array power range in watts */
export const LASER_ARRAY_POWER_MIN_W = 10e9;   // 10 GW
export const LASER_ARRAY_POWER_MAX_W = 100e9;  // 100 GW

/** Magsail loop diameter range in km */
export const MAGSAIL_LOOP_DIAMETER_MIN_KM = 50;
export const MAGSAIL_LOOP_DIAMETER_MAX_KM = 200;

/** ISM density design minimum in protons/cm³ */
export const ISM_DENSITY_DESIGN_MIN_PROTONS_PER_CM3 = 0.1;

/** ISM density threshold below which nuclear backup is required, in protons/cm³ */
export const ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3 = 0.01;

/** Deceleration duration in years */
export const DECELERATION_DURATION_YEARS = 80;

/** Nuclear backup fuel ratio (kg fuel per kg payload) */
export const NUCLEAR_BACKUP_FUEL_RATIO = 2;

/** Redundant sail area margin as fraction */
export const REDUNDANT_SAIL_AREA_MARGIN = 0.20;

// ── PropulsionEnvelope Contract Types ───────────────────────────────────────

/** Preconditions for probe payload accepted by propulsion system */
export interface PropulsionEnvelopePreconditions {
  /** Probe payload mass in kg — must be ≤ MAX_PAYLOAD_MASS_KG */
  payloadMass_kg: number;
  /** Probe payload diameter in m — must be ≤ 50 */
  payloadDiameter_m: number;
  /** Probe structural integrity rating in g — must be ≥ 10 */
  structuralIntegrityRating_g: number;
}

/** Postconditions guaranteed by propulsion system upon mission completion */
export interface PropulsionEnvelopePostconditions {
  /** Arrival velocity relative to destination star in km/s — guaranteed ≤ 10 */
  arrivalVelocity_km_per_s: number;
  /** Transit duration in years — guaranteed ≤ 200 for targets ≤ 4.37 ly */
  transitDuration_years: number;
}

/** Invariants maintained throughout mission */
export interface PropulsionEnvelopeInvariants {
  /** Maximum thermal exposure in K — never exceeds 400 */
  maxThermalExposure_K: number;
  /** Cruise-phase temperature in K — approximately 3 */
  cruiseTemperature_K: number;
  /** Deceleration g-force — never exceeds 0.001g */
  maxDecelerationG: number;
}

/** Maximum payload diameter in meters (Contract precondition) */
export const MAX_PAYLOAD_DIAMETER_M = 50;

/** Minimum structural integrity rating in g (Contract precondition) */
export const MIN_STRUCTURAL_INTEGRITY_G = 10;

/** Maximum arrival velocity in km/s (Contract postcondition) */
export const MAX_ARRIVAL_VELOCITY_KM_PER_S = 10;

/** Maximum transit duration in years for ≤ 4.37 ly targets (Contract postcondition) */
export const MAX_TRANSIT_DURATION_YEARS = 200;

/** Maximum thermal exposure in K (Contract invariant) */
export const MAX_THERMAL_EXPOSURE_K = 400;

/** Cruise temperature in K (Contract invariant) */
export const CRUISE_TEMPERATURE_K = 3;

/** Maximum deceleration in g (Contract invariant) */
export const MAX_DECELERATION_G = 0.001;

/** Peak acceleration during laser-sail phase in g */
export const PEAK_ACCELERATION_G = 10;

// ── PropulsionMaterialRequirements Contract Types ───────────────────────────

/** Elements required for propulsion system fabrication */
export type PropulsionElement =
  | "Si" | "Al" | "Y" | "Ba" | "Cu" | "O" | "H" | "Fe";

/** Bill of materials: element -> mass in kg */
export type PropulsionBillOfMaterials = Map<PropulsionElement, number>;

/** Material requirements precondition: destination system must provide these */
export interface MaterialRequirementsPreconditions {
  /** Available elements at destination */
  availableElements: Set<PropulsionElement>;
  /** Whether resource extraction throughput is sufficient (decades-scale) */
  sufficientThroughput: boolean;
}

/** Material requirements postconditions: what can be fabricated */
export interface MaterialRequirementsPostconditions {
  /** Laser array fabricated from local materials */
  laserArrayFabricated: boolean;
  /** Magsail assembly fabricated from local materials */
  magsailFabricated: boolean;
  /** Nuclear backup (if needed) fabricated from local materials */
  nuclearBackupFabricated: boolean;
}

/** Required elements for propulsion system replication */
export const REQUIRED_ELEMENTS: ReadonlySet<PropulsionElement> = new Set([
  "Si", "Al", "Y", "Ba", "Cu", "O", "H",
]);

// ── PropulsionReplicationSpec Contract Types ────────────────────────────────

export enum FabricationComplexity {
  Low = "LOW",
  Medium = "MEDIUM",
  High = "HIGH",
}

export enum ReplicationVerificationTest {
  SailReflectivity = "SAIL_REFLECTIVITY",
  MagsailCriticalCurrent = "MAGSAIL_CRITICAL_CURRENT",
  LaserBeamQuality = "LASER_BEAM_QUALITY",
  StructuralIntegrity = "STRUCTURAL_INTEGRITY",
}

/** Replication spec preconditions */
export interface ReplicationSpecPreconditions {
  /** Fabrication blueprints available for all propulsion components */
  blueprintsAvailable: boolean;
  /** Destination manufacturing capability (per 0.4.2.2) is operational */
  manufacturingOperational: boolean;
}

/** Replication spec postconditions */
export interface ReplicationSpecPostconditions {
  /** All verification tests passed */
  verificationTestsPassed: Map<ReplicationVerificationTest, boolean>;
  /** Replicated system performance within 5% of original */
  performanceWithinTolerance: boolean;
}

/** Performance tolerance for replicated systems (5% per contract) */
export const REPLICATION_PERFORMANCE_TOLERANCE = 0.05;

/** Fabrication complexity classification */
export const PROPULSION_FABRICATION_COMPLEXITY = FabricationComplexity.Medium;

// ── Laser Sail Subsystem ────────────────────────────────────────────────────

export interface LaserSailConfig {
  /** Sail diameter in meters */
  sailDiameter_m: number;
  /** Sail areal density in g/m² */
  sailArealDensity_g_per_m2: number;
  /** Redundant sail area margin as fraction */
  redundantAreaMargin: number;
  /** Laser array total power in watts */
  laserArrayPower_W: number;
  /** Target cruise velocity as fraction of c */
  targetCruiseVelocity_c: number;
}

// ── Magnetic Sail Subsystem ─────────────────────────────────────────────────

export interface MagsailConfig {
  /** Superconducting loop diameter in km */
  loopDiameter_km: number;
  /** ISM density used for design calculations in protons/cm³ */
  designIsmDensity_protons_per_cm3: number;
  /** Expected deceleration duration in years */
  expectedDecelerationDuration_years: number;
}

// ── Nuclear Backup Subsystem ────────────────────────────────────────────────

export interface NuclearBackupConfig {
  /** Fuel-to-payload mass ratio */
  fuelRatio: number;
  /** Fuel type */
  fuelType: "deuterium";
  /** Target Δv as fraction of c */
  targetDeltaV_c: number;
}

// ── Complete Propulsion System ──────────────────────────────────────────────

export interface PropulsionSystemConfig {
  laserSail: LaserSailConfig;
  magsail: MagsailConfig;
  nuclearBackup: NuclearBackupConfig;
}

export interface MissionState {
  /** Current mission phase */
  phase: MissionPhase;
  /** Current velocity as fraction of c */
  velocity_c: number;
  /** Distance traveled in light-years */
  distanceTraveled_ly: number;
  /** Mission elapsed time in years */
  elapsedTime_years: number;
  /** Current ISM density along trajectory in protons/cm³ */
  ismDensity_protons_per_cm3: number;
  /** Current thermal exposure in K */
  thermalExposure_K: number;
  /** Target distance in light-years */
  targetDistance_ly: number;
}

/** Validation result for precondition/invariant checks */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
