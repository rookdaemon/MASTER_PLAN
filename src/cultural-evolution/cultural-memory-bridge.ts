/**
 * Cultural Evolution — Cultural Memory Bridge
 *
 * Specialized cultural view layered over the knowledge preservation store (0.3.2.3).
 * Manages active meme pools, lineage graphs, community snapshots, extinction
 * preservation, and similarity search.
 *
 * The cultural memory is a layer on top of knowledge preservation — it does not
 * replace it. Cultural data is organized for cultural-evolution-specific queries:
 * lineage trees, community pools, temporal snapshots, and semantic similarity.
 */

import { ICulturalMemoryBridge } from './interfaces';
import { ICulturalEnvironment, DefaultCulturalEnvironment } from './environment';
import { MemeCodec } from './meme-codec';
import {
  Meme,
  MemeId,
  MemeType,
  CommunityId,
  Timestamp,
  MemeFilter,
  CommunitySnapshot,
  VariationTree,
  VariationTreeNode,
} from './types';

// ─── Internal Types ─────────────────────────────────────────────────────

interface ExtinctionRecord {
  meme: Meme;
  reason: string;
  extinct_at: Timestamp;
}

interface SnapshotRecord {
  community_id: CommunityId;
  captured_at: Timestamp;
  meme_ids: MemeId[];
  total_agents: number;
}

// ─── CulturalMemoryBridge Implementation ────────────────────────────────

export class CulturalMemoryBridge implements ICulturalMemoryBridge {
  /** All persisted memes, keyed by ID */
  private memes = new Map<MemeId, Meme>();

  /** Extinct memes with reason, keyed by ID */
  private extinctMemes = new Map<MemeId, ExtinctionRecord>();

  /** Community snapshots, keyed by `${communityId}:${timestamp}` */
  private snapshots: SnapshotRecord[] = [];

  private readonly env: ICulturalEnvironment;

  constructor(
    private codec: MemeCodec,
    env: ICulturalEnvironment = new DefaultCulturalEnvironment(),
  ) {
    this.env = env;
  }

  // ─── persistMeme ────────────────────────────────────────────────────

  /**
   * Persist a meme to the cultural memory store.
   * If a meme with the same ID already exists, it is updated.
   */
  persistMeme(meme: Meme): void {
    this.memes.set(meme.id, meme);
  }

  // ─── retrieveMeme ───────────────────────────────────────────────────

  /**
   * Retrieve a meme by ID. Returns null if not found.
   * Searches both active and extinct meme stores.
   */
  retrieveMeme(id: MemeId): Meme | null {
    const active = this.memes.get(id);
    if (active) return active;

    const extinct = this.extinctMemes.get(id);
    if (extinct) return extinct.meme;

    return null;
  }

  // ─── queryCommunityPool ─────────────────────────────────────────────

  /**
   * Query memes in a community with optional filters.
   *
   * Filters:
   *   - types: only return memes of these types
   *   - min_prevalence: only return memes above this prevalence threshold
   *   - min_longevity: only return memes older than this duration
   *   - community_id: only return memes tagged with this community
   *   - active_only: exclude extinct memes (default behavior)
   */
  queryCommunityPool(community: CommunityId, filter: MemeFilter): Meme[] {
    const results: Meme[] = [];

    // Determine source: active memes, or active + extinct
    const sources: Meme[] = [];

    for (const meme of this.memes.values()) {
      if (meme.community_tags.includes(community)) {
        sources.push(meme);
      }
    }

    // If not active_only, also include extinct memes from this community
    if (filter.active_only === false) {
      for (const record of this.extinctMemes.values()) {
        if (record.meme.community_tags.includes(community)) {
          sources.push(record.meme);
        }
      }
    }

    for (const meme of sources) {
      if (this.matchesFilter(meme, filter)) {
        results.push(meme);
      }
    }

    return results;
  }

  // ─── getCulturalSnapshot ────────────────────────────────────────────

  /**
   * Get a snapshot of a community's culture at a point in time.
   *
   * If a snapshot was explicitly captured at or near the given timestamp,
   * return it. Otherwise, reconstruct from memes created on or before
   * the timestamp.
   */
  getCulturalSnapshot(community: CommunityId, at: Timestamp): CommunitySnapshot {
    // Find closest captured snapshot at or before the given timestamp
    const captured = this.snapshots
      .filter(s => s.community_id === community && s.captured_at <= at)
      .sort((a, b) => b.captured_at.localeCompare(a.captured_at));

    if (captured.length > 0) {
      const snap = captured[0];
      const memes = snap.meme_ids
        .map(id => this.retrieveMeme(id))
        .filter((m): m is Meme => m !== null);

      return {
        community_id: community,
        captured_at: snap.captured_at,
        memes,
        divergence_indices: new Map(),
        total_agents: snap.total_agents,
      };
    }

    // Reconstruct from memes created on or before the timestamp
    const memesAtTime: Meme[] = [];
    for (const meme of this.memes.values()) {
      if (
        meme.community_tags.includes(community) &&
        meme.created_at <= at
      ) {
        memesAtTime.push(meme);
      }
    }

    // Also include extinct memes that were active at the time
    for (const record of this.extinctMemes.values()) {
      if (
        record.meme.community_tags.includes(community) &&
        record.meme.created_at <= at &&
        record.extinct_at > at
      ) {
        memesAtTime.push(record.meme);
      }
    }

    return {
      community_id: community,
      captured_at: at,
      memes: memesAtTime,
      divergence_indices: new Map(),
      total_agents: 0, // unknown for reconstructed snapshots
    };
  }

  // ─── getLineageTree ─────────────────────────────────────────────────

  /**
   * Get the lineage tree of a meme to a given depth.
   *
   * Builds a tree by following parent_ids in lineage records.
   * Each node contains the meme and its children (descendants).
   * Depth 0 returns just the meme itself with no children.
   */
  getLineageTree(meme: Meme, depth: number): VariationTree {
    return this.buildLineageTree(meme, depth);
  }

  // ─── markExtinct ────────────────────────────────────────────────────

  /**
   * Mark a meme as extinct with a reason.
   * The meme is moved from the active store to the extinction archive.
   * Extinct memes remain retrievable for cultural archaeology.
   */
  markExtinct(meme: Meme, reason: string): void {
    this.extinctMemes.set(meme.id, {
      meme,
      reason,
      extinct_at: this.env.nowTimestamp(),
    });

    // Remove from active store
    this.memes.delete(meme.id);
  }

  // ─── searchBySimilarity ─────────────────────────────────────────────

  /**
   * Search for memes similar to a query meme within a threshold.
   *
   * Uses MemeCodec.distance() to compute semantic distance.
   * Returns all memes whose distance from the query is <= threshold.
   * Results are sorted by distance (most similar first).
   */
  searchBySimilarity(query: Meme, threshold: number): Meme[] {
    if (threshold < 0 || threshold > 1) {
      throw new Error('searchBySimilarity() requires threshold ∈ [0, 1]');
    }

    const results: Array<{ meme: Meme; distance: number }> = [];

    for (const meme of this.memes.values()) {
      if (meme.id === query.id) continue; // skip self
      const distance = this.codec.distance(query, meme);
      if (distance <= threshold) {
        results.push({ meme, distance });
      }
    }

    // Sort by distance ascending (most similar first)
    results.sort((a, b) => a.distance - b.distance);
    return results.map(r => r.meme);
  }

  // ─── Public Accessors (for testing / integration) ──────────────────

  /** Capture a snapshot of a community's current meme pool */
  captureSnapshot(community: CommunityId, totalAgents: number): void {
    const memeIds: MemeId[] = [];
    for (const meme of this.memes.values()) {
      if (meme.community_tags.includes(community)) {
        memeIds.push(meme.id);
      }
    }

    this.snapshots.push({
      community_id: community,
      captured_at: this.env.nowTimestamp(),
      meme_ids: memeIds,
      total_agents: totalAgents,
    });
  }

  /** Check if a meme is marked as extinct */
  isExtinct(memeId: MemeId): boolean {
    return this.extinctMemes.has(memeId);
  }

  /** Get the extinction reason for a meme */
  getExtinctionReason(memeId: MemeId): string | null {
    const record = this.extinctMemes.get(memeId);
    return record ? record.reason : null;
  }

  /** Get count of active memes */
  getActiveMemeCount(): number {
    return this.memes.size;
  }

  /** Get count of extinct memes */
  getExtinctMemeCount(): number {
    return this.extinctMemes.size;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  /**
   * Check if a meme matches the given filter criteria.
   */
  private matchesFilter(meme: Meme, filter: MemeFilter): boolean {
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(meme.type)) return false;
    }

    if (filter.min_prevalence !== undefined) {
      if (meme.fitness.current_prevalence < filter.min_prevalence) return false;
    }

    if (filter.min_longevity !== undefined) {
      if (meme.fitness.longevity < filter.min_longevity) return false;
    }

    if (filter.community_id !== undefined) {
      if (!meme.community_tags.includes(filter.community_id)) return false;
    }

    return true;
  }

  /**
   * Recursively build lineage tree by finding children (memes whose
   * parent_ids include the current meme's ID).
   */
  private buildLineageTree(meme: Meme, depth: number): VariationTreeNode {
    if (depth <= 0) {
      return { meme, children: [] };
    }

    // Find all memes that list this meme as a parent
    const children: VariationTreeNode[] = [];
    for (const candidate of this.memes.values()) {
      if (candidate.lineage.parent_ids.includes(meme.id)) {
        children.push(this.buildLineageTree(candidate, depth - 1));
      }
    }

    // Also check extinct memes for complete lineage
    for (const record of this.extinctMemes.values()) {
      if (record.meme.lineage.parent_ids.includes(meme.id)) {
        children.push(this.buildLineageTree(record.meme, depth - 1));
      }
    }

    return { meme, children };
  }
}
