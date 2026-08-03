import type { ShadowCycleRecord, StrategyState, Timestamp } from './types.js';

export function shadowCycleFingerprint(cycle: ShadowCycleRecord): string {
  return [
    `cycle:${cycle.cycle}`,
    `observed:${cycle.observedAt}`,
    `frontier:${cycle.rankedFrontier.join(',')}`,
    `selected:${cycle.selectedPacketId ?? 'none'}`,
    `effects:${cycle.executed}/${cycle.merged}/${cycle.stateMutated}`,
  ].join('|');
}

export function shadowReviewErrors(state: StrategyState, requirePromotionMinimum = true): string[] {
  const reviews = state.shadowCycleReviews;
  const errors: string[] = [];
  if (reviews.length !== state.governance.shadowCyclesReviewed) {
    errors.push('Shadow-cycle review records must match the reviewed-cycle counter');
  }
  if (requirePromotionMinimum && reviews.length < 20) {
    errors.push('At least 20 shadow-cycle review records are required');
  }
  reviews.forEach((review, index) => {
    const cycle = state.shadowCycles[index];
    if (review.cycle !== index + 1) errors.push('Shadow-cycle reviews must cover consecutive cycles starting at 1');
    if (review.reviewerRole !== 'agent' || !review.reviewer.trim()) {
      errors.push(`Shadow cycle ${review.cycle} lacks an identified qualified reviewer`);
    }
    if (!review.reviewRunId.trim()) errors.push(`Shadow cycle ${review.cycle} lacks a reviewer run identity`);
    if (!cycle || review.cycle !== cycle.cycle || review.cycleObservedAt !== cycle.observedAt ||
        review.selectedPacketId !== cycle.selectedPacketId ||
        review.cycleFingerprint !== (cycle ? shadowCycleFingerprint(cycle) : '')) {
      errors.push(`Shadow cycle ${review.cycle} review is not bound to its source artifact`);
    }
    const selectedOwner = state.packets.find((packet) => packet.id === review.selectedPacketId)?.owner;
    if (selectedOwner && selectedOwner === review.reviewer) {
      errors.push(`Shadow cycle ${review.cycle} lacks an independent reviewer`);
    }
    if (Number.isNaN(Date.parse(review.cycleObservedAt)) || Number.isNaN(Date.parse(review.reviewedAt))) {
      errors.push(`Shadow cycle ${review.cycle} has an invalid timestamp`);
    } else if (Date.parse(review.reviewedAt) < Date.parse(review.cycleObservedAt)) {
      errors.push(`Shadow cycle ${review.cycle} was reviewed before it was observed`);
    }
    if (!review.useful || !review.nonChurning || review.decision !== 'accept' || !review.rationale.trim()) {
      errors.push(`Shadow cycle ${review.cycle} was not accepted as useful and non-churning`);
    }
  });
  return [...new Set(errors)];
}

export function safeAutoMergeFeatureEnabled(
  recordedRepositoryPolicyEnabled: boolean,
  externalRepositorySwitch: boolean,
): boolean {
  return recordedRepositoryPolicyEnabled && externalRepositorySwitch;
}

export function transitionGovernanceMode(
  state: StrategyState,
  target: StrategyState['governance']['mode'],
  now: Timestamp,
): StrategyState {
  if (Number.isNaN(Date.parse(now))) throw new Error('now must be an ISO timestamp');
  if (target === state.governance.mode) return state;
  if (state.governance.mode === 'shadow' && target === 'supervised') {
    const errors = shadowReviewErrors(state);
    if (errors.length > 0) throw new Error(errors.join('; '));
    return { ...state, governance: { ...state.governance, mode: target } };
  }
  if (state.governance.mode === 'supervised' && target === 'safe-code') {
    if (state.governance.supervisedResultsReviewed < 1) {
      throw new Error('Supervised results must be reviewed before safe-code mode');
    }
    return {
      ...state,
      governance: { ...state.governance, mode: target, safeAutoMergeEnabled: true },
    };
  }
  throw new Error(`Unsupported governance transition: ${state.governance.mode} -> ${target}`);
}
