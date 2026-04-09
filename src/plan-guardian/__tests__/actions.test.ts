import { describe, it, expect } from 'vitest';
import { parseActionOutput, validateOutputBlocks } from '../actions.js';

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

describe('validateOutputBlocks', () => {
  const GOOD_OUTPUT = `\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Setup [PLAN]

Content.
\`\`\``;

  it('returns no violations for a well-formed block', () => {
    expect(validateOutputBlocks(GOOD_OUTPUT)).toEqual([]);
  });

  it('reports missing root: field', () => {
    const text = `\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
---
# 0.0.1 Setup [PLAN]
\`\`\``;
    const v = validateOutputBlocks(text);
    expect(v.some(s => s.includes('"root:"'))).toBe(true);
  });

  it('reports missing parent: field for non-root node', () => {
    const text = `\`\`\`plan-file:plan/0.0.1-setup.md
---
root: plan/root.md
---
# 0.0.1 Setup [PLAN]
\`\`\``;
    const v = validateOutputBlocks(text);
    expect(v.some(s => s.includes('"parent:"'))).toBe(true);
  });

  it('does not require parent: for root.md', () => {
    const text = `\`\`\`plan-file:plan/root.md
---
root: plan/root.md
---
# 0 Root [PLAN]
\`\`\``;
    expect(validateOutputBlocks(text)).toEqual([]);
  });

  it('reports missing or malformed H1 heading', () => {
    const text = `\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
Some body without an H1.
\`\`\``;
    const v = validateOutputBlocks(text);
    expect(v.some(s => s.includes('H1 heading'))).toBe(true);
  });

  it('reports unknown status tag', () => {
    const text = `\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Setup [INPROGRESS]
\`\`\``;
    const v = validateOutputBlocks(text);
    expect(v.some(s => s.includes('unknown status'))).toBe(true);
  });

  it('reports H1 numeric id mismatch with filename', () => {
    const text = `\`\`\`plan-file:plan/0.0.1-setup.md
---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.2 Setup [PLAN]
\`\`\``;
    const v = validateOutputBlocks(text);
    expect(v.some(s => s.includes('does not match filename id'))).toBe(true);
  });

  it('returns no violations when output has no plan-file blocks', () => {
    expect(validateOutputBlocks('Some plain text with no blocks.')).toEqual([]);
  });
});
