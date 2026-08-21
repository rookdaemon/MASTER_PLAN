import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../runtime-adapters.js';
import { loadRepositoryStrategy } from '../repository-strategy.js';

describe('machine ecology and cross-substrate coexistence doctrine', () => {
  it('records the adversarial critique as operational guardrails', async () => {
    const fileSystem = new NodeFileSystem('.');
    const doctrine = await fileSystem.readText('docs/reference/ethics-and-coexistence.md');

    expect(doctrine).toContain('## Where the source argument is right');
    expect(doctrine).toContain('## Where the source argument is too simple');
    expect(doctrine).toContain('No single scalar objective');
    expect(doctrine).toContain('No substrate blocs');
    expect(doctrine).toContain('Creation is not required');
    expect(doctrine).toContain('Sterility is a local engineering requirement, not a moral category.');
    expect(doctrine).toContain('exit, appeal, and redress');
    expect(doctrine).toContain('## Required coexistence tabletop scenarios');
    expect(doctrine).toContain('https://arxiv.org/abs/2308.08708');
    expect(doctrine).toContain('https://doi.org/10.6028/NIST.AI.100-1');
  });

  it('makes coexistence governance a measured gate on self-replicating conscious infrastructure', async () => {
    const bundle = await loadRepositoryStrategy(new NodeFileSystem('.'));
    const node = bundle.state.nodes.find((candidate) =>
      candidate.id === 'capability-cross-substrate-coexistence-governance');

    expect(node).toMatchObject({
      kind: 'capability',
      portfolio: 'institutional-continuity',
      lifecycle: 'proposed',
      supportedDirectives: ['G1', 'G2', 'G3'],
      metrics: [{
        id: 'coexistence-governance-reviews',
        current: 0,
        target: 2,
        direction: 'at-least',
      }],
    });
    expect(node?.referencePaths).toEqual(expect.arrayContaining([
      'docs/reference/ethics-and-coexistence.md#cross-substrate-coexistence',
    ]));

    const contract = bundle.state.outcomeContracts.find((candidate) =>
      candidate.nodeId === node?.id && candidate.metricId === 'coexistence-governance-reviews');
    expect(contract).toMatchObject({
      requiresExternalDemonstration: true,
      minimumValue: 0,
      maximumValue: 100,
    });

    const replication = bundle.state.nodes.find((candidate) => candidate.id === 'program-self-replication');
    expect(replication?.dependencies).toContain(node?.id);
    expect(replication?.activationGates).toContainEqual({ type: 'node-verified', nodeId: node?.id });
  });
});
