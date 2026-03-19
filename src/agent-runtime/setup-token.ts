/**
 * Setup-token onboarding for Anthropic API access.
 *
 * When the agent runtime starts with provider "anthropic-oauth" and no
 * stored token exists, it instructs the user to run `claude setup-token`
 * and paste the result. The token is validated and persisted for reuse.
 *
 * Environment abstractions (per Claude.md):
 *   - ITokenStore wraps credential persistence (injectable, mockable)
 *   - ILineReader wraps stdin reading (injectable, mockable)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

// ── Abstractions ─────────────────────────────────────────────────────────────

/** Abstraction over token persistence — mockable in tests. */
export interface ITokenStore {
  /** Read stored token, or null if none exists. */
  read(): string | null;
  /** Persist a validated token. */
  write(token: string): void;
}

/** Abstraction over interactive line input — mockable in tests. */
export interface ILineReader {
  /** Show a prompt and return the user's input line. */
  readLine(prompt: string): Promise<string>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SETUP_TOKEN_PREFIX = "sk-ant-oat01-";
const SETUP_TOKEN_MIN_LENGTH = 80;

// ── Validation ───────────────────────────────────────────────────────────────

/** Validate a setup-token string. Returns an error message, or undefined if valid. */
export function validateSetupToken(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Token is required.";
  }
  if (!trimmed.startsWith(SETUP_TOKEN_PREFIX)) {
    return `Expected token starting with ${SETUP_TOKEN_PREFIX}`;
  }
  if (trimmed.length < SETUP_TOKEN_MIN_LENGTH) {
    return "Token looks too short; paste the full setup-token.";
  }
  return undefined;
}

// ── Instructions ─────────────────────────────────────────────────────────────

/** Format the user-facing instructions for obtaining a setup-token. */
export function formatSetupInstructions(): string {
  return [
    "",
    "  No Anthropic setup-token found.",
    "",
    "  To authenticate, run this in a separate terminal:",
    "",
    "    claude setup-token",
    "",
    "  Then paste the generated token below.",
    "",
  ].join("\n");
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Ensure a valid setup-token is available.
 *
 * If a token is already stored, returns it immediately.
 * Otherwise, prints instructions and prompts the user to paste one.
 * Re-prompts on invalid input until a valid token is provided.
 */
export async function ensureSetupToken(
  store: ITokenStore,
  reader: ILineReader,
  log: (msg: string) => void = (msg) => process.stderr.write(msg + "\n"),
): Promise<string> {
  const existing = store.read();
  if (existing) {
    return existing;
  }

  log(formatSetupInstructions());

  while (true) {
    const raw = await reader.readLine("  Paste setup-token: ");
    const trimmed = raw.trim();
    const error = validateSetupToken(trimmed);
    if (error) {
      log(`  ✗ ${error}`);
      continue;
    }
    store.write(trimmed);
    log("  ✓ Token saved.");
    return trimmed;
  }
}

// ── Default implementations ──────────────────────────────────────────────────

const DEFAULT_CONFIG_DIR = join(homedir(), ".master-plan");
const DEFAULT_CREDENTIALS_FILE = join(DEFAULT_CONFIG_DIR, "credentials.json");

/**
 * File-backed token store. Persists tokens to ~/.master-plan/credentials.json.
 */
export class FileTokenStore implements ITokenStore {
  private readonly path: string;

  constructor(path?: string) {
    this.path = path ?? DEFAULT_CREDENTIALS_FILE;
  }

  read(): string | null {
    try {
      const raw = readFileSync(this.path, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const token = (parsed.anthropic as Record<string, unknown> | undefined)?.setupToken;
      return typeof token === "string" && token.length > 0 ? token : null;
    } catch {
      return null;
    }
  }

  write(token: string): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const data = { anthropic: { setupToken: token } };
    writeFileSync(this.path, JSON.stringify(data, null, 2) + "\n", "utf-8");
  }
}

/**
 * Interactive line reader using process.stdin/stdout.
 */
export class StdinLineReader implements ILineReader {
  async readLine(prompt: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    return new Promise<string>((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }
}
