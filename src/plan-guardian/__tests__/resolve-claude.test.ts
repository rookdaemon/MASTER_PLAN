import { describe, it, expect } from 'vitest';
import { resolveClaudePath, type ResolveClaudeDeps } from '../resolve-claude.js';

function deps(over: Partial<ResolveClaudeDeps>): ResolveClaudeDeps {
  return {
    env: {},
    existsSync: () => false,
    which: () => null,
    platform: 'linux',
    ...over,
  };
}

describe('resolveClaudePath', () => {
  it('prefers CLAUDE_PATH when it exists', () => {
    const path = resolveClaudePath(
      deps({ env: { CLAUDE_PATH: '/custom/claude' }, existsSync: p => p === '/custom/claude' }),
    );
    expect(path).toBe('/custom/claude');
  });

  it('ignores CLAUDE_PATH when the file is missing and falls through', () => {
    const path = resolveClaudePath(
      deps({
        env: { CLAUDE_PATH: '/missing/claude' },
        which: () => '/usr/local/bin/claude',
        existsSync: p => p === '/usr/local/bin/claude',
      }),
    );
    expect(path).toBe('/usr/local/bin/claude');
  });

  it('uses the which/where lookup result when present', () => {
    const path = resolveClaudePath(
      deps({ which: () => '/opt/claude', existsSync: p => p === '/opt/claude' }),
    );
    expect(path).toBe('/opt/claude');
  });

  it('falls back to a common install location on unix', () => {
    const home = '/home/mp';
    const path = resolveClaudePath(
      deps({
        env: { HOME: home },
        existsSync: p => p === `${home}/.local/bin/claude`,
      }),
    );
    expect(path).toBe(`${home}/.local/bin/claude`);
  });

  it('throws a helpful error when nothing is found', () => {
    expect(() => resolveClaudePath(deps({}))).toThrow(/CLAUDE_PATH/);
  });
});
