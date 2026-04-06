import { describe, it, expect } from 'vitest';
import { parseActionOutput } from '../actions.js';

const NOW = '2026-04-06T12:00:00.000Z';

describe('parseActionOutput', () => {
  it('parses decompose output with new subtasks and updated parent', () => {
    const llmOutput = `Here are the subtasks:

\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Setup [PLAN]

## Description
Set up the project.

## Acceptance Criteria
- Project initialized
- Dependencies installed
\`\`\`

\`\`\`plan-file:plan/0.0.2-implement.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.2 Implement [PLAN]

## Description
Write the code.

## Acceptance Criteria
- Code compiles
- Tests pass
\`\`\`

\`\`\`plan-file:plan/0.0-alpha.md
---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-setup.md
  - plan/0.0.2-implement.md
---
# 0.0 Alpha [PLAN]

Alpha description.
\`\`\``;

    const action = parseActionOutput(llmOutput, 'decompose', 'plan/0.0-alpha.md', NOW);
    expect(action.type).toBe('decompose');
    expect(action.targetPath).toBe('plan/0.0-alpha.md');
    expect(action.filesCreated).toHaveLength(2);
    expect(action.filesCreated[0].path).toBe('plan/0.0.1-setup.md');
    expect(action.filesCreated[1].path).toBe('plan/0.0.2-implement.md');
    expect(action.filesModified).toHaveLength(1);
    expect(action.filesModified[0].path).toBe('plan/0.0-alpha.md');
    expect(action.writeSet).toContain('plan/0.0-alpha.md');
    expect(action.writeSet).toContain('plan/0.0.1-setup.md');
  });

  it('parses refine output with updated target', () => {
    const llmOutput = `\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Setup [ARCHITECT]

## Description
Set up with detailed instructions.

## Acceptance Criteria
- Project initialized with TypeScript
- All dependencies installed
- Config files created

## Revision History
- 2026-04-06T12:00:00.000Z: refined description and acceptance criteria
\`\`\``;

    const action = parseActionOutput(llmOutput, 'refine', 'plan/0.0.1-setup.md', NOW);
    expect(action.type).toBe('refine');
    expect(action.filesModified).toHaveLength(1);
    expect(action.filesModified[0].path).toBe('plan/0.0.1-setup.md');
    expect(action.filesCreated).toHaveLength(0);
  });

  it('parses execute output with artifact blocks', () => {
    const llmOutput = `\`\`\`artifact:src/utils/helper.ts
export function helper(): string {
  return 'hello';
}
\`\`\`

\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Setup [REVIEW]

## Description
Set up the project.

## Revision History
- 2026-04-06T12:00:00.000Z: executed — produced src/utils/helper.ts
\`\`\``;

    const action = parseActionOutput(llmOutput, 'execute', 'plan/0.0.1-setup.md', NOW);
    expect(action.type).toBe('execute');
    expect(action.filesCreated).toHaveLength(1);
    expect(action.filesCreated[0].path).toBe('src/utils/helper.ts');
    expect(action.filesCreated[0].content).toContain("return 'hello'");
    expect(action.filesModified).toHaveLength(1);
    expect(action.filesModified[0].path).toBe('plan/0.0.1-setup.md');
  });

  it('generates summary from first plan-file heading', () => {
    const llmOutput = `\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Setup [PLAN]

Desc.
\`\`\``;

    const action = parseActionOutput(llmOutput, 'decompose', 'plan/0.0.1-setup.md', NOW);
    expect(action.summary).toBeTruthy();
    expect(action.summary.length).toBeGreaterThan(0);
  });

  it('throws on empty output (no plan-file blocks)', () => {
    expect(() => parseActionOutput('No structured output here.', 'decompose', 'plan/0.0-alpha.md', NOW))
      .toThrow();
  });

  it('parses delete directives from consolidate', () => {
    const llmOutput = `<!-- DELETE: plan/0.0.3-old.md -->

\`\`\`plan-file:plan/0.0-alpha.md
---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-setup.md
---
# 0.0 Alpha [PLAN]

Updated.
\`\`\``;

    const action = parseActionOutput(llmOutput, 'consolidate', 'plan/0.0-alpha.md', NOW);
    expect(action.filesModified).toHaveLength(1);
    // Delete directives are tracked in writeSet
    expect(action.writeSet).toContain('plan/0.0.3-old.md');
  });
});
