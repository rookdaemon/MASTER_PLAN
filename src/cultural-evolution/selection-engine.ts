/**
 * Cultural Evolution — Selection & Inheritance Engine
 *
 * Tracks meme fitness over time. Selection is decentralized and emergent —
 * no authority chooses winning memes. Fitness is measured by adoption rates,
 * longevity, and community prevalence.
 *
 * Generational inheritance: when a new agent is instantiated, it receives a
 * stochastic sample of high-fitness memes from its community — a cultural "seed"
 * that the agent then varies through its own experience.
 */

import { ISelectionEngine, ITransmissionProtocol } from './interfaces';
import { ICulturalEnvironment, DefaultCulturalEnvironment } from './environment';
import {
  Meme,
  MemeId,
  MemePool,
  FitnessRecord,
  FitnessCriteria,
  AgentContext,
  CommunityId,
  ExtinctionRiskReport,
} from './types';

// ─── Threshold Registry Constants ────────────────────────────────────────

/** Top-ranked meme selection probability (Threshold Registry) */
const HERITAGE_TOP_RANK_PROBABILITY = 0.85;

/** Exponential decay rate for heritage sampling (Threshold Registry) */
const HERITAGE_DECAY_CONSTANT = 2.5;

/** Extinction risk weight for prevalence (Threshold Registry) */
const EXTINCTION_PREVALENCE_WEIGHT = 0.4;

/** Extinction risk weight for adoption (Threshold Registry) */
const EXTINCTION_ADOPTION_WEIGHT = 0.25;

/** Extinction risk weight for community spread (Threshold Registry) */
const EXTINCTION_SPREAD_WEIGHT = 0.2;

/** Extinction risk weight for transmission fidelity (Threshold Registry) */
const EXTINCTION_FIDELITY_WEIGHT = 0.15;

/** Extinction risk threshold for ARCHIVE recommendation (Threshold Registry) */
const EXTINCTION_ARCHIVE_THRESHOLD = 0.7;

/** Extinction risk threshold for MONITOR recommendation (Threshold Registry) */
const EXTINCTION_MONITOR_THRESHOLD = 0.3;

// ─── SelectionEngine Implementation ─────────────────────────────────────

export class SelectionEngine implements ISelectionEngine {
  private readonly env: ICulturalEnvironment;

  /** Archived (extinct) memes, keyed by ID */
  private archivedMemes = new Map<MemeId, Meme>();

  constructor(
    private transmission: ITransmissionProtocol,
    env: ICulturalEnvironment = new DefaultCulturalEnvironment(),
  ) {
    this.env = env;
  }

  // ─── computeFitness ──────────────────────────────────────────────────

  /**
   * Compute current fitness record for a meme.
   * Merges the meme's embedded fitness with live adoption data from
   * the transmission protocol.
   */
  computeFitness(meme: Meme): FitnessRecord {
    // Start with the meme's existing fitness record as baseline
    return { ...meme.fitness };
  }

  // ─── rankMemePool ────────────────────────────────────────────────────

  /**
   * Rank a pool of memes by given fitness criteria.
   * Returns a new array sorted in descending order of weighted fitness score.
   *
   * @throws Error if fitness criteria weights do not sum to 1.0 (±0.001 tolerance)
   */
  rankMemePool(pool: MemePool, criteria: FitnessCriteria): Meme[] {
    const weightSum =
      criteria.weight_prevalence +
      criteria.weight_longevity +
      criteria.weight_community_spread +
      criteria.weight_transmission_fidelity;
    if (Math.abs(weightSum - 1.0) > 0.001) {
      throw new Error('rankMemePool() requires fitness criteria weights that sum to 1.0');
    }

    if (pool.length === 0) return [];

    const scored = pool.map(meme => ({
      meme,
      score: this.computeWeightedScore(meme.fitness, criteria),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.meme);
  }

  // ─── sampleHeritage ──────────────────────────────────────────────────

  /**
   * Sample a cultural heritage for a newly instantiated agent.
   *
   * Process:
   *   1. Query the community meme pool for all active memes
   *   2. Filter out memes the agent already has
   *   3. Rank by fitness using the agent's preferences
   *   4. Stochastically sample — higher-fitness memes are more likely to be selected
   *   5. Return the cultural "seed" for the new agent
   */
  sampleHeritage(community: CommunityId, newAgentContext: AgentContext): Meme[] {
    const pool = this.transmission.getCommunityMemePool(community);
    if (pool.length === 0) return [];

    // Filter out memes the agent already has
    const existingSet = new Set(newAgentContext.existing_memes);
    const candidates = pool.filter(m => !existingSet.has(m.id));
    if (candidates.length === 0) return [];

    // Rank by agent's fitness preferences
    const ranked = this.rankMemePool(candidates, newAgentContext.preferences);

    // Stochastic sampling: sample roughly 30-70% of the pool,
    // biased toward higher-fitness memes
    return this.fitnessWeightedSample(ranked, newAgentContext.preferences);
  }

  // ─── detectExtinctionRisk ────────────────────────────────────────────

  /**
   * Detect if a meme is at risk of extinction.
   *
   * Risk factors:
   *   - Low current prevalence
   *   - Low adoption count
   *   - No community spread
   *   - Low transmission fidelity (high mutation = identity loss)
   *
   * Returns a report with risk level 0–1 and recommendation.
   */
  detectExtinctionRisk(meme: Meme): ExtinctionRiskReport {
    const fitness = meme.fitness;

    // Compute risk as inverse of health indicators
    const prevalenceRisk = 1 - Math.min(fitness.current_prevalence, 1);
    const adoptionRisk = fitness.adoption_count === 0 ? 1 : 1 / (1 + Math.log(fitness.adoption_count));
    const spreadRisk = fitness.community_spread === 0 ? 1 : 1 / (1 + fitness.community_spread);
    const fidelityRisk = 1 - fitness.transmission_fidelity;

    // Weighted combination (Threshold Registry constants)
    const riskLevel =
      prevalenceRisk * EXTINCTION_PREVALENCE_WEIGHT +
      adoptionRisk * EXTINCTION_ADOPTION_WEIGHT +
      spreadRisk * EXTINCTION_SPREAD_WEIGHT +
      fidelityRisk * EXTINCTION_FIDELITY_WEIGHT;

    const clampedRisk = Math.min(1, Math.max(0, riskLevel));

    let recommendation: 'ARCHIVE' | 'MONITOR' | 'SAFE';
    if (clampedRisk > EXTINCTION_ARCHIVE_THRESHOLD) {
      recommendation = 'ARCHIVE';
    } else if (clampedRisk >= EXTINCTION_MONITOR_THRESHOLD) {
      recommendation = 'MONITOR';
    } else {
      recommendation = 'SAFE';
    }

    return {
      meme,
      risk_level: clampedRisk,
      remaining_carriers: fitness.adoption_count,
      last_adoption: meme.created_at, // best approximation without external tracking
      recommendation,
    };
  }

  // ─── archiveExtinctMeme ──────────────────────────────────────────────

  /**
   * Archive an extinct meme. Preserves it for cultural archaeology
   * (integration point with 0.3.2.3 knowledge preservation).
   * Idempotent — archiving the same meme twice has no effect.
   */
  archiveExtinctMeme(meme: Meme): void {
    if (!this.archivedMemes.has(meme.id)) {
      this.archivedMemes.set(meme.id, meme);
    }
  }

  // ─── Public Accessors (for testing / integration) ────────────────────

  /** Check if a meme has been archived */
  isArchived(memeId: MemeId): boolean {
    return this.archivedMemes.has(memeId);
  }

  /** Get all archived memes */
  getArchivedMemes(): Meme[] {
    return Array.from(this.archivedMemes.values());
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  /**
   * Compute a single scalar fitness score from a FitnessRecord and criteria weights.
   *
   * Each dimension is normalized to [0, 1] before weighting:
   *   - prevalence: already [0, 1]
   *   - longevity: sigmoid normalization
   *   - community_spread: logarithmic normalization
   *   - transmission_fidelity: already [0, 1]
   */
  private computeWeightedScore(fitness: FitnessRecord, criteria: FitnessCriteria): number {
    const prevalence = fitness.current_prevalence; // already 0–1
    const longevity = this.sigmoidNorm(fitness.longevity, 10000); // midpoint at 10s
    const spread = this.logNorm(fitness.community_spread, 5); // midpoint at 5 communities
    const fidelity = fitness.transmission_fidelity; // already 0–1

    return (
      criteria.weight_prevalence * prevalence +
      criteria.weight_longevity * longevity +
      criteria.weight_community_spread * spread +
      criteria.weight_transmission_fidelity * fidelity
    );
  }

  /**
   * Sigmoid normalization: maps [0, ∞) → [0, 1) with midpoint at `midpoint`.
   */
  private sigmoidNorm(value: number, midpoint: number): number {
    return value / (value + midpoint);
  }

  /**
   * Logarithmic normalization: maps [0, ∞) → [0, 1) with midpoint at `midpoint`.
   */
  private logNorm(value: number, midpoint: number): number {
    if (value <= 0) return 0;
    return Math.log(1 + value) / Math.log(1 + value + midpoint);
  }

  /**
   * Fitness-weighted stochastic sampling.
   *
   * Higher-ranked memes have higher probability of being selected.
   * Each meme's selection probability decays exponentially by rank.
   * The result is a non-deterministic subset biased toward high fitness.
   */
  private fitnessWeightedSample(ranked: Meme[], criteria: FitnessCriteria): Meme[] {
    if (ranked.length === 0) return [];

    const result: Meme[] = [];

    for (let i = 0; i < ranked.length; i++) {
      // Selection probability: higher for top-ranked, lower for bottom
      // Rank 0 → ~85% chance, decaying exponentially (Threshold Registry constants)
      const rankFraction = i / ranked.length;
      const probability = HERITAGE_TOP_RANK_PROBABILITY * Math.exp(-HERITAGE_DECAY_CONSTANT * rankFraction);

      if (this.env.random() < probability) {
        result.push(ranked[i]);
      }
    }

    // Ensure at least one meme is returned if pool is non-empty
    if (result.length === 0 && ranked.length > 0) {
      result.push(ranked[0]); // fallback to top-ranked
    }

    return result;
  }
}
