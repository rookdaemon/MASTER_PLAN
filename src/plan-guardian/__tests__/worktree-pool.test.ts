import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeWorktreePool } from '../worktree-pool.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

describe('NodeWorktreePool (real git)', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'gwt-'));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.email', 't@t.t']);
    git(repo, ['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'card.md'), '# 0 Root [PLAN]\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'init']);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('prepares a worktree matching main HEAD', async () => {
    const pool = new NodeWorktreePool(repo, join(repo, '.guardian', 'wt'), 2);
    await pool.prepare(0);

    const wt = pool.dir(0);
    expect(existsSync(join(wt, 'card.md'))).toBe(true);
    expect(readFileSync(join(wt, 'card.md'), 'utf-8')).toContain('[PLAN]');

    await pool.cleanup();
  });

  it('reset on reuse wipes edits made in the worktree', async () => {
    const pool = new NodeWorktreePool(repo, join(repo, '.guardian', 'wt'), 1);
    await pool.prepare(0);
    const wt = pool.dir(0);

    writeFileSync(join(wt, 'card.md'), '# 0 Root [DONE]\nscratch\n');
    writeFileSync(join(wt, 'untracked.txt'), 'junk');

    await pool.prepare(0); // reuse → reset --hard + clean

    expect(readFileSync(join(wt, 'card.md'), 'utf-8')).toContain('[PLAN]');
    expect(existsSync(join(wt, 'untracked.txt'))).toBe(false);

    await pool.cleanup();
  });

  it('picks up new main commits on the next prepare', async () => {
    const pool = new NodeWorktreePool(repo, join(repo, '.guardian', 'wt'), 1);
    await pool.prepare(0);

    // Advance main, then re-prepare: the worktree should reflect the new HEAD.
    writeFileSync(join(repo, 'card.md'), '# 0 Root [ARCHITECT]\n');
    git(repo, ['commit', '-qam', 'advance']);

    await pool.prepare(0);
    expect(readFileSync(join(pool.dir(0), 'card.md'), 'utf-8')).toContain('[ARCHITECT]');

    await pool.cleanup();
  });

  it('git(index) is scoped to that worktree', async () => {
    const pool = new NodeWorktreePool(repo, join(repo, '.guardian', 'wt'), 1);
    await pool.prepare(0);
    writeFileSync(join(pool.dir(0), 'card.md'), '# 0 Root [PLAN]\nedit\n');

    const status = await pool.git(0).status();
    expect(status).toMatch(/card\.md/);

    await pool.cleanup();
  });
});
