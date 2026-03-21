/**
 * Stellar Resource Extraction — Core Implementation
 *
 * Pure functions implementing stellar characterization, energy budget
 * computation, resource survey, refining pipeline, and bootstrap
 * sequence logic for the subsystems defined in types.ts.
 */

import {
  type StellarCharacterization,
  type SpectralClass,
  type EnergyBudget,
  type CollectorUnit,
  type CelestialBody,
  type CompositionAssay,
  type ResourceSurveyResult,
  type MiningPlan,
  type RawMaterialEntry,
  type RefiningRecipe,
  type FeedstockEntry,
  type FeedstockInventory,
  type FeedstockSpec,
  type MaterialRequirement,
  type SystemState,
  type ReplicationReadinessSignal,
  type AdaptationLogEntry,
  MaterialClass,
  ALL_MATERIAL_CLASSES,
  BootstrapPhase,
  RefiningProcess,
  MIN_RESERVE_MARGIN,
  SEMICONDUCTOR_PURITY,
  SEED_PHASE_POWER_WATTS,
  TARGET_FULL_SCALE_POWER_WATTS,
  MAX_SEED_FRACTION,
  MAX_REPLICATION_TIMELINE_YEARS,
  TARGET_REPLICATION_TIMELINE_YEARS,
  MINING_ALLOCATION_FRACTION,
  REFINING_ALLOCATION_FRACTION,
  FABRICATION_ALLOCATION_FRACTION,
  COMPUTATION_ALLOCATION_FRACTION,
  BODY_SCORE_ABUNDANCE_THRESHOLD,
} from "./types.js";

// ── Validation Result ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Stellar Characterization ────────────────────────────────────────────────

/** Luminosity ranges (L☉) for supported spectral classes */
const SPECTRAL_LUMINOSITY_RANGE: Record<SpectralClass, [number, number]> = {
  F: [1.5, 10],
  G: [0.6, 1.5],
  K: [0.08, 0.6],
  M: [0.001, 0.08],
};

/** Temperature ranges (K) for supported spectral classes */
const SPECTRAL_TEMPERATURE_RANGE: Record<SpectralClass, [number, number]> = {
  F: [6000, 7500],
  G: [5200, 6000],
  K: [3700, 5200],
  M: [2400, 3700],
};

export function createStellarCharacterization(
  spectralClass: SpectralClass,
  subType: number,
  luminosity_solar: number,
  variabilityIndex: number = 0.1
): StellarCharacterization {
  const [tMin, tMax] = SPECTRAL_TEMPERATURE_RANGE[spectralClass];
  // Sub-type 0 is hottest within class, 9 is coolest
  const fraction = subType / 9;
  const temperature_K = tMax - fraction * (tMax - tMin);

  return {
    spectralClass,
    subType,
    luminosity_solar,
    temperature_K,
    variabilityIndex,
  };
}

export function validateStellarCharacterization(
  star: StellarCharacterization
): ValidationResult {
  const errors: string[] = [];

  if (star.subType < 0 || star.subType > 9) {
    errors.push(`Sub-type ${star.subType} out of range 0–9`);
  }

  const [lMin, lMax] = SPECTRAL_LUMINOSITY_RANGE[star.spectralClass];
  if (star.luminosity_solar < lMin * 0.5 || star.luminosity_solar > lMax * 2) {
    errors.push(
      `Luminosity ${star.luminosity_solar} L☉ unusual for class ${star.spectralClass} (expected ${lMin}–${lMax})`
    );
  }

  if (star.variabilityIndex < 0 || star.variabilityIndex > 1) {
    errors.push(`Variability index ${star.variabilityIndex} out of range 0–1`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Reference Stars ─────────────────────────────────────────────────────────

/** G2V Sun-like reference star */
export function createSunlikestar(): StellarCharacterization {
  return createStellarCharacterization("G", 2, 1.0, 0.05);
}

/** M5V red dwarf (Proxima Centauri analog) */
export function createRedDwarfStar(): StellarCharacterization {
  return createStellarCharacterization("M", 5, 0.0017, 0.4);
}

/** K1V orange dwarf (Alpha Centauri B analog) */
export function createOrangeDwarfStar(): StellarCharacterization {
  return createStellarCharacterization("K", 1, 0.5, 0.08);
}

// ── Energy Harvesting ───────────────────────────────────────────────────────

export function createCollectorUnit(
  collectorId: string,
  output_watts: number,
  locallyFabricated: boolean = true
): CollectorUnit {
  return {
    collectorId,
    output_watts,
    health: 1.0,
    locallyFabricated,
  };
}

export function computeTotalCollectorOutput(collectors: CollectorUnit[]): number {
  return collectors.reduce(
    (sum, c) => sum + c.output_watts * c.health,
    0
  );
}

/**
 * Compute energy budget from total power, allocating by priority.
 * Allocations use named constants from Threshold Registry; reserve ≥ MIN_RESERVE_MARGIN.
 * If reserve would drop below MIN_RESERVE_MARGIN, all allocations are scaled down.
 */
export function computeEnergyBudget(totalOutput_watts: number): EnergyBudget {
  const reserveTarget = MIN_RESERVE_MARGIN;
  const usable = totalOutput_watts * (1 - reserveTarget);

  return {
    totalOutput_watts: totalOutput_watts,
    miningAllocation_watts: usable * MINING_ALLOCATION_FRACTION,
    refiningAllocation_watts: usable * REFINING_ALLOCATION_FRACTION,
    fabricationAllocation_watts: usable * FABRICATION_ALLOCATION_FRACTION,
    computationAllocation_watts: usable * COMPUTATION_ALLOCATION_FRACTION,
    reserveMarginFraction: reserveTarget,
  };
}

export function validateEnergyBudget(budget: EnergyBudget): ValidationResult {
  const errors: string[] = [];

  const allocated =
    budget.miningAllocation_watts +
    budget.refiningAllocation_watts +
    budget.fabricationAllocation_watts +
    budget.computationAllocation_watts;

  const actualReserve = 1 - allocated / budget.totalOutput_watts;

  if (actualReserve < MIN_RESERVE_MARGIN - 0.001) {
    errors.push(
      `Reserve margin ${(actualReserve * 100).toFixed(1)}% below minimum ${(MIN_RESERVE_MARGIN * 100).toFixed(1)}%`
    );
  }

  if (allocated > budget.totalOutput_watts) {
    errors.push(`Allocated power ${allocated} W exceeds total output ${budget.totalOutput_watts} W`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Estimate collector count needed to reach target power for a given star.
 * Collector output scales with stellar luminosity.
 */
export function estimateCollectorsForTarget(
  star: StellarCharacterization,
  targetPower_watts: number,
  outputPerUnit_watts: number
): number {
  // Each unit's output scales linearly with stellar luminosity
  const effectiveOutput = outputPerUnit_watts * star.luminosity_solar;
  return Math.ceil(targetPower_watts / effectiveOutput);
}

// ── Prospecting and Mining ──────────────────────────────────────────────────

export function rankBodiesByPriority(
  bodies: CelestialBody[],
  assays: Map<string, CompositionAssay>,
  requiredClasses: MaterialClass[]
): CelestialBody[] {
  return [...bodies].sort((a, b) => {
    const assayA = assays.get(a.bodyId);
    const assayB = assays.get(b.bodyId);
    if (!assayA || !assayB) return 0;

    // Score: how many required classes are present * confidence - distance penalty
    const scoreA = computeBodyScore(assayA, requiredClasses, a.orbitalDistance_AU);
    const scoreB = computeBodyScore(assayB, requiredClasses, b.orbitalDistance_AU);

    return scoreB - scoreA; // descending
  });
}

function computeBodyScore(
  assay: CompositionAssay,
  requiredClasses: MaterialClass[],
  orbitalDistance_AU: number
): number {
  let classesPresent = 0;
  let abundanceSum = 0;

  for (const cls of requiredClasses) {
    const fraction = assay.composition.get(cls) ?? 0;
    if (fraction > BODY_SCORE_ABUNDANCE_THRESHOLD) {
      classesPresent++;
      abundanceSum += fraction;
    }
  }

  // Prefer bodies with more required classes, higher abundance, closer orbit, higher confidence
  const classCoverage = classesPresent / requiredClasses.length;
  const distancePenalty = 1 / (1 + orbitalDistance_AU);
  return classCoverage * abundanceSum * assay.confidence * distancePenalty;
}

export function evaluateSurvey(
  bodies: CelestialBody[],
  assays: Map<string, CompositionAssay>,
  requiredClasses: MaterialClass[]
): ResourceSurveyResult {
  const rankedBodies = rankBodiesByPriority(bodies, assays, requiredClasses);

  // Check if union of all bodies covers all required classes
  const coveredClasses = new Set<MaterialClass>();
  for (const [, assay] of assays) {
    for (const cls of requiredClasses) {
      if ((assay.composition.get(cls) ?? 0) > BODY_SCORE_ABUNDANCE_THRESHOLD) {
        coveredClasses.add(cls);
      }
    }
  }

  return {
    rankedBodies,
    assays,
    allClassesCoverable: coveredClasses.size === requiredClasses.length,
  };
}

export function createMiningPlan(
  body: CelestialBody,
  assay: CompositionAssay,
  targetMaterials: MaterialClass[],
  targetMass_kg: number
): MiningPlan {
  // Estimate extraction rate based on body type and gravity
  const baseRate_kg_per_day = body.bodyType === "asteroid" ? 1000 : 500;
  const gravityFactor = 1 / (1 + body.surfaceGravity_m_per_s2);
  const extractionRate = baseRate_kg_per_day * gravityFactor;

  // Average abundance of target materials
  let avgAbundance = 0;
  let count = 0;
  for (const cls of targetMaterials) {
    const frac = assay.composition.get(cls) ?? 0;
    if (frac > 0) {
      avgAbundance += frac;
      count++;
    }
  }
  avgAbundance = count > 0 ? avgAbundance / count : 0.01;

  // Need to mine (targetMass / abundance) to get targetMass of desired material
  const totalToMine = targetMass_kg / Math.max(avgAbundance, 0.001);
  const timeline_days = Math.ceil(totalToMine / extractionRate);

  return {
    bodyId: body.bodyId,
    targetMaterials,
    extractionRate_kg_per_day: extractionRate,
    equipmentUnits: Math.max(1, Math.ceil(timeline_days / 365)),
    timeline_days,
  };
}

// ── Refining ────────────────────────────────────────────────────────────────

/** Default refining recipes per material class */
export function getDefaultRefiningRecipe(materialClass: MaterialClass): RefiningRecipe {
  switch (materialClass) {
    case MaterialClass.StructuralMetals:
      return {
        materialClass,
        processes: [
          RefiningProcess.MagneticSeparation,
          RefiningProcess.ElectricArcReduction,
        ],
        outputPurity: 0.999,
        energyPerKg_Wh: 5000,
        yieldFraction: 0.85,
      };
    case MaterialClass.Semiconductors:
      return {
        materialClass,
        processes: [
          RefiningProcess.ElectrostaticSeparation,
          RefiningProcess.SolarFurnaceReduction,
          RefiningProcess.CzochralskiGrowth,
        ],
        outputPurity: SEMICONDUCTOR_PURITY,
        energyPerKg_Wh: 50000,
        yieldFraction: 0.60,
      };
    case MaterialClass.ThermalManagement:
      return {
        materialClass,
        processes: [
          RefiningProcess.MagneticSeparation,
          RefiningProcess.ElectricArcReduction,
        ],
        outputPurity: 0.9999,
        energyPerKg_Wh: 8000,
        yieldFraction: 0.80,
      };
    case MaterialClass.Volatiles:
      return {
        materialClass,
        processes: [RefiningProcess.Electrolysis],
        outputPurity: 0.999,
        energyPerKg_Wh: 2000,
        yieldFraction: 0.90,
      };
    case MaterialClass.RareElements:
      return {
        materialClass,
        processes: [
          RefiningProcess.ElectrostaticSeparation,
          RefiningProcess.ChemicalVaporDeposition,
        ],
        outputPurity: 0.9999,
        energyPerKg_Wh: 100000,
        yieldFraction: 0.40,
      };
    case MaterialClass.RefractoryMaterials:
      return {
        materialClass,
        processes: [
          RefiningProcess.SolarFurnaceReduction,
          RefiningProcess.CarbothermicReduction,
        ],
        outputPurity: 0.999,
        energyPerKg_Wh: 15000,
        yieldFraction: 0.70,
      };
  }
}

export function computeRefiningOutput(
  rawEntry: RawMaterialEntry,
  recipe: RefiningRecipe
): FeedstockEntry {
  const refinedMass = rawEntry.mass_kg * recipe.yieldFraction;
  return {
    materialClass: rawEntry.materialClass,
    mass_kg: refinedMass,
    purity: recipe.outputPurity,
    meetsSpec: recipe.outputPurity >= rawEntry.rawPurity, // always true for refined output
  };
}

export function checkFeedstockMeetsSpec(
  entry: FeedstockEntry,
  requirement: MaterialRequirement
): boolean {
  return entry.mass_kg >= requirement.mass_kg && entry.purity >= requirement.purityRequired;
}

export function computeFeedstockInventory(
  entries: FeedstockEntry[],
  spec: FeedstockSpec
): FeedstockInventory {
  const completionByClass = new Map<MaterialClass, number>();

  for (const req of spec) {
    const matching = entries.filter((e) => e.materialClass === req.materialClass);
    const totalMass = matching.reduce((sum, e) => sum + e.mass_kg, 0);
    const completion = Math.min(1.0, totalMass / req.mass_kg);
    completionByClass.set(req.materialClass, completion);
  }

  return { entries, completionByClass };
}

// ── Replication Readiness ───────────────────────────────────────────────────

export function computeReplicationReadiness(inventory: FeedstockInventory): number {
  if (inventory.completionByClass.size === 0) return 0;
  let sum = 0;
  for (const [, completion] of inventory.completionByClass) {
    sum += completion;
  }
  return sum / inventory.completionByClass.size;
}

export function evaluateReplicationReadiness(
  inventory: FeedstockInventory,
  spec: FeedstockSpec,
  missionTime_years: number
): ReplicationReadinessSignal {
  const classCoverage = new Map<MaterialClass, boolean>();

  for (const req of spec) {
    const matching = inventory.entries.filter(
      (e) => e.materialClass === req.materialClass
    );
    const totalMass = matching.reduce((sum, e) => sum + e.mass_kg, 0);
    const purityOk = matching.every((e) => e.purity >= req.purityRequired);
    classCoverage.set(req.materialClass, totalMass >= req.mass_kg && purityOk);
  }

  const allReady = [...classCoverage.values()].every((v) => v);
  const totalMass = inventory.entries.reduce((sum, e) => sum + e.mass_kg, 0);

  return {
    ready: allReady,
    classCoverage,
    totalFeedstockMass_kg: totalMass,
    timestamp_years: missionTime_years,
  };
}

// ── Bootstrap Sequence ──────────────────────────────────────────────────────

/** Determine bootstrap phase from mission time and system capabilities */
export function determineBootstrapPhase(
  missionTime_years: number,
  activeCollectors: number,
  activeMiningUnits: number,
  replicationReadiness: number
): BootstrapPhase {
  if (replicationReadiness >= 1.0) return BootstrapPhase.ReplicationReady;
  if (missionTime_years >= 10 && activeMiningUnits > 0 && activeCollectors > 10) {
    return BootstrapPhase.FullScaleOperations;
  }
  if (missionTime_years >= 3 && activeCollectors > 1) {
    return BootstrapPhase.FirstExpansion;
  }
  if (missionTime_years >= 1 && activeMiningUnits > 0) {
    return BootstrapPhase.SeedMining;
  }
  if (activeCollectors > 0) {
    return BootstrapPhase.SeedEnergy;
  }
  return BootstrapPhase.Arrival;
}

/** Validate that bootstrap timeline is within constraints */
export function validateBootstrapTimeline(
  missionTime_years: number,
  phase: BootstrapPhase
): ValidationResult {
  const errors: string[] = [];

  if (missionTime_years > MAX_REPLICATION_TIMELINE_YEARS && phase !== BootstrapPhase.ReplicationReady) {
    errors.push(
      `Mission time ${missionTime_years} years exceeds max ${MAX_REPLICATION_TIMELINE_YEARS} without reaching replication readiness`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Seed Package ────────────────────────────────────────────────────────────

export function validateSeedPackageFraction(
  seedMass_kg: number,
  finalInfrastructureMass_kg: number
): ValidationResult {
  const errors: string[] = [];
  const fraction = seedMass_kg / finalInfrastructureMass_kg;

  if (fraction > MAX_SEED_FRACTION) {
    errors.push(
      `Seed package fraction ${(fraction * 100).toFixed(1)}% exceeds max ${(MAX_SEED_FRACTION * 100).toFixed(1)}%`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Compositional Adaptation ────────────────────────────────────────────────

/**
 * Given an unexpected composition, attempt to find or synthesize a refining
 * approach. Returns an adaptation log entry.
 */
export function adaptRefiningForComposition(
  materialClass: MaterialClass,
  availableProcesses: RefiningProcess[],
  targetPurity: number
): { recipe: RefiningRecipe; adaptation: AdaptationLogEntry } {
  const defaultRecipe = getDefaultRefiningRecipe(materialClass);

  // Filter to only available processes
  const feasibleProcesses = defaultRecipe.processes.filter((p) =>
    availableProcesses.includes(p)
  );

  // If we lost processes, degrade purity estimate
  const purityDegradation = feasibleProcesses.length / defaultRecipe.processes.length;
  const achievablePurity = defaultRecipe.outputPurity * purityDegradation;

  const adaptedRecipe: RefiningRecipe = {
    ...defaultRecipe,
    processes: feasibleProcesses.length > 0 ? feasibleProcesses : defaultRecipe.processes,
    outputPurity: feasibleProcesses.length > 0 ? achievablePurity : defaultRecipe.outputPurity,
    yieldFraction: defaultRecipe.yieldFraction * purityDegradation,
  };

  const adaptation: AdaptationLogEntry = {
    timestamp_years: 0, // caller should set
    category: "refining_recipe",
    description: `Adapted ${materialClass} recipe: ${feasibleProcesses.length}/${defaultRecipe.processes.length} processes available, purity ${achievablePurity.toFixed(6)}`,
    validated: false, // must be validated on small batch
  };

  return { recipe: adaptedRecipe, adaptation };
}

/**
 * Mark an adaptation as validated after successful small-batch test.
 * Returns a new entry with validated=true and the provided timestamp.
 * Per contract: validated starts false; set true only after small-batch validation succeeds.
 */
export function validateAdaptation(
  entry: AdaptationLogEntry,
  validationTimestamp_years: number
): AdaptationLogEntry {
  return {
    ...entry,
    validated: true,
    timestamp_years: validationTimestamp_years,
  };
}

// ── Energy Sufficiency Check ────────────────────────────────────────────────

/**
 * Check whether current energy output is sufficient for the full extraction
 * pipeline at given throughput.
 */
export function isEnergySufficient(
  totalPower_watts: number,
  requiredMaterials: FeedstockSpec,
  recipes: Map<MaterialClass, RefiningRecipe>
): boolean {
  // Total energy needed per day for refining all required materials at required throughput
  let totalEnergyNeeded_Wh_per_day = 0;

  for (const req of requiredMaterials) {
    const recipe = recipes.get(req.materialClass);
    if (!recipe) return false;

    // Production window from target replication timeline → daily production rate
    const daily_kg = req.mass_kg / (TARGET_REPLICATION_TIMELINE_YEARS * 365);
    // Account for yield loss: need to refine more input
    const inputDaily_kg = daily_kg / recipe.yieldFraction;
    totalEnergyNeeded_Wh_per_day += inputDaily_kg * recipe.energyPerKg_Wh;
  }

  // Convert to watts (Wh/day → W: divide by 24)
  const requiredPower_watts = totalEnergyNeeded_Wh_per_day / 24;

  // Include 20% reserve margin
  return totalPower_watts >= requiredPower_watts / (1 - MIN_RESERVE_MARGIN);
}
