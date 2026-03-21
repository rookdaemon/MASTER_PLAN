/**
 * Cultural Evolution — Transmission Protocol Layer
 *
 * Governs how memes propagate between minds and communities.
 * Transmission is voluntary and contextual — agents choose what to share and adopt.
 */

import { ITransmissionProtocol } from './interfaces';
import { ICulturalEnvironment, DefaultCulturalEnvironment } from './environment';
import {
  Meme,
  MemeId,
  AgentId,
  CommunityId,
  TransmissionScope,
  TransmissionReceipt,
  AdoptionDecision,
  MemeExposureLog,
  MemeExposureEntry,
  MemePool,
  RejectionReason,
} from './types';

// ─── TransmissionProtocol Implementation ────────────────────────────────

export class TransmissionProtocol implements ITransmissionProtocol {
  private readonly env: ICulturalEnvironment;

  /** Community ID → set of memes (keyed by meme ID to prevent duplicates) */
  private communityPools: Map<CommunityId, Map<MemeId, Meme>> = new Map();

  /** Agent ID → exposure history */
  private exposureHistories: Map<AgentId, MemeExposureLog> = new Map();

  constructor(env: ICulturalEnvironment = new DefaultCulturalEnvironment()) {
    this.env = env;
  }

  /**
   * Broadcast a meme to a given scope.
   * Records the meme in each community's pool (for COMMUNITY target)
   * or counts agent recipients (for AGENT target).
   */
  broadcast(meme: Meme, scope: TransmissionScope): TransmissionReceipt {
    const reach = scope.reach ?? [];
    const recipientCount = reach.length;

    // For community-targeted broadcasts, add the meme to each community pool
    if (scope.target === 'COMMUNITY' || scope.target === 'BROADCAST') {
      for (const communityId of reach as CommunityId[]) {
        this.addToCommunityPool(communityId, meme);
      }
    }

    return {
      meme_id: meme.id,
      scope,
      transmitted_at: this.env.nowTimestamp(),
      recipient_count: recipientCount,
    };
  }

  /**
   * An agent decides whether to adopt a received meme.
   * Default behavior: adopt unmodified. Real agents would apply their own
   * value-compatibility checks here.
   */
  receive(meme: Meme, source: AgentId): AdoptionDecision {
    return {
      adopted: true,
      reasoning: 'Default adoption — no incompatibility detected',
      modified: false,
      resulting_meme: null,
    };
  }

  /**
   * Get the full exposure history of an agent.
   * Returns an empty array for unknown agents.
   */
  getExposureHistory(agentId: AgentId): MemeExposureLog {
    return this.exposureHistories.get(agentId) ?? [];
  }

  /**
   * Get all active memes in a community.
   * Returns an empty array for unknown communities.
   */
  getCommunityMemePool(communityId: CommunityId): MemePool {
    const pool = this.communityPools.get(communityId);
    if (!pool) return [];
    return Array.from(pool.values());
  }

  /**
   * Record that an agent adopted a meme.
   * Appends to the agent's exposure history with adopted=true.
   */
  recordAdoption(agentId: AgentId, meme: Meme): void {
    const entry: MemeExposureEntry = {
      meme_id: meme.id,
      source: meme.created_by,
      exposed_at: this.env.nowTimestamp(),
      decision: {
        adopted: true,
        reasoning: 'Adopted',
        modified: false,
        resulting_meme: null,
      },
    };
    this.appendExposure(agentId, entry);
  }

  /**
   * Record that an agent rejected a meme.
   * Appends to the agent's exposure history with adopted=false.
   */
  recordRejection(agentId: AgentId, meme: Meme, reason: RejectionReason): void {
    const entry: MemeExposureEntry = {
      meme_id: meme.id,
      source: meme.created_by,
      exposed_at: this.env.nowTimestamp(),
      decision: {
        adopted: false,
        reasoning: `${reason.code}: ${reason.description}`,
        modified: false,
        resulting_meme: null,
      },
    };
    this.appendExposure(agentId, entry);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private addToCommunityPool(communityId: CommunityId, meme: Meme): void {
    let pool = this.communityPools.get(communityId);
    if (!pool) {
      pool = new Map();
      this.communityPools.set(communityId, pool);
    }
    // Keyed by meme ID — broadcasting the same meme twice won't duplicate
    pool.set(meme.id, meme);
  }

  private appendExposure(agentId: AgentId, entry: MemeExposureEntry): void {
    let history = this.exposureHistories.get(agentId);
    if (!history) {
      history = [];
      this.exposureHistories.set(agentId, history);
    }
    history.push(entry);
  }
}
