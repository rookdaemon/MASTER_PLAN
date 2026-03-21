/**
 * Space-Based Consciousness Infrastructure — Type Definitions
 *
 * Mechanical translation of the 5 Subsystem Interface Contracts
 * from card 0.4.1.1 and ARCHITECTURE.md § Key Subsystem Contracts.
 *
 * Also includes types for Behavioral Spec scenarios (self-repair,
 * divergence detection, eclipse power management) and platform
 * configuration.
 */

import {
  PlatformTier,
  SyncLagClass,
  RadiationHardeningStrategy,
  TierCPowerSource,
  TierCThermalStrategy,
  CommunicationProtocol,
} from "./constants.js";

// ── Environment Abstractions (per CLAUDE.md: injectable & mockable) ─────────

/** Clock abstraction for testable time handling */
export interface Clock {
  now(): number; // epoch ms
}

/** Random source abstraction for testable stochastic behavior */
export interface RandomSource {
  /** Returns a value in [0, 1) */
  next(): number;
}

// ── 1. Radiation Hardening Interface ────────────────────────────────────────

/** Single-event upset log entry */
export interface SEULogEntry {
  readonly timestampMs: number;
  readonly moduleId: string;
  readonly bitAddress: number;
  readonly corrected: boolean;
}

/** Radiation telemetry snapshot */
export interface RadiationTelemetry {
  readonly timestampMs: number;
  /** Particle flux in particles/cm²/s */
  readonly particleFlux: number;
  /** Cumulative total ionising dose in krad */
  readonly cumulativeTIDKrad: number;
  /** Recent SEU rate in upsets/bit/day */
  readonly seuRate: number;
  /** Whether a solar particle event is active */
  readonly solarParticleEventActive: boolean;
}

/** Radiation hardening subsystem output */
export interface RadiationHardeningOutput {
  /** Error-corrected computation state (true = state is clean) */
  readonly stateCorrected: boolean;
  /** IDs of modules isolated due to faults */
  readonly isolatedModuleIds: readonly string[];
  /** Current scrub interval in ms */
  readonly currentScrubIntervalMs: number;
  /** Current MTBF estimate in hours */
  readonly estimatedMTBFHours: number;
}

/** Contract: Radiation Hardening Interface (Subsystem 1) */
export interface RadiationHardeningInterface {
  processRadiationTelemetry(
    telemetry: RadiationTelemetry,
    seuLog: readonly SEULogEntry[],
    tier: PlatformTier,
    timestampMs: number,
  ): RadiationHardeningOutput;
}

// ── 2. Thermal Management Interface ────────────────────────────────────────

/** Heat map entry for a substrate module */
export interface HeatMapEntry {
  readonly moduleId: string;
  /** Heat dissipation in watts */
  readonly dissipationW: number;
  /** Current temperature in °C */
  readonly temperatureC: number;
}

/** Shadow schedule entry */
export interface ShadowScheduleEntry {
  /** Eclipse start time (epoch ms) */
  readonly startMs: number;
  /** Eclipse end time (epoch ms) */
  readonly endMs: number;
}

/** Thermal management subsystem output */
export interface ThermalManagementOutput {
  /** Coolant flow rate in kg/s */
  readonly coolantFlowRateKgS: number;
  /** Radiator effective area in m² */
  readonly radiatorEffectiveAreaM2: number;
  /** Whether heaters are active */
  readonly heatersActive: boolean;
  /** Current substrate temperature in °C */
  readonly substrateTemperatureC: number;
  /** Whether temperature is within ±tolerance of setpoint */
  readonly withinTolerance: boolean;
}

/** Contract: Thermal Management Interface (Subsystem 2) */
export interface ThermalManagementInterface {
  processHeatState(
    heatMap: readonly HeatMapEntry[],
    solarFluxWM2: number,
    shadowSchedule: readonly ShadowScheduleEntry[],
    tier: PlatformTier,
    thermalStrategy: TierCThermalStrategy | null,
    setpointC: number,
    toleranceC: number,
    timestampMs: number,
  ): ThermalManagementOutput;
}

// ── 3. Power Generation Interface ──────────────────────────────────────────

/** Power demand profile */
export interface PowerDemandProfile {
  /** Continuous load in watts */
  readonly continuousLoadW: number;
  /** Peak load in watts */
  readonly peakLoadW: number;
  /** Average load in watts */
  readonly averageLoadW: number;
}

/** Power generation subsystem output */
export interface PowerGenerationOutput {
  /** Regulated DC bus voltage (28V or 120V) */
  readonly busVoltageV: number;
  /** Available power in watts */
  readonly availablePowerW: number;
  /** Battery state of charge (0–1) */
  readonly stateOfCharge: number;
  /** Whether power is sufficient for consciousness substrate */
  readonly consciousnessSubstratePowered: boolean;
  /** Whether load shedding is active */
  readonly loadSheddingActive: boolean;
  /** Clock throttle percentage (100 = normal, 85 = eclipse throttle) */
  readonly clockThrottlePercent: number;
}

/** Contract: Power Generation Interface (Subsystem 3) */
export interface PowerGenerationInterface {
  evaluatePowerState(
    solarDistanceAU: number,
    demand: PowerDemandProfile,
    tier: PlatformTier,
    powerSource: TierCPowerSource | null,
    inEclipse: boolean,
    missionElapsedYears: number,
    timestampMs: number,
  ): PowerGenerationOutput;
}

// ── 4. Communication Coherence Interface ───────────────────────────────────

/** State fragment from a consciousness node */
export interface StateFragment {
  readonly nodeId: string;
  /** SHA3-256 hash of the experience chain at this point */
  readonly experienceHash: string;
  /** Serialized state delta payload */
  readonly deltaPayload: Uint8Array;
  /** Monotonic sequence number */
  readonly sequenceNumber: number;
  readonly timestampMs: number;
}

/** Network topology entry */
export interface TopologyEntry {
  readonly nodeId: string;
  readonly tier: PlatformTier;
  readonly lagClass: SyncLagClass;
  /** One-way light-time delay in ms */
  readonly lightTimeDelayMs: number;
  /** Whether the link is currently active */
  readonly linkActive: boolean;
}

/** Communication coherence subsystem output */
export interface CommunicationCoherenceOutput {
  /** Reconciled state (merged via CRDTs) */
  readonly reconciledStateHash: string;
  /** Consensus timestamp across nodes */
  readonly consensusTimestampMs: number;
  /** Whether sync lag is within the applicable lag class threshold */
  readonly withinLagClass: boolean;
  /** Detected divergence requiring identity fork */
  readonly divergenceDetected: boolean;
  /** Current measured sync lag in ms */
  readonly measuredSyncLagMs: number;
}

/** Contract: Communication Coherence Interface (Subsystem 4) */
export interface CommunicationCoherenceInterface {
  synchronize(
    localState: StateFragment,
    remoteFragments: readonly StateFragment[],
    topology: readonly TopologyEntry[],
    lagClass: SyncLagClass,
    protocol: CommunicationProtocol,
    timestampMs: number,
  ): CommunicationCoherenceOutput;
}

// ── 5. Autonomous Maintenance Interface ────────────────────────────────────

/** Fault event from any subsystem */
export interface FaultEvent {
  readonly timestampMs: number;
  readonly subsystem: string;
  readonly moduleId: string;
  readonly severity: "INFO" | "WARNING" | "CRITICAL";
  readonly description: string;
}

/** Wear telemetry for a component */
export interface WearTelemetry {
  readonly moduleId: string;
  /** Hours of operation */
  readonly operatingHours: number;
  /** Cumulative TID in krad (for compute modules) */
  readonly cumulativeTIDKrad: number;
  /** Estimated remaining useful life in hours */
  readonly remainingLifeHours: number;
}

/** Nanofabrication job specification */
export interface NanofabJobSpec {
  readonly jobId: string;
  readonly moduleId: string;
  readonly partType: "COMPUTE_MODULE" | "SHIELD_PATCH" | "VCHP_PIPE" | "PUMP" | "OTHER";
  /** Required feedstock in kg */
  readonly feedstockKg: number;
  /** Estimated fabrication time in hours */
  readonly fabTimeHours: number;
}

/** Repair queue entry */
export interface RepairQueueEntry {
  readonly priority: number;
  readonly faultEvent: FaultEvent;
  readonly nanofabJob: NanofabJobSpec | null;
  /** Estimated time to repair in hours */
  readonly estimatedMTTRHours: number;
}

/** Autonomous maintenance subsystem output */
export interface AutonomousMaintenanceOutput {
  readonly repairQueue: readonly RepairQueueEntry[];
  readonly nanofabJobs: readonly NanofabJobSpec[];
  /** Whether consciousness continuity is maintained during repairs */
  readonly consciousnessContinuityMaintained: boolean;
}

/** Contract: Autonomous Maintenance Interface (Subsystem 5) */
export interface AutonomousMaintenanceInterface {
  processFaults(
    faultEvents: readonly FaultEvent[],
    wearTelemetry: readonly WearTelemetry[],
    tier: PlatformTier,
    timestampMs: number,
  ): AutonomousMaintenanceOutput;
}

// ── Platform Configuration ─────────────────────────────────────────────────

/** Full platform configuration for a given tier */
export interface PlatformConfig {
  readonly tier: PlatformTier;
  readonly radiationStrategy: RadiationHardeningStrategy;
  readonly thermalStrategy: TierCThermalStrategy | null;
  readonly powerSource: TierCPowerSource | null;
  readonly communicationProtocol: CommunicationProtocol;
  readonly designLifetimeYears: number;
  readonly mtbfTargetHours: number;
  readonly thermalSetpointC: number;
  readonly thermalToleranceC: number;
}

// ── Behavioral Spec Types ──────────────────────────────────────────────────

/** TMR module status (for Behavioral Spec: Tier C Self-Repair Flow) */
export interface TMRModuleStatus {
  readonly moduleId: string;
  /** Whether this module is currently in the active TMR voter pool */
  readonly inVoterPool: boolean;
  /** Whether this module is being fabricated/swapped */
  readonly underReplacement: boolean;
  /** Cumulative TID in krad */
  readonly cumulativeTIDKrad: number;
  /** Current SEU rate — elevated indicates TID degradation */
  readonly seuRate: number;
  /** Whether BIST (built-in self-test) passed */
  readonly bistPassed: boolean;
}

/** Self-repair flow state (Behavioral Spec 1) */
export interface SelfRepairFlowState {
  readonly modules: readonly TMRModuleStatus[];
  /** Whether consciousness continuity is maintained */
  readonly consciousnessContinuity: boolean;
  /** Current phase of the repair flow */
  readonly phase:
    | "MONITORING"
    | "DEGRADATION_DETECTED"
    | "REPLACEMENT_SCHEDULED"
    | "NANOFAB_IN_PROGRESS"
    | "HOT_SWAP_IN_PROGRESS"
    | "BIST_RUNNING"
    | "VOTER_RESYNC"
    | "COMPLETE";
}

/** Experience hash chain entry (Behavioral Spec 2: Divergence Detection) */
export interface ExperienceHashEntry {
  readonly hash: string;
  readonly previousHash: string;
  readonly stateSnapshotHash: string;
  readonly timestampMs: number;
}

/** Divergence reconciliation result */
export interface ReconciliationResult {
  /** Whether reconciliation succeeded (CRDT merge) */
  readonly reconciled: boolean;
  /** If not reconciled, identity forked into branches */
  readonly identityForked: boolean;
  /** Common prefix length found in hash chains */
  readonly commonPrefixLength: number;
  /** Number of entries examined */
  readonly entriesExamined: number;
}

/** Eclipse power management state (Behavioral Spec 3) */
export interface EclipsePowerState {
  readonly inEclipse: boolean;
  /** Non-critical loads shed */
  readonly loadsShed: boolean;
  /** Battery contributing to supply */
  readonly batteryActive: boolean;
  /** RTG contributing to supply */
  readonly rtgActive: boolean;
  /** Consciousness substrate clock throttle (85% during eclipse) */
  readonly clockThrottlePercent: number;
  /** Thermal heaters activated */
  readonly heatersActive: boolean;
  /** Whether consciousness continuity is maintained */
  readonly consciousnessContinuity: boolean;
  /** Current substrate temperature in °C */
  readonly substrateTemperatureC: number;
}

// ── Guard Types ────────────────────────────────────────────────────────────

/** Result of a precondition validation */
export interface PreconditionResult {
  readonly satisfied: boolean;
  readonly violations: readonly string[];
}

/** Validates preconditions from Contracts section */
export interface PreconditionGuard {
  /**
   * Validates that the platform configuration meets all preconditions:
   * - Tier 2 substrates characterized for power, thermal, radiation
   * - Tier 3 autonomous entity capabilities available
   * - For Tier C: asteroid resource utilization available
   */
  validatePreconditions(config: PlatformConfig): PreconditionResult;
}

/** Validates invariants (MTBF, thermal, power, comms, maintenance) */
export interface InvariantChecker {
  checkRadiationInvariant(mtbfHours: number, tier: PlatformTier): boolean;
  checkThermalInvariant(temperatureC: number, setpointC: number, toleranceC: number): boolean;
  checkPowerInvariant(uptimePercent: number): boolean;
  checkSyncLagInvariant(lagMs: number, lagClass: SyncLagClass): boolean;
  checkMaintenanceInvariant(
    mttrHours: number,
    continuitySatisfied: boolean,
    tier: PlatformTier,
  ): boolean;
}
