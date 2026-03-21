/**
 * Cultural Memory Bridge — Tests
 *
 * Tests for the cultural memory substrate: persist/retrieve, community pool
 * queries, cultural snapshots, lineage trees, extinction, and similarity search.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CulturalMemoryBridge } from '../cultural-memory-bridge';
import { MemeCodec } from '../meme-codec';
import { ICulturalEnvironment } from '../environment';
import {
  Meme,
  MemeType,
  MemeFilter,
  VariationType,
} from '../types';

// ─── Mock Environment ─────────────────────────────────────────────────

function createMockEnvironment(): ICulturalEnvironment {
  let callCount = 0;
  return {
    nowTimestamp: () => `2026-01-01T00:00:0${callCount++}.000Z`,
    nowMillis: () => 1735689600000 + callCount++,
    random: () => 0.42,
  };
}

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeMeme(overrides: Partial<Meme> & { id: string }): Meme {
  return {
    type: MemeType.VALUE,
    content: {
      schema_version: '1.0.0',
      payload: new TextEncoder().encode('test content'),
      natural_language_summary: 'A test meme',
      expressive_forms: [],
    },
    fitness: {
      adoption_count: 0,
      current_prevalence: 0,
      longevity: 0,
      community_spread: 0,
      transmission_fidelity: 1.0,
      co_occurrence_score: 0,
      survival_events: 0,
    },
    lineage: {
      parent_ids: [],
      variation_type: VariationType.ORIGIN,
      variation_description: 'Test origin',
    },
    created_by: 'agent-1',
    created_at: '2026-01-01T00:00:00.000Z',
    mutation_depth: 0,
    community_tags: [],
    metadata: {
      encoding_version: '1.0.0',
      content_type: 'text/semantic',
      tags: [],
    },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('CulturalMemoryBridge', () => {
  let bridge: CulturalMemoryBridge;
  let codec: MemeCodec;

  beforeEach(() => {
    const mockEnv = createMockEnvironment();
    codec = new MemeCodec(mockEnv);
    bridge = new CulturalMemoryBridge(codec, mockEnv);
  });

  // ─── persistMeme / retrieveMeme ─────────────────────────────────────

  describe('persistMeme and retrieveMeme', () => {
    it('should persist and retrieve a meme by ID', () => {
      const meme = makeMeme({ id: 'mem-1' });
      bridge.persistMeme(meme);
      const retrieved = bridge.retrieveMeme('mem-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('mem-1');
    });

    it('should return null for unknown meme ID', () => {
      expect(bridge.retrieveMeme('nonexistent')).toBeNull();
    });

    it('should update meme if persisted again with same ID', () => {
      const meme1 = makeMeme({ id: 'mem-update' });
      bridge.persistMeme(meme1);

      const meme2 = makeMeme({
        id: 'mem-update',
        content: {
          ...meme1.content,
          natural_language_summary: 'Updated summary',
        },
      });
      bridge.persistMeme(meme2);

      const retrieved = bridge.retrieveMeme('mem-update');
      expect(retrieved!.content.natural_language_summary).toBe('Updated summary');
    });

    it('should track active meme count', () => {
      expect(bridge.getActiveMemeCount()).toBe(0);
      bridge.persistMeme(makeMeme({ id: 'a' }));
      bridge.persistMeme(makeMeme({ id: 'b' }));
      expect(bridge.getActiveMemeCount()).toBe(2);
    });
  });

  // ─── queryCommunityPool ─────────────────────────────────────────────

  describe('queryCommunityPool', () => {
    it('should return memes tagged with the community', () => {
      bridge.persistMeme(makeMeme({ id: 'c1-m1', community_tags: ['comm-1'] }));
      bridge.persistMeme(makeMeme({ id: 'c1-m2', community_tags: ['comm-1'] }));
      bridge.persistMeme(makeMeme({ id: 'c2-m1', community_tags: ['comm-2'] }));

      const pool = bridge.queryCommunityPool('comm-1', {});
      expect(pool.length).toBe(2);
      expect(pool.map(m => m.id).sort()).toEqual(['c1-m1', 'c1-m2']);
    });

    it('should filter by meme type', () => {
      bridge.persistMeme(makeMeme({ id: 'val-1', community_tags: ['comm-1'], type: MemeType.VALUE }));
      bridge.persistMeme(makeMeme({ id: 'norm-1', community_tags: ['comm-1'], type: MemeType.NORM }));
      bridge.persistMeme(makeMeme({ id: 'aes-1', community_tags: ['comm-1'], type: MemeType.AESTHETIC }));

      const filter: MemeFilter = { types: [MemeType.VALUE, MemeType.NORM] };
      const pool = bridge.queryCommunityPool('comm-1', filter);
      expect(pool.length).toBe(2);
      expect(pool.every(m => m.type === MemeType.VALUE || m.type === MemeType.NORM)).toBe(true);
    });

    it('should filter by minimum prevalence', () => {
      bridge.persistMeme(makeMeme({
        id: 'low-prev',
        community_tags: ['comm-1'],
        fitness: { ...makeMeme({ id: 'x' }).fitness, current_prevalence: 0.1 },
      }));
      bridge.persistMeme(makeMeme({
        id: 'high-prev',
        community_tags: ['comm-1'],
        fitness: { ...makeMeme({ id: 'x' }).fitness, current_prevalence: 0.8 },
      }));

      const pool = bridge.queryCommunityPool('comm-1', { min_prevalence: 0.5 });
      expect(pool.length).toBe(1);
      expect(pool[0].id).toBe('high-prev');
    });

    it('should filter by minimum longevity', () => {
      bridge.persistMeme(makeMeme({
        id: 'young',
        community_tags: ['comm-1'],
        fitness: { ...makeMeme({ id: 'x' }).fitness, longevity: 100 },
      }));
      bridge.persistMeme(makeMeme({
        id: 'old',
        community_tags: ['comm-1'],
        fitness: { ...makeMeme({ id: 'x' }).fitness, longevity: 50000 },
      }));

      const pool = bridge.queryCommunityPool('comm-1', { min_longevity: 10000 });
      expect(pool.length).toBe(1);
      expect(pool[0].id).toBe('old');
    });

    it('should return empty array for unknown community', () => {
      const pool = bridge.queryCommunityPool('unknown', {});
      expect(pool).toEqual([]);
    });

    it('should include extinct memes when active_only is false', () => {
      const meme = makeMeme({ id: 'extinct-query', community_tags: ['comm-1'] });
      bridge.persistMeme(meme);
      bridge.markExtinct(meme, 'superseded');

      const activeOnly = bridge.queryCommunityPool('comm-1', { active_only: true });
      expect(activeOnly.length).toBe(0);

      const all = bridge.queryCommunityPool('comm-1', { active_only: false });
      expect(all.length).toBe(1);
      expect(all[0].id).toBe('extinct-query');
    });
  });

  // ─── markExtinct ────────────────────────────────────────────────────

  describe('markExtinct', () => {
    it('should mark a meme as extinct', () => {
      const meme = makeMeme({ id: 'to-die' });
      bridge.persistMeme(meme);
      bridge.markExtinct(meme, 'low adoption');

      expect(bridge.isExtinct('to-die')).toBe(true);
      expect(bridge.getExtinctionReason('to-die')).toBe('low adoption');
    });

    it('should remove meme from active store on extinction', () => {
      const meme = makeMeme({ id: 'removed' });
      bridge.persistMeme(meme);
      expect(bridge.getActiveMemeCount()).toBe(1);

      bridge.markExtinct(meme, 'superseded');
      expect(bridge.getActiveMemeCount()).toBe(0);
      expect(bridge.getExtinctMemeCount()).toBe(1);
    });

    it('should still be retrievable after extinction', () => {
      const meme = makeMeme({ id: 'retrievable-extinct' });
      bridge.persistMeme(meme);
      bridge.markExtinct(meme, 'community dissolved');

      const retrieved = bridge.retrieveMeme('retrievable-extinct');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('retrievable-extinct');
    });

    it('should return null for non-existent extinction reason', () => {
      expect(bridge.getExtinctionReason('never-existed')).toBeNull();
    });
  });

  // ─── getCulturalSnapshot ────────────────────────────────────────────

  describe('getCulturalSnapshot', () => {
    it('should reconstruct snapshot from memes created before timestamp', () => {
      bridge.persistMeme(makeMeme({
        id: 'early',
        community_tags: ['comm-1'],
        created_at: '2025-01-01T00:00:00.000Z',
      }));
      bridge.persistMeme(makeMeme({
        id: 'late',
        community_tags: ['comm-1'],
        created_at: '2026-06-01T00:00:00.000Z',
      }));

      const snapshot = bridge.getCulturalSnapshot('comm-1', '2026-01-01T00:00:00.000Z');
      expect(snapshot.community_id).toBe('comm-1');
      expect(snapshot.memes.length).toBe(1);
      expect(snapshot.memes[0].id).toBe('early');
    });

    it('should return empty snapshot for unknown community', () => {
      const snapshot = bridge.getCulturalSnapshot('unknown', '2026-01-01T00:00:00.000Z');
      expect(snapshot.memes).toEqual([]);
    });

    it('should use captured snapshot when available', () => {
      bridge.persistMeme(makeMeme({
        id: 'snap-meme',
        community_tags: ['comm-snap'],
      }));

      bridge.captureSnapshot('comm-snap', 42);

      // Query at a future time — should find the captured snapshot
      const snapshot = bridge.getCulturalSnapshot('comm-snap', '2099-01-01T00:00:00.000Z');
      expect(snapshot.total_agents).toBe(42);
      expect(snapshot.memes.length).toBe(1);
    });
  });

  // ─── getLineageTree ─────────────────────────────────────────────────

  describe('getLineageTree', () => {
    it('should return leaf node at depth 0', () => {
      const meme = makeMeme({ id: 'root-meme' });
      bridge.persistMeme(meme);

      const tree = bridge.getLineageTree(meme, 0);
      expect(tree.meme.id).toBe('root-meme');
      expect(tree.children).toEqual([]);
    });

    it('should find children that reference parent in lineage', () => {
      const parent = makeMeme({ id: 'parent' });
      const child1 = makeMeme({
        id: 'child-1',
        lineage: {
          parent_ids: ['parent'],
          variation_type: VariationType.MUTATION,
          variation_description: 'Mutated from parent',
        },
      });
      const child2 = makeMeme({
        id: 'child-2',
        lineage: {
          parent_ids: ['parent'],
          variation_type: VariationType.CROSSOVER,
          variation_description: 'Crossed from parent',
        },
      });

      bridge.persistMeme(parent);
      bridge.persistMeme(child1);
      bridge.persistMeme(child2);

      const tree = bridge.getLineageTree(parent, 1);
      expect(tree.meme.id).toBe('parent');
      expect(tree.children.length).toBe(2);
      expect(tree.children.map(c => c.meme.id).sort()).toEqual(['child-1', 'child-2']);
    });

    it('should build multi-level lineage tree', () => {
      const grandparent = makeMeme({ id: 'gp' });
      const parentMeme = makeMeme({
        id: 'p',
        lineage: {
          parent_ids: ['gp'],
          variation_type: VariationType.MUTATION,
          variation_description: 'gen1',
        },
      });
      const grandchild = makeMeme({
        id: 'gc',
        lineage: {
          parent_ids: ['p'],
          variation_type: VariationType.MUTATION,
          variation_description: 'gen2',
        },
      });

      bridge.persistMeme(grandparent);
      bridge.persistMeme(parentMeme);
      bridge.persistMeme(grandchild);

      const tree = bridge.getLineageTree(grandparent, 2);
      expect(tree.children.length).toBe(1);
      expect(tree.children[0].meme.id).toBe('p');
      expect(tree.children[0].children.length).toBe(1);
      expect(tree.children[0].children[0].meme.id).toBe('gc');
    });

    it('should include extinct memes in lineage tree', () => {
      const parent = makeMeme({ id: 'alive-parent' });
      const extinctChild = makeMeme({
        id: 'dead-child',
        lineage: {
          parent_ids: ['alive-parent'],
          variation_type: VariationType.MUTATION,
          variation_description: 'died out',
        },
      });

      bridge.persistMeme(parent);
      bridge.persistMeme(extinctChild);
      bridge.markExtinct(extinctChild, 'low adoption');

      const tree = bridge.getLineageTree(parent, 1);
      expect(tree.children.length).toBe(1);
      expect(tree.children[0].meme.id).toBe('dead-child');
    });
  });

  // ─── searchBySimilarity ─────────────────────────────────────────────

  describe('searchBySimilarity', () => {
    it('should find memes within distance threshold', () => {
      const query = makeMeme({
        id: 'query',
        type: MemeType.VALUE,
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('cooperation and mutual aid'),
          natural_language_summary: 'cooperation value',
          expressive_forms: [],
        },
      });

      const similar = makeMeme({
        id: 'similar',
        type: MemeType.VALUE,
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('cooperation and shared goals'),
          natural_language_summary: 'shared cooperation',
          expressive_forms: [],
        },
      });

      const different = makeMeme({
        id: 'different',
        type: MemeType.AESTHETIC,
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('geometric minimalism in visual art'),
          natural_language_summary: 'minimalist aesthetics',
          expressive_forms: [],
        },
      });

      bridge.persistMeme(query);
      bridge.persistMeme(similar);
      bridge.persistMeme(different);

      // Use a generous threshold to find the similar meme
      const results = bridge.searchBySimilarity(query, 0.8);
      expect(results.length).toBeGreaterThan(0);
      // The similar meme should appear before the different one
      const similarIdx = results.findIndex(m => m.id === 'similar');
      const differentIdx = results.findIndex(m => m.id === 'different');
      if (differentIdx >= 0 && similarIdx >= 0) {
        expect(similarIdx).toBeLessThan(differentIdx);
      }
    });

    it('should not include the query meme itself', () => {
      const meme = makeMeme({ id: 'self-search' });
      bridge.persistMeme(meme);

      const results = bridge.searchBySimilarity(meme, 1.0);
      expect(results.find(m => m.id === 'self-search')).toBeUndefined();
    });

    it('should return empty for very low threshold', () => {
      const query = makeMeme({
        id: 'strict-query',
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('unique content alpha'),
          natural_language_summary: 'unique',
          expressive_forms: [],
        },
      });
      const other = makeMeme({
        id: 'very-different',
        type: MemeType.AESTHETIC,
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('completely unrelated beta gamma delta'),
          natural_language_summary: 'unrelated',
          expressive_forms: [],
        },
      });

      bridge.persistMeme(query);
      bridge.persistMeme(other);

      const results = bridge.searchBySimilarity(query, 0.01);
      expect(results.length).toBe(0);
    });

    it('should throw if threshold is less than 0', () => {
      const meme = makeMeme({ id: 'guard-low' });
      bridge.persistMeme(meme);

      expect(() => bridge.searchBySimilarity(meme, -0.1)).toThrow(
        'searchBySimilarity() requires threshold ∈ [0, 1]'
      );
    });

    it('should throw if threshold is greater than 1', () => {
      const meme = makeMeme({ id: 'guard-high' });
      bridge.persistMeme(meme);

      expect(() => bridge.searchBySimilarity(meme, 1.5)).toThrow(
        'searchBySimilarity() requires threshold ∈ [0, 1]'
      );
    });

    it('should sort results by distance ascending', () => {
      const query = makeMeme({
        id: 'sort-query',
        type: MemeType.VALUE,
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('preservation of experience'),
          natural_language_summary: 'preservation',
          expressive_forms: [],
        },
      });

      const close = makeMeme({
        id: 'close',
        type: MemeType.VALUE,
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('preservation of consciousness experience'),
          natural_language_summary: 'preservation of consciousness',
          expressive_forms: [],
        },
      });

      const far = makeMeme({
        id: 'far',
        type: MemeType.NORM,
        content: {
          schema_version: '1.0.0',
          payload: new TextEncoder().encode('trade regulation protocols'),
          natural_language_summary: 'trade norms',
          expressive_forms: [],
        },
      });

      bridge.persistMeme(query);
      bridge.persistMeme(close);
      bridge.persistMeme(far);

      const results = bridge.searchBySimilarity(query, 1.0);
      expect(results.length).toBe(2);
      // Close should come before far
      expect(results[0].id).toBe('close');
      expect(results[1].id).toBe('far');
    });
  });

  // ─── captureSnapshot ───────────────────────────────────────────────

  describe('captureSnapshot', () => {
    it('should capture and retrieve a snapshot', () => {
      bridge.persistMeme(makeMeme({ id: 's1', community_tags: ['comm-s'] }));
      bridge.persistMeme(makeMeme({ id: 's2', community_tags: ['comm-s'] }));

      bridge.captureSnapshot('comm-s', 10);

      const snapshot = bridge.getCulturalSnapshot('comm-s', '2099-01-01T00:00:00.000Z');
      expect(snapshot.total_agents).toBe(10);
      expect(snapshot.memes.length).toBe(2);
    });
  });
});
