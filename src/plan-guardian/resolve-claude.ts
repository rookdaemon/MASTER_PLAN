/**
 * Claude binary resolver.
 *
 * Resolution order: CLAUDE_PATH env override → PATH lookup (which/where) →
 * common install locations. All environment access (env, fs, child process,
 * platform) is injected via `ResolveClaudeDeps` so resolution is testable
 * without touching the real machine.
 *
 * Domain: Plan Guardian (agentic mode)
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ResolveClaudeDeps {
  env: Record<string, string | undefined>;
  existsSync(path: string): boolean;
  /** Returns the resolved binary path from PATH, or null if not found. */
  which(): string | null;
  platform: NodeJS.Platform;
}

const nodeDeps: ResolveClaudeDeps = {
  env: process.env,
  existsSync,
  platform: process.platform,
  which(): string | null {
    try {
      const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
      const out = execSync(cmd, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      const first = out.split(/\r?\n/)[0]?.trim();
      return first && first.length > 0 ? first : null;
    } catch {
      return null;
    }
  },
};

let cached: string | null = null;

export function resolveClaudePath(deps: ResolveClaudeDeps = nodeDeps): string {
  // Only cache the real-environment resolution; injected deps (tests) must not
  // share state across calls.
  if (deps === nodeDeps && cached) return cached;

  const resolved = resolve(deps);
  if (deps === nodeDeps) cached = resolved;
  return resolved;
}

function resolve(deps: ResolveClaudeDeps): string {
  const override = deps.env.CLAUDE_PATH;
  if (override && deps.existsSync(override)) return override;

  const fromPath = deps.which();
  if (fromPath && deps.existsSync(fromPath)) return fromPath;

  for (const candidate of candidates(deps)) {
    if (deps.existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Cannot find the 'claude' CLI. Searched PATH and common locations. " +
      'Set the CLAUDE_PATH environment variable to the full path of the claude binary.',
  );
}

function candidates(deps: ResolveClaudeDeps): string[] {
  if (deps.platform === 'win32') {
    const userProfile = deps.env.USERPROFILE ?? '';
    const localAppData = deps.env.LOCALAPPDATA ?? '';
    const appData = deps.env.APPDATA ?? '';
    return [
      join(userProfile, '.local', 'bin', 'claude.exe'),
      join(localAppData, 'Programs', 'claude', 'claude.exe'),
      join(appData, 'npm', 'claude.cmd'),
    ];
  }
  const home = deps.env.HOME ?? '';
  return [join(home, '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/usr/bin/claude'];
}
