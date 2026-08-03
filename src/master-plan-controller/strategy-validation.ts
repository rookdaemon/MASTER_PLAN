import { evidenceValidationErrors } from './evidence.js';
import { isValidConstitutionalAmendment, isValidHumanApproval } from './human-authorization.js';
import { shadowReviewErrors } from './rollout.js';
import type { ControllerConfig, Portfolio, StrategyState, Timestamp, WorkPacket } from './types.js';

const PORTFOLIOS: Portfolio[] = [
  'consciousness-epistemics',
  'near-term-preservation',
  'enabling-capabilities',
  'institutional-continuity',
];

function nonEmptyStrings(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function packetErrors(packet: WorkPacket, state: StrategyState, now: Timestamp): string[] {
  const errors: string[] = [];
  const prefix = `Packet ${packet.id || '<missing-id>'}`;
  for (const [label, value] of [
    ['id', packet.id], ['title', packet.title], ['owner', packet.owner],
    ['verification method', packet.verificationMethod], ['rollback', packet.rollback],
    ['retry signature', packet.retrySignature],
  ] as const) {
    if (typeof value !== 'string' || !value.trim()) errors.push(`${prefix} has no ${label}`);
  }
  if (!PORTFOLIOS.includes(packet.portfolio)) errors.push(`${prefix} has an invalid portfolio`);
  if (!nonEmptyStrings(packet.supportedDirectives)) errors.push(`${prefix} has no supported directives`);
  if (!nonEmptyStrings(packet.scope?.included)) errors.push(`${prefix} has no included scope`);
  if (!Array.isArray(packet.scope?.excluded)) errors.push(`${prefix} has invalid excluded scope`);
  if (!packet.budget || !packet.budget.unit?.trim() || !Number.isFinite(packet.budget.limit) || packet.budget.limit <= 0) {
    errors.push(`${prefix} has an invalid budget`);
  }
  for (const [label, value] of [
    ['deliverable', packet.deliverables],
    ['test or preregistration', packet.testsOrPreregistration],
    ['acceptance criterion', packet.acceptanceCriteria],
    ['authority reason', packet.authorityReasons],
  ] as const) {
    if (!nonEmptyStrings(value)) errors.push(`${prefix} has no ${label}`);
  }
  if (!['autonomous', 'human-reviewed-pr', 'explicit-authorization'].includes(packet.authorityClass)) {
    errors.push(`${prefix} has an invalid authority class`);
  }
  if (!Number.isSafeInteger(packet.attempt) || packet.attempt < 0) errors.push(`${prefix} has an invalid attempt`);
  const reviewedAt = Date.parse(packet.reviewedAt);
  if (Number.isNaN(reviewedAt) || reviewedAt > Date.parse(now)) errors.push(`${prefix} has an invalid review timestamp`);
  for (const [factor, value] of Object.entries(packet.priority)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`${prefix} priority ${factor} is outside 0..1`);
  }
  const node = state.nodes.find((candidate) => candidate.id === packet.nodeId);
  if (!node) errors.push(`${prefix} targets missing node ${packet.nodeId}`);
  else if (node.portfolio && node.portfolio !== packet.portfolio) errors.push(`${prefix} does not match its node portfolio`);
  return errors;
}

export function strategyContractErrors(
  state: StrategyState,
  config: ControllerConfig,
  now: Timestamp,
): string[] {
  const errors: string[] = [];
  const evidenceIds = new Set<string>();
  for (const evidence of state.evidence) {
    errors.push(...evidenceValidationErrors(state, evidence, now));
    if (evidenceIds.has(evidence.id)) errors.push(`Duplicate evidence identity: ${evidence.id}`);
    evidenceIds.add(evidence.id);
  }
  const packetIds = new Set<string>();
  for (const packet of state.packets) {
    errors.push(...packetErrors(packet, state, now));
    if (packetIds.has(packet.id)) errors.push(`Duplicate packet identity: ${packet.id}`);
    packetIds.add(packet.id);
  }
  for (const approval of state.approvals) {
    if (!isValidHumanApproval(approval, approval.scope, now)) errors.push(`Invalid human approval: ${approval.id}`);
  }
  for (const amendment of state.constitution.amendments) {
    if (amendment.affectedNodeIds.length === 0 ||
        !amendment.affectedNodeIds.every((nodeId) => isValidConstitutionalAmendment(amendment, nodeId, now))) {
      errors.push(`Invalid constitutional amendment: ${amendment.id}`);
    }
  }
  if (!['shadow', 'supervised', 'safe-code'].includes(state.governance.mode)) {
    errors.push('Governance mode is invalid');
  }
  if (!Number.isSafeInteger(state.governance.shadowCyclesReviewed) || state.governance.shadowCyclesReviewed < 0 ||
      !Number.isSafeInteger(state.governance.supervisedResultsReviewed) || state.governance.supervisedResultsReviewed < 0) {
    errors.push('Governance review counters must be non-negative integers');
  }
  errors.push(...shadowReviewErrors(state, state.governance.mode !== 'shadow'));
  if (state.governance.mode === 'safe-code') {
    if (state.governance.supervisedResultsReviewed < 1) {
      errors.push('Safe-code governance requires at least one supervised result review');
    }
    if (!state.approvals.some((approval) =>
      approval.id === 'safe-code-rollout' && isValidHumanApproval(approval, 'governance:safe-code', now))) {
      errors.push('Safe-code governance requires explicit human approval');
    }
  }
  if (state.governance.safeAutoMergeEnabled && state.governance.mode !== 'safe-code') {
    errors.push('Safe auto-merge can only be enabled in safe-code governance mode');
  }
  if (config.maxDecompositionDepth > 4 || config.maxDecompositionDepth < 0 ||
      !Number.isSafeInteger(config.maxDecompositionDepth)) {
    errors.push('Controller decomposition depth must be an integer from 0 through 4');
  }
  if (config.maxChildrenPerDecomposition > 5 || config.maxChildrenPerDecomposition < 1 ||
      !Number.isSafeInteger(config.maxChildrenPerDecomposition)) {
    errors.push('Controller decomposition children must be an integer from 1 through 5');
  }
  if (!Number.isFinite(config.verificationFreshnessMs) || config.verificationFreshnessMs <= 0) {
    errors.push('Controller verification freshness must be positive');
  }
  return [...new Set(errors)];
}
