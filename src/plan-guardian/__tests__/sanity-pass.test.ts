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
      proposedCard: `---
parent: plan/root.md
root: plan/root.md
---
# 0.1 Task [PLAN]`,
    };

    const pass = await runSanityPass(providerReturning('PASS'), input, 256);
    expect(pass.pass).toBe(true);

    const failMissingFrontmatter = await runSanityPass(providerReturning('PASS'), {
      ...input,
      proposedCard: '# 0.1 Task [PLAN]',
    }, 256);
    expect(failMissingFrontmatter.pass).toBe(false);

    const failSentinel = await runSanityPass(providerReturning('PASS'), {
      ...input,
      proposedCard: `---
parent: plan/root.md
root: plan/root.md
---
# 0.1 Task [PLAN]
*** Begin Patch`,
    }, 256);
    expect(failSentinel.pass).toBe(false);
  });

  it('preserves required root and parent metadata from old card', async () => {
    const oldCard = `---
parent: plan/root.md
root: plan/root.md
---
# 0.1 Task [PLAN]`;

    const changedParent = await runSanityPass(providerReturning('PASS'), {
      path: 'plan/0.1-task.md',
      oldCard,
      proposedCard: `---
parent: plan/0.0-other.md
root: plan/root.md
---
# 0.1 Task [PLAN]`,
    }, 256);

    expect(changedParent.pass).toBe(false);
    expect(changedParent.raw).toContain('changed parent');
  });

  it('does not depend on model output for valid cards', async () => {
    const result = await runSanityPass(providerReturning('We need to validate PROPOSED CARD against rules.'), {
      path: 'plan/0.7.3.2.1-conduct-peer-review.md',
      oldCard: `---
parent: plan/0.7.3.2-peer-review.md
root: plan/root.md
children:
  - plan/0.7.3.2.1.1-schedule-review.md
---
# 0.7.3.2.1 Conduct Peer Review [PLAN]`,
      proposedCard: `---
parent: plan/0.7.3.2-peer-review.md
root: plan/root.md
children:
  - plan/0.7.3.2.1.1-schedule-review.md
---
# 0.7.3.2.1 Conduct Peer Review [DONE]`,
    }, 256);

    expect(result.pass).toBe(true);
    expect(result.raw).toBe('PASS');
  });
});
