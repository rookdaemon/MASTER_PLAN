import { describe, expect, it } from 'vitest';
import { classifyChange } from '../change-classifier.js';
import { assessProposalPolicy } from '../proposal-policy.js';

describe('single-maintainer proposal policy', () => {
  it('automatically accepts bounded behavior-covered code and test changes after checks', () => {
    const classification = classifyChange([
      { path: 'src/example.ts', additions: 4, deletions: 0 },
      { path: 'src/example.test.ts', additions: 8, deletions: 0 },
    ]);
    expect(assessProposalPolicy(classification, 7)).toMatchObject({
      allowed: true,
      risk: 'routine',
      mergeMode: 'automatic',
      agentReviewRequired: true,
    });
  });

  it('allows a protected change only as one manually merged commit', () => {
    const classification = classifyChange([
      { path: '.github/workflows/ci.yml', additions: 2, deletions: 1 },
    ]);
    expect(assessProposalPolicy(classification, 1)).toMatchObject({
      allowed: true,
      risk: 'protected',
      mergeMode: 'manual',
      agentReviewRequired: true,
    });
    const rejected = assessProposalPolicy(classification, 2);
    expect(rejected.allowed).toBe(false);
    expect(rejected.reasons.join(' ')).toMatch(/exactly one commit/i);
  });

  it('treats agent instructions as governance rather than routine code', () => {
    const classification = classifyChange([{ path: 'AGENTS.md', additions: 3, deletions: 1 }]);
    expect(classification.domains).toContain('governance');
    expect(assessProposalPolicy(classification, 1).mergeMode).toBe('manual');
  });

  it('keeps untested or destructive routine code out of automatic merge', () => {
    for (const files of [
      [{ path: 'src/example.ts', additions: 4, deletions: 0 }],
      [
        { path: 'src/example.ts', additions: 1, deletions: 4 },
        { path: 'src/example.test.ts', additions: 1, deletions: 0 },
      ],
    ]) {
      expect(assessProposalPolicy(classifyChange(files), 1)).toMatchObject({
        allowed: true,
        mergeMode: 'manual',
      });
    }
  });
});
