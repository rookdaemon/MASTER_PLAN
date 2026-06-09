import { describe, it, expect } from 'vitest';
import { selectModelEffort } from '../agentic-model-policy.js';
import type { PlanFile, PlanStatus } from '../interfaces.js';

function card(over: Partial<PlanFile> = {}): PlanFile {
  return {
    path: 'plan/0.5.1-x.md',
    frontmatter: { parent: 'plan/0.5-p.md', root: 'plan/root.md' },
    status: 'PLAN' as PlanStatus,
    numericId: '0.5.1',
    depth: 2,
    title: 'X',
    body: '# 0.5.1 X [PLAN]\n\nshort.\n',
    isLeaf: true,
    lastRevision: null,
    ...over,
  };
}

describe('selectModelEffort (balanced policy)', () => {
  it('routes heavy structural/judgment work to opus·high', () => {
    expect(selectModelEffort(card({ depth: 4, isLeaf: false }), 'decompose')).toMatchObject({ model: 'opus' });
    expect(selectModelEffort(card({ depth: 4 }), 'reconcile').model).toBe('opus');
  });

  it('routes implementation to sonnet·high and refinement to sonnet·medium', () => {
    expect(selectModelEffort(card({ depth: 4 }), 'execute')).toEqual({ model: 'sonnet', effort: 'high' });
    expect(selectModelEffort(card({ depth: 4 }), 'refine')).toEqual({ model: 'sonnet', effort: 'medium' });
  });

  it('routes light status advancement to haiku·low', () => {
    expect(selectModelEffort(card({ depth: 4 }), 'status-update')).toEqual({ model: 'haiku', effort: 'low' });
  });

  it('treats REVIEW/ARCHITECT phases as judgment regardless of the heuristic action', () => {
    // A status-update on a REVIEW card is a verification step → opus, not haiku.
    const review = selectModelEffort(card({ status: 'REVIEW' }), 'status-update');
    expect(review.model).toBe('opus');
    expect(review.effort).toBe('high');
  });

  it('bumps a shallow decompose (high leverage near the root) to xhigh', () => {
    expect(selectModelEffort(card({ depth: 1, isLeaf: false }), 'decompose')).toEqual({ model: 'opus', effort: 'xhigh' });
  });

  it('drops a deep, light task one tier and to low effort (mechanical)', () => {
    const deep = selectModelEffort(card({ depth: 7 }), 'refine');
    expect(deep.model).toBe('haiku');
    expect(deep.effort).toBe('low');
  });

  it('bumps effort for a content-heavy card on heavy actions', () => {
    const heavyBody = '# 0.5.1 X [PLAN]\n\n## Acceptance Criteria\n' + '- crit\n'.repeat(10);
    const r = selectModelEffort(card({ depth: 4, body: heavyBody }), 'execute');
    expect(r.effort).toBe('xhigh'); // base sonnet·high bumped one
  });

  it('respects a model ceiling (cost cap) and effort ceiling', () => {
    const capped = selectModelEffort(card({ depth: 1, isLeaf: false }), 'decompose', {
      modelCeiling: 'sonnet',
      effortCeiling: 'high',
    });
    expect(capped.model).toBe('sonnet');
    expect(capped.effort).toBe('high');
  });

  it('respects a model floor (force quality)', () => {
    const floored = selectModelEffort(card({ depth: 4 }), 'status-update', { modelFloor: 'sonnet' });
    expect(floored.model).toBe('sonnet');
  });
});
