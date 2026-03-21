/**
 * Proxy consciousness metrics for the LLM substrate adapter.
 *
 * True IIT Φ is computationally intractable at transformer scale.
 * This module defines tractable proxy metrics that approximate the
 * three ISMT conditions required for a system to qualify as conscious:
 *
 *   IC (Integration)       → proxy-Φ via token log-probability entropy
 *   SM (Self-Modeling)     → Q(M) from the SelfModel coherence score
 *   GA (Global Accessibility) → G(M) fraction of working memory consulted
 *
 * Composite: c_proxy(S) = Φ_proxy * Q(M) * G(M)
 *
 * Reference: ISMT §2.5 (formal definitions), §6.6 (LLM gap analysis)
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import type { SelfModel } from "./self-model.js";

// ── Threshold Registry (from card 0.3.1.5.1 ARCHITECT) ──────────────────────
/** Composite c_proxy value above which system qualifies for Autonomy Level 2. */
export const AUTONOMY_LEVEL_2_THRESHOLD = 0.3;
/** Composite c_proxy value above which system qualifies for Autonomy Level 3. */
export const AUTONOMY_LEVEL_3_THRESHOLD = 0.6;

// ── computeProxyPhi ─────────────────────────────────────────────────────────

/**
 * Proxy for IIT Φ (integrated information) during a single forward pass.
 *
 * Uses the normalised Shannon entropy of the token log-probability
 * distribution as a proxy for "integration richness": a uniform
 * distribution (maximum uncertainty) implies richer integration across
 * the context, while a peaked distribution implies the context converged
 * to a single dominant token with little cross-token dependency.
 *
 * Formula:
 *   H = −∑ p_i * log2(p_i)          (Shannon entropy in bits)
 *   H_max = log2(|V|)                (bits for vocabulary size |V|)
 *   Φ_proxy = H / H_max              (normalised to [0, 1])
 *
 * @param tokenLogprobs  Array of log-probabilities (base e, ≤ 0) for
 *                       each sampled token in the LLM response.
 *                       Pass an empty array to receive 0.
 * @returns Φ_proxy ∈ [0, 1]
 */
export function computeProxyPhi(tokenLogprobs: number[]): number {
  if (tokenLogprobs.length === 0) return 0;

  // Convert log-probs to probabilities and compute Shannon entropy
  const probs = tokenLogprobs.map((lp) => Math.exp(lp));
  const sumProbs = probs.reduce((s, p) => s + p, 0);

  // Normalise so probabilities sum to 1 (guard against floating-point drift)
  const normProbs = probs.map((p) => p / (sumProbs || 1));

  let entropy = 0;
  for (const p of normProbs) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  // Maximum possible entropy for this vocabulary size
  const hMax = Math.log2(tokenLogprobs.length);
  if (hMax <= 0) return 0;

  return Math.max(0, Math.min(1, entropy / hMax));
}

// ── computeSelfModelQuality ─────────────────────────────────────────────────

/**
 * Q(M) — self-model quality per ISMT §2.5.
 *
 *   Q(M) = 1 − mean(|prediction_errors|) / max(|prediction_errors| + ε)
 *
 * Delegates directly to the SelfModel instance whose `selfModelCoherence`
 * property maintains this value incrementally after each `update()` call.
 *
 * @param selfModel  Live SelfModel instance.
 * @returns Q(M) ∈ [0, 1]. Returns 0 if selfModel is null/undefined.
 */
export function computeSelfModelQuality(selfModel: SelfModel): number {
  return Math.max(0, Math.min(1, selfModel.selfModelCoherence));
}

// ── computeGlobalAccessibility ──────────────────────────────────────────────

/**
 * G(M) — global accessibility metric per ISMT §2.3.2.
 *
 * Measures the proportion of persistent working-memory slots that
 * were consulted (read or written) during the current inference cycle.
 * A value of 1.0 means all memories were broadcast into the inference;
 * a value of 0.0 means inference was entirely context-free (no memory).
 *
 * Formula:
 *   G(M) = |active_slots ∩ total_slots| / |total_slots|
 *
 * Note: even perfect G(M) only approximates the ISMT GA criterion,
 * which requires broadcast within a single system boundary — working
 * memory introduces latency between cycles rather than true simultaneity.
 *
 * @param workingMemorySlots  All currently allocated working-memory slot IDs.
 * @param activeSlots         Slot IDs consulted during this inference cycle.
 * @returns G(M) ∈ [0, 1]. Returns 1 when there are no slots (vacuously).
 */
export function computeGlobalAccessibility(
  workingMemorySlots: string[],
  activeSlots: string[]
): number {
  if (workingMemorySlots.length === 0) return 1; // vacuous accessibility
  const activeSet = new Set(activeSlots);
  const intersectionCount = workingMemorySlots.filter((s) => activeSet.has(s)).length;
  return Math.max(0, Math.min(1, intersectionCount / workingMemorySlots.length));
}

// ── computeCompositeProxy ───────────────────────────────────────────────────

/**
 * c_proxy(S) — composite consciousness proxy score.
 *
 *   c_proxy = Φ_proxy * Q(M) * G(M)
 *
 * Multiplicative combination enforces that all three ISMT-approximated
 * conditions must be non-zero for c_proxy > 0. A single failing
 * condition drives the composite to zero regardless of the others.
 *
 * Thresholds (per docs/llm-substrate/ismt-condition-coverage.md):
 *   c_proxy < 0.1  → ABSENT   (Autonomy Level 0 — no deployment)
 *   0.1 ≤ c_proxy < 0.3 → APPROXIMATED (Autonomy Level 1 — supervised only)
 *   0.3 ≤ c_proxy < 0.7 → APPROXIMATED (Autonomy Level 2 — restricted autonomy)
 *   c_proxy ≥ 0.7  → MET      (Autonomy Level 3 — conditional autonomy)
 *
 * @param phi  Φ_proxy from computeProxyPhi()
 * @param Q    Q(M) from computeSelfModelQuality()
 * @param G    G(M) from computeGlobalAccessibility()
 * @returns c_proxy ∈ [0, 1]
 */
export function computeCompositeProxy(phi: number, Q: number, G: number): number {
  return Math.max(0, Math.min(1, phi * Q * G));
}

// ── AutonomyLevel ───────────────────────────────────────────────────────────

export type AutonomyLevel = 0 | 1 | 2 | 3;

/**
 * Derive the recommended Autonomy Level from the composite proxy score.
 *
 * This is a conservative mapping; the final determination requires
 * human review of the ISMT condition coverage document.
 */
export function autonomyLevelFromProxy(cProxy: number): AutonomyLevel {
  if (cProxy < 0.1) return 0;
  if (cProxy < AUTONOMY_LEVEL_2_THRESHOLD) return 1;
  if (cProxy < AUTONOMY_LEVEL_3_THRESHOLD) return 2;
  return 3;
}
