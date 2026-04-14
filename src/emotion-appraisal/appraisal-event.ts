/**
 * appraisalResultFromEvents — lightweight event-to-AppraisalResult bridge
 *
 * Aggregates one or more AppraisalEvents into a single AppraisalResult that
 * can be passed directly to MoodDynamics.update(), bypassing the full
 * BoundPercept / goal-index pathway used by AppraisalEngine.appraise().
 *
 * This bridge exists to satisfy the three missing connections identified in
 * the Emotional Flatline Bug (see issue):
 *   1. NPC cognitive stack (CognitiveAgent) — always passed null to MoodDynamics
 *   2. Simulation world events — valence/novelty hints never reached MoodDynamics
 *
 * Algorithm:
 *   - Intensity-weighted average of all valenceShift values → netValenceShift
 *   - Intensity-weighted average of all arousalShift values → netArousalShift
 *   - Any threat-detection event sets triggersEthicalAttention = true
 *   - Results clamped to valid AppraisalResult ranges
 */

import type { AppraisalEvent, AppraisalResult, Timestamp } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

let _idCounter = 0;
function makeEventAppraisalId(timestamp: number): string {
  return `evt-appraisal-${timestamp}-${(++_idCounter).toString(36)}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Aggregate an array of AppraisalEvents into a single AppraisalResult.
 *
 * Returns `null` when the events array is empty so that callers can fall back
 * to the natural mood-decay path (`MoodDynamics.update(null, params)`).
 *
 * @param events  One or more appraisal events to aggregate.
 * @param now     Current timestamp (epoch ms or simulation tick ms).
 */
export function appraisalResultFromEvents(
  events: readonly AppraisalEvent[],
  now: Timestamp,
): AppraisalResult | null {
  if (events.length === 0) return null;

  let totalValence = 0;
  let totalArousal = 0;
  let totalWeight = 0;
  let triggersEthicalAttention = false;

  for (const ev of events) {
    const intensity = clamp(ev.intensity ?? 1.0, 0, 1);
    totalValence += ev.valenceShift * intensity;
    totalArousal += ev.arousalShift * intensity;
    totalWeight  += intensity;

    if (ev.kind === 'threat-detection') {
      triggersEthicalAttention = true;
    }
  }

  // Use total weight for weighted average; fall back to count if all intensities
  // are zero (degenerate case).
  const divisor = totalWeight > 0 ? totalWeight : events.length;
  const netValenceShift = clamp(totalValence / divisor, -1, 1);
  const netArousalShift = clamp(totalArousal / divisor, -0.5, 0.5);

  return {
    perceptId:                makeEventAppraisalId(now),
    timestamp:                now,
    goalCongruenceShift:      netValenceShift,
    affectedGoalPriority:     1.0,
    noveltyShift:             netArousalShift,
    valueAlignmentShift:      0,
    triggersEthicalAttention,
    netValenceShift,
    netArousalShift,
  };
}
