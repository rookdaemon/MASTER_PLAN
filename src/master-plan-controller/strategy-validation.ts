import { evidenceValidationErrors } from './evidence.js';
import { assessHumanEscalation } from './escalation-policy.js';
import { isValidConstitutionalAmendment, isValidHumanApproval } from './human-authorization.js';
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

export function workPacketValidationErrors(
  packet: WorkPacket,
  state: StrategyState,
  now: Timestamp,
): string[] {
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
  if (!['autonomous', 'agent-reviewed', 'human-escalation'].includes(packet.authorityClass)) {
    errors.push(`${prefix} has an invalid authority class`);
  }
  if (packet.authorityClass === 'human-escalation') {
    const escalation = state.escalations.find(
      (candidate) => candidate.id === packet.escalationId && candidate.packetId === packet.id,
    );
    const assessedAt = Date.parse(escalation?.assessedAt ?? '');
    const evaluatedAt = Date.parse(now);
    const evidenceById = new Map(state.evidence.map((record) => [record.id, record]));
    if (!escalation || escalation.assessedBy !== 'escalation-policy' ||
        Number.isNaN(assessedAt) || Number.isNaN(evaluatedAt) || assessedAt > evaluatedAt ||
        !assessHumanEscalation(escalation, escalation.assessedAt, evidenceById).escalate) {
      errors.push(`${prefix} lacks a qualified persisted escalation assessment`);
    }
  }
  if (!Number.isSafeInteger(packet.attempt) || packet.attempt < 0) errors.push(`${prefix} has an invalid attempt`);
  if (packet.seriesId !== undefined || packet.runNumber !== undefined) {
    if (!packet.seriesId?.trim() || !Number.isSafeInteger(packet.runNumber) || packet.runNumber! < 1 ||
        packet.id !== `${packet.seriesId}-run-${packet.runNumber}`) {
      errors.push(`${prefix} has invalid recurrence data`);
    }
  }
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
    errors.push(...workPacketValidationErrors(packet, state, now));
    if (packetIds.has(packet.id)) errors.push(`Duplicate packet identity: ${packet.id}`);
    packetIds.add(packet.id);
  }
  for (const approval of state.approvals) {
    const escalation = state.escalations.find((candidate) => candidate.id === approval.escalationId);
    if (!escalation || !isValidHumanApproval(
      approval, escalation.packetId, now, escalation.id, escalation.assessedAt,
    )) errors.push(`Invalid servant-leader escalation approval: ${approval.id}`);
    if (!escalation) {
      errors.push(`Servant-leader approval is not bound to an escalation: ${approval.id}`);
    }
  }
  for (const amendment of state.constitution.amendments) {
    if (amendment.affectedNodeIds.length === 0 ||
        !amendment.affectedNodeIds.every((nodeId) => isValidConstitutionalAmendment(amendment, nodeId, now))) {
      errors.push(`Invalid constitutional amendment: ${amendment.id}`);
    }
  }
  if (state.governance.mode !== 'automated-stewardship') {
    errors.push('Governance mode is invalid');
  }
  if (!Number.isSafeInteger(state.governance.reviewedResultCount) || state.governance.reviewedResultCount < 0) {
    errors.push('Governance reviewed-result counter must be a non-negative integer');
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
