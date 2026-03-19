/**
 * Auth providers for LLM substrate adapters.
 *
 * Pluggable authentication strategy — each provider knows how to produce
 * the HTTP headers required by its backend. New providers (e.g. GCP IAM,
 * Azure AD) can be added by implementing IAuthProvider.
 *
 * Environment abstractions (per Claude.md):
 *   - ICredentialReader wraps file system access (injectable, mockable)
 *   - IClock wraps time access (injectable, mockable)
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { LlmProvider } from "./llm-substrate-adapter.js";

// ── Environment abstractions ─────────────────────────────────────────────────

/** Abstraction over file system credential reading — mockable in tests. */
export interface ICredentialReader {
  /** Read and return the raw credential file content. Throws on failure. */
  read(): string;
}

/** Abstraction over system clock — mockable in tests. */
export interface IClock {
  /** Return current time in milliseconds since epoch. */
  now(): number;
}

/** Default clock using the real system time. */
export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

/**
 * Default credential reader for Claude Code OAuth tokens.
 * Reads ~/.claude/.credentials.json from the real file system.
 */
export class ClaudeCredentialFileReader implements ICredentialReader {
  private readonly path: string;

  constructor(path?: string) {
    this.path = path ?? join(homedir(), ".claude", ".credentials.json");
  }

  read(): string {
    return readFileSync(this.path, "utf-8");
  }
}

// ── Interface ────────────────────────────────────────────────────────────────

/** Pluggable auth strategy for LLM HTTP clients. */
export interface IAuthProvider {
  /** Return auth headers to attach to every LLM API request. */
  getHeaders(): Record<string, string>;
  /** True if the credential has a known expiry and that expiry has passed. */
  isExpired(): boolean;
}

// ── ApiKeyAuthProvider ───────────────────────────────────────────────────────

/**
 * Static API-key auth. Uses the provider convention:
 *   - anthropic → x-api-key header
 *   - openai / local / others → Authorization: Bearer header
 */
export class ApiKeyAuthProvider implements IAuthProvider {
  constructor(
    private readonly provider: LlmProvider,
    private readonly apiKey: string | undefined
  ) {}

  getHeaders(): Record<string, string> {
    if (!this.apiKey) return {};
    if (this.provider === "anthropic") {
      return { "x-api-key": this.apiKey };
    }
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  isExpired(): boolean {
    return false; // Static keys don't expire
  }
}

// ── NoopAuthProvider ─────────────────────────────────────────────────────────

/** No authentication — for unauthenticated local endpoints (e.g. Ollama). */
export class NoopAuthProvider implements IAuthProvider {
  getHeaders(): Record<string, string> {
    return {};
  }

  isExpired(): boolean {
    return false;
  }
}

// ── ClaudeOAuthProvider ──────────────────────────────────────────────────────

/** Shape of the OAuth credential object inside ~/.claude/.credentials.json. */
export interface ClaudeOAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  rateLimitTier: string;
  subscriptionType: string;
  scopes: string;
}

/**
 * OAuth-based auth for Anthropic via Claude Code subscription credentials.
 *
 * Reads the OAuth access token from ~/.claude/.credentials.json and uses
 * `Authorization: Bearer <token>` headers. Billing routes through the
 * user's Claude Pro/Max subscription.
 */
export class ClaudeOAuthProvider implements IAuthProvider {
  readonly subscriptionType: string;
  private readonly accessToken: string;
  private readonly expiresAt: Date;
  private readonly clock: IClock;

  constructor(credentials: ClaudeOAuthCredentials, clock: IClock = new SystemClock()) {
    this.accessToken = credentials.accessToken;
    this.expiresAt = new Date(credentials.expiresAt);
    this.subscriptionType = credentials.subscriptionType;
    this.clock = clock;
  }

  getHeaders(): Record<string, string> {
    if (this.isExpired()) {
      throw new Error(
        `[ClaudeOAuthProvider] OAuth token expired at ${this.expiresAt.toISOString()}. ` +
        `Re-authenticate with \`claude login\` to refresh credentials.`
      );
    }
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  isExpired(): boolean {
    return this.clock.now() >= this.expiresAt.getTime();
  }

  /**
   * Read credentials via an ICredentialReader and construct a provider.
   *
   * The reader abstracts file system access so tests can inject a stub.
   * Expected credential file shape: { claudeAiOauth: { accessToken, refreshToken, expiresAt, ... } }
   */
  static fromCredentialFile(
    reader: ICredentialReader,
    clock: IClock = new SystemClock()
  ): ClaudeOAuthProvider {
    const fileContent = reader.read();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      throw new Error(
        "[ClaudeOAuthProvider] Failed to parse credential file as JSON"
      );
    }

    const oauth = parsed.claudeAiOauth;
    if (!oauth || typeof oauth !== "object") {
      throw new Error(
        "[ClaudeOAuthProvider] Credential file missing 'claudeAiOauth' key"
      );
    }

    const creds = oauth as Record<string, unknown>;
    if (!creds.accessToken || typeof creds.accessToken !== "string") {
      throw new Error(
        "[ClaudeOAuthProvider] Credential file missing 'accessToken' in claudeAiOauth"
      );
    }

    return new ClaudeOAuthProvider(creds as unknown as ClaudeOAuthCredentials, clock);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export interface AuthProviderOptions {
  apiKey?: string;
  /** Injectable credential reader for anthropic-oauth. Defaults to reading ~/.claude/.credentials.json. */
  credentialReader?: ICredentialReader;
  /** Injectable clock for expiry checks. Defaults to SystemClock. */
  clock?: IClock;
}

/**
 * Create the appropriate IAuthProvider for a given LLM provider type.
 *
 * Extend this factory when adding new auth strategies (e.g. GCP, Azure).
 */
export function createAuthProvider(
  provider: LlmProvider,
  options: AuthProviderOptions
): IAuthProvider {
  switch (provider) {
    case "anthropic-oauth": {
      const reader = options.credentialReader;
      if (!reader) {
        throw new Error(
          `[createAuthProvider] provider "anthropic-oauth" requires a credentialReader ` +
          `(e.g. ClaudeCredentialFileReader or a test stub)`
        );
      }
      return ClaudeOAuthProvider.fromCredentialFile(reader, options.clock);
    }
    case "anthropic":
    case "openai":
      if (options.apiKey) {
        return new ApiKeyAuthProvider(provider, options.apiKey);
      }
      return new NoopAuthProvider();
    case "local":
      if (options.apiKey) {
        return new ApiKeyAuthProvider(provider, options.apiKey);
      }
      return new NoopAuthProvider();
    default:
      return new NoopAuthProvider();
  }
}
