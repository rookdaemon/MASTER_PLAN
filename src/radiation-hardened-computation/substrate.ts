/**
 * Layer 2 — Hardened Semiconductor Substrate
 *
 * Provides substrate specifications and selection logic for radiation-tolerant
 * semiconductor materials. Primary selection: SiC (per ARCHITECTURE.md Key Decision #1).
 */

import { SubstrateMaterial, SubstrateSpec } from "./types.js";

// ── Reference Substrate Specifications ──────────────────────────────────────

/**
 * Substrate database with specifications from ARCHITECTURE.md Section 3.2.
 * Values represent current best estimates for radiation-hardened implementations.
 */
export const SUBSTRATE_DATABASE: Record<SubstrateMaterial, SubstrateSpec> = {
  SiC: {
    material: "SiC",
    featureSize_nm: 180,
    tidTolerance_rad: 10_000_000,       // >10 Mrad
    seuCrossSection_cm2: 1e-14,
    operatingTempRange_K: [77, 873],     // -196°C to 600°C
    mtbf_hours: 1_000_000,
  },
  GaN: {
    material: "GaN",
    featureSize_nm: 250,
    tidTolerance_rad: 5_000_000,        // ~5 Mrad
    seuCrossSection_cm2: 5e-15,
    operatingTempRange_K: [77, 573],
    mtbf_hours: 800_000,
  },
  SOI: {
    material: "SOI",
    featureSize_nm: 65,
    tidTolerance_rad: 1_000_000,        // ~1 Mrad
    seuCrossSection_cm2: 1e-12,
    operatingTempRange_K: [173, 398],
    mtbf_hours: 500_000,
  },
  Diamond: {
    material: "Diamond",
    featureSize_nm: 500,
    tidTolerance_rad: 100_000_000,      // >100 Mrad (theoretical)
    seuCrossSection_cm2: 1e-16,
    operatingTempRange_K: [4, 1273],     // extreme range
    mtbf_hours: 10_000_000,             // theoretical
  },
};

// ── Substrate Evaluation ────────────────────────────────────────────────────

/**
 * Default shielding attenuation for GCR protons at ~1 GeV through graded-Z shield.
 * Derived from DEFAULT_SHIELD_LAYERS attenuation at 1000 MeV.
 */
const DEFAULT_GCR_SHIELDING_ATTENUATION = 0.69;

export interface SEU_BER_Options {
  /** Flux reduction ratio from shielding (0-1). Defaults to graded-Z shield at GCR energies. */
  shieldingAttenuation?: number;
  /** Whether TMR voting is active. Defaults to true (per ARCHITECTURE.md Key Decision #2). */
  tmrEnabled?: boolean;
}

/**
 * Calculate expected bit-error rate from SEUs given substrate, flux, and mitigation.
 *
 * Models the complete hardened system:
 * 1. Shielding attenuates incident flux (Layer 1)
 * 2. Raw BER = SEU cross-section × shielded flux (Layer 2)
 * 3. TMR voting reduces effective BER: P(fail) ≈ 3p² for small p (Layer 4)
 *
 * Units: errors per bit per hour
 * Acceptance criterion: BER < 10⁻¹² per bit-hour
 */
export function calculateSEU_BER(
  substrate: SubstrateSpec,
  fluxPerCm2PerSec: number,
  options?: SEU_BER_Options,
): number {
  if (fluxPerCm2PerSec < 0) {
    throw new Error("fluxPerCm2PerSec must be non-negative");
  }
  if (substrate.seuCrossSection_cm2 <= 0) {
    throw new Error("substrate.seuCrossSection_cm2 must be > 0");
  }

  const attenuation = options?.shieldingAttenuation ?? DEFAULT_GCR_SHIELDING_ATTENUATION;
  const effectiveFlux = fluxPerCm2PerSec * attenuation;

  // Cross-section × flux gives upsets per device per second; convert to per-hour
  let ber = substrate.seuCrossSection_cm2 * effectiveFlux * 3600;

  // TMR: majority voting across 3 lanes. Effective error rate ≈ 3p² for small p.
  if (options?.tmrEnabled !== false) {
    ber = 3 * ber * ber;
  }

  return ber;
}

/**
 * Estimate years until TID limit is reached, given annual dose rate.
 *
 * @param substrate - Substrate specification
 * @param annualDose_rad - Annual radiation dose in rad (after shielding)
 * @returns Years until substrate reaches TID tolerance limit
 */
export function yearsToTIDLimit(
  substrate: SubstrateSpec,
  annualDose_rad: number,
): number {
  if (annualDose_rad <= 0) {
    return Infinity;
  }
  return substrate.tidTolerance_rad / annualDose_rad;
}

/**
 * Select the best substrate material for given mission requirements.
 * Ranks by: TID tolerance first, then MTBF, then SEU cross-section (lower is better).
 */
export function selectSubstrate(
  minTID_rad: number,
  minLifetime_years: number,
  annualDose_rad: number,
): SubstrateSpec | null {
  const candidates = Object.values(SUBSTRATE_DATABASE)
    .filter((s) => s.tidTolerance_rad >= minTID_rad)
    .filter((s) => yearsToTIDLimit(s, annualDose_rad) >= minLifetime_years)
    .sort((a, b) => {
      // Primary: TID tolerance (higher is better, but prefer practical maturity)
      // Use MTBF as proxy for maturity
      if (a.mtbf_hours !== b.mtbf_hours) {
        return b.mtbf_hours - a.mtbf_hours;
      }
      // Secondary: SEU cross-section (lower is better)
      return a.seuCrossSection_cm2 - b.seuCrossSection_cm2;
    });

  return candidates[0] ?? null;
}
