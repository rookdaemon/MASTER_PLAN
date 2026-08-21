import { describe, expect, it } from 'vitest';
import { NodeFileSystem, normalizeRepositoryPath, normalizeRepositoryText } from '../runtime-adapters.js';

describe('repository filesystem normalization', () => {
  it('returns portable repository paths from platform-specific paths', () => {
    expect(normalizeRepositoryPath('docs\\reference\\consciousness-science.md'))
      .toBe('docs/reference/consciousness-science.md');
    expect(normalizeRepositoryPath('strategy/graph.json')).toBe('strategy/graph.json');
  });

  it('returns deterministic LF text from checked-out repository text', () => {
    expect(normalizeRepositoryText('first\r\nsecond\r\n')).toBe('first\nsecond\n');
    expect(normalizeRepositoryText('first\nsecond\n')).toBe('first\nsecond\n');
  });

  it('treats an absent output directory as an empty portable file set', async () => {
    await expect(new NodeFileSystem('.').listFiles('strategy/results/')).resolves.toEqual([]);
  });
});
