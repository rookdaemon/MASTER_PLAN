import { describe, it, expect } from 'vitest';
import { runAgenticParallelEpoch } from '../scheduler.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import { InMemoryGitOperations } from '../git-state.js';
import type { ClaudeInvoker } from '../claude-invoker.js';
import type { GuardianConfig, IGitOperations } from '../interfaces.js';
import type { IWorktreePool } from '../worktree-pool.js';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';

const NOW = '2026-06-09T12:00:00.000Z';

/** Per-worktree git double with a mutable porcelain, clean until an edit lands. */
class WtGit extends InMemoryGitOperations {
  porcelain = '';
  override async status(): Promise<string> {
    return this.porcelain;
  }
}

/** Fake pool: dir 'wt{i}', a distinct WtGit per index. */
class FakePool implements IWorktreePool {
  readonly prepared: number[] = [];
  readonly gits: WtGit[];
  constructor(readonly size: number) {
    this.gits = Array.from({ length: size }, () => new WtGit());
  }
  async prepare(i: number): Promise<void> {
    this.prepared.push(i);
  }
  dir(i: number): string {
    return `wt${i}`;
  }
  git(i: number): IGitOperations {
    return this.gits[i];
  }
  async cleanup(): Promise<void> {}
}

const throwingProvider: IInferenceProvider = {
  async probe() {
    return { reachable: false, latencyMs: 0 };
  },
  async infer(): Promise<InferenceResult> {
    throw new Error('provider must not be called in agentic mode');
  },
};

function makeFs(): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  fs.writeFile(
    'plan/root.md',
    '---\nroot: plan/root.md\nchildren:\n  - plan/0.0-alpha.md\n  - plan/0.1-beta.md\n---\n# 0 Root [PLAN]\n\nRoot.\n',
    'utf-8',
  );
  fs.writeFile('plan/0.0-alpha.md', '---\nparent: plan/root.md\nroot: plan/root.md\n---\n# 0.0 Alpha [PLAN]\n\nA.\n', 'utf-8');
  fs.writeFile('plan/0.1-beta.md', '---\nparent: plan/root.md\nroot: plan/root.md\n---\n# 0.1 Beta [PLAN]\n\nB.\n', 'utf-8');
  return fs;
}

function makeConfig(over: Partial<GuardianConfig>): GuardianConfig {
  return {
    planDir: 'plan',
    repoRoot: '.',
    concurrency: 2,
    requestedConcurrency: 2,
    maxIterations: 1,
    maxDepth: 8,
    dryRun: false,
    cycleThreshold: 3,
    strictIntegrity: true,
    maxNewFilesPerAction: 5,
    maxTokensPerCall: 4096,
    provider: throwingProvider,
    fs: makeFs(),
    git: new InMemoryGitOperations(),
    clock: { now: () => NOW },
    sleeper: { sleep: async () => {} },
    executionMode: 'agentic',
    rootPlanFile: 'plan/root.md',
    claudeTimeoutMs: 1000,
    ...over,
  };
}

const titleFor: Record<string, string> = { 'plan/0.0-alpha.md': '0.0 Alpha', 'plan/0.1-beta.md': '0.1 Beta' };

describe('runAgenticParallelEpoch', () => {
  it('runs cards concurrently in worktrees and commits each to main serially', async () => {
    const fs = makeFs();
    const pool = new FakePool(2);
    let arrivals = 0;
    let maxActive = 0;
    let active = 0;
    let releaseBoth!: () => void;
    const bothInvoked = new Promise<void>(resolve => {
      releaseBoth = resolve;
    });

    // Each invocation: identify the worktree from cwd, edit that card in the
    // worktree, and mark that worktree's git dirty with the card's diff.
    const invoker: ClaudeInvoker = {
      async invoke(args, _timeout, cwd) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        arrivals += 1;
        if (arrivals === 2) releaseBoth();
        await bothInvoked;

        const i = Number(String(cwd).replace('wt', ''));
        const userTurn = args[args.indexOf('--') + 1] ?? '';
        const cardPath = userTurn.match(/@(plan\/[^\s]+\.md)/)?.[1] ?? '';
        const title = titleFor[cardPath];
        const newContent = `---\nparent: plan/root.md\nroot: plan/root.md\n---\n# ${title} [PLAN]\n\nRefined by agent.\n`;
        fs.writeFile(`${cwd}/${cardPath}`, newContent, 'utf-8'); // edit in the worktree
        pool.gits[i].porcelain = ` M ${cardPath}`;
        active -= 1;
        return JSON.stringify({ type: 'result', result: 'refined', total_cost_usd: 0.01 });
      },
    };

    const config = makeConfig({ fs, git: new InMemoryGitOperations(), claudeInvoker: invoker, worktreePool: pool });

    const started: string[] = [];
    const startedModels: string[] = [];
    const result = await runAgenticParallelEpoch(0, config, {
      onWorkerStart: (task, _action, model) => {
        started.push(task);
        if (model) startedModels.push(model);
      },
    }, new Map(), [
      { path: 'plan/0.0-alpha.md', actionType: 'refine', writeSet: ['plan/0.0-alpha.md'] },
      { path: 'plan/0.1-beta.md', actionType: 'refine', writeSet: ['plan/0.1-beta.md'] },
    ] as never);

    // Both cards dispatched (in parallel) and both worktrees prepared.
    expect(started.sort()).toEqual(['plan/0.0-alpha.md', 'plan/0.1-beta.md']);
    expect(pool.prepared.sort()).toEqual([0, 1]);
    expect(maxActive).toBe(2);
    // A model·effort tag was reported for each (refine → sonnet·medium).
    expect(startedModels.every(m => m.includes('·'))).toBe(true);
    // Both applied + committed to main, no failures.
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    expect((config.git as InMemoryGitOperations).commits).toHaveLength(2);
    // Main tree now has the refined content.
    expect(await fs.readFile('plan/0.0-alpha.md', 'utf-8')).toContain('Refined by agent');
  });

  it('refuses to run on a dirty main tree', async () => {
    const fs = makeFs();
    const dirtyMain: IGitOperations = {
      async add() {},
      async commit() { return 'x'; },
      async status() { return ' M plan/something.md'; },
      async stagedPaths() { return []; },
      async restore() {},
    };
    const invoker: ClaudeInvoker = { invoke: () => JSON.stringify({ result: 'noop' }) };
    const config = makeConfig({ fs, git: dirtyMain, claudeInvoker: invoker, worktreePool: new FakePool(2) });

    await expect(
      runAgenticParallelEpoch(0, config, {}, new Map(), [
        { path: 'plan/0.0-alpha.md', actionType: 'refine', writeSet: ['plan/0.0-alpha.md'] },
      ] as never),
    ).rejects.toThrow(/uncommitted|working tree/i);
  });
});
