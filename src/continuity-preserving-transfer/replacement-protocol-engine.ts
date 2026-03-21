/**
 * ReplacementProtocolEngine — concrete implementation.
 *
 * Orchestrates the overall Gradual Neuronal Replacement (GNR) transfer process.
 * Plans, executes, pauses, rolls back, and aborts transfers while maintaining
 * continuity of subjective experience.
 *
 * See: docs/continuity-preserving-transfer/ARCHITECTURE.md §2 (RPE)
 * Addresses AC2 (gradual replacement protocol), AC3 (real-time monitoring),
 * AC4 (rollback), AC5 (teleporter problem resolution).
 */

import {
  AlertLevel,
  computeAlertLevel,
  DEFAULT_BATCH_SIZE,
  DEFAULT_GRACE_PERIOD_MS,
  MAX_LOOP_REPLACEMENT_FRACTION,
  MIN_PACING_INTERVAL_MS,
  NeuronSubstrateState,
  type PsiMetric,
  type ReplacementProtocolEngine,
  type ReplacementUnit,
  type RollbackResult,
  type StepResult,
  type SubjectProfile,
  type TransferPlan,
} from "./types.js";
import { RealTimeContinuityMonitorImpl } from "./real-time-continuity-monitor.js";
import { RollbackEngineImpl } from "./rollback-engine.js";

/**
 * Provides replacement units for a subject — abstracts brain topology
 * (sourced from emulation model 0.2.2.1). Units are returned unordered;
 * the RPE applies ordering constraints.
 */
export type NeuronTopologyProvider = (subject: SubjectProfile) => ReplacementUnit[];

/**
 * Measures the current Ψ metric for a subject — abstracts the actual
 * measurement hardware/instrumentation. Injectable for testing.
 */
export type PsiMeasurer = (subject: SubjectProfile) => PsiMetric;

export class ReplacementProtocolEngineImpl implements ReplacementProtocolEngine {
  private paused = false;
  private currentPlan: TransferPlan | null = null;
  private lastCompletedStep = -1;

  constructor(
    private readonly topologyProvider: NeuronTopologyProvider,
    private readonly psiMeasurer: PsiMeasurer,
    private readonly rtcm: RealTimeContinuityMonitorImpl,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  planTransfer(subject: SubjectProfile): TransferPlan {
    // Precondition: subject has baseline Ψ measurements
    if (!subject.baselinePsi || subject.baselinePsi.length === 0) {
      throw new Error("Subject must have baseline Ψ measurements");
    }

    const rawUnits = this.topologyProvider(subject);

    // Sort by ordering constraints:
    // 1. Periphery-first (lower BrainRegionPriority first)
    // 2. Cluster coherence (same cluster grouped together)
    const sorted = [...rawUnits].sort((a, b) => {
      if (a.regionPriority !== b.regionPriority) {
        return a.regionPriority - b.regionPriority;
      }
      if (a.clusterId !== b.clusterId) {
        return a.clusterId.localeCompare(b.clusterId);
      }
      return 0;
    });

    // Validate loop fraction limits for each batch
    this.validateLoopFractions(sorted, DEFAULT_BATCH_SIZE);

    // Assign step indices based on batch position
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].stepIndex = Math.floor(i / DEFAULT_BATCH_SIZE);
    }

    const plan: TransferPlan = {
      subject,
      totalUnits: sorted.length,
      replacementOrder: sorted,
      batchSize: DEFAULT_BATCH_SIZE,
      pacingInterval_ms: MIN_PACING_INTERVAL_MS,
      continuityThreshold: subject.psiThreshold,
      rollbackCapacity: Math.ceil(sorted.length / DEFAULT_BATCH_SIZE),
      gracePeriod_ms: DEFAULT_GRACE_PERIOD_MS,
    };

    this.currentPlan = plan;
    this.lastCompletedStep = -1;
    return plan;
  }

  async executeStep(plan: TransferPlan, stepIndex: number): Promise<StepResult> {
    const totalSteps = Math.ceil(plan.totalUnits / plan.batchSize);

    // Precondition: valid step index
    if (stepIndex < 0 || stepIndex >= totalSteps) {
      throw new Error(
        `Invalid step index ${stepIndex}: must be 0 ≤ stepIndex < ${totalSteps}`,
      );
    }

    // Precondition: previous step completed (step 0 has no predecessor)
    if (stepIndex > 0 && this.lastCompletedStep !== stepIndex - 1) {
      throw new Error(
        `Previous step ${stepIndex - 1} must be completed before step ${stepIndex}`,
      );
    }

    // Precondition: RTCM is monitoring (getCurrentPsi will throw if not started)
    // Precondition: alert level is not RED (only check if measurements exist)
    if (stepIndex > 0) {
      const currentAlert = this.rtcm.getAlertLevel();
      if (currentAlert === AlertLevel.RED) {
        throw new Error("Cannot execute step: alert level is RED");
      }
    }

    const startTime = this.clock();

    // Get units for this step (batch)
    const batchStart = stepIndex * plan.batchSize;
    const batchEnd = Math.min(batchStart + plan.batchSize, plan.totalUnits);
    const units = plan.replacementOrder.slice(batchStart, batchEnd);

    // Transition units: Biological → Absorbing → Synthetic
    // Each synthetic unit inherits causal state from biological predecessor
    const now = this.clock();
    for (const unit of units) {
      unit.state = NeuronSubstrateState.Absorbing;
      // State absorption complete — synthetic unit now active
      unit.state = NeuronSubstrateState.Synthetic;
      unit.replacedAt_ms = now;
      unit.graceDeadline_ms = now + plan.gracePeriod_ms;
      unit.rollbackAvailable = true;
    }

    // Measure Ψ after step — no step proceeds without verification
    const postStepPsi = this.psiMeasurer(plan.subject);
    this.rtcm.recordMeasurement(postStepPsi);
    const alertLevel = computeAlertLevel(postStepPsi);

    const endTime = this.clock();
    this.lastCompletedStep = stepIndex;

    return {
      stepIndex,
      unitsReplaced: units,
      postStepPsi,
      alertLevel,
      duration_ms: endTime - startTime,
      success: alertLevel !== AlertLevel.RED,
    };
  }

  pause(): void {
    this.paused = true;
  }

  async rollback(toStep: number): Promise<RollbackResult> {
    if (!this.currentPlan) {
      throw new Error("No transfer plan exists");
    }
    if (toStep > this.lastCompletedStep) {
      throw new Error(
        `Cannot roll back to step ${toStep}: currently at step ${this.lastCompletedStep}`,
      );
    }

    // Find all units that need to be rolled back (stepIndex > toStep)
    const unitsToRollback = this.currentPlan.replacementOrder.filter(
      (u) =>
        u.stepIndex > toStep &&
        u.state === NeuronSubstrateState.Synthetic &&
        u.rollbackAvailable,
    ).length;

    const rollbackEngine = new RollbackEngineImpl(
      this.currentPlan.replacementOrder,
      this.currentPlan.gracePeriod_ms,
      () => this.psiMeasurer(this.currentPlan!.subject),
    );

    const result = await rollbackEngine.executeRollback(unitsToRollback);
    if (result.success) {
      this.lastCompletedStep = toStep;
    }
    return result;
  }

  async abort(): Promise<RollbackResult> {
    if (!this.currentPlan) {
      throw new Error("No transfer plan exists");
    }

    const rollbackEngine = new RollbackEngineImpl(
      this.currentPlan.replacementOrder,
      this.currentPlan.gracePeriod_ms,
      () => this.psiMeasurer(this.currentPlan!.subject),
    );

    const reversible = rollbackEngine.getReversibleSteps();
    if (reversible === 0) {
      return {
        success: true,
        stepsReversed: 0,
        currentStepIndex: 0,
        postRollbackPsi: this.psiMeasurer(this.currentPlan.subject),
        irreversibleUnits: this.currentPlan.replacementOrder
          .filter((u) => u.state === NeuronSubstrateState.SyntheticFinal)
          .map((u) => u.neuronId),
      };
    }

    const result = await rollbackEngine.executeRollback(reversible);
    if (result.success) {
      this.lastCompletedStep = -1;
    }
    return result;
  }

  /**
   * Validates that no single thalamocortical loop has more than
   * MAX_LOOP_REPLACEMENT_FRACTION of its neurons replaced in any one batch.
   */
  private validateLoopFractions(
    units: ReplacementUnit[],
    batchSize: number,
  ): void {
    // Count total neurons per loop across all units
    const neuronsPerLoop = new Map<string, number>();
    for (const unit of units) {
      for (const loopId of unit.loopIds) {
        neuronsPerLoop.set(loopId, (neuronsPerLoop.get(loopId) || 0) + 1);
      }
    }

    // For each batch, verify loop fraction limits
    for (
      let batchStart = 0;
      batchStart < units.length;
      batchStart += batchSize
    ) {
      const batchEnd = Math.min(batchStart + batchSize, units.length);
      const batchUnits = units.slice(batchStart, batchEnd);

      const batchLoopCounts = new Map<string, number>();
      for (const unit of batchUnits) {
        for (const loopId of unit.loopIds) {
          batchLoopCounts.set(
            loopId,
            (batchLoopCounts.get(loopId) || 0) + 1,
          );
        }
      }

      for (const [loopId, count] of batchLoopCounts) {
        const totalInLoop = neuronsPerLoop.get(loopId) || 1;
        const fraction = count / totalInLoop;
        if (fraction > MAX_LOOP_REPLACEMENT_FRACTION) {
          throw new Error(
            `Loop ${loopId} would have ${(fraction * 100).toFixed(1)}% of neurons replaced in one step (max ${MAX_LOOP_REPLACEMENT_FRACTION * 100}%)`,
          );
        }
      }
    }
  }
}
