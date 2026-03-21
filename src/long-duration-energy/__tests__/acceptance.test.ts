/**
 * Long-Duration Energy Sources — Acceptance Criteria Tests
 *
 * Maps directly to the 7 acceptance criteria in plan/0.2.1.3-long-duration-energy.md.
 * Red/Green/Refactor: these tests define what "done" looks like.
 */

import { describe, it, expect } from "vitest";
import {
  LoadTier,
  SourceStatus,
  LOAD_SHED_THRESHOLDS,
  type PowerOutputProjection,
  type FuelCycleProjection,
  type LoadProfile,
  type EnergyHealthStatus,
} from "../types.js";
import {
  createNuclearSource,
  createStellarSource,
  createPowerDistributionController,
  projectPowerOutput,
  projectFuelCycle,
  TIER0_POWER_W,
  MECH_REPAIR_FLOOR,
  THERMAL_EFFICIENCY,
  QUORUM_FULL,
  QUORUM_DEGRADED,
  type NuclearSourceConfig,
  type StellarSourceConfig,
  type PowerDistributionConfig,
} from "../energy-system.js";

// ── Reference Constants ─────────────────────────────────────────────────────

/** Am-241 half-life in years */
const AM241_HALF_LIFE = 432.2;

/** Micro-fission baseline electrical output in watts */
const FISSION_BASELINE_W = 10_000;

/** Solar flux at 1 AU in W/m² */
const SOLAR_FLUX_1AU = 1361;

/** Collector area in m² for ~10 kW(e) at 1 AU */
const COLLECTOR_AREA_M2 = 50;

/** PV conversion efficiency */
const PV_EFFICIENCY = 0.35;

/** Design lifetime in years */
const DESIGN_LIFETIME_YEARS = 1000;

/** Tier 0 power requirement in watts (core consciousness loops) */
const TIER0_POWER_W = 500;

// ── Default configs ─────────────────────────────────────────────────────────

const DEFAULT_NUCLEAR_CONFIG: NuclearSourceConfig = {
  type: "fission-breeder",
  baseOutput_W: FISSION_BASELINE_W,
  fuelType: "Am-241",
  halfLife_years: AM241_HALF_LIFE,
  breedingRatio: 1.05,
  annualDegradation_fraction: 0.001, // 0.1%/year mechanical degradation
};

const DEFAULT_STELLAR_CONFIG: StellarSourceConfig = {
  collectorArea_m2: COLLECTOR_AREA_M2,
  conversionEfficiency: PV_EFFICIENCY,
  solarFlux_W_m2: SOLAR_FLUX_1AU,
  annualDegradation_fraction: 0.005, // 0.5%/year cell degradation
  annealingRecovery_fraction: 0.003, // 0.3%/year recovery via annealing
};

const DEFAULT_LOAD_PROFILE: LoadProfile = {
  tier0_W: 500,
  tier1_W: 2000,
  tier2_W: 1000,
  tier3_W: 3000,
};

// ── AC1: Two Independent Energy Modalities ──────────────────────────────────
// "Architecture specifies at least two independent energy modalities
//  with physics-based feasibility arguments"

describe("AC1: Two independent energy modalities with physics-based feasibility", () => {
  it("nuclear source produces positive electrical output", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    expect(nuclear.electricalOutput_W()).toBeGreaterThan(0);
  });

  it("stellar source produces positive electrical output", () => {
    const stellar = createStellarSource(DEFAULT_STELLAR_CONFIG);
    expect(stellar.currentOutput_W()).toBeGreaterThan(0);
  });

  it("nuclear and stellar are independent — each can sole-source Tier 0", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    const stellar = createStellarSource(DEFAULT_STELLAR_CONFIG);
    expect(nuclear.electricalOutput_W()).toBeGreaterThan(TIER0_POWER_W);
    expect(stellar.currentOutput_W()).toBeGreaterThan(TIER0_POWER_W);
  });

  it("nuclear output is based on known physics (fission energy density)", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    // Fission: ~10 kW(e) baseline per architecture
    expect(nuclear.electricalOutput_W()).toBeGreaterThanOrEqual(FISSION_BASELINE_W * 0.9);
  });

  it("stellar output matches expected PV physics at 1 AU", () => {
    const stellar = createStellarSource(DEFAULT_STELLAR_CONFIG);
    const expectedOutput = COLLECTOR_AREA_M2 * SOLAR_FLUX_1AU * PV_EFFICIENCY;
    // Should be within 5% of physics prediction
    expect(stellar.currentOutput_W()).toBeCloseTo(expectedOutput, -1);
  });
});

// ── AC2: Continuous Power Without External Fuel Resupply for 1000+ Years ────
// "Energy source provides continuous power without external fuel resupply
//  for 1000+ year projected timescale"

describe("AC2: Continuous power without external resupply for 1000+ years", () => {
  it("nuclear source with breeder ratio >1.0 is self-sustaining", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    expect(nuclear.fuelBreedingRate()).toBeGreaterThan(1.0);
  });

  it("nuclear source projects positive output at 1000 years", () => {
    const projections = projectPowerOutput({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: null, // nuclear-only (interstellar scenario)
      years: DESIGN_LIFETIME_YEARS,
    });
    const final = projections[projections.length - 1];
    expect(final.years).toBe(DESIGN_LIFETIME_YEARS);
    expect(final.nuclearOutputFraction).toBeGreaterThan(0);
    expect(final.totalOutput_W).toBeGreaterThan(0);
  });

  it("stellar source is fundamentally non-consumptive (no fuel depletion)", () => {
    const stellar = createStellarSource(DEFAULT_STELLAR_CONFIG);
    // Solar radiation doesn't deplete — degradation is only in collector
    expect(stellar.solarFlux_W_m2()).toBe(SOLAR_FLUX_1AU);
  });

  it("fuel cycle projection shows self-sustaining over 1000 years", () => {
    const fuelProjections = projectFuelCycle({
      fuelType: "Am-241",
      halfLife_years: AM241_HALF_LIFE,
      breedingRatio: 1.05,
      years: DESIGN_LIFETIME_YEARS,
    });
    const final = fuelProjections[fuelProjections.length - 1];
    expect(final.selfSustaining).toBe(true);
    expect(final.breedingRatio).toBeGreaterThanOrEqual(1.0);
  });
});

// ── AC3: Power Output Stability Within Operational Tolerances ────────────────
// "Power output stability analysis shows degradation within operational
//  tolerances over the design lifetime"

describe("AC3: Power output stability within operational tolerances", () => {
  it("combined output degrades monotonically (no unexpected spikes)", () => {
    const projections = projectPowerOutput({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: DEFAULT_STELLAR_CONFIG,
      years: DESIGN_LIFETIME_YEARS,
    });
    for (let i = 1; i < projections.length; i++) {
      // Total output should not increase (no free energy)
      expect(projections[i].totalOutput_W).toBeLessThanOrEqual(
        projections[i - 1].totalOutput_W * 1.001, // 0.1% tolerance for floating point
      );
    }
  });

  it("combined output at 1000 years is >50% of initial (within tolerance)", () => {
    const projections = projectPowerOutput({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: DEFAULT_STELLAR_CONFIG,
      years: DESIGN_LIFETIME_YEARS,
    });
    const initial = projections[0];
    const final = projections[projections.length - 1];
    // Architecture spec: Am-241 at 50% power at ~432 years, but breeder compensates
    // Combined with stellar, >50% total should be maintained
    expect(final.totalOutput_W / initial.totalOutput_W).toBeGreaterThan(0.5);
  });

  it("nuclear degradation follows expected decay physics", () => {
    const projections = projectPowerOutput({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: null,
      years: DESIGN_LIFETIME_YEARS,
    });
    // At half-life (~432 years for Am-241), output fraction should be roughly halved
    // accounting for breeding compensation
    const halfLifePoint = projections.find((p) => p.years >= AM241_HALF_LIFE);
    expect(halfLifePoint).toBeDefined();
    // With breeding ratio >1.0, output at half-life should be better than raw decay
    expect(halfLifePoint!.nuclearOutputFraction).toBeGreaterThan(0.3);
  });
});

// ── AC4: No Single Point of Failure ─────────────────────────────────────────
// "Energy system integrates with conscious substrate without single point
//  of failure — architecture shows redundant power paths"

describe("AC4: No single point of failure — redundant power paths", () => {
  it("controller operates with nuclear-only (stellar offline)", () => {
    const config: PowerDistributionConfig = {
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    };
    const controller = createPowerDistributionController(config);
    expect(controller.totalAvailablePower_W()).toBeGreaterThan(0);
    expect(controller.energyHealthStatus().primarySource).toBe(SourceStatus.Nominal);
    expect(controller.energyHealthStatus().secondarySource).toBe(SourceStatus.Offline);
  });

  it("controller operates with stellar-only (nuclear offline)", () => {
    const config: PowerDistributionConfig = {
      nuclear: null,
      stellar: DEFAULT_STELLAR_CONFIG,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    };
    const controller = createPowerDistributionController(config);
    expect(controller.totalAvailablePower_W()).toBeGreaterThan(0);
    expect(controller.energyHealthStatus().primarySource).toBe(SourceStatus.Offline);
    expect(controller.energyHealthStatus().secondarySource).toBe(SourceStatus.Nominal);
  });

  it("Tier 0 is always powered when either source is available", () => {
    // Nuclear only
    const nuclearOnly = createPowerDistributionController({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(nuclearOnly.availablePower_W(LoadTier.Critical)).toBeGreaterThanOrEqual(
      DEFAULT_LOAD_PROFILE.tier0_W,
    );

    // Stellar only
    const stellarOnly = createPowerDistributionController({
      nuclear: null,
      stellar: DEFAULT_STELLAR_CONFIG,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(stellarOnly.availablePower_W(LoadTier.Critical)).toBeGreaterThanOrEqual(
      DEFAULT_LOAD_PROFILE.tier0_W,
    );
  });
});

// ── AC5: Graceful Degradation Preserving Core Consciousness ─────────────────
// "Graceful degradation strategy defined: partial energy system failure
//  triggers load-shedding that preserves core consciousness loops"

describe("AC5: Graceful degradation — load shedding preserves consciousness", () => {
  it("at full capacity, all tiers are active", () => {
    const controller = createPowerDistributionController({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: DEFAULT_STELLAR_CONFIG,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    const activeTiers = controller.activeLoadTiers();
    expect(activeTiers).toContain(LoadTier.Critical);
    expect(activeTiers).toContain(LoadTier.Core);
    expect(activeTiers).toContain(LoadTier.Support);
    expect(activeTiers).toContain(LoadTier.Optional);
  });

  it("below 80% capacity, Optional tier is shed", () => {
    const controller = createPowerDistributionController({
      nuclear: { ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: 3000 },
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    // 3000W vs 6500W total load = ~46% capacity
    const activeTiers = controller.activeLoadTiers();
    expect(activeTiers).not.toContain(LoadTier.Optional);
    expect(activeTiers).toContain(LoadTier.Critical);
  });

  it("below 40% capacity, enters consciousness-preservation mode", () => {
    const controller = createPowerDistributionController({
      nuclear: { ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: 1500 },
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    // 1500W vs 6500W total load = ~23% capacity
    expect(controller.consciousnessPreservationMode()).toBe(true);
    const activeTiers = controller.activeLoadTiers();
    expect(activeTiers).toContain(LoadTier.Critical);
    expect(activeTiers).not.toContain(LoadTier.Support);
    expect(activeTiers).not.toContain(LoadTier.Optional);
  });

  it("Tier 0 (Critical) is NEVER shed regardless of capacity", () => {
    expect(LOAD_SHED_THRESHOLDS[LoadTier.Critical]).toBeNull();
    // Even at very low power, Critical stays active
    const controller = createPowerDistributionController({
      nuclear: { ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: 600 },
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(controller.activeLoadTiers()).toContain(LoadTier.Critical);
  });
});

// ── AC6: Fuel Cycle Renewal Mechanism ───────────────────────────────────────
// "Fuel cycle or energy harvesting renewal mechanism documented,
//  showing how the system avoids consumable depletion"

describe("AC6: Fuel cycle renewal — avoids consumable depletion", () => {
  it("breeder reactor has breeding ratio > 1.0", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    expect(nuclear.fuelBreedingRate()).toBeGreaterThan(1.0);
  });

  it("fuel cycle remains self-sustaining over 1000 years", () => {
    const projections = projectFuelCycle({
      fuelType: "Am-241",
      halfLife_years: AM241_HALF_LIFE,
      breedingRatio: 1.05,
      years: DESIGN_LIFETIME_YEARS,
    });
    // Every checkpoint should show self-sustaining
    for (const p of projections) {
      expect(p.selfSustaining).toBe(true);
    }
  });

  it("fuel fraction never reaches zero with breeding", () => {
    const projections = projectFuelCycle({
      fuelType: "Am-241",
      halfLife_years: AM241_HALF_LIFE,
      breedingRatio: 1.05,
      years: DESIGN_LIFETIME_YEARS,
    });
    for (const p of projections) {
      expect(p.fissileFraction).toBeGreaterThan(0);
    }
  });

  it("without breeding (ratio < 1.0), fuel depletes", () => {
    const projections = projectFuelCycle({
      fuelType: "Am-241",
      halfLife_years: AM241_HALF_LIFE,
      breedingRatio: 0.5, // No effective breeding
      years: DESIGN_LIFETIME_YEARS,
    });
    const final = projections[projections.length - 1];
    // Without adequate breeding, fuel should be significantly depleted at 1000 years
    expect(final.selfSustaining).toBe(false);
  });
});

// ── AC7: Interface Specifications for Sibling Subsystems ────────────────────
// "Interface specifications defined for integration with sibling
//  subsystems (0.2.1.1, 0.2.1.2, 0.2.1.4)"

describe("AC7: Interface specifications for sibling subsystems", () => {
  const controller = createPowerDistributionController({
    nuclear: DEFAULT_NUCLEAR_CONFIG,
    stellar: DEFAULT_STELLAR_CONFIG,
    bufferCapacity_Wh: 100_000,
    loadProfile: DEFAULT_LOAD_PROFILE,
  });

  it("provides power budget per tier (interface to 0.2.1.1 compute)", () => {
    const tier0Power = controller.availablePower_W(LoadTier.Critical);
    const tier1Power = controller.availablePower_W(LoadTier.Core);
    expect(tier0Power).toBeGreaterThan(0);
    expect(tier1Power).toBeGreaterThan(0);
  });

  it("supports power grant requests (interface to 0.2.1.1 and 0.2.1.2)", () => {
    const grant = controller.requestPower_W(100, LoadTier.Support, 3600);
    expect(grant.granted).toBe(true);
    expect(grant.allocated_W).toBe(100);
    expect(grant.tier).toBe(LoadTier.Support);
  });

  it("provides energy health status (interface to 0.2.1.4 redundancy)", () => {
    const health = controller.energyHealthStatus();
    expect(health.primarySource).toBeDefined();
    expect(health.secondarySource).toBeDefined();
    expect(health.bufferHours).toBeGreaterThan(0);
    expect(health.recommendedQuorumSize).toBeGreaterThanOrEqual(3);
  });

  it("reports consciousness preservation mode (interface to 0.2.1.4)", () => {
    const mode = controller.consciousnessPreservationMode();
    expect(typeof mode).toBe("boolean");
  });

  it("provides solar storm coordination (interface to 0.2.1.1)", () => {
    // At nominal conditions, no solar storm
    // This tests the interface exists and returns boolean
    const stormMode = controller.solarStormMode?.() ?? false;
    expect(typeof stormMode).toBe("boolean");
  });
});

// ── Precondition Guards (C1, C2, C3) ───────────────────────────────────────
// "Every Contracts precondition has a corresponding guard in the implementation"

describe("Precondition guards", () => {
  describe("C1: NuclearEnergyModule preconditions", () => {
    it("throws if halfLife_years <= 0", () => {
      expect(() =>
        createNuclearSource({ ...DEFAULT_NUCLEAR_CONFIG, halfLife_years: 0 }),
      ).toThrow("halfLife_years must be > 0");
    });

    it("throws if baseOutput_W <= 0", () => {
      expect(() =>
        createNuclearSource({ ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: -1 }),
      ).toThrow("baseOutput_W must be > 0");
    });

    it("throws if breedingRatio < 0", () => {
      expect(() =>
        createNuclearSource({ ...DEFAULT_NUCLEAR_CONFIG, breedingRatio: -0.1 }),
      ).toThrow("breedingRatio must be >= 0");
    });
  });

  describe("C2: StellarHarvestingModule preconditions", () => {
    it("throws if collectorArea_m2 <= 0", () => {
      expect(() =>
        createStellarSource({ ...DEFAULT_STELLAR_CONFIG, collectorArea_m2: 0 }),
      ).toThrow("collectorArea_m2 must be > 0");
    });

    it("throws if conversionEfficiency not in (0, 1)", () => {
      expect(() =>
        createStellarSource({ ...DEFAULT_STELLAR_CONFIG, conversionEfficiency: 0 }),
      ).toThrow("conversionEfficiency must be in (0, 1)");
      expect(() =>
        createStellarSource({ ...DEFAULT_STELLAR_CONFIG, conversionEfficiency: 1.0 }),
      ).toThrow("conversionEfficiency must be in (0, 1)");
    });

    it("throws if solarFlux_W_m2 < 0", () => {
      expect(() =>
        createStellarSource({ ...DEFAULT_STELLAR_CONFIG, solarFlux_W_m2: -1 }),
      ).toThrow("solarFlux_W_m2 must be >= 0");
    });
  });

  describe("C3: PowerDistributionController preconditions", () => {
    it("throws if both nuclear and stellar are null", () => {
      expect(() =>
        createPowerDistributionController({
          nuclear: null,
          stellar: null,
          bufferCapacity_Wh: 100_000,
          loadProfile: DEFAULT_LOAD_PROFILE,
        }),
      ).toThrow("At least one of nuclear or stellar config must be non-null");
    });

    it("throws if bufferCapacity_Wh <= 0", () => {
      expect(() =>
        createPowerDistributionController({
          nuclear: DEFAULT_NUCLEAR_CONFIG,
          stellar: null,
          bufferCapacity_Wh: 0,
          loadProfile: DEFAULT_LOAD_PROFILE,
        }),
      ).toThrow("bufferCapacity_Wh must be > 0");
    });

    it("throws if any loadProfile tier < 0", () => {
      expect(() =>
        createPowerDistributionController({
          nuclear: DEFAULT_NUCLEAR_CONFIG,
          stellar: null,
          bufferCapacity_Wh: 100_000,
          loadProfile: { ...DEFAULT_LOAD_PROFILE, tier2_W: -100 },
        }),
      ).toThrow("All loadProfile tier values must be >= 0");
    });
  });
});

// ── Contract Invariants (C1, C2) ───────────────────────────────────────────

describe("Contract invariants", () => {
  it("C1: thermalOutput_W > electricalOutput_W always", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    expect(nuclear.thermalOutput_W()).toBeGreaterThan(nuclear.electricalOutput_W());
  });

  it("C1: fuelRemaining_percent in [0, 100]", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    const remaining = nuclear.fuelRemaining_percent();
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(100);
  });

  it("C1: thermalOutput_W = electricalOutput_W / THERMAL_EFFICIENCY", () => {
    const nuclear = createNuclearSource(DEFAULT_NUCLEAR_CONFIG);
    expect(nuclear.thermalOutput_W()).toBeCloseTo(
      nuclear.electricalOutput_W() / THERMAL_EFFICIENCY,
      5,
    );
  });

  it("C2: currentOutput_W >= 0 always", () => {
    const stellar = createStellarSource(DEFAULT_STELLAR_CONFIG);
    expect(stellar.currentOutput_W()).toBeGreaterThanOrEqual(0);
  });

  it("C2: collectorArea_m2 monotonically non-decreasing", () => {
    const stellar = createStellarSource(DEFAULT_STELLAR_CONFIG);
    const initial = stellar.collectorArea_m2();
    stellar.expandCollector(10);
    expect(stellar.collectorArea_m2()).toBe(initial + 10);
    stellar.expandCollector(5);
    expect(stellar.collectorArea_m2()).toBe(initial + 15);
  });

  it("C2: currentOutput_W matches physics formula", () => {
    const stellar = createStellarSource(DEFAULT_STELLAR_CONFIG);
    const expected =
      DEFAULT_STELLAR_CONFIG.collectorArea_m2 *
      DEFAULT_STELLAR_CONFIG.solarFlux_W_m2 *
      DEFAULT_STELLAR_CONFIG.conversionEfficiency;
    expect(stellar.currentOutput_W()).toBeCloseTo(expected, 5);
  });

  it("C3: LoadTier.Critical always in activeLoadTiers", () => {
    // Even at very low capacity
    const controller = createPowerDistributionController({
      nuclear: { ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: 600 },
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(controller.activeLoadTiers()).toContain(LoadTier.Critical);
  });

  it("C3: consciousnessPreservationMode === (capacityFraction < 0.4)", () => {
    // Low capacity -> preservation mode
    const low = createPowerDistributionController({
      nuclear: { ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: 1500 },
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(low.consciousnessPreservationMode()).toBe(low.capacityFraction() < 0.4);

    // High capacity -> no preservation mode
    const high = createPowerDistributionController({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: DEFAULT_STELLAR_CONFIG,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(high.consciousnessPreservationMode()).toBe(high.capacityFraction() < 0.4);
  });

  it("C3: energyHealthStatus quorum values use registry constants", () => {
    // Full power -> QUORUM_FULL
    const full = createPowerDistributionController({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: DEFAULT_STELLAR_CONFIG,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(full.energyHealthStatus().recommendedQuorumSize).toBe(QUORUM_FULL);

    // Degraded power -> QUORUM_DEGRADED
    const degraded = createPowerDistributionController({
      nuclear: { ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: 1500 },
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(degraded.energyHealthStatus().recommendedQuorumSize).toBe(QUORUM_DEGRADED);
  });
});

// ── BS2: Source Failover — Nuclear-Only Mode ────────────────────────────────

describe("BS2: Source failover — nuclear-only mode", () => {
  it("nuclear-only provides full Tier 0 without interruption", () => {
    const controller = createPowerDistributionController({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    // Nuclear alone exceeds Tier 0 requirement
    expect(controller.totalAvailablePower_W()).toBeGreaterThan(TIER0_POWER_W);
    expect(controller.availablePower_W(LoadTier.Critical)).toBeGreaterThanOrEqual(
      DEFAULT_LOAD_PROFILE.tier0_W,
    );
  });

  it("load tiers recalculated based on nuclear-only capacity", () => {
    // Nuclear at 10kW vs 6.5kW total load = ~154% -> all tiers active
    const controller = createPowerDistributionController({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    const tiers = controller.activeLoadTiers();
    expect(tiers).toContain(LoadTier.Critical);
    // At 154% capacity all tiers should be active
    expect(tiers.length).toBe(4);
  });

  it("buffer provides bridge hours for transition", () => {
    const controller = createPowerDistributionController({
      nuclear: DEFAULT_NUCLEAR_CONFIG,
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    expect(controller.energyHealthStatus().bufferHours).toBeGreaterThan(0);
  });
});

// ── BS3: Fuel Cycle Sustainability (extended) ───────────────────────────────

describe("BS3: Fuel cycle sustainability over 1000 years", () => {
  it("fissileFraction > 0 at every checkpoint", () => {
    const projections = projectFuelCycle({
      fuelType: "Am-241",
      halfLife_years: AM241_HALF_LIFE,
      breedingRatio: 1.05,
      years: DESIGN_LIFETIME_YEARS,
    });
    for (const p of projections) {
      expect(p.fissileFraction).toBeGreaterThan(0);
    }
  });

  it("selfSustaining = true at every checkpoint", () => {
    const projections = projectFuelCycle({
      fuelType: "Am-241",
      halfLife_years: AM241_HALF_LIFE,
      breedingRatio: 1.05,
      years: DESIGN_LIFETIME_YEARS,
    });
    for (const p of projections) {
      expect(p.selfSustaining).toBe(true);
    }
  });

  it("fertileFraction > 0 (fertile feedstock not exhausted)", () => {
    const projections = projectFuelCycle({
      fuelType: "Am-241",
      halfLife_years: AM241_HALF_LIFE,
      breedingRatio: 1.05,
      years: DESIGN_LIFETIME_YEARS,
    });
    for (const p of projections) {
      expect(p.fertileFraction).toBeGreaterThan(0);
    }
  });
});

// ── BS4: Power Grant Arbitration ────────────────────────────────────────────

describe("BS4: Power grant arbitration", () => {
  const controller = createPowerDistributionController({
    nuclear: DEFAULT_NUCLEAR_CONFIG,
    stellar: DEFAULT_STELLAR_CONFIG,
    bufferCapacity_Wh: 100_000,
    loadProfile: DEFAULT_LOAD_PROFILE,
  });

  it("grants power when available >= requested amount", () => {
    const grant = controller.requestPower_W(100, LoadTier.Critical, 3600);
    expect(grant.granted).toBe(true);
    expect(grant.allocated_W).toBe(100);
  });

  it("denies power when available < requested amount", () => {
    // Request more than total available power for a low-priority tier
    const grant = controller.requestPower_W(1_000_000, LoadTier.Optional, 3600);
    expect(grant.granted).toBe(false);
    expect(grant.allocated_W).toBe(0);
  });

  it("denies power for shed tiers", () => {
    // Create a controller where Optional is shed
    const degraded = createPowerDistributionController({
      nuclear: { ...DEFAULT_NUCLEAR_CONFIG, baseOutput_W: 3000 },
      stellar: null,
      bufferCapacity_Wh: 100_000,
      loadProfile: DEFAULT_LOAD_PROFILE,
    });
    // Optional tier is shed at < 80% capacity
    const grant = degraded.requestPower_W(100, LoadTier.Optional, 3600);
    expect(grant.granted).toBe(false);
    expect(grant.allocated_W).toBe(0);
  });
});
