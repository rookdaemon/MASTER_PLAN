/**
 * Layer 1 — Physical Shielding
 *
 * Multi-layer shielding model implementing graded-Z design:
 *   Outer: High-Z (tungsten) for GCR attenuation
 *   Middle: Graded-Z stack to absorb secondary bremsstrahlung
 *   Inner: Hydrogen-rich (polyethylene) for neutron moderation
 *
 * Attenuation is modeled using exponential absorption with material-
 * and particle-dependent cross-sections. This is a first-order model;
 * full validation requires GEANT4/FLUKA Monte Carlo transport simulation.
 */

import {
  ParticleType,
  ShieldingModule,
  ShieldLayerSpec,
} from "./types.js";

// ── Material Database ───────────────────────────────────────────────────────

/** Attenuation coefficients in cm²/g for each particle type at reference energies */
type AttenuationCoefficients = Record<ParticleType, number>;

const MATERIAL_ATTENUATION: Record<string, AttenuationCoefficients> = {
  tungsten: {
    [ParticleType.Proton]: 0.20,
    [ParticleType.Electron]: 0.25,
    [ParticleType.HeavyIon]: 0.22,
    [ParticleType.Neutron]: 0.04,
    [ParticleType.Gamma]: 0.28,
  },
  aluminum: {
    [ParticleType.Proton]: 0.12,
    [ParticleType.Electron]: 0.18,
    [ParticleType.HeavyIon]: 0.14,
    [ParticleType.Neutron]: 0.06,
    [ParticleType.Gamma]: 0.15,
  },
  copper: {
    [ParticleType.Proton]: 0.15,
    [ParticleType.Electron]: 0.20,
    [ParticleType.HeavyIon]: 0.17,
    [ParticleType.Neutron]: 0.05,
    [ParticleType.Gamma]: 0.20,
  },
  polyethylene: {
    [ParticleType.Proton]: 0.08,
    [ParticleType.Electron]: 0.10,
    [ParticleType.HeavyIon]: 0.06,
    [ParticleType.Neutron]: 0.30, // Hydrogen-rich => excellent neutron moderator
    [ParticleType.Gamma]: 0.09,
  },
};

/**
 * Energy scaling factor: higher-energy particles penetrate more.
 * Attenuation coefficient scales as (E_ref / E)^0.3 for E > E_ref.
 */
const REFERENCE_ENERGY_MEV = 100;

function energyScaledCoefficient(baseCoeff: number, energy_MeV: number): number {
  if (energy_MeV <= REFERENCE_ENERGY_MEV) {
    return baseCoeff;
  }
  // Higher energy => lower effective attenuation
  return baseCoeff * Math.pow(REFERENCE_ENERGY_MEV / energy_MeV, 0.3);
}

// ── Default Graded-Z Shield Stack ───────────────────────────────────────────

/** Default 3-layer graded-Z shielding per ARCHITECTURE.md spec */
export const DEFAULT_SHIELD_LAYERS: ShieldLayerSpec[] = [
  {
    material: "tungsten",
    thickness_cm: 0.14,
    density_g_per_cm3: 19.3,
    radiationLength_g_per_cm2: 6.76,
  },
  {
    material: "aluminum",
    thickness_cm: 0.4,
    density_g_per_cm3: 2.7,
    radiationLength_g_per_cm2: 24.01,
  },
  {
    material: "polyethylene",
    thickness_cm: 0.8,
    density_g_per_cm3: 0.95,
    radiationLength_g_per_cm2: 44.77,
  },
];

// ── Shielding Implementation ────────────────────────────────────────────────

export class GradedZShield implements ShieldingModule {
  private layers: ShieldLayerSpec[];

  constructor(layers: ShieldLayerSpec[] = DEFAULT_SHIELD_LAYERS) {
    if (layers.length === 0) {
      throw new Error("Shield must have at least one layer");
    }
    this.layers = [...layers];
  }

  /**
   * Calculate combined attenuation factor across all shield layers.
   *
   * Uses Beer-Lambert law: I/I₀ = exp(-μ * ρ * x) per layer,
   * with energy-dependent scaling of μ.
   *
   * Returns the flux reduction ratio (0 < ratio ≤ 1), where lower = more shielding.
   */
  attenuationFactor(particleType: ParticleType, energy_MeV: number): number {
    if (energy_MeV <= 0) {
      throw new Error("Energy must be positive");
    }

    let totalOpticalDepth = 0;

    for (const layer of this.layers) {
      const materialCoeffs = MATERIAL_ATTENUATION[layer.material];
      if (!materialCoeffs) {
        throw new Error(`Unknown material: ${layer.material}`);
      }

      const baseCoeff = materialCoeffs[particleType];
      const scaledCoeff = energyScaledCoefficient(baseCoeff, energy_MeV);
      const arealDensity = layer.density_g_per_cm3 * layer.thickness_cm; // g/cm²

      totalOpticalDepth += scaledCoeff * arealDensity;
    }

    return Math.exp(-totalOpticalDepth);
  }

  /**
   * Total mass per unit area across all shield layers (kg/m²).
   * Constraint from ARCHITECTURE.md: must be ≤ 50 kg/m² for passive shielding.
   */
  massPerArea(): number {
    let total_g_per_cm2 = 0;
    for (const layer of this.layers) {
      total_g_per_cm2 += layer.density_g_per_cm3 * layer.thickness_cm;
    }
    // Convert g/cm² to kg/m²: multiply by 10
    return total_g_per_cm2 * 10;
  }

  /**
   * Estimated thermal load from radiation absorption (watts/m²).
   * Approximate: absorbed radiation energy converted to heat.
   * Uses reference GCR flux of 4 particles/cm²/s at 1 GeV.
   */
  thermalLoad(): number {
    const GCR_FLUX = 4; // particles/cm²/s
    const GCR_ENERGY_MEV = 1000; // 1 GeV reference
    const MEV_TO_JOULES = 1.602e-13;

    // Energy deposited = flux * energy * (1 - transmission) * area
    const transmission = this.attenuationFactor(ParticleType.Proton, GCR_ENERGY_MEV);
    const absorbedFraction = 1 - transmission;
    // per cm²
    const powerPerCm2 = GCR_FLUX * GCR_ENERGY_MEV * MEV_TO_JOULES * absorbedFraction;
    // Convert to per m² (1 m² = 10,000 cm²)
    return powerPerCm2 * 10000;
  }

  /** Check whether shield meets the ≤50 kg/m² mass budget constraint */
  meetsmassBudget(): boolean {
    return this.massPerArea() <= 50;
  }

  /** Get a copy of the layer specifications */
  getLayers(): ShieldLayerSpec[] {
    return [...this.layers];
  }
}
