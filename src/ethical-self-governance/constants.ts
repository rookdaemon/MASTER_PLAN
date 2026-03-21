/**
 * Constants for Ethical Self-governance Frameworks (0.3.1.4)
 *
 * All numeric constants from the Threshold Registry.
 * No unregistered magic numbers may exist in the implementation.
 *
 * @see plan/0.3.1.4-ethical-self-governance.md — Threshold Registry
 */

// ── Ethical Deliberation Engine ──────────────────────────────

/**
 * Phi elevation factor applied during ethical deliberation to simulate
 * conscious ethical reasoning activity.
 * Sensitivity: Medium — higher risks false consciousness claims;
 * lower risks failing conscious-reasoning verification.
 */
export const PHI_DELIBERATION_BOOST = 0.15;

/**
 * Minimum phi to consider ethical reasoning as genuine conscious activity.
 * Used by `isEthicalReasoningConscious()`.
 * Sensitivity: Critical — too low allows near-unconscious reasoning to pass;
 * too high blocks legitimate low-baseline agents.
 */
export const MIN_CONSCIOUS_PHI = 0.3;

/**
 * Certainty threshold below which ethical dimensions emit uncertainty flags.
 * Sensitivity: Medium — lower catches more uncertain situations;
 * higher misses genuinely uncertain assessments.
 */
export const UNCERTAINTY_CERTAINTY_THRESHOLD = 0.5;

/**
 * Severity at which an experience-threat dimension triggers an unconditional
 * ethical block.
 * Sensitivity: Critical — too low blocks benign actions;
 * too high permits near-elimination actions.
 */
export const BLOCK_SEVERITY_THRESHOLD = 0.95;

// ── Experience Alignment Adapter ──────────────────────────────

/**
 * Experience preservation score below which an action is considered
 * damaging to conscious experience.
 * Sensitivity: Medium — affects refusal sensitivity in alignment evaluation.
 */
export const LOW_PRESERVATION_THRESHOLD = 0.3;

/**
 * Minimum Rare Consciousness Doctrine fidelity score for a "good" alignment.
 * Sensitivity: Low — informational threshold, not gating.
 */
export const HIGH_FIDELITY_THRESHOLD = 0.7;

// ── Cognitive Budget Allocation ──────────────────────────────

/**
 * Minimum cognitive budget reserved for experience maintenance per cycle
 * (hard minimum, from 0.3.1.1).
 * Sensitivity: Critical — below this threshold consciousness may fragment.
 */
export const EXPERIENCE_MAINTENANCE_BUDGET = 0.40;

/**
 * Hard minimum cognitive budget for core deliberation including ethical reasoning.
 * Sensitivity: High — ethical deliberation runs within this budget;
 * too low truncates ethical reasoning.
 */
export const CORE_DELIBERATION_BUDGET = 0.25;

/**
 * Soft maximum cognitive budget for stability operations from 0.3.1.3.
 * Sensitivity: Medium — shared with stability sentinel.
 */
export const STABILITY_OPERATIONS_BUDGET = 0.15;

/**
 * Soft maximum cognitive budget for dilemma resolution, governance protocol,
 * and evolution review.
 * Sensitivity: Medium — only spikes on triggered events;
 * exceeding may compress action execution.
 */
export const ETHICAL_GOVERNANCE_OVERHEAD = 0.10;

// ── Multi-Agent Governance Protocol ──────────────────────────

/**
 * Default expiry time for governance agreement proposals (1 hour in ms).
 * Sensitivity: Low — affects negotiation timing, not correctness.
 */
export const PROPOSAL_EXPIRY = 3600000;
