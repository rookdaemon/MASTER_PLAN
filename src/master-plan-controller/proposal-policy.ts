import type { ChangeClassification } from './change-classifier.js';

export interface ProposalPolicyAssessment {
  allowed: boolean;
  risk: 'routine' | 'protected';
  mergeMode: 'automatic' | 'agent-controlled';
  agentReviewRequired: boolean;
  reasons: string[];
}

export function retainsExistingEvidence(baseText: string, headText: string): boolean {
  try {
    const base = JSON.parse(baseText) as unknown;
    const head = JSON.parse(headText) as unknown;
    if (!Array.isArray(base) || !Array.isArray(head)) return false;
    return base.every((existing) =>
      head.some((candidate) => JSON.stringify(candidate) === JSON.stringify(existing)));
  } catch {
    return false;
  }
}

export function assessProposalPolicy(
  classification: ChangeClassification,
  commitCount: number,
  evidenceRetentionVerified = false,
): ProposalPolicyAssessment {
  const evidenceChangedLines = classification.safeCodeCandidate.files.reduce(
    (sum, file) => sum + file.additions + file.deletions,
    0,
  );
  const boundedEvidenceOnly = classification.safeCodeCandidate.files.length > 0 &&
    classification.safeCodeCandidate.files.every((file) => file.path === 'strategy/evidence.json') &&
    classification.safeCodeCandidate.files.every((file) => file.deletions === 0) &&
    evidenceChangedLines <= 250 &&
    evidenceRetentionVerified;
  if (boundedEvidenceOnly) {
    return {
      allowed: true,
      risk: 'routine',
      mergeMode: 'automatic',
      agentReviewRequired: false,
      reasons: ['Bounded machine-generated evidence is verified by deterministic checks'],
    };
  }

  const protectedChange = classification.authority.authorityClass !== 'autonomous';
  if (protectedChange) {
    const validCommitCount = Number.isSafeInteger(commitCount) && commitCount === 1;
    return {
      allowed: validCommitCount,
      risk: 'protected',
      mergeMode: 'agent-controlled',
      agentReviewRequired: true,
      reasons: validCommitCount
        ? ['Protected changes require independent agent review and an agent-controlled merge']
        : ['A protected change must be confined to exactly one commit'],
    };
  }

  const candidate = classification.safeCodeCandidate;
  const changedLines = candidate.files.reduce(
    (sum, file) => sum + file.additions + file.deletions,
    0,
  );
  const automatic = candidate.files.length > 0 &&
    candidate.backwardCompatible &&
    candidate.behaviorCoveredByTests &&
    candidate.maximumChangedLines <= 500 &&
    changedLines <= candidate.maximumChangedLines;
  return {
    allowed: true,
    risk: 'routine',
    mergeMode: automatic ? 'automatic' : 'agent-controlled',
    agentReviewRequired: !automatic,
    reasons: automatic
      ? ['Bounded, backward-compatible behavior is covered by tests']
      : ['Routine change does not meet every automatic-merge safety condition'],
  };
}
