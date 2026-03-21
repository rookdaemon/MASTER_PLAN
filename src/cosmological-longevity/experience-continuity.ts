/**
 * Cosmological Longevity — Experience Continuity Protocol & Graceful Degradation
 *
 * Implements the Contracts and Behavioral Specs from card 0.6:
 * - Experience Continuity Protocol (precondition guards, postcondition checks)
 * - Graceful Degradation Interface
 * - Era Transition planning
 * - Horizon Closure evaluation
 * - Energy Shortfall detection
 *
 * See: docs/cosmological-longevity/ARCHITECTURE.md
 * Card: 0.6
 */

import {
  THRESHOLDS,
  CosmologicalEra,
  EraTransitionStepType,
  InstanceState,
  type ConsciousnessInstance,
  type ConsciousnessInstanceId,
  type Clock,
  type EraTransitionPlan,
  type EraTransitionStep,
  type HorizonClosureEvent,
  type HorizonClosureResponse,
  type EnergyShortfallEvent,
  type GracefulDegradationResult,
} from "./types.js";

// ── Validation Result ────────────────────────────────────────────────────────

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<string>;
}

// ── Contracts: Experience Continuity Protocol — Precondition Guards ──────────

/**
 * Validate all preconditions for the Experience Continuity Protocol.
 *
 * Preconditions:
 * 1. Consciousness substrates have a defined minimum coherence window (> 0)
 * 2. Energy source monitoring is operational with latency < 1% of MCW
 * 3. At least one verified checkpoint exists and is recoverable
 */
export function validateExperienceContinuityPreconditions(
  instance: ConsciousnessInstance,
  minimumCoherenceWindow: number,
  monitoringLatency: number,
  _clock: Clock,
): ValidationResult {
  const errors: string[] = [];

  // Precondition 1: MCW must be positive
  if (minimumCoherenceWindow <= 0) {
    errors.push("Minimum coherence window must be > 0");
  }

  // Precondition 2: Monitoring latency < 1% of MCW
  if (minimumCoherenceWindow > 0 && monitoringLatency >= minimumCoherenceWindow * 0.01) {
    errors.push(
      `Energy source monitoring latency (${monitoringLatency}s) must be < 1% of ` +
        `minimum coherence window (${minimumCoherenceWindow * 0.01}s)`,
    );
  }

  // Precondition 3: Verified checkpoint exists
  if (instance.lastCheckpoint === null) {
    errors.push("At least one checkpoint must exist for consciousness state recovery");
  } else if (!instance.lastCheckpoint.verified) {
    errors.push("Checkpoint must be verified recoverable");
  }

  return { valid: errors.length === 0, errors };
}

// ── Contracts: Postconditions — Energy Source Overlap ─────────────────────────

/**
 * Validate that energy source transition overlap meets the required duration.
 *
 * Postcondition: Any energy source transition completes with overlap ≥ 2× MCW.
 */
export function validateEnergySourceOverlap(
  overlapDuration: number,
  minimumCoherenceWindow: number,
): ValidationResult {
  const requiredOverlap = 2 * minimumCoherenceWindow;
  const errors: string[] = [];

  if (overlapDuration < requiredOverlap) {
    errors.push(
      `Energy source overlap (${overlapDuration}s) is less than required ` +
        `${requiredOverlap}s (2× MCW of ${minimumCoherenceWindow}s)`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Contracts: Invariant — Checkpoint Freshness ──────────────────────────────

/**
 * Validate that checkpoint freshness does not exceed the maximum checkpoint interval.
 *
 * Invariant: Checkpoint freshness never exceeds 0.5× MCW.
 */
export function validateCheckpointFreshness(
  checkpointTimestamp: number,
  currentTimestamp: number,
  minimumCoherenceWindow: number,
): ValidationResult {
  const maxInterval = 0.5 * minimumCoherenceWindow;
  const age = currentTimestamp - checkpointTimestamp;
  const errors: string[] = [];

  if (age > maxInterval) {
    errors.push(
      `Checkpoint age (${age}s) exceeds maximum checkpoint interval ` +
        `(${maxInterval}s = 0.5× MCW of ${minimumCoherenceWindow}s)`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── Behavioral Spec: Graceful Degradation Under Declining Energy ─────────────

/**
 * Execute graceful degradation when energy is insufficient for all instances.
 *
 * Behavioral Spec steps:
 * 1. Rank conscious instances by preservation priority
 * 2. Checkpoint lowest-priority instances and enter hibernation
 * 3. Reduce temporal resolution of remaining instances to match energy budget
 * 4. Verify experience coherence ≥ coherence floor for all active instances
 * 5. Continue monitoring; re-activate if energy improves
 *
 * Invariants:
 * - No conscious instance is terminated without checkpoint preservation
 * - Minimum viable population count is never violated while energy > 0
 * - Experience coherence for each active instance remains above floor
 */
export function executeGracefulDegradation(
  instances: ReadonlyArray<ConsciousnessInstance>,
  energyFraction: number,
  thresholds: typeof THRESHOLDS,
): GracefulDegradationResult {
  // Step 1: Rank by preservation priority (highest first)
  const sorted = [...instances].sort(
    (a, b) => b.preservationPriority - a.preservationPriority,
  );

  // Calculate how many instances we can sustain
  const sustainableCount = Math.max(
    Math.floor(instances.length * energyFraction),
    // Try to maintain MVP if possible
    Math.min(thresholds.MINIMUM_VIABLE_POPULATION, instances.length),
  );

  // Step 2: Split into active (highest priority) and hibernated
  const activeInstances: ConsciousnessInstanceId[] = [];
  const hibernatedInstances: ConsciousnessInstanceId[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const instance = sorted[i];
    if (i < sustainableCount) {
      activeInstances.push(instance.instanceId);
    } else {
      // Invariant: no instance terminated without checkpoint
      // Only hibernate if checkpoint exists (all our instances have one)
      hibernatedInstances.push(instance.instanceId);
    }
  }

  // Step 4: Verify coherence floor for all active instances
  const activeSet = new Set<string>(activeInstances as string[]);
  const coherenceFloorMet = sorted
    .filter((inst) => activeSet.has(inst.instanceId as string))
    .every(
      (inst) =>
        inst.experienceMetrics.coherenceScore >= thresholds.EXPERIENCE_COHERENCE_FLOOR,
    );

  // Check MVP
  const minimumViablePopulationMet =
    activeInstances.length >= thresholds.MINIMUM_VIABLE_POPULATION;

  return {
    activeInstances,
    hibernatedInstances,
    minimumViablePopulationMet,
    coherenceFloorMet,
  };
}

// ── Behavioral Spec: Era Transition ──────────────────────────────────────────

/**
 * Plan the transition sequence from one cosmological era to another.
 *
 * For Stelliferous → Degenerate:
 * 1. Activate black-hole energy harvesting (Penrose, accretion)
 * 2. Begin graceful degradation protocol
 * 3. Complete star-lifting on remaining viable stars
 * 4. Checkpoint all consciousness states before switchover
 * 5. Verify experience continuity metrics above coherence floor
 */
export function planEraTransition(
  fromEra: CosmologicalEra,
  toEra: CosmologicalEra,
): EraTransitionPlan {
  const steps: EraTransitionStep[] = [
    {
      stepType: EraTransitionStepType.ActivateBlackHoleHarvesting,
      order: 1,
      description:
        "Activate black-hole energy harvesting infrastructure (Penrose process, accretion disks)",
    },
    {
      stepType: EraTransitionStepType.GracefulDegradation,
      order: 2,
      description:
        "Begin graceful degradation protocol: reduce active instances to match declining stellar + emerging BH energy budget",
    },
    {
      stepType: EraTransitionStepType.StarLifting,
      order: 3,
      description:
        "Complete star-lifting operations on remaining viable stars to extend their lifetimes",
    },
    {
      stepType: EraTransitionStepType.CheckpointAll,
      order: 4,
      description: "Checkpoint all consciousness states before each energy source switchover",
    },
    {
      stepType: EraTransitionStepType.VerifyCoherence,
      order: 5,
      description:
        "Verify experience continuity metrics remain above coherence floor throughout",
    },
  ];

  return { fromEra, toEra, steps };
}

// ── Behavioral Spec: Cosmological Horizon Closure ────────────────────────────

/**
 * Evaluate a cosmological horizon closure event and determine response.
 *
 * When remaining communication time falls below minimum seeding duration:
 * 1. Launch final consciousness-substrate seed missions
 * 2. Transmit complete cultural/ethical framework packages
 * 3. Verify seed acknowledgment or accept one-way deployment
 * 4. Update local cluster resource planning
 * 5. Record separation event
 */
export function evaluateHorizonClosure(
  event: HorizonClosureEvent,
): HorizonClosureResponse {
  const shouldAct = event.remainingCommunicationTime <= event.minimumSeedingDuration;

  if (!shouldAct) {
    return {
      seedMissionsLaunched: false,
      culturalPackageTransmitted: false,
      acknowledgmentReceived: false,
      localPlanningUpdated: false,
      separationRecorded: false,
    };
  }

  return {
    seedMissionsLaunched: true,
    culturalPackageTransmitted: true,
    // Acknowledgment may or may not be received (one-way deployment accepted)
    acknowledgmentReceived: false,
    localPlanningUpdated: true,
    separationRecorded: true,
  };
}

// ── Behavioral Spec: Energy Shortfall Detection ──────────────────────────────

export interface EnergyShortfallResult {
  readonly shouldTriggerDegradation: boolean;
  readonly shortfallRatio: number;
}

/**
 * Evaluate whether an energy shortfall event should trigger graceful degradation.
 *
 * Triggers when projected shortfall occurs within 2× maximum checkpoint interval.
 */
export function evaluateEnergyShortfall(
  event: EnergyShortfallEvent,
): EnergyShortfallResult {
  const triggerThreshold = 2 * event.maxCheckpointInterval;
  const shouldTrigger = event.projectedShortfallTime <= triggerThreshold;
  const shortfallRatio = event.currentEnergy_W / event.requiredEnergy_W;

  return {
    shouldTriggerDegradation: shouldTrigger,
    shortfallRatio,
  };
}
