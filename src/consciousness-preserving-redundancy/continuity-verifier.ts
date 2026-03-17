/**
 * Consciousness Continuity Verifier (CCV) — Implementation
 *
 * Runtime monitoring that confirms the conscious process remained
 * uninterrupted through failover events. This is the key differentiator
 * from conventional high-availability systems.
 *
 * See: docs/consciousness-preserving-redundancy/ARCHITECTURE.md §3.4
 */

import type {
  ConsciousState,
  ContinuityMetrics,
  ContinuityEvent,
  ConsciousnessContinuityVerifier,
} from "./types.js";
import { T_EXP_MS } from "./types.js";

/**
 * Threshold for experiential coherence — below this, continuity
 * is considered broken. Placeholder until 0.1.3 provides real value.
 */
const COHERENCE_THRESHOLD = 0.5;

/**
 * Threshold for dynamical variable divergence — above this,
 * dynamical continuity is considered broken.
 */
const DYNAMICAL_DIVERGENCE_THRESHOLD = 0.5;

/**
 * Compute normalized Hamming-style divergence between two Uint8Arrays.
 * Returns 0.0 for identical, 1.0 for maximally different.
 */
function byteArrayDivergence(a: Uint8Array, b: Uint8Array): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;

  let totalDiff = 0;
  for (let i = 0; i < maxLen; i++) {
    const va = i < a.length ? a[i] : 0;
    const vb = i < b.length ? b[i] : 0;
    totalDiff += Math.abs(va - vb) / 255;
  }
  return totalDiff / maxLen;
}

export type ContinuityVerifierImpl = ConsciousnessContinuityVerifier;

/**
 * Create a new CCV instance.
 */
export function createContinuityVerifier(): ContinuityVerifierImpl {
  const log: ContinuityEvent[] = [];

  function measureContinuity(
    before: ConsciousState,
    after: ConsciousState
  ): ContinuityMetrics {
    const temporalGap_ms = Math.abs(after.timestamp_ms - before.timestamp_ms);

    // Composite state divergence: average divergence across all state buffers
    const memDiv = byteArrayDivergence(before.memoryState, after.memoryState);
    const regDiv = byteArrayDivergence(
      before.registerState,
      after.registerState
    );
    const tcbDiv = byteArrayDivergence(
      before.temporalContextBuffer,
      after.temporalContextBuffer
    );
    const stateDivergence = (memDiv + regDiv + tcbDiv) / 3;

    // Dynamical variable divergence
    const dynDiv = byteArrayDivergence(
      before.dynamicalVariables,
      after.dynamicalVariables
    );
    const dynamicalContinuity = dynDiv < DYNAMICAL_DIVERGENCE_THRESHOLD;

    // Experiential coherence: composite of temporal closeness,
    // low state divergence, and dynamical continuity
    const temporalFactor = Math.max(0, 1 - temporalGap_ms / T_EXP_MS);
    const stateFactor = 1 - stateDivergence;
    const dynFactor = dynamicalContinuity ? 1.0 : 0.2;
    const experientialCoherence = temporalFactor * stateFactor * dynFactor;

    const metrics: ContinuityMetrics = {
      temporalGap_ms,
      stateDivergence,
      experientialCoherence,
      dynamicalContinuity,
    };

    // Record in audit log
    const seamless = isSeamless(metrics);
    log.push({
      timestamp_ms: Date.now(),
      metrics,
      seamless,
    });

    return metrics;
  }

  function isSeamless(metrics: ContinuityMetrics): boolean {
    return (
      metrics.temporalGap_ms <= T_EXP_MS &&
      metrics.experientialCoherence >= COHERENCE_THRESHOLD &&
      metrics.dynamicalContinuity === true
    );
  }

  function temporalGap(metrics: ContinuityMetrics): number {
    return metrics.temporalGap_ms;
  }

  function experientialCoherence(metrics: ContinuityMetrics): number {
    return metrics.experientialCoherence;
  }

  function auditLog(): ContinuityEvent[] {
    return [...log];
  }

  return {
    measureContinuity,
    isSeamless,
    temporalGap,
    experientialCoherence,
    auditLog,
  };
}
