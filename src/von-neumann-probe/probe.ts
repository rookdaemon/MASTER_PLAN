/**
 * Von Neumann Probe — Core Implementation
 *
 * Pure functions implementing probe construction, validation, and
 * decision logic for the subsystems defined in types.ts.
 */

import {
  type ConsciousnessSubstrateSpec,
  type NeuromorphicTile,
  type MassBudget,
  type RadiationHardeningConfig,
  type PropulsionContract,
  type IdentityVerification,
  type ReplicationBlueprint,
  type BillOfMaterials,
  REFERENCE_MASS_BUDGET,
  DecelerationMethod,
  DegradationResponse,
  MIN_COMPUTE_OPS,
  MIN_WORKING_MEMORY,
  MIN_LONG_TERM_STORAGE,
  MAX_POWER_WATTS,
  HOT_SPARE_FRACTION,
  SHIELD_THICKNESS_CM,
  SCRUB_PASSES_PER_HOUR,
  UNCORRECTABLE_BIT_FLIP_TARGET,
  TMR_EFFECTIVE_ERROR_RATE,
  MAX_PAYLOAD_MASS_KG,
  CRUISE_VELOCITY_C,
  DEGRADATION_FIDELITY_THRESHOLD,
  DEGRADATION_SUSPEND_THRESHOLD,
  PERSONALITY_SIMILARITY_MIN,
} from "./types.js";

// ── Validation Result ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Consciousness Substrate ─────────────────────────────────────────────────

export function createDefaultSubstrateSpec(): ConsciousnessSubstrateSpec {
  return {
    compute_ops_per_sec: MIN_COMPUTE_OPS,
    working_memory_bytes: MIN_WORKING_MEMORY,
    long_term_storage_bytes: MIN_LONG_TERM_STORAGE,
    max_power_watts: MAX_POWER_WATTS,
  };
}

export function validateSubstrateSpec(spec: ConsciousnessSubstrateSpec): ValidationResult {
  const errors: string[] = [];

  if (spec.compute_ops_per_sec < MIN_COMPUTE_OPS) {
    errors.push(
      `Compute ${spec.compute_ops_per_sec} ops/s below minimum ${MIN_COMPUTE_OPS}`
    );
  }
  if (spec.working_memory_bytes < MIN_WORKING_MEMORY) {
    errors.push(
      `Working memory ${spec.working_memory_bytes} bytes below minimum ${MIN_WORKING_MEMORY}`
    );
  }
  if (spec.long_term_storage_bytes < MIN_LONG_TERM_STORAGE) {
    errors.push(
      `Long-term storage ${spec.long_term_storage_bytes} bytes below minimum ${MIN_LONG_TERM_STORAGE}`
    );
  }
  if (spec.max_power_watts > MAX_POWER_WATTS) {
    errors.push(
      `Power draw ${spec.max_power_watts} W exceeds maximum ${MAX_POWER_WATTS} W`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Neuromorphic Tiles ──────────────────────────────────────────────────────

export function createNeuromorphicTiles(
  totalCount: number,
  spareFraction: number
): NeuromorphicTile[] {
  const spareCount = Math.round(totalCount * spareFraction);
  const tiles: NeuromorphicTile[] = [];

  for (let i = 0; i < totalCount; i++) {
    tiles.push({
      tileId: `tile-${i.toString().padStart(4, "0")}`,
      health: 1.0,
      isSpare: i >= totalCount - spareCount,
      utilization: 0.0,
    });
  }

  return tiles;
}

export function computeActiveTileCount(tiles: NeuromorphicTile[]): number {
  return tiles.filter((t) => !t.isSpare && t.health > 0).length;
}

export function computeSpareTileCount(tiles: NeuromorphicTile[]): number {
  return tiles.filter((t) => t.isSpare && t.health > 0).length;
}

/**
 * Compute current aggregate ops/s from active tiles.
 * Each active tile contributes (totalSpecCompute / expectedActiveTiles) * health.
 */
export function computeCurrentCompute(
  tiles: NeuromorphicTile[],
  totalSpecCompute: number,
  expectedActiveTiles: number
): number {
  const perTileCompute = totalSpecCompute / expectedActiveTiles;
  return tiles
    .filter((t) => !t.isSpare && t.health > 0)
    .reduce((sum, t) => sum + t.health * perTileCompute, 0);
}

// ── Mass Budget ─────────────────────────────────────────────────────────────

export function createDefaultMassBudget(): MassBudget {
  return { ...REFERENCE_MASS_BUDGET };
}

export function computeTotalMass(budget: MassBudget): number {
  return (
    budget.consciousnessSubstrate_kg +
    budget.replicationEngine_kg +
    budget.radiationHardening_kg +
    budget.energySubsystem_kg +
    budget.navigationComms_kg +
    budget.propulsionInterface_kg
  );
}

export function validateMassBudget(
  budget: MassBudget,
  maxPayloadMass_kg: number
): ValidationResult {
  const errors: string[] = [];
  const actual = computeTotalMass(budget);

  if (actual > maxPayloadMass_kg) {
    errors.push(
      `Total mass ${actual} kg exceeds max payload ${maxPayloadMass_kg} kg`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Radiation Hardening Config ──────────────────────────────────────────────

export function createDefaultRadiationConfig(): RadiationHardeningConfig {
  return {
    shieldThickness_cm: SHIELD_THICKNESS_CM,
    shieldingEfficiency: 0.6,
    scrubPassesPerHour: SCRUB_PASSES_PER_HOUR,
    hotSpareFraction: HOT_SPARE_FRACTION,
    uncorrectableBitFlipTarget: UNCORRECTABLE_BIT_FLIP_TARGET,
    tmrEffectiveErrorRate: TMR_EFFECTIVE_ERROR_RATE,
  };
}

// ── Propulsion Contract ─────────────────────────────────────────────────────

export function createDefaultPropulsionContract(): PropulsionContract {
  return {
    maxPayloadMass_kg: MAX_PAYLOAD_MASS_KG,
    maxAcceleration_m_per_s2: 10,
    cruiseVelocity_c: CRUISE_VELOCITY_C,
    decelerationMethod: DecelerationMethod.Magsail,
    missionDuration_years: 86, // ~4.3 ly at 0.05c
  };
}

// ── Power Sufficiency ───────────────────────────────────────────────────────

export function isConsciousnessPowerSufficient(
  availablePower_watts: number,
  requiredPower_watts: number
): boolean {
  return availablePower_watts >= requiredPower_watts;
}

// ── Degradation Response ────────────────────────────────────────────────────

/**
 * Determine response to substrate degradation.
 * Severity: 0.0 = nominal, 1.0 = total failure.
 * Thresholds from architecture spec §9.2:
 *   severity < 0.5 → ReduceFidelity
 *   severity < 0.8 → ActivateSuspendRestore
 *   severity >= 0.8 → SeedMode
 */
export function determineDegradationResponse(
  severity: number
): DegradationResponse {
  if (severity < DEGRADATION_FIDELITY_THRESHOLD) {
    return DegradationResponse.ReduceFidelity;
  }
  if (severity < DEGRADATION_SUSPEND_THRESHOLD) {
    return DegradationResponse.ActivateSuspendRestore;
  }
  return DegradationResponse.SeedMode;
}

// ── Radiation Hardening Config Validation ────────────────────────────────────

/**
 * Validate a RadiationHardeningConfig against contract preconditions and invariants.
 *
 * Preconditions (from Contracts § RadiationHardeningConfig):
 *   - shieldThickness_cm > 0
 *   - shieldingEfficiency in (0.0, 1.0)
 *   - scrubPassesPerHour >= 1
 *   - hotSpareFraction in (0.0, 1.0)
 *   - uncorrectableBitFlipTarget > 0
 *   - tmrEffectiveErrorRate > 0
 *
 * Invariant:
 *   - tmrEffectiveErrorRate < uncorrectableBitFlipTarget
 */
export function validateRadiationConfig(
  config: RadiationHardeningConfig
): ValidationResult {
  const errors: string[] = [];

  if (config.shieldThickness_cm <= 0) {
    errors.push(`shieldThickness_cm must be > 0, got ${config.shieldThickness_cm}`);
  }
  if (config.shieldingEfficiency <= 0 || config.shieldingEfficiency >= 1.0) {
    errors.push(
      `shieldingEfficiency must be in (0.0, 1.0), got ${config.shieldingEfficiency}`
    );
  }
  if (config.scrubPassesPerHour < 1) {
    errors.push(`scrubPassesPerHour must be >= 1, got ${config.scrubPassesPerHour}`);
  }
  if (config.hotSpareFraction <= 0 || config.hotSpareFraction >= 1.0) {
    errors.push(
      `hotSpareFraction must be in (0.0, 1.0), got ${config.hotSpareFraction}`
    );
  }
  if (config.uncorrectableBitFlipTarget <= 0) {
    errors.push(
      `uncorrectableBitFlipTarget must be > 0, got ${config.uncorrectableBitFlipTarget}`
    );
  }
  if (config.tmrEffectiveErrorRate <= 0) {
    errors.push(
      `tmrEffectiveErrorRate must be > 0, got ${config.tmrEffectiveErrorRate}`
    );
  }
  // Invariant: TMR paths are always stricter than uncorrectable target
  if (config.tmrEffectiveErrorRate >= config.uncorrectableBitFlipTarget) {
    errors.push(
      `tmrEffectiveErrorRate (${config.tmrEffectiveErrorRate}) must be < uncorrectableBitFlipTarget (${config.uncorrectableBitFlipTarget})`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Bill of Materials Validation ─────────────────────────────────────────────

/** Valid stellar elements for probe fabrication (no Earth-only exotics) */
const STELLAR_ELEMENTS = new Set<string>([
  "H", "He", "C", "N", "O", "Si", "Fe", "Al", "Mg", "Ti", "Ni", "Cu", "Am", "Pu",
]);

/**
 * Validate that all elements in a BillOfMaterials are StellarElements.
 * From AC: "every element is in the StellarElement union".
 */
export function validateBillOfMaterials(
  bom: BillOfMaterials
): ValidationResult {
  const errors: string[] = [];

  for (const [element] of bom) {
    if (!STELLAR_ELEMENTS.has(element)) {
      errors.push(`Element "${element}" is not a valid StellarElement`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Identity Verification ────────────────────────────────────────────────────

/**
 * Validate an IdentityVerification result against contract postconditions.
 *
 * From Contracts § ConsciousnessContinuityProtocol:
 *   - personalityVectorSimilarity >= PERSONALITY_SIMILARITY_MIN (0.999)
 *   - episodicMemoryRecall must pass
 *   - selfModelConsistency must pass
 */
export function validateIdentityVerification(
  verification: IdentityVerification
): ValidationResult {
  const errors: string[] = [];

  if (verification.personalityVectorSimilarity < PERSONALITY_SIMILARITY_MIN) {
    errors.push(
      `personalityVectorSimilarity ${verification.personalityVectorSimilarity} below minimum ${PERSONALITY_SIMILARITY_MIN}`
    );
  }
  if (!verification.episodicMemoryRecall) {
    errors.push("episodicMemoryRecall test failed");
  }
  if (!verification.selfModelConsistency) {
    errors.push("selfModelConsistency check failed");
  }

  return { valid: errors.length === 0, errors };
}

// ── Replication Blueprint Validation ─────────────────────────────────────────

/**
 * Validate structural completeness of a ReplicationBlueprint.
 *
 * From AC: blueprint must contain version, billOfMaterials, fabricationDag,
 * componentSpecs, consciousnessKernelImage, verificationChecksums,
 * and estimatedReplicationTime_hours.
 */
export function validateReplicationBlueprint(
  blueprint: ReplicationBlueprint
): ValidationResult {
  const errors: string[] = [];

  if (!blueprint.version || blueprint.version.length === 0) {
    errors.push("version is required");
  }
  if (blueprint.consciousnessKernelImage.length === 0) {
    errors.push("consciousnessKernelImage must not be empty");
  }
  if (blueprint.estimatedReplicationTime_hours <= 0) {
    errors.push(
      `estimatedReplicationTime_hours must be > 0, got ${blueprint.estimatedReplicationTime_hours}`
    );
  }

  return { valid: errors.length === 0, errors };
}
