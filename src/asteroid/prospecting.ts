/**
 * Asteroid Prospecting & Selection
 * Domain: 0.4.1.2 — Subsystem 1
 *
 * Selects optimal asteroid candidates by resource-per-delta-v ratio.
 */

import type { AsteroidCandidate, ProspectingResult, ResourceMap } from './types.js';
import { TOP_N_CANDIDATES } from './constants.js';

/**
 * Compute total extractable resource mass from a ResourceMap (kg).
 */
export function totalResourceMass(comp: ResourceMap): number {
  const { metals, volatiles, silicates, carbonaceous } = comp;
  return (
    metals.iron +
    metals.nickel +
    metals.platinum_group +
    volatiles.water_ice +
    volatiles.co2 +
    volatiles.ammonia +
    silicates +
    carbonaceous
  );
}

/**
 * Compute resource-per-delta-v score for a candidate.
 * Higher is better: more resource mass per unit delta-v cost.
 * Includes accessibility as a weighting factor.
 */
export function resourcePerDeltaV(candidate: AsteroidCandidate): number {
  const mass = totalResourceMass(candidate.estimatedComposition);
  if (candidate.deltaVCost <= 0) return Infinity;
  return (mass * candidate.accessibilityScore) / candidate.deltaVCost;
}

/**
 * Select top-N asteroid candidates by resource-per-delta-v ratio.
 *
 * Algorithm:
 * 1. Score each candidate: (totalResourceMass * accessibilityScore) / deltaVCost
 * 2. Sort descending by score
 * 3. Return top N
 *
 * This greedy ranking matches the optimal selection for independent candidates
 * (no interaction effects between selections).
 */
export function selectTopCandidates(
  catalog: AsteroidCandidate[],
  topN: number = TOP_N_CANDIDATES,
): ProspectingResult {
  if (topN <= 0) {
    throw new RangeError('topN must be > 0');
  }

  const scored = catalog.map((c) => ({
    candidate: c,
    score: resourcePerDeltaV(c),
  }));

  scored.sort((a, b) => b.score - a.score);

  return {
    rankedCandidates: scored.slice(0, topN).map((s) => s.candidate),
    selectionMetric: 'resource_per_delta_v',
  };
}
