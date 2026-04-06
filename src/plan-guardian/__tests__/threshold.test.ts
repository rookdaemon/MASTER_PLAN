import { describe, it, expect } from 'vitest';
import { evaluate7BThreshold } from '../threshold.js';
import { parsePlanFile } from '../plan-file.js';

function makePlan(overrides: { children?: boolean; body?: string; status?: string; blockedBy?: boolean } = {}) {
  const fm = [
    'parent: plan/0.0-alpha.md',
    'root: plan/root.md',
  ];
  if (overrides.children) fm.push('children:\n  - plan/0.0.1-child.md');
  if (overrides.blockedBy) fm.push('blocked-by:\n  - plan/0.0.2-dep.md');

  const status = overrides.status ?? 'PLAN';
  const body = overrides.body ?? `## Description

A simple, focused task.

## Acceptance Criteria
- Output file exists
- Tests pass
- No errors logged
`;

  const content = `---\n${fm.join('\n')}\n---\n# 0.0.1 Test Task [${status}]\n${body}`;
  return parsePlanFile('plan/0.0.1-test.md', content);
}

describe('evaluate7BThreshold', () => {
  it('passes for a simple leaf with clear acceptance criteria', () => {
    const plan = makePlan();
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it('fails for non-leaf (has children)', () => {
    const plan = makePlan({ children: true });
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons).toContain('Not a leaf node (has children)');
  });

  it('fails when acceptance criteria are missing', () => {
    const plan = makePlan({ body: '## Description\n\nJust a description.\n' });
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons.some(r => r.includes('No acceptance criteria'))).toBe(true);
  });

  it('fails when too many acceptance criteria (>5)', () => {
    const body = `## Description\n\nTask.\n\n## Acceptance Criteria\n- a\n- b\n- c\n- d\n- e\n- f\n`;
    const plan = makePlan({ body });
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons.some(r => r.includes('Too many acceptance criteria'))).toBe(true);
  });

  it('fails when body contains a Decision section', () => {
    const body = `## Description\n\nTask.\n\n## Acceptance Criteria\n- a\n- b\n\n## Decision\n\nOption A vs B.\n`;
    const plan = makePlan({ body });
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons.some(r => r.includes('Decision section'))).toBe(true);
  });

  it('fails when body is too long (>5000 chars)', () => {
    const body = `## Description\n\n${'x'.repeat(5001)}\n\n## Acceptance Criteria\n- a\n`;
    const plan = makePlan({ body });
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons.some(r => r.includes('too long'))).toBe(true);
  });

  it('fails when there are unresolved blocked-by', () => {
    const plan = makePlan({ blockedBy: true });
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons.some(r => r.includes('blocked-by'))).toBe(true);
  });

  it('fails with empty acceptance criteria section', () => {
    const body = `## Description\n\nTask.\n\n## Acceptance Criteria\n\n## Other\n`;
    const plan = makePlan({ body });
    const verdict = evaluate7BThreshold(plan);
    expect(verdict.passes).toBe(false);
    expect(verdict.reasons.some(r => r.includes('empty'))).toBe(true);
  });
});
