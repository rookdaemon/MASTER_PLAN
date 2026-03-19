/**
 * One-shot prompt runner tests.
 *
 * The runner takes an ILlmClient + config, sends a single prompt,
 * returns the response content. Pure function — no process globals,
 * no real HTTP calls.
 */
import { describe, it, expect, vi } from "vitest";
import { runOneShot, type OneShotConfig } from "../one-shot.js";
import type {
  ILlmClient,
  LlmInferenceResult,
  LlmProbeResult,
} from "../../llm-substrate/llm-substrate-adapter.js";

function makeStubClient(response: string): ILlmClient {
  return {
    probe: vi.fn<() => Promise<LlmProbeResult>>().mockResolvedValue({
      latencyMs: 50,
      reachable: true,
    }),
    infer: vi
      .fn<
        (
          systemPrompt: string,
          messages: Array<{ role: "user" | "assistant"; content: string }>,
          maxTokens: number
        ) => Promise<LlmInferenceResult>
      >()
      .mockResolvedValue({
        content: response,
        tokenLogprobs: [-0.1, -0.2],
        promptTokens: 10,
        completionTokens: 5,
        latencyMs: 100,
      }),
  };
}

const DEFAULT_CONFIG: OneShotConfig = {
  prompt: "Hello!",
  model: "claude-sonnet-4-20250514",
  systemPrompt: "You are a helpful assistant.",
  maxTokens: 4096,
};

describe("runOneShot", () => {
  it("sends the prompt and returns the response content", async () => {
    const client = makeStubClient("Hi there!");
    const result = await runOneShot(client, DEFAULT_CONFIG);
    expect(result.content).toBe("Hi there!");
  });

  it("passes the system prompt to the client", async () => {
    const client = makeStubClient("ok");
    await runOneShot(client, {
      ...DEFAULT_CONFIG,
      systemPrompt: "You are a philosopher.",
    });
    expect(client.infer).toHaveBeenCalledWith(
      "You are a philosopher.",
      [{ role: "user", content: "Hello!" }],
      4096
    );
  });

  it("passes the user prompt as a single user message", async () => {
    const client = makeStubClient("ok");
    await runOneShot(client, { ...DEFAULT_CONFIG, prompt: "Explain TDD" });
    const inferCall = vi.mocked(client.infer).mock.calls[0]!;
    expect(inferCall[1]).toEqual([{ role: "user", content: "Explain TDD" }]);
  });

  it("passes maxTokens to the client", async () => {
    const client = makeStubClient("ok");
    await runOneShot(client, { ...DEFAULT_CONFIG, maxTokens: 2048 });
    const inferCall = vi.mocked(client.infer).mock.calls[0]!;
    expect(inferCall[2]).toBe(2048);
  });

  it("returns latency and token counts in the result", async () => {
    const client = makeStubClient("response");
    const result = await runOneShot(client, DEFAULT_CONFIG);
    expect(result.latencyMs).toBe(100);
    expect(result.promptTokens).toBe(10);
    expect(result.completionTokens).toBe(5);
  });

  it("propagates client errors", async () => {
    const client = makeStubClient("");
    vi.mocked(client.infer).mockRejectedValue(new Error("API down"));
    await expect(runOneShot(client, DEFAULT_CONFIG)).rejects.toThrow("API down");
  });
});
