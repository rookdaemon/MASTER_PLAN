import { describe, expect, it } from 'vitest';
import { classifyChange } from '../change-classifier.js';
import { assessProposalPolicy, retainsExistingEvidence } from '../proposal-policy.js';

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
      agentReviewRequired: false,
    });
  });

  it('allows a bounded protected commit series only through agent-controlled merge', () => {
    const classification = classifyChange([
      { path: '.github/workflows/ci.yml', additions: 2, deletions: 1 },
    ]);
    expect(assessProposalPolicy(classification, 12)).toMatchObject({
      allowed: true,
      risk: 'protected',
      mergeMode: 'agent-controlled',
      agentReviewRequired: true,
    });
    const rejected = assessProposalPolicy(classification, 13);
    expect(rejected.allowed).toBe(false);
    expect(rejected.reasons.join(' ')).toMatch(/at most twelve commits/i);
  });

  it('treats agent instructions as governance rather than routine code', () => {
    const classification = classifyChange([{ path: 'AGENTS.md', additions: 3, deletions: 1 }]);
    expect(classification.domains).toContain('governance');
    expect(assessProposalPolicy(classification, 1).mergeMode).toBe('agent-controlled');
  });

  it('automatically accepts bounded evidence-only updates after deterministic checks', () => {
    const classification = classifyChange([
      { path: 'strategy/evidence.json', additions: 51, deletions: 0 },
    ]);
    expect(assessProposalPolicy(classification, 4, true)).toMatchObject({
      allowed: true,
      risk: 'routine',
      mergeMode: 'automatic',
      agentReviewRequired: false,
    });
  });

  it('routes evidence deletion or mutation through agent-controlled review', () => {
    const base = JSON.stringify([{ id: 'existing', claim: 'original' }]);
    expect(retainsExistingEvidence(base, JSON.stringify([
      { id: 'existing', claim: 'original' },
      { id: 'new', claim: 'added' },
    ]))).toBe(true);
    expect(retainsExistingEvidence(base, JSON.stringify([
      { id: 'existing', claim: 'rewritten' },
    ]))).toBe(false);
    expect(retainsExistingEvidence(base, '[]')).toBe(false);
    expect(retainsExistingEvidence('not-json', '[]')).toBe(false);

    const deletion = classifyChange([
      { path: 'strategy/evidence.json', additions: 1, deletions: 1 },
    ]);
    expect(assessProposalPolicy(deletion, 1, true)).toMatchObject({
      mergeMode: 'agent-controlled',
      agentReviewRequired: true,
    });
    const appendWithoutRetentionProof = classifyChange([
      { path: 'strategy/evidence.json', additions: 1, deletions: 0 },
    ]);
    expect(assessProposalPolicy(appendWithoutRetentionProof, 1, false)).toMatchObject({
      mergeMode: 'agent-controlled',
      agentReviewRequired: true,
    });
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
        mergeMode: 'agent-controlled',
        agentReviewRequired: true,
      });
    }
  });
});
