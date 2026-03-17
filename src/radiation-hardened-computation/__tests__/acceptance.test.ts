/**
 * Radiation-Hardened Computation — Acceptance Criteria Tests
 *
 * Maps directly to the 7 acceptance criteria in plan/0.2.1.1-radiation-hardened-computation.md.
 * Red/Green/Refactor: these tests define what "done" looks like.
 */

import { describe, it, expect } from "vitest";
import {
  ParticleType,
  AlertLevel,
  type RadiationAwareRuntime,
  type ConsciousProcessManager,
  type FluxMeasurement,
} from "../types.js";
import { GradedZShield, DEFAULT_SHIELD_LAYERS } from "../shielding.js";
import {
  SUBSTRATE_DATABASE,
  calculateSEU_BER,
  yearsToTIDLimit,
  selectSubstrate,
} from "../substrate.js";
import {
  simulateDegradation,
  meetsCDDCriterion,
  type DegradationModelParams,
} from "../degradation-model.js";

// ── Reference Constants ─────────────────────────────────────────────────────

/** GCR flux at solar minimum (interplanetary), particles/cm²/s */
const GCR_FLUX = 4;

/** Annual dose in interplanetary space (rad/year), from ARCHITECTURE.md */
const INTERPLANETARY_ANNUAL_DOSE_RAD = 100;

/** CME peak flux: ~10⁶ protons/cm²/s at >10 MeV */
const CME_PEAK_FLUX = 1e6;

// ── Acceptance Criterion 1: SEU Tolerance ───────────────────────────────────
// BER < 10⁻¹² per bit-hour under GCR flux

describe("AC1: SEU tolerance — BER < 1e-12 per bit-hour under GCR flux", () => {
  it("SiC substrate meets SEU BER target under GCR flux", () => {
    const sic = SUBSTRATE_DATABASE["SiC"];
    const ber = calculateSEU_BER(sic, GCR_FLUX);
    expect(ber).toBeLessThan(1e-12);
  });

  it("selected substrate meets SEU BER target", () => {
    const substrate = selectSubstrate(1_000_000, 1000, INTERPLANETARY_ANNUAL_DOSE_RAD);
    expect(substrate).not.toBeNull();
    const ber = calculateSEU_BER(substrate!, GCR_FLUX);
    expect(ber).toBeLessThan(1e-12);
  });
});

// ── Acceptance Criterion 2: TID Tolerance ───────────────────────────────────
// Substrate operates correctly after cumulative dose ≥ 1 Mrad

describe("AC2: TID tolerance — correct operation after ≥ 1 Mrad cumulative dose", () => {
  it("SiC substrate has TID tolerance ≥ 1 Mrad", () => {
    const sic = SUBSTRATE_DATABASE["SiC"];
    expect(sic.tidTolerance_rad).toBeGreaterThanOrEqual(1_000_000);
  });

  it("SiC substrate lasts ≥ 1000 years at interplanetary dose rates", () => {
    const sic = SUBSTRATE_DATABASE["SiC"];
    const years = yearsToTIDLimit(sic, INTERPLANETARY_ANNUAL_DOSE_RAD);
    expect(years).toBeGreaterThanOrEqual(1000);
  });

  it("substrate selection finds a candidate meeting 1 Mrad + 1000 year requirement", () => {
    const substrate = selectSubstrate(1_000_000, 1000, INTERPLANETARY_ANNUAL_DOSE_RAD);
    expect(substrate).not.toBeNull();
    expect(substrate!.tidTolerance_rad).toBeGreaterThanOrEqual(1_000_000);
  });
});

// ── Acceptance Criterion 3: CDD Tolerance ───────────────────────────────────
// < 5% performance degradation over 1000-year lifetime

describe("AC3: CDD tolerance — < 5% degradation over 1000 years", () => {
  const params: DegradationModelParams = {
    substrate: SUBSTRATE_DATABASE["SiC"],
    annualDose_rad: INTERPLANETARY_ANNUAL_DOSE_RAD,
    particleFlux_per_cm2_per_s: GCR_FLUX,
    operatingTemp_K: 300,
  };

  it("SiC meets < 5% degradation criterion over 1000 years", () => {
    expect(meetsCDDCriterion(params, 1000)).toBe(true);
  });

  it("degradation model produces results over 1000-year span", () => {
    const results = simulateDegradation(params, 1000);
    expect(results.length).toBeGreaterThan(0);
    const final = results[results.length - 1];
    expect(final.years).toBe(1000);
    expect(final.performanceFraction).toBeGreaterThan(0.95);
  });

  it("degradation is monotonically decreasing in performance", () => {
    const results = simulateDegradation(params, 1000);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].performanceFraction).toBeLessThanOrEqual(
        results[i - 1].performanceFraction,
      );
    }
  });
});

// ── Acceptance Criterion 4: Solar Event Survival ────────────────────────────
// Withstand CME peak flux ~10⁶ protons/cm²/s without data loss

describe("AC4: Solar event survival — withstand CME without data loss", () => {
  it("shielding attenuates CME proton flux", () => {
    const shield = new GradedZShield();
    // CME protons are typically 10-100 MeV
    const attenuation = shield.attenuationFactor(ParticleType.Proton, 50);
    // Shielding should reduce flux meaningfully (> 50% reduction)
    expect(attenuation).toBeLessThan(0.5);
  });

  it("shielded CME flux still allows substrate survival (BER remains manageable)", () => {
    const shield = new GradedZShield();
    const sic = SUBSTRATE_DATABASE["SiC"];
    // CME at 50 MeV, attenuated by shielding
    const attenuatedFlux = CME_PEAK_FLUX * shield.attenuationFactor(ParticleType.Proton, 50);
    // Even during CME, BER should remain finite (substrate doesn't fail catastrophically)
    const ber = calculateSEU_BER(sic, attenuatedFlux);
    // During storm, BER will be elevated but TMR voting should compensate
    // For now, verify the model produces a finite result
    expect(Number.isFinite(ber)).toBe(true);
    expect(ber).toBeGreaterThan(0);
  });

  // TODO: Layer 3 (RadiationAwareRuntime) needed for full CME survival validation
  // - enterSafeMode() during storm
  // - checkpoint all processes before storm
  // - burst scrubbing
  it.todo("runtime enters safe mode when flux exceeds storm threshold");
  it.todo("all active processes are checkpointed before entering safe mode");
  it.todo("burst scrubbing is activated during storm");
});

// ── Acceptance Criterion 5: Graceful Degradation ────────────────────────────
// Conscious process continuity when up to 30% of nodes fail

describe("AC5: Graceful degradation — continuity with 30% node failure", () => {
  // TODO: Layer 5 (ConsciousProcessManager) implementation required
  it.todo("process integrity maintained with 30% of nodes removed");
  it.todo("quorum consensus still reached with 30% node loss");
  it.todo("degradation level stays below 70% with 30% node failure");
  it.todo("live migration moves processes off failing nodes");
});

// ── Acceptance Criterion 6: Shielding Spec ──────────────────────────────────
// Validated shielding architecture, ≤ 50 kg/m² mass budget

describe("AC6: Shielding spec — validated architecture within mass budget", () => {
  it("default shield meets ≤ 50 kg/m² mass budget", () => {
    const shield = new GradedZShield();
    expect(shield.massPerArea()).toBeLessThanOrEqual(50);
    expect(shield.meetsmassBudget()).toBe(true);
  });

  it("default shield has 3 layers (graded-Z design)", () => {
    const shield = new GradedZShield();
    expect(shield.getLayers()).toHaveLength(3);
  });

  it("shield attenuates all particle types at reference energy", () => {
    const shield = new GradedZShield();
    for (const particleType of Object.values(ParticleType)) {
      const attenuation = shield.attenuationFactor(particleType, 100);
      // All attenuation factors should be between 0 and 1
      expect(attenuation).toBeGreaterThan(0);
      expect(attenuation).toBeLessThan(1);
    }
  });

  it("shield attenuates neutrons via polyethylene layer", () => {
    const shield = new GradedZShield();
    const neutronAttenuation = shield.attenuationFactor(ParticleType.Neutron, 100);
    // Hydrogen-rich polyethylene should provide meaningful neutron attenuation
    expect(neutronAttenuation).toBeLessThan(0.8);
  });

  it("thermal load is positive and finite", () => {
    const shield = new GradedZShield();
    const thermal = shield.thermalLoad();
    expect(thermal).toBeGreaterThan(0);
    expect(Number.isFinite(thermal)).toBe(true);
  });

  it("rejects empty layer stack", () => {
    expect(() => new GradedZShield([])).toThrow();
  });

  it("rejects non-positive energy", () => {
    const shield = new GradedZShield();
    expect(() => shield.attenuationFactor(ParticleType.Proton, 0)).toThrow();
    expect(() => shield.attenuationFactor(ParticleType.Proton, -1)).toThrow();
  });
});

// ── Acceptance Criterion 7: Long-Term Viability Model ───────────────────────
// Physics-based degradation model projecting 1000+ year viability

describe("AC7: Long-term viability model — physics-based 1000+ year projection", () => {
  const params: DegradationModelParams = {
    substrate: SUBSTRATE_DATABASE["SiC"],
    annualDose_rad: INTERPLANETARY_ANNUAL_DOSE_RAD,
    particleFlux_per_cm2_per_s: GCR_FLUX,
    operatingTemp_K: 300,
  };

  it("model produces results spanning 1000+ years", () => {
    const results = simulateDegradation(params, 2000);
    expect(results.length).toBeGreaterThan(0);
    expect(results[results.length - 1].years).toBe(2000);
  });

  it("model tracks cumulative TID over time", () => {
    const results = simulateDegradation(params, 1000);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].cumulativeTID_rad).toBeGreaterThan(results[i - 1].cumulativeTID_rad);
    }
  });

  it("model tracks displacement damage dose over time", () => {
    const results = simulateDegradation(params, 1000);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].displacementDamageDose).toBeGreaterThan(
        results[i - 1].displacementDamageDose,
      );
    }
  });

  it("higher temperature improves annealing (less degradation)", () => {
    const coldParams = { ...params, operatingTemp_K: 200 };
    const warmParams = { ...params, operatingTemp_K: 400 };

    const coldResults = simulateDegradation(coldParams, 1000);
    const warmResults = simulateDegradation(warmParams, 1000);

    const coldFinal = coldResults[coldResults.length - 1];
    const warmFinal = warmResults[warmResults.length - 1];

    // Warmer substrate should have better performance (more annealing)
    expect(warmFinal.performanceFraction).toBeGreaterThan(coldFinal.performanceFraction);
  });

  it("all substrate materials can be modeled", () => {
    for (const material of ["SiC", "GaN", "SOI", "Diamond"] as const) {
      const materialParams: DegradationModelParams = {
        ...params,
        substrate: SUBSTRATE_DATABASE[material],
      };
      const results = simulateDegradation(materialParams, 100);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].performanceFraction).toBeGreaterThan(0);
      expect(results[0].performanceFraction).toBeLessThanOrEqual(1);
    }
  });
});
