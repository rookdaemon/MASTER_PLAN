import { describe, it, expect } from 'vitest';
import {
  buildCodexArgs,
  NodeCodexInvoker,
  parseCodexOutput,
  type CodexProcessRunner,
} from '../codex-invoker.js';

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

  it('surfaces nested Codex API error messages without dumping the full event', () => {
    const out = JSON.stringify({
      type: 'error',
      status: 400,
      error: {
        type: 'invalid_request_error',
        message: "The 'gpt-5.6' model is not supported when using Codex with a ChatGPT account.",
      },
    });
    const parsed = parseCodexOutput(out, NOW_MS);
    expect(parsed.rateLimited).toBe(false);
    expect(parsed.isError).toBe(true);
    expect(parsed.errorMessage).toBe("The 'gpt-5.6' model is not supported when using Codex with a ChatGPT account.");
  });
});

describe('NodeCodexInvoker', () => {
  it('runs Codex asynchronously, closes stdin, and forwards streamed stdout', async () => {
    const chunks: string[] = [];
    const calls: Array<{
      command: string;
      args: readonly string[];
      timeoutMs: number;
      cwd?: string;
      stdin?: string;
    }> = [];
    const runner: CodexProcessRunner = {
      async run(command, args, options) {
        calls.push({
          command,
          args,
          timeoutMs: options.timeoutMs,
          cwd: options.cwd,
          stdin: options.stdin,
        });
        options.onStdout?.('{"type":"turn.started"}\n');
        await Promise.resolve();
        options.onStdout?.('{"type":"turn.completed"}\n');
        return {
          stdout: '{"type":"turn.started"}\n{"type":"turn.completed"}\n',
          stderr: '',
          exitCode: 0,
        };
      },
    };
    const invoker = new NodeCodexInvoker(() => '/bin/codex', runner);

    const pending = invoker.invoke(
      ['exec', '--json', '-'],
      60_000,
      '/repo/wt/0',
      'prompt',
      chunk => chunks.push(chunk),
    );

    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toContain('"type":"turn.completed"');
    expect(calls).toEqual([{
      command: '/bin/codex',
      args: ['exec', '--json', '-'],
      timeoutMs: 60_000,
      cwd: '/repo/wt/0',
      stdin: 'prompt',
    }]);
    expect(chunks).toEqual([
      '{"type":"turn.started"}\n',
      '{"type":"turn.completed"}\n',
    ]);
  });

  it('surfaces stderr when Codex exits non-zero without JSON stdout', async () => {
    const runner: CodexProcessRunner = {
      async run() {
        return { stdout: '', stderr: 'authentication failed', exitCode: 1 };
      },
    };
    const invoker = new NodeCodexInvoker(() => 'codex', runner);

    await expect(invoker.invoke(['exec'], 1_000))
      .rejects.toThrow(/authentication failed/i);
  });
});
