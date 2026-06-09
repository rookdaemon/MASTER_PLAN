import { describe, it, expect } from 'vitest';
import { buildClaudeArgs, parseClaudeOutput } from '../claude-invoker.js';

const NOW_MS = Date.parse('2026-06-09T12:00:00.000Z');

describe('buildClaudeArgs', () => {
  it('builds the Ralph-Wiggum argv with @-file refs and a single-operation instruction', () => {
    const args = buildClaudeArgs({
      systemPrompt: 'SYS',
      cardPath: 'plan/0.1-foo.md',
      rootPlanFile: 'plan/root.md',
    });

    // Non-interactive, machine-readable, permissionless.
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--print');
    expect(args.join(' ')).toContain('--output-format json');

    // Ephemeral session — no fixed --session-id (which collides across epochs).
    expect(args).toContain('--no-session-persistence');
    expect(args).not.toContain('--session-id');

    // Appended (not replacing) the default system prompt, so Claude keeps its tools.
    expect(args).not.toContain('--system-prompt');
    const spIdx = args.indexOf('--append-system-prompt');
    expect(spIdx).toBeGreaterThanOrEqual(0);
    expect(args[spIdx + 1]).toBe('SYS');

    // Everything after `--` is the user turn: @-file refs + the instruction.
    const sepIdx = args.indexOf('--');
    expect(sepIdx).toBeGreaterThanOrEqual(0);
    const userTurn = args[sepIdx + 1];
    expect(userTurn).toContain('@plan/0.1-foo.md');
    expect(userTurn).toContain('@plan/root.md');
    expect(userTurn.toLowerCase()).toContain('exactly one');
  });
});

describe('parseClaudeOutput', () => {
  it('extracts cost and result from a normal success envelope', () => {
    const out = JSON.stringify({ type: 'result', result: 'done', total_cost_usd: 0.0123 });
    const parsed = parseClaudeOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(false);
    expect(parsed.costUsd).toBeCloseTo(0.0123, 6);
    expect(parsed.result).toBe('done');
  });

  it('also accepts the legacy cost_usd field name', () => {
    const out = JSON.stringify({ result: 'ok', cost_usd: 0.5 });
    expect(parseClaudeOutput(out, NOW_MS).costUsd).toBeCloseTo(0.5, 6);
  });

  it('detects a rate_limit_event and computes seconds until resetsAt', () => {
    const resetsAt = Math.floor(NOW_MS / 1000) + 90; // epoch seconds, 90s out
    const out = JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { resetsAt } });
    const parsed = parseClaudeOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(true);
    expect(parsed.retryAfterSecs).toBe(90);
  });

  it('detects an Anthropic rate_limit_error with retry_after', () => {
    const out = JSON.stringify({ error: { type: 'rate_limit_error', retry_after: 42 } });
    const parsed = parseClaudeOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(true);
    expect(parsed.retryAfterSecs).toBe(42);
  });

  it('treats overloaded_error as a rate limit with a default backoff', () => {
    const out = JSON.stringify({ error: { type: 'overloaded_error' } });
    const parsed = parseClaudeOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(true);
    expect(parsed.retryAfterSecs).toBeGreaterThan(0);
  });

  it('surfaces a non-rate-limit error envelope (e.g. 401 auth) as isError', () => {
    const out = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Failed to authenticate. API Error: 401 Invalid authentication credentials',
    });
    const parsed = parseClaudeOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(false);
    expect(parsed.isError).toBe(true);
    expect(parsed.errorMessage).toMatch(/authenticate/i);
  });

  it('flags an error subtype even without is_error', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'error_during_execution', result: 'boom' });
    expect(parseClaudeOutput(out, NOW_MS).isError).toBe(true);
  });

  it('a normal success is not flagged as an error', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0.01 });
    const parsed = parseClaudeOutput(out, NOW_MS);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.costUsd).toBeCloseTo(0.01, 6);
  });

  it('is null-safe and tolerant of non-JSON noise', () => {
    expect(parseClaudeOutput(null, NOW_MS).rateLimited).toBe(false);
    expect(parseClaudeOutput('not json', NOW_MS).rateLimited).toBe(false);
    expect(parseClaudeOutput('', NOW_MS).costUsd).toBeUndefined();
  });
});
