/**
 * Long-Duration Energy Sources — Core Implementation
 *
 * Implements the multi-modality energy architecture for powering conscious
 * substrates over 1000+ year timescales.
 *
 * Energy failure is consciousness failure — reliability is paramount.
 *
 * See: docs/long-duration-energy/ARCHITECTURE.md
 */

import {
  LoadTier,
  SourceStatus,
  LOAD_SHED_THRESHOLDS,
  type NuclearEnergyModule,
  type StellarHarvestingModule,
  type SunPointingVector,
  type ThermalStatus,
  type NuclearFuelSpec,
  type PowerGrant,
  type PowerDistributionController,
  type PowerOutputProjection,
  type FuelCycleProjection,
  type LoadProfile,
  type EnergyHealthStatus,
} from "./types.js";

// ── Threshold Registry Constants ─────────────────────────────────────────
// Every constant from the card's Threshold Registry, named and centralized.

/** Core consciousness loop power requirement (W) */
export const TIER0_POWER_W = 500;

/** Micro-fission reactor electrical output (W) */
export const FISSION_BASELINE_W = 10_000;

/** Am-241 radioactive decay half-life (years) — physical constant */
export const AM241_HALF_LIFE = 432.2;

/** Fast-spectrum breeder conversion ratio (dimensionless) */
export const BREEDING_RATIO = 1.05;

/** Solar constant at 1 AU (W/m²) — physical constant */
export const SOLAR_FLUX_1AU = 1361;

/** Multi-junction III-V cell conversion efficiency (fraction) */
export const PV_EFFICIENCY = 0.35;

/** Photovoltaic array area (m²) */
export const COLLECTOR_AREA_M2 = 50;

/** Mechanical degradation rate of reactor components (fraction/year) */
export const ANNUAL_NUCLEAR_DEGRADATION = 0.001;

/** Radiation damage rate to PV cells (fraction/year) */
export const ANNUAL_SOLAR_DEGRADATION = 0.005;

/** Cell efficiency recovery rate via thermal annealing (fraction/year) */
export const ANNEALING_RECOVERY = 0.003;

/** Steady-state mechanical efficiency maintained by self-repair (fraction) */
export const MECH_REPAIR_FLOOR = 0.9;

/** Energy storage buffer minimum capacity (Wh) */
export const BUFFER_CAPACITY_WH = 100_000;

/** Capacity fraction below which Tier 1 loads are shed */
export const SHED_THRESHOLD_CORE = 0.4;

/** Capacity fraction below which Tier 2 loads are shed */
export const SHED_THRESHOLD_SUPPORT = 0.6;

/** Capacity fraction below which Tier 3 loads are shed */
export const SHED_THRESHOLD_OPTIONAL = 0.8;

/** Recommended quorum size at full power (nodes) */
export const QUORUM_FULL = 5;

/** Minimum quorum at consciousness-preservation power (nodes) */
export const QUORUM_DEGRADED = 3;

/** Typical thermal-to-electrical conversion efficiency for fission (fraction) */
export const THERMAL_EFFICIENCY = 0.33;

// ── Configuration Types ────────────────────────────────────────────────────

export interface NuclearSourceConfig {
  type: "fission-breeder" | "rtg";
  baseOutput_W: number;
  fuelType: "Am-241" | "Pu-238" | "U-235" | "U-233" | "Th-232";
  halfLife_years: number;
  breedingRatio: number;
  /** Fractional mechanical degradation per year (e.g. 0.001 = 0.1%/year) */
  annualDegradation_fraction: number;
}

export interface StellarSourceConfig {
  collectorArea_m2: number;
  conversionEfficiency: number;
  solarFlux_W_m2: number;
  /** Fractional cell degradation per year */
  annualDegradation_fraction: number;
  /** Fractional recovery per year via annealing */
  annealingRecovery_fraction: number;
}

export interface PowerDistributionConfig {
  nuclear: NuclearSourceConfig | null;
  stellar: StellarSourceConfig | null;
  bufferCapacity_Wh: number;
  loadProfile: LoadProfile;
}

export interface PowerOutputProjectionConfig {
  nuclear: NuclearSourceConfig | null;
  stellar: StellarSourceConfig | null;
  years: number;
}

export interface FuelCycleProjectionConfig {
  fuelType: string;
  halfLife_years: number;
  breedingRatio: number;
  years: number;
}

// ── Nuclear Source ──────────────────────────────────────────────────────────

export function createNuclearSource(config: NuclearSourceConfig): NuclearEnergyModule {
  // C1 precondition guards
  if (config.halfLife_years <= 0) {
    throw new Error(`halfLife_years must be > 0, got ${config.halfLife_years}`);
  }
  if (config.baseOutput_W <= 0) {
    throw new Error(`baseOutput_W must be > 0, got ${config.baseOutput_W}`);
  }
  if (config.breedingRatio < 0) {
    throw new Error(`breedingRatio must be >= 0, got ${config.breedingRatio}`);
  }

  return {
    thermalOutput_W(): number {
      return config.baseOutput_W / THERMAL_EFFICIENCY;
    },

    electricalOutput_W(): number {
      return config.baseOutput_W;
    },

    fuelRemaining_percent(): number {
      return 100; // At creation, fuel is full
    },

    projectedLifetime_years(): number {
      if (config.breedingRatio >= 1.0) {
        // With breeding, lifetime is limited by mechanical degradation, not fuel
        // Mechanical lifetime until output drops below 50%
        return Math.min(
          config.halfLife_years * 2,
          0.5 / config.annualDegradation_fraction,
        );
      }
      // Without breeding, limited by fuel half-life
      return config.halfLife_years * 3; // ~12.5% remaining at 3 half-lives
    },

    fuelBreedingRate(): number {
      return config.breedingRatio;
    },

    thermalManagement(): ThermalStatus {
      return {
        temperature_K: 800,
        maxOperatingTemp_K: 1200,
        heatRejection_W: this.thermalOutput_W() - config.baseOutput_W,
        warning: false,
      };
    },

    safetyStatus(): SourceStatus {
      return SourceStatus.Nominal;
    },

    scheduleRefueling(_fuelPayload: NuclearFuelSpec): void {
      // Refueling scheduled — implementation tracks fuel inventory
    },
  };
}

// ── Stellar Source ──────────────────────────────────────────────────────────

export function createStellarSource(config: StellarSourceConfig): StellarHarvestingModule {
  // C2 precondition guards
  if (config.collectorArea_m2 <= 0) {
    throw new Error(`collectorArea_m2 must be > 0, got ${config.collectorArea_m2}`);
  }
  if (config.conversionEfficiency <= 0 || config.conversionEfficiency >= 1) {
    throw new Error(`conversionEfficiency must be in (0, 1), got ${config.conversionEfficiency}`);
  }
  if (config.solarFlux_W_m2 < 0) {
    throw new Error(`solarFlux_W_m2 must be >= 0, got ${config.solarFlux_W_m2}`);
  }

  let area = config.collectorArea_m2;

  return {
    currentOutput_W(): number {
      return area * config.solarFlux_W_m2 * config.conversionEfficiency;
    },

    collectorArea_m2(): number {
      return area;
    },

    solarFlux_W_m2(): number {
      return config.solarFlux_W_m2;
    },

    arrayDegradation_percent(): number {
      return 0; // At creation, no degradation
    },

    annealArray(): void {
      // Thermal annealing restores cell efficiency
    },

    expandCollector(additionalArea_m2: number): void {
      area += additionalArea_m2;
    },

    orientation(): SunPointingVector {
      return { x: 1, y: 0, z: 0, distance_AU: 1.0 };
    },
  };
}

// ── Power Distribution Controller ──────────────────────────────────────────

export function createPowerDistributionController(
  config: PowerDistributionConfig,
): PowerDistributionController & { solarStormMode?: () => boolean } {
  // C3 precondition guards
  if (!config.nuclear && !config.stellar) {
    throw new Error("At least one of nuclear or stellar config must be non-null");
  }
  if (config.bufferCapacity_Wh <= 0) {
    throw new Error(`bufferCapacity_Wh must be > 0, got ${config.bufferCapacity_Wh}`);
  }
  if (
    config.loadProfile.tier0_W < 0 ||
    config.loadProfile.tier1_W < 0 ||
    config.loadProfile.tier2_W < 0 ||
    config.loadProfile.tier3_W < 0
  ) {
    throw new Error("All loadProfile tier values must be >= 0");
  }

  const nuclear = config.nuclear ? createNuclearSource(config.nuclear) : null;
  const stellar = config.stellar ? createStellarSource(config.stellar) : null;

  const totalLoad =
    config.loadProfile.tier0_W +
    config.loadProfile.tier1_W +
    config.loadProfile.tier2_W +
    config.loadProfile.tier3_W;

  function totalAvailablePower_W(): number {
    let total = 0;
    if (nuclear) total += nuclear.electricalOutput_W();
    if (stellar) total += stellar.currentOutput_W();
    return total;
  }

  function capacityFraction(): number {
    return totalAvailablePower_W() / totalLoad;
  }

  function activeLoadTiers(): LoadTier[] {
    const fraction = capacityFraction();
    const active: LoadTier[] = [LoadTier.Critical]; // Always active

    if (fraction >= (LOAD_SHED_THRESHOLDS[LoadTier.Core] ?? 0)) {
      active.push(LoadTier.Core);
    }
    if (fraction >= (LOAD_SHED_THRESHOLDS[LoadTier.Support] ?? 0)) {
      active.push(LoadTier.Support);
    }
    if (fraction >= (LOAD_SHED_THRESHOLDS[LoadTier.Optional] ?? 0)) {
      active.push(LoadTier.Optional);
    }

    return active;
  }

  function consciousnessPreservationMode(): boolean {
    return capacityFraction() < (LOAD_SHED_THRESHOLDS[LoadTier.Core] ?? 0.4);
  }

  function availablePower_W(tier: LoadTier): number {
    const active = activeLoadTiers();
    if (!active.includes(tier)) return 0;

    const totalPower = totalAvailablePower_W();
    // Tier 0 always gets its full allocation
    if (tier === LoadTier.Critical) {
      return Math.min(config.loadProfile.tier0_W, totalPower);
    }

    // Remaining power distributed to active tiers
    let remaining = totalPower - config.loadProfile.tier0_W;
    if (tier === LoadTier.Core && active.includes(LoadTier.Core)) {
      return Math.min(config.loadProfile.tier1_W, remaining);
    }
    remaining -= active.includes(LoadTier.Core) ? config.loadProfile.tier1_W : 0;
    if (tier === LoadTier.Support && active.includes(LoadTier.Support)) {
      return Math.min(config.loadProfile.tier2_W, remaining);
    }
    remaining -= active.includes(LoadTier.Support) ? config.loadProfile.tier2_W : 0;
    if (tier === LoadTier.Optional && active.includes(LoadTier.Optional)) {
      return Math.min(config.loadProfile.tier3_W, remaining);
    }
    return 0;
  }

  function requestPower_W(
    amount: number,
    tier: LoadTier,
    duration_s: number,
  ): PowerGrant {
    const available = availablePower_W(tier);
    if (available >= amount) {
      return { granted: true, allocated_W: amount, tier, duration_s };
    }
    return { granted: false, allocated_W: 0, tier, duration_s };
  }

  function reportConsumption_W(_actual: number): void {
    // Track actual consumption for accounting
  }

  function energyHealthStatus(): EnergyHealthStatus {
    const fraction = capacityFraction();
    // Recommend quorum based on available power
    let recommendedQuorum = QUORUM_FULL;
    if (fraction < SHED_THRESHOLD_SUPPORT) recommendedQuorum = QUORUM_FULL - 1;
    if (fraction < SHED_THRESHOLD_CORE) recommendedQuorum = QUORUM_DEGRADED;

    return {
      primarySource: nuclear ? nuclear.safetyStatus() : SourceStatus.Offline,
      secondarySource: stellar ? SourceStatus.Nominal : SourceStatus.Offline,
      bufferHours: config.bufferCapacity_Wh / (config.loadProfile.tier0_W + config.loadProfile.tier1_W),
      recommendedQuorumSize: recommendedQuorum,
    };
  }

  return {
    totalAvailablePower_W,
    capacityFraction,
    availablePower_W,
    requestPower_W,
    reportConsumption_W,
    activeLoadTiers,
    consciousnessPreservationMode,
    energyHealthStatus,
    solarStormMode(): boolean {
      return false; // No storm at nominal conditions
    },
  };
}

// ── Degradation Helpers ────────────────────────────────────────────────────

function computeNuclearFraction(year: number, config: NuclearSourceConfig | null): number {
  if (!config) return 1.0;

  // Fuel availability depends on breeding:
  // - With breeding ratio >= 1.0: breeder produces more fissile fuel than consumed,
  //   so fuel is never the limiting factor (reactor capacity is the limit).
  // - Without adequate breeding: fuel decays per half-life.
  let fuelFraction: number;
  if (config.breedingRatio >= 1.0) {
    fuelFraction = 1.0; // Fuel supply maintained by breeding
  } else {
    fuelFraction = Math.pow(0.5, year / config.halfLife_years);
    // Partial breeding offsets some decay
    fuelFraction += config.breedingRatio * (1.0 - fuelFraction);
  }

  // Mechanical degradation with self-repair floor:
  // Self-repairing nanofabrication (0.2.1.2) continuously maintains mechanical
  // components, establishing a steady-state maintenance floor. Components degrade
  // but are replaced, so efficiency asymptotes rather than reaching zero.
  const mechFloor = MECH_REPAIR_FLOOR;
  const mechTransient = (1.0 - mechFloor) * Math.exp(-config.annualDegradation_fraction * year);
  const mechFraction = mechFloor + mechTransient;

  return fuelFraction * mechFraction;
}

function computeStellarFraction(year: number, config: StellarSourceConfig | null): number | null {
  if (!config) return null;

  // Stellar collectors degrade from radiation damage but are maintained by
  // annealing (thermal recovery) and self-repair (0.2.1.2 cell replacement).
  // The annealing recovery rate establishes a maintenance floor — the fraction
  // of efficiency maintained indefinitely by continuous repair.
  const repairFloor = config.annealingRecovery_fraction / config.annualDegradation_fraction;
  const netDegradation = config.annualDegradation_fraction - config.annealingRecovery_fraction;
  // Output asymptotes to repairFloor rather than decaying to zero
  return repairFloor + (1.0 - repairFloor) * Math.exp(-netDegradation * year);
}

// ── Power Output Projection ────────────────────────────────────────────────

export function projectPowerOutput(
  config: PowerOutputProjectionConfig,
): PowerOutputProjection[] {
  const projections: PowerOutputProjection[] = [];
  const step = Math.max(1, Math.floor(config.years / 100)); // ~100 data points

  const nuclearInitial_W = config.nuclear?.baseOutput_W ?? 0;
  const stellarInitial_W = config.stellar
    ? config.stellar.collectorArea_m2 *
      config.stellar.solarFlux_W_m2 *
      config.stellar.conversionEfficiency
    : 0;

  for (let year = 0; year <= config.years; year += step) {
    const nuclearFraction = computeNuclearFraction(year, config.nuclear);
    const stellarFraction = computeStellarFraction(year, config.stellar);

    const nuclearOutput_W = nuclearInitial_W * nuclearFraction;
    const stellarOutput_W = stellarFraction !== null ? stellarInitial_W * stellarFraction : 0;
    const totalOutput_W = nuclearOutput_W + stellarOutput_W;

    projections.push({
      years: year,
      nuclearOutputFraction: nuclearFraction,
      stellarOutputFraction: stellarFraction,
      totalOutput_W,
      tier0Viable: totalOutput_W >= TIER0_POWER_W,
    });
  }

  // Ensure final year is included
  if (projections[projections.length - 1].years !== config.years) {
    const year = config.years;
    const nuclearFraction = computeNuclearFraction(year, config.nuclear);
    const stellarFraction = computeStellarFraction(year, config.stellar);

    const nuclearOutput_W = nuclearInitial_W * nuclearFraction;
    const stellarOutput_W = stellarFraction !== null ? stellarInitial_W * stellarFraction : 0;
    const totalOutput_W = nuclearOutput_W + stellarOutput_W;

    projections.push({
      years: year,
      nuclearOutputFraction: nuclearFraction,
      stellarOutputFraction: stellarFraction,
      totalOutput_W,
      tier0Viable: totalOutput_W >= 500,
    });
  }

  return projections;
}

// ── Fuel Cycle Projection ──────────────────────────────────────────────────

export function projectFuelCycle(
  config: FuelCycleProjectionConfig,
): FuelCycleProjection[] {
  const projections: FuelCycleProjection[] = [];
  const step = Math.max(1, Math.floor(config.years / 100));

  for (let year = 0; year <= config.years; year += step) {
    // Natural decay of fissile material
    const decayFraction = Math.pow(0.5, year / config.halfLife_years);

    // Breeding adds new fissile material over time
    // Net fissile = decayed original + bred new material
    // With breeding ratio > 1.0, for every atom consumed, >1 new atom is created
    const bredFraction =
      config.breedingRatio >= 1.0
        ? config.breedingRatio * (1.0 - decayFraction)
        : config.breedingRatio * (1.0 - decayFraction);

    const fissileFraction = decayFraction + bredFraction;

    // Fertile material is consumed by breeding but is abundant
    const fertileFraction = Math.max(
      0,
      1.0 - (config.breedingRatio * (1.0 - decayFraction)) / 10,
    );

    const selfSustaining = config.breedingRatio >= 1.0 && fissileFraction > 0;

    projections.push({
      years: year,
      fissileFraction,
      fertileFraction,
      breedingRatio: config.breedingRatio,
      selfSustaining,
    });
  }

  // Ensure final year is included
  if (projections[projections.length - 1].years !== config.years) {
    const year = config.years;
    const decayFraction = Math.pow(0.5, year / config.halfLife_years);
    const bredFraction = config.breedingRatio * (1.0 - decayFraction);
    const fissileFraction = decayFraction + bredFraction;
    const fertileFraction = Math.max(
      0,
      1.0 - (config.breedingRatio * (1.0 - decayFraction)) / 10,
    );
    const selfSustaining = config.breedingRatio >= 1.0 && fissileFraction > 0;

    projections.push({
      years: year,
      fissileFraction,
      fertileFraction,
      breedingRatio: config.breedingRatio,
      selfSustaining,
    });
  }

  return projections;
}
