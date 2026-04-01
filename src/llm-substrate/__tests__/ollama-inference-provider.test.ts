/**
 * Tests for OllamaInferenceProvider.
 *
 * Verifies:
 *   - infer() injects tool descriptions into system prompt
 *   - infer() parses <tool_call> blocks from response text
 *   - infer() maps tool_results to plain text user messages
 *   - infer() handles malformed <tool_call> JSON gracefully
 *   - probe() returns reachable:true/false
 *   - Empty text without tool calls returns null text
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaInferenceProvider } from '../ollama-inference-provider.js';
import type { IAuthProvider } from '../auth-providers.js';

class StubAuth implements IAuthProvider {
  constructor(private readonly hdrs: Record<string, string> = {}) {}
  getHeaders() { return this.hdrs; }
  isExpired() { return false; }
  requiresSystemIdentityPrefix() { return false; }
}

function makeOllamaResponse(content: string) {
  return {
    ok: true, status: 200, statusText: 'OK',
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  };
}

function makeErrorResponse(status = 500) {
  return {
    ok: false, status, statusText: 'Error',
    text: async () => '{"error":"server error"}',
  };
}

describe('OllamaInferenceProvider', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends to /chat/completions with system message', async () => {
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse('Hello'));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    await provider.infer('You are a bot', [{ role: 'user', content: 'hi' }], [], 100);

    const [url, opts] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    const body = JSON.parse(opts.body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are a bot');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('hi');
  });

  it('injects tool descriptions into system prompt when tools provided', async () => {
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse('ok'));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    await provider.infer('Base prompt', [{ role: 'user', content: 'hi' }], [{
      name: 'my_tool',
      description: 'Does something useful',
      parameters: {
        type: 'object',
        properties: { x: { type: 'string', description: 'The x param' } },
        required: ['x'],
      },
    }], 100);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    const systemContent: string = body.messages[0].content;
    expect(systemContent).toContain('Base prompt');
    expect(systemContent).toContain('my_tool');
    expect(systemContent).toContain('Does something useful');
    expect(systemContent).toContain('<tool_call>');
  });

  it('parses <tool_call> blocks into ToolCall[]', async () => {
    const responseText = 'Let me call the tool.\n<tool_call>{"name":"my_tool","args":{"x":"hello"}}</tool_call>\nDone.';
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse(responseText));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [{
      name: 'my_tool', description: 'desc', parameters: {},
    }], 100);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe('my_tool');
    expect(result.toolCalls[0]!.args).toEqual({ x: 'hello' });
    // Tool call block is removed; surrounding newlines may collapse into double-newline
    expect(result.text).toContain('Let me call the tool.');
    expect(result.text).toContain('Done.');
    expect(result.text).not.toContain('<tool_call>');
  });

  it('assigns unique IDs to each tool call', async () => {
    const responseText = '<tool_call>{"name":"a","args":{}}</tool_call><tool_call>{"name":"b","args":{}}</tool_call>';
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse(responseText));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [], 100);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]!.id).not.toBe(result.toolCalls[1]!.id);
  });

  it('skips malformed <tool_call> JSON gracefully', async () => {
    const responseText = 'text before\n<tool_call>not valid json{</tool_call>\ntext after';
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse(responseText));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [], 100);

    expect(result.toolCalls).toHaveLength(0);
    expect(result.text).toBeTruthy(); // should still have the clean text
  });

  it('maps tool_results message to plain text user message', async () => {
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse('ok'));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    await provider.infer('sys', [
      { role: 'user', content: 'initial' },
      { role: 'tool_results', results: [
        { callId: 'tc-1', content: 'result content', isError: false },
        { callId: 'tc-2', content: 'error content', isError: true },
      ]},
    ], [], 100);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    const toolResultMsg = body.messages.find((m: { role: string; content: string }) => m.content.includes('result content'));
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.role).toBe('user');
    expect(toolResultMsg.content).toContain('[OK]');
    expect(toolResultMsg.content).toContain('[ERROR]');
    expect(toolResultMsg.content).toContain('error content');
  });

  it('returns null text when response is empty after stripping tool calls', async () => {
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse('<tool_call>{"name":"t","args":{}}</tool_call>'));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [{
      name: 't', description: 'd', parameters: {},
    }], 100);

    expect(result.text).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
  });

  it('throws on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(500));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');

    await expect(
      provider.infer('sys', [{ role: 'user', content: 'hi' }], [], 100)
    ).rejects.toThrow(/500/);
  });

  it('probe() returns reachable:true on success', async () => {
    fetchSpy.mockResolvedValueOnce(makeOllamaResponse('pong'));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');
    const result = await provider.probe();
    expect(result.reachable).toBe(true);
  });

  it('probe() returns reachable:false on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');
    const result = await provider.probe();
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('Connection refused');
  });

  it('returns token counts from usage field', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'resp' } }],
        usage: { prompt_tokens: 42, completion_tokens: 17 },
      }),
    });
    const provider = new OllamaInferenceProvider('llama3', new StubAuth(), 'http://localhost:11434/v1');
    const result = await provider.infer('sys', [{ role: 'user', content: 'hi' }], [], 100);
    expect(result.promptTokens).toBe(42);
    expect(result.completionTokens).toBe(17);
  });
});
