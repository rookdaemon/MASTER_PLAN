import { describe, expect, it } from 'vitest';
import {
  DiagnosticPacketGenerator,
  type DiagnosticPacketTemplate,
  type DiagnosticTrigger,
} from '../packet-generation.js';
import { makeEvidence, makePacket, makeState, NOW } from './fixtures.js';
import type { GraphDiagnosis, WorkPacket } from '../types.js';

function template(id: string, trigger: DiagnosticTrigger): DiagnosticPacketTemplate {
  const packet = makePacket({
    id,
    ...('nodeId' in trigger ? { nodeId: trigger.nodeId } : { portfolio: trigger.portfolio }),
  });
  const { lifecycle: _lifecycle, attempt: _attempt, reviewedAt: _reviewedAt, ...definition } = packet;
  return { ...definition, trigger };
}

function recurringTemplate(id: string, trigger: DiagnosticTrigger): DiagnosticPacketTemplate {
  return {
    ...template(id, trigger),
    retrySignature: id,
    deliverables: [`artifact://${id}`],
    recurrence: { kind: 'versioned', minimumIntervalMs: 86_400_000, requiresNewEvidence: true },
  };
}

const DIAGNOSIS: GraphDiagnosis = {
  evaluatedNodeCount: 4,
  bottlenecks: [{ nodeId: 'capability-1', gateFailures: ['dependency'], downstreamDependents: 2 }],
  highValueUncertainties: [{ nodeId: 'capability-1', uncertainty: 0.7, directiveReach: 2 }],
  neglectedPortfolios: [{ portfolio: 'consciousness-epistemics', allocationGap: 0.1 }],
  failureModes: [{ nodeId: 'capability-1', lifecycle: 'blocked' }],
};

describe('DiagnosticPacketGenerator', () => {
  it('matches templates across every diagnosis channel and binds lifecycle fields to the supplied timestamp', async () => {
    const templates = [
      template('uncertainty', { kind: 'high-value-uncertainty', nodeId: 'capability-1' }),
      template('bottleneck', { kind: 'bottleneck', nodeId: 'capability-1' }),
      template('portfolio', { kind: 'neglected-portfolio', portfolio: 'consciousness-epistemics' }),
      template('failure', { kind: 'failure-mode', nodeId: 'capability-1' }),
    ];

    const generated = await new DiagnosticPacketGenerator(templates, 4)
      .generate(makeState({ packets: [] }), DIAGNOSIS, NOW);

    expect(generated.map((packet) => packet.id)).toEqual(['bottleneck', 'failure', 'portfolio', 'uncertainty']);
    expect(generated.every((packet) =>
      packet.lifecycle === 'eligible' && packet.attempt === 0 && packet.reviewedAt === NOW)).toBe(true);
  });

  it('does not regenerate an existing identity or emit an unmatched template', async () => {
    const existing = makePacket({ id: 'uncertainty', lifecycle: 'verified' });
    const generator = new DiagnosticPacketGenerator([
      template('uncertainty', { kind: 'high-value-uncertainty', nodeId: 'capability-1' }),
      template('unmatched', { kind: 'bottleneck', nodeId: 'other' }),
    ]);

    expect(await generator.generate(makeState({ packets: [existing] }), DIAGNOSIS, NOW)).toEqual([]);
  });

  it('advances a versioned template after terminal work without duplicating active work', async () => {
    const definition = recurringTemplate(
      'candidate-v1',
      { kind: 'high-value-uncertainty', nodeId: 'capability-1' },
    );
    definition.retrySignature = 'candidate-v1';
    definition.deliverables = ['artifact://candidate-v1'];
    const previous = makePacket({
      id: 'candidate-v1',
      nodeId: 'capability-1',
      retrySignature: 'candidate-v1',
      deliverables: ['artifact://candidate-v1'],
      lifecycle: 'verified',
      reviewedAt: '2026-08-01T12:00:00.000Z',
    });
    const generator = new DiagnosticPacketGenerator([definition]);

    const state = makeState({
      packets: [previous],
      evidence: [makeEvidence({ observedAt: '2026-08-02T12:00:00.000Z' })],
    });
    const [next] = await generator.generate(state, DIAGNOSIS, NOW);

    expect(next).toMatchObject({
      id: 'candidate-v2',
      retrySignature: 'candidate-v2',
      deliverables: ['artifact://candidate-v2'],
      lifecycle: 'eligible',
      attempt: 0,
      reviewedAt: NOW,
    });
    expect(await generator.generate(makeState({
      packets: [previous, { ...next, lifecycle: 'active' }],
    }), DIAGNOSIS, NOW)).toEqual([]);
  });

  it('requires both the configured interval and newer evidence before recurring', async () => {
    const definition = recurringTemplate(
      'candidate-v1',
      { kind: 'high-value-uncertainty', nodeId: 'capability-1' },
    );
    const previous = makePacket({
      id: 'candidate-v1',
      nodeId: 'capability-1',
      lifecycle: 'verified',
      reviewedAt: '2026-08-02T12:00:00.000Z',
    });
    const generator = new DiagnosticPacketGenerator([definition]);

    expect(await generator.generate(makeState({
      packets: [previous],
      evidence: [makeEvidence({ observedAt: '2026-08-02T11:59:59.000Z' })],
    }), DIAGNOSIS, NOW)).toEqual([]);
    expect(await generator.generate(makeState({
      packets: [previous],
      evidence: [makeEvidence({ observedAt: '2026-08-02T18:00:00.000Z' })],
    }), DIAGNOSIS, '2026-08-03T11:59:59.999Z')).toEqual([]);
  });

  it('does not convert a blocked packet into an identical automated retry', async () => {
    const definition = recurringTemplate(
      'candidate-v1',
      { kind: 'high-value-uncertainty', nodeId: 'capability-1' },
    );
    const blocked = makePacket({
      id: 'candidate-v1',
      nodeId: 'capability-1',
      lifecycle: 'blocked',
    });

    expect(await new DiagnosticPacketGenerator([definition])
      .generate(makeState({ packets: [blocked] }), DIAGNOSIS, NOW)).toEqual([]);
  });

  it('is deterministic across template input order and caps the configured frontier', async () => {
    const definitions = ['z', 'a', 'm'].map((id) =>
      template(id, { kind: 'high-value-uncertainty', nodeId: 'capability-1' }));
    const state = makeState({ packets: [] });

    const forward = await new DiagnosticPacketGenerator(definitions, 2).generate(state, DIAGNOSIS, NOW);
    const reverse = await new DiagnosticPacketGenerator([...definitions].reverse(), 2).generate(state, DIAGNOSIS, NOW);

    expect(forward).toEqual(reverse);
    expect(forward.map((packet) => packet.id)).toEqual(['a', 'm']);
  });

  it('returns defensive copies so execution cannot mutate templates', async () => {
    const definition = template('candidate', { kind: 'bottleneck', nodeId: 'capability-1' });
    const generator = new DiagnosticPacketGenerator([definition]);
    const first = await generator.generate(makeState({ packets: [] }), DIAGNOSIS, NOW);
    first[0].scope.included.push('mutation');

    const second = await generator.generate(makeState({ packets: [] }), DIAGNOSIS, NOW);
    expect(second[0].scope.included).not.toContain('mutation');
  });

  it('rejects ambiguous configuration before a cycle can run', () => {
    const duplicate = template('duplicate', { kind: 'bottleneck', nodeId: 'capability-1' });
    expect(() => new DiagnosticPacketGenerator([duplicate, duplicate])).toThrow(/unique/i);
    expect(() => new DiagnosticPacketGenerator([], 0)).toThrow(/maximum/i);
  });

  it('rejects unknown runtime trigger kinds instead of silently disabling automation', () => {
    const malformed = {
      ...template('malformed', { kind: 'bottleneck', nodeId: 'capability-1' }),
      trigger: { kind: 'unknown', nodeId: 'capability-1' },
    } as unknown as DiagnosticPacketTemplate;
    expect(() => new DiagnosticPacketGenerator([malformed])).toThrow(/trigger kind/i);
    const malformedPortfolio = {
      ...template('malformed-portfolio', { kind: 'neglected-portfolio', portfolio: 'consciousness-epistemics' }),
      portfolio: 'not-a-portfolio',
      trigger: { kind: 'neglected-portfolio', portfolio: 'not-a-portfolio' },
    } as unknown as DiagnosticPacketTemplate;
    expect(() => new DiagnosticPacketGenerator([malformedPortfolio])).toThrow(/trigger portfolio/i);
  });

  it('rejects versioned templates that would reuse retry or deliverable identities', () => {
    const invalidRetry = recurringTemplate(
      'candidate-v1',
      { kind: 'bottleneck', nodeId: 'capability-1' },
    );
    invalidRetry.retrySignature = 'candidate-static';
    expect(() => new DiagnosticPacketGenerator([invalidRetry])).toThrow(/retry signature.*v1/i);

    const invalidDeliverable = recurringTemplate(
      'candidate-v1',
      { kind: 'bottleneck', nodeId: 'capability-1' },
    );
    invalidDeliverable.deliverables = ['artifact://candidate-static'];
    expect(() => new DiagnosticPacketGenerator([invalidDeliverable])).toThrow(/deliverable.*v1/i);
  });

  it('satisfies the packet-generator port contract without depending on environment time', async () => {
    const generator = new DiagnosticPacketGenerator([
      template('candidate', { kind: 'bottleneck', nodeId: 'capability-1' }),
    ]);
    const generated: WorkPacket[] = await generator.generate(makeState({ packets: [] }), DIAGNOSIS, NOW);
    expect(generated[0].reviewedAt).toBe(NOW);
  });
});
