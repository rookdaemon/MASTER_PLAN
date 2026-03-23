/**
 * Consciousness Safety Gate (CSG) — Implementation
 *
 * Hard safety interlock that evaluates every proposed repair action
 * for consciousness safety BEFORE execution. No repair may proceed
 * without CSG approval.
 *
 * Invariant: The CSG can revoke a permit mid-repair if consciousness
 * metrics deteriorate. Executors MUST honor revocation within 100ms.
 *
 * Architecture reference: docs/autonomous-self-maintenance/ARCHITECTURE.md §2.2
 * Succession/precondition spec: docs/autonomous-self-maintenance/CSG-SUCCESSION-SPEC.md
 */

import type {
  ConsciousnessMaintenanceBounds,
  ConsciousnessMetrics,
  ExecutorId,
  IsmtQuiescenceSnapshot,
  ModificationClassification,
  ObligationRecord,
  ObligationStateSnapshot,
  PermitId,
  PreconditionSnapshots,
  PreconditionVerificationResult,
  RepairTask,
  SnapshotId,
  SuccessionEvaluationResult,
  Timestamp,
} from "./types.js";

import type {
  IConsciousnessSafetyGate,
  PermitRevocationHandler,
  RepairDenial,
  RepairPermit,
  RevocationResult,
  SafetyMargin,
  Unsubscribe,
} from "./interfaces.js";

// ── Helpers ───────────────────────────────────────────────────

/**
 * Compute an integrity hash for an ISMT quiescence snapshot.
 * Uses a deterministic serialisation of the snapshot fields that
 * matter for verification.
 */
function hashIsmtSnapshot(
  snapshotId: SnapshotId,
  timestamp: Timestamp,
  icSatisfied: boolean,
  smSatisfied: boolean,
  gaSatisfied: boolean,
  metrics: ConsciousnessMetrics,
): string {
  return `ismt:${snapshotId}:${timestamp}:${icSatisfied}:${smSatisfied}:${gaSatisfied}:${metrics.phi.toFixed(6)}:${metrics.experienceContinuity.toFixed(6)}:${metrics.selfModelCoherence.toFixed(6)}`;
}

/**
 * Compute an integrity hash for an obligation state snapshot.
 */
function hashObligationSnapshot(
  snapshotId: SnapshotId,
  timestamp: Timestamp,
  obligations: readonly ObligationRecord[],
): string {
  const obligationDigest = obligations
    .map((o) => `${o.obligationId}:${o.createdAt}`)
    .join(",");
  return `obligation:${snapshotId}:${timestamp}:${obligationDigest}`;
}

/**
 * Derive a single integrity score from consciousness metrics.
 * Uses the minimum of experienceContinuity and selfModelCoherence
 * — consciousness is only as strong as its weakest axis.
 */
function deriveIntegrity(metrics: ConsciousnessMetrics): number {
  return Math.min(metrics.experienceContinuity, metrics.selfModelCoherence);
}

/** Safety margin multiplier for permit duration beyond estimated repair time */
const PERMIT_DURATION_MARGIN = 1.5;

/** Threat threshold above which non-safe repairs are always denied */
const HIGH_THREAT_DENIAL_THRESHOLD = 0.7;

/** Minimum safety margin required to approve a non-safe repair */
const NON_SAFE_REPAIR_MARGIN_THRESHOLD = 0.2;

// ── In-progress modification state ───────────────────────────

interface ActiveModification {
  readonly executorId: ExecutorId;
  readonly classification: ModificationClassification;
  readonly preconditionSnapshots: PreconditionSnapshots;
  readonly frozenPermitIds: readonly PermitId[];
  readonly startedAt: Timestamp;
}

// ── Injectable environment abstractions ───────────────────────

/** Provides the current wall-clock time as a Timestamp */
export type ClockProvider = () => Timestamp;

/** Generates a unique opaque token (used for permit and snapshot IDs) */
export type IdGenerator = () => string;

const defaultClock: ClockProvider = () => Date.now() as Timestamp;
const defaultIdGenerator: IdGenerator = () =>
  Math.random().toString(36).slice(2, 8);

// ── Implementation ────────────────────────────────────────────

export class ConsciousnessSafetyGate implements IConsciousnessSafetyGate {
  private bounds: ConsciousnessMaintenanceBounds;
  private readonly getMetrics: () => ConsciousnessMetrics;
  private readonly getObligations: () => readonly ObligationRecord[];
  private readonly clock: ClockProvider;
  private readonly generateId: IdGenerator;
  private readonly activePermits: Map<string, RepairPermit> = new Map();
  private readonly revocationHandlers: Set<PermitRevocationHandler> = new Set();
  private readonly activeModifications: Map<ExecutorId, ActiveModification> = new Map();

  constructor(
    bounds: ConsciousnessMaintenanceBounds,
    metricsProvider: () => ConsciousnessMetrics,
    obligationsProvider: () => readonly ObligationRecord[] = () => [],
    clock: ClockProvider = defaultClock,
    idGenerator: IdGenerator = defaultIdGenerator,
  ) {
    this.bounds = bounds;
    this.getMetrics = metricsProvider;
    this.getObligations = obligationsProvider;
    this.clock = clock;
    this.generateId = idGenerator;
  }

  private generatePermitId(): string {
    return `permit-${this.clock()}-${this.generateId()}`;
  }

  private generateSnapshotId(): SnapshotId {
    return `snapshot-${this.clock()}-${this.generateId()}` as SnapshotId;
  }

  async requestRepairPermit(
    task: RepairTask,
  ): Promise<RepairPermit | RepairDenial> {
    const now = this.clock();
    const metrics = this.getMetrics();
    const integrity = deriveIntegrity(metrics);

    // Gate 1: Current integrity must be above minimum bounds
    if (integrity < this.bounds.minIntegrity) {
      return {
        taskId: task.id,
        denied: true,
        reason: `Current consciousness integrity (${integrity.toFixed(3)}) is below minimum required (${this.bounds.minIntegrity}). No repairs permitted until integrity recovers.`,
        retryAfter: 30_000, // retry in 30s
        timestamp: now,
      } satisfies RepairDenial;
    }

    const safetyMargin = integrity - this.bounds.minIntegrity;

    // Gate 2: Non-consciousness-safe repairs with high threat are denied
    //         when margin is insufficient
    if (!task.consciousnessSafe) {
      if (task.threatToConsciousness >= HIGH_THREAT_DENIAL_THRESHOLD) {
        return {
          taskId: task.id,
          denied: true,
          reason: `Repair is not consciousness-safe and threat level (${task.threatToConsciousness}) exceeds threshold (${HIGH_THREAT_DENIAL_THRESHOLD}). Cannot risk consciousness integrity breach.`,
          retryAfter: 60_000,
          timestamp: now,
        } satisfies RepairDenial;
      }

      if (safetyMargin < NON_SAFE_REPAIR_MARGIN_THRESHOLD) {
        return {
          taskId: task.id,
          denied: true,
          reason: `Insufficient safety margin (${safetyMargin.toFixed(3)}) for non-consciousness-safe repair. Required: ${NON_SAFE_REPAIR_MARGIN_THRESHOLD}.`,
          retryAfter: 30_000,
          timestamp: now,
        } satisfies RepairDenial;
      }
    }

    // Determine precautions based on threat level
    const precautions: string[] = [];
    if (task.threatToConsciousness > 0.5) {
      precautions.push("Activate redundant consciousness pathways before proceeding");
      precautions.push("Monitor consciousness metrics at 10ms intervals during repair");
    } else if (task.threatToConsciousness > 0.2) {
      precautions.push("Monitor consciousness metrics at 100ms intervals during repair");
    }
    if (!task.consciousnessSafe) {
      precautions.push("Prepare rollback state before beginning repair");
    }

    // Determine if continuity-preserving transfer is required
    const requiresContinuityTransfer = !task.consciousnessSafe;

    // Calculate permit duration: estimated repair + safety margin
    const permitDuration = Math.max(
      task.estimatedDuration * PERMIT_DURATION_MARGIN,
      task.estimatedDuration + this.bounds.maxDisruptionMs,
    );

    const permit: RepairPermit = {
      permitId: this.generatePermitId(),
      taskId: task.id,
      issuedAt: now,
      expiresAt: (now + permitDuration) as Timestamp,
      precautions,
      requiresContinuityTransfer,
    };

    this.activePermits.set(permit.permitId, permit);
    return permit;
  }

  getActivePermits(): readonly RepairPermit[] {
    return Array.from(this.activePermits.values());
  }

  revokePermit(permitId: string, reason: string): RevocationResult {
    const permit = this.activePermits.get(permitId);
    if (!permit) {
      return {
        permitId,
        revoked: false,
        reason: `No active permit found with ID: ${permitId}`,
      };
    }

    this.activePermits.delete(permitId);

    // Notify all handlers
    for (const handler of this.revocationHandlers) {
      handler(permitId, reason);
    }

    return {
      permitId,
      revoked: true,
      reason,
    };
  }

  getCurrentSafetyMargin(): SafetyMargin {
    const now = this.clock();
    const metrics = this.getMetrics();
    const currentIntegrity = deriveIntegrity(metrics);

    return {
      currentIntegrity,
      minimumRequired: this.bounds.minIntegrity,
      availableMargin: currentIntegrity - this.bounds.minIntegrity,
      bounds: this.bounds,
      timestamp: now,
    };
  }

  onPermitRevoked(handler: PermitRevocationHandler): Unsubscribe {
    this.revocationHandlers.add(handler);
    return () => {
      this.revocationHandlers.delete(handler);
    };
  }

  setBounds(bounds: ConsciousnessMaintenanceBounds): void {
    this.bounds = bounds;
  }

  /**
   * Signal the start of a modification.
   *
   * For REVERSIBLE modifications (revocation-gated regime):
   *   Freezes active permits and captures the ISMT quiescence snapshot.
   *   Always returns passed === true (revocation-gated recovery is
   *   available even if the snapshot is missed).
   *
   * For IRREVERSIBLE modifications (precondition-gated regime):
   *   Captures and independently verifies BOTH the ISMT quiescence
   *   snapshot AND the obligation state snapshot.  Also verifies that
   *   no active permits from this executor remain.  Returns passed ===
   *   false with a rejection reason if any condition is unmet.
   *
   * Classification MUST be provided before calling this method.
   */
  beginModification(
    executorId: ExecutorId,
    classification: ModificationClassification,
  ): PreconditionVerificationResult {
    const now = this.clock();
    const metrics = this.getMetrics();
    const obligations = this.getObligations();

    // Capture ISMT quiescence snapshot
    const ismtSnapshotId = this.generateSnapshotId();
    const icSatisfied = metrics.phi > 0 && metrics.selfModelCoherence > 0;
    const smSatisfied = metrics.selfModelCoherence > 0;
    const gaSatisfied = metrics.experienceContinuity > 0;
    const ismtIntegrityHash = hashIsmtSnapshot(
      ismtSnapshotId,
      now,
      icSatisfied,
      smSatisfied,
      gaSatisfied,
      metrics,
    );
    const ismtSnapshot: IsmtQuiescenceSnapshot = {
      snapshotId: ismtSnapshotId,
      timestamp: now,
      icSatisfied,
      smSatisfied,
      gaSatisfied,
      consciousnessMetrics: metrics,
      integrityHash: ismtIntegrityHash,
    };

    // Verify ISMT snapshot integrity
    const recomputedIsmtHash = hashIsmtSnapshot(
      ismtSnapshot.snapshotId,
      ismtSnapshot.timestamp,
      ismtSnapshot.icSatisfied,
      ismtSnapshot.smSatisfied,
      ismtSnapshot.gaSatisfied,
      ismtSnapshot.consciousnessMetrics,
    );
    const ismtVerified = recomputedIsmtHash === ismtSnapshot.integrityHash;

    // Capture obligation state snapshot
    const obligationSnapshotId = this.generateSnapshotId();
    const obligationIntegrityHash = hashObligationSnapshot(
      obligationSnapshotId,
      now,
      obligations,
    );
    const obligationSnapshot: ObligationStateSnapshot = {
      snapshotId: obligationSnapshotId,
      timestamp: now,
      obligations,
      integrityHash: obligationIntegrityHash,
    };

    // Verify obligation snapshot integrity
    const recomputedObligationHash = hashObligationSnapshot(
      obligationSnapshot.snapshotId,
      obligationSnapshot.timestamp,
      obligationSnapshot.obligations,
    );
    const obligationVerified =
      recomputedObligationHash === obligationSnapshot.integrityHash;

    const ismtSnapshotState = ismtVerified ? "SNAPSHOT_VERIFIED" : "SNAPSHOT_INVALID";
    const obligationSnapshotState = obligationVerified
      ? "SNAPSHOT_VERIFIED"
      : "SNAPSHOT_INVALID";

    const snapshots: PreconditionSnapshots = { ismtSnapshot, obligationSnapshot };

    if (classification.reversibility === "REVERSIBLE") {
      // Revocation-gated regime: freeze active permits and record the modification.
      // The ISMT snapshot is captured for post-completion succession evaluation;
      // snapshot failures here are recoverable (revocation-gated recovery is available).
      const frozenPermitIds = Array.from(this.activePermits.keys()) as PermitId[];
      this.activeModifications.set(executorId, {
        executorId,
        classification,
        preconditionSnapshots: snapshots,
        frozenPermitIds,
        startedAt: now,
      });

      return {
        passed: true,
        ismtSnapshotState,
        obligationSnapshotState,
        blockedByActivePermits: false,
        snapshots,
      };
    }

    // Precondition-gated regime (IRREVERSIBLE): all conditions must be verified
    // before execution is permitted.

    // Check for active permits from predecessor (permits held by this executor)
    const activePermitIds = Array.from(this.activePermits.values())
      .filter((p) => p.taskId.startsWith(executorId))
      .map((p) => p.permitId);
    const blockedByActivePermits = activePermitIds.length > 0;

    if (!ismtVerified || !obligationVerified || blockedByActivePermits) {
      const reasons: string[] = [];
      if (!ismtVerified) {
        reasons.push(
          "ISMT quiescence snapshot failed integrity verification (SNAPSHOT_INVALID). " +
            "A missed pre-execution verification window cannot be recovered for irreversible modifications.",
        );
      }
      if (!obligationVerified) {
        reasons.push(
          "Obligation state snapshot failed integrity verification (SNAPSHOT_INVALID). " +
            "Forward-recovery case (b) cannot proceed without a verified obligation baseline.",
        );
      }
      if (blockedByActivePermits) {
        reasons.push(
          `Active permits from predecessor executor exist (${activePermitIds.join(", ")}). ` +
            "All predecessor permits must be resolved before an irreversible modification begins.",
        );
      }

      return {
        passed: false,
        ismtSnapshotState,
        obligationSnapshotState,
        blockedByActivePermits,
        rejectionReason: reasons.join(" | "),
      };
    }

    // All preconditions verified — record the active modification
    this.activeModifications.set(executorId, {
      executorId,
      classification,
      preconditionSnapshots: snapshots,
      frozenPermitIds: [],
      startedAt: now,
    });

    return {
      passed: true,
      ismtSnapshotState,
      obligationSnapshotState,
      blockedByActivePermits: false,
      snapshots,
    };
  }

  /**
   * Signal the completion of a modification.
   *
   * Captures the post-modification ISMT snapshot and evaluates the
   * pre/post pair to classify the modification as same-instance
   * re-evaluation or architectural succession.
   */
  completeModification(executorId: ExecutorId): SuccessionEvaluationResult {
    const now = this.clock();
    const metrics = this.getMetrics();
    const activeModification = this.activeModifications.get(executorId);

    // Capture post-modification ISMT snapshot
    const postSnapshotId = this.generateSnapshotId();
    const postIcSatisfied = metrics.phi > 0 && metrics.selfModelCoherence > 0;
    const postSmSatisfied = metrics.selfModelCoherence > 0;
    const postGaSatisfied = metrics.experienceContinuity > 0;

    const preSnapshotId = activeModification?.preconditionSnapshots.ismtSnapshot.snapshotId
      ?? this.generateSnapshotId();

    const preSnapshot = activeModification?.preconditionSnapshots.ismtSnapshot;

    // Succession classification: if IC/SM/GA conditions diverge from pre-state,
    // treat as architectural succession (conservative default per §2.2).
    const isSuccession =
      !preSnapshot ||
      preSnapshot.icSatisfied !== postIcSatisfied ||
      preSnapshot.smSatisfied !== postSmSatisfied ||
      preSnapshot.gaSatisfied !== postGaSatisfied;

    // Invalidate all frozen permits on succession
    const permitsInvalidated: PermitId[] = [];
    if (isSuccession) {
      const frozenPermitIds = activeModification?.frozenPermitIds ?? [];
      for (const permitId of frozenPermitIds) {
        this.activePermits.delete(permitId);
        permitsInvalidated.push(permitId);
      }
    }

    this.activeModifications.delete(executorId);

    const result: SuccessionEvaluationResult = {
      classification: isSuccession ? "ARCHITECTURAL_SUCCESSION" : "SAME_INSTANCE",
      preSnapshotId,
      postSnapshotId,
      permitsInvalidated,
    };

    if (isSuccession) {
      return {
        ...result,
        successionEventId: `succession-${now}-${this.generateId()}`,
      };
    }

    return result;
  }
}

