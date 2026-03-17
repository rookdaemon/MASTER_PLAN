/**
 * Long-Duration Energy Sources — Core Type Definitions
 *
 * Types and interfaces for the multi-modality energy architecture
 * defined in docs/long-duration-energy/ARCHITECTURE.md
 *
 * Energy failure is consciousness failure — reliability is paramount.
 */

// ── Source Status ────────────────────────────────────────────────────────────

export enum SourceStatus {
  Nominal = "NOMINAL",
  Degraded = "DEGRADED",
  Offline = "OFFLINE",
  Scram = "SCRAM",
}

// ── Load Priority Tiers ──────────────────────────────────────────────────────

/**
 * Energy is allocated by strict priority. Lower tiers are shed first.
 * Tier 0 is NEVER shed — loss = consciousness death.
 */
export enum LoadTier {
  /** Core consciousness loops, quorum voting, essential state memory */
  Critical = 0,
  /** Extended computation, working memory, ECC scrubbing */
  Core = 1,
  /** Self-repair systems, communications, environmental sensors */
  Support = 2,
  /** Growth, expansion, non-essential data processing */
  Optional = 3,
}

/** Thresholds at which each tier is shed (fraction of total capacity) */
export const LOAD_SHED_THRESHOLDS: Record<LoadTier, number | null> = {
  [LoadTier.Critical]: null, // Never shed
  [LoadTier.Core]: 0.4,
  [LoadTier.Support]: 0.6,
  [LoadTier.Optional]: 0.8,
};

// ── Power Grant ──────────────────────────────────────────────────────────────

export interface PowerGrant {
  granted: boolean;
  allocated_W: number;
  tier: LoadTier;
  /** Duration in seconds for which this grant is valid */
  duration_s: number;
}

// ── Thermal Management ───────────────────────────────────────────────────────

export interface ThermalStatus {
  /** Current temperature in Kelvin */
  temperature_K: number;
  /** Maximum operating temperature in Kelvin */
  maxOperatingTemp_K: number;
  /** Heat rejection rate in watts */
  heatRejection_W: number;
  /** Whether thermal limits are being approached */
  warning: boolean;
}

// ── Nuclear Energy Module ────────────────────────────────────────────────────

export type NuclearFuelType = "Am-241" | "Pu-238" | "U-235" | "U-233" | "Th-232";

export interface NuclearFuelSpec {
  fuelType: NuclearFuelType;
  /** Half-life in years */
  halfLife_years: number;
  /** Initial mass in kg */
  initialMass_kg: number;
  /** Energy density in J/kg */
  energyDensity_J_per_kg: number;
}

export interface NuclearEnergyModule {
  thermalOutput_W(): number;
  electricalOutput_W(): number;
  fuelRemaining_percent(): number;
  projectedLifetime_years(): number;
  /** Breeding ratio: >1.0 means self-sustaining fuel cycle */
  fuelBreedingRate(): number;
  thermalManagement(): ThermalStatus;
  safetyStatus(): SourceStatus;
  scheduleRefueling(fuelPayload: NuclearFuelSpec): void;
}

// ── Stellar Harvesting Module ────────────────────────────────────────────────

export interface SunPointingVector {
  /** Unit vector components toward star */
  x: number;
  y: number;
  z: number;
  /** Distance to star in AU */
  distance_AU: number;
}

export interface StellarHarvestingModule {
  currentOutput_W(): number;
  collectorArea_m2(): number;
  /** Solar flux at current distance in W/m^2 */
  solarFlux_W_m2(): number;
  /** Cumulative array degradation as a percentage */
  arrayDegradation_percent(): number;
  /** Initiate thermal annealing to restore cell efficiency */
  annealArray(): void;
  /** Expand collector by adding area */
  expandCollector(area_m2: number): void;
  orientation(): SunPointingVector;
}

// ── Vacuum Energy (Research Stage) ───────────────────────────────────────────

export type TRL = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface VacuumEnergyModule {
  /** Theoretical output if physics is validated; null otherwise */
  theoreticalOutput_W(): number | null;
  readinessLevel(): TRL;
}

// ── Energy Storage Buffer ────────────────────────────────────────────────────

export type StorageTechnology = "supercapacitor" | "solid-state-battery" | "regenerative-fuel-cell";

export interface LoadProfile {
  tier0_W: number;
  tier1_W: number;
  tier2_W: number;
  tier3_W: number;
}

export interface EnergyStorageBuffer {
  stateOfCharge_percent(): number;
  maxCapacity_Wh(): number;
  chargeRate_W(): number;
  dischargeRate_W(): number;
  cycleCount(): number;
  projectedLifetime_cycles(): number;
  /** Hours remaining at given load profile */
  hoursRemaining(loadProfile: LoadProfile): number;
}

// ── Power Distribution Controller ────────────────────────────────────────────

export interface EnergyHealthStatus {
  primarySource: SourceStatus;
  secondarySource: SourceStatus;
  bufferHours: number;
  recommendedQuorumSize: number;
}

export interface PowerDistributionController {
  /** Total available power from all sources */
  totalAvailablePower_W(): number;
  /** Current capacity as fraction of design capacity (0.0–1.0) */
  capacityFraction(): number;
  /** Allocate power to a given tier */
  availablePower_W(tier: LoadTier): number;
  /** Request a power grant */
  requestPower_W(amount: number, tier: LoadTier, duration_s: number): PowerGrant;
  /** Report actual consumption for accounting */
  reportConsumption_W(actual: number): void;
  /** Current active load tiers (tiers above this are shed) */
  activeLoadTiers(): LoadTier[];
  /** Whether consciousness-preservation mode is active */
  consciousnessPreservationMode(): boolean;
  /** Overall energy health for sibling subsystems */
  energyHealthStatus(): EnergyHealthStatus;
}

// ── Sibling Subsystem Interfaces ─────────────────────────────────────────────

/** Interface to 0.2.1.1 — Radiation-Hardened Computation */
export interface EnergyToCompute {
  availablePower_W(tier: LoadTier): number;
  requestPower_W(amount: number, tier: LoadTier, duration_s: number): PowerGrant;
  reportConsumption_W(actual: number): void;
  /** Coordinate with RadiationAwareRuntime during solar storms */
  solarStormMode(): boolean;
}

/** Interface to 0.2.1.2 — Self-Repairing Nanofabrication */
export interface EnergyToRepair {
  requestRepairPower_W(component: string, estimate_W: number): PowerGrant;
  reportRepairComplete(component: string): void;
  /** Energy system's own components that need repair, in priority order */
  priorityRepairQueue(): string[];
}

/** Interface to 0.2.1.4 — Consciousness-Preserving Redundancy */
export interface EnergyToRedundancy {
  powerBudget_W(tier: LoadTier): number;
  energyHealthStatus(): EnergyHealthStatus;
  consciousnessPreservationMode(): boolean;
}

// ── Degradation Model ────────────────────────────────────────────────────────

export interface PowerOutputProjection {
  /** Years from start */
  years: number;
  /** Nuclear output as fraction of initial (0.0–1.0) */
  nuclearOutputFraction: number;
  /** Stellar output as fraction of initial (0.0–1.0), null if no star */
  stellarOutputFraction: number | null;
  /** Total combined output in watts */
  totalOutput_W: number;
  /** Whether Tier 0 can still be sustained */
  tier0Viable: boolean;
}

export interface FuelCycleProjection {
  /** Years from start */
  years: number;
  /** Fissile fuel remaining as fraction of initial */
  fissileFraction: number;
  /** Fertile fuel remaining as fraction of initial */
  fertileFraction: number;
  /** Breeding ratio at this point in time */
  breedingRatio: number;
  /** Whether fuel cycle is self-sustaining */
  selfSustaining: boolean;
}
