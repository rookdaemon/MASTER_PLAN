/**
 * AnthropicLlmClient — ILlmClient for the Anthropic Messages API.
 *
 * Handles both API-key auth (x-api-key) and OAuth (Bearer + beta headers)
 * via injected IAuthProvider. OAuth tokens require the Claude Code identity
 * prefix in the system prompt (block-structured format).
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import type { IAuthProvider } from "./auth-providers.js";
import { CLAUDE_CODE_IDENTITY } from "./auth-providers.js";
import type {
  ILlmClient,
  LlmInferenceResult,
  LlmProbeResult,
} from "./llm-substrate-adapter.js";

/** Anthropic content block for structured system prompts. */
interface SystemBlock {
  type: "text";
  text: string;
}

export class AnthropicLlmClient implements ILlmClient {
  constructor(
    private readonly modelId: string,
    private readonly authProvider: IAuthProvider,
    private readonly endpoint: string,
    private readonly thinkingBudgetTokens: number = 0,
  ) {}

  async probe(): Promise<LlmProbeResult> {
    const start = Date.now();
    try {
      await this.infer("You are a health probe. Reply with one word.", [
        { role: "user", content: "ping" },
      ], 4);
      return { latencyMs: Date.now() - start, reachable: true };
    } catch (err) {
      return {
        latencyMs: Date.now() - start,
        reachable: false,
        error: String(err),
      };
    }
  }

  async infer(
    systemPrompt: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    maxTokens: number
  ): Promise<LlmInferenceResult> {
    const start = Date.now();

    // OAuth tokens require the Claude Code identity prefix in block-structured format
    let system: string | SystemBlock[];
    if (this.authProvider.requiresSystemIdentityPrefix()) {
      system = [
        { type: "text", text: CLAUDE_CODE_IDENTITY },
        { type: "text", text: systemPrompt },
      ];
    } else {
      system = systemPrompt;
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      max_tokens: maxTokens,
      system,
      messages,
    };
    if (this.thinkingBudgetTokens > 0) {
      body.thinking = { type: 'enabled', budget_tokens: this.thinkingBudgetTokens };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...this.authProvider.getHeaders(),
    };

    const response = await fetch(`${this.endpoint}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(could not read body)");
      const err = new Error(
        `Anthropic API error ${response.status}: ${response.statusText}\n${errorBody}`
      ) as Error & { retryAfterMs?: number };
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          err.retryAfterMs = !isNaN(seconds)
            ? seconds * 1000
            : Math.max(0, new Date(retryAfter).getTime() - Date.now());
        }
      }
      throw err;
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string; thinking?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const content = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    // Anthropic Messages API does not expose per-token logprobs in the standard response.
    // tokenLogprobs is left empty; proxy-Phi will be 0 (honest about missing data).
    const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

    return {
      content,
      tokenLogprobs: [],
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      latencyMs: Date.now() - start,
    };
  }
}
