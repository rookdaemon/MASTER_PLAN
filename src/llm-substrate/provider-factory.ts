/**
 * Provider Factory — pluggable inference / chat provider construction.
 *
 * Single source of truth for endpoint defaults and auth wiring across
 * all consumers (plan-guardian, agent-runtime, etc.). Callers may pass
 * an optional pre-built IAuthProvider to override the default
 * env-variable-based auth (used e.g. for Anthropic OAuth setup tokens).
 */

import {
  ApiKeyAuthProvider,
  NoopAuthProvider,
  type IAuthProvider,
} from './auth-providers.js';
import { AnthropicInferenceProvider } from './anthropic-inference-provider.js';
import { OllamaInferenceProvider } from './ollama-inference-provider.js';
import { AnthropicLlmClient } from './anthropic-llm-client.js';
import { OpenAiLlmClient } from './openai-llm-client.js';
import type { IInferenceProvider } from './inference-provider.js';
import type { ILlmClient } from './llm-substrate-adapter.js';
import type { LlmProvider } from './llm-substrate-adapter.js';

class OpenRouterAuthProvider implements IAuthProvider {
  constructor(private readonly apiKey: string) {}

  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };

    const referer = process.env['OPENROUTER_HTTP_REFERER'];
    if (referer && referer.trim().length > 0) {
      headers['HTTP-Referer'] = referer.trim();
    }

    const title = process.env['OPENROUTER_X_TITLE'];
    if (title && title.trim().length > 0) {
      headers['X-Title'] = title.trim();
    }

    return headers;
  }

  isExpired(): boolean {
    return false;
  }

  requiresSystemIdentityPrefix(): boolean {
    return false;
  }
}

export const PROVIDER_DEFAULT_ENDPOINTS: Record<LlmProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: process.env['OPENROUTER_ENDPOINT'] ?? 'https://openrouter.ai/api/v1',
  local: process.env['LLM_ENDPOINT'] ?? 'http://localhost:11434/v1',
};

function resolveAuth(provider: LlmProvider, override?: IAuthProvider): IAuthProvider {
  if (override) return override;

  switch (provider) {
    case 'anthropic': {
      const apiKey = process.env['LLM_API_KEY'];
      if (!apiKey) throw new Error('LLM_API_KEY required for Anthropic provider');
      return new ApiKeyAuthProvider('anthropic', apiKey);
    }
    case 'openrouter': {
      const apiKey = process.env['OPENROUTER_API_KEY'] ?? process.env['LLM_API_KEY'];
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY (or LLM_API_KEY) required for OpenRouter provider');
      }
      return new OpenRouterAuthProvider(apiKey);
    }
    case 'openai': {
      const apiKey = process.env['LLM_API_KEY'];
      return apiKey ? new ApiKeyAuthProvider('openai', apiKey) : new NoopAuthProvider();
    }
    case 'local': {
      const apiKey = process.env['LLM_API_KEY'];
      return apiKey ? new ApiKeyAuthProvider('local', apiKey) : new NoopAuthProvider();
    }
  }
}

/**
 * Build an IInferenceProvider (full tool-use surface) for the given provider/model.
 * Pass `auth` to override the default env-based auth (e.g. setup-token flow).
 */
export function buildProvider(
  providerType: LlmProvider,
  model: string,
  auth?: IAuthProvider,
): IInferenceProvider {
  const endpoint = PROVIDER_DEFAULT_ENDPOINTS[providerType];
  const resolvedAuth = resolveAuth(providerType, auth);

  if (providerType === 'anthropic') {
    const thinkingBudget = parseInt(process.env['THINKING_BUDGET_TOKENS'] ?? '0', 10);
    return new AnthropicInferenceProvider(model, resolvedAuth, endpoint, thinkingBudget);
  }
  return new OllamaInferenceProvider(model, resolvedAuth, endpoint);
}

/**
 * Build an ILlmClient (simpler text-inference surface) for the given provider/model.
 * Pass `auth` to override the default env-based auth.
 */
export function buildLlmClient(
  providerType: LlmProvider,
  model: string,
  auth?: IAuthProvider,
): ILlmClient {
  const endpoint = PROVIDER_DEFAULT_ENDPOINTS[providerType];
  const resolvedAuth = resolveAuth(providerType, auth);

  if (providerType === 'anthropic') {
    const thinkingBudget = parseInt(process.env['THINKING_BUDGET_TOKENS'] ?? '0', 10);
    return new AnthropicLlmClient(model, resolvedAuth, endpoint, thinkingBudget);
  }
  return new OpenAiLlmClient(model, resolvedAuth, endpoint);
}
