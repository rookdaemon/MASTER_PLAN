import { describe, expect, it } from 'vitest';
import { parsePlanNodes, validateDependencyGraph } from '../graph.js';
import { makeNode, NOW } from './fixtures.js';

describe('strategy graph parsing and validation', () => {
  it('parses a PlanNode with a caller-supplied review timestamp', () => {
    const node = makeNode();
    expect(parsePlanNodes([node])).toEqual([node]);
    expect(parsePlanNodes([node])[0].reviewedAt).toBe(NOW);
  });

  it('rejects missing public-contract fields instead of inventing defaults', () => {
    const { reviewedAt: _omitted, ...withoutReviewTimestamp } = makeNode();
    expect(() => parsePlanNodes([withoutReviewTimestamp])).toThrow(/reviewedAt/);
  });

  it('rejects values that could bypass constitutional or external-demonstration semantics', () => {
    expect(() => parsePlanNodes([{ ...makeNode(), constitutionalImpact: 'cosmetic' }])).toThrow(/constitutionalImpact/);
    expect(() => parsePlanNodes([{ ...makeNode(), externallyDemonstrated: 'false' }])).toThrow(/externallyDemonstrated/);
  });

  it('rejects duplicate identities and missing dependencies', () => {
    const duplicate = makeNode({ id: 'duplicate' });
    const result = validateDependencyGraph([
      duplicate,
      { ...duplicate },
      makeNode({ id: 'dependent', dependencies: ['missing'] }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['duplicate-node', 'missing-dependency']),
    );
  });

  it('rejects dependency cycles', () => {
    const result = validateDependencyGraph([
      makeNode({ id: 'a', dependencies: ['c'] }),
      makeNode({ id: 'b', dependencies: ['a'] }),
      makeNode({ id: 'c', dependencies: ['b'] }),
    ]);
    expect(result.errors.some((error) => error.code === 'dependency-cycle')).toBe(true);
  });

  it('rejects every generated directed cycle', () => {
    for (let size = 2; size <= 40; size += 1) {
      const nodes = Array.from({ length: size }, (_, index) =>
        makeNode({
          id: `node-${index}`,
          dependencies: [`node-${(index + 1) % size}`],
        }),
      );
      expect(validateDependencyGraph(nodes).valid, `cycle size ${size}`).toBe(false);
    }
  });
});
