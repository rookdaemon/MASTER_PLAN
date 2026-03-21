/**
 * Material Processing Pipeline
 * Domain: 0.4.1.2 — Subsystem 3
 *
 * Converts raw asteroid ore into refined metals, volatiles, and energy feedstocks.
 */

import type {
  ResourceMap,
  ProcessingPipelineConfig,
  ProcessingOutput,
  ProcessedProduct,
  ProcessingStage,
  MaterialType,
  EnergySource,
} from './types.js';
import { SOLAR_ARRAY_POWER, H2_ENERGY_DENSITY } from './constants.js';

/**
 * Default C-type asteroid processing pipeline stages.
 */
export function defaultCTypePipeline(): ProcessingPipelineConfig {
  return {
    stages: [
      {
        name: 'Magnetic/Optical Sorting',
        type: 'sorting',
        energyCostPerKg: 0.05,
        yieldFraction: 0.95,
      },
      {
        name: 'Solar Thermal Smelting',
        type: 'thermal',
        energyCostPerKg: 0.8,
        yieldFraction: 0.92,
      },
      {
        name: 'Chemical Separation (Electrolysis + Carbonyl)',
        type: 'chemical',
        energyCostPerKg: 1.2,
        yieldFraction: 0.96,
      },
      {
        name: 'Cryogenic Volatile Capture',
        type: 'volatile_capture',
        energyCostPerKg: 0.6,
        yieldFraction: 0.98,
      },
      {
        name: 'Purity Verification',
        type: 'quality_assurance',
        energyCostPerKg: 0.02,
        yieldFraction: 0.99,
      },
    ],
    energySource: 'solar',
    processingRate: 1000, // kg/day
  };
}

/**
 * Calculate cumulative yield through all pipeline stages.
 */
export function cumulativeYield(stages: ProcessingStage[]): number {
  return stages.reduce((acc, s) => acc * s.yieldFraction, 1.0);
}

/**
 * Calculate total energy cost per kg through all stages.
 */
export function totalEnergyCostPerKg(stages: ProcessingStage[]): number {
  return stages.reduce((acc, s) => acc + s.energyCostPerKg, 0);
}

/**
 * Process raw ore from a mining operation through the refining pipeline.
 *
 * Takes raw ore mass and its composition, runs it through the configured
 * pipeline stages, and produces refined products.
 *
 * Energy balance: processing water via electrolysis produces H2+O2 which
 * can be burned in fuel cells, generating energy. If the energy produced
 * from hydrogen/oxygen exceeds processing costs, the balance is positive.
 *
 * @param oreComposition The composition of the raw ore
 * @param oreMassKg Total mass of ore to process
 * @param pipeline Processing pipeline configuration
 * @param depotId Destination depot for products
 */
export function processOre(
  oreComposition: ResourceMap,
  oreMassKg: number,
  pipeline: ProcessingPipelineConfig,
  depotId: string = 'depot-primary',
): ProcessingOutput {
  if (oreMassKg <= 0) {
    throw new RangeError('oreMassKg must be > 0');
  }
  if (pipeline.stages.length < 1) {
    throw new RangeError('pipeline must have at least 1 stage');
  }
  for (const stage of pipeline.stages) {
    if (stage.yieldFraction <= 0 || stage.yieldFraction > 1) {
      throw new RangeError(`stage "${stage.name}" yieldFraction must be in (0, 1]`);
    }
    if (stage.energyCostPerKg < 0) {
      throw new RangeError(`stage "${stage.name}" energyCostPerKg must be ≥ 0`);
    }
  }

  const yield_ = cumulativeYield(pipeline.stages);
  const energyPerKg = totalEnergyCostPerKg(pipeline.stages);

  const totalMass =
    oreComposition.metals.iron +
    oreComposition.metals.nickel +
    oreComposition.metals.platinum_group +
    oreComposition.volatiles.water_ice +
    oreComposition.volatiles.co2 +
    oreComposition.volatiles.ammonia +
    oreComposition.silicates +
    oreComposition.carbonaceous;

  // Scale composition fractions to actual ore mass
  const scale = oreMassKg / totalMass;

  const products: ProcessedProduct[] = [];

  // --- Metals ---
  const ironOut = oreComposition.metals.iron * scale * yield_;
  if (ironOut > 0) {
    products.push({
      material: 'iron',
      purity: 0.96,  // Post-carbonyl extraction purity
      massKg: ironOut,
      destinationDepot: depotId,
    });
  }

  const nickelOut = oreComposition.metals.nickel * scale * yield_;
  if (nickelOut > 0) {
    products.push({
      material: 'nickel',
      purity: 0.95,
      massKg: nickelOut,
      destinationDepot: depotId,
    });
  }

  const pgmOut = oreComposition.metals.platinum_group * scale * yield_;
  if (pgmOut > 0) {
    products.push({
      material: 'platinum_group',
      purity: 0.97,
      massKg: pgmOut,
      destinationDepot: depotId,
    });
  }

  // --- Volatiles ---
  // BS3: Half of water stored as water (≥99.9% purity), half electrolyzed
  const waterMass = oreComposition.volatiles.water_ice * scale * yield_;
  const waterForStorage = waterMass * 0.5;
  const waterForElectrolysis = waterMass * 0.5;

  // Electrolysis: Water → 88.9% O2 + 11.1% H2 by mass
  const loxMass = waterForElectrolysis * 0.889;
  const lh2Mass = waterForElectrolysis * 0.111;

  if (waterForStorage > 0) {
    products.push({
      material: 'water',
      purity: 0.999,
      massKg: waterForStorage,
      destinationDepot: depotId,
    });
  }

  if (loxMass > 0) {
    products.push({
      material: 'lox',
      purity: 0.995,
      massKg: loxMass,
      destinationDepot: depotId,
    });
  }

  if (lh2Mass > 0) {
    products.push({
      material: 'lh2',
      purity: 0.995,
      massKg: lh2Mass,
      destinationDepot: depotId,
    });
  }

  // Ammonia capture
  const ammoniaMass = oreComposition.volatiles.ammonia * scale * yield_;
  if (ammoniaMass > 0) {
    products.push({
      material: 'ammonia',
      purity: 0.98,
      massKg: ammoniaMass,
      destinationDepot: depotId,
    });
  }

  // Carbon feedstock from carbonaceous material
  const carbonOut = oreComposition.carbonaceous * scale * yield_;
  if (carbonOut > 0) {
    products.push({
      material: 'carbon_feedstock',
      purity: 0.90,
      massKg: carbonOut,
      destinationDepot: depotId,
    });
  }

  // Slag from silicates + processing losses
  const slagMass = oreComposition.silicates * scale + oreMassKg * (1 - yield_) * 0.5;
  if (slagMass > 0) {
    products.push({
      material: 'slag',
      purity: 0,
      massKg: slagMass,
      destinationDepot: depotId,
    });
  }

  // --- Energy Balance ---
  const totalEnergyConsumed = oreMassKg * energyPerKg;

  // Energy produced: H2+O2 fuel cells produce ~33.3 kWh/kg H2
  // All LH2 from electrolysis is available for fuel cell energy
  const energyFromH2 = lh2Mass * H2_ENERGY_DENSITY;

  // Solar energy collected during processing (150 kW array for industrial-scale ops)
  const processingDays = oreMassKg / pipeline.processingRate;
  const solarEnergy = pipeline.energySource === 'solar' ? SOLAR_ARRAY_POWER * 24 * processingDays : 0;

  const totalEnergyProduced = energyFromH2 + solarEnergy;
  const energyBalance = totalEnergyConsumed > 0 ? totalEnergyProduced / totalEnergyConsumed : 0;

  return {
    products,
    totalEnergyConsumed,
    totalEnergyProduced,
    energyBalance,
    wasteSlagMass: slagMass,
  };
}
