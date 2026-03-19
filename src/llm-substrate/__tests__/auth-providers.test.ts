/**
 * Tests for auth-providers (0.3.1.5.1 — LLM Auth Abstraction)
 *
 * TDD: written before implementation.
 *
 * Test strategy:
 *   - Unit: ApiKeyAuthProvider returns correct headers per provider convention
 *   - Unit: ClaudeOAuthProvider reads credentials via injectable ICredentialReader
 *   - Unit: ClaudeOAuthProvider uses injectable IClock for expiry checks
 *   - Unit: ClaudeOAuthProvider throws on missing/malformed credentials
 *   - Unit: NoopAuthProvider returns empty headers (for unauthenticated local endpoints)
 *   - Unit: createAuthProvider factory reads credential file via ICredentialReader
 *   - Integration: LlmSubstrateAdapter wires the correct auth provider from config
 */

import { describe, it, expect } from "vitest";
import {
  type IAuthProvider,
  type ICredentialReader,
  type IClock,
  ApiKeyAuthProvider,
  SetupTokenAuthProvider,
  ClaudeOAuthProvider,
  NoopAuthProvider,
  createAuthProvider,
} from "../auth-providers.js";
import { LlmSubstrateAdapter, type ILlmClient, type LlmInferenceResult, type LlmProbeResult } from "../llm-substrate-adapter.js";
import type { SubstrateConfig } from "../../conscious-core/types.js";

// ── Test doubles ──────────────────────────────────────────────────────────────

/** Fixed clock for deterministic expiry tests. */
class StubClock implements IClock {
  constructor(public nowMs: number = Date.now()) {}
  now(): number { return this.nowMs; }
}

/** In-memory credential reader — no file system access. */
class StubCredentialReader implements ICredentialReader {
  constructor(private readonly content: string | null) {}
  read(): string {
    if (this.content === null) {
      throw new Error("ENOENT: no such file or directory");
    }
    return this.content;
  }
}

const FIXED_NOW = new Date("2026-03-19T12:00:00Z").getTime();

function makeCredentials(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "sk-ant-oauth-test-token-abc123",
    refreshToken: "rt-test-refresh-xyz",
    expiresAt: new Date(FIXED_NOW + 3_600_000).toISOString(), // 1 hour after FIXED_NOW
    rateLimitTier: "standard",
    subscriptionType: "max",
    scopes: "default",
    ...overrides,
  };
}

function makeExpiredCredentials() {
  return makeCredentials({
    expiresAt: new Date(FIXED_NOW - 60_000).toISOString(), // 1 minute before FIXED_NOW
  });
}

function makeCredentialFileContent(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ claudeAiOauth: makeCredentials(overrides) });
}

class MockLlmClient implements ILlmClient {
  async probe(): Promise<LlmProbeResult> {
    return { latencyMs: 5, reachable: true };
  }
  async infer(): Promise<LlmInferenceResult> {
    return {
      content: "Here is the information you requested.",
      tokenLogprobs: [],
      promptTokens: 10,
      completionTokens: 8,
      latencyMs: 50,
    };
  }
}

function makeConfig(overrides: Record<string, unknown> = {}): SubstrateConfig {
  return {
    type: "llm",
    parameters: {
      provider: "openai",
      modelId: "gpt-test",
      selfModelPath: `/tmp/auth-test-${Math.random().toString(36).slice(2)}.json`,
      contextWindowTokens: 8192,
      tContinuityMs: 2000,
      systemPromptTemplate: "You are a test agent.",
      ...overrides,
    },
  };
}

// ── ApiKeyAuthProvider ────────────────────────────────────────────────────────

describe("ApiKeyAuthProvider", () => {
  it("returns Authorization: Bearer header for openai provider", () => {
    const provider = new ApiKeyAuthProvider("openai", "sk-test-key-123");
    const headers = provider.getHeaders();
    expect(headers["Authorization"]).toBe("Bearer sk-test-key-123");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("returns x-api-key header for anthropic provider", () => {
    const provider = new ApiKeyAuthProvider("anthropic", "sk-ant-key-456");
    const headers = provider.getHeaders();
    expect(headers["x-api-key"]).toBe("sk-ant-key-456");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("returns Authorization: Bearer header for local provider", () => {
    const provider = new ApiKeyAuthProvider("local", "local-key");
    const headers = provider.getHeaders();
    expect(headers["Authorization"]).toBe("Bearer local-key");
  });

  it("returns empty headers when no apiKey is provided", () => {
    const provider = new ApiKeyAuthProvider("openai", undefined);
    const headers = provider.getHeaders();
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it("isExpired() always returns false (static key never expires)", () => {
    const provider = new ApiKeyAuthProvider("openai", "sk-test");
    expect(provider.isExpired()).toBe(false);
  });

  it("requiresSystemIdentityPrefix() returns false", () => {
    const provider = new ApiKeyAuthProvider("anthropic", "sk-test");
    expect(provider.requiresSystemIdentityPrefix()).toBe(false);
  });
});

// ── SetupTokenAuthProvider ────────────────────────────────────────────────────

describe("SetupTokenAuthProvider", () => {
  const token = "sk-ant-oat01-testtoken123456789012345678901234567890123456789012345678901234567890";

  it("returns Authorization Bearer header with the setup-token", () => {
    const provider = new SetupTokenAuthProvider(token);
    const headers = provider.getHeaders();
    expect(headers["Authorization"]).toBe(`Bearer ${token}`);
  });

  it("does not include x-api-key header", () => {
    const provider = new SetupTokenAuthProvider(token);
    expect(provider.getHeaders()["x-api-key"]).toBeUndefined();
  });

  it("includes anthropic-beta header with OAuth and tool-streaming flags", () => {
    const provider = new SetupTokenAuthProvider(token);
    const headers = provider.getHeaders();
    expect(headers["anthropic-beta"]).toBe("claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14");
  });

  it("includes user-agent and x-app headers", () => {
    const provider = new SetupTokenAuthProvider(token);
    const headers = provider.getHeaders();
    expect(headers["user-agent"]).toBe("claude-cli/2.1.75");
    expect(headers["x-app"]).toBe("cli");
  });

  it("isExpired() always returns false", () => {
    const provider = new SetupTokenAuthProvider(token);
    expect(provider.isExpired()).toBe(false);
  });

  it("requiresSystemIdentityPrefix() returns true", () => {
    const provider = new SetupTokenAuthProvider(token);
    expect(provider.requiresSystemIdentityPrefix()).toBe(true);
  });
});

// ── NoopAuthProvider ──────────────────────────────────────────────────────────

describe("NoopAuthProvider", () => {
  it("returns empty headers", () => {
    const provider = new NoopAuthProvider();
    const headers = provider.getHeaders();
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it("isExpired() always returns false", () => {
    const provider = new NoopAuthProvider();
    expect(provider.isExpired()).toBe(false);
  });

  it("requiresSystemIdentityPrefix() returns false", () => {
    const provider = new NoopAuthProvider();
    expect(provider.requiresSystemIdentityPrefix()).toBe(false);
  });
});

// ── ClaudeOAuthProvider ──────────────────────────────────────────────────────

describe("ClaudeOAuthProvider", () => {
  const clock = new StubClock(FIXED_NOW);

  it("returns Authorization Bearer header with OAuth access token", () => {
    const creds = makeCredentials();
    const provider = new ClaudeOAuthProvider(creds, clock);
    const headers = provider.getHeaders();
    expect(headers["Authorization"]).toBe(`Bearer ${creds.accessToken}`);
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("includes anthropic-beta header with OAuth and tool-streaming flags", () => {
    const creds = makeCredentials();
    const provider = new ClaudeOAuthProvider(creds, clock);
    const headers = provider.getHeaders();
    expect(headers["anthropic-beta"]).toBe("claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14");
  });

  it("isExpired() returns false when clock is before expiresAt", () => {
    const creds = makeCredentials(); // expires 1h after FIXED_NOW
    const provider = new ClaudeOAuthProvider(creds, clock);
    expect(provider.isExpired()).toBe(false);
  });

  it("isExpired() returns true when clock is past expiresAt", () => {
    const creds = makeExpiredCredentials(); // expired 1m before FIXED_NOW
    const provider = new ClaudeOAuthProvider(creds, clock);
    expect(provider.isExpired()).toBe(true);
  });

  it("isExpired() transitions when clock advances past expiresAt", () => {
    const creds = makeCredentials(); // expires at FIXED_NOW + 1h
    const advancingClock = new StubClock(FIXED_NOW);
    const provider = new ClaudeOAuthProvider(creds, advancingClock);

    expect(provider.isExpired()).toBe(false);

    // Advance clock past expiry
    advancingClock.nowMs = FIXED_NOW + 4_000_000;
    expect(provider.isExpired()).toBe(true);
  });

  it("getHeaders() throws when token is expired", () => {
    const creds = makeExpiredCredentials();
    const provider = new ClaudeOAuthProvider(creds, clock);
    expect(() => provider.getHeaders()).toThrow(/expired/i);
  });

  it("exposes subscriptionType for rate-limit awareness", () => {
    const creds = makeCredentials({ subscriptionType: "max" });
    const provider = new ClaudeOAuthProvider(creds, clock);
    expect(provider.subscriptionType).toBe("max");
  });

  it("requiresSystemIdentityPrefix() returns true", () => {
    const creds = makeCredentials();
    const provider = new ClaudeOAuthProvider(creds, clock);
    expect(provider.requiresSystemIdentityPrefix()).toBe(true);
  });

  describe("fromCredentialFile()", () => {
    it("reads the credential file via ICredentialReader and returns a provider", () => {
      const fileContent = makeCredentialFileContent();
      const reader = new StubCredentialReader(fileContent);
      const provider = ClaudeOAuthProvider.fromCredentialFile(reader, clock);
      expect(provider.getHeaders()["Authorization"]).toBeDefined();
    });

    it("throws when credential reader fails (file not found)", () => {
      const reader = new StubCredentialReader(null);
      expect(() =>
        ClaudeOAuthProvider.fromCredentialFile(reader, clock)
      ).toThrow(/ENOENT/i);
    });

    it("throws when credential file is missing claudeAiOauth key", () => {
      const reader = new StubCredentialReader(JSON.stringify({ other: "data" }));
      expect(() =>
        ClaudeOAuthProvider.fromCredentialFile(reader, clock)
      ).toThrow(/claudeAiOauth/i);
    });

    it("throws when credential file has invalid JSON", () => {
      const reader = new StubCredentialReader("not valid json{{{");
      expect(() =>
        ClaudeOAuthProvider.fromCredentialFile(reader, clock)
      ).toThrow();
    });

    it("throws when accessToken is missing", () => {
      const creds = makeCredentials();
      delete (creds as Record<string, unknown>)["accessToken"];
      const reader = new StubCredentialReader(JSON.stringify({ claudeAiOauth: creds }));
      expect(() =>
        ClaudeOAuthProvider.fromCredentialFile(reader, clock)
      ).toThrow(/accessToken/i);
    });
  });
});

// ── createAuthProvider factory ────────────────────────────────────────────────

describe("createAuthProvider()", () => {
  const clock = new StubClock(FIXED_NOW);

  it("returns ApiKeyAuthProvider for provider='openai' with an apiKey", () => {
    const auth = createAuthProvider("openai", { apiKey: "sk-test" });
    expect(auth).toBeInstanceOf(ApiKeyAuthProvider);
    expect(auth.getHeaders()["Authorization"]).toBe("Bearer sk-test");
  });

  it("returns ApiKeyAuthProvider for provider='anthropic' with an apiKey", () => {
    const auth = createAuthProvider("anthropic", { apiKey: "sk-ant-test" });
    expect(auth).toBeInstanceOf(ApiKeyAuthProvider);
    expect(auth.getHeaders()["x-api-key"]).toBe("sk-ant-test");
  });

  it("returns NoopAuthProvider for provider='local' with no apiKey", () => {
    const auth = createAuthProvider("local", {});
    expect(auth).toBeInstanceOf(NoopAuthProvider);
  });

  it("returns ClaudeOAuthProvider for provider='anthropic-oauth' with credentialReader", () => {
    const reader = new StubCredentialReader(makeCredentialFileContent());
    const auth = createAuthProvider("anthropic-oauth", { credentialReader: reader, clock });
    expect(auth).toBeInstanceOf(ClaudeOAuthProvider);
    expect(auth.getHeaders()["Authorization"]).toBeDefined();
  });

  it("throws for provider='anthropic-oauth' when no credentialReader is provided", () => {
    expect(() => createAuthProvider("anthropic-oauth", {})).toThrow(/credentialReader/i);
  });
});

// ── Integration: LlmSubstrateAdapter with anthropic-oauth ────────────────────

describe("LlmSubstrateAdapter with anthropic-oauth provider", () => {
  const clock = new StubClock(FIXED_NOW);

  it("initializes successfully with anthropic-oauth config + credentialReader", () => {
    const reader = new StubCredentialReader(makeCredentialFileContent());
    const adapter = new LlmSubstrateAdapter();
    adapter.setClient(new MockLlmClient());
    adapter.initialize(
      makeConfig({
        provider: "anthropic-oauth",
        modelId: "claude-opus-4-5",
        credentialReader: reader,
        clock,
      })
    );

    const health = adapter.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it("allocate() returns handle with provider='anthropic-oauth'", () => {
    const reader = new StubCredentialReader(makeCredentialFileContent());
    const adapter = new LlmSubstrateAdapter();
    adapter.setClient(new MockLlmClient());
    adapter.initialize(
      makeConfig({
        provider: "anthropic-oauth",
        modelId: "claude-opus-4-5",
        credentialReader: reader,
        clock,
      })
    );

    const handle = adapter.allocate({
      minCapacity: 100,
      preferredCapacity: 4096,
      requiredCapabilities: [],
    });
    expect(handle.type).toBe("llm");
  });

  it("anthropic-oauth supports same capabilities as anthropic", () => {
    const reader = new StubCredentialReader(makeCredentialFileContent());
    const adapter = new LlmSubstrateAdapter();
    adapter.setClient(new MockLlmClient());
    adapter.initialize(
      makeConfig({
        provider: "anthropic-oauth",
        modelId: "claude-opus-4-5",
        credentialReader: reader,
        clock,
      })
    );

    const caps = adapter.getCapabilities();
    expect(caps.supportedModalities).toContain("text");
  });

  it("runInferenceCycle works with anthropic-oauth provider", async () => {
    const reader = new StubCredentialReader(makeCredentialFileContent());
    const adapter = new LlmSubstrateAdapter();
    adapter.setClient(new MockLlmClient());
    adapter.initialize(
      makeConfig({
        provider: "anthropic-oauth",
        modelId: "claude-opus-4-5",
        credentialReader: reader,
        clock,
      })
    );
    adapter.allocate({ minCapacity: 100, preferredCapacity: 4096, requiredCapabilities: [] });

    const result = await adapter.runInferenceCycle("Hello");
    expect(typeof result.content).toBe("string");
    expect(result.cProxy).toBeGreaterThanOrEqual(0);
  });
});
