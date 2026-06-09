import { describe, it, expect } from 'vitest';
import { parseCli } from '../cli.js';

describe('parseCli', () => {
  it('returns defaults with no args (openrouter)', () => {
    const opts = parseCli(['node', 'main.ts']);
    expect(opts.planDir).toBe('plan');
    expect(opts.executionMode).toBe('provider');
    expect(opts.provider).toBe('openrouter');
    expect(opts.models).toEqual([
      'nvidia/nemotron-3-super-120b-a12b:free',
      'qwen/qwen3-coder:free',
      'gpt-oss-120b:free',
    ]);
    expect(opts.concurrency).toBe(5);
    expect(opts.maxIterations).toBe(Infinity);
    expect(opts.dryRun).toBe(false);
    expect(opts.strictIntegrity).toBe(true);
    expect(opts.maxNewFilesPerAction).toBe(5);
    expect(opts.quarantineBranch).toBeUndefined();
  });

  it('parses all flags', () => {
    const opts = parseCli([
      'node', 'main.ts',
      '--plan-dir', './myplan',
      '--provider', 'openrouter',
      '--model', 'claude-sonnet-4-20250514',
      '--concurrency', '30',
      '--max-iterations', '10',
      '--max-depth', '6',
      '--dry-run',
      '--cycle-threshold', '5',
      '--strict-integrity', 'false',
      '--max-new-files', '9',
      '--quarantine-branch', 'guardian/autogen',
    ]);
    expect(opts.planDir).toBe('./myplan');
    expect(opts.provider).toBe('openrouter');
    expect(opts.models).toEqual(['claude-sonnet-4-20250514']);
    expect(opts.concurrency).toBe(30);
    expect(opts.maxIterations).toBe(10);
    expect(opts.maxDepth).toBe(6);
    expect(opts.dryRun).toBe(true);
    expect(opts.cycleThreshold).toBe(5);
    expect(opts.strictIntegrity).toBe(false);
    expect(opts.maxNewFilesPerAction).toBe(9);
    expect(opts.quarantineBranch).toBe('guardian/autogen');
  });

  it('parses --agentic into agentic execution mode with a claude timeout', () => {
    const opts = parseCli(['node', 'main.ts', '--agentic', '--claude-timeout', '120000']);
    expect(opts.executionMode).toBe('agentic');
    expect(opts.claudeTimeoutMs).toBe(120000);
  });

  it('parses model/effort policy bounds', () => {
    const opts = parseCli([
      'node', 'main.ts', '--agentic',
      '--model-ceiling', 'sonnet', '--model-floor', 'haiku', '--effort-ceiling', 'high',
    ]);
    expect(opts.modelCeiling).toBe('sonnet');
    expect(opts.modelFloor).toBe('haiku');
    expect(opts.effortCeiling).toBe('high');
  });

  it('rejects an invalid model tier', () => {
    expect(() => parseCli(['node', 'main.ts', '--model-ceiling', 'gpt']))
      .toThrow(/model tier/i);
  });

  it('rejects an invalid effort level', () => {
    expect(() => parseCli(['node', 'main.ts', '--effort-ceiling', 'turbo']))
      .toThrow(/effort/i);
  });

  it('rejects invalid provider', () => {
    expect(() => parseCli(['node', 'main.ts', '--provider', 'invalid']))
      .toThrow('Invalid provider');
  });

  it('rejects invalid strict-integrity value', () => {
    expect(() => parseCli(['node', 'main.ts', '--strict-integrity', 'maybe']))
      .toThrow('--strict-integrity must be true or false');
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
