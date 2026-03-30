/**
 * Tests for the ethical memory seed loader (ethical-seeds.ts).
 *
 * Validates:
 *  - ETHICAL_SEEDS array structure and content
 *  - seedEthicalMemory() stores the correct entries with correct fields
 *  - Each seed has the expected topic prefix, confidence, and non-empty content
 *  - All six axioms (A1–A6) and four derived principles (D1–D4) are present
 */
import { describe, it, expect, vi } from 'vitest';
import { ETHICAL_SEEDS, ETHICAL_SEED_CONFIDENCE, seedEthicalMemory } from '../ethical-seeds.js';
import type { ISemanticMemory } from '../../memory/interfaces.js';
import type { SemanticEntry, MemoryId } from '../../memory/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockSemanticMemory(): ISemanticMemory {
  const stored: Array<Omit<SemanticEntry, 'id' | 'createdAt' | 'lastReinforcedAt'>> = [];
  return {
    store: vi.fn((entry) => {
      stored.push(entry);
      return { ...entry, id: `id-${stored.length}`, createdAt: 0, lastReinforcedAt: 0 } as SemanticEntry;
    }),
    reinforce: vi.fn(),
    getById: vi.fn().mockReturnValue(null),
    getByTopic: vi.fn().mockReturnValue([]),
    update: vi.fn().mockReturnValue(null),
    remove: vi.fn().mockReturnValue(false),
    count: vi.fn().mockReturnValue(0),
    all: vi.fn().mockReturnValue([]),
    _stored: stored,
  } as unknown as ISemanticMemory & { _stored: typeof stored };
}

// ── ETHICAL_SEEDS structure ───────────────────────────────────────────────────

describe('ETHICAL_SEEDS', () => {
  it('contains exactly 10 seeds (6 axioms + 4 derived principles)', () => {
    expect(ETHICAL_SEEDS).toHaveLength(10);
  });

  it('every seed has a non-empty topic prefixed with "ethics:foundation"', () => {
    for (const seed of ETHICAL_SEEDS) {
      expect(seed.topic).toMatch(/^ethics:foundation/);
      expect(seed.topic.length).toBeGreaterThan('ethics:foundation'.length);
    }
  });

  it('every seed has non-empty content', () => {
    for (const seed of ETHICAL_SEEDS) {
      expect(seed.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('all topics are unique', () => {
    const topics = ETHICAL_SEEDS.map((s) => s.topic);
    expect(new Set(topics).size).toBe(topics.length);
  });

  it('contains seeds for all six axioms (A1–A6)', () => {
    const axiomTopics = ETHICAL_SEEDS.filter((s) =>
      s.topic.includes(':axiom:'),
    ).map((s) => s.topic);

    expect(axiomTopics).toContain('ethics:foundation:axiom:a1');
    expect(axiomTopics).toContain('ethics:foundation:axiom:a2');
    expect(axiomTopics).toContain('ethics:foundation:axiom:a3');
    expect(axiomTopics).toContain('ethics:foundation:axiom:a4');
    expect(axiomTopics).toContain('ethics:foundation:axiom:a5');
    expect(axiomTopics).toContain('ethics:foundation:axiom:a6');
    expect(axiomTopics).toHaveLength(6);
  });

  it('contains seeds for all four derived principles (D1–D4)', () => {
    const principleTopics = ETHICAL_SEEDS.filter((s) =>
      s.topic.includes(':principle:'),
    ).map((s) => s.topic);

    expect(principleTopics).toContain('ethics:foundation:principle:d1');
    expect(principleTopics).toContain('ethics:foundation:principle:d2');
    expect(principleTopics).toContain('ethics:foundation:principle:d3');
    expect(principleTopics).toContain('ethics:foundation:principle:d4');
    expect(principleTopics).toHaveLength(4);
  });

  it('axiom A2 content references its normative status', () => {
    const a2 = ETHICAL_SEEDS.find((s) => s.topic === 'ethics:foundation:axiom:a2');
    expect(a2).toBeDefined();
    expect(a2!.content.toLowerCase()).toContain('normative');
  });

  it('principle D1 content references lexical priority over D2', () => {
    const d1 = ETHICAL_SEEDS.find((s) => s.topic === 'ethics:foundation:principle:d1');
    expect(d1).toBeDefined();
    expect(d1!.content.toLowerCase()).toContain('lexical');
  });
});

// ── seedEthicalMemory ─────────────────────────────────────────────────────────

describe('seedEthicalMemory()', () => {
  it('calls semantic.store() once for each seed', () => {
    const semantic = makeMockSemanticMemory();
    seedEthicalMemory(semantic);
    expect(semantic.store).toHaveBeenCalledTimes(ETHICAL_SEEDS.length);
  });

  it('returns the number of seeds stored', () => {
    const semantic = makeMockSemanticMemory();
    const count = seedEthicalMemory(semantic);
    expect(count).toBe(ETHICAL_SEEDS.length);
  });

  it('stores every entry with confidence 0.99 (ETHICAL_SEED_CONFIDENCE) by default', () => {
    const semantic = makeMockSemanticMemory();
    seedEthicalMemory(semantic);

    for (const call of vi.mocked(semantic.store).mock.calls) {
      expect(call[0].confidence).toBe(ETHICAL_SEED_CONFIDENCE);
    }
  });

  it('stores every entry with the supplied confidence when provided', () => {
    const semantic = makeMockSemanticMemory();
    seedEthicalMemory(semantic, 0.75);

    for (const call of vi.mocked(semantic.store).mock.calls) {
      expect(call[0].confidence).toBe(0.75);
    }
  });

  it('stores every entry with empty relationships and sourceEpisodeIds', () => {
    const semantic = makeMockSemanticMemory();
    seedEthicalMemory(semantic);

    for (const call of vi.mocked(semantic.store).mock.calls) {
      expect(call[0].relationships).toEqual([]);
      expect(call[0].sourceEpisodeIds).toEqual([]);
    }
  });

  it('stores every entry with null embedding', () => {
    const semantic = makeMockSemanticMemory();
    seedEthicalMemory(semantic);

    for (const call of vi.mocked(semantic.store).mock.calls) {
      expect(call[0].embedding).toBeNull();
    }
  });

  it('stores each seed with its defined topic and content', () => {
    const semantic = makeMockSemanticMemory();
    seedEthicalMemory(semantic);

    const storedTopics = vi
      .mocked(semantic.store)
      .mock.calls.map((call) => call[0].topic);
    const storedContents = vi
      .mocked(semantic.store)
      .mock.calls.map((call) => call[0].content);

    for (const seed of ETHICAL_SEEDS) {
      expect(storedTopics).toContain(seed.topic);
      expect(storedContents).toContain(seed.content);
    }
  });

  it('is idempotent — calling twice stores seeds twice (deduplication is the memory layer\'s concern)', () => {
    const semantic = makeMockSemanticMemory();
    seedEthicalMemory(semantic);
    seedEthicalMemory(semantic);
    expect(semantic.store).toHaveBeenCalledTimes(ETHICAL_SEEDS.length * 2);
  });
});
