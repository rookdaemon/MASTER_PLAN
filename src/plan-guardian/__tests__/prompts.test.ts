import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage } from '../prompts.js';
import { buildDAG } from '../dag.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import type { PlanningActionType } from '../interfaces.js';

const NOW = '2026-04-06T12:00:00.000Z';

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

Root task.
`;

const ALPHA = `---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-a1.md
  - plan/0.0.2-a2.md
---
# 0.0 Alpha [PLAN]

Alpha description.
`;

const A1 = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 A1 [PLAN]

A simple leaf task.
`;

const A2 = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.2 A2 [PLAN]

Another leaf.
`;

describe('buildSystemPrompt', () => {
  const actionTypes: PlanningActionType[] = [
    'decompose', 'research', 'refine', 'consolidate', 'promote', 'status-update', 'execute',
  ];

  for (const action of actionTypes) {
    it(`contains Plan Guardian identity for ${action}`, () => {
      const prompt = buildSystemPrompt(action);
      expect(prompt).toContain('Plan Guardian');
      expect(prompt).toContain('plan-file:');
      expect(prompt).toContain('Filename rule:');
    });

    it(`contains action-specific instructions for ${action}`, () => {
      const prompt = buildSystemPrompt(action);
      // The action name appears in the prompt in some form (e.g. "DECOMPOSE", "STATUS-UPDATE")
      expect(prompt.toUpperCase()).toContain(action.toUpperCase());
    });
  }
});

describe('buildUserMessage', () => {
  it('includes target task content', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const a1 = dag.nodes.get('plan/0.0.1-a1.md')!;
    const msg = buildUserMessage(a1, dag, 'decompose', NOW);
    expect(msg).toContain('plan/0.0.1-a1.md');
    expect(msg).toContain('A simple leaf task');
  });

  it('includes ancestor chain', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const a1 = dag.nodes.get('plan/0.0.1-a1.md')!;
    const msg = buildUserMessage(a1, dag, 'decompose', NOW);
    expect(msg).toContain('Ancestor Chain');
    expect(msg).toContain('Alpha');
  });

  it('includes siblings', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const a1 = dag.nodes.get('plan/0.0.1-a1.md')!;
    const msg = buildUserMessage(a1, dag, 'decompose', NOW);
    expect(msg).toContain('Siblings');
    expect(msg).toContain('A2');
  });

  it('includes children for consolidate action', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const alpha = dag.nodes.get('plan/0.0-alpha.md')!;
    const msg = buildUserMessage(alpha, dag, 'consolidate', NOW);
    expect(msg).toContain('Children');
    expect(msg).toContain('A1');
    expect(msg).toContain('A2');
  });

  it('includes current time', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const a1 = dag.nodes.get('plan/0.0.1-a1.md')!;
    const msg = buildUserMessage(a1, dag, 'decompose', NOW);
    expect(msg).toContain(NOW);
  });
});
