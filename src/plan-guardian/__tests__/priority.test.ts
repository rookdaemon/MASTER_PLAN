import { describe, it, expect } from 'vitest';
import { prioritize, selectIndependentBatch, determineActionType, computeWriteSet } from '../priority.js';
import { buildDAG } from '../dag.js';
import { InMemoryFileSystem } from '../../agent-runtime/filesystem.js';
import type { PlanFile, PlanningActionType } from '../interfaces.js';

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
# 0 Root [DONE]

Root.
`;

const ALPHA = `---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-a1.md
  - plan/0.0.2-a2.md
---
# 0.0 Alpha [PLAN]

Alpha.
`;

const BETA = `---
parent: plan/root.md
root: plan/root.md
blocked-by:
  - plan/0.0-alpha.md
---
# 0.1 Beta [PLAN]

Blocked by alpha.
`;

const A1 = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.1 A1 [PLAN]

A leaf.
`;

const A2 = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.2 A2 [IMPLEMENT]

Another leaf.
`;

const NOW = '2026-04-06T12:00:00.000Z';

describe('prioritize', () => {
  it('returns non-DONE, unblocked tasks sorted by score', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const result = prioritize(dag, NOW);

    // Beta is blocked by alpha (PLAN, not DONE), so it should not appear
    const paths = result.map(r => r.task.path);
    expect(paths).not.toContain('plan/0.1-beta.md');
    expect(paths).not.toContain('plan/root.md'); // DONE
    // Parent-first gating: children are not eligible while parent is in progress.
    expect(paths).toContain('plan/0.0-alpha.md');
    expect(paths).not.toContain('plan/0.0.1-a1.md');
    expect(paths).not.toContain('plan/0.0.2-a2.md');
  });

  it('returns empty when everything is DONE', async () => {
    const allDone = `---
root: plan/root.md
---
# 0 Root [DONE]

Done.
`;
    const fs = makeFs({ 'plan/root.md': allDone });
    const dag = await buildDAG(fs, 'plan');
    expect(prioritize(dag, NOW)).toEqual([]);
  });

  it('includes blocked items as research candidates when everything is blocked', async () => {
    const root = `---
root: plan/root.md
children:
  - plan/0.0-a.md
  - plan/0.1-blocker.md
---
# 0 Root [DONE]

Root.
`;
    const a = `---
parent: plan/root.md
root: plan/root.md
blocked-by:
  - plan/0.1-blocker.md
---
# 0.0 A [PLAN]

Blocked.
`;
    const blocker = `---
parent: plan/root.md
root: plan/root.md
blocked-by:
  - plan/0.0-a.md
---
# 0.1 Blocker [PLAN]

Also blocked (circular for test purposes).
`;
    const fs = makeFs({
      'plan/root.md': root,
      'plan/0.0-a.md': a,
      'plan/0.1-blocker.md': blocker,
    });
    const dag = await buildDAG(fs, 'plan');
    const result = prioritize(dag, NOW);
    // Should still return something (research candidate)
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].actionType).toBe('research');
  });

  it('prefers IMPLEMENT/REVIEW over PLAN (status progression)', async () => {
    const root = `---
root: plan/root.md
children:
  - plan/0.0-a1.md
  - plan/0.1-a2.md
---
# 0 Root [DONE]

Root.
`;
    const a1Plan = `---
parent: plan/root.md
root: plan/root.md
---
# 0.0 A1 [PLAN]

Plan leaf.
`;
    const a2Implement = `---
parent: plan/root.md
root: plan/root.md
---
# 0.1 A2 [IMPLEMENT]

Implement leaf.
`;

    const fs = makeFs({
      'plan/root.md': root,
      'plan/0.0-a1.md': a1Plan,
      'plan/0.1-a2.md': a2Implement,
    });
    const dag = await buildDAG(fs, 'plan');
    const result = prioritize(dag, NOW);
    // A2 is IMPLEMENT, A1 is PLAN — A2 should rank higher when both are eligible.
    const a1Idx = result.findIndex(r => r.task.path === 'plan/0.0-a1.md');
    const a2Idx = result.findIndex(r => r.task.path === 'plan/0.1-a2.md');
    expect(a2Idx).toBeLessThan(a1Idx);
  });
});

describe('selectIndependentBatch', () => {
  it('selects tasks with non-overlapping write sets', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const candidates = prioritize(dag, NOW);
    const batch = selectIndependentBatch(candidates, 20);

    // All items in batch must have non-overlapping write sets
    const allPaths = new Set<string>();
    for (const item of batch) {
      for (const p of item.writeSet) {
        expect(allPaths.has(p)).toBe(false);
        allPaths.add(p);
      }
    }
  });

  it('respects concurrency limit', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    const candidates = prioritize(dag, NOW);
    const batch = selectIndependentBatch(candidates, 1);
    expect(batch.length).toBeLessThanOrEqual(1);
  });
});

describe('determineActionType', () => {
  it('returns status-update when all children are DONE', async () => {
    const root = `---
root: plan/root.md
children:
  - plan/0.0-a.md
---
# 0 Root [PLAN]

Root.
`;
    const a = `---
parent: plan/root.md
root: plan/root.md
---
# 0.0 A [DONE]

Done child.
`;
    const fs = makeFs({ 'plan/root.md': root, 'plan/0.0-a.md': a });
    const dag = await buildDAG(fs, 'plan');
    const rootNode = dag.nodes.get('plan/root.md')!;
    expect(determineActionType(rootNode, dag)).toBe('status-update');
  });

  it('returns decompose for non-leaf PLAN node with undone children', async () => {
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA,
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
    });
    const dag = await buildDAG(fs, 'plan');
    // Alpha has children that are not DONE — but alpha itself is a branch
    // Since alpha already has children, the action on alpha would be status-related
    // A1 is a leaf in PLAN → should decompose
    const a1 = dag.nodes.get('plan/0.0.1-a1.md')!;
    expect(determineActionType(a1, dag)).toBe('decompose');
  });

  it('returns refine for leaf in ARCHITECT status', async () => {
    const archLeaf = `---
parent: plan/0.0-alpha.md
root: plan/root.md
---
# 0.0.3 Arch [ARCHITECT]

Needs refinement.
`;
    const fs = makeFs({
      'plan/root.md': ROOT,
      'plan/0.0-alpha.md': ALPHA.replace(
        '  - plan/0.0.2-a2.md',
        '  - plan/0.0.2-a2.md\n  - plan/0.0.3-arch.md',
      ),
      'plan/0.1-beta.md': BETA,
      'plan/0.0.1-a1.md': A1,
      'plan/0.0.2-a2.md': A2,
      'plan/0.0.3-arch.md': archLeaf,
    });
    const dag = await buildDAG(fs, 'plan');
    const arch = dag.nodes.get('plan/0.0.3-arch.md')!;
    expect(determineActionType(arch, dag)).toBe('refine');
  });

  it('returns reconcile for branch with child parent mismatch', async () => {
    const root = `---
root: plan/root.md
children:
  - plan/0.0-parent.md
---
# 0 Root [PLAN]

Root.
`;
    const parent = `---
parent: plan/root.md
root: plan/root.md
children:
  - plan/0.0.1-child.md
---
# 0.0 Parent [PLAN]

Parent.
`;
    const child = `---
parent: plan/0.0-other-parent.md
root: plan/root.md
---
# 0.0.1 Child [PLAN]

Child.
`;

    const fs = makeFs({
      'plan/root.md': root,
      'plan/0.0-parent.md': parent,
      'plan/0.0.1-child.md': child,
    });
    const dag = await buildDAG(fs, 'plan');
    const parentNode = dag.nodes.get('plan/0.0-parent.md')!;
    expect(determineActionType(parentNode, dag)).toBe('reconcile');
  });
});

describe('computeWriteSet', () => {
  it('decompose writes parent + new file paths', () => {
    const ws = computeWriteSet('decompose', 'plan/0.0.1-a1.md', 'plan/0.0-alpha.md');
    expect(ws).toContain('plan/0.0.1-a1.md');
    expect(ws).toContain('plan/0.0-alpha.md');
  });

  it('refine only writes target', () => {
    const ws = computeWriteSet('refine', 'plan/0.0.1-a1.md', 'plan/0.0-alpha.md');
    expect(ws).toEqual(['plan/0.0.1-a1.md']);
  });

  it('promote only writes target', () => {
    const ws = computeWriteSet('promote', 'plan/0.0.1-a1.md', 'plan/0.0-alpha.md');
    expect(ws).toEqual(['plan/0.0.1-a1.md']);
  });

  it('status-update only writes target', () => {
    const ws = computeWriteSet('status-update', 'plan/0.0-alpha.md', 'plan/root.md');
    expect(ws).toEqual(['plan/0.0-alpha.md']);
  });

  it('reconcile writes target + parent', () => {
    const ws = computeWriteSet('reconcile', 'plan/0.0-alpha.md', 'plan/root.md');
    expect(ws).toContain('plan/0.0-alpha.md');
    expect(ws).toContain('plan/root.md');
  });
});
