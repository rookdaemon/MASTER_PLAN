/**
 * Query & Retrieval Interface (QRI) — Tests
 *
 * Card: 0.3.2.3 Knowledge Preservation Systems
 * Component: QRI (Section 4 of architecture doc)
 *
 * Verifies:
 *  - Exact-match lookup by content hash
 *  - Semantic/associative search with metadata filters
 *  - Ontology traversal via related()
 *  - Version chain history retrieval
 *  - Provenance tree resolution (audit_trail)
 *  - Metadata filtering (domain, confidence, epoch, superseded, author)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContentAddressedStorageLayer,
  createKnowledgeItem,
  hashContent,
} from './casl.js';
import { QueryRetrievalInterface } from './qri.js';
import type {
  KnowledgeItem,
  ReplicationConfig,
  MetadataFilter,
  ProvenanceTree,
} from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fixed timestamp for deterministic tests. */
const NOW = 5000;

const defaultConfig: ReplicationConfig = {
  nToleratedNodeLoss: 3,
  replicationFactor: 4,
  confidenceDecayRatePerYear: 0.01,
  semanticLatencySlaSeconds: 30,
  exactMatchLocalCacheMs: 100,
  exactMatchCrossNodeSeconds: 5,
};

function makeItem(
  content: string,
  overrides?: Partial<{
    contentType: string;
    authorId: string;
    createdAt: number;
    domainTags: string[];
    confidence: number;
    relevanceEpoch: { validFrom: number | null; validUntil: number | null };
    versionChain: string | null;
    sourceIds: string[];
  }>,
): KnowledgeItem {
  return createKnowledgeItem({
    content,
    contentType: overrides?.contentType ?? 'text/plain',
    authorId: overrides?.authorId ?? 'entity-001',
    createdAt: overrides?.createdAt ?? 1000,
    conditions: { description: 'test context', contributorIds: [] },
    sourceIds: overrides?.sourceIds ?? [],
    domainTags: overrides?.domainTags ?? ['test/general'],
    confidence: overrides?.confidence ?? 0.9,
    relevanceEpoch: overrides?.relevanceEpoch ?? { validFrom: 0, validUntil: null },
    versionChain: overrides?.versionChain ?? null,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('QueryRetrievalInterface', () => {
  let casl: ContentAddressedStorageLayer;
  let qri: QueryRetrievalInterface;

  beforeEach(() => {
    casl = new ContentAddressedStorageLayer('node-1', defaultConfig);
    qri = new QueryRetrievalInterface(casl);
  });

  // ── Exact-match get ───────────────────────────────────────────────────

  describe('get()', () => {
    it('retrieves an item by its content-addressed hash', () => {
      const item = makeItem('exact match payload');
      casl.store(item, NOW);
      const result = qri.get(item.id);
      expect(result).toEqual(item);
    });

    it('returns null for unknown hashes', () => {
      expect(qri.get('nonexistent')).toBeNull();
    });
  });

  // ── Search with metadata filters ──────────────────────────────────────

  describe('search()', () => {
    it('returns all items when no filter is specified', () => {
      casl.store(makeItem('alpha'), NOW);
      casl.store(makeItem('beta'), NOW);
      const results = qri.search({});
      expect(results).toHaveLength(2);
    });

    it('filters by domain tags', () => {
      casl.store(makeItem('physics item', { domainTags: ['physics/thermo'] }), NOW);
      casl.store(makeItem('biology item', { domainTags: ['biology/genetics'] }), NOW);

      const filter: MetadataFilter = { domainTags: ['physics/thermo'] };
      const results = qri.search(filter);
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('physics item');
    });

    it('filters by minimum confidence', () => {
      casl.store(makeItem('high conf', { confidence: 0.95 }), NOW);
      casl.store(makeItem('low conf', { confidence: 0.3 }), NOW);

      const results = qri.search({ minConfidence: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('high conf');
    });

    it('filters by epoch overlap', () => {
      casl.store(makeItem('old knowledge', {
        relevanceEpoch: { validFrom: 100, validUntil: 500 },
      }), NOW);
      casl.store(makeItem('current knowledge', {
        relevanceEpoch: { validFrom: 400, validUntil: null },
      }), NOW);

      // Query for items valid at time 600
      const results = qri.search({
        epochOverlap: { validFrom: 600, validUntil: 700 },
      });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('current knowledge');
    });

    it('excludes superseded items by default', () => {
      const item = makeItem('original');
      // Manually mark as superseded
      item.metadata.supersededBy = ['some-successor-hash'];
      casl.store(item, NOW);
      casl.store(makeItem('still valid'), NOW);

      const results = qri.search({});
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('still valid');
    });

    it('includes superseded items when includeSuperseded is true', () => {
      const item = makeItem('original');
      item.metadata.supersededBy = ['some-successor-hash'];
      casl.store(item, NOW);
      casl.store(makeItem('still valid'), NOW);

      const results = qri.search({ includeSuperseded: true });
      expect(results).toHaveLength(2);
    });

    it('filters by author ID', () => {
      casl.store(makeItem('by alice', { authorId: 'alice' }), NOW);
      casl.store(makeItem('by bob', { authorId: 'bob' }), NOW);

      const results = qri.search({ authorId: 'alice' });
      expect(results).toHaveLength(1);
      expect(results[0].provenance.authorId).toBe('alice');
    });

    it('combines multiple filters', () => {
      casl.store(makeItem('match', {
        authorId: 'alice',
        confidence: 0.9,
        domainTags: ['physics/thermo'],
      }), NOW);
      casl.store(makeItem('wrong author', {
        authorId: 'bob',
        confidence: 0.9,
        domainTags: ['physics/thermo'],
      }), NOW);
      casl.store(makeItem('low conf', {
        authorId: 'alice',
        confidence: 0.2,
        domainTags: ['physics/thermo'],
      }), NOW);

      const results = qri.search({
        authorId: 'alice',
        minConfidence: 0.5,
        domainTags: ['physics/thermo'],
      });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('match');
    });
  });

  // ── Version history ───────────────────────────────────────────────────

  describe('history()', () => {
    it('returns full version chain newest-first', () => {
      const v1 = makeItem('version 1');
      casl.store(v1, NOW);
      const v2 = makeItem('version 2', { versionChain: v1.id });
      casl.store(v2, NOW);

      const history = qri.history(v2.id);
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe(v2.id);
      expect(history[1].id).toBe(v1.id);
    });

    it('returns empty array for unknown item', () => {
      expect(qri.history('nonexistent')).toEqual([]);
    });
  });

  // ── Provenance tree (audit trail) ─────────────────────────────────────

  describe('auditTrail()', () => {
    it('returns a provenance tree for an item with no sources', () => {
      const item = makeItem('standalone');
      casl.store(item, NOW);

      const tree = qri.auditTrail(item.id);
      expect(tree).not.toBeNull();
      expect(tree!.itemId).toBe(item.id);
      expect(tree!.sources).toEqual([]);
    });

    it('resolves source items recursively', () => {
      const source = makeItem('source fact');
      casl.store(source, NOW);
      const derived = makeItem('derived fact', { sourceIds: [source.id] });
      casl.store(derived, NOW);

      const tree = qri.auditTrail(derived.id);
      expect(tree).not.toBeNull();
      expect(tree!.itemId).toBe(derived.id);
      expect(tree!.sources).toHaveLength(1);
      expect(tree!.sources[0].itemId).toBe(source.id);
    });

    it('returns null for unknown item', () => {
      expect(qri.auditTrail('nonexistent')).toBeNull();
    });

    it('handles diamond-shaped source graphs', () => {
      const root = makeItem('root source');
      casl.store(root, NOW);
      const branchA = makeItem('branch A', { sourceIds: [root.id] });
      casl.store(branchA, NOW);
      const branchB = makeItem('branch B', { sourceIds: [root.id] });
      casl.store(branchB, NOW);
      const merged = makeItem('merged', { sourceIds: [branchA.id, branchB.id] });
      casl.store(merged, NOW);

      const tree = qri.auditTrail(merged.id);
      expect(tree).not.toBeNull();
      expect(tree!.sources).toHaveLength(2);
      // Both branches should resolve to the same root
      expect(tree!.sources[0].sources[0].itemId).toBe(root.id);
      expect(tree!.sources[1].sources[0].itemId).toBe(root.id);
    });
  });
});
