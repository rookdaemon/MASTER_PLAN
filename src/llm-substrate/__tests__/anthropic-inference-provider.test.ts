/**
 * Tests for AnthropicInferenceProvider.
 *
 * Verifies:
 *   - infer() maps ToolDefinition.parameters → input_schema for Anthropic API
 *   - infer() parses tool_use blocks into ToolCall[]
 *   - infer() stores raw content blocks in _rawAssistantContent
 *   - infer() passes tool_results messages in Anthropic format
 *   - probe() returns reachable:true/false
 *   - Empty tools → no tools field in request body
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicInferenceProvider } from '../anthropic-inference-provider.js';
import type { IAuthProvider } from '../auth-providers.js';

class StubAuth implements IAuthProvider {
  constructor(private readonly hdrs: Record<string, string> = {}) {}
  getHeaders() { return { 'x-api-key': 'test-key', ...this.hdrs }; }
  isExpired() { return false; }
  requiresSystemIdentityPrefix() { return false; }
}

function makeAnthropicResponse(
  content: unknown[] = [{ type: 'text', text: 'Hello' }],
  stopReason = 'end_turn',
) {
  return {
    ok: true, status: 200, statusText: 'OK',
    json: async () => ({
      content,
      stop_reason: stopReason,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  };
}

describe('AnthropicInferenceProvider', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends tools with input_schema mapping from parameters', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');

    await provider.infer('System', [{ role: 'user', content: 'hi' }], [{
      name: 'my_tool',
      description: 'Does something',
      parameters: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
    }], 100);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe('my_tool');
    // parameters renamed to input_schema for Anthropic wire format
    expect(body.tools[0].input_schema).toEqual({ type: 'object', properties: { x: { type: 'string' } }, required: ['x'] });
    expect(body.tools[0].parameters).toBeUndefined();
  });

  it('does NOT include tools field when tools array is empty', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');

    await provider.infer('System', [{ role: 'user', content: 'hi' }], [], 100);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    expect(body.tools).toBeUndefined();
  });

  it('parses tool_use blocks into ToolCall[]', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse([
      { type: 'text', text: 'Using tool...' },
      { type: 'tool_use', id: 'tc-abc', name: 'my_tool', input: { x: 'hello' } },
    ], 'tool_use'));
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');

    const result = await provider.infer('System', [{ role: 'user', content: 'hi' }], [{
      name: 'my_tool', description: 'desc', parameters: {},
    }], 100);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.id).toBe('tc-abc');
    expect(result.toolCalls[0]!.name).toBe('my_tool');
    expect(result.toolCalls[0]!.args).toEqual({ x: 'hello' });
    expect(result.text).toBe('Using tool...');
  });

  it('stores raw content blocks in _rawAssistantContent', async () => {
    const rawContent = [
      { type: 'text', text: 'thinking...' },
      { type: 'tool_use', id: 'tc-1', name: 'tool', input: {} },
    ];
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(rawContent, 'tool_use'));
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');

    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [{
      name: 'tool', description: 'desc', parameters: {},
    }], 100);

    expect(result._rawAssistantContent).toEqual(rawContent);
  });

  it('maps tool_results message to Anthropic tool_result blocks', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');

    await provider.infer('sys', [
      { role: 'user', content: 'initial' },
      { role: 'assistant', content: 'calling tool', _rawContent: [{ type: 'text', text: 'calling tool' }, { type: 'tool_use', id: 'tc-1', name: 'tool', input: {} }] },
      { role: 'tool_results', results: [{ callId: 'tc-1', content: 'result', isError: false }] },
    ], [], 100);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    // The tool_results should become a user message with tool_result blocks
    const lastMsg = body.messages[body.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content[0].type).toBe('tool_result');
    expect(lastMsg.content[0].tool_use_id).toBe('tc-1');
    expect(lastMsg.content[0].content).toBe('result');
  });

  it('uses raw content blocks for assistant messages with _rawContent', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');

    const rawBlocks = [
      { type: 'text', text: 'some text' },
      { type: 'tool_use', id: 'tc-1', name: 'tool', input: {} },
    ];
    await provider.infer('sys', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'some text', _rawContent: rawBlocks },
    ], [], 100);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    const assistantMsg = body.messages[1];
    expect(assistantMsg.role).toBe('assistant');
    // Should use raw content blocks, not string content
    expect(Array.isArray(assistantMsg.content)).toBe(true);
    expect(assistantMsg.content[0].type).toBe('text');
    expect(assistantMsg.content[1].type).toBe('tool_use');
  });

  it('probe() returns reachable:true on success', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse([{ type: 'text', text: 'pong' }]));
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');
    const result = await provider.probe();
    expect(result.reachable).toBe(true);
  });

  it('probe() returns reachable:false on error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');
    const result = await provider.probe();
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('Connection refused');
  });

  it('returns text from text blocks', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse([{ type: 'text', text: 'Hello, world!' }]));
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');
    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [], 100);
    expect(result.text).toBe('Hello, world!');
    expect(result.toolCalls).toHaveLength(0);
  });

  it('returns null text when only tool_use blocks are present', async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse([
      { type: 'tool_use', id: 'tc-1', name: 'tool', input: {} },
    ], 'tool_use'));
    const provider = new AnthropicInferenceProvider('claude-opus-4-5', new StubAuth(), 'https://api.anthropic.com/v1');
    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [{
      name: 'tool', description: 'desc', parameters: {},
    }], 100);
    expect(result.text).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
  });

  it('times out stalled requests', async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      const signal = (init as { signal?: AbortSignal }).signal;
      signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const provider = new AnthropicInferenceProvider(
      'claude-opus-4-5',
      new StubAuth(),
      'https://api.anthropic.com/v1',
      0,
      () => Date.now(),
      25,
    );

    const pending = provider.infer('sys', [{ role: 'user', content: 'hi' }], [], 100);
    const expectation = expect(pending).rejects.toThrow(/timed out after 25ms/);
    await vi.advanceTimersByTimeAsync(30);

    await expectation;
    vi.useRealTimers();
  });
});
