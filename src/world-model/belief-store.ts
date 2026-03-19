/**
 * In-memory implementation of IBeliefStore (0.3.1.5.5)
 *
 * Manages propositional beliefs with confidence levels, source provenance,
 * timestamps, and domain tags. Enforces revision policies and contradiction
 * detection as specified in the plan.
 */

import type { Timestamp } from '../conscious-core/types.js';
import type {
  BeliefId,
  Belief,
  BeliefSource,
  BeliefRevision,
  BeliefContradiction,
} from './types.js';
import type { IBeliefStore } from './interfaces.js';

let beliefCounter = 0;

function nextBeliefId(): BeliefId {
  return `belief-${++beliefCounter}-${Date.now()}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export class BeliefStore implements IBeliefStore {
  private readonly beliefs = new Map<BeliefId, Belief>();
  private readonly revisionHistory = new Map<BeliefId, BeliefRevision[]>();

  addBelief(
    content: string,
    confidence: number,
    source: BeliefSource,
    domainTags: string[],
  ): BeliefId {
    const now: Timestamp = Date.now();
    const id = nextBeliefId();
    const belief: Belief = {
      id,
      content,
      confidence: clamp01(confidence),
      source,
      createdAt: now,
      lastConfirmedAt: now,
      domainTags: [...domainTags],
    };
    this.beliefs.set(id, belief);
    this.revisionHistory.set(id, []);
    return id;
  }

  getBelief(id: BeliefId): Belief | null {
    return this.beliefs.get(id) ?? null;
  }

  getBeliefsByDomain(domainTags: string[]): Belief[] {
    if (domainTags.length === 0) return [];
    const tagSet = new Set(domainTags);
    const results: Belief[] = [];
    for (const belief of this.beliefs.values()) {
      if (belief.domainTags.some((t) => tagSet.has(t))) {
        results.push(belief);
      }
    }
    return results;
  }

  /**
   * Revision policy (from spec):
   * - Weak evidence (< 0.4) against high-confidence belief (>= 0.8): rejected
   * - Strong contradiction (delta > 0.4): updated
   * - Otherwise: flagged-uncertain, confidence averaged
   */
  revise(id: BeliefId, newConfidence: number, trigger: string): BeliefRevision {
    const existing = this.beliefs.get(id);
    if (existing == null) {
      throw new Error(`Belief ${id} not found`);
    }

    const now: Timestamp = Date.now();
    newConfidence = clamp01(newConfidence);
    const delta = Math.abs(existing.confidence - newConfidence);

    let resolution: BeliefRevision['resolution'];
    let finalConfidence: number;

    if (newConfidence < 0.4 && existing.confidence >= 0.8) {
      // Weak evidence against high-confidence belief: reject the revision
      // The high-confidence belief is protected from weak counter-evidence
      resolution = 'rejected';
      finalConfidence = existing.confidence;
    } else if (delta > 0.4) {
      // Strong contradiction (but not weak-vs-high): accept the update
      resolution = 'updated';
      finalConfidence = newConfidence;
    } else {
      // Moderate conflict: flag uncertain, average the confidences
      resolution = 'flagged-uncertain';
      finalConfidence = clamp01((existing.confidence + newConfidence) / 2);
    }

    const revision: BeliefRevision = {
      beliefId: id,
      previousConfidence: existing.confidence,
      newConfidence: finalConfidence,
      trigger,
      resolution,
      revisedAt: now,
    };

    // Update the belief in-place
    const updated: Belief = {
      ...existing,
      confidence: finalConfidence,
      lastConfirmedAt: now,
    };
    this.beliefs.set(id, updated);

    // Record the revision
    const history = this.revisionHistory.get(id) ?? [];
    history.push(revision);
    this.revisionHistory.set(id, history);

    return revision;
  }

  removeBelief(id: BeliefId): boolean {
    this.revisionHistory.delete(id);
    return this.beliefs.delete(id);
  }

  /**
   * Detect contradictions by checking all belief pairs for opposing content.
   * Uses simple heuristics: beliefs in the same domain with opposite confidence
   * directions or negation patterns.
   */
  detectContradictions(): BeliefContradiction[] {
    const contradictions: BeliefContradiction[] = [];
    const all = Array.from(this.beliefs.values());

    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;

        // Check for domain overlap (contradictions only meaningful within shared domains)
        const sharedDomains = a.domainTags.filter((t) => b.domainTags.includes(t));
        if (sharedDomains.length === 0) continue;

        // Heuristic: check for negation patterns
        const aLower = a.content.toLowerCase();
        const bLower = b.content.toLowerCase();
        const isNegation =
          (aLower.includes('not') && !bLower.includes('not') &&
            this.contentOverlap(aLower, bLower) > 0.5) ||
          (bLower.includes('not') && !aLower.includes('not') &&
            this.contentOverlap(aLower, bLower) > 0.5);

        // Heuristic: both high confidence but opposite statements
        const bothHighConfidence = a.confidence >= 0.6 && b.confidence >= 0.6;

        if (isNegation && bothHighConfidence) {
          const maxConfidence = Math.max(a.confidence, b.confidence);
          const severity: BeliefContradiction['severity'] =
            maxConfidence >= 0.9 ? 'high' :
            maxConfidence >= 0.7 ? 'medium' : 'low';

          contradictions.push({
            beliefIdA: a.id,
            beliefIdB: b.id,
            description: `Potential contradiction in domain(s) [${sharedDomains.join(', ')}]: "${a.content}" vs "${b.content}"`,
            severity,
          });
        }
      }
    }

    return contradictions;
  }

  getRevisionHistory(id: BeliefId): BeliefRevision[] {
    return [...(this.revisionHistory.get(id) ?? [])];
  }

  /** Word-overlap ratio between two strings (Jaccard similarity on words). */
  private contentOverlap(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
    if (wordsA.size === 0 && wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }
}
