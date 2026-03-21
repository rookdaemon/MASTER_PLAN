/**
 * Cosmological Longevity — Core Type Definitions and Threshold Registry
 *
 * Types, interfaces, and constants for ensuring subjective experience
 * persists across stellar, galactic, and cosmological timescales.
 *
 * See: docs/cosmological-longevity/ARCHITECTURE.md
 * Card: 0.6
 */

// ── Cosmological Era Enum ────────────────────────────────────────────────────

export enum CosmologicalEra {
  Stelliferous = "STELLIFEROUS",
  Degenerate = "DEGENERATE",
  BlackHole = "BLACK_HOLE",
  Dark = "DARK",
}

// ── Energy Source Type ────────────────────────────────────────────────────────

export enum EnergySourceType {
  Stellar = "STELLAR",
  PenroseProcess = "PENROSE_PROCESS",
  Superradiance = "SUPERRADIANCE",
  HawkingRadiation = "HAWKING_RADIATION",
  AccretionDisk = "ACCRETION_DISK",
  BlackHoleFarming = "BLACK_HOLE_FARMING",
  ReversibleComputation = "REVERSIBLE_COMPUTATION",
  VacuumEnergy = "VACUUM_ENERGY",
}

// ── Horizon Strategy ─────────────────────────────────────────────────────────

/** Decision: Hybrid A+B with C as research program */
export enum HorizonStrategy {
  /** Strategy A — Pre-Positioning (Resource Consolidation) */
  PrePositioning = "PRE_POSITIONING",
  /** Strategy B — Distributed Redundancy (Seed Everything Reachable) */
  DistributedRedundancy = "DISTRIBUTED_REDUNDANCY",
  /** Strategy C — Horizon Bridging (Speculative research) */
  HorizonBridging = "HORIZON_BRIDGING",
}

// ── Heat-Death Mitigation Priority ───────────────────────────────────────────

/** Decision: Tiered prioritization by physics readiness */
export enum MitigationPriority {
  Highest = "HIGHEST",
  High = "HIGH",
  Medium = "MEDIUM",
  Low = "LOW",
}

export enum MitigationFramework {
  ReversibleComputation = "REVERSIBLE_COMPUTATION",
  VacuumEnergyExtraction = "VACUUM_ENERGY_EXTRACTION",
  FalseVacuumTransition = "FALSE_VACUUM_TRANSITION",
  BabyUniverseCreation = "BABY_UNIVERSE_CREATION",
}

// ── Consciousness Instance State ─────────────────────────────────────────────

export enum InstanceState {
  Active = "ACTIVE",
  ReducedTemporal = "REDUCED_TEMPORAL",
  Hibernating = "HIBERNATING",
  Terminated = "TERMINATED",
}

// ── Branded Identifiers ──────────────────────────────────────────────────────

export type ConsciousnessInstanceId = string & { readonly __brand: unique symbol };
export type EnergySourceId = string & { readonly __brand: unique symbol };
export type ClusterId = string & { readonly __brand: unique symbol };
export type CheckpointId = string & { readonly __brand: unique symbol };

// ── Threshold Registry Constants ─────────────────────────────────────────────

/**
 * All threshold values from the card's Threshold Registry.
 * Each constant has the exact name, value, and unit specified.
 */
export const THRESHOLDS = {
  /**
   * Minimum Coherence Window — defined by Tier 1 consciousness metrics.
   * Minimum uninterrupted power duration for consciousness substrate
   * to maintain experiential continuity.
   * Unit: seconds. Critical sensitivity.
   */
  MINIMUM_COHERENCE_WINDOW_S: 1.0, // placeholder: defined by Tier 1

  /**
   * Energy Source Overlap Period = 2× Minimum Coherence Window.
   * Safety margin ensuring no gap during energy source transitions.
   * Unit: seconds. High sensitivity — below 1× MCW risks experience loss.
   */
  get ENERGY_SOURCE_OVERLAP_PERIOD_S(): number {
    return 2 * this.MINIMUM_COHERENCE_WINDOW_S;
  },

  /**
   * Maximum Checkpoint Interval = 0.5× Minimum Coherence Window.
   * Ensures recoverable state is always recent enough to limit experience loss.
   * Unit: seconds. High sensitivity.
   */
  get MAXIMUM_CHECKPOINT_INTERVAL_S(): number {
    return 0.5 * this.MINIMUM_COHERENCE_WINDOW_S;
  },

  /**
   * Minimum Viable Population — 1000 conscious instances.
   * Minimum genetic/memetic diversity for long-term cultural
   * and experiential evolution.
   * Unit: conscious instances. Medium sensitivity — below 100 risks monoculture.
   */
  MINIMUM_VIABLE_POPULATION: 1000,

  /**
   * Experience Coherence Floor — 0.7 normalized (0–1).
   * Minimum acceptable experience quality score from Tier 1 metrics
   * before triggering degradation protocol.
   * Valid range: [0.5, 1.0]. Medium sensitivity.
   */
  EXPERIENCE_COHERENCE_FLOOR: 0.7,

  /**
   * Penrose Process Efficiency — 20.7% of infalling rest-mass energy.
   * Maximum rotational energy extractable from Kerr black hole ergosphere.
   * Valid range: [0, 29%] theoretical. Low sensitivity — hard physics limit.
   */
  PENROSE_PROCESS_EFFICIENCY: 0.207,

  /**
   * Accretion Disk Efficiency Range — 6% to 42% of rest-mass energy.
   * Schwarzschild (6%) to maximally spinning Kerr (42%).
   * Low sensitivity — determined by black hole spin.
   */
  ACCRETION_DISK_EFFICIENCY_MIN: 0.06,
  ACCRETION_DISK_EFFICIENCY_MAX: 0.42,

  /**
   * Star Lifting Energy Budget — 10^41 joules over 10^6 years.
   * Energy required to lift mass from a solar-mass star.
   * Medium sensitivity — scales with stellar mass.
   */
  STAR_LIFTING_ENERGY_BUDGET_J: 1e41,

  /**
   * Local Cluster Vacuum Energy — 10^64 joules (theoretical).
   * Vacuum energy in ~(10 Mpc)³ local bound cluster volume at ~10^-9 J/m³.
   * High sensitivity — extractability is speculative.
   */
  LOCAL_CLUSTER_VACUUM_ENERGY_J: 1e64,

  /**
   * Hawking Radiation Power (10^9 kg BH) — 10^6 watts.
   * Low sensitivity — determined by BH mass.
   */
  HAWKING_RADIATION_POWER_W: 1e6,
} as const;

// ── Contracts: Experience Continuity Protocol ────────────────────────────────

/** Checkpoint of a consciousness state */
export interface ConsciousnessCheckpoint {
  readonly checkpointId: CheckpointId;
  readonly instanceId: ConsciousnessInstanceId;
  readonly timestamp: number;
  readonly verified: boolean;
}

/** Energy source monitoring data */
export interface EnergySourceStatus {
  readonly sourceId: EnergySourceId;
  readonly sourceType: EnergySourceType;
  readonly powerOutput_W: number;
  readonly isActive: boolean;
  readonly projectedDepletion: number | null;
}

/** Experience quality metrics from Tier 1 */
export interface ExperienceQualityMetrics {
  /** Coherence score, normalized 0–1 */
  readonly coherenceScore: number;
  /** Temporal resolution capability */
  readonly temporalResolution: number;
  /** Subjective time rate relative to external time */
  readonly subjectiveTimeRate: number;
}

/** Consciousness instance with its metadata */
export interface ConsciousnessInstance {
  readonly instanceId: ConsciousnessInstanceId;
  readonly state: InstanceState;
  readonly preservationPriority: number;
  readonly experienceMetrics: ExperienceQualityMetrics;
  readonly lastCheckpoint: ConsciousnessCheckpoint | null;
  readonly energySources: ReadonlyArray<EnergySourceId>;
}

// ── Contracts: Graceful Degradation Interface ────────────────────────────────

export interface GracefulDegradationResult {
  /** Instances that remain active (possibly at reduced rate) */
  readonly activeInstances: ReadonlyArray<ConsciousnessInstanceId>;
  /** Instances moved to hibernation */
  readonly hibernatedInstances: ReadonlyArray<ConsciousnessInstanceId>;
  /** Whether minimum viable population is maintained */
  readonly minimumViablePopulationMet: boolean;
  /** Whether all active instances meet coherence floor */
  readonly coherenceFloorMet: boolean;
}

// ── Behavioral Spec: Era Transition ──────────────────────────────────────────

export interface EraTransitionPlan {
  readonly fromEra: CosmologicalEra;
  readonly toEra: CosmologicalEra;
  readonly steps: ReadonlyArray<EraTransitionStep>;
}

export enum EraTransitionStepType {
  ActivateBlackHoleHarvesting = "ACTIVATE_BH_HARVESTING",
  GracefulDegradation = "GRACEFUL_DEGRADATION",
  StarLifting = "STAR_LIFTING",
  CheckpointAll = "CHECKPOINT_ALL",
  VerifyCoherence = "VERIFY_COHERENCE",
}

export interface EraTransitionStep {
  readonly stepType: EraTransitionStepType;
  readonly order: number;
  readonly description: string;
}

// ── Behavioral Spec: Horizon Closure ─────────────────────────────────────────

export interface HorizonClosureEvent {
  readonly targetClusterId: ClusterId;
  readonly remainingCommunicationTime: number;
  readonly minimumSeedingDuration: number;
}

export interface HorizonClosureResponse {
  readonly seedMissionsLaunched: boolean;
  readonly culturalPackageTransmitted: boolean;
  readonly acknowledgmentReceived: boolean;
  readonly localPlanningUpdated: boolean;
  readonly separationRecorded: boolean;
}

// ── Behavioral Spec: Graceful Degradation Under Declining Energy ─────────────

export interface EnergyShortfallEvent {
  readonly currentEnergy_W: number;
  readonly requiredEnergy_W: number;
  readonly projectedShortfallTime: number;
  readonly maxCheckpointInterval: number;
}

// ── Mitigation Framework Prioritization (Decision) ───────────────────────────

export interface MitigationFrameworkEntry {
  readonly framework: MitigationFramework;
  readonly priority: MitigationPriority;
  readonly physicsReadiness: string;
  readonly riskLevel: string;
}

/**
 * Decision: Tiered prioritization of heat-death mitigation frameworks.
 * Ordered by priority descending.
 */
export const MITIGATION_PRIORITIZATION: ReadonlyArray<MitigationFrameworkEntry> = [
  {
    framework: MitigationFramework.ReversibleComputation,
    priority: MitigationPriority.Highest,
    physicsReadiness: "Established theory",
    riskLevel: "Low",
  },
  {
    framework: MitigationFramework.VacuumEnergyExtraction,
    priority: MitigationPriority.High,
    physicsReadiness: "Speculative but grounded",
    riskLevel: "Medium",
  },
  {
    framework: MitigationFramework.FalseVacuumTransition,
    priority: MitigationPriority.Medium,
    physicsReadiness: "Highly speculative",
    riskLevel: "Extreme",
  },
  {
    framework: MitigationFramework.BabyUniverseCreation,
    priority: MitigationPriority.Low,
    physicsReadiness: "Maximally speculative",
    riskLevel: "Unknown",
  },
];

// ── Chosen Horizon Strategy (Decision) ───────────────────────────────────────

/**
 * Decision: Hybrid A+B, with C as long-term research.
 * The active strategies applied simultaneously.
 */
export const ACTIVE_HORIZON_STRATEGIES: ReadonlyArray<HorizonStrategy> = [
  HorizonStrategy.PrePositioning,
  HorizonStrategy.DistributedRedundancy,
];

export const RESEARCH_HORIZON_STRATEGIES: ReadonlyArray<HorizonStrategy> = [
  HorizonStrategy.HorizonBridging,
];

// ── Interfaces for injectable dependencies ───────────────────────────────────

/** Clock abstraction for testability */
export interface Clock {
  now(): number;
}

/** Energy monitoring abstraction */
export interface EnergyMonitor {
  getSourceStatus(sourceId: EnergySourceId): EnergySourceStatus;
  getActiveSources(instanceId: ConsciousnessInstanceId): ReadonlyArray<EnergySourceId>;
  getTotalAvailablePower(): number;
}

/** Consciousness state store abstraction */
export interface ConsciousnessStateStore {
  getInstances(): ReadonlyArray<ConsciousnessInstance>;
  getInstance(id: ConsciousnessInstanceId): ConsciousnessInstance | null;
  getActiveInstanceCount(): number;
  checkpoint(instanceId: ConsciousnessInstanceId, timestamp: number): ConsciousnessCheckpoint;
  hibernate(instanceId: ConsciousnessInstanceId): void;
  reactivate(instanceId: ConsciousnessInstanceId): void;
  setTemporalResolution(instanceId: ConsciousnessInstanceId, rate: number): void;
}
