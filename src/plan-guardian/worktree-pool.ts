/**
 * Worktree pool — isolation for parallel agentic agents.
 *
 * Running N `claude --dangerously-skip-permissions` processes in one shared
 * working tree would cross-contaminate edits and commits. Instead each
 * concurrent agent works in its own git worktree (separate working directory,
 * shared .git). The scheduler resets a worktree to main HEAD, runs Claude
 * inside it, reads back the changes, and applies/commits them to main serially.
 *
 * Environment-specific git operations are behind IWorktreePool so the
 * orchestration is testable with an in-memory double.
 *
 * Domain: Plan Guardian (agentic mode, parallel)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { IGitOperations } from './interfaces.js';
import { NodeGitOperations } from './git-state.js';

const execFileAsync = promisify(execFile);

export interface IWorktreePool {
  /** Number of worktrees in the pool (the agentic concurrency). */
  readonly size: number;
  /** Ensure worktree `index` exists and matches the repo's current HEAD (reset + clean). */
  prepare(index: number): Promise<void>;
  /** Absolute/relative path of worktree `index`. */
  dir(index: number): string;
  /** Git operations scoped to worktree `index`. */
  git(index: number): IGitOperations;
  /** Remove all created worktrees. */
  cleanup(): Promise<void>;
}

/** Production pool backed by `git worktree`. */
export class NodeWorktreePool implements IWorktreePool {
  private readonly created = new Set<number>();

  /**
   * @param repoRoot  Main repository root.
   * @param baseDir   Directory to hold the worktrees (should be git-ignored,
   *                  e.g. `.guardian/wt`).
   * @param size      Number of worktrees.
   */
  constructor(
    private readonly repoRoot: string,
    private readonly baseDir: string,
    readonly size: number,
  ) {}

  dir(index: number): string {
    return join(this.baseDir, String(index));
  }

  git(index: number): IGitOperations {
    return new NodeGitOperations(this.dir(index));
  }

  async prepare(index: number): Promise<void> {
    const head = (await this.runRepo(['rev-parse', 'HEAD'])).trim();
    const d = this.dir(index);

    if (!this.created.has(index)) {
      // Drop any stale registration/dir from a previous run, then add fresh.
      await this.runRepo(['worktree', 'remove', '--force', d]).catch(() => {});
      await this.runRepo(['worktree', 'add', '--force', '--detach', d, head]);
      this.created.add(index);
      return;
    }

    // Reuse: hard-reset to current main HEAD and wipe any leftover edits.
    await this.run(d, ['reset', '--hard', head]);
    await this.run(d, ['clean', '-fdq']);
  }

  async cleanup(): Promise<void> {
    for (const index of this.created) {
      await this.runRepo(['worktree', 'remove', '--force', this.dir(index)]).catch(() => {});
    }
    this.created.clear();
    await this.runRepo(['worktree', 'prune']).catch(() => {});
  }

  private async runRepo(args: string[]): Promise<string> {
    return this.run(this.repoRoot, args);
  }

  private async run(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  }
}
