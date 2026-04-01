/**
 * Tests for the ToolLoop — unified inference-with-tools cycle.
 *
 * Tests verify:
 *   - No-tool call returns text directly
 *   - Single tool call is executed and result fed back
 *   - tool_help returns full schemas and activates deferred tools
 *   - Concurrent-safe tools run (logically) in parallel
 *   - Large results are truncated at 2000 chars
 *   - Max iterations limit is respected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runToolLoop, TOOL_HELP, TOOL_HELP_NAME } from '../tool-loop.js';
import type { IInferenceProvider, ToolDefinition, InferenceResult, Message } from '../../llm-substrate/inference-provider.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeProvider(responses: Partial<InferenceResult>[]): IInferenceProvider {
  let callIndex = 0;
  return {
    probe: vi.fn().mockResolvedValue({ reachable: true, latencyMs: 1 }),
    infer: vi.fn().mockImplementation(async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return {
        text: null,
        toolCalls: [],
        promptTokens: 10,
        completionTokens: 5,
        latencyMs: 1,
        ...resp,
      };
    }),
  };
}

const ECHO_TOOL: ToolDefinition = {
  name: 'echo',
  description: 'Echo the input back',
  parameters: {
    type: 'object',
    properties: { message: { type: 'string', description: 'The message to echo' } },
    required: ['message'],
  },
  isConcurrencySafe: true,
};

const SAFE_TOOL: ToolDefinition = {
  name: 'safe_read',
  description: 'Read-only safe tool',
  parameters: { type: 'object', properties: {} },
  isConcurrencySafe: true,
};

const UNSAFE_TOOL: ToolDefinition = {
  name: 'unsafe_write',
  description: 'Write tool (not safe for concurrency)',
  parameters: { type: 'object', properties: {} },
  isConcurrencySafe: false,
};

const DEFERRED_TOOL: ToolDefinition = {
  name: 'expensive_op',
  description: 'An expensive operation with many parameters',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Target to operate on' },
    },
    required: ['target'],
  },
};

async function noopExecutor(_name: string, _args: Record<string, unknown>) {
  return { content: 'ok', is_error: false };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runToolLoop', () => {
  describe('basic inference', () => {
    it('returns text directly when no tool calls', async () => {
      const provider = makeProvider([{ text: 'Hello world', toolCalls: [] }]);
      const result = await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'hi' }],
        [ECHO_TOOL], [], 1000, noopExecutor,
      );
      expect(result).toBe('Hello world');
      expect(provider.infer).toHaveBeenCalledTimes(1);
    });

    it('returns null when model produces no text and no tool calls', async () => {
      const provider = makeProvider([{ text: null, toolCalls: [] }]);
      const result = await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'hi' }],
        [], [], 1000, noopExecutor,
      );
      expect(result).toBeNull();
    });

    it('passes eager tools to provider', async () => {
      const provider = makeProvider([{ text: 'done', toolCalls: [] }]);
      await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'hi' }],
        [ECHO_TOOL], [DEFERRED_TOOL], 1000, noopExecutor,
      );
      const [, , tools] = (provider.infer as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // Should include ECHO_TOOL and TOOL_HELP, not DEFERRED_TOOL
      const toolNames = (tools as ToolDefinition[]).map(t => t.name);
      expect(toolNames).toContain(ECHO_TOOL.name);
      expect(toolNames).toContain(TOOL_HELP_NAME);
      expect(toolNames).not.toContain(DEFERRED_TOOL.name);
    });

    it('injects deferred tool names into system prompt', async () => {
      const provider = makeProvider([{ text: 'done', toolCalls: [] }]);
      await runToolLoop(
        provider, 'base system', [{ role: 'user', content: 'hi' }],
        [ECHO_TOOL], [DEFERRED_TOOL], 1000, noopExecutor,
      );
      const [systemPrompt] = (provider.infer as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(systemPrompt).toContain('expensive_op');
      expect(systemPrompt).toContain('tool_help');
    });
  });

  describe('single tool call', () => {
    it('executes tool and feeds result back for second inference', async () => {
      const provider = makeProvider([
        // First call: requests echo tool
        { text: 'Calling echo...', toolCalls: [{ id: 'tc-1', name: 'echo', args: { message: 'test' } }] },
        // Second call: final text response
        { text: 'Echo said: test', toolCalls: [] },
      ]);
      const executor = vi.fn().mockResolvedValue({ content: 'echoed: test', is_error: false });

      const result = await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'echo test' }],
        [ECHO_TOOL], [], 1000, executor,
      );

      expect(executor).toHaveBeenCalledWith('echo', { message: 'test' });
      expect(provider.infer).toHaveBeenCalledTimes(2);
      expect(result).toBe('Echo said: test');

      // Second call should have tool_results message
      const [, messages2] = (provider.infer as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResultMsg = (messages2 as Message[]).find(m => m.role === 'tool_results');
      expect(toolResultMsg).toBeDefined();
      if (toolResultMsg?.role === 'tool_results') {
        expect(toolResultMsg.results[0]!.content).toBe('echoed: test');
        expect(toolResultMsg.results[0]!.callId).toBe('tc-1');
      }
    });

    it('marks result as error when executor throws', async () => {
      const provider = makeProvider([
        { text: null, toolCalls: [{ id: 'tc-1', name: 'echo', args: {} }] },
        { text: 'Handled error', toolCalls: [] },
      ]);
      const executor = vi.fn().mockRejectedValue(new Error('tool crashed'));

      await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'hi' }],
        [ECHO_TOOL], [], 1000, executor,
      );

      const [, messages2] = (provider.infer as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResultMsg = (messages2 as Message[]).find(m => m.role === 'tool_results');
      if (toolResultMsg?.role === 'tool_results') {
        expect(toolResultMsg.results[0]!.isError).toBe(true);
        expect(toolResultMsg.results[0]!.content).toContain('tool crashed');
      }
    });
  });

  describe('result truncation', () => {
    it('truncates results longer than maxResultLength', async () => {
      const bigResult = 'x'.repeat(3000);
      const provider = makeProvider([
        { text: null, toolCalls: [{ id: 'tc-1', name: 'echo', args: { message: 'big' } }] },
        { text: 'done', toolCalls: [] },
      ]);
      const executor = vi.fn().mockResolvedValue({ content: bigResult, is_error: false });

      await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'hi' }],
        [ECHO_TOOL], [], 1000, executor,
        { maxResultLength: 2000 },
      );

      const [, messages2] = (provider.infer as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResultMsg = (messages2 as Message[]).find(m => m.role === 'tool_results');
      if (toolResultMsg?.role === 'tool_results') {
        const resultContent = toolResultMsg.results[0]!.content;
        expect(resultContent.length).toBeLessThanOrEqual(2000 + 100); // truncation msg adds some chars
        expect(resultContent).toContain('[truncated');
      }
    });
  });

  describe('tool_help', () => {
    it('resolves tool_help and returns full schema', async () => {
      const helpArgs = { tools: ['expensive_op'] };
      const provider = makeProvider([
        // First call: requests tool_help
        { text: null, toolCalls: [{ id: 'tc-help', name: TOOL_HELP_NAME, args: helpArgs }] },
        // Second call: uses the deferred tool
        { text: null, toolCalls: [{ id: 'tc-op', name: 'expensive_op', args: { target: 'x' } }] },
        // Third call: final text
        { text: 'done', toolCalls: [] },
      ]);
      const executor = vi.fn().mockResolvedValue({ content: 'op result', is_error: false });

      const result = await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'run op' }],
        [], [DEFERRED_TOOL], 1000, executor,
      );

      expect(result).toBe('done');
      expect(provider.infer).toHaveBeenCalledTimes(3);

      // tool_help should NOT call executor (resolved locally)
      const executorCallNames = executor.mock.calls.map(c => c[0]);
      expect(executorCallNames).not.toContain(TOOL_HELP_NAME);
      expect(executorCallNames).toContain('expensive_op');

      // After tool_help, the deferred tool should be in the active set
      const [, , tools3] = (provider.infer as ReturnType<typeof vi.fn>).mock.calls[2]!;
      const toolNames3 = (tools3 as ToolDefinition[]).map(t => t.name);
      expect(toolNames3).toContain('expensive_op');
    });

    it('returns "Unknown tools" for names not in deferred set', async () => {
      const provider = makeProvider([
        { text: null, toolCalls: [{ id: 'tc-help', name: TOOL_HELP_NAME, args: { tools: ['nonexistent'] } }] },
        { text: 'ok', toolCalls: [] },
      ]);

      await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'help' }],
        [], [], 1000, noopExecutor,
      );

      const [, messages2] = (provider.infer as ReturnType<typeof vi.fn>).mock.calls[1]!;
      const toolResultMsg = (messages2 as Message[]).find(m => m.role === 'tool_results');
      if (toolResultMsg?.role === 'tool_results') {
        expect(toolResultMsg.results[0]!.content).toContain('Unknown tools');
        expect(toolResultMsg.results[0]!.content).toContain('nonexistent');
      }
    });
  });

  describe('concurrency', () => {
    it('calls onToolCall for each tool executed', async () => {
      const provider = makeProvider([
        {
          text: null,
          toolCalls: [
            { id: 'tc-1', name: 'safe_read', args: {} },
            { id: 'tc-2', name: 'safe_read', args: {} },
          ],
        },
        { text: 'done', toolCalls: [] },
      ]);
      const onToolCall = vi.fn();
      const executor = vi.fn().mockResolvedValue({ content: 'result', is_error: false });

      await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'hi' }],
        [SAFE_TOOL], [], 1000, executor,
        { onToolCall },
      );

      expect(onToolCall).toHaveBeenCalledTimes(2);
      expect(onToolCall).toHaveBeenCalledWith('safe_read', {});
    });

    it('calls onToolResult for each tool result', async () => {
      const provider = makeProvider([
        { text: null, toolCalls: [{ id: 'tc-1', name: 'unsafe_write', args: {} }] },
        { text: 'done', toolCalls: [] },
      ]);
      const onToolResult = vi.fn();
      const executor = vi.fn().mockResolvedValue({ content: 'wrote', is_error: false });

      await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'write' }],
        [UNSAFE_TOOL], [], 1000, executor,
        { onToolResult },
      );

      expect(onToolResult).toHaveBeenCalledWith('unsafe_write', 'wrote', false);
    });
  });

  describe('iteration limit', () => {
    it('stops after maxIterations and does a final text call', async () => {
      // Always return a tool call — should hit the limit
      const provider = makeProvider([
        // All intermediate calls return a tool
        { text: null, toolCalls: [{ id: 'tc-x', name: 'echo', args: { message: 'x' } }] },
      ]);
      // The very last call (forced text) returns text
      (provider.infer as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
        text: null, toolCalls: [{ id: 'tc-x', name: 'echo', args: { message: 'x' } }], promptTokens: 1, completionTokens: 1, latencyMs: 1,
      }));
      (provider.infer as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: null, toolCalls: [{ id: 'tc-x', name: 'echo', args: { message: 'x' } }], promptTokens: 1, completionTokens: 1, latencyMs: 1,
      });
      // Override: after maxIterations, a forced call with no tools returns text
      let callCount = 0;
      (provider.infer as ReturnType<typeof vi.fn>).mockImplementation(async (_sys, _msgs, tools) => {
        callCount++;
        if ((tools as ToolDefinition[]).length === 0) {
          // Forced text call
          return { text: 'forced final', toolCalls: [], promptTokens: 1, completionTokens: 1, latencyMs: 1 };
        }
        return { text: null, toolCalls: [{ id: `tc-${callCount}`, name: 'echo', args: { message: 'x' } }], promptTokens: 1, completionTokens: 1, latencyMs: 1 };
      });

      const result = await runToolLoop(
        provider, 'sys', [{ role: 'user', content: 'loop forever' }],
        [ECHO_TOOL], [], 1000, noopExecutor,
        { maxIterations: 3 },
      );

      expect(result).toBe('forced final');
      // Should have called infer 3 (max) + 1 (forced) = 4 times
      expect(provider.infer).toHaveBeenCalledTimes(4);
    });
  });
});

describe('TOOL_HELP definition', () => {
  it('has the correct name', () => {
    expect(TOOL_HELP.name).toBe(TOOL_HELP_NAME);
  });

  it('is marked as concurrency safe', () => {
    expect(TOOL_HELP.isConcurrencySafe).toBe(true);
  });

  it('has a parameters schema with tools array', () => {
    const params = TOOL_HELP.parameters as { properties: Record<string, unknown> };
    expect(params.properties['tools']).toBeDefined();
  });
});
