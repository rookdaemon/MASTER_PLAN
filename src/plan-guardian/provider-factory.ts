/**
 * Provider Factory — pluggable inference provider construction.
 *
 * Keeps endpoint/auth wiring in one place and lets CLI provider values map
 * to concrete implementations through a registry.
 */

import {
  ApiKeyAuthProvider,
  NoopAuthProvider,
  type IAuthProvider,
} from '../llm-substrate/auth-providers.js';
import { AnthropicInferenceProvider } from '../llm-substrate/anthropic-inference-provider.js';
import { OllamaInferenceProvider } from '../llm-substrate/ollama-inference-provider.js';
import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';
import type { LlmProvider } from './cli.js';

export interface ProviderFactory {
  create(model: string): IInferenceProvider;
}

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

const DEFAULT_ENDPOINTS: Record<LlmProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: process.env['OPENROUTER_ENDPOINT'] ?? 'https://openrouter.ai/api/v1',
  local: process.env['LLM_ENDPOINT'] ?? 'http://localhost:11434/v1',
};

function anthropicFactory(): ProviderFactory {
  return {
    create(model: string): IInferenceProvider {
      const endpoint = DEFAULT_ENDPOINTS.anthropic;
      const apiKey = process.env['LLM_API_KEY'];
      if (!apiKey) throw new Error('LLM_API_KEY required for Anthropic provider');
      const thinkingBudget = parseInt(process.env['THINKING_BUDGET_TOKENS'] ?? '0', 10);
      return new AnthropicInferenceProvider(
        model,
        new ApiKeyAuthProvider('anthropic', apiKey),
        endpoint,
        thinkingBudget,
      );
    },
  };
}

function openAiCompatibleFactory(provider: 'openai' | 'local'): ProviderFactory {
  return {
    create(model: string): IInferenceProvider {
      const endpoint = DEFAULT_ENDPOINTS[provider];
      const apiKey = process.env['LLM_API_KEY'];
      const auth = apiKey ? new ApiKeyAuthProvider(provider, apiKey) : new NoopAuthProvider();
      return new OllamaInferenceProvider(model, auth, endpoint);
    },
  };
}

function openRouterFactory(): ProviderFactory {
  return {
    create(model: string): IInferenceProvider {
      const endpoint = DEFAULT_ENDPOINTS.openrouter;
      const apiKey = process.env['OPENROUTER_API_KEY'] ?? process.env['LLM_API_KEY'];
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY (or LLM_API_KEY) required for OpenRouter provider');
      }
      return new OllamaInferenceProvider(model, new OpenRouterAuthProvider(apiKey), endpoint);
    },
  };
}

const REGISTRY: Record<LlmProvider, ProviderFactory> = {
  anthropic: anthropicFactory(),
  openai: openAiCompatibleFactory('openai'),
  openrouter: openRouterFactory(),
  local: openAiCompatibleFactory('local'),
};

export function buildProvider(providerType: LlmProvider, model: string): IInferenceProvider {
  return REGISTRY[providerType].create(model);
}
