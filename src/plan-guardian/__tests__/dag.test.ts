import { describe, it, expect } from 'vitest';
import { buildDAG } from '../dag.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';

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
  - plan/0.1-beta.md
---
# 0 MASTER_PLAN [DONE]

Root task.
`;

const ALPHA = `---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-child-a.md
  - plan/0.0.2-child-b.md
---
# 0.0 Alpha [PLAN]

Alpha description.
`;

const BETA = `---
parent: plan/root.md
root: plan/root.md
blocked-by:
  - plan/0.0-alpha.md
---
# 0.1 Beta [PLAN]

Beta depends on alpha.
`;

const CHILD_A = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 Child A [IMPLEMENT]

A leaf.

## Revision History
- 2026-04-01T10:00:00.000Z: status PLAN → IMPLEMENT
`;

const CHILD_B = `---
parent: plan/0.0-alpha.md
root: plan/root.md
depends-on:
  - plan/0.0.1-child-a.md
---
# 0.0.2 Child B [PLAN]

Another leaf.
`;

describe('buildDAG', () => {
  it('loads all plan files into nodes', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    expect(dag.nodes.size).toBe(5);
  });

  it('childrenOf returns correct children', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');

    const rootChildren = dag.childrenOf('plan/root.md');
    expect(rootChildren.map(c => c.path).sort()).toEqual([
      'plan/0.0-alpha.md',
      'plan/0.1-beta.md',
    ]);

    const alphaChildren = dag.childrenOf('plan/0.0-alpha.md');
    expect(alphaChildren.map(c => c.path).sort()).toEqual([
      'plan/0.0.1-child-a.md',
      'plan/0.0.2-child-b.md',
    ]);
  });

  it('childrenOf returns empty array for leaf', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    expect(dag.childrenOf('plan/0.0.1-child-a.md')).toEqual([]);
  });

  it('parentOf returns correct parent', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    expect(dag.parentOf('plan/0.0-alpha.md')?.path).toBe('plan/root.md');
    expect(dag.parentOf('plan/root.md')).toBeNull();
  });

  it('blockers returns blocked-by items', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    const betaBlockers = dag.blockers('plan/0.1-beta.md');
    expect(betaBlockers.map(b => b.path)).toEqual(['plan/0.0-alpha.md']);
  });

  it('dependants returns depends-on items', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    const deps = dag.dependants('plan/0.0.2-child-b.md');
    expect(deps.map(d => d.path)).toEqual(['plan/0.0.1-child-a.md']);
  });

  it('leaves returns only leaf nodes', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    const leafPaths = dag.leaves().map(l => l.path).sort();
    expect(leafPaths).toEqual([
      'plan/0.0.1-child-a.md',
      'plan/0.0.2-child-b.md',
      'plan/0.1-beta.md',
    ]);
  });

  it('roots returns top-level children of root', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    const rootPaths = dag.roots().map(r => r.path).sort();
    expect(rootPaths).toEqual(['plan/0.0-alpha.md', 'plan/0.1-beta.md']);
  });

  it('byStatus filters correctly', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
    });
    const dag = await buildDAG(fs, 'plan');
    expect(dag.byStatus('DONE').map(n => n.path)).toEqual(['plan/root.md']);
    expect(dag.byStatus('IMPLEMENT').map(n => n.path)).toEqual(['plan/0.0.1-child-a.md']);
    expect(dag.byStatus('PLAN').length).toBe(3);
  });

  it('handles missing references gracefully', async () => {
    const orphan = `---
parent: plan/nonexistent.md
root: plan/root.md
blocked-by:
  - plan/also-missing.md
---
# 0.9 Orphan [PLAN]

Missing parent.
`;
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-child-a.md': CHILD_A,
      'plan/0.0.2-child-b.md': CHILD_B,
      'plan/0.9-orphan.md': orphan,
    });
    const dag = await buildDAG(fs, 'plan');
    expect(dag.parentOf('plan/0.9-orphan.md')).toBeNull();
    expect(dag.blockers('plan/0.9-orphan.md')).toEqual([]);
  });
});
