import { describe, expect, it } from 'vitest';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';
import { buildSanityPassPrompt, runSanityPass } from '../sanity-pass.js';

function providerReturning(text: string): IInferenceProvider {
  return {
    async probe() { return { reachable: true, latencyMs: 1 }; },
    async infer(): Promise<InferenceResult> {
      return {
        text,
        toolCalls: [],
        promptTokens: 1,
        completionTokens: 1,
        latencyMs: 1,
      };
    },
  };
}

describe('sanity-pass', () => {
  it('builds prompt with RULES, OLD CARD, and PROPOSED CARD sections', () => {
    const prompt = buildSanityPassPrompt({
      path: 'plan/0.1-task.md',
      oldCard: 'old',
      proposedCard: 'new',
    });

    expect(prompt).toContain('RULES');
    expect(prompt).toContain('OLD CARD');
    expect(prompt).toContain('PROPOSED CARD');
    expect(prompt).toContain("exact string 'PASS'");
  });

  it('accepts only exact PASS', async () => {
    const input = {
      path: 'plan/0.1-task.md',
      oldCard: '<NONE>',
      proposedCard: '# 0.1 Task [PLAN]',
    };

    const pass = await runSanityPass(providerReturning('PASS'), input, 256);
    expect(pass.pass).toBe(true);

    const failLower = await runSanityPass(providerReturning('pass'), input, 256);
    expect(failLower.pass).toBe(false);

    const failVerbose = await runSanityPass(providerReturning('PASS\nLooks good'), input, 256);
    expect(failVerbose.pass).toBe(false);
  });
});
