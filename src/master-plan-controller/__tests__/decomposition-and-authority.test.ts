import { describe, expect, it } from 'vitest';
import { decomposeIntervention } from '../decomposition.js';
import { classifyAuthority } from '../authority.js';
import { CONFIG, NOW } from './fixtures.js';

describe('bounded recursive decomposition', () => {
  it('converges on executable packets with one owner and explicit verification', () => {
    const result = decomposeIntervention(
      { id: 'root', title: 'Broad intervention', depth: 0, executable: false },
      (candidate) => [
        {
          id: `${candidate.id}-bounded`,
          title: 'Bounded intervention',
          depth: candidate.depth + 1,
          executable: true,
          owner: 'owner',
          resourceBound: '8 person-hours',
          primaryDeliverable: 'artifact://bounded',
          acceptanceCriteria: ['result recorded'],
          verificationMethod: 'independent replay',
        },
      ],
      CONFIG,
      NOW,
    );
    expect(result.status).toBe('converged');
    expect(result.leaves).toHaveLength(1);
  });

  it('rejects more than five children at any decomposition', () => {
    expect(() =>
      decomposeIntervention(
        { id: 'root', title: 'Too broad', depth: 0, executable: false },
        (candidate) => Array.from({ length: 6 }, (_, index) => ({
          id: `${candidate.id}-${index}`,
          title: `Child ${index}`,
          depth: candidate.depth + 1,
          executable: true,
        })),
        CONFIG,
        NOW,
      ),
    ).toThrow(/five|5/);
  });

  it('terminates every generated non-converging decomposition after four new levels', () => {
    for (let fanout = 1; fanout <= 5; fanout += 1) {
      let calls = 0;
      const result = decomposeIntervention(
        { id: `root-${fanout}`, title: 'Never executable', depth: 0, executable: false },
        (candidate) => {
          calls += 1;
          return Array.from({ length: fanout }, (_, index) => ({
            id: `${candidate.id}-${index}`,
            title: 'Still broad',
            depth: candidate.depth + 1,
            executable: false,
          }));
        },
        CONFIG,
        NOW,
      );
      expect(result.status).toBe('depth-limit');
      expect(result.maxDepth).toBe(4);
      expect(calls).toBeLessThanOrEqual(1 + 5 + 25 + 125);
    }
  });
});
describe('authority classification', () => {
  it('allows only public analysis, local tests/simulations, and branch preparation autonomously', () => {
    expect(classifyAuthority({ action: 'local-test', domains: ['code'] }).authorityClass).toBe('autonomous');
    expect(classifyAuthority({ action: 'prepare-branch', domains: ['code'] }).authorityClass).toBe('autonomous');
  });

  it('routes protected repository domains through agent review', () => {
    for (const domain of ['plan', 'doctrine', 'governance', 'workflow', 'dependency', 'deployment', 'network', 'security', 'constitutional'] as const) {
      expect(classifyAuthority({ action: 'change', domains: [domain] }).authorityClass, domain).toBe('agent-reviewed');
    }
  });

  it('keeps consequential actions agent-reviewed unless a concrete issue proves human escalation necessary', () => {
    for (const action of ['spending', 'publication', 'outreach', 'hardware-operation', 'deployment', 'self-replication', 'potentially-conscious-system'] as const) {
      expect(classifyAuthority({ action, domains: ['code'] }).authorityClass, action).toBe('agent-reviewed');
    }
    expect(classifyAuthority({ action: 'human-subjects', domains: ['code'] }).authorityClass).toBe('human-escalation');
  });
});
