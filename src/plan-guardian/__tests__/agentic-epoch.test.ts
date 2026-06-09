import { describe, it, expect } from 'vitest';
import { runAgenticEpoch, runScheduler } from '../scheduler.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import { InMemoryGitOperations } from '../git-state.js';
import type { ClaudeInvoker } from '../claude-invoker.js';
import type { GuardianConfig } from '../interfaces.js';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';

const NOW = '2026-06-09T12:00:00.000Z';

const ROOT = `---
root: plan/root.md
children:
  - plan/0.0-alpha.md
---
# 0 Root [PLAN]

Root.
`;

const ALPHA = `---
parent: plan/root.md
root: plan/root.md
---
# 0.0 Alpha [PLAN]

A task.
`;

function makeFs(): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  fs.writeFile('plan/root.md', ROOT, 'utf-8');
  fs.writeFile('plan/0.0-alpha.md', ALPHA, 'utf-8');
  return fs;
}

/**
 * git double modelling clean-before / dirty-after: status() is clean until an
 * editing invoker flips `dirty` (simulating Claude editing the tree), then
 * returns the scripted porcelain. Matches how the real tree behaves across an
 * epoch (clean at the pre-flight check, dirty after Claude's edit).
 */
class ScriptedGit extends InMemoryGitOperations {
  dirty = false;
  constructor(private porcelain: string) {
    super();
  }
  override async status(): Promise<string> {
    return this.dirty ? this.porcelain : '';
  }
}

const throwingProvider: IInferenceProvider = {
  async probe() {
    return { reachable: false, latencyMs: 0 };
  },
  async infer(): Promise<InferenceResult> {
    throw new Error('provider must not be called in agentic mode');
  },
};

function makeConfig(over: Partial<GuardianConfig>): GuardianConfig {
  return {
    planDir: 'plan',
    repoRoot: '.',
    concurrency: 1,
    requestedConcurrency: 1,
    maxIterations: 1,
    maxDepth: 8,
    dryRun: false,
    cycleThreshold: 3,
    strictIntegrity: true,
    maxNewFilesPerAction: 5,
    maxTokensPerCall: 4096,
    provider: throwingProvider,
    fs: makeFs(),
    git: new ScriptedGit(''),
    clock: { now: () => NOW },
    sleeper: { sleep: async () => {} },
    executionMode: 'agentic',
    rootPlanFile: 'plan/root.md',
    claudeTimeoutMs: 1000,
    ...over,
  };
}

const queue = (actionType: string) => [{ path: 'plan/0.0-alpha.md', actionType, writeSet: ['plan/0.0-alpha.md'] }];

describe('runAgenticEpoch', () => {
  it('commits the observed diff when the edit passes the integrity gate', async () => {
    const fs = makeFs();
    const git = new ScriptedGit(' M plan/0.0-alpha.md');
    const invoker: ClaudeInvoker = {
      invoke() {
        fs.writeFile('plan/0.0-alpha.md', ALPHA.replace('A task.', 'A task, now refined.'), 'utf-8');
        git.dirty = true;
        return JSON.stringify({ type: 'result', result: 'refined', total_cost_usd: 0.01 });
      },
    };
    const config = makeConfig({ fs, git, claudeInvoker: invoker });

    const completed: string[] = [];
    const result = await runAgenticEpoch(0, config, {
      onWorkerComplete: r => completed.push(r.action.summary),
    }, new Map(), queue('refine') as never);

    expect(result.completed).toBe(1);
    expect(result.failed).toBe(0);
    expect(git.commits).toHaveLength(1);
    expect(git.commits[0].message).toContain('refine');
    expect(git.restores).toHaveLength(0);
    expect(completed[0]).toContain('refine');
  });

  it('reverts and fails when the edit breaks integrity (heading id mismatch)', async () => {
    const fs = makeFs();
    const git = new ScriptedGit('?? plan/0.0.1-sub.md');
    const invoker: ClaudeInvoker = {
      invoke() {
        // Wrong heading id for the path → validateActionIntegrity rejects it.
        fs.writeFile('plan/0.0.1-sub.md', '---\nparent: plan/0.0-alpha.md\nroot: plan/root.md\n---\n# 9.9 Wrong [PLAN]\n', 'utf-8');
        git.dirty = true;
        return JSON.stringify({ result: 'decomposed' });
      },
    };
    const config = makeConfig({ fs, git, claudeInvoker: invoker });

    const errors: string[] = [];
    const result = await runAgenticEpoch(0, config, {
      onWorkerError: (_t, e) => errors.push(e.message),
    }, new Map(), queue('decompose') as never);

    expect(result.completed).toBe(0);
    expect(result.failed).toBe(1);
    expect(git.commits).toHaveLength(0);
    expect(git.restores).toEqual([['plan/0.0.1-sub.md']]);
    expect(errors.join(' ')).toMatch(/integrity/i);
  });

  it('records a rate-limited task without committing', async () => {
    const fs = makeFs();
    const git = new ScriptedGit('');
    const invoker: ClaudeInvoker = {
      invoke: () => JSON.stringify({ error: { type: 'rate_limit_error', retry_after: 42 } }),
    };
    const config = makeConfig({ fs, git, claudeInvoker: invoker });

    const result = await runAgenticEpoch(0, config, {}, new Map(), queue('refine') as never);

    expect(result.rateLimitFailures).toBe(1);
    expect(result.rateLimitedTasks).toHaveLength(1);
    expect(result.rateLimitedTasks[0].path).toBe('plan/0.0-alpha.md');
    expect(result.rateLimitedTasks[0].hintMs).toBeGreaterThan(0);
    expect(git.commits).toHaveLength(0);
  });

  it('surfaces a hard CLI error as a failure rather than masking it as a no-op', async () => {
    const fs = makeFs();
    const git = new ScriptedGit('');
    const invoker: ClaudeInvoker = {
      invoke() {
        throw new Error('Session ID 69ffaf22-ac6d-455d-96d3-3a3ca6cc2fde is already in use.');
      },
    };
    const config = makeConfig({ fs, git, claudeInvoker: invoker });

    const errors: string[] = [];
    const result = await runAgenticEpoch(0, config, {
      onWorkerError: (_t, e) => errors.push(e.message),
    }, new Map(), queue('decompose') as never);

    expect(result.completed).toBe(0);
    expect(result.failed).toBe(1);
    expect(git.commits).toHaveLength(0);
    expect(errors.join(' ')).toMatch(/already in use/);
    // Settled so a persistent failure sweeps + terminates instead of fail-looping.
    expect(result.noChangeTaskPaths).toEqual(['plan/0.0-alpha.md']);
  });

  it('treats a no-op (no diff) as a completed convergence with no commit', async () => {
    const fs = makeFs();
    const git = new ScriptedGit('');
    const invoker: ClaudeInvoker = { invoke: () => JSON.stringify({ result: 'nothing to do' }) };
    const config = makeConfig({ fs, git, claudeInvoker: invoker });

    const result = await runAgenticEpoch(0, config, {}, new Map(), queue('refine') as never);

    expect(result.completed).toBe(1);
    expect(result.failed).toBe(0);
    expect(git.commits).toHaveLength(0);
    expect(git.restores).toHaveLength(0);
  });

  it('does NOT loop on a no-op card: each card is tried once, then the run converges', async () => {
    // Two PLAN leaves; the invoker never edits anything (always a no-op).
    const fs = new InMemoryFileSystem();
    fs.writeFile(
      'plan/root.md',
      '---\nroot: plan/root.md\nchildren:\n  - plan/0.0-alpha.md\n  - plan/0.1-beta.md\n---\n# 0 Root [PLAN]\n\nRoot.\n',
      'utf-8',
    );
    fs.writeFile('plan/0.0-alpha.md', '---\nparent: plan/root.md\nroot: plan/root.md\n---\n# 0.0 Alpha [PLAN]\n\nA.\n', 'utf-8');
    fs.writeFile('plan/0.1-beta.md', '---\nparent: plan/root.md\nroot: plan/root.md\n---\n# 0.1 Beta [PLAN]\n\nB.\n', 'utf-8');

    const invokedCards: string[] = [];
    const invoker: ClaudeInvoker = {
      invoke(args) {
        const userTurn = args[args.indexOf('--') + 1] ?? '';
        const m = userTurn.match(/@(plan\/[^\s]+\.md)/);
        if (m && m[1] !== 'plan/root.md') invokedCards.push(m[1]);
        return JSON.stringify({ result: 'nothing to do' }); // no edit → no diff
      },
    };
    const git = new ScriptedGit(''); // never any diff
    // maxIterations is generous; if the loop weren't broken it would burn all 20
    // epochs re-selecting the same top card.
    const config = makeConfig({ fs, git, claudeInvoker: invoker, maxIterations: 20 });

    await runScheduler(config, {}).done;

    // Each card tried exactly once, then the queue drains and the run ends.
    expect(invokedCards.sort()).toEqual(['plan/0.0-alpha.md', 'plan/0.1-beta.md']);
  });

  it('refuses to run on a dirty working tree (so unrelated changes are not swept into the commit)', async () => {
    const fs = makeFs();
    const git = new ScriptedGit(' M plan/some-unrelated-edit.md');
    git.dirty = true; // pre-existing uncommitted changes before the epoch starts
    let invoked = false;
    const invoker: ClaudeInvoker = {
      invoke() {
        invoked = true;
        return JSON.stringify({ result: 'should not be called' });
      },
    };
    const config = makeConfig({ fs, git, claudeInvoker: invoker });

    await expect(
      runAgenticEpoch(0, config, {}, new Map(), queue('refine') as never),
    ).rejects.toThrow(/uncommitted|clean tree|working tree/i);
    expect(invoked).toBe(false); // never spawned Claude on a dirty tree
    expect(git.commits).toHaveLength(0);
  });

  it('dry-run reverts instead of committing (genuine preview)', async () => {
    const fs = makeFs();
    const git = new ScriptedGit(' M plan/0.0-alpha.md');
    const invoker: ClaudeInvoker = {
      invoke() {
        fs.writeFile('plan/0.0-alpha.md', ALPHA.replace('A task.', 'refined'), 'utf-8');
        git.dirty = true;
        return JSON.stringify({ result: 'refined' });
      },
    };
    const config = makeConfig({ fs, git, claudeInvoker: invoker, dryRun: true });

    const result = await runAgenticEpoch(0, config, {}, new Map(), queue('refine') as never);

    expect(result.completed).toBe(1);
    expect(git.commits).toHaveLength(0);
    expect(git.restores).toEqual([['plan/0.0-alpha.md']]);
  });
});
