import { describe, it, expect } from 'vitest';
import { InMemoryGitOperations } from '../git-state.js';

describe('InMemoryGitOperations', () => {
  it('records add calls', async () => {
    const git = new InMemoryGitOperations();
    await git.add(['file1.md', 'file2.md']);
    expect(git.adds).toEqual([['file1.md', 'file2.md']]);
  });

  it('records commit calls with sequential hashes', async () => {
    const git = new InMemoryGitOperations();
    const h1 = await git.commit('first', 'guardian/autogen');
    const h2 = await git.commit('second');
    expect(h1).toBe('fake0000');
    expect(h2).toBe('fake0001');
    expect(git.commits).toHaveLength(2);
    expect(git.commits[0].message).toBe('first');
    expect(git.commits[0].branch).toBe('guardian/autogen');
  });

  it('status returns empty string', async () => {
    const git = new InMemoryGitOperations();
    expect(await git.status()).toBe('');
  });

  it('tracks staged paths and clears after commit', async () => {
    const git = new InMemoryGitOperations();
    await git.add(['plan/a.md', 'plan/b.md']);
    expect((await git.stagedPaths()).sort()).toEqual(['plan/a.md', 'plan/b.md']);
    await git.commit('c');
    expect(await git.stagedPaths()).toEqual([]);
  });
});
