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
  type ConsciousnessSnapshot,
  type IdentityVerificationResult,
  type DreamThreadConfig,
  type PropulsionStatus,
  type BurnPlan,
  DormancyState,
  ReactivationTrigger,
  PropulsionPhase,
  REFERENCE_CCM_SPEC,
  REFERENCE_PROBE_MASS,
  REFERENCE_SEED_PAYLOAD,
  REFERENCE_LASER_BOOST,
  REFERENCE_FUSION_DRIVE,
  DEFAULT_BAC_CONFIG,
  DegradationLevel,
  VoteValue,
  ConsensusStatus,
  type LocalDecision,
  type SwarmDecision,
  DecisionScope,
} from "./types.js";

// ── Threshold Registry ───────────────────────────────────────────────────────
// All named constants from the card's Threshold Registry.
// Names, values, and units match the registry exactly.

/** Lower bound for substrate-independent consciousness per F1.2 (ops/s) */
export const MIN_CCM_COMPUTE = 1e18;
/** Probe mass budget constraint; CCM is 10% of total (kg) */
export const MAX_CCM_MASS = 50;
/** Dormancy compute + housekeeping + dream thread + repair (W) */
export const CRUISE_POWER = 500;
/** Full consciousness + ISRU bootstrapping at arrival (W) */
export const ACTIVE_POWER = 50_000;
/** State snapshots + knowledge base + replication blueprints (bits) */
export const MIN_STORAGE = 1e18;
/** Achieves ~140yr transit; ≥0.01c required for sub-500yr (fraction of c) */
export const TARGET_VELOCITY = 0.03;
/** Hard floor for feasible interstellar transit (fraction of c) */
export const MIN_CRUISE_VELOCITY = 0.01;
/** Pushes 500 kg probe to 0.03c in ~2 years (W) */
export const LASER_POWER = 100e9;
/** Area for laser momentum transfer at 1 g/m² areal density (m) */
export const SAIL_DIAMETER = 100;
/** D-He3 for deceleration from 0.03c (kg) */
export const FUEL_MASS = 200;
/** BAC consensus; balances decisiveness vs. legitimacy (fraction) */
export const SUPERMAJORITY_THRESHOLD = 0.67;
/** Time to wait for votes before local fallback (× RTT) */
export const QUORUM_TIMEOUT_MULTIPLIER = 2;
/** Minimum for redundancy against 50% expected loss (probes) */
export const SWARM_MIN_SIZE = 1_000;
/** Coordination complexity upper bound (probes) */
export const SWARM_MAX_SIZE = 10_000;
/** Multi-century transit attrition (fraction) */
export const EXPECTED_LOSS_FRACTION = 0.50;
/** Nominal operations threshold (fraction) */
export const DEGRADATION_GREEN = 0.75;
/** Reduced scope threshold (fraction) */
export const DEGRADATION_YELLOW = 0.50;
/** Survival mode threshold (fraction) */
export const DEGRADATION_RED = 0.25;
/** Raw materials for in-transit repairs (kg) */
export const REPAIR_FEEDSTOCK = 10;
/** CCM weight in composite capability score (fraction) */
export const CCM_CAPABILITY_WEIGHT = 0.40;
/** Propulsion weight in composite capability score (fraction) */
export const PROPULSION_CAPABILITY_WEIGHT = 0.25;
/** Sensors weight in composite capability score (fraction) */
export const SENSORS_CAPABILITY_WEIGHT = 0.20;
/** Structure weight in composite capability score (fraction) */
export const STRUCTURE_CAPABILITY_WEIGHT = 0.15;
/** Time from arrival to first new probe launch (years) */
export const BOOTSTRAP_TOTAL = 50;
/** Minimum responders for valid consensus (fraction) */
export const QUORUM_FRACTION = 0.50;
/** Total probe mass constraint from propulsion delta-v (kg) */
export const MAX_PROBE_MASS = 500;

// ── Consciousness Core Module (CCM) ─────────────────────────────────────────

/**
 * Compare two Uint8Arrays for byte-level equality.
 */
function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Count matching copies in a triple-redundant snapshot.
 * Returns the size of the largest group of identical copies:
 *   3 — all identical
 *   2 — two match, one differs
 *   0 — all three differ
 */
export function countMatchingCopies(
  copies: [Uint8Array, Uint8Array, Uint8Array]
): number {
  const eq01 = uint8ArraysEqual(copies[0], copies[1]);
  const eq02 = uint8ArraysEqual(copies[0], copies[2]);
  const eq12 = uint8ArraysEqual(copies[1], copies[2]);

  if (eq01 && eq02) return 3;
  if (eq01 || eq02 || eq12) return 2;
  return 0;
}

/**
 * Initialize CCM from a consciousness snapshot.
 *
 * Contract preconditions:
 *   - state.copies contains 3 non-empty Uint8Arrays
 *   - state.hash is a valid SHA-512 hex string (128 hex chars)
 *
 * Contract postcondition:
 *   - Returns IdentityVerificationResult with matchingCopies ∈ {0, 2, 3}
 */
export function initializeCCM(
  state: ConsciousnessSnapshot
): IdentityVerificationResult {
  // Guard: 3 copies required
  if (state.copies.length !== 3) {
    throw new Error(
      `CCM initialize requires exactly 3 copies, got ${state.copies.length}`
    );
  }
  // Guard: all copies non-empty
  for (let i = 0; i < 3; i++) {
    if (state.copies[i].length === 0) {
      throw new Error(`CCM initialize: copy ${i} is empty`);
    }
  }
  // Guard: valid SHA-512 hash (128 hex characters)
  if (!/^[0-9a-f]{128}$/i.test(state.hash)) {
    throw new Error(`CCM initialize: invalid SHA-512 hash`);
  }

  const matchingCopies = countMatchingCopies(state.copies);
  const verified = matchingCopies >= 2;

  return {
    verified,
    matchingCopies,
    failureReason: verified
      ? undefined
      : "Insufficient matching copies for identity verification",
  };
}

/**
 * Create a consciousness snapshot with triple-redundant identical copies.
 *
 * Contract postcondition:
 *   - Returns ConsciousnessSnapshot with 3 identical copies and valid hash.
 */
export function createSnapshot(
  data: Uint8Array,
  hash: string,
  timestamp_ms: number
): ConsciousnessSnapshot {
  if (data.length === 0) {
    throw new Error("Cannot snapshot empty consciousness data");
  }
  if (!/^[0-9a-f]{128}$/i.test(hash)) {
    throw new Error("Snapshot requires valid SHA-512 hash");
  }
  // Create 3 identical copies (true copies, not references)
  return {
    copies: [
      new Uint8Array(data),
      new Uint8Array(data),
      new Uint8Array(data),
    ],
    hash,
    timestamp_ms,
  };
}

/**
 * Transition CCM into dormancy.
 *
 * Contract preconditions:
 *   - Current state must be Active
 *   - config.sensorSampleRate_hz > 0
 *
 * Contract postcondition:
 *   - Returns DormancyState.Dormant
 */
export function enterCCMDormancy(
  currentState: DormancyState,
  config: DreamThreadConfig
): DormancyState {
  // Guard: must be Active
  if (currentState !== DormancyState.Active) {
    throw new Error(
      `Cannot enter dormancy from state ${currentState}; must be Active`
    );
  }
  // Guard: sensor sample rate > 0
  if (config.sensorSampleRate_hz <= 0) {
    throw new Error(
      `Dream thread sensor sample rate must be > 0, got ${config.sensorSampleRate_hz}`
    );
  }

  return DormancyState.Dormant;
}

/**
 * Reactivate CCM from dormancy.
 *
 * Contract preconditions:
 *   - Current state must be Dormant
 *   - trigger is a valid ReactivationTrigger
 *
 * Contract postconditions:
 *   - Returns Active if ≥2 copies match; SafeMode otherwise
 *   - verified is true iff ≥2 copies match
 */
export function reactivateCCM(
  currentState: DormancyState,
  trigger: ReactivationTrigger,
  snapshot: ConsciousnessSnapshot
): { state: DormancyState; verification: IdentityVerificationResult } {
  // Guard: must be Dormant
  if (currentState !== DormancyState.Dormant) {
    throw new Error(
      `Cannot reactivate from state ${currentState}; must be Dormant`
    );
  }
  // Guard: valid trigger
  const validTriggers = Object.values(ReactivationTrigger);
  if (!validTriggers.includes(trigger)) {
    throw new Error(`Invalid reactivation trigger: ${trigger}`);
  }

  const matchingCopies = countMatchingCopies(snapshot.copies);
  const verified = matchingCopies >= 2;

  return {
    state: verified ? DormancyState.Active : DormancyState.SafeMode,
    verification: {
      verified,
      matchingCopies,
      failureReason: verified
        ? undefined
        : "Identity verification failed: fewer than 2 copies match",
    },
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function createDefaultCCMSpec(): CCMSpec {
  return { ...REFERENCE_CCM_SPEC };
}

export function validateCCMSpec(spec: CCMSpec): ValidationResult {
  const errors: string[] = [];

  if (spec.compute_ops_per_sec < MIN_CCM_COMPUTE) {
    errors.push(`Compute ${spec.compute_ops_per_sec} ops/s below minimum ${MIN_CCM_COMPUTE}`);
  }
  if (spec.mass_kg > MAX_CCM_MASS) {
    errors.push(`CCM mass ${spec.mass_kg} kg exceeds maximum ${MAX_CCM_MASS} kg`);
  }
  if (spec.cruise_power_watts > CRUISE_POWER) {
    errors.push(`Cruise power ${spec.cruise_power_watts} W exceeds maximum ${CRUISE_POWER} W`);
  }
  if (spec.active_power_watts > ACTIVE_POWER) {
    errors.push(`Active power ${spec.active_power_watts} W exceeds maximum ${ACTIVE_POWER} W`);
  }
  if (spec.storage_bits < MIN_STORAGE) {
    errors.push(`Storage ${spec.storage_bits} bits below minimum ${MIN_STORAGE}`);
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

  if (total > MAX_PROBE_MASS) {
    errors.push(`Total probe mass ${total} kg exceeds maximum ${MAX_PROBE_MASS} kg`);
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

export function validateLaserBoost(spec: LaserBoostSpec): ValidationResult {
  const errors: string[] = [];

  if (spec.targetVelocity_c < MIN_CRUISE_VELOCITY) {
    errors.push(
      `Target velocity ${spec.targetVelocity_c}c below minimum ${MIN_CRUISE_VELOCITY}c`
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
  // Guard: totalSwarmSize > 0
  if (totalSwarmSize <= 0) {
    throw new Error(`totalSwarmSize must be > 0, got ${totalSwarmSize}`);
  }
  // Guard: supermajorityThreshold ∈ (0.5, 1.0]
  if (
    config.supermajorityThreshold <= 0.5 ||
    config.supermajorityThreshold > 1.0
  ) {
    throw new Error(
      `supermajorityThreshold must be in (0.5, 1.0], got ${config.supermajorityThreshold}`
    );
  }
  // Guard: all votes must be for this proposal
  for (const v of votes) {
    if (v.proposalId !== proposalId) {
      throw new Error(
        `Vote for proposal ${v.proposalId} does not match ${proposalId}`
      );
    }
  }

  const approveCount = votes.filter((v) => v.value === VoteValue.Approve).length;
  const rejectCount = votes.filter((v) => v.value === VoteValue.Reject).length;
  const abstainCount = votes.filter((v) => v.value === VoteValue.Abstain).length;
  const totalResponders = votes.length;

  // Check if enough probes responded to form quorum
  const quorumReached = totalResponders >= totalSwarmSize * QUORUM_FRACTION;

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
  if (capabilityFraction >= DEGRADATION_GREEN) return DegradationLevel.Green;
  if (capabilityFraction >= DEGRADATION_YELLOW) return DegradationLevel.Yellow;
  if (capabilityFraction >= DEGRADATION_RED) return DegradationLevel.Red;
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
    health.ccm * CCM_CAPABILITY_WEIGHT +
    health.propulsion * PROPULSION_CAPABILITY_WEIGHT +
    health.sensors * SENSORS_CAPABILITY_WEIGHT +
    health.structure * STRUCTURE_CAPABILITY_WEIGHT;

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
  // Guard: mass >= 0
  if (componentMass_kg < 0) {
    throw new Error(`Component mass must be >= 0, got ${componentMass_kg}`);
  }
  return componentMass_kg <= feedstock.remaining_kg;
}

/**
 * Consume feedstock for a repair. Returns updated feedstock.
 */
export function consumeFeedstock(
  mass_kg: number,
  feedstock: RepairFeedstock
): RepairFeedstock {
  // Guard: mass > 0
  if (mass_kg <= 0) {
    throw new Error(`Feedstock consumption mass must be > 0, got ${mass_kg}`);
  }
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

  if (config.probeCount < SWARM_MIN_SIZE) {
    errors.push(`Swarm size ${config.probeCount} below minimum ${SWARM_MIN_SIZE} for redundancy`);
  }
  if (config.probeCount > SWARM_MAX_SIZE) {
    errors.push(`Swarm size ${config.probeCount} exceeds coordination maximum ${SWARM_MAX_SIZE}`);
  }
  if (config.cruiseVelocity_c < MIN_CRUISE_VELOCITY) {
    errors.push(
      `Cruise velocity ${config.cruiseVelocity_c}c below minimum ${MIN_CRUISE_VELOCITY}c`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Propulsion System ────────────────────────────────────────────────────────

/** Standard gravitational acceleration (m/s²) — physical constant */
const G0 = 9.80665;

/** Speed of light (m/s) — physical constant */
const C_M_PER_S = 299_792_458;

/**
 * Ordered propulsion phases for monotonic transition enforcement.
 * Contract invariant: phase transitions are monotonic (LaserBoost → Cruise → Deceleration → Arrived).
 */
const PHASE_ORDER: readonly PropulsionPhase[] = [
  PropulsionPhase.LaserBoost,
  PropulsionPhase.Cruise,
  PropulsionPhase.Deceleration,
  PropulsionPhase.Arrived,
] as const;

function phaseIndex(phase: PropulsionPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Create a propulsion status. Factory for immutable status objects.
 */
export function createPropulsionStatus(
  phase: PropulsionPhase = PropulsionPhase.LaserBoost,
  velocity_c: number = 0,
  fuelRemaining_kg: number = FUEL_MASS,
  magsailDeployed: boolean = false
): PropulsionStatus {
  return { phase, velocity_c, fuelRemaining_kg, magsailDeployed };
}

/**
 * Check whether a unit vector is valid (magnitude ≈ 1.0 within tolerance).
 */
function isUnitVector(dir: [number, number, number]): boolean {
  const mag = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
  return Math.abs(mag - 1.0) < 1e-6;
}

/**
 * Compute fuel consumed for a given delta-v using Tsiolkovsky rocket equation.
 * Δv = Isp × g₀ × ln(m₀/m₁)  →  m_fuel = m₀ × (1 - e^(-Δv / (Isp × g₀)))
 *
 * Uses REFERENCE_FUSION_DRIVE.specificImpulse_s and probe dry mass derived from
 * MAX_PROBE_MASS - FUEL_MASS.
 */
export function computeFuelConsumed(
  deltaV_m_per_s: number,
  currentFuel_kg: number,
  specificImpulse_s: number = REFERENCE_FUSION_DRIVE.specificImpulse_s
): number {
  const dryMass = MAX_PROBE_MASS - FUEL_MASS;
  const currentMass = dryMass + currentFuel_kg;
  const exhaustVelocity = specificImpulse_s * G0;
  const massRatio = Math.exp(deltaV_m_per_s / exhaustVelocity);
  const finalMass = currentMass / massRatio;
  return currentMass - finalMass;
}

/**
 * Execute a propulsion burn.
 *
 * Contract preconditions:
 *   - plan.deltaV_m_per_s > 0
 *   - plan.direction is a unit vector
 *   - Sufficient fuel for requested delta-v
 *
 * Contract postconditions:
 *   - Returns fuel consumed; velocity updated; fuel remaining decremented
 *
 * Contract invariant:
 *   - fuelRemaining_kg >= 0 always
 */
export function executeBurn(
  status: PropulsionStatus,
  plan: BurnPlan
): { status: PropulsionStatus; fuelUsed_kg: number } {
  // Guard: deltaV > 0
  if (plan.deltaV_m_per_s <= 0) {
    throw new Error(
      `executeBurn requires deltaV_m_per_s > 0, got ${plan.deltaV_m_per_s}`
    );
  }
  // Guard: direction is unit vector
  if (!isUnitVector(plan.direction)) {
    throw new Error(
      `executeBurn requires direction to be a unit vector`
    );
  }

  const fuelNeeded = computeFuelConsumed(
    plan.deltaV_m_per_s,
    status.fuelRemaining_kg
  );

  // Guard: sufficient fuel
  if (fuelNeeded > status.fuelRemaining_kg) {
    throw new Error(
      `Insufficient fuel: need ${fuelNeeded.toFixed(2)} kg, have ${status.fuelRemaining_kg} kg`
    );
  }

  // Compute new velocity: convert deltaV to fraction of c and add
  const deltaV_c = plan.deltaV_m_per_s / C_M_PER_S;
  const newVelocity_c = status.velocity_c + deltaV_c;
  const newFuel = status.fuelRemaining_kg - fuelNeeded;

  return {
    status: {
      ...status,
      velocity_c: newVelocity_c,
      fuelRemaining_kg: newFuel,
    },
    fuelUsed_kg: fuelNeeded,
  };
}

/**
 * Deploy magsail for deceleration.
 *
 * Contract preconditions:
 *   - Phase is Deceleration
 *   - Magsail not already deployed
 *
 * Contract postconditions:
 *   - magsailDeployed becomes true; irreversible
 */
export function deployMagsail(
  status: PropulsionStatus
): PropulsionStatus {
  // Guard: phase must be Deceleration
  if (status.phase !== PropulsionPhase.Deceleration) {
    throw new Error(
      `deployMagsail requires Deceleration phase, current phase is ${status.phase}`
    );
  }
  // Guard: magsail not already deployed
  if (status.magsailDeployed) {
    throw new Error(`Magsail already deployed; deployment is irreversible`);
  }

  return {
    ...status,
    magsailDeployed: true,
  };
}

/**
 * Advance propulsion phase. Enforces monotonic phase transitions.
 *
 * Contract invariant: phase transitions are monotonic
 *   LaserBoost → Cruise → Deceleration → Arrived
 */
export function advancePhase(
  status: PropulsionStatus,
  targetPhase: PropulsionPhase
): PropulsionStatus {
  const currentIdx = phaseIndex(status.phase);
  const targetIdx = phaseIndex(targetPhase);

  if (targetIdx <= currentIdx) {
    throw new Error(
      `Cannot transition from ${status.phase} to ${targetPhase}; phase transitions are monotonic`
    );
  }
  // Only allow advancing one step at a time
  if (targetIdx !== currentIdx + 1) {
    throw new Error(
      `Cannot skip phases: ${status.phase} → ${targetPhase}; must advance one phase at a time`
    );
  }

  return {
    ...status,
    phase: targetPhase,
  };
}

// ── Cold-Spare Assembler Activation ──────────────────────────────────────────

/**
 * Activate the cold-spare nanofabrication assembler.
 *
 * Behavioral spec (Self-Repair Flow):
 *   Given the primary nanofabrication assembler has failed
 *   When the probe needs repair capability
 *   Then the cold-spare assembler is activated (one-time irreversible transition);
 *   if cold spare is unavailable, the probe can no longer self-repair.
 *
 * Contract invariant:
 *   coldSpareAssemblerAvailable only transitions true → false (never regenerated in transit).
 */
export function activateColdSpare(
  feedstock: RepairFeedstock
): RepairFeedstock {
  if (!feedstock.coldSpareAssemblerAvailable) {
    throw new Error(
      "Cold-spare assembler unavailable; probe can no longer self-repair"
    );
  }

  return {
    ...feedstock,
    coldSpareAssemblerAvailable: false,
  };
}
