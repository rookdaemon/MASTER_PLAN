/**
 * Content-Addressed Storage Layer (CASL)
 *
 * Card: 0.3.2.3 Knowledge Preservation Systems
 * Architecture ref: Section 2 — Content-Addressed Storage Layer
 *
 * Responsibilities:
 *  - Store KnowledgeItems addressed by SHA-256 hash of content
 *  - Enforce immutability: items cannot be overwritten once stored
 *  - Track per-item replication status across nodes
 *  - Detect and log tamper attempts
 *  - Generate Merkle manifests for node bootstrapping
 *  - Resolve version chains (linked list of mutations)
 */

import { createHash } from 'crypto';
import type {
  KnowledgeItem,
  KnowledgeItemMetadata,
  Provenance,
  ContextSnapshot,
  ContentAddressedHash,
  EntityIdentifier,
  CosmologicalTimestamp,
  ContentType,
  OntologyNodeRef,
  ConfidenceScore,
  EpochRange,
  ReplicationConfig,
  ReplicationStatus,
  TamperAnomalyRecord,
  MerkleManifest,
} from './types';

// ── Public Helpers ──────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of the content string.
 * Same content always yields the same hash.
 */
export function hashContent(content: string): ContentAddressedHash {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Parameters for creating a KnowledgeItem via the factory function.
 */
export interface CreateKnowledgeItemParams {
  content: string;
  contentType: ContentType;
  authorId: EntityIdentifier;
  createdAt: CosmologicalTimestamp;
  conditions: ContextSnapshot;
  sourceIds: ContentAddressedHash[];
  domainTags: OntologyNodeRef[];
  confidence: ConfidenceScore;
  relevanceEpoch: EpochRange;
  versionChain: ContentAddressedHash | null;
}

/**
 * Factory: build a well-formed KnowledgeItem with the id set to the content hash.
 */
export function createKnowledgeItem(params: CreateKnowledgeItemParams): KnowledgeItem {
  const id = hashContent(params.content);

  const provenance: Provenance = {
    authorId: params.authorId,
    createdAt: params.createdAt,
    conditions: params.conditions,
    sourceIds: params.sourceIds,
  };

  const metadata: KnowledgeItemMetadata = {
    domainTags: params.domainTags,
    confidence: params.confidence,
    relevanceEpoch: params.relevanceEpoch,
    supersededBy: [],
    conflictsWith: [],
    resolutionMeta: null,
  };

  return {
    id,
    content: params.content,
    contentType: params.contentType,
    provenance,
    metadata,
    signatures: [],
    versionChain: params.versionChain,
  };
}

// ── Deep equality check (structural, JSON-safe) ─────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── CASL ────────────────────────────────────────────────────────────────────

/**
 * In-memory Content-Addressed Storage Layer.
 *
 * Production deployments would back this with persistent, append-only media
 * (optical write-once, 5D crystal, etc.). This implementation captures the
 * invariants and interfaces; the storage backend is pluggable.
 */
export class ContentAddressedStorageLayer {
  private readonly items = new Map<ContentAddressedHash, KnowledgeItem>();
  private readonly replication = new Map<ContentAddressedHash, Set<string>>();
  private readonly anomalies: TamperAnomalyRecord[] = [];
  private readonly nodeId: string;
  private readonly config: ReplicationConfig;

  constructor(nodeId: string, config: ReplicationConfig) {
    this.nodeId = nodeId;
    this.config = config;
  }

  /**
   * Store a KnowledgeItem. If an item with the same hash already exists and
   * is structurally identical, this is a no-op (deduplication). If the hash
   * matches but the content differs, a TamperAnomalyRecord is logged and an
   * error is thrown — items are immutable.
   */
  store(item: KnowledgeItem, now: CosmologicalTimestamp): void {
    const existing = this.items.get(item.id);

    if (existing) {
      if (deepEqual(existing, item)) {
        // Exact duplicate — deduplication, no-op.
        return;
      }
      // Hash collision or overwrite attempt — record tamper anomaly.
      this.anomalies.push({
        detectedAt: now,
        affectedItemId: item.id,
        attemptingNodeId: this.nodeId,
        cryptographicProof: hashContent(JSON.stringify(item) + JSON.stringify(existing)),
        description: `Overwrite attempt on immutable item ${item.id}`,
      });
      throw new Error(
        `Immutable overwrite rejected: item ${item.id} already exists with different data`,
      );
    }

    this.items.set(item.id, item);
    // Track this node as holding a copy.
    this.replication.set(item.id, new Set([this.nodeId]));
  }

  /**
   * Retrieve a KnowledgeItem by its content-addressed hash.
   * Returns null if the item is not held locally.
   */
  get(id: ContentAddressedHash): KnowledgeItem | null {
    return this.items.get(id) ?? null;
  }

  /** Number of distinct items stored. */
  itemCount(): number {
    return this.items.size;
  }

  /** Return all stored items (snapshot). */
  allItems(): KnowledgeItem[] {
    return [...this.items.values()];
  }

  /**
   * Walk the version chain backwards from the given item to its genesis,
   * returning the full ordered history (newest first).
   */
  history(id: ContentAddressedHash): KnowledgeItem[] {
    const chain: KnowledgeItem[] = [];
    let current: ContentAddressedHash | null = id;

    while (current !== null) {
      const item = this.items.get(current);
      if (!item) break;
      chain.push(item);
      current = item.versionChain;
    }

    return chain;
  }

  /**
   * Get the replication status for an item.
   */
  replicationStatus(id: ContentAddressedHash): ReplicationStatus | null {
    const nodeIds = this.replication.get(id);
    if (!nodeIds) return null;

    const currentCopies = nodeIds.size;
    return {
      itemId: id,
      nodeIds: [...nodeIds],
      currentCopies,
      belowThreshold: currentCopies < this.config.replicationFactor,
    };
  }

  /**
   * Register that a remote node also holds a copy of this item.
   */
  registerRemoteCopy(itemId: ContentAddressedHash, remoteNodeId: string): void {
    const nodeIds = this.replication.get(itemId);
    if (!nodeIds) {
      throw new Error(`Cannot register remote copy: item ${itemId} not known locally`);
    }
    nodeIds.add(remoteNodeId);
  }

  /**
   * Return IDs of all items whose replication count is below the configured threshold.
   */
  itemsBelowReplicationThreshold(): ContentAddressedHash[] {
    const result: ContentAddressedHash[] = [];
    for (const [itemId, nodeIds] of this.replication) {
      if (nodeIds.size < this.config.replicationFactor) {
        result.push(itemId);
      }
    }
    return result;
  }

  /**
   * Return all recorded tamper anomaly events.
   */
  tamperAnomalies(): TamperAnomalyRecord[] {
    return [...this.anomalies];
  }

  /**
   * Generate a Merkle manifest of all item IDs held by this node.
   * Used during node bootstrapping so new nodes can discover missing items.
   */
  merkleManifest(now: CosmologicalTimestamp): MerkleManifest {
    const itemIds = [...this.items.keys()].sort();
    // Compute Merkle root as hash of sorted, concatenated item IDs.
    const merkleRoot = hashContent(itemIds.join(':'));

    return {
      merkleRoot,
      itemIds,
      generatedAt: now,
      nodeId: this.nodeId,
    };
  }
}
