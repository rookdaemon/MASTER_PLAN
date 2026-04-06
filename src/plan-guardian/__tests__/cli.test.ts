import { describe, it, expect } from 'vitest';
import { parseCli } from '../cli.js';

describe('parseCli', () => {
  it('returns defaults with no args (local 7B)', () => {
    const opts = parseCli(['node', 'main.ts']);
    expect(opts.planDir).toBe('plan');
    expect(opts.provider).toBe('local');
    expect(opts.model).toBe('qwen2.5:7b');
    expect(opts.concurrency).toBe(20);
    expect(opts.maxIterations).toBe(Infinity);
    expect(opts.dryRun).toBe(false);
  });

  it('parses all flags', () => {
    const opts = parseCli([
      'node', 'main.ts',
      '--plan-dir', './myplan',
      '--provider', 'anthropic',
      '--model', 'claude-sonnet-4-20250514',
      '--concurrency', '30',
      '--max-iterations', '10',
      '--max-depth', '6',
      '--dry-run',
      '--cycle-threshold', '5',
    ]);
    expect(opts.planDir).toBe('./myplan');
    expect(opts.provider).toBe('anthropic');
    expect(opts.model).toBe('claude-sonnet-4-20250514');
    expect(opts.concurrency).toBe(30);
    expect(opts.maxIterations).toBe(10);
    expect(opts.maxDepth).toBe(6);
    expect(opts.dryRun).toBe(true);
    expect(opts.cycleThreshold).toBe(5);
  });

  it('rejects invalid provider', () => {
    expect(() => parseCli(['node', 'main.ts', '--provider', 'invalid']))
      .toThrow('Invalid provider');
  });

  it('rejects unknown flags', () => {
    expect(() => parseCli(['node', 'main.ts', '--banana']))
      .toThrow('Unknown argument');
  });

  it('rejects missing value', () => {
    expect(() => parseCli(['node', 'main.ts', '--concurrency']))
      .toThrow('Missing value');
  });
});
