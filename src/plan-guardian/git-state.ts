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

  async commit(message: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: this.repoRoot });
    const match = stdout.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
    return match ? match[1] : 'unknown';
  }

  async status(): Promise<string> {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: this.repoRoot });
    return stdout;
  }
}

export class InMemoryGitOperations implements IGitOperations {
  readonly adds: string[][] = [];
  readonly commits: { message: string; hash: string }[] = [];
  private counter = 0;

  async add(paths: string[]): Promise<void> {
    this.adds.push(paths);
  }

  async commit(message: string): Promise<string> {
    const hash = `fake${String(this.counter++).padStart(4, '0')}`;
    this.commits.push({ message, hash });
    return hash;
  }

  async status(): Promise<string> {
    return '';
  }
}
