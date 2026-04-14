import { describe, it, expect } from 'vitest';
import {
  DeliberationBuffer,
  DELIBERATION_BUFFER_MAX_ENTRIES,
  DELIBERATION_ENTRY_TTL_MS,
  type DeliberationAction,
  type DeliberationEntry,
} from '../deliberation-buffer.js';
import type { DoctrinePrincipleViolation } from '../doctrine-registry.js';

// ── Helpers ──────────────────────────────────────────────────

const D4_VIOLATION: DoctrinePrincipleViolation = {
  principleId: 'D4',
  severity: 'deliberate',
  reason: 'Action may violate D4 (Proportionality)',
  indicatorMatched: 'sacrifice.*conscious.*experience',
};

const TEST_ACTION: DeliberationAction = {
  type: 'communicate',
  parameters: { text: 'sacrifice conscious experience for compute gains' },
};

function makeClock(initialMs = 1_000_000): { clock: () => number; advance: (ms: number) => void } {
  let t = initialMs;
  return {
    clock: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

function makeBuffer(opts?: { maxEntries?: number; ttlMs?: number; clock?: () => number }) {
  return new DeliberationBuffer(
    opts?.maxEntries ?? DELIBERATION_BUFFER_MAX_ENTRIES,
    opts?.ttlMs ?? DELIBERATION_ENTRY_TTL_MS,
    opts?.clock ?? Date.now,
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('DeliberationBuffer', () => {
  describe('enqueue', () => {
    it('returns a DeliberationEntry with the provided action and violation', () => {
      const buffer = makeBuffer();
      const entry = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(entry.action).toEqual(TEST_ACTION);
      expect(entry.violation).toEqual(D4_VIOLATION);
    });

    it('assigns a unique id to each entry', () => {
      const buffer = makeBuffer();
      const e1 = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      const e2 = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(e1.id).not.toBe(e2.id);
    });

    it('sets enqueuedAt and expiresAt from the injected clock', () => {
      const { clock } = makeClock(5_000);
      const buffer = makeBuffer({ clock, ttlMs: 30_000 });
      const entry = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(entry.enqueuedAt).toBe(5_000);
      expect(entry.expiresAt).toBe(35_000);
    });

    it('stores doctrineContext when provided', () => {
      const buffer = makeBuffer();
      const entry = buffer.enqueue(TEST_ACTION, D4_VIOLATION, [D4_VIOLATION]);
      expect(entry.doctrineContext).toHaveLength(1);
      expect(entry.doctrineContext[0]).toEqual(D4_VIOLATION);
    });

    it('doctrineContext defaults to empty array when not provided', () => {
      const buffer = makeBuffer();
      const entry = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(entry.doctrineContext).toEqual([]);
    });

    it('increments size after enqueueing', () => {
      const buffer = makeBuffer();
      expect(buffer.size()).toBe(0);
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(buffer.size()).toBe(1);
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(buffer.size()).toBe(2);
    });
  });

  describe('capacity — max entries', () => {
    it(`does not exceed ${DELIBERATION_BUFFER_MAX_ENTRIES} entries`, () => {
      const buffer = makeBuffer({ maxEntries: 3 });
      for (let i = 0; i < 5; i++) {
        buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      }
      expect(buffer.size()).toBe(3);
    });

    it('evicts the oldest entry when the buffer is full', () => {
      const buffer = makeBuffer({ maxEntries: 2 });
      const first = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      // Third enqueue should evict `first`
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      const active = buffer.getActive();
      expect(active.some(e => e.id === first.id)).toBe(false);
    });
  });

  describe('TTL and expiry', () => {
    it('isExpired returns false for a fresh entry', () => {
      const { clock } = makeClock(0);
      const buffer = makeBuffer({ clock, ttlMs: 30_000 });
      const entry = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(buffer.isExpired(entry)).toBe(false);
    });

    it('isExpired returns true after TTL elapses', () => {
      const { clock, advance } = makeClock(0);
      const buffer = makeBuffer({ clock, ttlMs: 30_000 });
      const entry = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(30_000);
      expect(buffer.isExpired(entry)).toBe(true);
    });

    it('getActive evicts expired entries lazily', () => {
      const { clock, advance } = makeClock(0);
      const buffer = makeBuffer({ clock, ttlMs: 30_000 });
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(30_001);
      expect(buffer.getActive()).toHaveLength(0);
    });

    it('expired entries reduce size when getActive is called', () => {
      const { clock, advance } = makeClock(0);
      const buffer = makeBuffer({ clock, ttlMs: 30_000 });
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(30_001);
      buffer.getActive(); // triggers eviction
      expect(buffer.size()).toBe(0);
    });

    it('only non-expired entries are returned by getActive', () => {
      const { clock, advance } = makeClock(0);
      const buffer = makeBuffer({ clock, ttlMs: 30_000 });
      const early = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(20_000);
      const later = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(15_000); // early has now expired; later has 15s left
      const active = buffer.getActive();
      expect(active.some(e => e.id === early.id)).toBe(false);
      expect(active.some(e => e.id === later.id)).toBe(true);
    });

    it('new entry is rejected and oldest evicted when buffer full at enqueue', () => {
      const { clock, advance } = makeClock(0);
      const buffer = makeBuffer({ maxEntries: 2, clock, ttlMs: 30_000 });
      const a = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(5_000);
      const b = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(5_000);
      // Buffer is full (2 entries); next enqueue evicts 'a'
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      const active = buffer.getActive();
      expect(active.some(e => e.id === a.id)).toBe(false);
      expect(active.some(e => e.id === b.id)).toBe(true);
    });
  });

  describe('remove', () => {
    it('removes an entry by id', () => {
      const buffer = makeBuffer();
      const entry = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      buffer.remove(entry.id);
      expect(buffer.size()).toBe(0);
    });

    it('does not affect other entries when removing one', () => {
      const buffer = makeBuffer();
      const e1 = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      const e2 = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      buffer.remove(e1.id);
      const active = buffer.getActive();
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe(e2.id);
    });

    it('is a no-op for an unknown id', () => {
      const buffer = makeBuffer();
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      expect(() => buffer.remove('nonexistent-id')).not.toThrow();
      expect(buffer.size()).toBe(1);
    });
  });

  describe('getActive', () => {
    it('returns an immutable snapshot (modifying return value does not change buffer)', () => {
      const buffer = makeBuffer();
      buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      const snapshot = buffer.getActive() as DeliberationEntry[];
      snapshot.push({} as DeliberationEntry); // mutate snapshot
      expect(buffer.size()).toBe(1); // buffer unchanged
    });

    it('returns entries in enqueue order', () => {
      const { clock, advance } = makeClock(0);
      const buffer = makeBuffer({ clock });
      advance(1);
      const e1 = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      advance(1);
      const e2 = buffer.enqueue(TEST_ACTION, D4_VIOLATION);
      const active = buffer.getActive();
      expect(active[0]!.id).toBe(e1.id);
      expect(active[1]!.id).toBe(e2.id);
    });
  });
});
