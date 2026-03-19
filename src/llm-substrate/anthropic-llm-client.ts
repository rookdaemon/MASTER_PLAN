/**
 * AnthropicLlmClient — ILlmClient for the Anthropic Messages API.
 *
 * Handles both API-key auth (x-api-key) and OAuth (Bearer) via the
 * injected IAuthProvider. Auth strategy is fully decoupled — see
 * auth-providers.ts for provider implementations.
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import type { IAuthProvider } from "./auth-providers.js";
import type { ILlmClient, LlmInferenceResult, LlmProbeResult } from "./llm-substrate-adapter.js";

export class AnthropicLlmClient implements ILlmClient {
  constructor(
    private readonly modelId: string,
    private readonly authProvider: IAuthProvider,
    private readonly endpoint: string
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

    const body = {
      model: this.modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    };

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
      throw new Error(`Anthropic API error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
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
