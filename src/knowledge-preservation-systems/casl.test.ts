/**
 * Content-Addressed Storage Layer (CASL) — Tests
 *
 * Card: 0.3.2.3 Knowledge Preservation Systems
 * Component: CASL (Section 2 of architecture doc)
 *
 * Verifies:
 *  - Items stored by content hash are retrievable
 *  - Same content always yields same hash (deduplication)
 *  - Stored items are immutable (cannot be overwritten)
 *  - Version chains link mutations to predecessors
 *  - Replication status is tracked per item
 *  - Below-threshold replication is detected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContentAddressedStorageLayer,
  hashContent,
  createKnowledgeItem,
} from './casl.js';
import type {
  KnowledgeItem,
  ReplicationConfig,
  ContentAddressedHash,
} from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fixed timestamp for deterministic tests. */
const NOW = 5000;

function makeItem(content: string, overrides?: Partial<KnowledgeItem>): KnowledgeItem {
  return createKnowledgeItem({
    content,
    contentType: 'text/plain',
    authorId: 'entity-001',
    createdAt: 1000,
    conditions: { description: 'test context', contributorIds: [] },
    sourceIds: [],
    domainTags: ['test/general'],
    confidence: 0.9,
    relevanceEpoch: { validFrom: 0, validUntil: null },
    versionChain: null,
    ...overrides,
  });
}

const defaultConfig: ReplicationConfig = {
  nToleratedNodeLoss: 3,
  replicationFactor: 4,
  confidenceDecayRatePerYear: 0.01,
  semanticLatencySlaSeconds: 30,
  exactMatchLocalCacheMs: 100,
  exactMatchCrossNodeSeconds: 5,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('hashContent', () => {
  it('produces a deterministic hash for the same content', () => {
    const a = hashContent('hello world');
    const b = hashContent('hello world');
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
  });

  it('produces different hashes for different content', () => {
    const a = hashContent('hello');
    const b = hashContent('world');
    expect(a).not.toBe(b);
  });
});

describe('createKnowledgeItem', () => {
  it('sets id to the hash of content', () => {
    const item = makeItem('some knowledge');
    expect(item.id).toBe(hashContent('some knowledge'));
  });

  it('populates all required fields', () => {
    const item = makeItem('payload');
    expect(item.content).toBe('payload');
    expect(item.contentType).toBe('text/plain');
    expect(item.provenance.authorId).toBe('entity-001');
    expect(item.provenance.createdAt).toBe(1000);
    expect(item.metadata.confidence).toBe(0.9);
    expect(item.metadata.supersededBy).toEqual([]);
    expect(item.metadata.conflictsWith).toEqual([]);
    expect(item.metadata.resolutionMeta).toBeNull();
    expect(item.signatures).toEqual([]);
    expect(item.versionChain).toBeNull();
  });
});

describe('ContentAddressedStorageLayer', () => {
  let casl: ContentAddressedStorageLayer;

  beforeEach(() => {
    casl = new ContentAddressedStorageLayer('node-1', defaultConfig);
  });

  // ── Store & Retrieve ───────────────────────────────────────────────────

  it('stores and retrieves an item by hash', () => {
    const item = makeItem('knowledge A');
    casl.store(item, NOW);
    const retrieved = casl.get(item.id);
    expect(retrieved).toEqual(item);
  });

  it('returns null for unknown hashes', () => {
    expect(casl.get('nonexistent-hash')).toBeNull();
  });

  it('deduplicates identical content (same hash = same item)', () => {
    const item1 = makeItem('duplicate me');
    const item2 = makeItem('duplicate me');
    expect(item1.id).toBe(item2.id);
    casl.store(item1, NOW);
    casl.store(item2, NOW); // should not throw, just dedup
    expect(casl.itemCount()).toBe(1);
  });

  // ── Immutability ──────────────────────────────────────────────────────

  it('rejects overwrites of existing items with different metadata', () => {
    const item = makeItem('immutable content');
    casl.store(item, NOW);

    const altered = { ...item, contentType: 'application/json' };
    expect(() => casl.store(altered, NOW)).toThrow(/immutable|overwrite/i);
  });

  // ── Version Chains ────────────────────────────────────────────────────

  it('supports version chains — new item links to predecessor', () => {
    const v1 = makeItem('version 1');
    casl.store(v1, NOW);

    const v2 = makeItem('version 2', { versionChain: v1.id } as any);
    casl.store(v2, NOW);

    expect(v2.versionChain).toBe(v1.id);
    const history = casl.history(v2.id);
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe(v2.id);
    expect(history[1].id).toBe(v1.id);
  });

  it('history returns single item for genesis items', () => {
    const item = makeItem('genesis');
    casl.store(item, NOW);
    const history = casl.history(item.id);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(item.id);
  });

  // ── Replication Tracking ──────────────────────────────────────────────

  it('tracks replication status for stored items', () => {
    const item = makeItem('replicated');
    casl.store(item, NOW);
    const status = casl.replicationStatus(item.id);
    expect(status).not.toBeNull();
    expect(status!.currentCopies).toBe(1);
    expect(status!.nodeIds).toContain('node-1');
    expect(status!.belowThreshold).toBe(true); // only 1 copy, threshold is 4
  });

  it('registers remote copies and updates replication count', () => {
    const item = makeItem('multi-node');
    casl.store(item, NOW);
    casl.registerRemoteCopy(item.id, 'node-2');
    casl.registerRemoteCopy(item.id, 'node-3');
    casl.registerRemoteCopy(item.id, 'node-4');

    const status = casl.replicationStatus(item.id);
    expect(status!.currentCopies).toBe(4);
    expect(status!.belowThreshold).toBe(false);
  });

  it('lists items below replication threshold', () => {
    const a = makeItem('item-a');
    const b = makeItem('item-b');
    casl.store(a, NOW);
    casl.store(b, NOW);

    // Bring a above threshold
    casl.registerRemoteCopy(a.id, 'node-2');
    casl.registerRemoteCopy(a.id, 'node-3');
    casl.registerRemoteCopy(a.id, 'node-4');

    const underReplicated = casl.itemsBelowReplicationThreshold();
    expect(underReplicated).toHaveLength(1);
    expect(underReplicated[0]).toBe(b.id);
  });

  // ── Tamper Evidence ───────────────────────────────────────────────────

  it('records tamper anomaly on overwrite attempt', () => {
    const item = makeItem('tamper target');
    casl.store(item, NOW);

    const tamperTime = 6000;
    const altered = { ...item, contentType: 'application/xml' };
    try { casl.store(altered, tamperTime); } catch { /* expected */ }

    const anomalies = casl.tamperAnomalies();
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].affectedItemId).toBe(item.id);
    expect(anomalies[0].attemptingNodeId).toBe('node-1');
    expect(anomalies[0].detectedAt).toBe(tamperTime);
  });

  // ── Merkle Manifest ───────────────────────────────────────────────────

  it('generates a Merkle manifest of all stored item IDs', () => {
    casl.store(makeItem('one'), NOW);
    casl.store(makeItem('two'), NOW);
    casl.store(makeItem('three'), NOW);

    const manifestTime = 7000;
    const manifest = casl.merkleManifest(manifestTime);
    expect(manifest.itemIds).toHaveLength(3);
    expect(manifest.nodeId).toBe('node-1');
    expect(manifest.merkleRoot.length).toBeGreaterThan(0);
    expect(manifest.generatedAt).toBe(manifestTime);
  });
});
