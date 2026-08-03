import type {
  AuthorityClass,
  AutomatedAttempt,
  BoundedHumanOperation,
  BoundedHumanDecision,
  EvidenceRecord,
  EscalationIssueKind,
  Timestamp,
} from './types.js';

export interface HumanEscalationRequest {
  kind: EscalationIssueKind;
  automationImpossibility: string;
  automatedAttempts: AutomatedAttempt[];
  decisionRequested: BoundedHumanDecision;
}

export interface HumanEscalationAssessment {
  escalate: boolean;
  authorityClass: Extract<AuthorityClass, 'agent-reviewed' | 'human-escalation'>;
  reasons: string[];
}

const INTRINSICALLY_HUMAN = new Set<EscalationIssueKind>([
  'owner-credential',
  'physical-presence',
  'legal-consent',
  'constitutional-conflict',
]);

const REQUIRED_OPERATION: Partial<Record<EscalationIssueKind, BoundedHumanOperation>> = {
  'owner-credential': 'provide-owner-credential',
  'physical-presence': 'perform-physical-act',
  'legal-consent': 'record-legal-consent',
  'constitutional-conflict': 'resolve-constitutional-conflict',
};

export function assessHumanEscalation(
  request: HumanEscalationRequest,
  assessedAt: Timestamp,
  availableEvidence: ReadonlyMap<string, Pick<EvidenceRecord, 'outcome' | 'observedAt'>>,
): HumanEscalationAssessment {
  const reasons: string[] = [];
  if (!INTRINSICALLY_HUMAN.has(request.kind)) {
    reasons.push(`${request.kind} remains the responsibility of the automated body`);
  }
  const descriptions = request.automatedAttempts.map((attempt) => attempt.description.trim());
  const evidence = request.automatedAttempts.map((attempt) => attempt.evidenceReference.trim());
  const assessmentEpoch = Date.parse(assessedAt);
  if (request.automatedAttempts.length < 2) reasons.push('At least two automated alternatives must be attempted');
  if (!request.automationImpossibility.trim()) reasons.push('Why automation cannot perform the act must be explicit');
  if (descriptions.some((item) => !item) || new Set(descriptions).size !== descriptions.length) {
    reasons.push('Automated alternatives must be nonempty and distinct');
  }
  if (evidence.some((item) => !item) || new Set(evidence).size !== evidence.length) {
    reasons.push('Each automated alternative requires distinct auditable evidence');
  }
  if (request.automatedAttempts.some((attempt) => attempt.outcome !== 'failed')) {
    reasons.push('Every automated alternative must have a recorded failed outcome');
  }
  if (Number.isNaN(assessmentEpoch) || request.automatedAttempts.some((attempt) => {
    const attemptedAt = Date.parse(attempt.attemptedAt);
    return Number.isNaN(attemptedAt) || attemptedAt > assessmentEpoch;
  })) {
    reasons.push('Every automated attempt must have a valid timestamp no later than assessment');
  }
  if (request.automatedAttempts.some((attempt) => {
    const record = availableEvidence.get(attempt.evidenceReference);
    const observedAt = Date.parse(record?.observedAt ?? '');
    const attemptedAt = Date.parse(attempt.attemptedAt);
    return !record || record.outcome !== 'negative' || Number.isNaN(observedAt) ||
      Number.isNaN(attemptedAt) || observedAt > attemptedAt;
  })) {
    reasons.push('Every automated failure must resolve by canonical ID to earlier persisted negative evidence');
  }
  const decision = request.decisionRequested;
  if (decision.operation !== REQUIRED_OPERATION[request.kind] || !decision.scope.trim() ||
      !decision.expectedOutput.trim() || decision.scope.trim() === '*') {
    reasons.push('Escalation must request the single structured operation for its issue with explicit scope and output');
  }
  const escalate = reasons.length === 0;
  return {
    escalate,
    authorityClass: escalate ? 'human-escalation' : 'agent-reviewed',
    reasons: escalate ? [`${request.kind} requires an intrinsically human act`] : reasons,
  };
}
