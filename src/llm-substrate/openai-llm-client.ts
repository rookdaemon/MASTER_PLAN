/**
 * OpenAiLlmClient — ILlmClient for OpenAI-compatible chat/completions APIs.
 *
 * Works with OpenAI, Azure OpenAI, local Ollama, and any endpoint that
 * implements the /chat/completions contract. Auth is injected via
 * IAuthProvider — decoupled from any specific key format.
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import type { IAuthProvider } from "./auth-providers.js";
import type { ILlmClient, LlmInferenceResult, LlmProbeResult } from "./llm-substrate-adapter.js";

export class OpenAiLlmClient implements ILlmClient {
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
      logprobs: true,
      top_logprobs: 1,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.authProvider.getHeaders(),
    };

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: { content: string };
        logprobs?: { content: Array<{ logprob: number }> };
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const content = choice?.message?.content ?? "";
    const tokenLogprobs = (choice?.logprobs?.content ?? []).map((t) => t.logprob);
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

    return {
      content,
      tokenLogprobs,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      latencyMs: Date.now() - start,
    };
  }
}
