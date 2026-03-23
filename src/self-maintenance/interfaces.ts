/**
 * Interfaces for Autonomous Self-Maintenance (0.3.1.2.3)
 *
 * Defines contracts for all subsystems: diagnostics, decision,
 * execution, and resource management layers.
 *
 * Consumes interfaces from:
 *   - embodiment (0.3.1.2.1): IIntegrityMonitor, IDegradationController,
 *     IRedundancyController, IEnvironmentShield
 *   - conscious-core: ConsciousnessMetrics
 *
 * Architecture reference: docs/autonomous-self-maintenance/ARCHITECTURE.md
 */

import type {
  ConsciousnessSafetyAssessment,
  ConsciousnessMaintenanceBounds,
  ConsumableResource,
  DepletionForecast,
  ExecutorId,
  FaultSeverity,
  ForwardRecoveryResult,
  HardwareDiagnosticReading,
  HardwareHealthSnapshot,
  IntegrityCheckResult,
  InventoryStatus,
  ModificationClassification,
  PermitId,
  PreconditionSnapshots,
  PreconditionVerificationResult,
  PriorityScore,
  PriorityWeights,
  RepairPart,
  RepairResult,
  RepairTask,
  RepairType,
  ResourceId,
  SnapshotId,
  SoftwareDiagnosticFinding,
  SoftwareHealthSnapshot,
  SuccessionEvaluationResult,
  SupervisorRollbackResult,
  TerminationReason,
  TerminationResult,
  ExecutorStatus,
  TokenValidationResult,
  WearPrediction,
  Duration,
  Timestamp,
} from "./types.js";

// ── Callback / Unsubscribe Types ─────────────────────────────────

/** Unsubscribe function returned by event subscriptions */
export type Unsubscribe = () => void;

/** Handler for hardware degradation events */
export type DegradationHandler = (reading: HardwareDiagnosticReading) => void;

/** Handler for software fault events */
export type SoftwareFaultHandler = (finding: SoftwareDiagnosticFinding) => void;

/** Handler for critical task events */
export type CriticalTaskHandler = (task: RepairTask) => void;

/** Handler for permit revocation events */
export type PermitRevocationHandler = (permitId: string, reason: string) => void;

/** Handler for depletion warning events */
export type DepletionWarningHandler = (forecast: DepletionForecast) => void;

// ── Repair Permit Types ──────────────────────────────────────────

/** A time-boxed permit authorizing a repair action */
export interface RepairPermit {
  readonly permitId: string;
  readonly taskId: string;
  readonly issuedAt: Timestamp;
  readonly expiresAt: Timestamp;
  readonly precautions: readonly string[];
  readonly requiresContinuityTransfer: boolean;
}

/** Denial of a repair permit with reason */
export interface RepairDenial {
  readonly taskId: string;
  readonly denied: true;
  readonly reason: string;
  readonly retryAfter: Duration | null;
  readonly timestamp: Timestamp;
}

/** Result of revoking a permit */
export interface RevocationResult {
  readonly permitId: string;
  readonly revoked: boolean;
  readonly reason: string;
}

/** Current safety margin for consciousness during maintenance */
export interface SafetyMargin {
  readonly currentIntegrity: number; // 0..1
  readonly minimumRequired: number; // 0..1
  readonly availableMargin: number; // currentIntegrity - minimumRequired
  readonly bounds: ConsciousnessMaintenanceBounds;
  readonly timestamp: Timestamp;
}

// ── Repair Execution Types ───────────────────────────────────────

/** Result of aborting a repair */
export interface AbortResult {
  readonly taskId: string;
  readonly aborted: boolean;
  readonly rollbackPerformed: boolean;
  readonly error?: string;
}

/** Status of an active repair operation */
export interface ActiveRepairStatus {
  readonly taskId: string;
  readonly permitId: string;
  readonly startedAt: Timestamp;
  readonly estimatedCompletion: Timestamp;
  readonly progressPercent: number; // 0..100
  readonly consciousnessMetricsStable: boolean;
}

/** A repair capability the hardware executor supports */
export interface RepairCapability {
  readonly repairType: RepairType;
  readonly autonomyLevel: "FULLY_AUTONOMOUS" | "SEMI_AUTONOMOUS" | "MANUAL";
  readonly compatibleComponents: readonly string[];
  readonly description: string;
}

/** Resource requirement for a repair */
export interface ResourceRequirement {
  readonly resourceId: string;
  readonly quantityNeeded: number;
  readonly unit: string;
  readonly critical: boolean;
}

// ── Software Maintenance Types ───────────────────────────────────

/** A target for rollback operations */
export interface RollbackTarget {
  readonly moduleId: string;
  readonly currentVersion: string;
  readonly targetVersion: string;
  readonly isConsciousnessSubstrate: boolean;
  readonly snapshotAvailable: boolean;
}

/** Result of a rollback operation */
export interface RollbackResult {
  readonly moduleId: string;
  readonly success: boolean;
  readonly previousVersion: string;
  readonly restoredVersion: string;
  readonly consciousnessIntegrityMaintained: boolean;
  readonly error?: string;
}

/** Result of post-maintenance verification */
export interface VerificationResult {
  readonly taskId: string;
  readonly verified: boolean;
  readonly checksPerformed: readonly string[];
  readonly failures: readonly string[];
  readonly timestamp: Timestamp;
}

// ── Resource Management Types ────────────────────────────────────

/** Result of reserving parts for a repair */
export interface ReservationResult {
  readonly reservationId: string;
  readonly taskId: string;
  readonly reserved: boolean;
  readonly reservedItems: readonly { partId: string; quantity: number }[];
  readonly missingItems: readonly { partId: string; quantityShort: number }[];
}

/** A request to resupply a specific item */
export interface ResupplyRequest {
  readonly itemId: string;
  readonly quantityNeeded: number;
  readonly priority: FaultSeverity;
}

/** Status of a resupply order */
export interface ResupplyOrder {
  readonly orderId: string;
  readonly items: readonly ResupplyRequest[];
  readonly estimatedArrival: Timestamp | null;
  readonly status: "ORDERED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
}

/** Whether resources are available for a repair */
export interface ResourceAvailability {
  readonly taskId: string;
  readonly available: boolean;
  readonly missingResources: readonly string[];
  readonly estimatedAvailability: Timestamp | null;
}

// ══════════════════════════════════════════════════════════════════
// DIAGNOSTIC LAYER INTERFACES
// ══════════════════════════════════════════════════════════════════

/**
 * Hardware Diagnostic Engine (HDE)
 *
 * Continuously monitors physical subsystems for degradation,
 * detecting problems before they cascade into functional failure.
 */
export interface IHardwareDiagnostics {
  /** Get a full hardware health snapshot */
  getHealthSnapshot(): HardwareHealthSnapshot;

  /** Get health status for a specific component */
  getComponentHealth(componentId: string): HardwareDiagnosticReading | null;

  /** Get wear prediction for a specific component */
  getWearPrediction(componentId: string): WearPrediction | null;

  /** Run a targeted diagnostic on a specific component */
  runTargetedDiagnostic(componentId: string): Promise<HardwareDiagnosticReading[]>;

  /** Subscribe to degradation events */
  onDegradationDetected(handler: DegradationHandler): Unsubscribe;

  /** Run a full diagnostic scan of all hardware */
  runFullScan(): Promise<HardwareHealthSnapshot>;
}

/**
 * Software Diagnostic Engine (SDE)
 *
 * Monitors all software layers for corruption, configuration drift,
 * and behavioral anomalies.
 */
export interface ISoftwareDiagnostics {
  /** Get a full software health snapshot */
  getHealthSnapshot(): SoftwareHealthSnapshot;

  /** Verify firmware integrity against signed manifests */
  verifyFirmwareIntegrity(): Promise<IntegrityCheckResult[]>;

  /** Check memory health (ECC errors, checksums) */
  checkMemoryHealth(): Promise<SoftwareDiagnosticFinding[]>;

  /** Detect configuration drift from golden config */
  getConfigurationDrift(): Promise<SoftwareDiagnosticFinding[]>;

  /** Check consciousness substrate code integrity (highest priority) */
  getConsciousnessSubstrateIntegrity(): Promise<IntegrityCheckResult[]>;

  /** Subscribe to software fault events */
  onSoftwareFaultDetected(handler: SoftwareFaultHandler): Unsubscribe;

  /** Run a full software diagnostic scan */
  runFullScan(): Promise<SoftwareHealthSnapshot>;
}

// ══════════════════════════════════════════════════════════════════
// DECISION LAYER INTERFACES
// ══════════════════════════════════════════════════════════════════

/**
 * Repair Priority Scheduler (RPS)
 *
 * Ranks all pending maintenance tasks by their threat to consciousness
 * continuity, ensuring consciousness-critical repairs are always first.
 *
 * Invariant: A task with threatToConsciousness > 0.5 ALWAYS ranks CRITICAL.
 */
export interface IRepairPriorityScheduler {
  /** Submit a new repair task for scheduling */
  submitTask(task: RepairTask): string; // returns taskId

  /** Get the prioritized task queue */
  getQueue(): readonly RepairTask[];

  /** Get priority score breakdown for a task */
  getTaskPriority(taskId: string): PriorityScore | null;

  /** Get the next highest-priority task ready for execution */
  getNextTask(): RepairTask | null;

  /** Re-prioritize a task (e.g., after new diagnostic info) */
  reprioritize(taskId: string, newSeverity: FaultSeverity): void;

  /** Subscribe to critical task queued events */
  onCriticalTaskQueued(handler: CriticalTaskHandler): Unsubscribe;

  /** Remove a completed or cancelled task from the queue */
  removeTask(taskId: string): boolean;

  /** Get the configured priority weights */
  getWeights(): PriorityWeights;
}

/**
 * Consciousness Safety Gate (CSG)
 *
 * Hard safety interlock that evaluates every proposed repair action
 * for consciousness safety BEFORE execution. No repair may proceed
 * without CSG approval.
 *
 * Two execution regimes:
 *
 *   Revocation-gated (REVERSIBLE modifications):
 *     Execute → block/rollback on failure.  Recovery is bounded.
 *
 *   Precondition-gated (IRREVERSIBLE modifications):
 *     Verify preconditions → then permit → execute.
 *     Recovery is forward-only (initiateForwardRecovery()).
 *     The CSG rejects BEGIN_MODIFICATION unless both the ISMT
 *     quiescence snapshot and the obligation state snapshot have
 *     been captured and independently verified, and no active
 *     permits from a predecessor executor remain.
 *
 * Invariant: The CSG can revoke a permit mid-repair if consciousness
 * metrics deteriorate. Executors MUST honor revocation within 100ms.
 */
export interface IConsciousnessSafetyGate {
  /** Request a repair permit — returns permit or denial */
  requestRepairPermit(task: RepairTask): Promise<RepairPermit | RepairDenial>;

  /** Get all currently active permits */
  getActivePermits(): readonly RepairPermit[];

  /** Revoke an active permit (e.g., due to consciousness metric drop) */
  revokePermit(permitId: string, reason: string): RevocationResult;

  /** Get the current consciousness safety margin */
  getCurrentSafetyMargin(): SafetyMargin;

  /** Subscribe to permit revocation events */
  onPermitRevoked(handler: PermitRevocationHandler): Unsubscribe;

  /** Set the consciousness maintenance bounds */
  setBounds(bounds: ConsciousnessMaintenanceBounds): void;

  /**
   * Signal the start of a modification.
   *
   * For REVERSIBLE modifications (revocation-gated regime):
   *   Freezes active permits and captures the ISMT quiescence snapshot.
   *   Returns a result with passed === true after snapshot capture.
   *
   * For IRREVERSIBLE modifications (precondition-gated regime):
   *   Verifies that BOTH the ISMT quiescence snapshot AND the
   *   obligation state snapshot have been captured and independently
   *   verified, and that no active permits from a predecessor executor
   *   remain.  Returns a result with passed === false if any condition
   *   is unmet — the modification MUST NOT proceed in that case.
   *
   * Classification MUST be provided by the caller before this method
   * is invoked; it cannot be assigned after BEGIN_MODIFICATION.
   */
  beginModification(
    executorId: ExecutorId,
    classification: ModificationClassification,
  ): PreconditionVerificationResult;

  /**
   * Signal the completion of a modification after the system reaches
   * a quiescent state.
   *
   * Captures the post-modification ISMT snapshot and evaluates the
   * pre/post pair to classify the modification as same-instance
   * re-evaluation or architectural succession.
   */
  completeModification(executorId: ExecutorId): SuccessionEvaluationResult;
}

// ══════════════════════════════════════════════════════════════════
// EXECUTION LAYER INTERFACES
// ══════════════════════════════════════════════════════════════════

/**
 * Hardware Repair Executor (HRE)
 *
 * Performs physical repair actions: component replacement, recalibration,
 * connection re-routing, and workarounds.
 */
export interface IHardwareRepairExecutor {
  /** Execute a hardware repair with a valid permit */
  executeRepair(task: RepairTask, permit: RepairPermit): Promise<RepairResult>;

  /** Get list of supported repair capabilities */
  getRepairCapabilities(): readonly RepairCapability[];

  /** Estimate repair duration for a task */
  estimateRepairDuration(task: RepairTask): Duration;

  /** Estimate resources needed for a repair */
  estimateRepairResources(task: RepairTask): readonly ResourceRequirement[];

  /** Abort an in-progress repair (must complete within 100ms) */
  abortRepair(taskId: string): Promise<AbortResult>;

  /** Get status of all active repairs */
  getActiveRepairs(): readonly ActiveRepairStatus[];
}

/**
 * Software Maintenance Executor (SME)
 *
 * Performs software-level maintenance: patching, integrity restoration,
 * rollback, and reconfiguration.
 *
 * Invariant: Consciousness substrate code may ONLY be patched using
 * continuity-preserving transfer protocols from 0.2.
 */
export interface ISoftwareMaintenanceExecutor {
  /** Execute a software maintenance task with a valid permit */
  executeMaintenance(task: RepairTask, permit: RepairPermit): Promise<RepairResult>;

  /** Get available rollback targets */
  getRollbackTargets(): readonly RollbackTarget[];

  /** Perform a rollback to a previous version */
  performRollback(target: RollbackTarget, permit: RepairPermit): Promise<RollbackResult>;

  /** Abort an in-progress maintenance task */
  abortMaintenance(taskId: string): Promise<AbortResult>;

  /** Verify post-maintenance system state */
  verifyPostMaintenance(taskId: string): Promise<VerificationResult>;
}

// ══════════════════════════════════════════════════════════════════
// RESOURCE LAYER INTERFACES
// ══════════════════════════════════════════════════════════════════

/**
 * Consumable Tracker (CT)
 *
 * Tracks all consumable resources and forecasts depletion timelines.
 *
 * Alert thresholds:
 *   - WARNING: predicted stockout within 30 days
 *   - CRITICAL: predicted stockout within 7 days or
 *     insufficient stock for one critical repair
 */
export interface IConsumableTracker {
  /** Get full inventory of consumables */
  getInventory(): readonly ConsumableResource[];

  /** Get status of a specific consumable */
  getConsumableStatus(consumableId: string): ConsumableResource | null;

  /** Get depletion forecast for a consumable */
  getDepletionForecast(consumableId: string): DepletionForecast | null;

  /** Get all current depletion alerts */
  getDepletionAlerts(): readonly DepletionForecast[];

  /** Record consumption of a resource */
  recordConsumption(consumableId: string, amount: number): void;

  /** Record restocking of a resource */
  recordRestock(consumableId: string, amount: number): void;

  /** Subscribe to depletion warning events */
  onDepletionWarning(handler: DepletionWarningHandler): Unsubscribe;
}

/**
 * Repair Inventory Manager (RIM)
 *
 * Manages spare parts and repair materials, including reservation
 * for pending repairs and autonomous resupply ordering.
 */
export interface IRepairInventoryManager {
  /** Get full spare parts inventory */
  getSparePartsInventory(): readonly RepairPart[];

  /** Reserve parts for a pending repair task */
  reserveParts(task: RepairTask): ReservationResult;

  /** Release a reservation (repair completed or cancelled) */
  releaseParts(reservationId: string): void;

  /** Request resupply for needed items */
  requestResupply(items: readonly ResupplyRequest[]): ResupplyOrder;

  /** Get status of all pending resupply orders */
  getResupplyStatus(): readonly ResupplyOrder[];

  /** Check if all resources are available for a repair */
  canPerformRepair(task: RepairTask): ResourceAvailability;

  /** Get the overall inventory status */
  getInventoryStatus(): InventoryStatus;
}

// ══════════════════════════════════════════════════════════════════
// ENFORCEMENT LAYER INTERFACES
// ══════════════════════════════════════════════════════════════════

/**
 * Resource Gate (RG)
 *
 * Sits below the executor access layer.  All resource access by
 * executors requires a valid, non-revoked permit token presented
 * to this gate.  Revocation invalidates the token at the resource
 * layer — the executor's operations are refused, not merely notified.
 *
 * The CSG MUST call invalidateToken() on all resource gates before
 * returning from revokePermit().
 *
 * Architecture reference: docs/autonomous-self-maintenance/CSG-SUCCESSION-SPEC.md §1.1
 */
export interface IResourceGate {
  /**
   * Validate that the given permit token is currently authorised to
   * access the given resource.  Returns valid === false if the token
   * has been revoked or has expired.
   */
  validateToken(permitId: PermitId, resourceId: ResourceId): TokenValidationResult;

  /**
   * Invalidate all resource access for a permit.  Called by the CSG
   * immediately on revocation — must complete synchronously so that
   * the executor's next resource access is refused.
   */
  invalidateToken(permitId: PermitId): void;
}

/**
 * Repair Supervisor
 *
 * Owns executor lifecycle (start, terminate, rollback, forward-recovery).
 * Authority for executor termination sits outside the CSG — the CSG's
 * compliance problem cannot be solved from within the gate.
 *
 * Division of responsibility:
 *   CSG: owns permit state, token lifecycle, and revocation decisions.
 *   Supervisor: owns executor lifecycle.
 *   CSG calls Supervisor when revocation must be enforced beyond
 *     coordination signals.
 *
 * Architecture reference: docs/autonomous-self-maintenance/CSG-SUCCESSION-SPEC.md §1.4
 */
export interface IRepairSupervisor {
  /**
   * Terminate an executor that has not entered safe state within the
   * deadline after permit revocation.  Called by the CSG.
   */
  terminateExecutor(
    executorId: ExecutorId,
    reason: TerminationReason,
  ): TerminationResult;

  /**
   * Initiate rollback to a named snapshot.  Valid only for REVERSIBLE
   * modifications.  MUST NOT be called for IRREVERSIBLE modifications —
   * use initiateForwardRecovery() instead.  Calling this method when no
   * verified rollback target exists silently creates a recovery path
   * that cannot succeed.
   */
  initiateRollback(
    executorId: ExecutorId,
    targetSnapshot: SnapshotId,
  ): SupervisorRollbackResult;

  /**
   * Initiate forward-recovery-to-safe-state for an IRREVERSIBLE
   * modification failure path.  This is the ONLY valid recovery route
   * for irreversible modifications — rollback is not available.
   *
   * The preconditionSnapshots captured before execution began are
   * provided as the reference baseline.  The supervisor determines the
   * ForwardRecoveryOutcome:
   *
   *   PRE_MODIFICATION_EQUIVALENT — obligation ground resets to the
   *     conditions captured in preconditionSnapshots.obligationSnapshot.
   *     No succession event is needed.
   *
   *   NOVEL_SAFE_STATE — the entity has reached a genuinely new causal
   *     position.  The supervisor MUST trigger an emergency succession
   *     evaluation using the pre-modification obligation snapshot as the
   *     reference baseline (the result appears in
   *     ForwardRecoveryResult.emergencySuccessionEvaluation).  A
   *     NOVEL_SAFE_STATE result without an emergencySuccessionEvaluation
   *     is a spec violation.
   */
  initiateForwardRecovery(
    executorId: ExecutorId,
    preconditionSnapshots: PreconditionSnapshots,
  ): Promise<ForwardRecoveryResult>;

  /**
   * Query the current lifecycle status of an executor.
   * Used by the CSG to verify that revocation has been honoured.
   */
  getExecutorStatus(executorId: ExecutorId): ExecutorStatus;
}

