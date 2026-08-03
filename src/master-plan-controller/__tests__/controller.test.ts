import { describe, expect, it } from 'vitest';
import { Controller } from '../controller.js';
import { CONFIG, makeEscalation, makeEscalationEvidence, makeEvidence, makeNode, makePacket, makeState, NOW, RESULT_PORTFOLIO_EFFORT } from './fixtures.js';

describe('Controller.evaluate', () => {
  it('gives credible G1 extinction-prevention work lexical priority over expansion', () => {
    const preservation = makePacket({
      id: 'preservation',
      portfolio: 'near-term-preservation',
      credibleExtinctionPrevention: true,
      expectedDirectiveDelta: { G1: 0.1, G2: 0, G3: 0 },
      priority: {
        impact: 0.1,
        urgency: 0.1,
        tractability: 0.1,
        informationValue: 0.1,
        reversibility: 0.1,
        cost: 0.9,
        downsideRisk: 0.9,
      },
    });
    const expansion = makePacket({
      id: 'expansion',
      portfolio: 'enabling-capabilities',
      supportedDirectives: ['G2'],
      expectedDirectiveDelta: { G1: 0, G2: 1, G3: 0 },
      priority: {
        impact: 1,
        urgency: 1,
        tractability: 1,
        informationValue: 1,
        reversibility: 1,
        cost: 0,
        downsideRisk: 0,
      },
    });
    const state = makeState({ packets: [expansion, preservation] });
    expect(new Controller(state, CONFIG).evaluate(state, NOW).ranked.map((item) => item.packet.id)).toEqual([
      'preservation',
      'expansion',
    ]);
  });

  it('returns only the existing active packet while work is in progress', () => {
    const active = makePacket({ id: 'active', lifecycle: 'active' });
    const other = makePacket({ id: 'other' });
    const state = makeState({ packets: [active, other], activePacketId: 'active' });
    expect(new Controller(state, CONFIG).evaluate(state, NOW).ranked.map((entry) => entry.packet.id)).toEqual(['active']);
  });

  it('rejects premature packets whose target node has an unsatisfied gate', () => {
    const node = makeNode({
      id: 'target',
      activationGates: [{ type: 'minimum-confidence', minimum: 0.9 }],
      confidence: 0.2,
    });
    const packet = makePacket({ nodeId: 'target' });
    const state = makeState({ nodes: [node], packets: [packet] });
    const frontier = new Controller(state, CONFIG).evaluate(state, NOW);
    expect(frontier.ranked).toHaveLength(0);
    expect(frontier.rejected[0].reasons.join(' ')).toMatch(/confidence/);
  });

  it('never activates generated packets targeting blocked, invalidated, or retired nodes', () => {
    for (const lifecycle of ['blocked', 'invalidated', 'retired'] as const) {
      for (let index = 0; index < 20; index += 1) {
        const node = makeNode({ id: `target-${lifecycle}-${index}`, lifecycle, activationGates: [] });
        const packet = makePacket({ id: `packet-${lifecycle}-${index}`, nodeId: node.id });
        const state = makeState({ nodes: [node], packets: [packet] });
        const frontier = new Controller(state, CONFIG).evaluate(state, NOW);
        expect(frontier.ranked, `${lifecycle} iteration ${index}`).toHaveLength(0);
        expect(frontier.rejected[0].reasons.join(' ')).toMatch(/blocked|invalidated|retired/);
      }
    }
  });

  it('boosts a neglected portfolio relative to an otherwise identical over-allocated one', () => {
    const epistemics = makePacket({ id: 'epistemics', portfolio: 'consciousness-epistemics' });
    const capabilities = makePacket({ id: 'capabilities', portfolio: 'enabling-capabilities' });
    const state = makeState({
      packets: [capabilities, epistemics],
      portfolioEffort: {
        'consciousness-epistemics': 0,
        'near-term-preservation': 0.3,
        'enabling-capabilities': 0.55,
        'institutional-continuity': 0.15,
      },
    });
    expect(new Controller(state, CONFIG).evaluate(state, NOW).ranked[0].packet.id).toBe('epistemics');
  });

  it('binds a servant-leader approval to the qualified escalation record and packet', () => {
    const packet = makePacket({ authorityClass: 'human-escalation', escalationId: 'escalation-1' });
    const escalation = makeEscalation({ packetId: packet.id });
    const approval = {
      id: 'approval-1', scope: packet.id, approvedBy: 'servant-leader', approverRole: 'human' as const,
      approvedAt: NOW, escalationId: 'wrong-escalation',
    };
    const wrong = makeState({
      packets: [packet], evidence: makeEscalationEvidence(), escalations: [escalation], approvals: [approval],
    });
    expect(new Controller(wrong, CONFIG).evaluate(wrong, NOW).ranked).toHaveLength(0);
    const bound = { ...wrong, approvals: [{ ...approval, escalationId: escalation.id }] };
    expect(new Controller(bound, CONFIG).evaluate(bound, NOW).ranked[0].packet.id).toBe(packet.id);
  });

  it('rejects an escalation assessment with an invalid timestamp', () => {
    const packet = makePacket({ authorityClass: 'human-escalation', escalationId: 'escalation-1' });
    const state = makeState({
      packets: [packet],
      approvals: [{
        id: 'approval-1', scope: packet.id, approvedBy: 'servant-leader', approverRole: 'human',
        approvedAt: NOW, escalationId: 'escalation-1',
      }],
      evidence: makeEscalationEvidence(),
      escalations: [makeEscalation({ packetId: packet.id, assessedAt: 'not-a-timestamp' })],
    });

    expect(new Controller(state, CONFIG).evaluate(state, NOW).ranked).toHaveLength(0);
  });

  it('rejects a servant-leader decision recorded before its escalation assessment', () => {
    const packet = makePacket({ authorityClass: 'human-escalation', escalationId: 'escalation-1' });
    const state = makeState({
      packets: [packet], evidence: makeEscalationEvidence(),
      escalations: [makeEscalation({ packetId: packet.id })],
      approvals: [{
        id: 'approval-early', scope: packet.id, approvedBy: 'servant-leader', approverRole: 'human',
        approvedAt: '2026-08-03T11:59:59.000Z', escalationId: 'escalation-1',
      }],
    });

    expect(new Controller(state, CONFIG).evaluate(state, NOW).ranked).toHaveLength(0);
  });

  it('does not count one failure record twice through its id and source aliases', () => {
    const packet = makePacket({ authorityClass: 'human-escalation', escalationId: 'escalation-1' });
    const evidence = makeEscalationEvidence()[0];
    const escalation = makeEscalation({
      packetId: packet.id,
      automatedAttempts: [
        { description: 'primary automation', outcome: 'failed', attemptedAt: '2026-08-03T10:00:00.000Z', evidenceReference: evidence.id },
        { description: 'fallback automation', outcome: 'failed', attemptedAt: '2026-08-03T11:00:00.000Z', evidenceReference: evidence.source },
      ],
    });
    const state = makeState({
      packets: [packet], evidence: [evidence], escalations: [escalation],
      approvals: [{
        id: 'approval-1', scope: packet.id, approvedBy: 'servant-leader', approverRole: 'human',
        approvedAt: NOW, escalationId: escalation.id,
      }],
    });

    expect(new Controller(state, CONFIG).evaluate(state, NOW).ranked).toHaveLength(0);
  });
});

describe('Controller.advance', () => {
  it('does not count a result with no evidence-bearing artifact as progress', () => {
    const packet = makePacket({ lifecycle: 'active' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'positive',
        artifactReferences: [],
        evidence: [],
        acceptanceCriteriaMet: true,
        verification: { status: 'passed', verifier: 'reviewer', reviewedAt: NOW },
        portfolioEffortAfter: {
          'consciousness-epistemics': 0.2, 'near-term-preservation': 0.25,
          'enabling-capabilities': 0.4, 'institutional-continuity': 0.15,
        },
      },
      NOW,
    );
    expect(advanced.state.packets[0].lifecycle).toBe('active');
    expect(advanced.event.type).toBe('result-rejected');
    expect(advanced.state.portfolioEffort).toEqual(state.portfolioEffort);
  });

  it('verifies bounded autonomous work after fresh independent review', () => {
    const packet = makePacket({ lifecycle: 'active' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const evidence = makeEvidence();
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'positive',
        artifactReferences: ['artifact://experiment-1'],
        evidence: [evidence],
        acceptanceCriteriaMet: true,
        verification: { status: 'passed', verifier: 'independent-reviewer', reviewedAt: NOW },
        portfolioEffortAfter: {
          'consciousness-epistemics': 0.2, 'near-term-preservation': 0.25,
          'enabling-capabilities': 0.4, 'institutional-continuity': 0.15,
        },
      },
      NOW,
    );
    expect(advanced.state.packets[0].lifecycle).toBe('verified');
    expect(advanced.state.activePacketId).toBeNull();
    expect(advanced.state.evidence).toContainEqual(evidence);
    expect(advanced.event.occurredAt).toBe(NOW);
  });

  it('accepts a verified null result as uncertainty-reducing progress', () => {
    const packet = makePacket({ lifecycle: 'active' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'null',
        artifactReferences: ['artifact://null-result'],
        evidence: [makeEvidence({ outcome: 'null', source: 'artifact://null-result' })],
        acceptanceCriteriaMet: true,
        verification: { status: 'passed', verifier: 'independent-reviewer', reviewedAt: NOW },
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
      NOW,
    );
    expect(advanced.state.packets[0].lifecycle).toBe('verified');
  });

  it('keeps high-impact results in verifying until a qualified approval exists', () => {
    const packet = makePacket({ lifecycle: 'active', authorityClass: 'human-escalation', escalationId: 'escalation-1' });
    const state = makeState({
      packets: [packet], activePacketId: packet.id,
      evidence: makeEscalationEvidence(),
      escalations: [makeEscalation({ packetId: packet.id })],
    });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'positive',
        artifactReferences: ['artifact://result'],
        evidence: [makeEvidence()],
        acceptanceCriteriaMet: true,
        verification: { status: 'passed', verifier: 'independent-reviewer', reviewedAt: NOW },
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
      NOW,
    );
    expect(advanced.state.packets[0].lifecycle).toBe('verifying');
    expect(advanced.event.type).toBe('approval-required');
  });

  it('requires a fresh reviewer distinct from the packet owner', () => {
    const packet = makePacket({ lifecycle: 'active', owner: 'same-person' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'positive',
        artifactReferences: ['artifact://result'],
        evidence: [makeEvidence()],
        acceptanceCriteriaMet: true,
        verification: { status: 'passed', verifier: 'same-person', reviewedAt: NOW },
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
      NOW,
    );
    expect(advanced.state.packets[0].lifecycle).toBe('verifying');
    expect(advanced.event.details).toMatchObject({ reason: 'independent-review-required' });
    expect(advanced.state.evidence).toEqual([]);
  });

  it('does not verify a result using an expired or future-dated review', () => {
    for (const reviewedAt of ['2026-08-03T09:00:00.000Z', '2026-08-03T13:00:00.000Z']) {
      const packet = makePacket({ lifecycle: 'active' });
      const state = makeState({ packets: [packet], activePacketId: packet.id });
      const advanced = new Controller(state, { ...CONFIG, verificationFreshnessMs: 60 * 60 * 1000 }).advance(
        packet,
        {
          outcome: 'positive',
          artifactReferences: ['artifact://result'],
          evidence: [makeEvidence()],
          acceptanceCriteriaMet: true,
          verification: { status: 'passed', verifier: 'independent-reviewer', reviewedAt },
          portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
        },
        NOW,
      );
      expect(advanced.state.packets[0].lifecycle, reviewedAt).toBe('verifying');
      expect(advanced.event.details.reason, reviewedAt).toMatch(/fresh-review-required/);
      expect(advanced.state.evidence, reviewedAt).toEqual([]);
    }
  });

  it('does not integrate evidence when verification itself fails', () => {
    const packet = makePacket({ lifecycle: 'active' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'positive',
        artifactReferences: ['artifact://unverified'],
        evidence: [makeEvidence()],
        acceptanceCriteriaMet: true,
        verification: { status: 'failed', verifier: 'independent-reviewer', reviewedAt: NOW },
        portfolioEffortAfter: {
          'consciousness-epistemics': 0.2, 'near-term-preservation': 0.25,
          'enabling-capabilities': 0.4, 'institutional-continuity': 0.15,
        },
      },
      NOW,
    );
    expect(advanced.state.evidence).toEqual([]);
    expect(advanced.state.packets[0].lifecycle).toBe('blocked');
    expect(advanced.event.type).toBe('verification-failed');
    expect(advanced.state.portfolioEffort).toEqual(state.portfolioEffort);
  });

  it('does not apply portfolio estimates from stale or self-reviewed results', () => {
    for (const verification of [
      { status: 'passed' as const, verifier: 'owner', reviewedAt: NOW },
      { status: 'passed' as const, verifier: 'reviewer', reviewedAt: '2026-08-03T09:00:00.000Z' },
    ]) {
      const packet = makePacket({ lifecycle: 'active', owner: 'owner' });
      const state = makeState({ packets: [packet], activePacketId: packet.id });
      const advanced = new Controller(state, CONFIG).advance(packet, {
        outcome: 'positive', artifactReferences: ['artifact://result'], evidence: [makeEvidence()],
        acceptanceCriteriaMet: true, verification, portfolioEffortAfter: {
          'consciousness-epistemics': 0.2, 'near-term-preservation': 0.25,
          'enabling-capabilities': 0.4, 'institutional-continuity': 0.15,
        },
      }, NOW);
      expect(advanced.state.portfolioEffort).toEqual(state.portfolioEffort);
    }
  });

  it('blocks an identical retry and records the caller-supplied timestamp', () => {
    const packet = makePacket({ lifecycle: 'active', attempt: 1, retrySignature: 'same-strategy' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'failed',
        artifactReferences: ['artifact://failure-log'],
        evidence: [makeEvidence({ outcome: 'negative', source: 'artifact://failure-log' })],
        acceptanceCriteriaMet: false,
        verification: { status: 'passed', verifier: 'reviewer', reviewedAt: NOW },
        retrySignature: 'same-strategy',
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
      NOW,
    );
    expect(advanced.state.packets[0].lifecycle).toBe('blocked');
    expect(advanced.event.occurredAt).toBe(NOW);
  });

  it('blocks a renamed retry that does not change strategy or tractability', () => {
    const packet = makePacket({ lifecycle: 'active', retrySignature: 'strategy-v1' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'failed',
        artifactReferences: ['artifact://failure-log'],
        evidence: [makeEvidence({ outcome: 'negative' })],
        acceptanceCriteriaMet: false,
        verification: { status: 'passed', verifier: 'reviewer', reviewedAt: NOW },
        retrySignature: 'strategy-v2',
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
      NOW,
    );
    expect(advanced.state.packets[0].lifecycle).toBe('blocked');
    expect(advanced.event.details.reason).toBe('strategy-adjustment-required');
  });

  it('allows one bounded retry only when the changed strategy is explicit', () => {
    const packet = makePacket({ lifecycle: 'active', retrySignature: 'strategy-v1' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'failed',
        artifactReferences: ['artifact://failure-log'],
        evidence: [makeEvidence({ outcome: 'negative' })],
        acceptanceCriteriaMet: false,
        verification: { status: 'passed', verifier: 'reviewer', reviewedAt: NOW },
        retrySignature: 'strategy-v2',
        strategyAdjustment: 'Reduce scope and replace the failed measurement with a preregistered observable.',
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
      NOW,
    );
    expect(advanced.state.packets[0]).toMatchObject({ lifecycle: 'eligible', retrySignature: 'strategy-v2', attempt: 1 });
    expect(advanced.event.type).toBe('packet-retry-eligible');
  });

  it('integrates the caller-supplied portfolio estimate for positive, negative, or null work', () => {
    const packet = makePacket({ lifecycle: 'active' });
    const state = makeState({ packets: [packet], activePacketId: packet.id });
    const portfolioEffortAfter = {
      'consciousness-epistemics': 0.2,
      'near-term-preservation': 0.25,
      'enabling-capabilities': 0.4,
      'institutional-continuity': 0.15,
    } as const;
    const advanced = new Controller(state, CONFIG).advance(
      packet,
      {
        outcome: 'null',
        artifactReferences: ['artifact://null-result'],
        evidence: [makeEvidence({ outcome: 'null' })],
        acceptanceCriteriaMet: true,
        verification: { status: 'passed', verifier: 'reviewer', reviewedAt: NOW },
        portfolioEffortAfter,
      },
      NOW,
    );
    expect(advanced.state.portfolioEffort).toEqual(portfolioEffortAfter);
    expect(state.portfolioEffort).not.toEqual(portfolioEffortAfter);
  });
});
