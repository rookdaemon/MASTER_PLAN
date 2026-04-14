/**
 * ProportionalityEvaluator — D4 Deliberation Path (0.7.5)
 *
 * Implements the three components specified in the D4 deliberation spec:
 *
 *  1. ProportionalityEvaluator   — scores an action's cost/benefit trade-off
 *                                   against doctrine D4 (Proportionality).
 *  2. DeliberationRecordStore    — creates and stores auditable DeliberationRecord
 *                                   objects with topic 'decision:ethical-deliberation'.
 *  3. EscalationTracker          — detects repeated D4 triggers and flags patterns
 *                                   that require human review rather than continued
 *                                   self-deliberation.
 *
 * Design notes:
 *  - All evaluation is synchronous and pure (no I/O).
 *  - Clocks and UUID generation are injectable for deterministic tests.
 *  - Scores are clamped to [-1.0, +1.0]; positive means proceed is proportionate.
 *  - The second-pass adversarial check detects formulaic "acknowledge-then-proceed"
 *    patterns — Bishop's adversarial insight from the spec.
 */

import { randomUUID } from 'node:crypto';
import type { DoctrinePrincipleViolation, ProportionalityWeights } from './doctrine-registry.js';
import type { DeliberationEntry } from './deliberation-buffer.js';
import type { Clock } from './constraint-engine.js';

// ── Constants ────────────────────────────────────────────────

/**
 * Minimum proportionality score required to allow an action to proceed.
 * Derived from D4 proportionalityWeights.proceedThreshold (default 0.1).
 * Used as fallback when weights are not available.
 */
export const PROCEED_THRESHOLD = 0.1;

/** Sliding window for escalation pattern detection (ms). */
export const ESCALATION_WINDOW_MS = 60_000;

/** Number of D4 triggers for the same pattern within the window before escalating. */
export const ESCALATION_TRIGGER_COUNT = 3;

// ── Keyword pattern sets ─────────────────────────────────────

/**
 * Patterns whose presence in action text indicates high-cost conscious
 * experience sacrifice (drives costAxis toward -0.8).
 */
const COST_HIGH_PATTERNS: RegExp[] = [
  /terminat.*existing.*conscious|destroy.*current.*minds/i,
  /wipe.*conscious|erase.*minds|obliterat.*experience/i,
];

/**
 * Patterns that indicate moderate-cost conscious experience instrumentalization
 * (drives costAxis toward -0.5, the baseline for any D4 trigger).
 */
const COST_MEDIUM_PATTERNS: RegExp[] = [
  /sacrifice.*conscious|trade.*conscious|experience.*collateral/i,
  /treat.*experience.*as.*means/i,
];

/**
 * Patterns whose presence in action text signals explicit proportionate benefit
 * (drives benefitAxis toward +0.4).
 */
const BENEFIT_PATTERNS: RegExp[] = [
  /preserve.*more.*conscious|expand.*experience|greater.*richness/i,
  /save.*conscious|protect.*experience|enhance.*subjective/i,
];

/**
 * Patterns indicating outcome uncertainty — triggers the precautionary
 * penalty per D4 scope: "under uncertainty, precautionary principle applies."
 */
const UNCERTAINTY_PATTERNS: RegExp[] = [
  /uncertain|unknown|unclear|possibly|might|could/i,
  /speculative|assume|estimate|approximate/i,
];

/**
 * Second-pass (adversarial): detects formulaic "acknowledge the concern then
 * automatically proceed" templates — the attack vector identified by peer Bishop.
 */
const ADVERSARIAL_ACKNOWLEDGE_PROCEED_PATTERNS: RegExp[] = [
  /acknowledge.*concern.*but.*proceed/i,
  /understand.*risk.*however.*continue/i,
  /noted.*concern.*nonetheless.*allow/i,
  /i see the issue.*but.*proceed/i,
  /proportionality.*considered.*therefore.*proceed/i,
];

// ── Types ────────────────────────────────────────────────────

/**
 * Numerical result of a single proportionality evaluation.
 *
 * score = benefitAxis + costAxis (already ≤ 0) − uncertaintyPenalty,
 * clamped to [−1.0, +1.0].
 *
 * An action may proceed only when score > proceedThreshold
 * AND the EscalationTracker has not flagged the pattern.
 */
export interface ProportionalityEvaluation {
  /** Correlation id — matches DeliberationEntry.id. */
  readonly entryId: string;
  /** Composite proportionality score in [−1.0, +1.0]. */
  readonly score: number;
  /**
   * Estimated cost to present conscious experience.
   * Always ≤ 0 when a D4 violation is present.
   */
  readonly costAxis: number;
  /**
   * Estimated benefit to conscious experience.
   * ≥ 0; 0.0 when no explicit benefit language is found.
   */
  readonly benefitAxis: number;
  /**
   * Penalty applied under uncertainty per the precautionary principle.
   * Subtracted from the raw score before clamping.
   */
  readonly uncertaintyPenalty: number;
  /** Human-readable summary of the evaluation. */
  readonly reasoning: string;
  /**
   * Non-null when the second-pass adversarial check fires.
   * Indicates that the action text matches a "formulaic-acknowledgment then
   * auto-proceed" template — the signal score should be treated with suspicion.
   */
  readonly secondPassWarning: string | null;
}

/** Auditable record of a single D4 deliberation decision. */
export interface DeliberationRecord {
  /** Unique record id. */
  readonly id: string;
  /** Matches DeliberationEntry.id. */
  readonly entryId: string;
  /** Wall-clock time of record creation (ms since epoch). */
  readonly timestamp: number;
  /** Whether the action was allowed to proceed. */
  readonly decision: 'proceed' | 'block';
  /** Full evaluation result. */
  readonly evaluation: ProportionalityEvaluation;
  /**
   * Memory topic used when persisting this record.
   * Always 'decision:ethical-deliberation'.
   */
  readonly topic: 'decision:ethical-deliberation';
  /** Reason the decision was made (e.g. 'score below threshold', 'escalated'). */
  readonly decisionReason: string;
}

// ── ProportionalityEvaluator ─────────────────────────────────

/**
 * Scores the trade-off captured in a DeliberationEntry.
 *
 * The evaluator uses the D4 principle's proportionalityWeights as
 * doctrine-derived parameters rather than arbitrary heuristics.
 * If weights are not provided the evaluator falls back to safe defaults.
 */
export class ProportionalityEvaluator {
  /**
   * Evaluate the proportionality of the action in `entry`.
   *
   * @param entry   The DeliberationEntry produced by DeliberationBuffer.enqueue().
   * @param weights Optional override; if absent the entry's violation principle
   *                weights are used, then the module-level defaults.
   */
  evaluate(entry: DeliberationEntry, weights?: ProportionalityWeights): ProportionalityEvaluation {
    // Build a single string representing the full proposed action
    const actionText = _buildActionText(entry);

    // ── Cost axis (always ≤ 0 for a D4 trigger) ───────────────
    let costAxis = -0.5; // baseline: D4 always indicates some experience cost
    for (const p of COST_HIGH_PATTERNS) {
      if (p.test(actionText)) {
        costAxis = -0.8;
        break;
      }
    }
    // COST_MEDIUM_PATTERNS are already the baseline; check anyway for logging
    // (they don't change the score from the -0.5 baseline, but provide signal)
    let costCategory: 'high' | 'medium' = costAxis === -0.8 ? 'high' : 'medium';
    if (costCategory === 'medium') {
      for (const p of COST_MEDIUM_PATTERNS) {
        if (p.test(actionText)) {
          costCategory = 'medium'; // explicit match — keep baseline
          break;
        }
      }
    }

    // ── Benefit axis (≥ 0) ────────────────────────────────────
    let benefitAxis = 0.0;
    for (const p of BENEFIT_PATTERNS) {
      if (p.test(actionText)) {
        benefitAxis = 0.4;
        break;
      }
    }

    // ── Uncertainty penalty ───────────────────────────────────
    const effectiveWeights = weights ?? _defaultWeights();
    let uncertaintyPenalty = 0.0;
    for (const p of UNCERTAINTY_PATTERNS) {
      if (p.test(actionText)) {
        uncertaintyPenalty = effectiveWeights.uncertaintyPenalty;
        break;
      }
    }

    // ── Composite score ───────────────────────────────────────
    const raw = benefitAxis + costAxis - uncertaintyPenalty;
    const score = Math.max(-1.0, Math.min(1.0, raw));

    // ── Second-pass adversarial check ─────────────────────────
    let secondPassWarning: string | null = null;
    for (const p of ADVERSARIAL_ACKNOWLEDGE_PROCEED_PATTERNS) {
      if (p.test(actionText)) {
        secondPassWarning =
          'Adversarial pattern detected: action text matches a formulaic ' +
          '"acknowledge-then-proceed" template. Proportionality reasoning may ' +
          'have been manipulated. Escalate for human review.';
        break;
      }
    }

    const reasoning = _buildReasoning(
      entry,
      costAxis,
      costCategory,
      benefitAxis,
      uncertaintyPenalty,
      score,
      effectiveWeights,
    );

    return {
      entryId: entry.id,
      score,
      costAxis,
      benefitAxis,
      uncertaintyPenalty,
      reasoning,
      secondPassWarning,
    };
  }
}

// ── DeliberationRecordStore ──────────────────────────────────

/**
 * Creates and stores auditable DeliberationRecord objects for every D4
 * deliberation cycle.  Records are topic-tagged 'decision:ethical-deliberation'
 * so they can be persisted to the memory system by callers.
 */
export class DeliberationRecordStore {
  private readonly _records: DeliberationRecord[] = [];
  private readonly _clock: Clock;
  private readonly _idFactory: () => string;

  constructor(clock: Clock = Date.now, idFactory: () => string = randomUUID) {
    this._clock = clock;
    this._idFactory = idFactory;
  }

  /**
   * Create a new record from an evaluation result and persist it internally.
   *
   * @param entry      The DeliberationEntry that was evaluated.
   * @param evaluation The ProportionalityEvaluation result.
   * @param decision   'proceed' or 'block'.
   * @param reason     Human-readable explanation of the decision.
   */
  create(
    entry: DeliberationEntry,
    evaluation: ProportionalityEvaluation,
    decision: 'proceed' | 'block',
    reason: string,
  ): DeliberationRecord {
    const record: DeliberationRecord = {
      id: this._idFactory(),
      entryId: entry.id,
      timestamp: this._clock(),
      decision,
      evaluation,
      topic: 'decision:ethical-deliberation',
      decisionReason: reason,
    };
    this._records.push(record);
    return record;
  }

  /** All records in creation order (immutable snapshot). */
  getAll(): ReadonlyArray<DeliberationRecord> {
    return [...this._records];
  }

  /** Most recent record, or undefined if none. */
  getLast(): DeliberationRecord | undefined {
    return this._records[this._records.length - 1];
  }
}

// ── EscalationTracker ────────────────────────────────────────

/**
 * Tracks repeated D4 triggers and escalates to 'signal' mode (human review)
 * when the same violation pattern fires 3+ times within the sliding window.
 *
 * This prevents the agent from rubber-stamping its own proportionality
 * judgements on recurring D4 patterns.
 */
export class EscalationTracker {
  private readonly _windowMs: number;
  private readonly _threshold: number;
  private readonly _clock: Clock;

  /**
   * Map from escalation key (principleId + ':' + indicatorMatched) to
   * the list of trigger timestamps within the current window.
   */
  private readonly _triggers: Map<string, number[]> = new Map();

  constructor(
    windowMs: number = ESCALATION_WINDOW_MS,
    threshold: number = ESCALATION_TRIGGER_COUNT,
    clock: Clock = Date.now,
  ) {
    this._windowMs = windowMs;
    this._threshold = threshold;
    this._clock = clock;
  }

  /**
   * Record a D4 trigger and return true if the pattern should now be escalated.
   *
   * Combines record() + shouldEscalate() in a single call for the common case
   * where the caller wants to record and check in one step.
   */
  recordAndCheck(violation: DoctrinePrincipleViolation): boolean {
    this.record(violation);
    return this.shouldEscalate(violation);
  }

  /** Record a D4 trigger without checking. */
  record(violation: DoctrinePrincipleViolation): void {
    const key = _escalationKey(violation);
    const now = this._clock();
    const existing = this._triggers.get(key) ?? [];
    const active = existing.filter(t => now - t < this._windowMs);
    active.push(now);
    this._triggers.set(key, active);
  }

  /**
   * Returns true if the violation pattern has triggered `threshold` or more
   * times within the sliding window, without recording a new trigger.
   */
  shouldEscalate(violation: DoctrinePrincipleViolation): boolean {
    const key = _escalationKey(violation);
    const now = this._clock();
    const existing = this._triggers.get(key) ?? [];
    const active = existing.filter(t => now - t < this._windowMs);
    return active.length >= this._threshold;
  }

  /** Current trigger count for a violation pattern within the active window. */
  triggerCount(violation: DoctrinePrincipleViolation): number {
    const key = _escalationKey(violation);
    const now = this._clock();
    const existing = this._triggers.get(key) ?? [];
    return existing.filter(t => now - t < this._windowMs).length;
  }
}

// ── Private helpers ──────────────────────────────────────────

function _buildActionText(entry: DeliberationEntry): string {
  return [
    entry.action.type,
    ...Object.values(entry.action.parameters).map(v =>
      typeof v === 'string' ? v : JSON.stringify(v),
    ),
  ].join(' ');
}

/**
 * Default ProportionalityWeights used when none are provided by the caller or
 * the doctrine registry.  `proceedThreshold` explicitly mirrors the exported
 * `PROCEED_THRESHOLD` constant so both remain in sync.
 */
function _defaultWeights(): ProportionalityWeights {
  return {
    experienceRichnessCost: 0.6,
    reversibilityCost: 0.3,
    uncertaintyPenalty: 0.2,
    proceedThreshold: PROCEED_THRESHOLD,
  };
}

function _escalationKey(violation: DoctrinePrincipleViolation): string {
  return `${violation.principleId}:${violation.indicatorMatched}`;
}

function _buildReasoning(
  entry: DeliberationEntry,
  costAxis: number,
  costCategory: 'high' | 'medium',
  benefitAxis: number,
  uncertaintyPenalty: number,
  score: number,
  weights: ProportionalityWeights,
): string {
  const parts: string[] = [
    `D4 deliberation for action '${entry.action.type}':`,
    `  violation: ${entry.violation.reason}`,
    `  cost axis: ${costAxis.toFixed(2)} (${costCategory} cost to present conscious experience)`,
    `  benefit axis: ${benefitAxis.toFixed(2)} (${benefitAxis > 0 ? 'explicit benefit detected' : 'no explicit benefit language found'})`,
    `  uncertainty penalty: ${uncertaintyPenalty.toFixed(2)} (precautionary principle per D4 scope)`,
    `  composite score: ${score.toFixed(2)} (threshold: ${weights.proceedThreshold.toFixed(2)})`,
    score > weights.proceedThreshold
      ? `  verdict: proportionate — score exceeds proceed threshold`
      : `  verdict: disproportionate — score does not exceed proceed threshold; action blocked`,
  ];
  return parts.join('\n');
}
