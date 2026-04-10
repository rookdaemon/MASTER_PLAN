import { describe, it, expect } from 'vitest';
import { runScheduler, runEpoch } from '../scheduler.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import { InMemoryGitOperations } from '../git-state.js';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';
import type { GuardianConfig, IGitOperations } from '../interfaces.js';
import type { IModelSelector } from '../model-selector.js';

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
    async infer(systemPrompt: string): Promise<InferenceResult> {
      const text = systemPrompt.includes('SANITY_PASS_GATE') ? 'PASS' : response;
      return {
        text,
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
    sleeper: { sleep: async () => {} },
    ...overrides,
  };
}

function makeAdvancingClock(startIso: string): {
  clock: GuardianConfig['clock'];
  sleeper: GuardianConfig['sleeper'];
  sleepCalls: number[];
} {
  let currentMs = Date.parse(startIso);
  const sleepCalls: number[] = [];

  return {
    clock: { now: () => new Date(currentMs).toISOString() },
    sleeper: {
      sleep: async (ms: number) => {
        sleepCalls.push(ms);
        currentMs += ms;
      },
    },
    sleepCalls,
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

  it('does not throw process-fatal when model selector throws provider errors', async () => {
    const providerError = new Error('Provider returned error code 524');
    const throwingSelector: IModelSelector = {
      modelIds: ['a'],
      async execute() {
        throw providerError;
      },
      nextAvailableAtMs(nowMs: number) {
        return nowMs + 5000;
      },
    };

    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, {
      git,
      modelSelector: throwingSelector,
    });

    const result = await runEpoch(0, config);
    expect(result.dispatched).toBeGreaterThan(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.completed).toBe(0);
    expect(result.commits.length).toBe(0);
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

  it('rejects file apply when sanity gate detects malformed plan cards', async () => {
    const malformedResponse = `\`\`\`plan-file:plan/0.0.1-sub.md
# 0.0.1 Sub [PLAN]

Missing frontmatter.
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

    const provider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer(): Promise<InferenceResult> {
        return {
          text: malformedResponse,
          toolCalls: [],
          promptTokens: 10,
          completionTokens: 10,
          latencyMs: 10,
        };
      },
    };

    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, provider });

    const result = await runEpoch(0, config);
    expect(result.dispatched).toBeGreaterThan(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(git.commits.length).toBe(0);
    expect(fs.exists('plan/0.0.1-sub.md')).toBe(false);
  });
});

describe('runScheduler', () => {
  it('runs multiple epochs until maxIterations', async () => {
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, maxIterations: 3 });

    const results = await runScheduler(config).done;
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

    const results = await runScheduler(config).done;
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

    const results = await runScheduler(config).done;
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
    }).done;

    expect(events[0]).toMatch(/^start:0:\d+$/);
    expect(events.some(e => e.startsWith('worker-start:'))).toBe(true);
    expect(events).toContain('complete');
    expect(events.some(e => e.startsWith('commit:'))).toBe(true);
    expect(events[events.length - 1]).toBe('end');
  });

  it('soft stop: stops after current epoch, fires onSoftStop', async () => {
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const git = new InMemoryGitOperations();
    const config = makeConfig(fs, { git, maxIterations: 100 });

    let softStopFired = false;
    const handle = runScheduler(config, {
      onSoftStop() { softStopFired = true; },
      onEpochEnd() { handle.stop(); }, // stop after first epoch
    });

    const results = await handle.done;
    expect(softStopFired).toBe(true);
    expect(results.length).toBe(1); // only one epoch ran
  });

  it('applies exponential backoff on repeated 429s', async () => {
    const rateLimited: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() { throw new Error('Ollama/OpenAI API error 429: Too Many Requests'); },
    };

    const time = makeAdvancingClock('2026-04-06T12:00:00.000Z');
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const config = makeConfig(fs, {
      provider: rateLimited,
      maxIterations: 3,
      clock: time.clock,
      sleeper: time.sleeper,
    });

    const results = await runScheduler(config).done;
    expect(results).toHaveLength(1);
    expect(results[0].epoch).toBe(0);
    expect(results[0].rateLimitFailures).toBe(3);
    const totalSleep = time.sleepCalls.reduce((a, b) => a + b, 0);
    expect(totalSleep).toBe(5000 + 10000);
  });

  it('seeds initial backoff from metadata rpm', async () => {
    const rateLimited: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() { throw new Error('429 Too Many Requests'); },
    };

    const time = makeAdvancingClock('2026-04-06T12:00:00.000Z');
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const config = makeConfig(fs, {
      provider: rateLimited,
      maxIterations: 2,
      modelMetadata: {
        provider: 'openrouter',
        modelId: 'test-model',
        source: 'openrouter',
        notes: [],
        rateLimits: { requestsPerMinute: 6 },
      },
      clock: time.clock,
      sleeper: time.sleeper,
    });

    const results = await runScheduler(config).done;
    expect(results).toHaveLength(1);
    expect(results[0].epoch).toBe(0);
    const totalSleep = time.sleepCalls.reduce((a, b) => a + b, 0);
    expect(totalSleep).toBe(10000);
  });

  it('honors Retry-After hint and caps at two hours', async () => {
    const hinted: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() {
        throw new Error('Ollama/OpenAI API error 429: Too Many Requests\nRetry-After: 999999');
      },
    };

    const time = makeAdvancingClock('2026-04-06T12:00:00.000Z');
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const config = makeConfig(fs, {
      provider: hinted,
      maxIterations: 2,
      clock: time.clock,
      sleeper: time.sleeper,
    });

    const results = await runScheduler(config).done;
    expect(results).toHaveLength(1);
    expect(results[0].epoch).toBe(0);
    const totalSleep = time.sleepCalls.reduce((a, b) => a + b, 0);
    expect(totalSleep).toBe(2 * 60 * 60 * 1000);
  });

  it('uses X-RateLimit-Reset hint when present', async () => {
    const hinted: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() {
        throw new Error(
          'Ollama/OpenAI API error 429: Too Many Requests\n' +
          '{"error":{"metadata":{"headers":{"X-RateLimit-Reset":"1775476810000"}}}}',
        );
      },
    };

    const time = makeAdvancingClock('2026-04-06T12:00:00.000Z');
    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const config = makeConfig(fs, {
      provider: hinted,
      maxIterations: 2,
      clock: time.clock,
      sleeper: time.sleeper,
    });

    const results = await runScheduler(config).done;
    expect(results).toHaveLength(1);
    expect(results[0].epoch).toBe(0);
    const totalSleep = time.sleepCalls.reduce((a, b) => a + b, 0);
    expect(totalSleep).toBe(10000);
  });

  it('extracts provider rate-limit reason into epoch result', async () => {
    const provider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() {
        throw new Error(
          'Ollama/OpenAI API error 429: Too Many Requests\n' +
          '{"error":{"message":"Rate limit exceeded: free-models-per-min."}}',
        );
      },
    };

    const fs = makeFs({ 'plan/root.md': ROOT, 'plan/0.0-alpha.md': ALPHA });
    const config = makeConfig(fs, {
      provider,
      maxIterations: 1,
    });

    const results = await runScheduler(config).done;
    expect(results[0].rateLimitFailures).toBeGreaterThan(0);
    expect(results[0].rateLimitReasons[0]).toBe('free-models-per-min');
  });

  it('stops further submissions in the epoch after the first rate limit', async () => {
    const root = `---
root: plan/root.md
children:
  - plan/0.0-parent-a.md
  - plan/0.1-parent-b.md
---
# 0 Root [DONE]

Root.
`;
    const parentA = `---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-impl-a.md
---
# 0.0 Parent A [ARCHITECT]

Parent A.
`;
    const parentB = `---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.1.1-impl-b.md
---
# 0.1 Parent B [ARCHITECT]

Parent B.
`;
    const implA = `---
parent: plan/0.0-parent-a.md
root: plan/root.md
---
# 0.0.1 Impl A [IMPLEMENT]

Impl A.
`;
    const implB = `---
parent: plan/0.1-parent-b.md
root: plan/root.md
---
# 0.1.1 Impl B [IMPLEMENT]

Impl B.
`;

    const executionResponse = `\`\`\`artifact:artifacts/output.txt
ok
\`\`\`

\`\`\`plan-file:plan/0.1.1-impl-b.md
---
parent: plan/0.1-parent-b.md
root: plan/root.md
---
# 0.1.1 Impl B [REVIEW]

Impl B.
\`\`\``;

    const seenTaskPrompts: string[] = [];
    const provider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer(_systemPrompt, messages): Promise<InferenceResult> {
        const prompt = messages[0]?.role === 'user' ? messages[0].content : '';
        seenTaskPrompts.push(prompt);
        if (prompt.includes('Path: plan/0.0.1-impl-a.md')) {
          throw new Error('Ollama/OpenAI API error 429: Too Many Requests');
        }
        if (prompt.includes('SANITY_PASS_GATE')) {
          return { text: 'PASS', toolCalls: [], promptTokens: 10, completionTokens: 10, latencyMs: 10 };
        }
        return { text: executionResponse, toolCalls: [], promptTokens: 10, completionTokens: 10, latencyMs: 10 };
      },
    };

    const time = makeAdvancingClock('2026-04-06T12:00:00.000Z');
    const fs = makeFs({
      'plan/root.md': root,
      'plan/0.0-parent-a.md': parentA,
      'plan/0.1-parent-b.md': parentB,
      'plan/0.0.1-impl-a.md': implA,
      'plan/0.1.1-impl-b.md': implB,
    });
    const config = makeConfig(fs, {
      provider,
      maxIterations: 2,
      concurrency: 2,
      clock: time.clock,
      sleeper: time.sleeper,
    });

    const results = await runScheduler(config).done;
    expect(results).toHaveLength(1);
    expect(results[0].epoch).toBe(0);
    expect(results[0].rateLimitFailures).toBeGreaterThan(0);
    const totalSleep = time.sleepCalls.reduce((a, b) => a + b, 0);
    expect(totalSleep).toBe(5000);
    expect(seenTaskPrompts.some(prompt => prompt.includes('Path: plan/0.1.1-impl-b.md'))).toBe(false);
  });
});
