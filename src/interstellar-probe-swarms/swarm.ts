/**
 * Interstellar Probe Swarms — Core Implementation
 *
 * Pure functions implementing probe swarm construction, validation,
 * consensus, and decision logic per ARCHITECTURE.md.
 */

import {
  type CCMSpec,
  type ProbeMassBudget,
  type SeedPayload,
  type RepairFeedstock,
  type BACConfig,
  type Vote,
  type ConsensusResult,
  type DiagnosticReport,
  type SwarmConfig,
  type LaserBoostSpec,
  type FusionDriveSpec,
  REFERENCE_CCM_SPEC,
  REFERENCE_PROBE_MASS,
  REFERENCE_SEED_PAYLOAD,
  REFERENCE_LASER_BOOST,
  REFERENCE_FUSION_DRIVE,
  DEFAULT_BAC_CONFIG,
  MAX_PROBE_MASS_KG,
  DegradationLevel,
  VoteValue,
  ConsensusStatus,
  type LocalDecision,
  type SwarmDecision,
  DecisionScope,
} from "./types.js";

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── CCM Validation ──────────────────────────────────────────────────────────

const MIN_CCM_COMPUTE = 1e18;
const MAX_CCM_MASS_KG = 50;
const MAX_CRUISE_POWER_W = 500;
const MAX_ACTIVE_POWER_W = 50_000;
const MIN_STORAGE_BITS = 1e18;

export function createDefaultCCMSpec(): CCMSpec {
  return { ...REFERENCE_CCM_SPEC };
}

export function validateCCMSpec(spec: CCMSpec): ValidationResult {
  const errors: string[] = [];

  if (spec.compute_ops_per_sec < MIN_CCM_COMPUTE) {
    errors.push(`Compute ${spec.compute_ops_per_sec} ops/s below minimum ${MIN_CCM_COMPUTE}`);
  }
  if (spec.mass_kg > MAX_CCM_MASS_KG) {
    errors.push(`CCM mass ${spec.mass_kg} kg exceeds maximum ${MAX_CCM_MASS_KG} kg`);
  }
  if (spec.cruise_power_watts > MAX_CRUISE_POWER_W) {
    errors.push(`Cruise power ${spec.cruise_power_watts} W exceeds maximum ${MAX_CRUISE_POWER_W} W`);
  }
  if (spec.active_power_watts > MAX_ACTIVE_POWER_W) {
    errors.push(`Active power ${spec.active_power_watts} W exceeds maximum ${MAX_ACTIVE_POWER_W} W`);
  }
  if (spec.storage_bits < MIN_STORAGE_BITS) {
    errors.push(`Storage ${spec.storage_bits} bits below minimum ${MIN_STORAGE_BITS}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Probe Mass Budget ───────────────────────────────────────────────────────

export function createDefaultProbeMass(): ProbeMassBudget {
  return { ...REFERENCE_PROBE_MASS };
}

export function computeTotalProbeMass(budget: ProbeMassBudget): number {
  return (
    budget.ccm_kg +
    budget.fusionDrive_kg +
    budget.fusionFuel_kg +
    budget.seedPayload_kg +
    budget.repairFeedstock_kg +
    budget.sensors_kg +
    budget.structure_kg
  );
}

export function validateProbeMass(budget: ProbeMassBudget): ValidationResult {
  const errors: string[] = [];
  const total = computeTotalProbeMass(budget);

  if (total > MAX_PROBE_MASS_KG) {
    errors.push(`Total probe mass ${total} kg exceeds maximum ${MAX_PROBE_MASS_KG} kg`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Seed Payload ────────────────────────────────────────────────────────────

export function createDefaultSeedPayload(): SeedPayload {
  return { ...REFERENCE_SEED_PAYLOAD };
}

export function computeSeedPayloadMass(payload: SeedPayload): number {
  return payload.nanoAssembler_kg + payload.miningKit_kg + payload.solarKit_kg;
}

export function validateSeedPayload(payload: SeedPayload): ValidationResult {
  const errors: string[] = [];

  if (!payload.hasBlueprints) {
    errors.push("Replication blueprints missing from seed payload");
  }
  if (payload.nanoAssembler_kg <= 0) {
    errors.push("Nanofabrication assembler required");
  }
  if (payload.miningKit_kg <= 0) {
    errors.push("Mining/refining kit required");
  }
  if (payload.solarKit_kg <= 0) {
    errors.push("Solar collector kit required");
  }

  return { valid: errors.length === 0, errors };
}

// ── Bootstrap Timeline ──────────────────────────────────────────────────────

export function computeBootstrapYears(
  energyPhase: number,
  miningPhase: number,
  assemblyPhase: number
): number {
  return energyPhase + miningPhase + assemblyPhase;
}

export function defaultBootstrapYears(): number {
  return computeBootstrapYears(10, 20, 20);
}

// ── Propulsion Validation ───────────────────────────────────────────────────

const MIN_CRUISE_VELOCITY_C = 0.01;

export function validateLaserBoost(spec: LaserBoostSpec): ValidationResult {
  const errors: string[] = [];

  if (spec.targetVelocity_c < MIN_CRUISE_VELOCITY_C) {
    errors.push(
      `Target velocity ${spec.targetVelocity_c}c below minimum ${MIN_CRUISE_VELOCITY_C}c`
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateFusionDrive(spec: FusionDriveSpec): ValidationResult {
  const errors: string[] = [];

  if (spec.fuelMass_kg <= 0) {
    errors.push("Fusion drive requires fuel mass > 0");
  }
  if (spec.decelerationLeadTime_years <= 0) {
    errors.push("Deceleration lead time must be > 0 years");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute transit time in years to a target distance at a given cruise velocity.
 * distance_ly: distance in light-years
 * velocity_c: cruise velocity as fraction of c
 */
export function computeTransitTime(distance_ly: number, velocity_c: number): number {
  if (velocity_c <= 0) return Infinity;
  return distance_ly / velocity_c;
}

// ── BAC Consensus Protocol ──────────────────────────────────────────────────

/**
 * Classify a decision as local (no consensus needed) or swarm-level.
 */
export function classifyDecision(
  decision: LocalDecision | SwarmDecision
): DecisionScope {
  const localDecisions: LocalDecision[] = [
    "NAVIGATION_CORRECTION",
    "SELF_REPAIR",
    "DORMANCY_MANAGEMENT",
    "THREAT_RESPONSE",
  ];

  if ((localDecisions as string[]).includes(decision)) {
    return DecisionScope.Local;
  }
  return DecisionScope.Swarm;
}

/**
 * Evaluate BAC consensus from collected votes.
 * Returns consensus result including whether supermajority was reached.
 */
export function evaluateConsensus(
  proposalId: string,
  votes: Vote[],
  totalSwarmSize: number,
  config: BACConfig = DEFAULT_BAC_CONFIG
): ConsensusResult {
  const approveCount = votes.filter((v) => v.value === VoteValue.Approve).length;
  const rejectCount = votes.filter((v) => v.value === VoteValue.Reject).length;
  const abstainCount = votes.filter((v) => v.value === VoteValue.Abstain).length;
  const totalResponders = votes.length;

  // Check if enough probes responded to form quorum
  const quorumReached = totalResponders >= totalSwarmSize * 0.5;

  let status: ConsensusStatus;

  if (!quorumReached) {
    status = ConsensusStatus.LocalFallback;
  } else {
    // Supermajority calculated from non-abstaining voters
    const votingCount = approveCount + rejectCount;
    if (votingCount === 0) {
      status = ConsensusStatus.LocalFallback;
    } else {
      const approveFraction = approveCount / votingCount;
      if (approveFraction >= config.supermajorityThreshold) {
        status = ConsensusStatus.Approved;
      } else {
        status = ConsensusStatus.Rejected;
      }
    }
  }

  return {
    proposalId,
    status,
    approveCount,
    rejectCount,
    abstainCount,
    totalResponders,
  };
}

// ── Degradation Assessment ──────────────────────────────────────────────────

/**
 * Determine degradation level from capability fraction.
 * Thresholds from architecture §5.2.
 */
export function assessDegradation(capabilityFraction: number): DegradationLevel {
  if (capabilityFraction >= 0.75) return DegradationLevel.Green;
  if (capabilityFraction >= 0.50) return DegradationLevel.Yellow;
  if (capabilityFraction >= 0.25) return DegradationLevel.Red;
  return DegradationLevel.Black;
}

/**
 * Create a diagnostic report from per-subsystem health values.
 */
export function createDiagnosticReport(health: {
  ccm: number;
  propulsion: number;
  sensors: number;
  structure: number;
}): DiagnosticReport {
  // CCM weighted most heavily (consciousness preservation priority)
  const capabilityFraction =
    health.ccm * 0.4 +
    health.propulsion * 0.25 +
    health.sensors * 0.2 +
    health.structure * 0.15;

  return {
    level: assessDegradation(capabilityFraction),
    capabilityFraction,
    subsystemHealth: { ...health },
  };
}

// ── Repair Feedstock ────────────────────────────────────────────────────────

/**
 * Determine if a repair is feasible given available feedstock.
 */
export function canRepair(
  componentMass_kg: number,
  feedstock: RepairFeedstock
): boolean {
  return componentMass_kg <= feedstock.remaining_kg;
}

/**
 * Consume feedstock for a repair. Returns updated feedstock.
 */
export function consumeFeedstock(
  mass_kg: number,
  feedstock: RepairFeedstock
): RepairFeedstock {
  if (mass_kg > feedstock.remaining_kg) {
    throw new Error(
      `Insufficient feedstock: need ${mass_kg} kg, have ${feedstock.remaining_kg} kg`
    );
  }
  return {
    ...feedstock,
    remaining_kg: feedstock.remaining_kg - mass_kg,
  };
}

// ── Swarm Configuration ─────────────────────────────────────────────────────

/**
 * Estimate surviving probes after transit given expected loss fraction.
 */
export function estimateSurvivingProbes(config: SwarmConfig): number {
  return Math.round(config.probeCount * (1 - config.expectedLossFraction));
}

/**
 * Validate swarm configuration against architecture constraints.
 */
export function validateSwarmConfig(config: SwarmConfig): ValidationResult {
  const errors: string[] = [];

  if (config.probeCount < 1000) {
    errors.push(`Swarm size ${config.probeCount} below minimum 1,000 for redundancy`);
  }
  if (config.probeCount > 10_000) {
    errors.push(`Swarm size ${config.probeCount} exceeds coordination maximum 10,000`);
  }
  if (config.cruiseVelocity_c < MIN_CRUISE_VELOCITY_C) {
    errors.push(
      `Cruise velocity ${config.cruiseVelocity_c}c below minimum ${MIN_CRUISE_VELOCITY_C}c`
    );
  }

  return { valid: errors.length === 0, errors };
}
