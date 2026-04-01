/**
 * ToolLoop — Unified inference-with-tools execution cycle.
 *
 * Provider-agnostic: works with any IInferenceProvider (Anthropic native,
 * Ollama prompt-based, or future OpenAI). Handles both conversational and
 * autonomous inference paths — the two previously separate cycles in AgentLoop.
 *
 * Features:
 *   - Eager/deferred tool split: only eager tools (+ tool_help) are passed to
 *     the provider. Deferred tools are listed by name. The model calls tool_help
 *     to get full schemas for deferred tools, which are then added to the active
 *     tool set for the next iteration.
 *   - Concurrent-safe batching: tools that declare isConcurrencySafe=true are
 *     run in parallel. Unsafe tools run serially in call order.
 *   - Result truncation: results >2000 chars are truncated with guidance.
 *   - Max iterations: loop runs at most 16 iterations before forcing a final
 *     text response.
 *
 * Domain: 0.3.1.5.8 Autonomous Tool Loop
 */

import type { IInferenceProvider, ToolDefinition, ToolCall, ToolResult, Message } from '../llm-substrate/inference-provider.js';

// ── Tool-help meta-tool ───────────────────────────────────────────────────────

/** Name of the tool_help meta-tool. */
export const TOOL_HELP_NAME = 'tool_help';

/** ToolDefinition for the tool_help meta-tool. */
export const TOOL_HELP: ToolDefinition = {
  name: TOOL_HELP_NAME,
  description:
    'Return the full parameter schema for one or more deferred tools. ' +
    'Call this before using any tool listed under "Also available". ' +
    'The schemas are returned as JSON so you know exactly what arguments each tool requires.',
  parameters: {
    type: 'object',
    properties: {
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of the tools to look up (e.g. ["create_simulation", "tick_simulation"]).',
      },
    },
    required: ['tools'],
  },
  isConcurrencySafe: true,
};

// ── ToolLoop options ──────────────────────────────────────────────────────────

export interface ToolLoopOptions {
  /** Maximum number of inference iterations before forcing a final text response. Default: 16. */
  maxIterations?: number;
  /** Maximum length of a single tool result before truncation. Default: 2000 chars. */
  maxResultLength?: number;
  /** Maximum number of concurrent-safe tools to run in parallel. Default: 5. */
  maxConcurrency?: number;
  /** Called after each tool execution for logging/observability. */
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  /** Called after each tool result for logging/observability. */
  onToolResult?: (name: string, result: string, isError: boolean) => void;
}

/** Signature of the tool executor function (wraps executeToolCall). */
export type ToolExecutorFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ content: string; is_error: boolean }>;

// ── ToolLoop ─────────────────────────────────────────────────────────────────

/**
 * Run a full inference-with-tools cycle until the model produces a final
 * text response (or the iteration limit is reached).
 *
 * @param provider      The IInferenceProvider to call.
 * @param systemPrompt  The system prompt for this cycle.
 * @param initialMessages  Conversation history to start from.
 * @param eagerTools    Tools always available (passed to provider on every call).
 * @param deferredTools Tools available on demand via tool_help.
 * @param maxTokens     Token budget per inference call.
 * @param executeFn     Async function that executes a tool by name+args.
 * @param options       Optional tuning parameters.
 * @returns The final text produced by the model, or null if none.
 */
export async function runToolLoop(
  provider: IInferenceProvider,
  systemPrompt: string,
  initialMessages: Message[],
  eagerTools: ToolDefinition[],
  deferredTools: ToolDefinition[],
  maxTokens: number,
  executeFn: ToolExecutorFn,
  options: ToolLoopOptions = {},
): Promise<string | null> {
  const {
    maxIterations = 16,
    maxResultLength = 2000,
    maxConcurrency = 5,
    onToolCall,
    onToolResult,
  } = options;

  // Build a lookup map for deferred tools (for tool_help resolution)
  const deferredByName = new Map<string, ToolDefinition>(
    deferredTools.map(t => [t.name, t])
  );

  // Inject the deferred tool names into the system prompt so the model knows
  // they exist. This is safe for both Anthropic (system prompt) and Ollama
  // (also system prompt after tool injection).
  const enrichedSystemPrompt = deferredTools.length > 0
    ? `${systemPrompt}\n\nAlso available (call tool_help to get full schemas before using):\n${deferredTools.map(t => `  ${t.name}`).join('\n')}`
    : systemPrompt;

  // Active tool set starts with eager tools + tool_help.
  // Deferred tools are added dynamically as tool_help is called.
  const activeTools = new Set<ToolDefinition>([...eagerTools, TOOL_HELP]);

  const messages: Message[] = [...initialMessages];
  let finalText: string | null = null;
  let iterations = 0;

  for (iterations = 0; iterations < maxIterations; iterations++) {
    const result = await provider.infer(
      enrichedSystemPrompt,
      messages,
      [...activeTools],
      maxTokens,
    );

    // Accumulate text
    if (result.text) {
      finalText = result.text;
    }

    // No tool calls → done
    if (result.toolCalls.length === 0) {
      break;
    }

    // Append the assistant's response to the message history.
    // Store _rawAssistantContent so the provider can reconstruct its exact format.
    messages.push({
      role: 'assistant',
      content: result.text ?? '',
      _rawContent: result._rawAssistantContent,
    });

    // Execute tool calls (with concurrency batching)
    const toolResults = await _executeToolCalls(
      result.toolCalls,
      eagerTools,
      deferredByName,
      activeTools,
      deferredTools,
      executeFn,
      maxResultLength,
      maxConcurrency,
      onToolCall,
      onToolResult,
    );

    // Append tool results as a user message
    messages.push({ role: 'tool_results', results: toolResults });
  }

  // If we hit the iteration limit without a text response, force a final call
  if (iterations >= maxIterations && finalText === null) {
    messages.push({
      role: 'user',
      content: '[System] Maximum tool iterations reached. Please provide your final text response now, without calling any more tools.',
    });
    const finalResult = await provider.infer(enrichedSystemPrompt, messages, [], maxTokens);
    finalText = finalResult.text;
  }

  return finalText;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Execute a batch of tool calls, respecting concurrency safety.
 *
 * Strategy:
 *   1. Partition calls into consecutive batches: a batch contains all leading
 *      concurrent-safe calls, or a single unsafe call.
 *   2. All calls in a batch execute in parallel; batches run serially.
 *   3. tool_help is always safe and is resolved locally (no network call).
 */
async function _executeToolCalls(
  toolCalls: ToolCall[],
  eagerTools: ToolDefinition[],
  deferredByName: Map<string, ToolDefinition>,
  activeTools: Set<ToolDefinition>,
  allDeferredTools: ToolDefinition[],
  executeFn: ToolExecutorFn,
  maxResultLength: number,
  maxConcurrency: number,
  onToolCall: ToolLoopOptions['onToolCall'],
  onToolResult: ToolLoopOptions['onToolResult'],
): Promise<ToolResult[]> {
  // Build a lookup: tool name → isConcurrencySafe
  const allKnownTools = new Map<string, boolean>();
  for (const t of eagerTools) {
    allKnownTools.set(t.name, t.isConcurrencySafe ?? false);
  }
  for (const t of allDeferredTools) {
    allKnownTools.set(t.name, t.isConcurrencySafe ?? false);
  }
  allKnownTools.set(TOOL_HELP_NAME, true);

  const results: ToolResult[] = [];

  // Partition into batches
  const batches: ToolCall[][] = [];
  let currentBatch: ToolCall[] = [];

  for (const call of toolCalls) {
    const safe = allKnownTools.get(call.name) ?? false;
    if (safe) {
      currentBatch.push(call);
    } else {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
      }
      batches.push([call]);
    }
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // Execute batches serially; calls within a safe batch run in parallel
  for (const batch of batches) {
    // Limit concurrency within a batch
    const batchResults: ToolResult[] = [];
    for (let i = 0; i < batch.length; i += maxConcurrency) {
      const chunk = batch.slice(i, i + maxConcurrency);
      const chunkResults = await Promise.all(
        chunk.map(call => _executeSingleTool(
          call,
          deferredByName,
          activeTools,
          executeFn,
          maxResultLength,
          onToolCall,
          onToolResult,
        ))
      );
      batchResults.push(...chunkResults);
    }
    results.push(...batchResults);
  }

  return results;
}

/**
 * Execute a single tool call and return the ToolResult.
 * Handles tool_help locally without calling executeFn.
 */
async function _executeSingleTool(
  call: ToolCall,
  deferredByName: Map<string, ToolDefinition>,
  activeTools: Set<ToolDefinition>,
  executeFn: ToolExecutorFn,
  maxResultLength: number,
  onToolCall: ToolLoopOptions['onToolCall'],
  onToolResult: ToolLoopOptions['onToolResult'],
): Promise<ToolResult> {
  onToolCall?.(call.name, call.args);

  let content: string;
  let isError = false;

  if (call.name === TOOL_HELP_NAME) {
    // Resolve tool_help locally: return full schemas for requested tools
    const requestedNames = Array.isArray(call.args['tools']) ? call.args['tools'] as string[] : [];
    const schemas: Record<string, unknown> = {};
    const notFound: string[] = [];

    for (const name of requestedNames) {
      const tool = deferredByName.get(name);
      if (tool) {
        schemas[name] = {
          description: tool.description,
          parameters: tool.parameters,
        };
        // Dynamically add to active tool set for the next inference iteration
        activeTools.add(tool);
      } else {
        notFound.push(name);
      }
    }

    const parts: string[] = [];
    if (Object.keys(schemas).length > 0) {
      parts.push('Full schemas for requested tools:');
      parts.push(JSON.stringify(schemas, null, 2));
    }
    if (notFound.length > 0) {
      parts.push(`Unknown tools (not found in deferred set): ${notFound.join(', ')}`);
    }
    content = parts.join('\n\n') || 'No tools found.';
  } else {
    // Regular tool execution
    try {
      const execResult = await executeFn(call.name, call.args);
      content = execResult.content;
      isError = execResult.is_error;
    } catch (err) {
      content = `Tool execution error: ${String(err)}`;
      isError = true;
    }
  }

  // Truncate large results with guidance
  if (content.length > maxResultLength) {
    content = content.slice(0, maxResultLength) +
      `\n[truncated — use read_file or run_command for full content]`;
  }

  onToolResult?.(call.name, content, isError);

  return {
    callId: call.id,
    content,
    isError,
  };
}
