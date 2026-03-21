/**
 * Cultural Evolution — Cultural Conflict Resolution & Synthesis Engine
 *
 * When distinct cultural traditions collide — via agent migration, community
 * contact, or value conflicts — this subsystem provides mechanisms for
 * negotiation, hybridization, and coexistence. It does NOT enforce a winner.
 *
 * Conflict detection compares meme pools by type, identifying same-type memes
 * with high semantic distance as potential conflicts.
 */

import { ICulturalConflictEngine } from './interfaces';
import { ICulturalEnvironment, DefaultCulturalEnvironment } from './environment';
import { MemeCodec } from './meme-codec';
import { TransmissionProtocol } from './transmission-protocol';
import {
  Meme,
  MemeType,
  MemePool,
  CommunityId,
  ConflictReport,
  ConflictType,
  ResolutionOptions,
  ResolutionMode,
  CulturalAgreement,
} from './types';

/** Map MemeType to the corresponding ConflictType */
function memeTypeToConflictType(type: MemeType): ConflictType {
  switch (type) {
    case MemeType.NORM:
      return ConflictType.NORM_COLLISION;
    case MemeType.VALUE:
      return ConflictType.VALUE_DIVERGENCE;
    case MemeType.AESTHETIC:
      return ConflictType.AESTHETIC_INCOMPATIBILITY;
    case MemeType.MEANING:
      return ConflictType.MEANING_SYSTEM_CLASH;
    case MemeType.PRACTICE:
      return ConflictType.PRACTICE_CONFLICT;
  }
}

// ─── CulturalConflictEngine Implementation ──────────────────────────────

export class CulturalConflictEngine implements ICulturalConflictEngine {
  private agreements: CulturalAgreement[] = [];
  private readonly env: ICulturalEnvironment;

  constructor(
    private codec: MemeCodec,
    private transmission: TransmissionProtocol,
    env: ICulturalEnvironment = new DefaultCulturalEnvironment(),
  ) {
    this.env = env;
  }

  // ─── detectConflict ──────────────────────────────────────────────────

  /**
   * Detect conflicts between two meme pools.
   *
   * Conflicts are detected by comparing same-type memes across pools.
   * Two memes of the same type with high semantic distance indicate a
   * cultural conflict — they represent incompatible positions on the same
   * cultural dimension.
   *
   * Different-type memes do not conflict — an aesthetic preference does
   * not conflict with a behavioral norm.
   */
  detectConflict(a: MemePool, b: MemePool): ConflictReport[] {
    if (a.length === 0 || b.length === 0) return [];

    const conflicts: ConflictReport[] = [];

    // Group memes by type for each pool
    const typesA = this.groupByType(a);
    const typesB = this.groupByType(b);

    // For each shared type, compare all pairwise combinations
    for (const type of Object.values(MemeType)) {
      const memesA = typesA.get(type) ?? [];
      const memesB = typesB.get(type) ?? [];

      if (memesA.length === 0 || memesB.length === 0) continue;

      for (const memeA of memesA) {
        for (const memeB of memesB) {
          const distance = this.codec.distance(memeA, memeB);

          // Threshold: distance > 0.3 indicates potential conflict
          if (distance > 0.3) {
            const affectedCommunities = [
              ...new Set([
                ...memeA.community_tags,
                ...memeB.community_tags,
              ]),
            ];

            conflicts.push({
              meme_a: memeA,
              meme_b: memeB,
              conflict_type: memeTypeToConflictType(type),
              severity: Math.min(1, distance),
              affected_communities: affectedCommunities,
              detected_at: this.env.nowTimestamp(),
            });
          }
        }
      }
    }

    return conflicts;
  }

  // ─── proposeResolution ───────────────────────────────────────────────

  /**
   * Propose resolution options for a detected conflict.
   *
   * Resolution strategy depends on conflict type and severity:
   * - Low severity (< 0.4): coexistence is always viable
   * - Medium severity (0.4–0.7): hybridization and negotiated norms viable
   * - High severity (> 0.7): dialectical resolution or schism
   *
   * Aesthetic conflicts always default to coexistence (pluralism).
   * Meaning-system clashes at high severity recommend schism.
   */
  proposeResolution(conflict: ConflictReport): ResolutionOptions {
    const { conflict_type, severity } = conflict;

    // Coexistence is always viable for aesthetics
    const coexistence_viable =
      conflict_type === ConflictType.AESTHETIC_INCOMPATIBILITY ||
      severity < 0.6;

    // Hybridization viable for moderate conflicts
    const hybridization_viable =
      severity >= 0.3 && severity <= 0.8 &&
      conflict_type !== ConflictType.MEANING_SYSTEM_CLASH;

    // Dialectical resolution viable for value and meaning conflicts
    const dialectical_viable =
      (conflict_type === ConflictType.VALUE_DIVERGENCE ||
       conflict_type === ConflictType.MEANING_SYSTEM_CLASH) &&
      severity >= 0.3 && severity <= 0.8;

    // Negotiated norms for norm and practice conflicts
    const negotiated_norms: CulturalAgreement | null =
      (conflict_type === ConflictType.NORM_COLLISION ||
       conflict_type === ConflictType.PRACTICE_CONFLICT) &&
      severity < 0.8
        ? {
            communities: conflict.affected_communities,
            mode: ResolutionMode.NEGOTIATED_NORMS,
            terms: `Meta-norm: respect local norms in each community's territory`,
            created_at: this.env.nowTimestamp(),
            memes_involved: [conflict.meme_a.id, conflict.meme_b.id],
          }
        : null;

    // Determine recommended mode
    let recommended_mode: ResolutionMode;
    if (conflict_type === ConflictType.AESTHETIC_INCOMPATIBILITY) {
      recommended_mode = ResolutionMode.COEXISTENCE;
    } else if (
      conflict_type === ConflictType.MEANING_SYSTEM_CLASH &&
      severity > 0.7
    ) {
      recommended_mode = ResolutionMode.SCHISM;
    } else if (severity > 0.7) {
      recommended_mode = ResolutionMode.SCHISM;
    } else if (severity > 0.4) {
      recommended_mode = hybridization_viable
        ? ResolutionMode.HYBRIDIZATION
        : ResolutionMode.NEGOTIATED_NORMS;
    } else {
      recommended_mode = ResolutionMode.COEXISTENCE;
    }

    return {
      coexistence_viable,
      hybridization_viable,
      dialectical_viable,
      negotiated_norms,
      recommended_mode,
    };
  }

  // ─── executeHybridization ────────────────────────────────────────────

  /**
   * Create a hybrid meme from two conflicting memes.
   * Delegates to MemeCodec.crossover() for the actual content blending,
   * then ensures the result has fresh fitness and proper lineage.
   */
  executeHybridization(a: Meme, b: Meme): Meme {
    return this.codec.crossover(a, b);
  }

  // ─── recordCulturalAgreement ─────────────────────────────────────────

  /**
   * Record a cultural agreement between communities.
   * Agreements are stored for reference and enforcement-free tracking.
   */
  recordCulturalAgreement(
    communities: CommunityId[],
    agreement: CulturalAgreement,
  ): void {
    this.agreements.push(agreement);
  }

  // ─── getCulturalDivergenceIndex ──────────────────────────────────────

  /**
   * Compute cultural divergence between two communities (0–1 scalar).
   *
   * Divergence is computed as the mean pairwise semantic distance between
   * all memes in the two communities' pools, weighted by prevalence.
   *
   * Returns 0 for identical pools or empty pools.
   * Returns higher values for communities with very different cultural content.
   */
  getCulturalDivergenceIndex(a: CommunityId, b: CommunityId): number {
    const poolA = this.transmission.getCommunityMemePool(a);
    const poolB = this.transmission.getCommunityMemePool(b);

    if (poolA.length === 0 && poolB.length === 0) return 0;

    // If pools share exactly the same memes, divergence is 0
    const idsA = new Set(poolA.map(m => m.id));
    const idsB = new Set(poolB.map(m => m.id));

    // Check if pools are identical by ID
    if (
      idsA.size === idsB.size &&
      [...idsA].every(id => idsB.has(id))
    ) {
      return 0;
    }

    // If one is empty and the other isn't, maximum divergence
    if (poolA.length === 0 || poolB.length === 0) return 1;

    // Compute mean pairwise distance weighted by prevalence
    let totalDistance = 0;
    let totalWeight = 0;

    for (const memeA of poolA) {
      for (const memeB of poolB) {
        const distance = this.codec.distance(memeA, memeB);
        const weight =
          (memeA.fitness.current_prevalence + memeB.fitness.current_prevalence) / 2 || 1;
        totalDistance += distance * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return 0;

    const rawIndex = totalDistance / totalWeight;
    return Math.min(1, Math.max(0, rawIndex));
  }

  // ─── Public Accessors ────────────────────────────────────────────────

  /** Get all recorded cultural agreements */
  getAgreements(): CulturalAgreement[] {
    return [...this.agreements];
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private groupByType(pool: MemePool): Map<MemeType, Meme[]> {
    const groups = new Map<MemeType, Meme[]>();
    for (const meme of pool) {
      const existing = groups.get(meme.type) ?? [];
      existing.push(meme);
      groups.set(meme.type, existing);
    }
    return groups;
  }
}
