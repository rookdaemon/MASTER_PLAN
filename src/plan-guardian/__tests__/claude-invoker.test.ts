import { describe, it, expect } from 'vitest';
import {
  buildClaudeArgs,
  parseClaudeOutput,
  sessionIdForNumericId,
} from '../claude-invoker.js';

const NOW_MS = Date.parse('2026-06-09T12:00:00.000Z');

describe('buildClaudeArgs', () => {
  it('builds the Ralph-Wiggum argv with @-file refs and a single-operation instruction', () => {
    const args = buildClaudeArgs({
      sessionId: 'abc-123',
      systemPrompt: 'SYS',
      cardPath: 'plan/0.1-foo.md',
      rootPlanFile: 'plan/root.md',
    });

    // Non-interactive, machine-readable, permissionless, resumable session.
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).toContain('--print');
    expect(args.join(' ')).toContain('--output-format json');
    expect(args.join(' ')).toContain('--session-id abc-123');

    // System prompt is passed as its own flag value.
    const spIdx = args.indexOf('--system-prompt');
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

describe('sessionIdForNumericId', () => {
  it('is deterministic and UUID-shaped so a card resumes the same session', () => {
    const a = sessionIdForNumericId('0.7.3.1');
    const b = sessionIdForNumericId('0.7.3.1');
    const c = sessionIdForNumericId('0.7.3.2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    // Strictly RFC-4122 v4 (version nibble 4, variant 8/9/a/b) so the CLI accepts it.
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
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

  it('is null-safe and tolerant of non-JSON noise', () => {
    expect(parseClaudeOutput(null, NOW_MS).rateLimited).toBe(false);
    expect(parseClaudeOutput('not json', NOW_MS).rateLimited).toBe(false);
    expect(parseClaudeOutput('', NOW_MS).costUsd).toBeUndefined();
  });
});
