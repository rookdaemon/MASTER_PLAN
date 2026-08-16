import { describe, expect, it } from 'vitest';

// The reviewer executes this dependency-free module directly on the hosted runner.
// @ts-expect-error JavaScript workflow modules intentionally have no TypeScript declaration file.
import { normalizeAgentReviewResponse, parseAgentReviewResponseJson } from '../../../.github/scripts/normalize-agent-review-response.mjs';

describe('agent review response normalization', () => {
  it('preserves a canonical approval', () => {
    expect(normalizeAgentReviewResponse({
      verdict: 'approve',
      summary: 'No material blocker remains.',
      blockers: [],
    })).toEqual({
      verdict: 'approve',
      summary: 'No material blocker remains.',
      blockers: [],
    });
  });

  it('supplies a deterministic summary when constrained output leaves it empty', () => {
    expect(normalizeAgentReviewResponse({
      verdict: 'approve',
      summary: '',
      blockers: [],
    })).toEqual({
      verdict: 'approve',
      summary: 'The reviewer reported no material blockers.',
      blockers: [],
    });
  });

  it('supplies a deterministic summary when constrained output omits it', () => {
    expect(normalizeAgentReviewResponse({ verdict: 'approve', blockers: [] })).toEqual({
      verdict: 'approve',
      summary: 'The reviewer reported no material blockers.',
      blockers: [],
    });
  });

  it('normalizes the pinned reviewer all-none category response to approval', () => {
    expect(normalizeAgentReviewResponse({
      blockers: {
        security: 'none',
        policy: 'none',
        correctness: 'none',
        safety: 'none',
        material_omissions: 'none',
      },
    })).toEqual({
      verdict: 'approve',
      summary: 'The reviewer reported no material blockers.',
      blockers: [],
    });
  });

  it('normalizes nonempty category findings to a blocking verdict', () => {
    expect(normalizeAgentReviewResponse({
      blockers: {
        security: 'none',
        correctness: 'The changed branch skips exact-head validation.',
        safety: 'none',
      },
    })).toEqual({
      verdict: 'block',
      summary: 'The reviewer reported 1 material blocker.',
      blockers: ['correctness: The changed branch skips exact-head validation.'],
    });
  });

  it('repairs literal control characters inside constrained JSON string values', () => {
    expect(parseAgentReviewResponseJson(
      '{"blockers":{"security":"none","correctness":"line one\nline two"}}',
    )).toEqual({
      blockers: { security: 'none', correctness: 'line one\nline two' },
    });
  });

  it('fails closed when invalid JSON is not a control character inside a string', () => {
    expect(() => parseAgentReviewResponseJson('{"blockers":}')).toThrow();
  });

  it('fails closed for ambiguous or contradictory responses', () => {
    expect(() => normalizeAgentReviewResponse({ blockers: { security: '' } })).toThrow(/ambiguous/i);
    expect(() => normalizeAgentReviewResponse({
      verdict: 'approve', summary: 'Looks fine.', blockers: ['A material defect exists.'],
    })).toThrow(/contradictory/i);
    expect(() => normalizeAgentReviewResponse({ blockers: [] })).toThrow(/canonical/i);
  });
});
