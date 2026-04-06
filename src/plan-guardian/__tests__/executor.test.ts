import { describe, it, expect } from 'vitest';
import { runExecutionWorker } from '../executor.js';
import { parsePlanFile } from '../plan-file.js';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';

const NOW = '2026-04-06T12:00:00.000Z';

function mockProvider(response: string): IInferenceProvider {
  return {
    async probe() { return { reachable: true, latencyMs: 10 }; },
    async infer(): Promise<InferenceResult> {
      return {
        text: response,
        toolCalls: [],
        promptTokens: 50,
        completionTokens: 150,
        latencyMs: 30,
      };
    },
  };
}

const PROMOTED_TASK = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Write Helper [IMPLEMENT]

## Description
Write a helper function.

## Execution Spec
Create src/utils/helper.ts with a single exported function \`greet(name: string): string\` that returns "Hello, {name}!".

## Acceptance Criteria
- File exists at src/utils/helper.ts
- Function is exported
- Returns correct greeting
`;

describe('runExecutionWorker', () => {
  it('sends execution spec to provider and parses artifact output', async () => {
    const llmResponse = `\`\`\`artifact:src/utils/helper.ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

\`\`\`plan-file:plan/0.0.1-write-helper.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Write Helper [REVIEW]

## Description
Write a helper function.

## Revision History
- 2026-04-06T12:00:00.000Z: executed — produced src/utils/helper.ts
\`\`\``;

    const task = parsePlanFile('plan/0.0.1-write-helper.md', PROMOTED_TASK);
    const provider = mockProvider(llmResponse);
    const result = await runExecutionWorker(task, provider, NOW);

    expect(result.action.type).toBe('execute');
    expect(result.action.filesCreated).toHaveLength(1);
    expect(result.action.filesCreated[0].path).toBe('src/utils/helper.ts');
    expect(result.action.filesCreated[0].content).toContain('greet');
    expect(result.action.filesModified).toHaveLength(1);
    expect(result.action.filesModified[0].path).toBe('plan/0.0.1-write-helper.md');
    expect(result.tokensUsed.prompt).toBe(50);
  });

  it('works with task that has no Execution Spec section', async () => {
    const noSpecTask = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.2 Simple Task [IMPLEMENT]

## Description
Just do it.

## Acceptance Criteria
- Done
`;
    const llmResponse = `\`\`\`plan-file:plan/0.0.2-simple.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.2 Simple Task [REVIEW]

Done.
\`\`\``;

    const task = parsePlanFile('plan/0.0.2-simple.md', noSpecTask);
    const provider = mockProvider(llmResponse);
    const result = await runExecutionWorker(task, provider, NOW);
    expect(result.action.type).toBe('execute');
  });
});
