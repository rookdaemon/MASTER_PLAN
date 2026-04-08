import { describe, it, expect } from 'vitest';
import { deriveExecutionBudget, type ModelMetadata } from '../model-metadata.js';

describe('deriveExecutionBudget', () => {
  it('keeps requested concurrency when no rate hints exist', () => {
    const metadata: ModelMetadata = {
      provider: 'local',
      modelId: 'gemma4:e4b',
      source: 'static',
      notes: [],
    };

    const budget = deriveExecutionBudget(7, metadata);
    expect(budget.concurrency).toBe(7);
    expect(budget.maxTokensPerCall).toBe(4096);
  });

  it('reduces concurrency from requestsPerMinute hint', () => {
    const metadata: ModelMetadata = {
      provider: 'openrouter',
      modelId: 'gpt-oss-120b:free',
      source: 'openrouter',
      rateLimits: { requestsPerMinute: 6 },
      notes: [],
    };

    const budget = deriveExecutionBudget(20, metadata);
    expect(budget.concurrency).toBe(3);
  });

  it('derives max tokens from context window and pricing signal', () => {
    const metadata: ModelMetadata = {
      provider: 'openrouter',
      modelId: 'x',
      source: 'openrouter',
      contextWindowTokens: 32000,
      pricing: { completionUsdPerToken: 0.00001 },
      notes: [],
    };

    const budget = deriveExecutionBudget(5, metadata);
    // 20% of 32k => 6400, clamped to 4096, then reduced by 25% => 3072
    expect(budget.maxTokensPerCall).toBe(3072);
  });
});
