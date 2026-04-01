/**
 * OllamaInferenceProvider — IInferenceProvider using prompt-based tool injection.
 *
 * Works with any OpenAI-compatible endpoint (Ollama, local Llama, Qwen, etc.)
 * that can follow formatting instructions. Instead of using a native tools API,
 * this provider:
 *
 *   1. Injects tool descriptions into the system prompt as structured text.
 *   2. Instructs the model to emit tool calls as:
 *        <tool_call>{"name":"...","args":{...}}</tool_call>
 *   3. Parses tool calls from the text response via regex.
 *   4. Converts tool_results messages to plain text user messages.
 *
 * This allows any instruction-following model to participate in the unified
 * ToolLoop without provider-specific API support.
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import type { IAuthProvider } from "./auth-providers.js";
import type {
  IInferenceProvider,
  InferenceResult,
  Message,
  ToolCall,
  ToolDefinition,
} from "./inference-provider.js";

/** Counter for generating unique tool call IDs within a session. */
let _toolCallCounter = 0;

function _nextToolCallId(): string {
  return `ollama-tc-${++_toolCallCounter}`;
}

export class OllamaInferenceProvider implements IInferenceProvider {
  constructor(
    private readonly modelId: string,
    private readonly authProvider: IAuthProvider,
    private readonly endpoint: string,
  ) {}

  async probe(): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.infer("You are a health probe. Reply with one word.", [
        { role: "user", content: "ping" },
      ], [], 4);
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
    messages: Message[],
    tools: ToolDefinition[],
    maxTokens: number,
  ): Promise<InferenceResult> {
    const start = Date.now();

    // Inject tool descriptions into the system prompt
    const enrichedSystemPrompt = tools.length > 0
      ? `${systemPrompt}\n\n${this._buildToolPrompt(tools)}`
      : systemPrompt;

    // Map provider-agnostic messages to OpenAI-compatible format
    const openAiMessages = this._mapMessages(messages, enrichedSystemPrompt);

    const body = {
      model: this.modelId,
      max_tokens: maxTokens,
      messages: openAiMessages,
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
      const errorBody = await response.text().catch(() => "(could not read body)");
      throw new Error(
        `Ollama/OpenAI API error ${response.status}: ${response.statusText}\n${errorBody}`
      );
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const rawText = data.choices[0]?.message?.content ?? "";
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

    // Parse <tool_call>...</tool_call> blocks from the response
    const { cleanText, toolCalls } = this._parseToolCalls(rawText);

    return {
      text: cleanText.trim() || null,
      toolCalls,
      // No _rawAssistantContent needed for prompt-based providers; the ToolLoop
      // stores the clean text in the assistant message.
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      latencyMs: Date.now() - start,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build the tool-use section to inject into the system prompt.
   *
   * Format:
   *   ## Available Tools
   *   To use a tool, emit:
   *     <tool_call>{"name":"tool_name","args":{...}}</tool_call>
   *
   *   [Tool descriptions...]
   */
  private _buildToolPrompt(tools: ToolDefinition[]): string {
    const lines: string[] = [
      '## Available Tools',
      '',
      'To call a tool, emit a JSON block wrapped in <tool_call> tags on its own line:',
      '  <tool_call>{"name":"tool_name","args":{"param":"value"}}</tool_call>',
      '',
      'You may emit tool calls anywhere in your response. Multiple tool calls are allowed.',
      'Wait for tool results before proceeding. Do not invent results.',
      '',
    ];

    for (const tool of tools) {
      lines.push(`### ${tool.name}`);
      lines.push(tool.description);
      const params = tool.parameters as {
        properties?: Record<string, { type?: string; description?: string }>;
        required?: string[];
      };
      if (params.properties && Object.keys(params.properties).length > 0) {
        lines.push('Parameters:');
        for (const [name, schema] of Object.entries(params.properties)) {
          const required = params.required?.includes(name) ? ' (required)' : '';
          const desc = (schema as { description?: string }).description ?? '';
          const type = (schema as { type?: string }).type ?? 'any';
          lines.push(`  - ${name} (${type})${required}: ${desc}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Map provider-agnostic Message[] to OpenAI-compatible message format.
   * The system prompt is prepended as a 'system' message.
   *
   * tool_results messages are formatted as plain text user messages so any
   * instruction-following model can read them.
   */
  private _mapMessages(
    messages: Message[],
    systemPrompt: string,
  ): Array<{ role: string; content: string }> {
    const result: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        // Use the stored text (clean text without tool call tags)
        result.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'tool_results') {
        // Format tool results as plain text
        const lines = msg.results.map(r => {
          const status = r.isError ? '[ERROR]' : '[OK]';
          return `Tool result ${status} (id=${r.callId}):\n${r.content}`;
        });
        result.push({ role: 'user', content: lines.join('\n\n') });
      }
    }

    return result;
  }

  /**
   * Parse <tool_call>...</tool_call> blocks from response text.
   *
   * Returns:
   *   cleanText  — the response text with tool_call blocks removed
   *   toolCalls  — parsed ToolCall[] (skips malformed JSON blocks with a warning)
   */
  private _parseToolCalls(text: string): { cleanText: string; toolCalls: ToolCall[] } {
    const toolCalls: ToolCall[] = [];
    const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as {
          name?: string;
          args?: Record<string, unknown>;
          arguments?: Record<string, unknown>;
        };
        if (typeof parsed.name === 'string') {
          toolCalls.push({
            id: _nextToolCallId(),
            name: parsed.name,
            args: parsed.args ?? parsed.arguments ?? {},
          });
        }
      } catch {
        // Malformed JSON in tool_call block — skip silently
      }
    }

    const cleanText = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
    return { cleanText, toolCalls };
  }
}
