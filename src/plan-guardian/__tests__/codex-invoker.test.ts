import { describe, it, expect } from 'vitest';
import { buildCodexArgs, parseCodexOutput } from '../codex-invoker.js';

const NOW_MS = Date.parse('2026-06-09T12:00:00.000Z');

describe('buildCodexArgs', () => {
  it('builds a non-interactive codex exec argv with model, cwd, and stdin prompt', () => {
    const invocation = buildCodexArgs({
      systemPrompt: 'SYS',
      cardPath: 'plan/0.1-foo.md',
      rootPlanFile: 'plan/root.md',
      model: 'gpt-5.4',
      cwd: '/repo/.guardian/wt/0',
    });

    expect(invocation.args).toEqual([
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json',
      '--color',
      'never',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '--ephemeral',
      '-m',
      'gpt-5.4',
      '-C',
      '/repo/.guardian/wt/0',
      '-',
    ]);
    expect(invocation.stdin).toContain('SYSTEM INSTRUCTIONS:\nSYS');
    expect(invocation.stdin).toContain('@plan/0.1-foo.md');
    expect(invocation.stdin).toContain('@plan/root.md');
    expect(invocation.stdin.toLowerCase()).toContain('exactly one');
  });

  it('omits -m when no codex model is configured', () => {
    const invocation = buildCodexArgs({
      systemPrompt: 'SYS',
      cardPath: 'plan/a.md',
      rootPlanFile: 'plan/root.md',
      cwd: '.',
    });
    expect(invocation.args).not.toContain('-m');
  });
});

describe('parseCodexOutput', () => {
  it('extracts the final agent message from codex jsonl output', () => {
    const out = [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20 } }),
    ].join('\n');

    const parsed = parseCodexOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(false);
    expect(parsed.result).toBe('done');
  });

  it('detects rate-limit-shaped errors in jsonl output', () => {
    const out = JSON.stringify({ type: 'error', message: '429 Too Many Requests. retry after 42 seconds' });
    const parsed = parseCodexOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(true);
    expect(parsed.retryAfterSecs).toBe(42);
  });

  it('surfaces non-rate-limit errors', () => {
    const out = JSON.stringify({ type: 'error', message: 'authentication failed' });
    const parsed = parseCodexOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(false);
    expect(parsed.isError).toBe(true);
    expect(parsed.errorMessage).toMatch(/authentication/i);
  });
});
