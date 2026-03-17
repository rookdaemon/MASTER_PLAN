/**
 * Long-Term Degradation Model
 *
 * Physics-based model combining TID accumulation and cumulative displacement
 * damage (CDD) to project substrate viability over 1000+ year timescales.
 *
 * Uses simplified Arrhenius + NIEL (Non-Ionizing Energy Loss) models.
 * Full validation requires comparison against accelerated aging data.
 */

import { SubstrateSpec, DegradationModelResult } from "./types.js";

// ── NIEL Displacement Damage Constants ──────────────────────────────────────

/**
 * NIEL coefficients (MeV·cm²/g) for displacement damage in different substrates.
 * These determine how much lattice damage occurs per unit particle fluence.
 */
const NIEL_COEFFICIENTS: Record<string, number> = {
  SiC: 2.0e-3,     // Lower NIEL than Si due to stronger bonds
  GaN: 2.5e-3,
  SOI: 5.0e-3,     // Silicon baseline
  Diamond: 0.5e-3, // Extremely radiation-hard lattice
};

// ── Degradation Model ───────────────────────────────────────────────────────

export interface DegradationModelParams {
  substrate: SubstrateSpec;
  /** Annual radiation dose in rad (after shielding) */
  annualDose_rad: number;
  /** Particle flux in particles/cm²/s (for displacement damage) */
  particleFlux_per_cm2_per_s: number;
  /** Operating temperature in Kelvin (affects annealing rate) */
  operatingTemp_K: number;
}

/**
 * Calculate performance degradation over time.
 *
 * Combines two degradation mechanisms:
 * 1. TID: Gradual threshold voltage shift → timing degradation
 * 2. CDD: Lattice displacement → carrier lifetime reduction
 *
 * Includes thermal annealing recovery factor (higher temp = more self-healing).
 *
 * @param params - Model parameters
 * @param years - Number of years to simulate
 * @param stepSize_years - Time step for the simulation (default: 10 years)
 * @returns Array of degradation results at each time step
 */
export function simulateDegradation(
  params: DegradationModelParams,
  years: number,
  stepSize_years: number = 10,
): DegradationModelResult[] {
  const { substrate, annualDose_rad, particleFlux_per_cm2_per_s, operatingTemp_K } = params;
  const results: DegradationModelResult[] = [];

  const nielCoeff = NIEL_COEFFICIENTS[substrate.material] ?? NIEL_COEFFICIENTS["SOI"];

  // Annealing factor: higher temperature allows partial recovery of displacement damage
  // Arrhenius-based: annealingRate = A * exp(-Ea / (k * T))
  const ACTIVATION_ENERGY_EV = 0.4; // Typical for Si-based defect annealing
  const BOLTZMANN_EV_PER_K = 8.617e-5;
  const annealingFactor = Math.exp(-ACTIVATION_ENERGY_EV / (BOLTZMANN_EV_PER_K * operatingTemp_K));
  // Normalize: at 300K, annealingFactor ≈ 1 (reference)
  const annealingNormalized = annealingFactor / Math.exp(-ACTIVATION_ENERGY_EV / (BOLTZMANN_EV_PER_K * 300));

  for (let t = stepSize_years; t <= years; t += stepSize_years) {
    const cumulativeTID = annualDose_rad * t;

    // TID degradation: logarithmic (threshold shifts saturate)
    const tidDegradation = Math.min(
      1.0,
      0.05 * Math.log10(1 + cumulativeTID / (substrate.tidTolerance_rad * 0.1)),
    );

    // Displacement damage: linear accumulation with annealing recovery
    const fluence = particleFlux_per_cm2_per_s * t * 365.25 * 24 * 3600; // total fluence
    const displacementDose = nielCoeff * fluence;
    const cddDegradation = Math.min(
      1.0,
      displacementDose * 1e-10 * (1 - 0.3 * annealingNormalized), // 30% recovery at 300K
    );

    // Combined degradation (multiplicative independence assumption)
    const combinedDegradation = 1 - (1 - tidDegradation) * (1 - cddDegradation);
    const performanceFraction = 1 - combinedDegradation;

    results.push({
      years: t,
      performanceFraction,
      cumulativeTID_rad: cumulativeTID,
      displacementDamageDose: displacementDose,
    });
  }

  return results;
}

/**
 * Check whether a substrate meets the <5% degradation over 1000 years criterion.
 */
export function meetsCDDCriterion(
  params: DegradationModelParams,
  targetYears: number = 1000,
): boolean {
  const results = simulateDegradation(params, targetYears);
  const finalResult = results[results.length - 1];
  if (!finalResult) return false;
  // <5% degradation means performanceFraction > 0.95
  return finalResult.performanceFraction > 0.95;
}
