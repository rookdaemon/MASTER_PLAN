/**
 * AnthropicInferenceProvider — IInferenceProvider backed by the Anthropic Messages API.
 *
 * Uses Anthropic's native `tools` API parameter for full-fidelity tool use.
 * Maps the provider-agnostic ToolDefinition.parameters → input_schema expected
 * by the Anthropic wire format.
 *
 * Tool result multi-turn: stores raw Anthropic content blocks in
 * InferenceResult._rawAssistantContent so the ToolLoop can reconstruct the
 * exact assistant message format required by the Anthropic API.
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import type { IAuthProvider } from "./auth-providers.js";
import { CLAUDE_CODE_IDENTITY } from "./auth-providers.js";
import type {
  IInferenceProvider,
  InferenceResult,
  Message,
  ToolCall,
  ToolDefinition,
} from "./inference-provider.js";

/** Anthropic content block for structured system prompts. */
interface SystemBlock {
  type: "text";
  text: string;
}

/** Raw Anthropic message format (subset used here). */
type AnthropicMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: AnthropicContentBlock[] }
  | { role: 'user'; content: AnthropicToolResultBlock[] };

/** Anthropic content block shape (subset). */
type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking: string };

/** Anthropic tool_result block. */
interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** Anthropic tool definition (wire format). */
interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class AnthropicInferenceProvider implements IInferenceProvider {
  constructor(
    private readonly modelId: string,
    private readonly authProvider: IAuthProvider,
    private readonly endpoint: string,
    private readonly thinkingBudgetTokens: number = 0,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async probe(): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
    const start = this.now();
    try {
      await this.infer("You are a health probe. Reply with one word.", [
        { role: "user", content: "ping" },
      ], [], 4);
      return { latencyMs: this.now() - start, reachable: true };
    } catch (err) {
      return {
        latencyMs: this.now() - start,
        reachable: false,
        error: String(err),
      };
    }
  }

  async infer(
    systemPrompt: string,
    messages: Message[],
    tools: ToolDefinition[],
    maxTokens: number,
  ): Promise<InferenceResult> {
    const start = this.now();

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

    // Map provider-agnostic messages to Anthropic wire format
    const anthropicMessages = this._mapMessages(messages);

    // Map ToolDefinition.parameters → input_schema for Anthropic wire format
    const anthropicTools: AnthropicToolDef[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const body: Record<string, unknown> = {
      model: this.modelId,
      max_tokens: maxTokens,
      system,
      messages: anthropicMessages,
    };
    if (anthropicTools.length > 0) {
      body.tools = anthropicTools;
    }
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
            : Math.max(0, new Date(retryAfter).getTime() - this.now());
        }
      }
      throw err;
    }

    const data = await response.json() as {
      content: AnthropicContentBlock[];
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

    // Extract text blocks
    const textBlocks = data.content.filter(
      (b): b is { type: 'text'; text: string } => b.type === 'text'
    );
    const text = textBlocks.map(b => b.text).join('').trim() || null;

    // Extract tool_use blocks → ToolCall[]
    const toolCalls: ToolCall[] = data.content
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use'
      )
      .map(b => ({
        id: b.id,
        name: b.name,
        args: b.input ?? {},
      }));

    return {
      text,
      toolCalls,
      _rawAssistantContent: data.content,  // provider-internal; ToolLoop stores this opaquely
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      latencyMs: this.now() - start,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Map provider-agnostic Message[] to Anthropic wire format.
   *
   * - user/assistant messages with plain content → pass through
   * - assistant messages with _rawContent (Anthropic blocks) → use raw content
   * - tool_results messages → Anthropic user message with tool_result blocks
   */
  private _mapMessages(messages: Message[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg._rawContent !== undefined) {
          // Restore the exact Anthropic content blocks from the previous turn.
          // Filter out thinking blocks (internal only) and empty text blocks.
          const rawBlocks = msg._rawContent as AnthropicContentBlock[];
          const cleaned = rawBlocks.filter(b => {
            if (b.type === 'thinking') return false;
            if (b.type === 'text' && !b.text) return false;
            return true;
          });
          result.push({ role: 'assistant', content: cleaned });
        } else {
          // Plain text assistant message (no tool calls in that turn)
          result.push({
            role: 'assistant',
            content: [{ type: 'text', text: msg.content }] as AnthropicContentBlock[],
          });
        }
      } else if (msg.role === 'tool_results') {
        // Convert ToolResult[] to Anthropic's tool_result block format
        const toolResultBlocks: AnthropicToolResultBlock[] = msg.results.map(r => ({
          type: 'tool_result',
          tool_use_id: r.callId,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        }));
        result.push({ role: 'user', content: toolResultBlocks } as unknown as AnthropicMessage);
      }
    }

    return result;
  }
}
