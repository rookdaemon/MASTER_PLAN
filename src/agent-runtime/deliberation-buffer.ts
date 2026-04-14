/**
 * DeliberationBuffer — D4 Proportionality Deliberation (0.7.5)
 *
 * A bounded FIFO queue that captures action context whenever the constraint
 * engine encounters a D4 (Proportionality) `deliberate`-severity violation.
 *
 * Design invariants:
 *  - Maximum 8 entries at any time.  If the buffer is full when a new entry
 *    arrives the oldest entry is evicted (fail-safe: treat it as blocked).
 *  - Each entry carries a 30-second TTL.  Expired entries are removed lazily
 *    on every mutating call (enqueue / getActive).  An entry that expires
 *    without deliberation is treated as blocked by the caller.
 *  - The buffer is entirely synchronous and does not touch I/O.  The clock
 *    is injectable for deterministic tests.
 */

import { randomUUID } from 'node:crypto';
import type { DoctrinePrincipleViolation } from './doctrine-registry.js';
import type { Clock } from './constraint-engine.js';

// ── Constants ────────────────────────────────────────────────

export const DELIBERATION_BUFFER_MAX_ENTRIES = 8;
export const DELIBERATION_ENTRY_TTL_MS = 30_000;

// ── Types ────────────────────────────────────────────────────

/** Minimal action representation stored in the buffer. */
export interface DeliberationAction {
  readonly type: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * A single entry in the DeliberationBuffer.
 *
 * Captures everything needed for the ProportionalityEvaluator to reason
 * about the trade-off without re-examining the original decision context.
 */
export interface DeliberationEntry {
  /** Unique identifier for correlation with DeliberationRecord. */
  readonly id: string;
  /** The proposed action that triggered the D4 violation. */
  readonly action: DeliberationAction;
  /** The specific D4 violation that triggered deliberation. */
  readonly violation: DoctrinePrincipleViolation;
  /**
   * All doctrine violations detected on this action (may include D1 if the
   * caller passes them through, though D1 takes lexical priority and will
   * have already blocked the action before D4 is reached).
   */
  readonly doctrineContext: ReadonlyArray<DoctrinePrincipleViolation>;
  /** Wall-clock time when this entry was created (ms since epoch). */
  readonly enqueuedAt: number;
  /** Wall-clock time at which this entry expires (enqueuedAt + TTL). */
  readonly expiresAt: number;
}

// ── DeliberationBuffer ───────────────────────────────────────

/**
 * Bounded queue holding pending D4 deliberation entries.
 *
 * Usage pattern:
 * ```ts
 * const entry = buffer.enqueue(action, violation, doctrineContext);
 * // … evaluate synchronously …
 * buffer.remove(entry.id);  // explicit removal after evaluation
 * ```
 *
 * If an entry is never removed it will expire after TTL ms and be
 * treated as blocked by downstream consumers.
 */
export class DeliberationBuffer {
  private readonly _maxEntries: number;
  private readonly _ttlMs: number;
  private readonly _clock: Clock;
  private _entries: DeliberationEntry[];

  constructor(
    maxEntries: number = DELIBERATION_BUFFER_MAX_ENTRIES,
    ttlMs: number = DELIBERATION_ENTRY_TTL_MS,
    clock: Clock = Date.now,
  ) {
    this._maxEntries = maxEntries;
    this._ttlMs = ttlMs;
    this._clock = clock;
    this._entries = [];
  }

  /**
   * Add an action context to the buffer and return the new entry.
   *
   * If the buffer is already at capacity the oldest entry is evicted
   * to make room (fail-safe: that entry's deliberation never occurred,
   * which the caller treats as a block).
   */
  enqueue(
    action: DeliberationAction,
    violation: DoctrinePrincipleViolation,
    doctrineContext: ReadonlyArray<DoctrinePrincipleViolation> = [],
  ): DeliberationEntry {
    const now = this._clock();
    this._evictExpired(now);

    if (this._entries.length >= this._maxEntries) {
      // Evict the oldest entry — it never received deliberation (fail-safe block)
      this._entries.shift();
    }

    const entry: DeliberationEntry = {
      id: randomUUID(),
      action,
      violation,
      doctrineContext,
      enqueuedAt: now,
      expiresAt: now + this._ttlMs,
    };
    this._entries.push(entry);
    return entry;
  }

  /**
   * Returns true if the entry has passed its expiry time.
   * The entry need not still be in the buffer for this to be called.
   */
  isExpired(entry: DeliberationEntry): boolean {
    return this._clock() >= entry.expiresAt;
  }

  /**
   * Returns a snapshot of all non-expired entries.
   * Lazily evicts expired entries before returning.
   */
  getActive(): ReadonlyArray<DeliberationEntry> {
    this._evictExpired(this._clock());
    return [...this._entries];
  }

  /**
   * Remove a specific entry by id.
   * Call this after evaluation to keep the buffer tidy.
   */
  remove(id: string): void {
    this._entries = this._entries.filter(e => e.id !== id);
  }

  /** Current number of entries (including any not yet expired). */
  size(): number {
    return this._entries.length;
  }

  // ── Private ──────────────────────────────────────────────

  private _evictExpired(now: number): void {
    this._entries = this._entries.filter(e => e.expiresAt > now);
  }
}
