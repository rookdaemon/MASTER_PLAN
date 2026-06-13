import { describe, it, expect } from 'vitest';
import { runAgenticWorker, parseGitStatusPorcelain } from '../agentic-worker.js';
import type { ClaudeInvoker } from '../claude-invoker.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import { InMemoryGitOperations } from '../git-state.js';
import type { DispatchItem, PlanFile } from '../interfaces.js';

const NOW = '2026-06-09T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function planFile(over: Partial<PlanFile> = {}): PlanFile {
  return {
    path: 'plan/0.0-alpha.md',
    frontmatter: { parent: 'plan/root.md', root: 'plan/root.md' },
    status: 'PLAN',
    numericId: '0.0',
    depth: 1,
    title: 'Alpha',
    body: '# 0.0 Alpha [PLAN]\n\nA task.\n',
    isLeaf: true,
    lastRevision: null,
    ...over,
  };
}

function item(over: Partial<DispatchItem> = {}): DispatchItem {
  return { task: planFile(), actionType: 'decompose', writeSet: ['plan/0.0-alpha.md'], ...over };
}

/** A git double whose porcelain status is scripted per test. */
class ScriptedGit extends InMemoryGitOperations {
  constructor(private porcelain: string) {
    super();
  }
  override async status(): Promise<string> {
    return this.porcelain;
  }
}

function invokerThatRuns(fn: (args: string[]) => string | null): { invoker: ClaudeInvoker; lastArgs: string[] } {
  const captured: { lastArgs: string[] } = { lastArgs: [] };
  const invoker: ClaudeInvoker = {
    invoke(args: string[]): string | null {
      captured.lastArgs = args;
      return fn(args);
    },
  };
  return { invoker, lastArgs: captured.lastArgs } as unknown as { invoker: ClaudeInvoker; lastArgs: string[] };
}

describe('parseGitStatusPorcelain', () => {
  it('classifies untracked as created, tracked edits as modified, and deletions', () => {
    const out = parseGitStatusPorcelain(
      [' M plan/0.0-alpha.md', '?? plan/0.0.1-sub.md', ' D plan/0.0.9-old.md', 'A  plan/0.0.2-new.md'].join('\n'),
    );
    expect(out.modified).toEqual(['plan/0.0-alpha.md']);
    expect(out.created.sort()).toEqual(['plan/0.0.1-sub.md', 'plan/0.0.2-new.md']);
    expect(out.deleted).toEqual(['plan/0.0.9-old.md']);
  });

  it('handles a rename as delete-old + create-new', () => {
    const out = parseGitStatusPorcelain('R  plan/old.md -> plan/new.md');
    expect(out.created).toEqual(['plan/new.md']);
    expect(out.deleted).toEqual(['plan/old.md']);
  });

  it('returns empty sets for a clean tree', () => {
    const out = parseGitStatusPorcelain('');
    expect(out.created).toEqual([]);
    expect(out.modified).toEqual([]);
    expect(out.deleted).toEqual([]);
  });
});

describe('runAgenticWorker', () => {
  const config = { rootPlanFile: 'plan/root.md', planDir: 'plan', claudeTimeoutMs: 1000 };

  it('passes the agentic system prompt and @-file refs to the CLI', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n', 'utf-8');
    let seen: string[] = [];
    const invoker: ClaudeInvoker = {
      invoke(args) {
        seen = args;
        return JSON.stringify({ result: 'noop' });
      },
    };
    const git = new ScriptedGit('');

    await runAgenticWorker(item(), { invoker, fs, git }, NOW, NOW_MS, config);

    const sp = seen[seen.indexOf('--append-system-prompt') + 1];
    expect(sp).toContain('AGENTIC');
    const userTurn = seen[seen.indexOf('--') + 1];
    expect(userTurn).toContain('@plan/0.0-alpha.md');
    expect(userTurn).toContain('@plan/root.md');
  });

  it('can run the same observed-diff workflow through codex exec with stdin and model', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n', 'utf-8');
    const git = new ScriptedGit(' M plan/0.0-alpha.md');
    let seenArgs: string[] = [];
    let seenStdin: string | undefined;
    let seenCwd: string | undefined;
    const invoker: ClaudeInvoker = {
      invoke(args, _timeoutMs, cwd, stdin) {
        seenArgs = args;
        seenCwd = cwd;
        seenStdin = stdin;
        fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n\nEdited by Codex.\n', 'utf-8');
        return JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } });
      },
    };

    const result = await runAgenticWorker(item(), { invoker, fs, git }, NOW, NOW_MS, {
      ...config,
      agenticProvider: 'codex',
      agenticModel: 'gpt-5.4',
    });

    expect(seenArgs.slice(0, 2)).toEqual(['exec', '--dangerously-bypass-approvals-and-sandbox']);
    expect(seenArgs).toContain('--json');
    expect(seenArgs[seenArgs.indexOf('-m') + 1]).toBe('gpt-5.4');
    expect(seenArgs[seenArgs.indexOf('-C') + 1]).toBe('.');
    expect(seenArgs.at(-1)).toBe('-');
    expect(seenCwd).toBeUndefined();
    expect(seenStdin).toContain('SYSTEM INSTRUCTIONS:');
    expect(seenStdin).toContain('@plan/0.0-alpha.md');
    expect(result.action.filesModified[0].content).toContain('Edited by Codex');
    expect(result.action.summary).toContain('[codex:gpt-5.4]');
  });

  it('packages the observed diff into a PlanningAction with read-back content', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n', 'utf-8');
    const git = new ScriptedGit([' M plan/0.0-alpha.md', '?? plan/0.0.1-sub.md'].join('\n'));

    const invoker: ClaudeInvoker = {
      invoke() {
        // Simulate Claude Code editing files directly on disk.
        fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n\nNow has a child.\n', 'utf-8');
        fs.writeFile('plan/0.0.1-sub.md', '# 0.0.1 Sub [PLAN]\n', 'utf-8');
        return JSON.stringify({ type: 'result', result: 'decomposed', total_cost_usd: 0.02 });
      },
    };

    const result = await runAgenticWorker(item(), { invoker, fs, git }, NOW, NOW_MS, config);

    expect(result.action.type).toBe('decompose');
    expect(result.action.targetPath).toBe('plan/0.0-alpha.md');
    expect(result.action.filesCreated.map(f => f.path)).toEqual(['plan/0.0.1-sub.md']);
    expect(result.action.filesCreated[0].content).toContain('0.0.1 Sub');
    expect(result.action.filesModified.map(f => f.path)).toEqual(['plan/0.0-alpha.md']);
    expect(result.action.filesModified[0].content).toContain('Now has a child');
    expect(result.action.writeSet.sort()).toEqual(['plan/0.0-alpha.md', 'plan/0.0.1-sub.md']);
    expect(result.costUsd).toBeCloseTo(0.02, 6);
    expect(result.tokensUsed).toEqual({ prompt: 0, completion: 0 });
  });

  it('includes deletions in the writeSet (so the commit can stage them)', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n', 'utf-8');
    const git = new ScriptedGit([' M plan/0.0-alpha.md', ' D plan/0.0.9-old.md'].join('\n'));
    const invoker: ClaudeInvoker = {
      invoke() {
        fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n\nedited\n', 'utf-8');
        return JSON.stringify({ result: 'reconciled' });
      },
    };

    const result = await runAgenticWorker(item({ actionType: 'reconcile' }), { invoker, fs, git }, NOW, NOW_MS, config);
    expect(result.action.writeSet).toContain('plan/0.0.9-old.md');
    expect(result.action.filesCreated).toEqual([]);
  });

  it('reports a no-op when the tree is unchanged (convergence signal)', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n', 'utf-8');
    const git = new ScriptedGit('');
    const invoker: ClaudeInvoker = { invoke: () => JSON.stringify({ result: 'nothing to do' }) };

    const result = await runAgenticWorker(item(), { invoker, fs, git }, NOW, NOW_MS, config);
    expect(result.action.filesCreated).toEqual([]);
    expect(result.action.filesModified).toEqual([]);
    expect(result.action.writeSet).toEqual([]);
    expect(result.action.summary.toLowerCase()).toContain('no change');
  });

  it('throws on a CLI error envelope (e.g. 401 auth) instead of reporting a no-op', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n', 'utf-8');
    const git = new ScriptedGit('');
    const invoker: ClaudeInvoker = {
      invoke: () =>
        JSON.stringify({ type: 'result', is_error: true, result: 'Failed to authenticate. API Error: 401' }),
    };
    await expect(runAgenticWorker(item(), { invoker, fs, git }, NOW, NOW_MS, config)).rejects.toThrow(
      /claude CLI error.*authenticate/i,
    );
  });

  it('throws a rate-limit-shaped error the scheduler can recognise', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('plan/0.0-alpha.md', '# 0.0 Alpha [PLAN]\n', 'utf-8');
    const git = new ScriptedGit('');
    const invoker: ClaudeInvoker = {
      invoke: () => JSON.stringify({ error: { type: 'rate_limit_error', retry_after: 42 } }),
    };

    await expect(runAgenticWorker(item(), { invoker, fs, git }, NOW, NOW_MS, config)).rejects.toThrow(
      /rate limit/i,
    );
    await expect(runAgenticWorker(item(), { invoker, fs, git }, NOW, NOW_MS, config)).rejects.toThrow(
      /retry-after:\s*42/i,
    );
  });
});
