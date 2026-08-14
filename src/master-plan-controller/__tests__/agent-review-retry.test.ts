import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript workflow modules intentionally have no TypeScript declaration file.
import { planAgentReviewRetry } from '../../../.github/scripts/plan-agent-review-retry.mjs';

const HEAD = '0123456789abcdef0123456789abcdef01234567';
const STRATEGIES = ['qwen3-8b-categories-v3', 'qwen3-4b-categories-v3'] as const;

function check(
  strategy: string,
  status: 'in_progress' | 'completed',
  conclusion: string | null,
  head = HEAD,
) {
  return {
    status,
    conclusion,
    external_id: `agent-review:pr:42:head:${head}:run:9001`,
    output: { title: strategy },
  };
}

describe('agent-review retry planning', () => {
  it('dispatches the primary strategy for a new exact head', () => {
    expect(planAgentReviewRetry({ prNumber: 42, headSha: HEAD, checks: [], strategies: STRATEGIES }))
      .toEqual({ action: 'dispatch', strategy: STRATEGIES[0], reason: 'untried-strategy' });
  });

  it('changes strategy after a failed exact-head attempt', () => {
    expect(planAgentReviewRetry({
      prNumber: 42,
      headSha: HEAD,
      checks: [check(STRATEGIES[0], 'completed', 'failure')],
      strategies: STRATEGIES,
    })).toEqual({ action: 'dispatch', strategy: STRATEGIES[1], reason: 'untried-strategy' });
  });

  it('stops after the bounded strategy budget is exhausted', () => {
    expect(planAgentReviewRetry({
      prNumber: 42,
      headSha: HEAD,
      checks: [
        check(STRATEGIES[0], 'completed', 'failure'),
        check(STRATEGIES[1], 'completed', 'failure'),
      ],
      strategies: STRATEGIES,
    })).toEqual({ action: 'none', strategy: null, reason: 'strategy-budget-exhausted' });
  });

  it('does not duplicate an active or successful exact-head review', () => {
    for (const existing of [
      check(STRATEGIES[0], 'in_progress', null),
      check(STRATEGIES[0], 'completed', 'success'),
      {
        status: 'completed', conclusion: 'success',
        external_id: `agent-review:pr:42:head:${HEAD}:run:8000`, output: {},
      },
    ]) {
      expect(planAgentReviewRetry({
        prNumber: 42, headSha: HEAD, checks: [existing], strategies: STRATEGIES,
      })).toMatchObject({ action: 'none' });
    }
  });

  it('permits a retry only when a new strategy signature is configured', () => {
    const oldFailure = check(STRATEGIES[0], 'completed', 'failure');
    const revisedStrategies = ['qwen3-8b-categories-v4', 'qwen3-4b-categories-v4'] as const;

    expect(planAgentReviewRetry({
      prNumber: 42, headSha: HEAD, checks: [oldFailure], strategies: revisedStrategies,
    })).toEqual({ action: 'dispatch', strategy: revisedStrategies[0], reason: 'untried-strategy' });
  });

  it('ignores malformed attestations and checks from another head', () => {
    expect(planAgentReviewRetry({
      prNumber: 42,
      headSha: HEAD,
      checks: [
        check(STRATEGIES[0], 'completed', 'failure', 'f'.repeat(40)),
        {
          status: 'completed', conclusion: 'failure', external_id: 'untrusted:malformed',
          output: { title: STRATEGIES[0] },
        },
      ],
      strategies: STRATEGIES,
    })).toEqual({ action: 'dispatch', strategy: STRATEGIES[0], reason: 'untried-strategy' });
  });
});
