import { describe, expect, it } from 'vitest';
import { diagnoseStrategy } from '../diagnosis.js';
import { Controller } from '../controller.js';
import { CONFIG, makeNode, makeState, NOW } from './fixtures.js';

describe('whole-graph diagnosis', () => {
  it('traverses every node and reports bottlenecks, uncertainty, failure modes, and neglected portfolios', () => {
    const prerequisite = makeNode({ id: 'prerequisite', lifecycle: 'active' });
    const bottleneck = makeNode({
      id: 'bottleneck',
      dependencies: ['prerequisite'],
      activationGates: [{ type: 'dependencies-verified' }],
    });
    const downstream = makeNode({ id: 'downstream', dependencies: ['bottleneck'] });
    const uncertain = makeNode({ id: 'uncertain', kind: 'hypothesis', confidence: 0.5 });
    const invalidated = makeNode({ id: 'invalidated', lifecycle: 'invalidated' });
    const state = makeState({
      nodes: [prerequisite, bottleneck, downstream, uncertain, invalidated],
      portfolioEffort: {
        'consciousness-epistemics': 0,
        'near-term-preservation': 0.5,
        'enabling-capabilities': 0.5,
        'institutional-continuity': 0,
      },
    });
    const diagnosis = diagnoseStrategy(state, NOW, CONFIG);
    expect(diagnosis.evaluatedNodeCount).toBe(state.nodes.length);
    expect(diagnosis.bottlenecks[0]).toMatchObject({ nodeId: 'bottleneck' });
    expect(diagnosis.highValueUncertainties[0]).toMatchObject({ nodeId: 'uncertain' });
    expect(diagnosis.failureModes).toContainEqual({ nodeId: 'invalidated', lifecycle: 'invalidated' });
    expect(diagnosis.neglectedPortfolios[0].portfolio).toBe('consciousness-epistemics');
  });

  it('attaches the whole-graph diagnosis to Controller.evaluate without mutation', () => {
    const state = makeState();
    const before = structuredClone(state);
    const frontier = new Controller(state, CONFIG).evaluate(state, NOW);
    expect(frontier.diagnosis.evaluatedNodeCount).toBe(state.nodes.length);
    expect(state).toEqual(before);
  });
});
