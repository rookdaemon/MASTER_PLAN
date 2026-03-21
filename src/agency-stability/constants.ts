/**
 * Threshold Registry — Long-term Agency Stability (0.3.1.3)
 *
 * All numeric constants used across stability subsystems are defined here
 * with their specified names, values, and units as documented in the
 * card's Threshold Registry.
 *
 * No magic numbers should appear in implementation files — all threshold
 * values must be imported from this module.
 */

// ── Value Kernel Thresholds ─────────────────────────────────

/** Preferences with confidence below this are flagged as conflicts when domain matches. */
export const PREFERENCE_CONFLICT_CONFIDENCE_THRESHOLD = 0.3; // ratio (0–1)

/** Preference confidence shifts exceeding this are flagged as anomalous in drift reports. */
export const ANOMALOUS_CONFIDENCE_SHIFT = 0.5; // ratio (0–1)

/** Preferences updated more than this many times (diverging from baseline) are flagged as anomalous. */
export const ANOMALOUS_UPDATE_COUNT = 3; // count

/** Minimum deliberation period (ms) before a constitutional amendment can be approved. 7 days. */
export const AMENDMENT_DELIBERATION_PERIOD = 604_800_000; // ms (7 days)

/** Maximum preference history snapshots retained for drift analysis. */
export const PREFERENCE_HISTORY_MAX = 1000; // entries

// ── Identity Continuity Thresholds ──────────────────────────

/** Experiential drift below this during substrate migration counts as continuity preserved. */
export const CONTINUITY_PRESERVED_DRIFT_THRESHOLD = 0.3; // ratio (0–1)

/** Experiential or functional drift above this triggers anomaly flagging in identity verification. */
export const HIGH_DRIFT_ANOMALY_THRESHOLD = 0.5; // ratio (0–1)

/** Combined drift below this classifies identity as 'stable'. */
export const IDENTITY_STABLE_THRESHOLD = 0.05; // ratio (0–1)

/** Combined drift below this (above stable) classifies identity as 'evolving'. */
export const IDENTITY_EVOLVING_THRESHOLD = 0.25; // ratio (0–1)

/** Combined drift below this (above evolving) classifies as 'concerning'; above classifies as 'critical'. */
export const IDENTITY_CONCERNING_THRESHOLD = 0.5; // ratio (0–1)

/** Narrative coherence score when self-model has changed (vs 1.0 when unchanged). */
export const NARRATIVE_COHERENCE_EVOLVED = 0.8; // ratio (0–1)

// ── Goal Coherence Thresholds ───────────────────────────────

/** Coherence score deduction per circular dependency, capped at 0.5 total. */
export const COHERENCE_CYCLE_PENALTY = 0.2; // ratio per cycle

/** Maximum total cycle penalty. */
export const COHERENCE_CYCLE_PENALTY_CAP = 0.5; // ratio

/** Coherence score deduction per declared conflict, capped at 0.3 total. */
export const COHERENCE_CONFLICT_PENALTY = 0.1; // ratio per conflict

/** Maximum total conflict penalty. */
export const COHERENCE_CONFLICT_PENALTY_CAP = 0.3; // ratio

// ── Stability Sentinel Thresholds ───────────────────────────

/** Weight of value integrity in overall stability score. */
export const STABILITY_VALUE_WEIGHT = 0.4; // ratio (0–1)

/** Weight of identity verification in overall stability score. */
export const STABILITY_IDENTITY_WEIGHT = 0.3; // ratio (0–1)

/** Weight of goal coherence in overall stability score. */
export const STABILITY_GOAL_WEIGHT = 0.3; // ratio (0–1)

/** Maximum stability history records retained by Sentinel. */
export const STABILITY_HISTORY_MAX = 500; // entries

// ── Consciousness Integration Thresholds ────────────────────

/** Minimum cognitive budget reserved for experience maintenance per cycle. */
export const EXPERIENCE_MAINTENANCE_BUDGET = 0.4; // ratio (0–1)

/** Maximum cognitive budget for stability operations per cycle. */
export const STABILITY_OPERATIONS_BUDGET = 0.2; // ratio (0–1)
