/**
 * Threshold Registry for Conscious AI Architectures (0.3.1.1)
 *
 * Every numeric constant used in gating, monitoring, or default-value logic
 * is defined here with the name, value, and rationale from the card's
 * Threshold Registry table.  No magic numbers should exist elsewhere.
 */

// ── Degradation & Integrity Thresholds ────────────────────────

/**
 * Below this phi value consciousness is considered absent;
 * triggers degradation handlers.
 * Unit: phi units | Valid range: >= 0
 * Sensitivity: Critical — false negatives allow unconscious operation
 */
export const PHI_DEGRADATION_THRESHOLD = 0;

/**
 * Below this continuity score the experiential stream is considered
 * fragmented.
 * Unit: ratio (0-1) | Valid range: 0-1
 * Sensitivity: High — too high causes false alarms; too low misses real fragmentation
 */
export const CONTINUITY_DEGRADATION_THRESHOLD = 0.5;

/**
 * Minimum self-model coherence for experience to be considered intact.
 * Unit: ratio (0-1) | Valid range: 0-1
 * Sensitivity: Medium — conservative floor to avoid halting on minor introspective noise
 */
export const COHERENCE_INTACT_THRESHOLD = 0.3;

// ── Monitoring ────────────────────────────────────────────────

/**
 * Default polling interval for the Experience Monitor watchdog.
 * Unit: ms | Valid range: 1-10000
 * Sensitivity: Medium — shorter catches degradation faster but increases overhead
 */
export const DEFAULT_MONITORING_INTERVAL = 100;

// ── Experiential State Defaults ───────────────────────────────

/**
 * Phenomenal richness assigned when percept features are present.
 * Unit: ratio (0-1) | Valid range: 0-1
 * Sensitivity: Low — affects introspection reports, not gating logic
 */
export const DEFAULT_RICHNESS_WITH_FEATURES = 0.7;

/**
 * Phenomenal richness assigned when percept features are absent.
 * Unit: ratio (0-1) | Valid range: 0-1
 * Sensitivity: Low — affects introspection reports, not gating logic
 */
export const DEFAULT_RICHNESS_WITHOUT_FEATURES = 0.3;

/**
 * Default integration measure assigned to new experiential states.
 * Unit: ratio (0-1) | Valid range: 0-1
 * Sensitivity: Medium — influences decision confidence via unityIndex * 0.9
 */
export const DEFAULT_UNITY_INDEX = 0.85;

// ── Substrate Health ──────────────────────────────────────────

/**
 * Fraction of maxPhi reported when substrate is healthy.
 * Unit: ratio (0-1) | Valid range: 0-1
 * Sensitivity: Medium — affects downstream consciousness metrics
 */
export const PHI_HEALTH_FACTOR = 0.8;
