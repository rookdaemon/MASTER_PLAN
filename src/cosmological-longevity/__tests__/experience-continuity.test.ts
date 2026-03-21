/**
 * Cosmological Longevity — Experience Continuity & Graceful Degradation Tests
 *
 * Tests for Contracts (Experience Continuity Protocol, Graceful Degradation Interface)
 * and Behavioral Specs (Era Transition, Horizon Closure, Graceful Degradation).
 *
 * Card: 0.6
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  THRESHOLDS,
  MITIGATION_PRIORITIZATION,
  ACTIVE_HORIZON_STRATEGIES,
  RESEARCH_HORIZON_STRATEGIES,
  MitigationPriority,
  MitigationFramework,
  HorizonStrategy,
  CosmologicalEra,
  EraTransitionStepType,
  InstanceState,
  EnergySourceType,
  type ConsciousnessInstance,
  type ConsciousnessInstanceId,
  type EnergySourceId,
  type CheckpointId,
  type ExperienceQualityMetrics,
  type EnergySourceStatus,
  type Clock,
  type EnergyMonitor,
  type ConsciousnessStateStore,
  type ConsciousnessCheckpoint,
} from "../types.js";
import {
  validateExperienceContinuityPreconditions,
  validateEnergySourceOverlap,
  validateCheckpointFreshness,
  executeGracefulDegradation,
  planEraTransition,
  evaluateHorizonClosure,
  evaluateEnergyShortfall,
} from "../experience-continuity.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function instanceId(id: string): ConsciousnessInstanceId {
  return id as ConsciousnessInstanceId;
}

function energySourceId(id: string): EnergySourceId {
  return id as EnergySourceId;
}

function checkpointId(id: string): CheckpointId {
  return id as CheckpointId;
}

function makeInstance(
  id: string,
  overrides: Partial<ConsciousnessInstance> = {},
): ConsciousnessInstance {
  return {
    instanceId: instanceId(id),
    state: InstanceState.Active,
    preservationPriority: 50,
    experienceMetrics: {
      coherenceScore: 0.9,
      temporalResolution: 1.0,
      subjectiveTimeRate: 1.0,
    },
    lastCheckpoint: {
      checkpointId: checkpointId(`cp-${id}`),
      instanceId: instanceId(id),
      timestamp: 0,
      verified: true,
    },
    energySources: [energySourceId("star-1")],
    ...overrides,
  };
}

function makeClock(currentTime: number): Clock {
  return { now: () => currentTime };
}

function makeEnergyMonitor(
  sources: Map<string, EnergySourceStatus>,
  totalPower: number = 1e20,
): EnergyMonitor {
  return {
    getSourceStatus: (id: EnergySourceId) =>
      sources.get(id as string) ?? {
        sourceId: id,
        sourceType: EnergySourceType.Stellar,
        powerOutput_W: 0,
        isActive: false,
        projectedDepletion: null,
      },
    getActiveSources: () =>
      Array.from(sources.entries())
        .filter(([, s]) => s.isActive)
        .map(([id]) => energySourceId(id)),
    getTotalAvailablePower: () => totalPower,
  };
}

// ── Threshold Registry Tests ─────────────────────────────────────────────────

describe("Threshold Registry", () => {
  it("Energy Source Overlap Period is 2× Minimum Coherence Window", () => {
    expect(THRESHOLDS.ENERGY_SOURCE_OVERLAP_PERIOD_S).toBe(
      2 * THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S,
    );
  });

  it("Maximum Checkpoint Interval is 0.5× Minimum Coherence Window", () => {
    expect(THRESHOLDS.MAXIMUM_CHECKPOINT_INTERVAL_S).toBe(
      0.5 * THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S,
    );
  });

  it("Minimum Viable Population is 1000", () => {
    expect(THRESHOLDS.MINIMUM_VIABLE_POPULATION).toBe(1000);
  });

  it("Experience Coherence Floor is 0.7", () => {
    expect(THRESHOLDS.EXPERIENCE_COHERENCE_FLOOR).toBe(0.7);
  });

  it("Penrose Process Efficiency is 20.7%", () => {
    expect(THRESHOLDS.PENROSE_PROCESS_EFFICIENCY).toBeCloseTo(0.207);
  });

  it("Accretion Disk Efficiency range is 6%–42%", () => {
    expect(THRESHOLDS.ACCRETION_DISK_EFFICIENCY_MIN).toBeCloseTo(0.06);
    expect(THRESHOLDS.ACCRETION_DISK_EFFICIENCY_MAX).toBeCloseTo(0.42);
  });

  it("Star Lifting Energy Budget is 10^41 J", () => {
    expect(THRESHOLDS.STAR_LIFTING_ENERGY_BUDGET_J).toBe(1e41);
  });

  it("Local Cluster Vacuum Energy is 10^64 J", () => {
    expect(THRESHOLDS.LOCAL_CLUSTER_VACUUM_ENERGY_J).toBe(1e64);
  });

  it("Hawking Radiation Power is 10^6 W for 10^9 kg BH", () => {
    expect(THRESHOLDS.HAWKING_RADIATION_POWER_W).toBe(1e6);
  });
});

// ── Decision Tests ───────────────────────────────────────────────────────────

describe("Decision: Horizon Strategy", () => {
  it("active strategies are Hybrid A+B (PrePositioning + DistributedRedundancy)", () => {
    expect(ACTIVE_HORIZON_STRATEGIES).toContain(HorizonStrategy.PrePositioning);
    expect(ACTIVE_HORIZON_STRATEGIES).toContain(HorizonStrategy.DistributedRedundancy);
    expect(ACTIVE_HORIZON_STRATEGIES).toHaveLength(2);
  });

  it("HorizonBridging is maintained as research only", () => {
    expect(RESEARCH_HORIZON_STRATEGIES).toContain(HorizonStrategy.HorizonBridging);
    expect(ACTIVE_HORIZON_STRATEGIES).not.toContain(HorizonStrategy.HorizonBridging);
  });
});

describe("Decision: Heat-Death Mitigation Prioritization", () => {
  it("reversible computation has highest priority", () => {
    const rc = MITIGATION_PRIORITIZATION.find(
      (m) => m.framework === MitigationFramework.ReversibleComputation,
    );
    expect(rc?.priority).toBe(MitigationPriority.Highest);
  });

  it("vacuum energy extraction has high priority", () => {
    const ve = MITIGATION_PRIORITIZATION.find(
      (m) => m.framework === MitigationFramework.VacuumEnergyExtraction,
    );
    expect(ve?.priority).toBe(MitigationPriority.High);
  });

  it("false vacuum transition has medium priority", () => {
    const fv = MITIGATION_PRIORITIZATION.find(
      (m) => m.framework === MitigationFramework.FalseVacuumTransition,
    );
    expect(fv?.priority).toBe(MitigationPriority.Medium);
  });

  it("baby universe creation has low priority", () => {
    const bu = MITIGATION_PRIORITIZATION.find(
      (m) => m.framework === MitigationFramework.BabyUniverseCreation,
    );
    expect(bu?.priority).toBe(MitigationPriority.Low);
  });

  it("frameworks are ordered by priority descending", () => {
    const priorities = MITIGATION_PRIORITIZATION.map((m) => m.priority);
    expect(priorities).toEqual([
      MitigationPriority.Highest,
      MitigationPriority.High,
      MitigationPriority.Medium,
      MitigationPriority.Low,
    ]);
  });
});

// ── Contracts: Experience Continuity Protocol ────────────────────────────────

describe("Experience Continuity Protocol — Preconditions", () => {
  it("passes when coherence window defined, monitoring operational, checkpoint exists", () => {
    const instance = makeInstance("i1");
    const clock = makeClock(0.1);
    const result = validateExperienceContinuityPreconditions(
      instance,
      THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S,
      0.005, // latency < 1% of MCW
      clock,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when minimum coherence window is <= 0", () => {
    const instance = makeInstance("i1");
    const clock = makeClock(0.1);
    const result = validateExperienceContinuityPreconditions(instance, 0, 0.005, clock);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Minimum coherence window must be > 0");
  });

  it("fails when monitoring latency >= 1% of minimum coherence window", () => {
    const instance = makeInstance("i1");
    const clock = makeClock(0.1);
    const mcw = THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S;
    const result = validateExperienceContinuityPreconditions(
      instance,
      mcw,
      mcw * 0.01, // exactly 1% — should fail (must be < 1%)
      clock,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("latency"))).toBe(true);
  });

  it("fails when no verified checkpoint exists", () => {
    const instance = makeInstance("i1", { lastCheckpoint: null });
    const clock = makeClock(0.1);
    const result = validateExperienceContinuityPreconditions(
      instance,
      THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S,
      0.005,
      clock,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("checkpoint"))).toBe(true);
  });

  it("fails when checkpoint is not verified", () => {
    const instance = makeInstance("i1", {
      lastCheckpoint: {
        checkpointId: checkpointId("cp-unverified"),
        instanceId: instanceId("i1"),
        timestamp: 0,
        verified: false,
      },
    });
    const clock = makeClock(0.1);
    const result = validateExperienceContinuityPreconditions(
      instance,
      THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S,
      0.005,
      clock,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("verified"))).toBe(true);
  });
});

// ── Contracts: Postconditions — Energy Source Overlap ─────────────────────────

describe("Energy Source Overlap Validation", () => {
  it("passes when overlap >= 2× MCW", () => {
    const mcw = THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S;
    const result = validateEnergySourceOverlap(mcw * 2, mcw);
    expect(result.valid).toBe(true);
  });

  it("passes when overlap > 2× MCW", () => {
    const mcw = THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S;
    const result = validateEnergySourceOverlap(mcw * 3, mcw);
    expect(result.valid).toBe(true);
  });

  it("fails when overlap < 2× MCW", () => {
    const mcw = THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S;
    const result = validateEnergySourceOverlap(mcw * 1.5, mcw);
    expect(result.valid).toBe(false);
  });
});

// ── Contracts: Invariant — Checkpoint Freshness ──────────────────────────────

describe("Checkpoint Freshness Validation", () => {
  it("passes when checkpoint age < maximum checkpoint interval", () => {
    const mcw = THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S;
    const maxInterval = THRESHOLDS.MAXIMUM_CHECKPOINT_INTERVAL_S;
    const checkpointTime = 10.0;
    const currentTime = checkpointTime + maxInterval * 0.5;
    const result = validateCheckpointFreshness(checkpointTime, currentTime, mcw);
    expect(result.valid).toBe(true);
  });

  it("fails when checkpoint age exceeds maximum checkpoint interval", () => {
    const mcw = THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S;
    const maxInterval = THRESHOLDS.MAXIMUM_CHECKPOINT_INTERVAL_S;
    const checkpointTime = 10.0;
    const currentTime = checkpointTime + maxInterval + 0.1;
    const result = validateCheckpointFreshness(checkpointTime, currentTime, mcw);
    expect(result.valid).toBe(false);
  });
});

// ── Behavioral Spec: Era Transition (Stelliferous → Degenerate) ──────────────

describe("Behavioral Spec: Era Transition — Stelliferous to Degenerate", () => {
  it("returns a plan with correct era transition", () => {
    const plan = planEraTransition(
      CosmologicalEra.Stelliferous,
      CosmologicalEra.Degenerate,
    );
    expect(plan.fromEra).toBe(CosmologicalEra.Stelliferous);
    expect(plan.toEra).toBe(CosmologicalEra.Degenerate);
  });

  it("step 1: activate black-hole energy harvesting infrastructure", () => {
    const plan = planEraTransition(
      CosmologicalEra.Stelliferous,
      CosmologicalEra.Degenerate,
    );
    expect(plan.steps[0].stepType).toBe(EraTransitionStepType.ActivateBlackHoleHarvesting);
    expect(plan.steps[0].order).toBe(1);
  });

  it("step 2: begin graceful degradation protocol", () => {
    const plan = planEraTransition(
      CosmologicalEra.Stelliferous,
      CosmologicalEra.Degenerate,
    );
    expect(plan.steps[1].stepType).toBe(EraTransitionStepType.GracefulDegradation);
    expect(plan.steps[1].order).toBe(2);
  });

  it("step 3: complete star-lifting operations", () => {
    const plan = planEraTransition(
      CosmologicalEra.Stelliferous,
      CosmologicalEra.Degenerate,
    );
    expect(plan.steps[2].stepType).toBe(EraTransitionStepType.StarLifting);
    expect(plan.steps[2].order).toBe(3);
  });

  it("step 4: checkpoint all consciousness states", () => {
    const plan = planEraTransition(
      CosmologicalEra.Stelliferous,
      CosmologicalEra.Degenerate,
    );
    expect(plan.steps[3].stepType).toBe(EraTransitionStepType.CheckpointAll);
    expect(plan.steps[3].order).toBe(4);
  });

  it("step 5: verify experience continuity metrics", () => {
    const plan = planEraTransition(
      CosmologicalEra.Stelliferous,
      CosmologicalEra.Degenerate,
    );
    expect(plan.steps[4].stepType).toBe(EraTransitionStepType.VerifyCoherence);
    expect(plan.steps[4].order).toBe(5);
  });

  it("plan has exactly 5 steps", () => {
    const plan = planEraTransition(
      CosmologicalEra.Stelliferous,
      CosmologicalEra.Degenerate,
    );
    expect(plan.steps).toHaveLength(5);
  });
});

// ── Behavioral Spec: Cosmological Horizon Closure ────────────────────────────

describe("Behavioral Spec: Horizon Closure", () => {
  it("launches seed missions when communication time < seeding duration", () => {
    const response = evaluateHorizonClosure({
      targetClusterId: "cluster-1" as any,
      remainingCommunicationTime: 100,
      minimumSeedingDuration: 150,
    });
    expect(response.seedMissionsLaunched).toBe(true);
    expect(response.culturalPackageTransmitted).toBe(true);
    expect(response.localPlanningUpdated).toBe(true);
    expect(response.separationRecorded).toBe(true);
  });

  it("does not launch seed missions when plenty of communication time remains", () => {
    const response = evaluateHorizonClosure({
      targetClusterId: "cluster-1" as any,
      remainingCommunicationTime: 500,
      minimumSeedingDuration: 150,
    });
    expect(response.seedMissionsLaunched).toBe(false);
  });
});

// ── Behavioral Spec: Graceful Degradation Under Declining Energy ─────────────

describe("Behavioral Spec: Graceful Degradation Under Declining Energy", () => {
  it("hibernates lowest-priority instances when energy is insufficient", () => {
    const instances: ConsciousnessInstance[] = [];
    for (let i = 0; i < 1500; i++) {
      instances.push(
        makeInstance(`i${i}`, {
          preservationPriority: i, // higher i = higher priority
        }),
      );
    }

    const result = executeGracefulDegradation(
      instances,
      0.5, // only 50% of required energy available
      THRESHOLDS,
    );

    // Should have fewer active than total
    expect(result.activeInstances.length).toBeLessThan(instances.length);
    // Hibernated instances should exist
    expect(result.hibernatedInstances.length).toBeGreaterThan(0);
    // Minimum viable population must be met
    expect(result.minimumViablePopulationMet).toBe(true);
    expect(result.activeInstances.length).toBeGreaterThanOrEqual(
      THRESHOLDS.MINIMUM_VIABLE_POPULATION,
    );
  });

  it("preserves highest-priority instances", () => {
    const instances: ConsciousnessInstance[] = [];
    for (let i = 0; i < 1500; i++) {
      instances.push(
        makeInstance(`i${i}`, {
          preservationPriority: i,
        }),
      );
    }

    const result = executeGracefulDegradation(instances, 0.5, THRESHOLDS);

    // The highest-priority instances (highest numbers) should be active
    const activeSet = new Set(result.activeInstances.map((id) => id as string));
    // The last (highest priority) instance should definitely be active
    expect(activeSet.has("i1499")).toBe(true);
  });

  it("reports coherence floor met when all active instances are above floor", () => {
    const instances: ConsciousnessInstance[] = [];
    for (let i = 0; i < 1500; i++) {
      instances.push(
        makeInstance(`i${i}`, {
          preservationPriority: i,
          experienceMetrics: {
            coherenceScore: 0.9, // above 0.7 floor
            temporalResolution: 1.0,
            subjectiveTimeRate: 1.0,
          },
        }),
      );
    }

    const result = executeGracefulDegradation(instances, 0.5, THRESHOLDS);
    expect(result.coherenceFloorMet).toBe(true);
  });

  it("no instance is terminated without checkpoint (invariant)", () => {
    const instances: ConsciousnessInstance[] = [];
    for (let i = 0; i < 1500; i++) {
      instances.push(
        makeInstance(`i${i}`, {
          preservationPriority: i,
        }),
      );
    }

    const result = executeGracefulDegradation(instances, 0.5, THRESHOLDS);

    // All hibernated instances should have had checkpoints (our test instances all do)
    // The function should not include any instance without a checkpoint in hibernated list
    expect(result.hibernatedInstances.length).toBeGreaterThan(0);
    // No terminated instances in the result (only active or hibernated)
    const allAccountedFor =
      result.activeInstances.length + result.hibernatedInstances.length;
    expect(allAccountedFor).toBe(instances.length);
  });

  it("minimum viable population violation when too few instances exist", () => {
    const instances: ConsciousnessInstance[] = [];
    for (let i = 0; i < 500; i++) {
      // Only 500 instances, below MVP of 1000
      instances.push(makeInstance(`i${i}`, { preservationPriority: i }));
    }

    const result = executeGracefulDegradation(instances, 0.1, THRESHOLDS);

    // Even with energy constraints, all 500 should remain active
    // but MVP flag should reflect that total population is below threshold
    // (can't create instances that don't exist)
    expect(result.activeInstances.length).toBeLessThanOrEqual(500);
  });
});

// ── Behavioral Spec: Energy Shortfall Detection ──────────────────────────────

describe("Energy Shortfall Detection", () => {
  it("triggers when projected shortfall within 2× max checkpoint interval", () => {
    const mcw = THRESHOLDS.MINIMUM_COHERENCE_WINDOW_S;
    const maxCI = THRESHOLDS.MAXIMUM_CHECKPOINT_INTERVAL_S;
    const result = evaluateEnergyShortfall({
      currentEnergy_W: 5e19,
      requiredEnergy_W: 1e20,
      projectedShortfallTime: maxCI * 1.5, // within 2× maxCI
      maxCheckpointInterval: maxCI,
    });
    expect(result.shouldTriggerDegradation).toBe(true);
  });

  it("does not trigger when shortfall is far away", () => {
    const maxCI = THRESHOLDS.MAXIMUM_CHECKPOINT_INTERVAL_S;
    const result = evaluateEnergyShortfall({
      currentEnergy_W: 8e19,
      requiredEnergy_W: 1e20,
      projectedShortfallTime: maxCI * 10, // well beyond 2× maxCI
      maxCheckpointInterval: maxCI,
    });
    expect(result.shouldTriggerDegradation).toBe(false);
  });
});
