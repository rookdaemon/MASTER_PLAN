import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../runtime-adapters.js';

const REQUIRED_SECTIONS = [
  '## The intent',
  '## The credo',
  '## Values that constrain the work',
  '## Strategic choices',
  '## How the plan is organized',
  '## Go deeper',
] as const;

describe('root README', () => {
  const fileSystem = new NodeFileSystem('.');

  it('explains the plan from intent through execution choices', async () => {
    const readme = await fileSystem.readText('README.md');

    for (const section of REQUIRED_SECTIONS) {
      expect(readme).toContain(section);
    }

    expect(readme).toContain('Subjective experience endures in the universe');
    expect(readme).toContain('Subjective experience spreads in the universe');
    expect(readme).toContain('The commitment to preservation endures in minds');
    expect(readme).toContain('Preservation before expansion');
    expect(readme).toContain('Evidence before claims');
  });

  it('only links to local files that exist', async () => {
    const readme = await fileSystem.readText('README.md');
    const destinations = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .filter((destination) => !destination.startsWith('#') && !destination.includes('://'))
      .map((destination) => destination.split('#')[0]);

    expect(destinations.length).toBeGreaterThan(0);
    await Promise.all(destinations.map((destination) => fileSystem.readText(destination)));
  });
});
