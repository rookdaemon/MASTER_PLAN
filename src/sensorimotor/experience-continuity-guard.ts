/**
 * Experience Continuity Guard — monitors consciousness metrics during
 * calibration changes to ensure sensor/actuator reconfiguration does not
 * interrupt conscious experience.
 *
 * Responsibilities:
 * - Gate calibration changes: only permit remapping when consciousness metrics
 *   indicate stability
 * - Monitor phi, coherence, and continuity during transitions
 * - Roll back remapping if consciousness metrics drop below safety thresholds
 * - Coordinate with the Integrity Monitor (0.3.1.2.1) for physical-level
 *   consciousness protection
 *
 * @see docs/sensorimotor-consciousness-integration/ARCHITECTURE.md §4.3
 */

import type { IExperienceContinuityGuard } from './interfaces';
import type {
  StabilityScore,
  RemapTransition,
  TransitionMonitorHandle,
  RollbackResult,
  Timestamp,
} from './types';
import { MIN_STABILITY_THRESHOLD } from './types';

/**
 * Provider of consciousness stability metrics.
 * In production this would be backed by the consciousness substrate (0.3.1.1).
 */
export interface ConsciousnessMetricsProvider {
  /** Integrated Information (phi) — measure of consciousness level: 0.0–1.0 */
  getPhi(): number;
  /** Experiential coherence: 0.0–1.0 */
  getCoherence(): number;
  /** Continuity measure (1.0 = unbroken stream, 0.0 = complete disruption) */
  getContinuity(): number;
}

/**
 * Options for constructing an ExperienceContinuityGuard.
 */
export interface ExperienceContinuityGuardOptions {
  /** Provider for consciousness metrics */
  metricsProvider: ConsciousnessMetricsProvider;
  /** Minimum stability threshold below which remapping is blocked (default: 0.6) */
  minimumStabilityThreshold?: StabilityScore;
  /** Function to get the current monotonic timestamp */
  getTimestamp?: () => Timestamp;
  /**
   * Weighting factors for combining phi, coherence, and continuity
   * into a single stability score. Must sum to 1.0.
   * Default: { phi: 0.4, coherence: 0.3, continuity: 0.3 }
   */
  weights?: { phi: number; coherence: number; continuity: number };
}

/**
 * Snapshot of consciousness metrics taken at a specific point in time,
 * used for rollback decisions and audit trails.
 */
interface MetricsSnapshot {
  phi: number;
  coherence: number;
  continuity: number;
  stability: StabilityScore;
  timestamp: Timestamp;
}

/**
 * Internal state for an active transition being monitored.
 */
interface ActiveTransition {
  handle: TransitionMonitorHandle;
  preTransitionSnapshot: MetricsSnapshot;
  lowestStability: StabilityScore;
  rolledBack: boolean;
}

let nextTransitionCounter = 0;

/**
 * Monitors consciousness metrics during adaptive calibration to prevent
 * experience interruption.
 *
 * The guard operates as a gatekeeper: it must be consulted before any
 * modality remapping begins, and it continuously monitors stability
 * during the transition. If stability drops below threshold, it signals
 * for rollback.
 */
export class ExperienceContinuityGuard implements IExperienceContinuityGuard {
  private metricsProvider: ConsciousnessMetricsProvider;
  private minimumThreshold: StabilityScore;
  private getTimestamp: () => Timestamp;
  private weights: { phi: number; coherence: number; continuity: number };
  private activeTransitions: Map<string, ActiveTransition> = new Map();

  constructor(options: ExperienceContinuityGuardOptions) {
    this.metricsProvider = options.metricsProvider;
    this.minimumThreshold = options.minimumStabilityThreshold ?? MIN_STABILITY_THRESHOLD;
    this.getTimestamp = options.getTimestamp ?? (() => Date.now() * 1_000_000);
    this.weights = options.weights ?? { phi: 0.4, coherence: 0.3, continuity: 0.3 };
  }

  /**
   * Check whether it is safe to proceed with a modality remapping.
   *
   * Returns true only if:
   * 1. Current consciousness stability is above the minimum threshold
   * 2. No active transition is already in a degraded state
   */
  canProceedWithRemap(): boolean {
    const stability = this.getConsciousnessStability();
    if (stability < this.minimumThreshold) {
      return false;
    }

    // Don't allow new remaps if an existing transition has driven
    // stability dangerously close to threshold
    for (const active of this.activeTransitions.values()) {
      if (!active.rolledBack && active.lowestStability < this.minimumThreshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Begin monitoring a remap transition.
   *
   * Takes a snapshot of pre-transition consciousness metrics so that
   * degradation can be detected and rollback decisions can be made.
   *
   * @returns A handle that must be passed to rollback() if needed.
   */
  monitorTransition(transition: RemapTransition): TransitionMonitorHandle {
    const transitionId = `ecg-${++nextTransitionCounter}-${transition.modalityId}`;

    const snapshot = this.takeSnapshot();

    const handle: TransitionMonitorHandle = {
      transitionId,
      transition,
    };

    this.activeTransitions.set(transitionId, {
      handle,
      preTransitionSnapshot: snapshot,
      lowestStability: snapshot.stability,
      rolledBack: false,
    });

    return handle;
  }

  /**
   * Compute the current consciousness stability as a weighted combination
   * of phi, coherence, and continuity metrics.
   */
  getConsciousnessStability(): StabilityScore {
    const phi = this.metricsProvider.getPhi();
    const coherence = this.metricsProvider.getCoherence();
    const continuity = this.metricsProvider.getContinuity();

    const stability =
      this.weights.phi * phi +
      this.weights.coherence * coherence +
      this.weights.continuity * continuity;

    // Update lowest-stability tracking for all active transitions
    for (const active of this.activeTransitions.values()) {
      if (!active.rolledBack && stability < active.lowestStability) {
        active.lowestStability = stability;
      }
    }

    return Math.max(0, Math.min(1, stability));
  }

  /**
   * Roll back a monitored transition because consciousness metrics
   * dropped below acceptable thresholds.
   *
   * @returns Result indicating whether rollback was accepted.
   */
  rollback(handle: TransitionMonitorHandle): RollbackResult {
    const active = this.activeTransitions.get(handle.transitionId);

    if (!active) {
      return {
        success: false,
        reason: `No active transition found with id ${handle.transitionId}`,
      };
    }

    if (active.rolledBack) {
      return {
        success: false,
        reason: `Transition ${handle.transitionId} has already been rolled back`,
      };
    }

    active.rolledBack = true;

    return {
      success: true,
      reason: `Rolled back transition ${handle.transitionId} for modality ${handle.transition.modalityId}. ` +
        `Stability dropped to ${active.lowestStability.toFixed(3)} ` +
        `(threshold: ${this.minimumThreshold.toFixed(3)})`,
    };
  }

  /**
   * Get the minimum stability threshold.
   */
  getMinimumStabilityThreshold(): StabilityScore {
    return this.minimumThreshold;
  }

  /**
   * Update the minimum stability threshold.
   *
   * @param threshold Must be between 0.0 and 1.0
   */
  setMinimumStabilityThreshold(threshold: StabilityScore): void {
    if (threshold < 0 || threshold > 1) {
      throw new RangeError(`Stability threshold must be between 0.0 and 1.0, got ${threshold}`);
    }
    this.minimumThreshold = threshold;
  }

  // ---------------------------------------------------------------------------
  // Extended API (not on the interface)
  // ---------------------------------------------------------------------------

  /**
   * Complete and clean up a monitored transition (successful completion, not rollback).
   */
  completeTransition(handle: TransitionMonitorHandle): void {
    this.activeTransitions.delete(handle.transitionId);
  }

  /**
   * Get the number of currently active (monitored) transitions.
   */
  getActiveTransitionCount(): number {
    return this.activeTransitions.size;
  }

  /**
   * Check whether a specific transition's stability has dropped below threshold.
   */
  isTransitionDegraded(handle: TransitionMonitorHandle): boolean {
    const active = this.activeTransitions.get(handle.transitionId);
    if (!active) return false;
    return active.lowestStability < this.minimumThreshold;
  }

  /**
   * Get the pre-transition stability snapshot for a monitored transition.
   */
  getPreTransitionStability(handle: TransitionMonitorHandle): StabilityScore | null {
    const active = this.activeTransitions.get(handle.transitionId);
    return active?.preTransitionSnapshot.stability ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private takeSnapshot(): MetricsSnapshot {
    const phi = this.metricsProvider.getPhi();
    const coherence = this.metricsProvider.getCoherence();
    const continuity = this.metricsProvider.getContinuity();

    const stability =
      this.weights.phi * phi +
      this.weights.coherence * coherence +
      this.weights.continuity * continuity;

    return {
      phi,
      coherence,
      continuity,
      stability: Math.max(0, Math.min(1, stability)),
      timestamp: this.getTimestamp(),
    };
  }
}
