/**
 * Tests for AnthropicLlmClient (modular Anthropic/Claude LLM client)
 *
 * TDD: written before implementation.
 *
 * Test strategy:
 *   - Unit: constructor accepts auth provider and endpoint
 *   - Unit: infer() sends to /messages with correct body shape
 *   - Unit: infer() attaches auth headers from IAuthProvider
 *   - Unit: infer() includes anthropic-version header
 *   - Unit: infer() returns empty tokenLogprobs (Anthropic doesn't expose them)
 *   - Unit: probe() returns reachable:true on success, reachable:false on failure
 *   - Unit: infer() throws on non-OK response
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicLlmClient } from "../anthropic-llm-client.js";
import type { IAuthProvider } from "../auth-providers.js";

// ── Test doubles ──────────────────────────────────────────────────────────────

class StubAuthProvider implements IAuthProvider {
  constructor(private readonly headers: Record<string, string> = {}) {}
  getHeaders(): Record<string, string> { return this.headers; }
  isExpired(): boolean { return false; }
}

function makeAnthropicResponse(content: string = "Hello", inputTokens = 10, outputTokens = 5) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      content: [{ type: "text", text: content }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  };
}

function makeErrorResponse(status = 500, statusText = "Internal Server Error") {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AnthropicLlmClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST to {endpoint}/messages with correct body shape", async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());

    const client = new AnthropicLlmClient(
      "claude-opus-4-5",
      new StubAuthProvider({ Authorization: "Bearer test-token" }),
      "https://api.anthropic.com/v1"
    );

    await client.infer("System prompt", [{ role: "user", content: "Hi" }], 1024);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("claude-opus-4-5");
    expect(body.max_tokens).toBe(1024);
    expect(body.system).toBe("System prompt");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("includes anthropic-version header", async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());

    const client = new AnthropicLlmClient(
      "claude-opus-4-5",
      new StubAuthProvider(),
      "https://api.anthropic.com/v1"
    );

    await client.infer("sys", [{ role: "user", content: "test" }], 100);

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("attaches auth headers from IAuthProvider", async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());

    const auth = new StubAuthProvider({ Authorization: "Bearer my-oauth-token" });
    const client = new AnthropicLlmClient("claude-opus-4-5", auth, "https://api.anthropic.com/v1");

    await client.infer("sys", [{ role: "user", content: "test" }], 100);

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer my-oauth-token");
  });

  it("attaches x-api-key header when auth provider returns it", async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());

    const auth = new StubAuthProvider({ "x-api-key": "sk-ant-apikey" });
    const client = new AnthropicLlmClient("claude-opus-4-5", auth, "https://api.anthropic.com/v1");

    await client.infer("sys", [{ role: "user", content: "test" }], 100);

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["x-api-key"]).toBe("sk-ant-apikey");
  });

  it("returns content and usage from Anthropic response", async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse("Test response", 15, 8));

    const client = new AnthropicLlmClient("claude-opus-4-5", new StubAuthProvider(), "https://api.anthropic.com/v1");
    const result = await client.infer("sys", [{ role: "user", content: "test" }], 100);

    expect(result.content).toBe("Test response");
    expect(result.promptTokens).toBe(15);
    expect(result.completionTokens).toBe(8);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns empty tokenLogprobs (Anthropic does not expose them)", async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse());

    const client = new AnthropicLlmClient("claude-opus-4-5", new StubAuthProvider(), "https://api.anthropic.com/v1");
    const result = await client.infer("sys", [{ role: "user", content: "test" }], 100);

    expect(result.tokenLogprobs).toEqual([]);
  });

  it("throws on non-OK response", async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(401, "Unauthorized"));

    const client = new AnthropicLlmClient("claude-opus-4-5", new StubAuthProvider(), "https://api.anthropic.com/v1");

    await expect(
      client.infer("sys", [{ role: "user", content: "test" }], 100)
    ).rejects.toThrow(/401/);
  });

  it("probe() returns reachable:true on success", async () => {
    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse("pong", 3, 1));

    const client = new AnthropicLlmClient("claude-opus-4-5", new StubAuthProvider(), "https://api.anthropic.com/v1");
    const result = await client.probe();

    expect(result.reachable).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("probe() returns reachable:false on error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Connection refused"));

    const client = new AnthropicLlmClient("claude-opus-4-5", new StubAuthProvider(), "https://api.anthropic.com/v1");
    const result = await client.probe();

    expect(result.reachable).toBe(false);
    expect(result.error).toContain("Connection refused");
  });

  it("concatenates multiple text blocks from response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        content: [
          { type: "text", text: "Part 1. " },
          { type: "tool_use", id: "t1" },
          { type: "text", text: "Part 2." },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });

    const client = new AnthropicLlmClient("claude-opus-4-5", new StubAuthProvider(), "https://api.anthropic.com/v1");
    const result = await client.infer("sys", [{ role: "user", content: "test" }], 100);

    expect(result.content).toBe("Part 1. Part 2.");
  });
});
