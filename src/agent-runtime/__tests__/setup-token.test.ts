/**
 * Tests for setup-token onboarding flow (agent-runtime)
 *
 * TDD: written before implementation.
 *
 * Test strategy:
 *   - Unit: validateSetupToken rejects empty, wrong prefix, too short
 *   - Unit: validateSetupToken accepts valid tokens
 *   - Unit: ITokenStore read/write round-trip
 *   - Unit: ITokenStore read returns null when no token stored
 *   - Unit: ensureSetupToken returns stored token without prompting
 *   - Unit: ensureSetupToken prompts when no token stored, stores result
 *   - Unit: ensureSetupToken re-prompts on invalid paste
 *   - Unit: formatSetupInstructions includes "claude setup-token"
 */

import { describe, it, expect, vi } from "vitest";
import {
  validateSetupToken,
  formatSetupInstructions,
  ensureSetupToken,
  type ITokenStore,
  type ILineReader,
} from "../setup-token.js";

// ── Test doubles ──────────────────────────────────────────────────────────────

class StubTokenStore implements ITokenStore {
  private token: string | null;

  constructor(existingToken: string | null = null) {
    this.token = existingToken;
  }

  read(): string | null {
    return this.token;
  }

  write(token: string): void {
    this.token = token;
  }
}

class StubLineReader implements ILineReader {
  private responses: string[];
  private callIndex = 0;
  readonly prompts: string[] = [];

  constructor(responses: string[]) {
    this.responses = responses;
  }

  async readLine(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    const response = this.responses[this.callIndex];
    if (response === undefined) {
      throw new Error(`StubLineReader: no response for call ${this.callIndex}`);
    }
    this.callIndex++;
    return response;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_TOKEN =
  "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";

describe("validateSetupToken", () => {
  it("returns error when token is empty", () => {
    expect(validateSetupToken("")).toBeDefined();
    expect(validateSetupToken("  ")).toBeDefined();
  });

  it("returns error when token has wrong prefix", () => {
    const err = validateSetupToken("sk-ant-api01-something");
    expect(err).toBeDefined();
    expect(err).toMatch(/sk-ant-oat01-/);
  });

  it("returns error when token is too short", () => {
    const err = validateSetupToken("sk-ant-oat01-tooshort");
    expect(err).toBeDefined();
    expect(err).toMatch(/short/i);
  });

  it("returns undefined for a valid token", () => {
    expect(validateSetupToken(VALID_TOKEN)).toBeUndefined();
  });

  it("trims whitespace before validating", () => {
    expect(validateSetupToken(`  ${VALID_TOKEN}  `)).toBeUndefined();
  });
});

// ── Instructions ──────────────────────────────────────────────────────────────

describe("formatSetupInstructions", () => {
  it("includes the claude setup-token command", () => {
    const text = formatSetupInstructions();
    expect(text).toContain("claude setup-token");
  });

  it("asks user to paste the token", () => {
    const text = formatSetupInstructions();
    expect(text).toMatch(/paste/i);
  });
});

// ── Token Store ───────────────────────────────────────────────────────────────

describe("ITokenStore (StubTokenStore)", () => {
  it("returns null when no token is stored", () => {
    const store = new StubTokenStore();
    expect(store.read()).toBeNull();
  });

  it("round-trips a stored token", () => {
    const store = new StubTokenStore();
    store.write(VALID_TOKEN);
    expect(store.read()).toBe(VALID_TOKEN);
  });
});

// ── ensureSetupToken ──────────────────────────────────────────────────────────

describe("ensureSetupToken", () => {
  it("returns stored token without prompting", async () => {
    const store = new StubTokenStore(VALID_TOKEN);
    const reader = new StubLineReader([]);

    const token = await ensureSetupToken(store, reader);

    expect(token).toBe(VALID_TOKEN);
    expect(reader.prompts).toHaveLength(0);
  });

  it("prompts user when no token is stored", async () => {
    const store = new StubTokenStore();
    const reader = new StubLineReader([VALID_TOKEN]);

    const token = await ensureSetupToken(store, reader);

    expect(token).toBe(VALID_TOKEN);
    expect(reader.prompts.length).toBeGreaterThan(0);
  });

  it("stores the token after successful paste", async () => {
    const store = new StubTokenStore();
    const reader = new StubLineReader([VALID_TOKEN]);

    await ensureSetupToken(store, reader);

    expect(store.read()).toBe(VALID_TOKEN);
  });

  it("re-prompts on invalid input then accepts valid input", async () => {
    const store = new StubTokenStore();
    const reader = new StubLineReader(["bad-token", VALID_TOKEN]);

    const token = await ensureSetupToken(store, reader);

    expect(token).toBe(VALID_TOKEN);
    expect(reader.prompts.length).toBe(2);
  });

  it("shows setup instructions before first prompt", async () => {
    const store = new StubTokenStore();
    const output: string[] = [];
    const reader = new StubLineReader([VALID_TOKEN]);

    await ensureSetupToken(store, reader, (msg) => output.push(msg));

    expect(output.some((line) => line.includes("claude setup-token"))).toBe(true);
  });

  it("trims pasted token before storing", async () => {
    const store = new StubTokenStore();
    const reader = new StubLineReader([`  ${VALID_TOKEN}  `]);

    await ensureSetupToken(store, reader);

    expect(store.read()).toBe(VALID_TOKEN);
  });
});
