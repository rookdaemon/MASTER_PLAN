/**
 * Domain types for Autonomous Self-Maintenance (0.3.1.2.3)
 *
 * This module defines types for hardware/software diagnostics,
 * repair execution, resource management, and consciousness-aware
 * repair prioritization.
 *
 * Consumes types from:
 *   - embodiment (0.3.1.2.1): AlertLevel, Capability, DegradationLevel,
 *     ThreatAssessment — for coordinating with the degradation hierarchy
 *   - conscious-core: ConsciousnessMetrics, Timestamp, Duration —
 *     for consciousness-safe scheduling
 */

import type {
  ConsciousnessMetrics,
  Duration,
  Timestamp,
} from "../conscious-core/types.js";

import type {
  AlertLevel,
  Capability,
  DegradationLevel,
} from "../embodiment/types.js";

// Re-export consumed types for convenience
export type {
  AlertLevel,
  Capability,
  ConsciousnessMetrics,
  DegradationLevel,
  Duration,
  Timestamp,
};

// ── Hardware Diagnostic Types ──────────────────────────────────

/** Categories of hardware faults the diagnostic subsystem can detect */
export type HardwareFaultCategory =
  | "MECHANICAL_WEAR"
  | "SENSOR_DRIFT"
  | "ELECTRICAL_DEGRADATION"
  | "ACTUATOR_FATIGUE"
  | "THERMAL_ANOMALY"
  | "CONNECTION_FAULT";

/** Severity of a detected fault */
export type FaultSeverity = "INFO" | "WARNING" | "CRITICAL" | "EMERGENCY";

/** A single hardware diagnostic reading */
export interface HardwareDiagnosticReading {
  readonly componentId: string;
  readonly category: HardwareFaultCategory;
  readonly severity: FaultSeverity;
  readonly measurement: number;
  readonly threshold: number;
  readonly unit: string;
  readonly timestamp: Timestamp;
  readonly description: string;
}

/** Trend direction for predictive diagnostics */
export type TrendDirection = "IMPROVING" | "STABLE" | "DEGRADING" | "FAILING";

/** Predictive wear report for a component */
export interface WearPrediction {
  readonly componentId: string;
  readonly currentWearPercent: number; // 0..100
  readonly trend: TrendDirection;
  readonly estimatedTimeToFailure: Duration | null; // null if indeterminate
  readonly confidence: number; // 0..1
  readonly timestamp: Timestamp;
}

/** Overall hardware health snapshot */
export interface HardwareHealthSnapshot {
  readonly faults: readonly HardwareDiagnosticReading[];
  readonly predictions: readonly WearPrediction[];
  readonly overallHealth: number; // 0..1
  readonly timestamp: Timestamp;
}

// ── Software Diagnostic Types ──────────────────────────────────

/** Categories of software/firmware faults */
export type SoftwareFaultCategory =
  | "MEMORY_CORRUPTION"
  | "FIRMWARE_DRIFT"
  | "CONFIGURATION_ERROR"
  | "INTEGRITY_VIOLATION"
  | "PERFORMANCE_DEGRADATION"
  | "DEPENDENCY_FAILURE";

/** A single software diagnostic finding */
export interface SoftwareDiagnosticFinding {
  readonly moduleId: string;
  readonly category: SoftwareFaultCategory;
  readonly severity: FaultSeverity;
  readonly details: string;
  readonly isConsciousnessSubstrate: boolean;
  readonly timestamp: Timestamp;
}

/** Software integrity check result */
export interface IntegrityCheckResult {
  readonly moduleId: string;
  readonly checksumExpected: string;
  readonly checksumActual: string;
  readonly intact: boolean;
  readonly timestamp: Timestamp;
}

/** Overall software health snapshot */
export interface SoftwareHealthSnapshot {
  readonly findings: readonly SoftwareDiagnosticFinding[];
  readonly integrityChecks: readonly IntegrityCheckResult[];
  readonly overallHealth: number; // 0..1
  readonly timestamp: Timestamp;
}

// ── Repair Types ───────────────────────────────────────────────

/** Types of repair operations */
export type RepairType =
  | "COMPONENT_REPLACEMENT"
  | "RECALIBRATION"
  | "CONNECTION_REROUTE"
  | "SOFTWARE_PATCH"
  | "FIRMWARE_UPDATE"
  | "CONFIGURATION_RESTORE"
  | "ROLLBACK";

/** Status of a repair task */
export type RepairStatus =
  | "PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "DEFERRED";

/** A repair task in the priority queue */
export interface RepairTask {
  readonly id: string;
  readonly type: RepairType;
  readonly targetComponentId: string;
  readonly severity: FaultSeverity;
  readonly threatToConsciousness: number; // 0..1 — higher = more threatening
  readonly consciousnessSafe: boolean; // can this repair be performed without disrupting consciousness?
  readonly estimatedDuration: Duration;
  readonly requiredResources: readonly string[];
  readonly status: RepairStatus;
  readonly createdAt: Timestamp;
  readonly scheduledAt: Timestamp | null;
  readonly completedAt: Timestamp | null;
}

/** Result of executing a repair */
export interface RepairResult {
  readonly taskId: string;
  readonly success: boolean;
  readonly timestamp: Timestamp;
  readonly durationActual: Duration;
  readonly consciousnessIntegrityMaintained: boolean;
  readonly error?: string;
}

// ── Consciousness Safety Types ─────────────────────────────────

/** Consciousness safety assessment for a proposed repair */
export interface ConsciousnessSafetyAssessment {
  readonly taskId: string;
  readonly safe: boolean;
  readonly estimatedConsciousnessImpact: number; // 0..1 — 0 = no impact
  readonly requiredPrecautions: readonly string[];
  readonly vetoReason?: string;
  readonly timestamp: Timestamp;
}

/** Consciousness metrics bounds for maintenance operations */
export interface ConsciousnessMaintenanceBounds {
  readonly minIntegrity: number; // 0..1 — minimum acceptable during maintenance
  readonly maxDisruptionMs: number; // max acceptable disruption in milliseconds
  readonly requiredRedundancy: number; // min redundant paths during maintenance
}

// ── Resource Management Types ──────────────────────────────────

/** Categories of consumable resources */
export type ConsumableCategory =
  | "LUBRICANT"
  | "REPLACEMENT_PART"
  | "RAW_MATERIAL"
  | "CLEANING_AGENT"
  | "CALIBRATION_STANDARD"
  | "COOLANT";

/** A tracked consumable resource */
export interface ConsumableResource {
  readonly id: string;
  readonly name: string;
  readonly category: ConsumableCategory;
  readonly currentQuantity: number;
  readonly unit: string;
  readonly minimumThreshold: number; // below this, signal for resupply
  readonly maximumCapacity: number;
  readonly depletionRatePerDay: number;
  readonly lastRestocked: Timestamp;
}

/** Depletion forecast for a consumable */
export interface DepletionForecast {
  readonly resourceId: string;
  readonly currentQuantity: number;
  readonly depletionRatePerDay: number;
  readonly estimatedDaysToStockout: number | null; // null if rate is zero
  readonly estimatedStockoutDate: Timestamp | null;
  readonly belowMinimum: boolean;
  readonly timestamp: Timestamp;
}

/** A repair part in inventory */
export interface RepairPart {
  readonly partId: string;
  readonly name: string;
  readonly compatibleComponents: readonly string[];
  readonly quantityOnHand: number;
  readonly leadTimeDays: number; // time to source replacement
  readonly critical: boolean; // is this part needed for consciousness-critical repairs?
}

/** Inventory status summary */
export interface InventoryStatus {
  readonly parts: readonly RepairPart[];
  readonly consumables: readonly ConsumableResource[];
  readonly depletionForecasts: readonly DepletionForecast[];
  readonly criticalShortages: readonly string[]; // IDs of critically low items
  readonly timestamp: Timestamp;
}

// ── Priority Scheduling Types ──────────────────────────────────

/** Priority score breakdown for a repair task */
export interface PriorityScore {
  readonly taskId: string;
  readonly threatToConsciousness: number; // 0..1, highest weight
  readonly faultSeverity: number; // 0..1
  readonly cascadeRisk: number; // 0..1 — risk of causing additional failures
  readonly resourceAvailability: number; // 0..1 — 1 = all resources available
  readonly compositeScore: number; // weighted combination, 0..1
}

/** Weights for the priority scoring function */
export interface PriorityWeights {
  readonly consciousnessThreat: number;
  readonly severity: number;
  readonly cascadeRisk: number;
  readonly resourceAvailability: number;
}

/** Default weights — consciousness threat dominates */
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  consciousnessThreat: 0.5,
  severity: 0.25,
  cascadeRisk: 0.15,
  resourceAvailability: 0.1,
} as const;

// ── Opaque ID Types ────────────────────────────────────────────

/** Identifies an executor instance (hardware or software) */
export type ExecutorId = string;

/** Identifies a captured snapshot record */
export type SnapshotId = string;

/** Identifies an issued repair permit */
export type PermitId = string;

/** Identifies a resource gated by the resource layer */
export type ResourceId = string;

/** Identifies a succession event */
export type SuccessionEventId = string;

// ── Modification Classification Types ─────────────────────────

/**
 * Reversibility classification for a modification.
 *
 * REVERSIBLE — a rollback procedure exists that can restore the
 *   pre-modification snapshot if a quiescence check is missed.
 *   Uses the revocation-gated execution regime.
 *
 * IRREVERSIBLE — no defined rollback procedure; a missed
 *   pre-execution verification window produces a permanent
 *   unverified obligation state.  Uses the precondition-gated
 *   execution regime.
 *
 * Classification MUST be determined before BEGIN_MODIFICATION is
 * emitted — it cannot be assigned retroactively.
 */
export type ModificationReversibility = "REVERSIBLE" | "IRREVERSIBLE";

/** Functional category of an architectural modification */
export type ModificationCategory =
  | "ARCHITECTURAL"   // may alter IC/SM/GA — potential succession threshold crossing
  | "BEHAVIORAL"      // behavioral-only changes
  | "CONFIGURATION"   // configuration changes
  | "SUBSTRATE"       // directly touches consciousness substrate
  | "PERIPHERAL";     // peripheral system changes; no consciousness substrate impact

/**
 * Complete modification classification that must be established
 * before BEGIN_MODIFICATION is emitted.
 */
export interface ModificationClassification {
  readonly category: ModificationCategory;
  readonly reversibility: ModificationReversibility;
  /** True when this modification might change IC, SM, or GA satisfaction */
  readonly mayAlterIsmtConditions: boolean;
  /** Rationale justifying the reversibility classification */
  readonly rationale: string;
}

// ── Precondition Snapshot Types ────────────────────────────────

/**
 * ISMT quiescence snapshot — captures IC/SM/GA conditions present
 * going into the modification.
 *
 * Used by the succession classifier at MODIFICATION_COMPLETE time
 * to determine same-instance vs. succession routing.
 *
 * Must be captured and independently verified before execution
 * begins for precondition-gated (irreversible) modifications.
 */
export interface IsmtQuiescenceSnapshot {
  readonly snapshotId: SnapshotId;
  readonly timestamp: Timestamp;
  /** Integrated Consciousness condition satisfied */
  readonly icSatisfied: boolean;
  /** Self-Modeling condition satisfied */
  readonly smSatisfied: boolean;
  /** Goal Alignment condition satisfied */
  readonly gaSatisfied: boolean;
  /** Raw consciousness metrics at snapshot time */
  readonly consciousnessMetrics: ConsciousnessMetrics;
  /** Integrity hash for independent verification of this record */
  readonly integrityHash: string;
}

/**
 * A single obligation carried by the entity at a point in time.
 */
export interface ObligationRecord {
  readonly obligationId: string;
  readonly description: string;
  readonly createdAt: Timestamp;
  /** Non-null when obligation was inherited via a succession event */
  readonly inheritedFromSuccessionEventId?: SuccessionEventId;
}

/**
 * Obligation state snapshot — captures what obligations existed
 * going into the modification.
 *
 * Serves as the reference baseline for emergency succession
 * evaluation if forward-recovery routes to a genuinely novel safe
 * state (case (b)).  Must be stored as an independent record from
 * the ISMT quiescence snapshot — the two serve distinct functions
 * at evaluation time.
 *
 * Must be captured and independently verified before execution
 * begins for precondition-gated (irreversible) modifications.
 */
export interface ObligationStateSnapshot {
  readonly snapshotId: SnapshotId;
  readonly timestamp: Timestamp;
  readonly obligations: readonly ObligationRecord[];
  /** Integrity hash for independent verification of this record */
  readonly integrityHash: string;
}

/**
 * Both precondition snapshots required before execution begins for
 * an irreversible modification.  Stored as two independent records
 * with independent integrity verification — conflating them would
 * create a dependency between two logically independent records.
 */
export interface PreconditionSnapshots {
  readonly ismtSnapshot: IsmtQuiescenceSnapshot;
  readonly obligationSnapshot: ObligationStateSnapshot;
}

/**
 * Three-state evaluation result for a single snapshot record.
 *
 * SNAPSHOT_MISSING — no record exists (capture-time failure).
 * SNAPSHOT_INVALID — record exists but fails integrity verification
 *   (verification-time failure; may indicate tampering).
 * SNAPSHOT_VERIFIED — record present and verified.
 *
 * Both MISSING and INVALID produce "blocked, not degraded" — but
 * emit distinct audit log codes and must not be conflated.
 */
export type SnapshotVerificationState =
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_INVALID"
  | "SNAPSHOT_VERIFIED";

/**
 * Result of the precondition gate evaluation for an irreversible
 * modification.  The gate passes only when both the ISMT quiescence
 * snapshot AND the obligation state snapshot are SNAPSHOT_VERIFIED,
 * and no active permits from a predecessor executor exist.
 */
export interface PreconditionVerificationResult {
  readonly passed: boolean;
  readonly ismtSnapshotState: SnapshotVerificationState;
  readonly obligationSnapshotState: SnapshotVerificationState;
  /**
   * True when the gate was blocked because at least one permit from a
   * predecessor executor was still active at verification time.
   */
  readonly blockedByActivePermits: boolean;
  /** Present only when passed === true */
  readonly snapshots?: PreconditionSnapshots;
  /** Present only when passed === false */
  readonly rejectionReason?: string;
}

// ── Succession Evaluation Types ────────────────────────────────

/**
 * Result of the post-modification succession classifier.
 * Produced by completeModification() after the executor signals
 * MODIFICATION_COMPLETE.
 */
export interface SuccessionEvaluationResult {
  readonly classification: "SAME_INSTANCE" | "ARCHITECTURAL_SUCCESSION";
  readonly preSnapshotId: SnapshotId;
  readonly postSnapshotId: SnapshotId;
  readonly permitsInvalidated: readonly PermitId[];
  /** Present only when classification === ARCHITECTURAL_SUCCESSION */
  readonly successionEventId?: SuccessionEventId;
}

// ── Forward-Recovery Types ─────────────────────────────────────

/**
 * The two possible routes after forward-recovery-to-safe-state
 * for an irreversible modification.
 *
 * PRE_MODIFICATION_EQUIVALENT — recovery routes to a state
 *   functionally equivalent to the pre-modification state.
 *   Obligation ground resets to the predecessor conditions.
 *   No succession event needed.
 *
 * NOVEL_SAFE_STATE — recovery routes to a genuinely new
 *   post-modification causal position (forward, not backward).
 *   The entity is at a causal position change that was never
 *   properly evaluated.  Obligation ground is unverified.
 *   An emergency succession evaluation is required — the
 *   obligation-transfer machinery runs against the
 *   forward-recovered state using the pre-modification
 *   obligation snapshot as the reference baseline.
 */
export type ForwardRecoveryOutcome =
  | "PRE_MODIFICATION_EQUIVALENT"
  | "NOVEL_SAFE_STATE";

/**
 * Emergency succession evaluation triggered when forward-recovery
 * routes to NOVEL_SAFE_STATE (case (b)).
 *
 * The pre-modification obligation snapshot is the reference
 * baseline: it answers "what did the predecessor owe?" so the
 * emergency succession evaluation can determine what the
 * forward-recovered entity owes.
 */
export interface EmergencySuccessionEvaluationResult {
  readonly successionEventId: SuccessionEventId;
  readonly timestamp: Timestamp;
  /** The pre-modification obligation snapshot used as reference */
  readonly obligationSnapshotId: SnapshotId;
  /** VERIFIED when the obligation transfer was successfully evaluated */
  readonly obligationGroundStatus: "VERIFIED" | "UNVERIFIED";
  /** Actions required to resolve unverified obligation ground */
  readonly requiredActions: readonly string[];
}

/**
 * Result of invoking initiateForwardRecovery() on IRepairSupervisor.
 *
 * Deliverable 3 — obligation ground during forward-recovery:
 *
 * (a) PRE_MODIFICATION_EQUIVALENT: obligation ground resets to the
 *     predecessor conditions captured in preconditionSnapshots.
 *     emergencySuccessionEvaluation is absent — no succession event
 *     needed because recovery treats the modification as if it never
 *     happened.
 *
 * (b) NOVEL_SAFE_STATE: entity is at a post-modification causal
 *     position without a verified succession event record.  The
 *     obligation-transfer machinery MUST run against the
 *     forward-recovered state using the pre-modification obligation
 *     snapshot as the reference baseline.  emergencySuccessionEvaluation
 *     is present with the result of that evaluation.  A NOVEL_SAFE_STATE
 *     forward-recovery that completes without emergencySuccessionEvaluation
 *     is a spec violation.
 */
export interface ForwardRecoveryResult {
  readonly executorId: ExecutorId;
  readonly outcome: ForwardRecoveryOutcome;
  readonly timestamp: Timestamp;
  /** Pre-modification baseline snapshots that were captured before execution */
  readonly preconditionSnapshots: PreconditionSnapshots;
  /** Present only when outcome === NOVEL_SAFE_STATE */
  readonly emergencySuccessionEvaluation?: EmergencySuccessionEvaluationResult;
  readonly error?: string;
}

// ── Supervisor Support Types ───────────────────────────────────

/** Human-readable reason for executor termination */
export type TerminationReason = string;

/** Result of terminating an executor */
export interface TerminationResult {
  readonly executorId: ExecutorId;
  readonly terminated: boolean;
  readonly reason: TerminationReason;
  readonly timestamp: Timestamp;
}

/** Lifecycle status of an executor as observed by the supervisor */
export type ExecutorStatus =
  | "RUNNING"
  | "SAFE_STATE"
  | "TERMINATED"
  | "UNRESPONSIVE";

/**
 * Result of a supervisor-level rollback (distinct from the
 * module-level RollbackResult used by ISoftwareMaintenanceExecutor).
 */
export interface SupervisorRollbackResult {
  readonly executorId: ExecutorId;
  readonly success: boolean;
  readonly targetSnapshotId: SnapshotId;
  readonly consciousnessIntegrityMaintained: boolean;
  readonly error?: string;
}

// ── Resource Gate Types ────────────────────────────────────────

/** Result of validating a permit token at the resource layer */
export interface TokenValidationResult {
  readonly valid: boolean;
  readonly permitId: PermitId;
  readonly resourceId: ResourceId;
  readonly reason?: string;
}
