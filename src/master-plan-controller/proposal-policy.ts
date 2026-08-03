import type { ChangeClassification } from './change-classifier.js';

export interface ProposalPolicyAssessment {
  allowed: boolean;
  risk: 'routine' | 'protected';
  mergeMode: 'automatic' | 'manual';
  agentReviewRequired: true;
  reasons: string[];
}

export function assessProposalPolicy(
  classification: ChangeClassification,
  commitCount: number,
): ProposalPolicyAssessment {
  const protectedChange = classification.authority.authorityClass !== 'autonomous';
  if (protectedChange) {
    const validCommitCount = Number.isSafeInteger(commitCount) && commitCount === 1;
    return {
      allowed: validCommitCount,
      risk: 'protected',
      mergeMode: 'manual',
      agentReviewRequired: true,
      reasons: validCommitCount
        ? ['Protected changes require agent review and manual merge']
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
    mergeMode: automatic ? 'automatic' : 'manual',
    agentReviewRequired: true,
    reasons: automatic
      ? ['Bounded, backward-compatible behavior is covered by tests']
      : ['Routine change does not meet every automatic-merge safety condition'],
  };
}
