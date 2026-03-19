/**
 * One-shot prompt runner.
 *
 * Sends a single prompt to an ILlmClient, returns the response, done.
 * No agent loop, no conscious pipeline — just a direct LLM inference call.
 *
 * Designed for:
 *   - Debugging LLM connectivity and auth
 *   - Quick ad-hoc queries via CLI (-p flag)
 *   - Scripted / programmatic single-turn interactions
 */

import type { ILlmClient } from "../llm-substrate/llm-substrate-adapter.js";

export interface OneShotConfig {
  prompt: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
}

export interface OneShotResult {
  content: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Execute a single LLM inference and return the result.
 *
 * @param client    Pre-configured ILlmClient (with auth already wired).
 * @param config    Prompt, system prompt, and token budget.
 */
export async function runOneShot(
  client: ILlmClient,
  config: OneShotConfig
): Promise<OneShotResult> {
  const result = await client.infer(
    config.systemPrompt,
    [{ role: "user", content: config.prompt }],
    config.maxTokens
  );

  return {
    content: result.content,
    latencyMs: result.latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
}
