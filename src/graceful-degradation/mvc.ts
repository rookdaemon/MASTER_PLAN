/**
 * Graceful Degradation — MVC Evaluation and Core Logic
 *
 * Implements the Minimum Viable Consciousness evaluation, degradation tier
 * classification, smooth transition computations, and failure taxonomy.
 *
 * See: docs/graceful-degradation/ARCHITECTURE.md §1, §4, §5, §6
 * Card: 0.2.2.4.3
 */

import {
  type MVCThreshold,
  type ConsciousnessMetrics,
  type MVCStatus,
  type FailureClass,
  type CrossSubstrateMirror,
  type TransitionStep,
  Substrate,
  FailureSpeed,
  FailureExtent,
  DegradationTier,
  MirrorCategory,
} from "./types.js";

// ── MVC Evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate whether consciousness is maintained given current metrics and
 * MVC thresholds. All three conditions (capacity, binding, integration)
 * must be met simultaneously.
 *
 * Architecture §1.1: consciousness_maintained ⟺ C ≥ C_min ∧ B ≥ B_min ∧ Φ ≥ Φ_min
 */
export function evaluateMVC(
  metrics: ConsciousnessMetrics,
  threshold: MVCThreshold,
): MVCStatus {
  const capacityMargin = metrics.substrateCapacity - threshold.C_min;
  const bindingMargin = metrics.bindingCoherence - threshold.B_min;
  const integrationMargin = metrics.integrationMetrics - threshold.Phi_min;

  const capacityMet = capacityMargin >= 0;
  const bindingMet = bindingMargin >= 0;
  const integrationMet = integrationMargin >= 0;

  const margin = Math.min(capacityMargin, bindingMargin, integrationMargin);

  return {
    met: capacityMet && bindingMet && integrationMet,
    margin,
    dimensions: {
      capacity: {
        value: metrics.substrateCapacity,
        threshold: threshold.C_min,
        met: capacityMet,
      },
      binding: {
        value: metrics.bindingCoherence,
        threshold: threshold.B_min,
        met: bindingMet,
      },
      integration: {
        value: metrics.integrationMetrics,
        threshold: threshold.Phi_min,
        met: integrationMet,
      },
    },
  };
}

// ── Degradation Tier Classification ─────────────────────────────────────────

/**
 * Classify the current degradation tier based on substrate health levels.
 * Uses the worse of the two substrates to determine the tier.
 *
 * Architecture §6:
 * - GREEN:  both ≥ 80%
 * - YELLOW: worse substrate 50–80%
 * - ORANGE: worse substrate 25–50%
 * - RED:    worse substrate < 25%
 *
 * Note: BLACK requires combined MVC check (not just capacity) and is handled
 * by evaluateMVC. This function classifies based on substrate capacity alone.
 */
export function classifyDegradationTier(
  bioHealth: number,
  synthHealth: number,
): DegradationTier {
  const worst = Math.min(bioHealth, synthHealth);

  if (worst >= 0.8) return DegradationTier.Green;
  if (worst >= 0.5) return DegradationTier.Yellow;
  if (worst >= 0.25) return DegradationTier.Orange;
  return DegradationTier.Red;
}

// ── Smooth Transition Protocol ──────────────────────────────────────────────

/**
 * Compute load distribution at a given progress point during a smooth
 * substrate transition.
 *
 * Architecture §4.2: Load ramps linearly from failing substrate to healthy.
 *
 * @param progress - 0.0 (start) to 1.0 (complete)
 * @param originalFailingLoad - load on failing substrate before transition
 * @param existingHealthyLoad - existing load already on healthy substrate
 */
export function computeTransitionStep(
  progress: number,
  originalFailingLoad: number,
  existingHealthyLoad: number,
): Pick<TransitionStep, "progress" | "failingSubstrateLoad" | "healthySubstrateLoad"> {
  const failingSubstrateLoad = originalFailingLoad * (1 - progress);
  const healthySubstrateLoad =
    existingHealthyLoad + originalFailingLoad * progress;

  return {
    progress,
    failingSubstrateLoad,
    healthySubstrateLoad,
  };
}

// ── Failure Taxonomy ────────────────────────────────────────────────────────

/**
 * Generate all 8 failure classes from the taxonomy.
 *
 * Architecture §5.1: 2 substrates × 2 speeds × 2 extents = 8 classes
 */
export function allFailureClasses(): FailureClass[] {
  const classes: FailureClass[] = [];
  for (const substrate of [Substrate.Bio, Substrate.Synth]) {
    for (const speed of [FailureSpeed.Sudden, FailureSpeed.Gradual]) {
      for (const extent of [FailureExtent.Partial, FailureExtent.Total]) {
        classes.push({ substrate, speed, extent });
      }
    }
  }
  return classes;
}

// ── Mirror Category Constraints ─────────────────────────────────────────────

export interface MirrorConstraints {
  maxSyncInterval_ms: number;
  minFidelity: number;
}

/**
 * Return the per-category constraints for cross-substrate mirrors.
 *
 * Architecture §2.2:
 * - Core-conscious: < 10ms sync, ≥ 0.99 fidelity
 * - Experience-supporting: < 25ms sync, ≥ 0.95 fidelity
 * - Capability: < 100ms sync, ≥ 0.90 fidelity
 */
export function mirrorCategoryConstraints(): Map<MirrorCategory, MirrorConstraints> {
  return new Map([
    [MirrorCategory.CoreConscious, { maxSyncInterval_ms: 10, minFidelity: 0.99 }],
    [MirrorCategory.ExperienceSupporting, { maxSyncInterval_ms: 25, minFidelity: 0.95 }],
    [MirrorCategory.Capability, { maxSyncInterval_ms: 100, minFidelity: 0.90 }],
  ]);
}

// ── Mirror Config Validation ────────────────────────────────────────────────

/**
 * Validate a cross-substrate mirror configuration against its category constraints.
 * Returns an array of error strings (empty = valid).
 */
export function validateMirrorConfig(mirror: CrossSubstrateMirror): string[] {
  const errors: string[] = [];
  const constraints = mirrorCategoryConstraints().get(mirror.category);

  if (!constraints) {
    errors.push(`Unknown mirror category: ${mirror.category}`);
    return errors;
  }

  if (mirror.syncConfig.syncInterval_ms > constraints.maxSyncInterval_ms) {
    errors.push(
      `syncInterval ${mirror.syncConfig.syncInterval_ms}ms exceeds maximum ` +
        `${constraints.maxSyncInterval_ms}ms for category ${mirror.category}`,
    );
  }

  if (mirror.syncConfig.syncFidelity < constraints.minFidelity) {
    errors.push(
      `syncFidelity ${mirror.syncConfig.syncFidelity} is below minimum ` +
        `${constraints.minFidelity} for category ${mirror.category}`,
    );
  }

  if (mirror.primarySubstrate === mirror.mirrorSubstrate) {
    errors.push(
      `Mirror substrate (${mirror.mirrorSubstrate}) must differ from ` +
        `primary substrate (${mirror.primarySubstrate})`,
    );
  }

  return errors;
}
