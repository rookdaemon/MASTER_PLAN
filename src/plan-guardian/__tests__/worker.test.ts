import { describe, it, expect } from 'vitest';
import { runPlanningWorker } from '../worker.js';
import { buildDAG } from '../dag.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';

const NOW = '2026-04-06T12:00:00.000Z';

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

function makeFs(files: Record<string, string>): InMemoryFileSystem {
  const fs = new InMemoryFileSystem();
  for (const [path, content] of Object.entries(files)) {
    fs.writeFile(path, content, 'utf-8');
  }
  return fs;
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

describe('runPlanningWorker', () => {
  it('calls provider and returns parsed action', async () => {
    const llmResponse = `\`\`\`plan-file:plan/0.0.1-sub.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Sub [PLAN]

A subtask.
\`\`\`

\`\`\`plan-file:plan/0.0-alpha.md
---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-sub.md
---
# 0.0 Alpha [PLAN]

A task.
\`\`\``;

    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
    });
    const dag = await buildDAG(fs, 'plan');
    const task = dag.nodes.get('plan/0.0-alpha.md')!;
    const provider = mockProvider(llmResponse);

    const result = await runPlanningWorker(task, 'decompose', dag, provider, NOW);

    expect(result.action.type).toBe('decompose');
    expect(result.action.filesCreated).toHaveLength(1);
    expect(result.action.filesModified).toHaveLength(1);
    expect(result.tokensUsed.prompt).toBe(100);
    expect(result.tokensUsed.completion).toBe(200);
    expect(result.latencyMs).toBe(50);
  });

  it('propagates LLM errors', async () => {
    const provider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer() { throw new Error('API rate limit'); },
    };

    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
    });
    const dag = await buildDAG(fs, 'plan');
    const task = dag.nodes.get('plan/0.0-alpha.md')!;

    await expect(runPlanningWorker(task, 'decompose', dag, provider, NOW))
      .rejects.toThrow('API rate limit');
  });

  it('uses recursive repair prompts with latest integrity errors', async () => {
    const validResponse = `\`\`\`plan-file:plan/0.0.1-sub.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Sub [PLAN]

A subtask.
\`\`\`

\`\`\`plan-file:plan/0.0-alpha.md
---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-sub.md
---
# 0.0 Alpha [PLAN]

A task.
\`\`\``;

    const outputs = ['bad-output-1', 'bad-output-2', validResponse];
    const prompts: string[] = [];
    const provider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer(_system, messages): Promise<InferenceResult> {
        prompts.push(messages[0].role === 'user' ? messages[0].content : '');
        const text = outputs.shift() ?? validResponse;
        return {
          text,
          toolCalls: [],
          promptTokens: 10,
          completionTokens: 20,
          latencyMs: 5,
        };
      },
    };

    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
    });
    const dag = await buildDAG(fs, 'plan');
    const task = dag.nodes.get('plan/0.0-alpha.md')!;

    const validateText = (text: string): string[] => {
      if (text === 'bad-output-1') return ['first integrity issue'];
      if (text === 'bad-output-2') return ['second integrity issue'];
      return [];
    };

    const result = await runPlanningWorker(task, 'decompose', dag, provider, NOW, 4096, validateText);

    expect(result.action.type).toBe('decompose');
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain('REPAIR REQUIRED (attempt 2)');
    expect(prompts[1]).toContain('first integrity issue');
    expect(prompts[2]).toContain('REPAIR REQUIRED (attempt 3)');
    expect(prompts[2]).toContain('second integrity issue');
  });

  it('fails after exhausting recursive repair attempts', async () => {
    const provider: IInferenceProvider = {
      async probe() { return { reachable: true, latencyMs: 10 }; },
      async infer(): Promise<InferenceResult> {
        return {
          text: 'still-invalid',
          toolCalls: [],
          promptTokens: 10,
          completionTokens: 20,
          latencyMs: 5,
        };
      },
    };

    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
    });
    const dag = await buildDAG(fs, 'plan');
    const task = dag.nodes.get('plan/0.0-alpha.md')!;

    const validateText = (): string[] => ['persistent integrity issue'];

    await expect(
      runPlanningWorker(task, 'decompose', dag, provider, NOW, 4096, validateText),
    ).rejects.toThrow(/Integrity retry failed after 3 attempts/);
  });
});
