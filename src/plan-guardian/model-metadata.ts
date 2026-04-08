/**
 * Model metadata lookup + budget derivation.
 *
 * Purpose:
 * - query pricing/context/rate hints when available (OpenRouter)
 * - derive safer concurrency and max-tokens settings for planner calls
 */

import type { LlmProvider } from './cli.js';

export interface ModelPricing {
  promptUsdPerToken?: number;
  completionUsdPerToken?: number;
}

export interface ModelRateLimits {
  requestsPerMinute?: number;
  requestsPerDay?: number;
}

export interface ModelMetadata {
  provider: LlmProvider;
  modelId: string;
  contextWindowTokens?: number;
  pricing?: ModelPricing;
  rateLimits?: ModelRateLimits;
  source: 'openrouter' | 'static' | 'unknown';
  notes: string[];
}

export interface ExecutionBudget {
  concurrency: number;
  maxTokensPerCall: number;
  notes: string[];
}

const OPENROUTER_ENDPOINT = process.env['OPENROUTER_ENDPOINT'] ?? 'https://openrouter.ai/api/v1';

export async function fetchModelMetadata(
  provider: LlmProvider,
  modelId: string,
): Promise<ModelMetadata> {
  if (provider !== 'openrouter') {
    return {
      provider,
      modelId,
      source: 'static',
      notes: ['No remote metadata endpoint configured for this provider.'],
    };
  }

  const apiKey = process.env['OPENROUTER_API_KEY'] ?? process.env['LLM_API_KEY'];
  if (!apiKey) {
    return {
      provider,
      modelId,
      source: 'unknown',
      notes: ['OpenRouter API key missing; metadata lookup skipped.'],
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const notes: string[] = [];
  let contextWindowTokens: number | undefined;
  let pricing: ModelPricing | undefined;
  let rateLimits: ModelRateLimits | undefined;

  try {
    const modelResp = await fetch(`${OPENROUTER_ENDPOINT}/models`, { headers });
    if (modelResp.ok) {
      const payload = await modelResp.json() as {
        data?: Array<{
          id?: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
        }>;
      };
      const model = payload.data?.find(m => m.id === modelId);
      if (model) {
        contextWindowTokens = model.context_length;
        const prompt = parseFloat(model.pricing?.prompt ?? '');
        const completion = parseFloat(model.pricing?.completion ?? '');
        pricing = {
          promptUsdPerToken: Number.isFinite(prompt) ? prompt : undefined,
          completionUsdPerToken: Number.isFinite(completion) ? completion : undefined,
        };
      } else {
        notes.push('Model not found in OpenRouter model catalog response.');
      }
    } else {
      notes.push(`OpenRouter /models request failed: ${modelResp.status}`);
    }
  } catch (err) {
    notes.push(`OpenRouter /models lookup error: ${String(err)}`);
  }

  try {
    const keyResp = await fetch(`${OPENROUTER_ENDPOINT}/auth/key`, { headers });
    if (keyResp.ok) {
      const payload = await keyResp.json() as {
        data?: {
          rate_limit?: {
            requests?: number;
            interval?: string;
          };
          limit?: number;
        };
      };

      const req = payload.data?.rate_limit?.requests;
      const interval = payload.data?.rate_limit?.interval;
      if (typeof req === 'number') {
        if (interval?.toLowerCase().includes('minute')) {
          rateLimits = { ...(rateLimits ?? {}), requestsPerMinute: req };
        }
        if (interval?.toLowerCase().includes('day')) {
          rateLimits = { ...(rateLimits ?? {}), requestsPerDay: req };
        }
      }
      if (typeof payload.data?.limit === 'number') {
        rateLimits = { ...(rateLimits ?? {}), requestsPerDay: payload.data.limit };
      }
    } else {
      notes.push(`OpenRouter /auth/key request failed: ${keyResp.status}`);
    }
  } catch (err) {
    notes.push(`OpenRouter /auth/key lookup error: ${String(err)}`);
  }

  return {
    provider,
    modelId,
    contextWindowTokens,
    pricing,
    rateLimits,
    source: 'openrouter',
    notes,
  };
}

export function deriveExecutionBudget(
  requestedConcurrency: number,
  metadata: ModelMetadata,
): ExecutionBudget {
  let concurrency = Math.max(1, requestedConcurrency);
  let maxTokensPerCall = 4096;
  const notes: string[] = [];

  if (metadata.contextWindowTokens && metadata.contextWindowTokens > 0) {
    const contextCap = Math.floor(metadata.contextWindowTokens * 0.2);
    maxTokensPerCall = clamp(contextCap, 512, 4096);
    notes.push(`Max tokens derived from 20% of context window (${metadata.contextWindowTokens}).`);
  }

  const rpm = metadata.rateLimits?.requestsPerMinute;
  if (typeof rpm === 'number' && rpm > 0) {
    const suggested = Math.max(1, Math.floor(rpm / 2));
    if (suggested < concurrency) {
      notes.push(`Concurrency reduced from ${concurrency} to ${suggested} by rate-limit hint (${rpm} rpm).`);
      concurrency = suggested;
    }
  }

  const completionCost = metadata.pricing?.completionUsdPerToken;
  if (typeof completionCost === 'number' && completionCost > 0.000003) {
    const reduced = Math.max(1024, Math.floor(maxTokensPerCall * 0.75));
    if (reduced < maxTokensPerCall) {
      notes.push('Completion token price is elevated; reducing max tokens per call by 25%.');
      maxTokensPerCall = reduced;
    }
  }

  return { concurrency, maxTokensPerCall, notes };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
