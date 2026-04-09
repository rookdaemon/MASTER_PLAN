import { describe, it, expect } from 'vitest';
import { runScheduler, runEpoch } from '../scheduler.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import { InMemoryGitOperations } from '../git-state.js';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';
import type { GuardianConfig, IGitOperations } from '../interfaces.js';

function makeFs(files: Record<string, string>): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  for (const [path, content] of Object.entries(files)) {
    fs.writeFile(path, content, 'utf-8');
  }
  return fs;
}

function mockProvider(response: string): IInferenceProvider {
  return {
    async probe() { return { reachable: true, latencyMs: 10 }; },
    async infer(): Promise<InferenceResult> {
      return {
        text: response,
        toolCalls: [],
        promptTokens: 100,
        completionTokens: 200,
        latencyMs: 50,
      };
    },
  };
}

const ROOT = `---
root: plan/root.md
children:
  - plan/0.0-alpha.md
---
# 0 Root [DONE]

Root.
`;

const ALPHA = `---
parent: plan/root.md
root: plan/root.md
---
# 0.0 Alpha [PLAN]

A task to decompose.
`;

const DECOMPOSE_RESPONSE = `\`\`\`plan-file:plan/0.0.1-sub.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Sub [PLAN]

A subtask.

## Acceptance Criteria
- Works
\`\`\`

\`\`\`plan-file:plan/0.0-alpha.md
---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-sub.md
---
# 0.0 Alpha [PLAN]

A task with children.
\`\`\``;

function makeConfig(fs: InMemoryFileSystem, overrides: Partial<GuardianConfig> = {}): GuardianConfig {
  return {
    planDir: 'plan',
    repoRoot: '.',
    concurrency: 20,
    requestedConcurrency: 20,
    maxIterations: 1,
    maxDepth: 8,
    dryRun: false,
    cycleThreshold: 3,
    strictIntegrity: true,
    maxNewFilesPerAction: 5,
    maxTokensPerCall: 4096,
    quarantineBranch: undefined,
    provider: mockProvider(DECOMPOSE_RESPONSE),
    fs,
    git: new InMemoryGitOperations(),
    clock: { now: () => '2026-04-06T12:00:00.000Z' },
    ...overrides,
  };
}

describe('runEpoch', () => {
  it('runs one epoch: selects task, calls LLM, writes files, commits', async () => {
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git });

    const result = await runEpoch(0, config);

    expect(result.dispatched).toBeGreaterThan(0);
    expect(result.completed).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(result.commits.length).toBeGreaterThan(0);
    expect(git.commits.length).toBeGreaterThan(0);
    expect(git.commits[0].message).toContain('[guardian]');

    // Verify files were written
    const newFileExists = fs.exists('plan/0.0.1-sub.md');
    expect(newFileExists).toBe(true);
  });

  it('returns zero dispatched when nothing to do', async () => {
    const allDone = `---
root: plan/root.md
---
# 0 Root [DONE]

Done.
`;
    const fs = makeFs({ 'plan/root.md': allDone });
    const config = makeConfig(fs);
    const result = await runEpoch(0, config);
    expect(result.dispatched).toBe(0);
  });

  it('does not write or commit in dry-run mode', async () => {
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, dryRun: true });

    const result = await runEpoch(0, config);
    expect(result.completed).toBeGreaterThan(0);
    expect(git.commits.length).toBe(0);
    expect(fs.exists('plan/0.0.1-sub.md')).toBe(false);
  });

  it('handles worker errors gracefully', async () => {
    const errorProvider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() { throw new Error('API error'); },
    };

    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, provider: errorProvider });

    const result = await runEpoch(0, config);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.completed).toBe(0);
    expect(git.commits.length).toBe(0);
  });

  it('does not throw process-fatal on strict graph integrity mismatch', async () => {
    const rootWithBadChild = `---
root: plan/root.md
children:
  - plan/0.0-alpha.md
  - plan/0.1-beta.md
---
# 0 Root [PLAN]

Root.
`;
    const alphaWrongParent = `---
parent: plan/0.0-wrong-parent.md
root: plan/root.md
---
# 0.0 Alpha [PLAN]

A task to decompose.
`;
    const betaWrongParent = `---
parent: plan/0.1-missing-parent.md
root: plan/root.md
---
# 0.1 Beta [PLAN]

Broken parent linkage that should survive unrelated actions.
`;

    const fs = makeFs({
      'plan/root.md': rootWithBadChild,
      'plan/0.0-alpha.md': alphaWrongParent,
      'plan/0.1-beta.md': betaWrongParent,
    });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, strictIntegrity: true });

    const result = await runEpoch(0, config);
    expect(result.dispatched).toBeGreaterThan(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.commits.length).toBe(0);
    expect(git.commits.length).toBe(0);
  });

  it('skips commit when writes stage no changes', async () => {
    const noopResponse = `\`\`\`plan-file:plan/0.0-alpha.md
---
parent: plan/root.md
root: plan/root.md
---
# 0.0 Alpha [PLAN]

A task to decompose.
\`\`\``;

    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    let commits = 0;
    const git: IGitOperations = {
      async add() {},
      async commit(message: string): Promise<string> {
        commits++;
        return `unexpected-${message}`;
      },
      async status(): Promise<string> {
        return '';
      },
      async stagedPaths(): Promise<string[]> {
        return [];
      },
    };
    const config = makeConfig(fs, {
      git,
      provider: mockProvider(noopResponse),
    });

    const result = await runEpoch(0, config);
    expect(result.dispatched).toBeGreaterThan(0);
    expect(result.completed).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(result.commits.length).toBe(0);
    expect(commits).toBe(0);
  });
});

describe('runScheduler', () => {
  it('runs multiple epochs until maxIterations', async () => {
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, maxIterations: 3 });

    const results = await runScheduler(config);
    // First epoch creates subtask, subsequent epochs work on it
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('stops early when nothing to dispatch', async () => {
    const allDone = `---
root: plan/root.md
---
# 0 Root [DONE]

Done.
`;
    const fs = makeFs({ 'plan/root.md': allDone });
    const config = makeConfig(fs, { maxIterations: 10 });

    const results = await runScheduler(config);
    expect(results.length).toBe(1);
    expect(results[0].dispatched).toBe(0);
  });

  it('deterministic status-update when all children DONE (no LLM)', async () => {
    const root = `---
root: plan/root.md
children:
  - plan/0.0-parent.md
---
# 0 Root [DONE]

Root.
`;
    const parent = `---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-child.md
---
# 0.0 Parent [PLAN]

Has one child.
`;
    const child = `---
parent: plan/0.0-parent.md
root: plan/root.md
---
# 0.0.1 Child [DONE]

Done child.
`;

    // Provider that would fail if called — proving no LLM call is made
    const failProvider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() { throw new Error('Should not be called for deterministic status-update'); },
    };

    const fs = makeFs({
      'plan/root.md': root,
      'plan/0.0-parent.md': parent,
      'plan/0.0.1-child.md': child,
    });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, provider: failProvider, maxIterations: 1 });

    const results = await runScheduler(config);
    expect(results[0].completed).toBe(1);
    expect(results[0].failed).toBe(0);
    // Verify the parent was updated to DONE
    const updatedContent = await fs.readFile('plan/0.0-parent.md', 'utf-8');
    expect(updatedContent).toContain('[DONE]');
    // Verify zero tokens used (deterministic, no LLM)
    expect(results[0].totalTokens.prompt).toBe(0);
  });

  it('fires callbacks', async () => {
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, maxIterations: 1 });

    const events: string[] = [];
    const results = await runScheduler(config, {
      onEpochStart(epoch, batchSize) { events.push(`start:${epoch}:${batchSize}`); },
      onWorkerStart(task, actionType) { events.push(`worker-start:${actionType}:${task}`); },
      onWorkerComplete() { events.push('complete'); },
      onCommit(hash) { events.push(`commit:${hash}`); },
      onEpochEnd() { events.push('end'); },
    });

    expect(events[0]).toMatch(/^start:0:\d+$/);
    expect(events.some(e => e.startsWith('worker-start:'))).toBe(true);
    expect(events).toContain('complete');
    expect(events.some(e => e.startsWith('commit:'))).toBe(true);
    expect(events[events.length - 1]).toBe('end');
  });
});
