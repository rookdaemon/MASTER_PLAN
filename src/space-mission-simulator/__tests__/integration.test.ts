/**
 * Space Mission Feasibility Simulator — Integration Tests
 *
 * Cross-module scenarios that exercise all four subsystems together:
 *   1. interstellar-propulsion
 *   2. colony-seeding
 *   3. energy
 *   4. radiation-hardened-computation
 *
 * Each scenario represents a realistic mission profile and verifies that
 * the simulator produces the correct overall verdict and per-module findings.
 */

import { describe, it, expect } from "vitest";
import { simulate } from "../feasibility-simulator.js";
import { FeasibilityVerdict } from "../types.js";
import type { MissionProfile } from "../types.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Build a fully nominal mission profile (all constraints satisfied). */
function nominalProfile(overrides: Partial<MissionProfile> = {}): MissionProfile {
  return {
    name: "Alpha Centauri Baseline",
    probe: {
      mass_kg: 5_000,
      diameter_m: 20,
      structuralIntegrityRating_g: 15,
    },
    propulsion: {
      sailDiameter_m: 200,
      laserArrayPower_W: 50e9,
      targetCruiseVelocity_c: 0.05,
      magsailLoopDiameter_km: 100,
    },
    destination: {
      distance_ly: 4.37,
      solarPower_w: 2e9,
      meetsMinimumEnergyThreshold: true,
      structuralMetals_kg: 5e18,
      semiconductors_kg: 1e12,
      particleFlux_per_cm2_s: 4,
      withinHardenedTolerance: true,
      orbitalStability_Myr: 500,
      availableElements: ["Si", "Al", "Y", "Ba", "Cu", "O", "H"],
    },
    originEnergy: {
      availableLaserPower_W: 60e9,
      failSafeReservesActive: true,
    },
    ismConditions: { density_protons_per_cm3: 1.0 },
    radiation: {
      annualDose_rad_per_year: 100,
      peakFlux_particles_per_cm2_s: 4,
    },
    ...overrides,
  };
}

// ── Scenario 1: Alpha Centauri — nominal feasible mission ─────────────────────

describe("Scenario 1 — Alpha Centauri nominal mission", () => {
  it("returns FEASIBLE verdict for a well-configured baseline mission", () => {
    const report = simulate(nominalProfile());

    expect(report.verdict).toBe(FeasibilityVerdict.FEASIBLE);
    expect(report.blockers).toHaveLength(0);
    expect(report.missionName).toBe("Alpha Centauri Baseline");
  });

  it("propulsion envelope is valid and transit is within 200-year limit", () => {
    const report = simulate(nominalProfile());

    expect(report.propulsion.envelopeValid).toBe(true);
    expect(report.propulsion.envelopeErrors).toHaveLength(0);
    expect(report.propulsion.transitWithinLimit).toBe(true);
    expect(report.propulsion.transitDuration_years).toBeLessThan(200);
  });

  it("cruise velocity is within 0.05–0.10 c", () => {
    const report = simulate(nominalProfile());

    expect(report.propulsion.achievedCruiseVelocity_c).toBeGreaterThanOrEqual(0.05);
    expect(report.propulsion.achievedCruiseVelocity_c).toBeLessThanOrEqual(0.10);
  });

  it("colony viability decision is GO", () => {
    const report = simulate(nominalProfile());

    expect(report.colony.decision).toBe("GO");
    expect(report.colony.viabilityScore).toBe(1.0);
    expect(report.colony.meetsEnergyRequirement).toBe(true);
    expect(report.colony.meetsResourceRequirement).toBe(true);
    expect(report.colony.withinRadiationTolerance).toBe(true);
    expect(report.colony.hasStableOrbit).toBe(true);
  });

  it("origin energy budget is sufficient for the laser array", () => {
    const report = simulate(nominalProfile());

    expect(report.energy.laserArrayAffordable).toBe(true);
    expect(report.energy.failSafeReservesMaintained).toBe(true);
    expect(report.energy.originPowerBalance_W).toBeGreaterThan(0);
  });

  it("SiC substrate survives the transit within TID tolerance", () => {
    const report = simulate(nominalProfile());

    expect(report.radiation.withinSubstrateTolerance).toBe(true);
    expect(report.radiation.estimatedPerformanceFraction).toBeGreaterThan(0.9);
    expect(report.radiation.tmrSufficient).toBe(true);
  });

  it("no nuclear backup is required at nominal ISM density (0.1 protons/cm³)", () => {
    const report = simulate(nominalProfile());

    expect(report.propulsion.nuclearBackupRequired).toBe(false);
  });
});

// ── Scenario 2: Oversized probe — envelope violation → INFEASIBLE ─────────────

describe("Scenario 2 — oversized probe payload", () => {
  it("returns INFEASIBLE when probe mass exceeds 10,000 kg", () => {
    const report = simulate(
      nominalProfile({
        probe: { mass_kg: 15_000, diameter_m: 20, structuralIntegrityRating_g: 15 },
      }),
    );

    expect(report.verdict).toBe(FeasibilityVerdict.INFEASIBLE);
    expect(report.propulsion.envelopeValid).toBe(false);
    expect(report.blockers.some((b) => b.includes("[Propulsion]"))).toBe(true);
  });

  it("envelope errors list the specific violation", () => {
    const report = simulate(
      nominalProfile({
        probe: { mass_kg: 15_000, diameter_m: 20, structuralIntegrityRating_g: 15 },
      }),
    );

    expect(report.propulsion.envelopeErrors.length).toBeGreaterThan(0);
    expect(report.propulsion.envelopeErrors[0]).toMatch(/15000/);
  });
});

// ── Scenario 3: Insufficient origin energy → INFEASIBLE ──────────────────────

describe("Scenario 3 — origin energy budget too small for laser array", () => {
  it("returns INFEASIBLE when available laser power < required", () => {
    const report = simulate(
      nominalProfile({
        originEnergy: {
          availableLaserPower_W: 10e9, // 10 GW — less than the 50 GW laser array
          failSafeReservesActive: true,
        },
      }),
    );

    expect(report.verdict).toBe(FeasibilityVerdict.INFEASIBLE);
    expect(report.energy.laserArrayAffordable).toBe(false);
    expect(report.energy.originPowerBalance_W).toBeLessThan(0);
    expect(report.blockers.some((b) => b.includes("[Energy]"))).toBe(true);
  });
});

// ── Scenario 4: Resource-poor destination → ABORT → INFEASIBLE ───────────────

describe("Scenario 4 — resource-poor destination system", () => {
  it("colony decision is ABORT when structural metals are below minimum", () => {
    const report = simulate(
      nominalProfile({
        destination: {
          distance_ly: 4.37,
          solarPower_w: 2e9,
          meetsMinimumEnergyThreshold: true,
          structuralMetals_kg: 1e10, // < 1e18 minimum
          semiconductors_kg: 1e12,
          particleFlux_per_cm2_s: 4,
          withinHardenedTolerance: true,
          orbitalStability_Myr: 500,
          availableElements: ["Si", "Al", "Y", "Ba", "Cu", "O", "H"],
        },
      }),
    );

    expect(report.colony.decision).toBe("ABORT");
    expect(report.colony.meetsResourceRequirement).toBe(false);
    expect(report.verdict).toBe(FeasibilityVerdict.INFEASIBLE);
    expect(report.blockers.some((b) => b.includes("[Colony]"))).toBe(true);
  });
});

// ── Scenario 5: Low ISM density → nuclear backup warning ─────────────────────

describe("Scenario 5 — low ISM density requires nuclear backup", () => {
  it("returns MARGINAL with nuclear backup warning when ISM < 0.01 protons/cm³", () => {
    const report = simulate(
      nominalProfile({
        ismConditions: { density_protons_per_cm3: 0.005 },
      }),
    );

    expect(report.propulsion.nuclearBackupRequired).toBe(true);
    expect(report.warnings.some((w) => w.includes("nuclear backup"))).toBe(true);
    // Should still be MARGINAL (not infeasible) since nuclear backup is available
    expect(report.verdict).not.toBe(FeasibilityVerdict.INFEASIBLE);
  });
});

// ── Scenario 6: Marginal destination energy → DORMANCY warning ───────────────

describe("Scenario 6 — marginal destination energy (DORMANCY decision)", () => {
  it("emits a DORMANCY warning but is not a hard blocker", () => {
    const report = simulate(
      nominalProfile({
        destination: {
          distance_ly: 4.37,
          solarPower_w: 5e8, // < 1 GW — below minimum
          meetsMinimumEnergyThreshold: false,
          structuralMetals_kg: 5e18,
          semiconductors_kg: 1e12,
          particleFlux_per_cm2_s: 4,
          withinHardenedTolerance: true,
          orbitalStability_Myr: 500,
          availableElements: ["Si", "Al", "Y", "Ba", "Cu", "O", "H"],
        },
      }),
    );

    expect(report.colony.decision).toBe("DORMANCY");
    expect(report.colony.meetsEnergyRequirement).toBe(false);
    // DORMANCY is a warning, not a blocker
    expect(report.warnings.some((w) => w.includes("DORMANCY"))).toBe(true);
    expect(report.blockers.some((b) => b.includes("DORMANCY"))).toBe(false);
  });
});

// ── Scenario 7: Far target (10 ly) — transit duration check ─────────────────

describe("Scenario 7 — distant target at maximum cruise velocity", () => {
  it("is feasible for a 10 ly target at 0.10 c cruise velocity", () => {
    const report = simulate(
      nominalProfile({
        propulsion: {
          sailDiameter_m: 200,
          laserArrayPower_W: 100e9,
          targetCruiseVelocity_c: 0.10,
          magsailLoopDiameter_km: 200,
        },
        originEnergy: {
          availableLaserPower_W: 110e9,
          failSafeReservesActive: true,
        },
        destination: {
          distance_ly: 10,
          solarPower_w: 2e9,
          meetsMinimumEnergyThreshold: true,
          structuralMetals_kg: 5e18,
          semiconductors_kg: 1e12,
          particleFlux_per_cm2_s: 4,
          withinHardenedTolerance: true,
          orbitalStability_Myr: 500,
          availableElements: ["Si", "Al", "Y", "Ba", "Cu", "O", "H"],
        },
      }),
    );

    expect(report.propulsion.transitWithinLimit).toBe(true);
    expect(report.propulsion.transitDuration_years).toBeLessThan(200);
  });
});

// ── Scenario 8: Missing replication elements → warning ───────────────────────

describe("Scenario 8 — destination missing replication elements", () => {
  it("emits a replication warning when elements are incomplete", () => {
    const report = simulate(
      nominalProfile({
        destination: {
          distance_ly: 4.37,
          solarPower_w: 2e9,
          meetsMinimumEnergyThreshold: true,
          structuralMetals_kg: 5e18,
          semiconductors_kg: 1e12,
          particleFlux_per_cm2_s: 4,
          withinHardenedTolerance: true,
          orbitalStability_Myr: 500,
          availableElements: ["Si", "Al"], // Missing Y, Ba, Cu, O, H
        },
      }),
    );

    expect(report.propulsion.replicationFeasible).toBe(false);
    expect(report.warnings.some((w) => w.includes("replication"))).toBe(true);
  });
});

// ── Scenario 9: Fail-safe reserve inactive → warning ─────────────────────────

describe("Scenario 9 — fail-safe reserves inactive during launch", () => {
  it("emits a fail-safe warning when reserves are not active", () => {
    const report = simulate(
      nominalProfile({
        originEnergy: {
          availableLaserPower_W: 60e9,
          failSafeReservesActive: false,
        },
      }),
    );

    expect(report.energy.failSafeReservesMaintained).toBe(false);
    expect(report.warnings.some((w) => w.includes("Fail-safe"))).toBe(true);
  });
});

// ── Scenario 10: Report structure completeness ────────────────────────────────

describe("Scenario 10 — report structure completeness", () => {
  it("returns all required top-level fields", () => {
    const report = simulate(nominalProfile());

    expect(report).toHaveProperty("missionName");
    expect(report).toHaveProperty("verdict");
    expect(report).toHaveProperty("blockers");
    expect(report).toHaveProperty("warnings");
    expect(report).toHaveProperty("propulsion");
    expect(report).toHaveProperty("colony");
    expect(report).toHaveProperty("energy");
    expect(report).toHaveProperty("radiation");
  });

  it("propulsion sub-report has all required fields", () => {
    const { propulsion } = simulate(nominalProfile());

    expect(propulsion).toHaveProperty("envelopeValid");
    expect(propulsion).toHaveProperty("envelopeErrors");
    expect(propulsion).toHaveProperty("achievedCruiseVelocity_c");
    expect(propulsion).toHaveProperty("transitDuration_years");
    expect(propulsion).toHaveProperty("maxDecelerationG");
    expect(propulsion).toHaveProperty("transitWithinLimit");
    expect(propulsion).toHaveProperty("nuclearBackupRequired");
    expect(propulsion).toHaveProperty("replicationFeasible");
  });

  it("colony sub-report has all required fields", () => {
    const { colony } = simulate(nominalProfile());

    expect(colony).toHaveProperty("meetsEnergyRequirement");
    expect(colony).toHaveProperty("meetsResourceRequirement");
    expect(colony).toHaveProperty("withinRadiationTolerance");
    expect(colony).toHaveProperty("hasStableOrbit");
    expect(colony).toHaveProperty("decision");
    expect(colony).toHaveProperty("viabilityScore");
  });

  it("energy sub-report has all required fields", () => {
    const { energy } = simulate(nominalProfile());

    expect(energy).toHaveProperty("laserArrayAffordable");
    expect(energy).toHaveProperty("failSafeReservesMaintained");
    expect(energy).toHaveProperty("originPowerBalance_W");
  });

  it("radiation sub-report has all required fields", () => {
    const { radiation } = simulate(nominalProfile());

    expect(radiation).toHaveProperty("estimatedTransitTID_rad");
    expect(radiation).toHaveProperty("withinSubstrateTolerance");
    expect(radiation).toHaveProperty("estimatedPerformanceFraction");
    expect(radiation).toHaveProperty("tmrSufficient");
  });
});
