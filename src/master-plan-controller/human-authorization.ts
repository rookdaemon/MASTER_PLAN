import type { Approval, ConstitutionalAmendment, Timestamp } from './types.js';

function atOrBefore(value: Timestamp, now: Timestamp): boolean {
  const timestamp = Date.parse(value);
  const reference = Date.parse(now);
  return !Number.isNaN(timestamp) && !Number.isNaN(reference) && timestamp <= reference;
}

export function isValidHumanApproval(
  approval: Approval,
  scope: string,
  now: Timestamp,
  escalationId?: string,
  notBefore?: Timestamp,
): boolean {
  const approvedAt = Date.parse(approval.approvedAt);
  const earliest = notBefore === undefined ? approvedAt : Date.parse(notBefore);
  return approval.scope === scope &&
    (escalationId === undefined || approval.escalationId === escalationId) &&
    approval.approverRole === 'human' &&
    approval.approvedBy.trim().length > 0 &&
    !Number.isNaN(earliest) && approvedAt >= earliest &&
    atOrBefore(approval.approvedAt, now);
}

export function isValidConstitutionalAmendment(
  amendment: ConstitutionalAmendment,
  nodeId: string,
  now: Timestamp,
): boolean {
  return amendment.affectedNodeIds.includes(nodeId) &&
    amendment.approverRole === 'human' &&
    amendment.approvedBy.trim().length > 0 &&
    amendment.rationale.trim().length > 0 &&
    amendment.objections.length > 0 &&
    amendment.objections.every((objection) => objection.trim().length > 0) &&
    amendment.consequences.length > 0 &&
    amendment.consequences.every((consequence) => consequence.trim().length > 0) &&
    atOrBefore(amendment.approvedAt, now);
}
