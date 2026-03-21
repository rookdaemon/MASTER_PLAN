/**
 * Autonomous Space Manufacturing — CLCS (Closed-Loop Control System)
 * Domain: 0.4.1.3
 *
 * Implements Contract C4 and Behavioral Spec scenarios from card 0.4.1.3.
 * Orchestrates production orders, processes QA results, handles fault recovery,
 * and manages power-based throttling — all without human intervention.
 */

import {
  MAX_CONSECUTIVE_FAILURES,
  POWER_DEFICIT_THROTTLE_HOURS,
  type ProductionOrder,
  type QAManifest,
  type RecalibrationOrder,
  type PowerBudget,
  type FailureMode,
  type CalibrationDelta,
} from './types.js';

// ============================================================
// Result types
// ============================================================

/** Result of processing a QAManifest through the CLCS. */
export interface CLCSResult {
  /** Recalibration order issued to a subsystem, if applicable. */
  readonly recalibrationOrder?: RecalibrationOrder;
  /** Whether the production order was re-queued for retry. */
  readonly requeued: boolean;
  /** Design ID of the re-queued order, if requeued. */
  readonly requeuedOrderDesignId?: string;
  /** Whether the failed part should be recycled back to ISRP feedstock. */
  readonly recycleToISRP: boolean;
  /** Whether the design was quarantined due to repeated failures. */
  readonly designQuarantined: boolean;
  /** Whether the design was flagged for mission-parameter review. */
  readonly flaggedForReview: boolean;
  /** Whether human intervention is required (always false for defined taxonomy). */
  readonly requiresHumanIntervention: boolean;
}

/** Result of evaluating power telemetry. */
export interface CLCSPowerAction {
  /** Whether production rate has been throttled due to low power reserves. */
  readonly throttled: boolean;
  /** Whether ISRP thermal refining is prioritized to peak-solar windows. */
  readonly isrpPrioritized: boolean;
  /** Whether production has been fully stopped (projectedDeficitHours reached 0). */
  readonly productionStopped: boolean;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Maps a failure mode to the subsystem responsible for recalibration.
 * D1 Decision: modular pipeline — each fault routes to the responsible subsystem.
 */
function recalibrationTarget(mode: FailureMode): 'MFM' | 'ISRP' {
  switch (mode) {
    case 'GEOMETRY_DRIFT':
      return 'MFM';
    case 'MATERIAL_OFF_SPEC':
      return 'ISRP';
    case 'POWER_BUDGET_EXCEEDED':
      return 'MFM';
    case 'REPEATED_FAILURE':
      return 'MFM';
  }
}

function defaultCalibrationDelta(mode: FailureMode): CalibrationDelta {
  return {
    parameter: `${mode.toLowerCase()}_correction`,
    currentValue: 0,
    suggestedValue: 1,
  };
}

// ============================================================
// CLCSOrchestrator
// ============================================================

/**
 * Closed-Loop Control System orchestrator.
 *
 * Manages production order queue, processes QA manifests for fault recovery,
 * tracks consecutive failures per design, quarantines problematic designs,
 * and evaluates power telemetry for throttling decisions.
 *
 * Contract C4 invariant: never requires human intervention for faults
 * within the defined fault taxonomy.
 */
export class CLCSOrchestrator {
  private readonly productionQueue: ProductionOrder[] = [];
  private readonly quarantinedDesigns: Set<string> = new Set();
  private readonly consecutiveFailures: Map<string, number> = new Map();

  // -- C4 Precondition: production queue management --

  /** Enqueue a production order for processing. */
  enqueueOrder(order: ProductionOrder): void {
    this.productionQueue.push(order);
  }

  /** Returns all pending orders (including those for quarantined designs). */
  getPendingOrders(): readonly ProductionOrder[] {
    return [...this.productionQueue];
  }

  /**
   * Returns orders eligible for dispatch.
   * C4 invariant: quarantined designs are excluded from dispatch.
   */
  getDispatchableOrders(): readonly ProductionOrder[] {
    return this.productionQueue.filter(
      (o) => !this.quarantinedDesigns.has(o.designId)
    );
  }

  /** Check whether a design has been quarantined. */
  isDesignQuarantined(designId: string): boolean {
    return this.quarantinedDesigns.has(designId);
  }

  // -- Behavioral Spec: QA Manifest processing --

  /**
   * Process a QAManifest, implementing all three Behavioral Spec scenarios:
   *
   * 1. FAIL + failureMode + consecutive < MAX → recalibrate, re-queue, recycle
   * 2. FAIL + consecutive >= MAX → quarantine, flag, continue queue
   * 3. PASS → reset consecutive counter, no re-queue
   * 4. REWORK → re-queue with same design (no recalibration)
   */
  processQAManifest(
    manifest: QAManifest,
    failureMode: FailureMode | undefined,
    designId: string,
    now: number
  ): CLCSResult {
    // PASS disposition: reset failures, no re-queue
    if (manifest.disposition === 'PASS') {
      this.consecutiveFailures.set(designId, 0);
      return {
        requeued: false,
        recycleToISRP: false,
        designQuarantined: false,
        flaggedForReview: false,
        requiresHumanIntervention: false,
      };
    }

    // REWORK disposition: re-queue, no recalibration, no failure tracking
    if (manifest.disposition === 'REWORK') {
      this.requeue(designId, now);
      return {
        requeued: true,
        requeuedOrderDesignId: designId,
        recycleToISRP: false,
        designQuarantined: false,
        flaggedForReview: false,
        requiresHumanIntervention: false,
      };
    }

    // FAIL disposition: track consecutive failures
    const prevCount = this.consecutiveFailures.get(designId) ?? 0;
    const newCount = prevCount + 1;
    this.consecutiveFailures.set(designId, newCount);

    // Scenario 2: consecutive >= MAX_CONSECUTIVE_FAILURES → quarantine
    if (newCount >= MAX_CONSECUTIVE_FAILURES) {
      this.quarantinedDesigns.add(designId);
      // Remove quarantined design orders from the queue
      this.removeOrdersForDesign(designId);

      return {
        requeued: false,
        recycleToISRP: true,
        designQuarantined: true,
        flaggedForReview: true,
        requiresHumanIntervention: false,
      };
    }

    // Scenario 1: consecutive < MAX → recalibrate + re-queue + recycle
    const recalibrationOrder: RecalibrationOrder | undefined = failureMode
      ? {
          subsystem: recalibrationTarget(failureMode),
          failureMode,
          suggestedAdjustment: defaultCalibrationDelta(failureMode),
          priority: 'SCHEDULED',
        }
      : undefined;

    this.requeue(designId, now);

    return {
      recalibrationOrder,
      requeued: true,
      requeuedOrderDesignId: designId,
      recycleToISRP: true,
      designQuarantined: false,
      flaggedForReview: false,
      requiresHumanIntervention: false,
    };
  }

  // -- Behavioral Spec Scenario 3: power telemetry evaluation --

  /**
   * Evaluate power telemetry and determine throttling actions.
   *
   * - projectedDeficitHours < POWER_DEFICIT_THROTTLE_HOURS → throttle, prioritize ISRP
   * - projectedDeficitHours == 0 → stop production entirely
   * - otherwise → normal operation
   */
  evaluatePowerTelemetry(powerBudget: PowerBudget): CLCSPowerAction {
    const deficit = powerBudget.projectedDeficitHours;

    if (deficit <= 0) {
      return {
        throttled: true,
        isrpPrioritized: true,
        productionStopped: true,
      };
    }

    if (deficit < POWER_DEFICIT_THROTTLE_HOURS) {
      return {
        throttled: true,
        isrpPrioritized: true,
        productionStopped: false,
      };
    }

    return {
      throttled: false,
      isrpPrioritized: false,
      productionStopped: false,
    };
  }

  // -- Private helpers --

  private requeue(designId: string, now: number): void {
    this.productionQueue.push({
      orderId: `requeue-${designId}-${now}`,
      designId,
      priority: 'NORMAL',
      requestedTimestamp: now,
    });
  }

  private removeOrdersForDesign(designId: string): void {
    let i = this.productionQueue.length;
    while (i--) {
      if (this.productionQueue[i].designId === designId) {
        this.productionQueue.splice(i, 1);
      }
    }
  }
}
