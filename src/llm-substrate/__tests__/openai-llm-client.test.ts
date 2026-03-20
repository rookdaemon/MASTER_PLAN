/**
 * Tests for OpenAiLlmClient (modular OpenAI-compatible LLM client)
 *
 * TDD: written before implementation.
 *
 * Also covers local/Ollama endpoints since they use the OpenAI-compatible API.
 *
 * Test strategy:
 *   - Unit: infer() sends POST to {endpoint}/chat/completions
 *   - Unit: infer() includes system message in messages array
 *   - Unit: infer() requests logprobs
 *   - Unit: infer() attaches auth headers from IAuthProvider
 *   - Unit: infer() returns content, logprobs, and usage
 *   - Unit: probe() returns reachable:true / reachable:false
 *   - Unit: infer() throws on non-OK response
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAiLlmClient } from "../openai-llm-client.js";
import type { IAuthProvider } from "../auth-providers.js";

// ── Test doubles ──────────────────────────────────────────────────────────────

class StubAuthProvider implements IAuthProvider {
  constructor(private readonly headers: Record<string, string> = {}) {}
  getHeaders(): Record<string, string> { return this.headers; }
  isExpired(): boolean { return false; }
  requiresSystemIdentityPrefix(): boolean { return false; }
}

function makeOpenAiResponse(
  content: string = "Hello",
  logprobs: number[] = [-0.1, -0.5],
  promptTokens = 10,
  completionTokens = 5
) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [{
        message: { content },
        logprobs: { content: logprobs.map((lp) => ({ logprob: lp })) },
      }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
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

describe("OpenAiLlmClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST to {endpoint}/chat/completions with correct body", async () => {
    fetchSpy.mockResolvedValueOnce(makeOpenAiResponse());

    const client = new OpenAiLlmClient(
      "gpt-4o",
      new StubAuthProvider({ Authorization: "Bearer sk-test" }),
      "https://api.openai.com/v1"
    );

    await client.infer("System prompt", [{ role: "user", content: "Hi" }], 2048);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("gpt-4o");
    expect(body.max_tokens).toBe(2048);
    expect(body.messages[0]).toEqual({ role: "system", content: "System prompt" });
    expect(body.messages[1]).toEqual({ role: "user", content: "Hi" });
  });

  it("requests logprobs with top_logprobs=1", async () => {
    fetchSpy.mockResolvedValueOnce(makeOpenAiResponse());

    const client = new OpenAiLlmClient("gpt-4o", new StubAuthProvider(), "https://api.openai.com/v1");
    await client.infer("sys", [{ role: "user", content: "test" }], 100);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.logprobs).toBe(true);
    expect(body.top_logprobs).toBe(1);
  });

  it("attaches auth headers from IAuthProvider", async () => {
    fetchSpy.mockResolvedValueOnce(makeOpenAiResponse());

    const auth = new StubAuthProvider({ Authorization: "Bearer sk-my-key" });
    const client = new OpenAiLlmClient("gpt-4o", auth, "https://api.openai.com/v1");
    await client.infer("sys", [{ role: "user", content: "test" }], 100);

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer sk-my-key");
  });

  it("returns content, logprobs, and usage", async () => {
    fetchSpy.mockResolvedValueOnce(makeOpenAiResponse("Result text", [-0.2, -0.8], 20, 12));

    const client = new OpenAiLlmClient("gpt-4o", new StubAuthProvider(), "https://api.openai.com/v1");
    const result = await client.infer("sys", [{ role: "user", content: "test" }], 100);

    expect(result.content).toBe("Result text");
    expect(result.tokenLogprobs).toEqual([-0.2, -0.8]);
    expect(result.promptTokens).toBe(20);
    expect(result.completionTokens).toBe(12);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns empty logprobs when not present in response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: "No logprobs" } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
    });

    const client = new OpenAiLlmClient("gpt-3.5-turbo", new StubAuthProvider(), "https://api.openai.com/v1");
    const result = await client.infer("sys", [{ role: "user", content: "test" }], 100);

    expect(result.tokenLogprobs).toEqual([]);
    expect(result.content).toBe("No logprobs");
  });

  it("throws on non-OK response", async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(429, "Too Many Requests"));

    const client = new OpenAiLlmClient("gpt-4o", new StubAuthProvider(), "https://api.openai.com/v1");

    await expect(
      client.infer("sys", [{ role: "user", content: "test" }], 100)
    ).rejects.toThrow(/429/);
  });

  it("probe() returns reachable:true on success", async () => {
    fetchSpy.mockResolvedValueOnce(makeOpenAiResponse("pong", [], 3, 1));

    const client = new OpenAiLlmClient("gpt-4o", new StubAuthProvider(), "https://api.openai.com/v1");
    const result = await client.probe();

    expect(result.reachable).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("probe() returns reachable:false on error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const client = new OpenAiLlmClient("gpt-4o", new StubAuthProvider(), "https://api.openai.com/v1");
    const result = await client.probe();

    expect(result.reachable).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("works with local Ollama endpoint", async () => {
    fetchSpy.mockResolvedValueOnce(makeOpenAiResponse("Ollama response"));

    const client = new OpenAiLlmClient("llama3", new StubAuthProvider(), "http://localhost:11434/v1");
    const result = await client.infer("sys", [{ role: "user", content: "test" }], 100);

    expect(result.content).toBe("Ollama response");
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
  });
});
