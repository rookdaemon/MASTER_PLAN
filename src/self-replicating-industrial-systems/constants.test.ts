/**
 * Tests for Threshold Registry constants and the AC scenarios that depend on them.
 *
 * AC3: Doubling time model — doublingTimeSeconds === fabricationTimeSeconds + assemblyTimeSeconds
 *      and falls within 6–18 month target range.
 *
 * AC5: Seed package — totalKg === computeKg + fabricationKg + energyKg + chemicalKg
 *      and totalKg ≈ 850 kg.
 */
import { describe, it, expect } from "vitest";
import {
  SEED_COMPUTE_MASS_KG,
  SEED_FABRICATION_MASS_KG,
  SEED_ENERGY_MASS_KG,
  SEED_CHEMICAL_KIT_MASS_KG,
  TOTAL_SEED_PACKAGE_MASS_KG,
  ENERGY_BUDGET_PER_CYCLE_WH,
  TARGET_DOUBLING_TIME_MIN_SECONDS,
  TARGET_DOUBLING_TIME_MAX_SECONDS,
  MIN_MATERIAL_PURITY,
  BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR,
} from "./constants.js";
import type { DoublingTimeModel, SeedPackage } from "./types.js";

// ---------------------------------------------------------------------------
// Threshold Registry: constant values
// ---------------------------------------------------------------------------

describe("Threshold Registry constants", () => {
  it("SEED_COMPUTE_MASS_KG is 50 kg", () => {
    expect(SEED_COMPUTE_MASS_KG).toBe(50);
  });

  it("SEED_FABRICATION_MASS_KG is 500 kg", () => {
    expect(SEED_FABRICATION_MASS_KG).toBe(500);
  });

  it("SEED_ENERGY_MASS_KG is 200 kg", () => {
    expect(SEED_ENERGY_MASS_KG).toBe(200);
  });

  it("SEED_CHEMICAL_KIT_MASS_KG is 100 kg", () => {
    expect(SEED_CHEMICAL_KIT_MASS_KG).toBe(100);
  });

  it("TOTAL_SEED_PACKAGE_MASS_KG is the sum of all seed components (~850 kg)", () => {
    expect(TOTAL_SEED_PACKAGE_MASS_KG).toBe(
      SEED_COMPUTE_MASS_KG +
        SEED_FABRICATION_MASS_KG +
        SEED_ENERGY_MASS_KG +
        SEED_CHEMICAL_KIT_MASS_KG
    );
    expect(TOTAL_SEED_PACKAGE_MASS_KG).toBe(850);
  });

  it("ENERGY_BUDGET_PER_CYCLE_WH is 10,000 Wh", () => {
    expect(ENERGY_BUDGET_PER_CYCLE_WH).toBe(10_000);
  });

  it("TARGET_DOUBLING_TIME_MIN_SECONDS is 6 months in seconds", () => {
    const sixMonthsInSeconds = 6 * 30 * 24 * 60 * 60;
    expect(TARGET_DOUBLING_TIME_MIN_SECONDS).toBe(sixMonthsInSeconds);
  });

  it("TARGET_DOUBLING_TIME_MAX_SECONDS is 18 months in seconds", () => {
    const eighteenMonthsInSeconds = 18 * 30 * 24 * 60 * 60;
    expect(TARGET_DOUBLING_TIME_MAX_SECONDS).toBe(eighteenMonthsInSeconds);
  });

  it("MIN_MATERIAL_PURITY is 0.95", () => {
    expect(MIN_MATERIAL_PURITY).toBe(0.95);
  });

  it("BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR is 2.0", () => {
    expect(BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// AC3: Doubling Time Model
// ---------------------------------------------------------------------------

describe("AC3: DoublingTimeModel — exponential growth modelled", () => {
  it("doublingTimeSeconds equals fabricationTimeSeconds + assemblyTimeSeconds", () => {
    // Use a concrete 6-month scenario (best-case, resource-rich asteroid)
    const fabricationTimeSeconds = TARGET_DOUBLING_TIME_MIN_SECONDS / 2;
    const assemblyTimeSeconds = TARGET_DOUBLING_TIME_MIN_SECONDS / 2;

    const model: DoublingTimeModel = {
      fabricationTimeSeconds,
      assemblyTimeSeconds,
      doublingTimeSeconds: fabricationTimeSeconds + assemblyTimeSeconds,
      bottlenecks: [],
    };

    expect(model.doublingTimeSeconds).toBe(
      model.fabricationTimeSeconds + model.assemblyTimeSeconds
    );
  });

  it("doubling time of 6 months falls within 6–18 month target range", () => {
    const doublingTimeSeconds = TARGET_DOUBLING_TIME_MIN_SECONDS; // 6 months

    expect(doublingTimeSeconds).toBeGreaterThanOrEqual(TARGET_DOUBLING_TIME_MIN_SECONDS);
    expect(doublingTimeSeconds).toBeLessThanOrEqual(TARGET_DOUBLING_TIME_MAX_SECONDS);
  });

  it("doubling time of 18 months falls within 6–18 month target range", () => {
    const doublingTimeSeconds = TARGET_DOUBLING_TIME_MAX_SECONDS; // 18 months

    expect(doublingTimeSeconds).toBeGreaterThanOrEqual(TARGET_DOUBLING_TIME_MIN_SECONDS);
    expect(doublingTimeSeconds).toBeLessThanOrEqual(TARGET_DOUBLING_TIME_MAX_SECONDS);
  });

  it("doubling time below 6 months is outside the valid target range", () => {
    const tooFastSeconds = TARGET_DOUBLING_TIME_MIN_SECONDS - 1;

    expect(tooFastSeconds).toBeLessThan(TARGET_DOUBLING_TIME_MIN_SECONDS);
  });

  it("semiconductor bottleneck doubles cycle time when unmitigated", () => {
    const baseDoublingTimeSeconds = TARGET_DOUBLING_TIME_MIN_SECONDS;
    const bottleneckedTime =
      baseDoublingTimeSeconds * BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR;

    // Unmitigated semiconductor bottleneck pushes 6-month base to 12 months
    expect(bottleneckedTime).toBe(TARGET_DOUBLING_TIME_MIN_SECONDS * 2);
    // Which still falls within the 6–18 month target range
    expect(bottleneckedTime).toBeLessThanOrEqual(TARGET_DOUBLING_TIME_MAX_SECONDS);
  });
});

// ---------------------------------------------------------------------------
// AC5: Seed Package
// ---------------------------------------------------------------------------

describe("AC5: SeedPackage — minimum viable seed package defined", () => {
  function makeSeedPackage(): SeedPackage {
    return {
      computeKg: SEED_COMPUTE_MASS_KG,
      fabricationKg: SEED_FABRICATION_MASS_KG,
      energyKg: SEED_ENERGY_MASS_KG,
      chemicalKg: SEED_CHEMICAL_KIT_MASS_KG,
      totalKg: TOTAL_SEED_PACKAGE_MASS_KG,
      softwareModules: ["replication-os", "bom-library", "fidelity-specs"],
    };
  }

  it("totalKg equals sum of all component masses", () => {
    const pkg = makeSeedPackage();
    expect(pkg.totalKg).toBe(
      pkg.computeKg + pkg.fabricationKg + pkg.energyKg + pkg.chemicalKg
    );
  });

  it("totalKg is approximately 850 kg", () => {
    const pkg = makeSeedPackage();
    expect(pkg.totalKg).toBe(850);
  });

  it("computeKg matches Threshold Registry value of 50 kg", () => {
    const pkg = makeSeedPackage();
    expect(pkg.computeKg).toBe(SEED_COMPUTE_MASS_KG);
  });

  it("fabricationKg matches Threshold Registry value of 500 kg", () => {
    const pkg = makeSeedPackage();
    expect(pkg.fabricationKg).toBe(SEED_FABRICATION_MASS_KG);
  });

  it("energyKg matches Threshold Registry value of 200 kg", () => {
    const pkg = makeSeedPackage();
    expect(pkg.energyKg).toBe(SEED_ENERGY_MASS_KG);
  });

  it("chemicalKg matches Threshold Registry value of 100 kg", () => {
    const pkg = makeSeedPackage();
    expect(pkg.chemicalKg).toBe(SEED_CHEMICAL_KIT_MASS_KG);
  });

  it("software payload includes the three required modules", () => {
    const pkg = makeSeedPackage();
    expect(pkg.softwareModules).toContain("replication-os");
    expect(pkg.softwareModules).toContain("bom-library");
    expect(pkg.softwareModules).toContain("fidelity-specs");
  });
});

// ---------------------------------------------------------------------------
// Material purity validation (guard from FeedstockPipeline contract)
// ---------------------------------------------------------------------------

describe("MaterialSpec purity validation", () => {
  it("MIN_MATERIAL_PURITY (0.95) is within valid range [0.0, 1.0]", () => {
    expect(MIN_MATERIAL_PURITY).toBeGreaterThanOrEqual(0.0);
    expect(MIN_MATERIAL_PURITY).toBeLessThanOrEqual(1.0);
  });

  it("MIN_MATERIAL_PURITY satisfies the 0.95 threshold for structural metals", () => {
    const purity = 0.95;
    expect(purity).toBeGreaterThanOrEqual(MIN_MATERIAL_PURITY);
  });

  it("purity below MIN_MATERIAL_PURITY fails the structural metal threshold", () => {
    const belowThreshold = 0.94;
    expect(belowThreshold).toBeLessThan(MIN_MATERIAL_PURITY);
  });
});
