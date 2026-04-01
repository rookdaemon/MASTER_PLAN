/**
 * IInferenceProvider — Provider-agnostic inference interface with tool use.
 *
 * Replaces the Anthropic-specific inferWithTools() pattern with a unified
 * interface that every provider implements. Each provider handles its own
 * wire protocol:
 *
 *   AnthropicInferenceProvider — native Anthropic tools API
 *   OllamaInferenceProvider    — prompt-injected <tool_call> text format
 *
 * The ToolLoop drives the inference-with-tools cycle and is provider-agnostic.
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

// ── Tool definitions ──────────────────────────────────────────────────────────

/**
 * Provider-agnostic tool definition. Uses `parameters` (JSON Schema) instead
 * of Anthropic's `input_schema` naming. Each provider maps this to its own
 * wire format internally.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema describing the tool's input parameters. */
  readonly parameters: Record<string, unknown>;
  /**
   * Whether this tool is safe to run concurrently with other safe tools.
   * Read-only, idempotent tools (resource_read, read_file, list_directory,
   * introspect) should set this to true. Defaults to false.
   */
  readonly isConcurrencySafe?: boolean;
}

// ── Common tool-use types ─────────────────────────────────────────────────────

/** A single tool invocation the model wants to make. */
export interface ToolCall {
  /** Unique identifier for this call (used to match results). */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** The result of executing a tool call. */
export interface ToolResult {
  /** Must match the ToolCall.id this result is for. */
  callId: string;
  content: string;
  isError: boolean;
}

// ── Provider-agnostic message type ────────────────────────────────────────────

/**
 * A conversation message that supports plain text and tool results.
 *
 * `assistant` messages may carry opaque provider-internal `_rawContent`
 * (e.g. Anthropic content blocks) used by the provider on the next turn to
 * reconstruct the exact assistant response format expected by the API.
 * The ToolLoop stores this field but never inspects it.
 *
 * `tool_results` messages carry the results of tool executions and are
 * converted to provider-specific formats by each IInferenceProvider.
 */
export type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; _rawContent?: unknown }
  | { role: 'tool_results'; results: ToolResult[] };

// ── Inference result ─────────────────────────────────────────────────────────

export interface InferenceResult {
  /** Text the model produced (may be null if only tool calls were emitted). */
  text: string | null;
  /** Tool calls the model wants to make (empty if none). */
  toolCalls: ToolCall[];
  /**
   * Provider-internal raw assistant content for multi-turn tool use.
   * Stored by ToolLoop in the assistant Message._rawContent — opaque outside
   * the provider that produced it.
   */
  _rawAssistantContent?: unknown;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

// ── IInferenceProvider ───────────────────────────────────────────────────────

/**
 * Unified inference interface that accepts tools on every call.
 *
 * Each provider decides how to present the tools to the model:
 *   - AnthropicInferenceProvider: passes via the native `tools` API parameter
 *   - OllamaInferenceProvider:    injects descriptions into the system prompt
 *
 * An empty `tools` array is always valid and produces a plain text response.
 */
export interface IInferenceProvider {
  probe(): Promise<{ reachable: boolean; latencyMs: number; error?: string }>;

  infer(
    systemPrompt: string,
    messages: Message[],
    tools: ToolDefinition[],
    maxTokens: number,
  ): Promise<InferenceResult>;
}
