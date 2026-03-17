/**
 * RollbackEngine — concrete implementation.
 *
 * Reverses partial neuronal replacement if continuity metrics (Ψ) fall
 * below threshold during transfer. Reactivates biological neurons in
 * reverse order while they remain within the grace period.
 *
 * See: docs/continuity-preserving-transfer/ARCHITECTURE.md §4 (Rollback Engine)
 * Addresses AC4 (rollback mechanism).
 */

import {
  NeuronSubstrateState,
  type PsiMetric,
  type ReplacementUnit,
  type RollbackEngine,
  type RollbackResult,
} from "./types.js";

export class RollbackEngineImpl implements RollbackEngine {
  private units: ReplacementUnit[];
  private gracePeriod_ms: number;
  private psiProvider: () => PsiMetric;

  constructor(units: ReplacementUnit[], gracePeriod_ms: number, psiProvider: () => PsiMetric) {
    this.units = units;
    this.gracePeriod_ms = gracePeriod_ms;
    this.psiProvider = psiProvider;
  }

  canRollback(steps: number): boolean {
    if (steps <= 0) return false;
    return this.getReversibleSteps() >= steps;
  }

  getReversibleSteps(): number {
    // Count units that are still Synthetic and within grace period
    return this.units.filter(
      (u) => u.rollbackAvailable && u.state === NeuronSubstrateState.Synthetic
    ).length;
  }

  async executeRollback(steps: number): Promise<RollbackResult> {
    const reversible = this.getReversibleSteps();

    if (steps > reversible) {
      // Collect irreversible unit IDs
      const irreversibleUnits = this.units
        .filter((u) => !u.rollbackAvailable)
        .map((u) => u.neuronId);

      return {
        success: false,
        stepsReversed: 0,
        currentStepIndex: this.units.length > 0
          ? this.units[this.units.length - 1].stepIndex
          : 0,
        postRollbackPsi: this.psiProvider(),
        irreversibleUnits,
      };
    }

    // Reverse in reverse order (latest step first)
    let reversed = 0;
    for (let i = this.units.length - 1; i >= 0 && reversed < steps; i--) {
      const unit = this.units[i];
      if (unit.rollbackAvailable && unit.state === NeuronSubstrateState.Synthetic) {
        unit.state = NeuronSubstrateState.RollingBack;
        // Simulate reactivation of biological neuron
        unit.state = NeuronSubstrateState.Biological;
        unit.rollbackAvailable = false;
        unit.replacedAt_ms = null;
        unit.graceDeadline_ms = null;
        reversed++;
      }
    }

    // Determine current step index after rollback
    const remainingSynthetic = this.units.filter(
      (u) => u.state === NeuronSubstrateState.Synthetic || u.state === NeuronSubstrateState.SyntheticFinal
    );
    const currentStepIndex = remainingSynthetic.length > 0
      ? Math.max(...remainingSynthetic.map((u) => u.stepIndex))
      : 0;

    const irreversibleUnits = this.units
      .filter((u) => u.state === NeuronSubstrateState.SyntheticFinal)
      .map((u) => u.neuronId);

    return {
      success: true,
      stepsReversed: reversed,
      currentStepIndex,
      postRollbackPsi: this.psiProvider(),
      irreversibleUnits,
    };
  }
}
