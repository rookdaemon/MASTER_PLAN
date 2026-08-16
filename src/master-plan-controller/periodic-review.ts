import type { FileSystemPort } from './ports.js';
import { appendRepositoryJsonArrayItems } from './repository-json.js';
import type { ControllerConfig, Portfolio, StrategyState, Timestamp } from './types.js';

export type PeriodicReviewCadence = 'weekly' | 'quarterly';

const PORTFOLIOS: Portfolio[] = [
  'consciousness-epistemics',
  'near-term-preservation',
  'enabling-capabilities',
  'institutional-continuity',
];

export interface PeriodicReviewRecord {
  id: string;
  cadence: PeriodicReviewCadence;
  reviewedAt: Timestamp;
  reviewer: 'automated-periodic-review:v1';
  portfolio: {
    targetWeights: Record<Portfolio, number>;
    currentEffort: Record<Portfolio, number>;
    allocationGaps: Record<Portfolio, number>;
    neglectedPortfolios: Portfolio[];
    activePacketIds: string[];
  };
  evidenceStandards: null | {
    recordCount: number;
    meanStrength: number;
    staleEvidenceIds: string[];
    outcomeCounts: { positive: number; negative: number; null: number };
    recordsWithoutHypothesisEffect: string[];
  };
  constitutionalRisks: null | {
    constitutionVersion: string;
    directiveSet: string[];
    ethicalInvariantCount: number;
    approvedAmendmentCount: number;
    pendingAmendmentNodeIds: string[];
    openRisks: string[];
  };
  findings: string[];
  recommendations: string[];
}

export interface RepositoryPeriodicReviewResult {
  reviewId: string;
  appended: boolean;
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function validTimestamp(value: string): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function reviewId(cadence: PeriodicReviewCadence, now: Timestamp): string {
  return `periodic-review-${cadence}-${now.replace(/[:.]/g, '-')}`;
}

export function conductPeriodicReview(
  state: StrategyState,
  config: ControllerConfig,
  cadence: PeriodicReviewCadence,
  now: Timestamp,
): PeriodicReviewRecord {
  if (!validTimestamp(now)) throw new Error('A valid caller-supplied review timestamp is required');
  if (cadence !== 'weekly' && cadence !== 'quarterly') throw new Error('Periodic review cadence is invalid');

  const allocationGaps = Object.fromEntries(PORTFOLIOS.map((portfolio) => [
    portfolio,
    rounded(config.portfolioWeights[portfolio] - state.portfolioEffort[portfolio]),
  ])) as Record<Portfolio, number>;
  const neglectedPortfolios = PORTFOLIOS.filter((portfolio) => allocationGaps[portfolio] > 0.01);
  const activePacketIds = state.packets
    .filter((packet) => packet.lifecycle === 'active')
    .map((packet) => packet.id)
    .sort();
  const failedNodeIds = state.nodes
    .filter((node) => node.lifecycle === 'blocked' || node.lifecycle === 'invalidated')
    .map((node) => node.id)
    .sort();
  const findings = [
    neglectedPortfolios.length > 0
      ? `Portfolio effort is below target by more than 0.01 for: ${neglectedPortfolios.join(', ')}.`
      : 'Portfolio effort is within 0.01 of every configured target weight.',
    activePacketIds.length === 0
      ? 'No work packet is active; the controller must wait or select an eligible bounded packet.'
      : `Active packet count is ${activePacketIds.length}: ${activePacketIds.join(', ')}.`,
  ];
  if (failedNodeIds.length > 0) {
    findings.push(`Blocked or invalidated nodes require strategy adaptation: ${failedNodeIds.join(', ')}`);
  }

  let evidenceStandards: PeriodicReviewRecord['evidenceStandards'] = null;
  let constitutionalRisks: PeriodicReviewRecord['constitutionalRisks'] = null;
  if (cadence === 'quarterly') {
    const nowEpoch = Date.parse(now);
    const staleEvidenceIds = state.evidence
      .filter((evidence) => nowEpoch - Date.parse(evidence.observedAt) > config.staleEvidenceAfterMs)
      .map((evidence) => evidence.id)
      .sort();
    const outcomeCounts = { positive: 0, negative: 0, null: 0 };
    for (const evidence of state.evidence) outcomeCounts[evidence.outcome] += 1;
    const recordsWithoutHypothesisEffect = state.evidence
      .filter((evidence) => evidence.supportedHypotheses.length === 0 && evidence.falsifiedHypotheses.length === 0)
      .map((evidence) => evidence.id)
      .sort();
    evidenceStandards = {
      recordCount: state.evidence.length,
      meanStrength: state.evidence.length === 0
        ? 0
        : rounded(state.evidence.reduce((sum, evidence) => sum + evidence.strength, 0) / state.evidence.length),
      staleEvidenceIds,
      outcomeCounts,
      recordsWithoutHypothesisEffect,
    };
    findings.push(staleEvidenceIds.length > 0
      ? `Stale evidence requires refresh or an explicit limitation: ${staleEvidenceIds.join(', ')}.`
      : 'No evidence exceeds the configured staleness threshold.');
    findings.push(recordsWithoutHypothesisEffect.length > 0
      ? `Evidence without a hypothesis effect remains artifact or context evidence: ${recordsWithoutHypothesisEffect.join(', ')}.`
      : 'Every evidence record supports or falsifies at least one hypothesis.');

    const coveredAmendmentNodes = new Set(
      state.constitution.amendments.flatMap((amendment) => amendment.affectedNodeIds),
    );
    const pendingAmendmentNodeIds = state.nodes
      .filter((node) => node.constitutionalImpact === 'amendment' && !coveredAmendmentNodes.has(node.id))
      .map((node) => node.id)
      .sort();
    const openRisks = pendingAmendmentNodeIds.map(
      (nodeId) => `Node ${nodeId} declares amendment impact without an approved amendment covering it.`,
    );
    for (const amendment of state.constitution.amendments) {
      for (const objection of amendment.objections) {
        openRisks.push(`Approved amendment ${amendment.id} retains objection: ${objection}`);
      }
    }
    constitutionalRisks = {
      constitutionVersion: state.constitution.version,
      directiveSet: [...state.constitution.directives],
      ethicalInvariantCount: state.constitution.ethicalInvariants.length,
      approvedAmendmentCount: state.constitution.amendments.length,
      pendingAmendmentNodeIds,
      openRisks,
    };
    findings.push(openRisks.length > 0
      ? `Constitutional risks remain open: ${openRisks.length}.`
      : 'No unresolved constitutional risk was detected by deterministic checks.');
  }

  const recommendations = [
    ...(neglectedPortfolios.length > 0
      ? [`Prioritize eligible evidence-bearing work in: ${neglectedPortfolios.join(', ')}.`]
      : ['Preserve the configured portfolio balance while selecting the next bottleneck.']),
    ...(cadence === 'quarterly' && evidenceStandards && evidenceStandards.staleEvidenceIds.length > 0
      ? ['Generate bounded evidence-refresh candidates; do not silently treat stale evidence as current.']
      : []),
    ...(cadence === 'quarterly' && constitutionalRisks && constitutionalRisks.pendingAmendmentNodeIds.length > 0
      ? ['Keep amendment-impact nodes ineligible until an explicit servant-leader constitutional decision exists.']
      : []),
    ...(cadence === 'quarterly' && constitutionalRisks && constitutionalRisks.openRisks.length > 0
      ? ['Generate agent-reviewed mitigation candidates for open constitutional risks; escalate only an unresolved constitutional conflict.']
      : []),
  ];

  return {
    id: reviewId(cadence, now), cadence, reviewedAt: now, reviewer: 'automated-periodic-review:v1',
    portfolio: {
      targetWeights: structuredClone(config.portfolioWeights),
      currentEffort: structuredClone(state.portfolioEffort),
      allocationGaps,
      neglectedPortfolios,
      activePacketIds,
    },
    evidenceStandards,
    constitutionalRisks,
    findings,
    recommendations,
  };
}

export function periodicReviewValidationErrors(review: PeriodicReviewRecord, now: Timestamp): string[] {
  const errors: string[] = [];
  const prefix = `Periodic review ${review.id || '<missing-id>'}`;
  if (!review.id?.trim()) errors.push(`${prefix} has no identity`);
  if (review.cadence !== 'weekly' && review.cadence !== 'quarterly') errors.push(`${prefix} has an invalid cadence`);
  if (!validTimestamp(review.reviewedAt) || Date.parse(review.reviewedAt) > Date.parse(now)) {
    errors.push(`${prefix} has an invalid review timestamp`);
  }
  if (review.reviewer !== 'automated-periodic-review:v1') errors.push(`${prefix} has an invalid reviewer`);
  if (validTimestamp(review.reviewedAt) && review.id !== reviewId(review.cadence, review.reviewedAt)) {
    errors.push(`${prefix} identity does not match its cadence and timestamp`);
  }
  if (!review.portfolio || !PORTFOLIOS.every((portfolio) =>
    Number.isFinite(review.portfolio.targetWeights?.[portfolio]) &&
    Number.isFinite(review.portfolio.currentEffort?.[portfolio]) &&
    Number.isFinite(review.portfolio.allocationGaps?.[portfolio]))) {
    errors.push(`${prefix} has an invalid portfolio assessment`);
  }
  if (!Array.isArray(review.findings) || review.findings.length === 0) errors.push(`${prefix} has no findings`);
  if (!Array.isArray(review.recommendations) || review.recommendations.length === 0) {
    errors.push(`${prefix} has no recommendations`);
  }
  if (review.cadence === 'weekly' && (review.evidenceStandards !== null || review.constitutionalRisks !== null)) {
    errors.push(`${prefix} weekly scope improperly includes quarterly review fields`);
  }
  if (review.cadence === 'quarterly' && (!review.evidenceStandards || !review.constitutionalRisks)) {
    errors.push(`${prefix} lacks quarterly evidence or constitutional review`);
  }
  if (review.evidenceStandards && (
    !Number.isSafeInteger(review.evidenceStandards.recordCount) || review.evidenceStandards.recordCount < 0 ||
    !Number.isFinite(review.evidenceStandards.meanStrength) ||
    !Array.isArray(review.evidenceStandards.staleEvidenceIds) ||
    !Array.isArray(review.evidenceStandards.recordsWithoutHypothesisEffect)
  )) errors.push(`${prefix} has an invalid evidence assessment`);
  if (review.constitutionalRisks && (
    !review.constitutionalRisks.constitutionVersion?.trim() ||
    !Array.isArray(review.constitutionalRisks.directiveSet) ||
    !Array.isArray(review.constitutionalRisks.pendingAmendmentNodeIds) ||
    !Array.isArray(review.constitutionalRisks.openRisks)
  )) errors.push(`${prefix} has an invalid constitutional-risk assessment`);
  return errors;
}

export async function runRepositoryPeriodicReview(
  fileSystem: FileSystemPort,
  state: StrategyState,
  config: ControllerConfig,
  cadence: PeriodicReviewCadence,
  now: Timestamp,
): Promise<RepositoryPeriodicReviewResult> {
  const content = await fileSystem.readText('strategy/periodic-reviews.json');
  const existing = JSON.parse(content) as PeriodicReviewRecord[];
  if (!Array.isArray(existing)) throw new Error('Periodic review registry must be an array');
  const identities = new Set<string>();
  for (const review of existing) {
    const errors = periodicReviewValidationErrors(review, now);
    if (errors.length > 0) throw new Error(errors.join('; '));
    if (identities.has(review.id)) throw new Error(`Duplicate periodic review identity: ${review.id}`);
    identities.add(review.id);
  }
  const review = conductPeriodicReview(state, config, cadence, now);
  const prior = existing.find((candidate) => candidate.id === review.id);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(review)) {
      throw new Error(`Periodic review identity collides with different content: ${review.id}`);
    }
    return { reviewId: review.id, appended: false };
  }
  await fileSystem.writeText(
    'strategy/periodic-reviews.json',
    appendRepositoryJsonArrayItems(content, existing, [...existing, review]),
  );
  return { reviewId: review.id, appended: true };
}
