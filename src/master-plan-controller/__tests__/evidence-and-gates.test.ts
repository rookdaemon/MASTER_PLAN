import { describe, expect, it } from 'vitest';
import { integrateEvidence, isEvidenceStale } from '../evidence.js';
import { evaluateActivationGates } from '../gates.js';
import { CONFIG, makeEvidence, makeNode, makeState, NOW } from './fixtures.js';

describe('evidence updates', () => {
  it('updates supported and falsified hypotheses without mutating input state', () => {
    const supported = makeNode({ id: 'supported', kind: 'hypothesis', confidence: 0.4 });
    const falsified = makeNode({ id: 'falsified', kind: 'hypothesis', confidence: 0.8 });
    const state = makeState({ nodes: [supported, falsified] });
    const evidence = makeEvidence({
      supportedHypotheses: ['supported'],
      falsifiedHypotheses: ['falsified'],
    });

    const next = integrateEvidence(state, evidence, NOW, CONFIG);

    expect(next).not.toBe(state);
    expect(state.evidence).toHaveLength(0);
    expect(next.nodes.find((node) => node.id === 'supported')!.confidence).toBeGreaterThan(0.4);
    expect(next.nodes.find((node) => node.id === 'falsified')!.confidence).toBeLessThan(0.8);
    expect(next.evidence).toEqual([evidence]);
  });

  it('records a superseding assessment instead of silently reopening a verified node', () => {
    const verified = makeNode({ id: 'h1', kind: 'hypothesis', lifecycle: 'verified' });
    const state = makeState({ nodes: [verified] });
    const next = integrateEvidence(
      state,
      makeEvidence({ supportedHypotheses: [], falsifiedHypotheses: ['h1'] }),
      NOW,
      CONFIG,
    );

    expect(next.nodes[0].lifecycle).toBe('verified');
    expect(next.assessments).toEqual([
      expect.objectContaining({ nodeId: 'h1', status: 'proposed', createdAt: NOW }),
    ]);
  });

  it('accepts null evidence as information without forcing confidence movement', () => {
    const hypothesis = makeNode({ id: 'h1', kind: 'hypothesis', confidence: 0.5 });
    const state = makeState({ nodes: [hypothesis] });
    const evidence = makeEvidence({ outcome: 'null' });
    const next = integrateEvidence(state, evidence, NOW, CONFIG);
    expect(next.nodes[0].confidence).toBe(0.5);
    expect(next.evidence[0].outcome).toBe('null');
  });

  it('requires the caller to supply the time used for stale-evidence decisions', () => {
    const observedAt = '2026-01-01T00:00:00.000Z';
    const evidence = makeEvidence({ observedAt });
    expect(isEvidenceStale(evidence, '2026-01-31T00:00:00.000Z', 31 * 86_400_000)).toBe(false);
    expect(isEvidenceStale(evidence, '2026-02-02T00:00:00.000Z', 31 * 86_400_000)).toBe(true);
  });

  it('rejects invalid, future, or unattributed evidence timestamps', () => {
    const state = makeState();
    expect(() => integrateEvidence(state, makeEvidence({ observedAt: 'invalid' }), NOW, CONFIG)).toThrow(/observedAt/);
    expect(() => integrateEvidence(state, makeEvidence({ observedAt: '2026-08-04T00:00:00.000Z' }), NOW, CONFIG)).toThrow(/future/);
    expect(() => integrateEvidence(state, makeEvidence({ verifier: '' }), NOW, CONFIG)).toThrow(/verifier/);
  });

  it('rejects evidence links to missing nodes or non-hypothesis nodes', () => {
    const capability = makeNode({ id: 'capability', kind: 'capability' });
    const state = makeState({ nodes: [capability] });
    expect(() => integrateEvidence(
      state,
      makeEvidence({ supportedHypotheses: ['missing'] }),
      NOW,
      CONFIG,
    )).toThrow(/missing hypothesis/);
    expect(() => integrateEvidence(
      state,
      makeEvidence({ falsifiedHypotheses: ['capability'] }),
      NOW,
      CONFIG,
    )).toThrow(/not a hypothesis/);
  });
});

describe('activation gates', () => {
  it('keeps nodes inactive while dependencies are not verified', () => {
    const dependency = makeNode({ id: 'dependency', lifecycle: 'active' });
    const candidate = makeNode({
      id: 'candidate',
      dependencies: ['dependency'],
      activationGates: [{ type: 'dependencies-verified' }],
    });
    const assessment = evaluateActivationGates(candidate, makeState({ nodes: [dependency, candidate] }), NOW, CONFIG);
    expect(assessment.satisfied).toBe(false);
    expect(assessment.failures[0]).toMatch(/dependency/);
  });

  it('evaluates confidence, evidence freshness, metric, and approval gates', () => {
    const evidence = makeEvidence({ id: 'fresh' });
    const node = makeNode({
      id: 'gated',
      confidence: 0.8,
      evidenceReferences: ['fresh'],
      metrics: [{ id: 'm', description: 'replications', current: 2, target: 2, direction: 'at-least' }],
      activationGates: [
        { type: 'minimum-confidence', minimum: 0.75 },
        { type: 'fresh-evidence', minimumStrength: 0.7, maxAgeMs: 86_400_000 },
        { type: 'metric-target', metricId: 'm' },
        { type: 'human-approval', approvalId: 'approval-1' },
      ],
    });
    const state = makeState({
      nodes: [node],
      evidence: [evidence],
      approvals: [{ id: 'approval-1', scope: 'gated', approvedBy: 'human', approverRole: 'human', approvedAt: NOW }],
    });
    expect(evaluateActivationGates(node, state, NOW, CONFIG).satisfied).toBe(true);
  });

  it('cannot bypass a constitutional amendment requirement with ordinary gates', () => {
    const node = makeNode({
      id: 'unsafe-change',
      constitutionalImpact: 'amendment',
      lifecycle: 'eligible',
      activationGates: [],
    });
    const assessment = evaluateActivationGates(node, makeState({ nodes: [node] }), NOW, CONFIG);
    expect(assessment.satisfied).toBe(false);
    expect(assessment.failures.join(' ')).toMatch(/constitutional amendment/i);
  });

  it('requires a complete explicitly human-approved constitutional amendment', () => {
    const node = makeNode({ id: 'amended', constitutionalImpact: 'amendment', activationGates: [] });
    const base = makeState({ nodes: [node] });
    const incomplete = {
      ...base,
      constitution: {
        ...base.constitution,
        amendments: [{
          id: 'amendment-1',
          rationale: 'Change the interpretation.',
          objections: ['This may weaken the invariant.'],
          consequences: ['Additional review is required.'],
          approvedBy: 'automation',
          approverRole: 'agent' as never,
          approvedAt: NOW,
          affectedNodeIds: [node.id],
        }],
      },
    };
    expect(evaluateActivationGates(node, incomplete, NOW, CONFIG).satisfied).toBe(false);
  });

  it('does not accept an approval record without explicit human authority', () => {
    const node = makeNode({
      id: 'human-gated',
      activationGates: [{ type: 'human-approval', approvalId: 'approval-1' }],
    });
    const state = makeState({
      nodes: [node],
      approvals: [{
        id: 'approval-1',
        scope: node.id,
        approvedBy: 'automation',
        approverRole: 'agent',
        approvedAt: NOW,
      } as never],
    });
    expect(evaluateActivationGates(node, state, NOW, CONFIG).satisfied).toBe(false);
  });
});
