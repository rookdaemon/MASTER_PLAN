/**
 * CLI argument parser for the agent runtime.
 *
 * Pure function: takes an argv array (e.g. process.argv), returns structured
 * options. No side effects, no process globals — fully testable.
 *
 * Supported flags:
 *   -p / --prompt <text>     One-shot prompt mode (send, receive, exit)
 *   --model <id>             LLM model identifier (default: claude-sonnet-4-20250514)
 *   --provider <provider>    LLM provider (default: anthropic-oauth)
 */

import type { LlmProvider } from "../llm-substrate/llm-substrate-adapter.js";

const VALID_PROVIDERS: readonly string[] = [
  "openai",
  "anthropic",
  "anthropic-oauth",
  "local",
];

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_PROVIDER: LlmProvider = "anthropic-oauth";

export interface CliOptions {
  mode: "one-shot" | "agent-loop";
  prompt?: string;
  model: string;
  provider: LlmProvider;
}

/**
 * Parse a raw argv array into structured CLI options.
 *
 * @param argv Raw argument vector (e.g. process.argv). The first two
 *             entries (node binary + script path) are skipped.
 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  // Skip node binary and script path
  const args = argv.slice(2);

  let prompt: string | undefined;
  let model: string = DEFAULT_MODEL;
  let provider: LlmProvider = DEFAULT_PROVIDER;

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === "-p" || arg === "--prompt") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`"${arg}" requires a value (e.g. ${arg} "Hello")`);
      }
      prompt = value;
      i += 2;
      continue;
    }

    if (arg === "--model") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`"--model" requires a value (e.g. --model claude-sonnet-4-20250514)`);
      }
      model = value;
      i += 2;
      continue;
    }

    if (arg === "--provider") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(
          `"--provider" requires a value (one of: ${VALID_PROVIDERS.join(", ")})`
        );
      }
      if (!VALID_PROVIDERS.includes(value)) {
        throw new Error(
          `Invalid provider "${value}". Must be one of: ${VALID_PROVIDERS.join(", ")}`
        );
      }
      provider = value as LlmProvider;
      i += 2;
      continue;
    }

    // Ignore unknown args
    i++;
  }

  return {
    mode: prompt !== undefined ? "one-shot" : "agent-loop",
    prompt,
    model,
    provider,
  };
}
