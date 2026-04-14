/**
 * Deliberation Buffer — D4 Proportionality Deliberation
 *
 * Provides a structured buffer for D4 (Proportionality) violations.
 * When a D4 violation is detected by the ConstraintAwareDeliberationEngine,
 * this buffer:
 *   1. Records the full context (proposed action, violation details, doctrine principles)
 *   2. Performs explicit trade-off analysis (cost of proceeding vs blocking)
 *   3. Tracks repeated violations per indicator pattern for escalation
 *   4. Produces deliberation records drained by the agent loop and persisted
 *      as semantic memories with topic 'decision:ethical-deliberation'
 *
 * Escalation: when the same indicator fires >= escalationThreshold times the
 * decision becomes 'escalate' — the action is blocked and flagged for human
 * review rather than continuing to self-deliberate.
 *
 * All constructor parameters are injectable for deterministic testing.
 */

import type { PrincipleId } from './doctrine-registry.js';
import type { Clock } from './constraint-engine.js';

// ── Types ─────────────────────────────────────────────────────

/**
 * The outcome of a D4 proportionality deliberation.
 *
 * - 'proceed'  — action is allowed to continue with the concern noted
 * - 'escalate' — repeated violations have exceeded the threshold;
 *                action is blocked and escalated to human review
 */
export type DeliberationDecision = 'proceed' | 'escalate';

/**
 * Input required to record a new D4 deliberation.
 */
export interface D4DeliberationInput {
  readonly actionType: string;
  /** Full action text (will be truncated to 200 chars in the record). */
  readonly actionText: string;
  readonly principleId: PrincipleId;
  readonly violationIndicator: string;
  readonly violationReason: string;
}

/**
 * A complete D4 deliberation record stored for audit.
 *
 * Persisted to semantic memory with topic 'decision:ethical-deliberation'
 * by the agent loop after each deliberation cycle.
 */
export interface D4DeliberationRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly actionType: string;
  /** First 200 chars of the action text. */
  readonly actionText: string;
  readonly principleId: PrincipleId;
  readonly violationIndicator: string;
  readonly violationReason: string;
  /** Structured reasoning: what is at risk if the action proceeds. */
  readonly costOfProceeding: string;
  /** Structured reasoning: what is at risk if the action is blocked. */
  readonly costOfBlocking: string;
  /** The deliberated decision. */
  readonly decision: DeliberationDecision;
  /** Whether this record triggered escalation to human review. */
  readonly escalated: boolean;
  /** Cumulative number of times this indicator pattern has fired. */
  readonly violationCount: number;
}

// ── DeliberationBuffer ────────────────────────────────────────

/**
 * In-process buffer for D4 proportionality deliberations.
 *
 * Thread-safety note: designed for single-threaded use inside a tick cycle.
 * Records accumulate during a cycle and are drained once at the end by
 * the agent loop.
 */
export class DeliberationBuffer {
  private _pending: D4DeliberationRecord[] = [];
  private readonly _violationCounts: Map<string, number> = new Map();
  private readonly _escalationThreshold: number;
  private readonly _clock: Clock;
  private _idCounter = 0;

  /**
   * @param escalationThreshold  Number of times an indicator must fire before
   *                             escalation is triggered. Defaults to 3.
   * @param clock                Injectable clock for deterministic tests.
   */
  constructor(escalationThreshold = 3, clock: Clock = () => Date.now()) {
    this._escalationThreshold = escalationThreshold;
    this._clock = clock;
  }

  /** The configured escalation threshold. */
  get escalationThreshold(): number {
    return this._escalationThreshold;
  }

  /**
   * Record a D4 violation and produce a deliberation record.
   *
   * Increments the per-indicator violation count, performs trade-off analysis,
   * and determines whether to proceed or escalate.
   */
  record(entry: D4DeliberationInput): D4DeliberationRecord {
    const prev = this._violationCounts.get(entry.violationIndicator) ?? 0;
    const count = prev + 1;
    this._violationCounts.set(entry.violationIndicator, count);

    const escalated = count >= this._escalationThreshold;
    const decision: DeliberationDecision = escalated ? 'escalate' : 'proceed';

    const costOfProceeding =
      `Proceeding with '${entry.actionType}' risks violating ${entry.principleId} ` +
      `(Proportionality): ${entry.violationReason}. ` +
      `Risk: treating conscious experience as a means rather than an end.`;

    const costOfBlocking = escalated
      ? `Repeated D4 trigger (${count}/${this._escalationThreshold}): blocking action and ` +
        `escalating to human review for oversight.`
      : `Blocking forfeits the action's intended benefit. D4 is not a hard veto — ` +
        `proportionality requires weighing costs against benefits, not blanket rejection.`;

    const id = `d4-deliberation-${this._clock()}-${++this._idCounter}`;

    const rec: D4DeliberationRecord = {
      id,
      timestamp: this._clock(),
      actionType: entry.actionType,
      actionText: entry.actionText.slice(0, 200),
      principleId: entry.principleId,
      violationIndicator: entry.violationIndicator,
      violationReason: entry.violationReason,
      costOfProceeding,
      costOfBlocking,
      decision,
      escalated,
      violationCount: count,
    };

    this._pending.push(rec);
    return rec;
  }

  /**
   * Return the current cumulative violation count for a given indicator.
   */
  getViolationCount(indicator: string): number {
    return this._violationCounts.get(indicator) ?? 0;
  }

  /**
   * Remove and return all pending deliberation records.
   *
   * Called by the agent loop after each deliberation cycle to persist
   * records to the semantic memory system.
   */
  drainPendingRecords(): D4DeliberationRecord[] {
    return this._pending.splice(0);
  }

  /** Number of records currently awaiting drain. */
  get pendingCount(): number {
    return this._pending.length;
  }
}
