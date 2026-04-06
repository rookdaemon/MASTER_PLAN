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
    const h1 = await git.commit('first');
    const h2 = await git.commit('second');
    expect(h1).toBe('fake0000');
    expect(h2).toBe('fake0001');
    expect(git.commits).toHaveLength(2);
    expect(git.commits[0].message).toBe('first');
  });

  it('status returns empty string', async () => {
    const git = new InMemoryGitOperations();
    expect(await git.status()).toBe('');
  });
});
