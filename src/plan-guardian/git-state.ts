/**
 * Git Operations — Abstraction for git add/commit.
 *
 * Two implementations:
 *   - NodeGitOperations: production (shells out to git)
 *   - InMemoryGitOperations: deterministic test double
 *
 * Domain: Plan Guardian
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IGitOperations } from './interfaces.js';

const execFileAsync = promisify(execFile);

export class NodeGitOperations implements IGitOperations {
  constructor(private readonly repoRoot: string) {}

  async add(paths: string[]): Promise<void> {
    await execFileAsync('git', ['add', ...paths], { cwd: this.repoRoot });
  }

  async commit(message: string, branch?: string): Promise<string> {
    let previousBranch: string | null = null;

    if (branch && branch.trim().length > 0) {
      const current = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.repoRoot });
      previousBranch = current.stdout.trim();
      await execFileAsync('git', ['checkout', '-B', branch], { cwd: this.repoRoot });
    }

    try {
      const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: this.repoRoot });
      const match = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
      return match ? match[1] : 'unknown';
    } finally {
      if (previousBranch && previousBranch !== branch) {
        await execFileAsync('git', ['checkout', previousBranch], { cwd: this.repoRoot });
      }
    }
  }

  async status(): Promise<string> {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: this.repoRoot });
    return stdout;
  }

  async stagedPaths(): Promise<string[]> {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--cached'], { cwd: this.repoRoot });
    return stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }
}

export class InMemoryGitOperations implements IGitOperations {
  readonly adds: string[][] = [];
  readonly commits: { message: string; hash: string; branch?: string }[] = [];
  private counter = 0;
  private staged = new Set<string>();

  async add(paths: string[]): Promise<void> {
    this.adds.push(paths);
    for (const p of paths) this.staged.add(p);
  }

  async commit(message: string, branch?: string): Promise<string> {
    const hash = `fake${String(this.counter++).padStart(4, '0')}`;
    this.commits.push({ message, hash, branch });
    this.staged.clear();
    return hash;
  }

  async status(): Promise<string> {
    return '';
  }

  async stagedPaths(): Promise<string[]> {
    return [...this.staged.values()];
  }
}
