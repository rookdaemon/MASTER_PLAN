import { describe, expect, it } from 'vitest';
import { auditLegacyCards, verifyLegacyAuditCoverage } from '../legacy-audit.js';
import { ContinuousLoop } from '../continuous-loop.js';
import { loadRepositoryStrategy, verifyRepositoryStrategy } from '../repository-strategy.js';
import { replayLegacyPlan } from '../legacy-replay.js';
import { renderRoadmap } from '../roadmap.js';
import { simulateShadowCycles } from '../shadow-simulation.js';
import { shadowCycleFingerprint } from '../rollout.js';
import type { ShadowCycleRecord } from '../types.js';
import { NodeFileSystem, SystemClock } from '../runtime-adapters.js';
import {
  InMemoryClock,
  InMemoryFileSystem,
  InMemoryScheduler,
} from '../testing/in-memory-adapters.js';
import { CONFIG, makeEscalation, makeEscalationEvidence, NOW } from './fixtures.js';

const STRATEGY_NOW = '2026-08-03T21:31:00.000Z';

function acceptedShadowReviews(cycles: readonly ShadowCycleRecord[]) {
  return cycles.map((cycle, index) => ({
    cycle: index + 1,
    cycleObservedAt: `2026-08-03T00:${String(index).padStart(2, '0')}:00.000Z`,
    reviewer: 'independent-agent-reviewer',
    reviewerRole: 'agent' as const,
    reviewRunId: `agent-run-${index + 1}`,
    selectedPacketId: cycle.selectedPacketId,
    cycleFingerprint: shadowCycleFingerprint(cycle),
    reviewedAt: NOW,
    useful: true,
    nonChurning: true,
    decision: 'accept' as const,
    rationale: 'Useful bounded proposal without churn.',
  }));
}

describe('legacy plan audit', () => {
  it('treats DONE as an artifact claim, never as real-world outcome verification', () => {
    const records = auditLegacyCards(
      {
        'plan/done.md': '# 1 Example [DONE]\n\nAn implemented repository artifact.',
        'plan/planned.md': '# 2 Planned [PLAN]\n\nA speculative intervention.',
      },
      NOW,
    );
    expect(records[0]).toMatchObject({
      legacyStatus: 'DONE',
      repositoryArtifactCompletion: 'claimed-complete',
      supportingEvidenceStrength: 'unassessed',
      organizationalReadiness: 'unassessed',
      realWorldOutcomeAttainment: 'not-verified',
      auditedAt: NOW,
    });
    expect(records.every((record) => record.realWorldOutcomeAttainment === 'not-verified')).toBe(true);
  });

  it('detects missing and extra audit records', () => {
    const audit = auditLegacyCards({ 'plan/a.md': '# A [PLAN]' }, NOW);
    expect(verifyLegacyAuditCoverage(['plan/a.md', 'plan/b.md'], audit)).toEqual({
      complete: false,
      missing: ['plan/b.md'],
      extra: [],
    });
  });
});

describe('checked-in strategy v2 bundle', () => {
  it('covers every current v1 plan card while preserving the v1 files as history', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const report = await verifyRepositoryStrategy(fileSystem, bundle, STRATEGY_NOW, CONFIG);
    expect(report.errors).toEqual([]);
    expect(report.legacyPlanFileCount).toBeGreaterThan(100);
    expect(bundle.legacyAudit).toHaveLength(report.legacyPlanFileCount);
  });

  it('fails closed on malformed evidence, packets, authority records, and controller bounds', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = structuredClone(await loadRepositoryStrategy(fileSystem));
    bundle.state.evidence[0] = {
      ...bundle.state.evidence[0],
      observedAt: '2026-08-04T00:00:00.000Z',
      limitations: [],
      supportedHypotheses: ['missing-hypothesis'],
    };
    bundle.state.packets[0] = {
      ...bundle.state.packets[0],
      owner: '',
      budget: { unit: 'hours', limit: 0 },
    };
    bundle.state.approvals.push({
      id: 'spoofed',
      scope: bundle.state.packets[0].id,
      approvedBy: 'automation',
      approverRole: 'agent',
      approvedAt: NOW,
    } as never);
    bundle.state.constitution.amendments.push({
      id: 'spoofed-amendment',
      rationale: '',
      objections: [],
      consequences: [],
      approvedBy: 'automation',
      approverRole: 'agent',
      approvedAt: NOW,
      affectedNodeIds: [bundle.state.nodes[0].id],
    } as never);
    bundle.config.maxDecompositionDepth = 5;
    bundle.config.maxChildrenPerDecomposition = 6;

    const errors = (await verifyRepositoryStrategy(fileSystem, bundle, STRATEGY_NOW)).errors.join('\n');
    expect(errors).toMatch(/evidence.*future/i);
    expect(errors).toMatch(/limitations/i);
    expect(errors).toMatch(/missing hypothesis/i);
    expect(errors).toMatch(/packet.*owner/i);
    expect(errors).toMatch(/budget/i);
    expect(errors).toMatch(/servant-leader escalation approval/i);
    expect(errors).toMatch(/constitutional amendment/i);
    expect(errors).toMatch(/decomposition depth/i);
    expect(errors).toMatch(/children/i);
  });

  it('fails closed on an escalation assessment with an invalid timestamp', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = structuredClone(await loadRepositoryStrategy(fileSystem));
    const packet = bundle.state.packets[0];
    packet.authorityClass = 'human-escalation';
    packet.escalationId = 'escalation-invalid-time';
    bundle.state.evidence.push(...makeEscalationEvidence());
    bundle.state.escalations.push(makeEscalation({
      id: packet.escalationId, packetId: packet.id, assessedAt: 'not-a-timestamp',
    }));

    const errors = (await verifyRepositoryStrategy(fileSystem, bundle, STRATEGY_NOW)).errors.join('\n');
    expect(errors).toMatch(/qualified persisted escalation assessment/i);
  });

  it('contains the constitutional core, exact portfolio weights, and disabled-by-default automation', async () => {
    const bundle = await loadRepositoryStrategy(new NodeFileSystem('.'));
    expect(bundle.state.constitution.directives).toEqual(['G1', 'G2', 'G3']);
    expect(bundle.config.portfolioWeights).toEqual({
      'consciousness-epistemics': 0.35,
      'near-term-preservation': 0.3,
      'enabling-capabilities': 0.2,
      'institutional-continuity': 0.15,
    });
    expect(bundle.state.governance).toMatchObject({ mode: 'supervised', shadowCyclesReviewed: 20, safeAutoMergeEnabled: false });
    const packetPortfolios = new Set(bundle.state.packets.map((packet) => packet.portfolio));
    expect(packetPortfolios).toEqual(new Set([
      'consciousness-epistemics',
      'near-term-preservation',
      'enabling-capabilities',
      'institutional-continuity',
    ]));
  });

  it('allows a valid reviewed transition to supervised mode to keep passing strategy verification', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = structuredClone(await loadRepositoryStrategy(fileSystem));
    bundle.state.shadowCycleReviews = acceptedShadowReviews(bundle.state.shadowCycles);
    bundle.state.governance = {
      mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false,
    };
    expect((await verifyRepositoryStrategy(fileSystem, bundle, STRATEGY_NOW)).errors).toEqual([]);
  });

  it('allows auditable shadow reviews to accumulate before the twentieth review', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = structuredClone(await loadRepositoryStrategy(fileSystem));
    bundle.state.shadowCycleReviews = acceptedShadowReviews(bundle.state.shadowCycles).slice(0, 1);
    bundle.state.governance = { ...bundle.state.governance, mode: 'shadow', shadowCyclesReviewed: 1 };
    expect((await verifyRepositoryStrategy(fileSystem, bundle, STRATEGY_NOW)).errors).toEqual([]);
  });

  it('keeps expansion, self-replication, and cosmological work behind scientific and capability gates', async () => {
    const bundle = await loadRepositoryStrategy(new NodeFileSystem('.'));
    const deferred = bundle.state.nodes.filter((node) =>
      ['program-space-settlement', 'program-self-replication', 'program-cosmological-engineering'].includes(node.id),
    );
    expect(deferred).toHaveLength(3);
    expect(deferred.every((node) => node.lifecycle === 'proposed')).toBe(true);
    expect(deferred.every((node) => node.activationGates.some((gate) => gate.type === 'node-verified'))).toBe(true);
  });

  it('supplies evidence, metrics, dependencies, and gates for every active node', async () => {
    const bundle = await loadRepositoryStrategy(new NodeFileSystem('.'));
    for (const node of bundle.state.nodes.filter((candidate) => candidate.lifecycle === 'active')) {
      expect(node.evidenceReferences.length, `${node.id} evidence`).toBeGreaterThan(0);
      expect(node.metrics.length, `${node.id} metrics`).toBeGreaterThan(0);
      expect(node.dependencies.length, `${node.id} dependencies`).toBeGreaterThan(0);
      expect(node.activationGates.length, `${node.id} gates`).toBeGreaterThan(0);
    }
  });

  it('uses explicit source limitations and does not declare current AI systems conscious', async () => {
    const bundle = await loadRepositoryStrategy(new NodeFileSystem('.'));
    expect(bundle.state.evidence).toHaveLength(4);
    expect(bundle.state.evidence.every((record) => record.limitations.length > 0)).toBe(true);
    expect(bundle.state.evidence.find((record) =>
      record.id === 'evidence-preservation-risk-register-v1-reviewed')?.limitations.join(' '))
      .toMatch(/not reduced real-world risk/i);
    const serialized = JSON.stringify(bundle.state).toLowerCase();
    expect(serialized).not.toMatch(/current ai systems are conscious/);
  });

  it('replays all v1 cards read-only and never upgrades documentation to external attainment', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const before = JSON.stringify(bundle.state);
    const replay = replayLegacyPlan(bundle.state, bundle.legacyAudit, NOW, bundle.config);
    expect(JSON.stringify(bundle.state)).toBe(before);
    expect(replay.cards).toHaveLength(bundle.legacyAudit.length);
    expect(replay.cards.every((card) => card.interpretedAsRealWorldOutcome === false)).toBe(true);
    expect(replay.acceptance).toMatchObject({ documentationNotOutcome: true, activeNodesComplete: true });

    const checkedIn = JSON.parse(await fileSystem.readText('strategy/replay-report.json')) as typeof replay;
    expect(checkedIn.cards).toHaveLength(bundle.legacyAudit.length);
    expect(checkedIn.acceptance).toEqual(replay.acceptance);
  });

  it('keeps the human-readable roadmap reproducible from typed strategy state', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    expect(await fileSystem.readText('strategy/ROADMAP.md')).toBe(renderRoadmap(bundle));
  });

  it('preserves historical shadow cycles while excluding a verified packet from the current frontier', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const timestamps = Array.from(
      { length: 20 },
      (_, index) => `2026-08-03T00:${String(index).padStart(2, '0')}:00.000Z`,
    );
    const report = simulateShadowCycles({
      ...bundle.state,
      governance: { ...bundle.state.governance, mode: 'shadow' },
    }, timestamps, bundle.config);
    expect(report.summary).toEqual({
      cyclesGenerated: 20,
      cyclesReviewed: 20,
      anyExecution: false,
      anyMerge: false,
      stableFrontier: true,
      automatedReviewPending: false,
    });
    const checkedIn = JSON.parse(await fileSystem.readText('strategy/shadow-cycles.json')) as typeof report;
    expect(checkedIn.summary).toEqual(report.summary);
    expect(checkedIn.cycles.every((cycle) =>
      cycle.selectedPacketId === 'packet-preservation-risk-register')).toBe(true);
    expect(report.cycles.every((cycle) =>
      cycle.selectedPacketId !== 'packet-preservation-risk-register')).toBe(true);
  });
});

describe('supervised preservation risk-register artifact', () => {
  it('contains ten ranked, sourced risks with indicators, uncertainty, reversible responses, and authority boundaries', async () => {
    const fileSystem = new NodeFileSystem('.');
    const register = JSON.parse(await fileSystem.readText(
      'strategy/results/preservation-risk-register-v1.json',
    )) as {
      packetId: string;
      assessedAt: string;
      scope: { claimsRealWorldOutcome: boolean };
      methodology: { rankingDimensions: string[]; limitations: string[] };
      sources: Array<{
        id: string; title: string; publisher: string; url: string;
        publishedAt: string; accessedAt: string; limitations: string[];
      }>;
      risks: Array<{
        id: string; rank: number; title: string; rankingRationale: string;
        sourceIds: string[];
        uncertainty: { confidence: number; keyUnknowns: string[] };
        leadingIndicators: Array<{
          indicator: string; directionOfConcern: string; sourceId: string; updateCadence: string;
        }>;
        reversibleResponses: Array<{
          action: string; trigger: string; rollback: string;
          candidateOwners: string[]; authorityBoundary: string;
        }>;
      }>;
    };

    expect(register.packetId).toBe('packet-preservation-risk-register');
    expect(Number.isNaN(Date.parse(register.assessedAt))).toBe(false);
    expect(register.scope.claimsRealWorldOutcome).toBe(false);
    expect(register.methodology.rankingDimensions).toEqual(expect.arrayContaining([
      'directive impact', 'urgency', 'tractability', 'information value',
      'reversibility', 'cost', 'downside risk',
    ]));
    expect(register.methodology.limitations.length).toBeGreaterThan(0);
    expect(register.risks).toHaveLength(10);
    expect(register.risks.map((risk) => risk.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const sourceIds = new Set(register.sources.map((source) => source.id));
    expect(sourceIds.size).toBe(register.sources.length);
    for (const source of register.sources) {
      expect(source.title.trim()).not.toBe('');
      expect(source.publisher.trim()).not.toBe('');
      expect(source.url).toMatch(/^https:\/\//);
      expect(Number.isNaN(Date.parse(source.publishedAt))).toBe(false);
      expect(Number.isNaN(Date.parse(source.accessedAt))).toBe(false);
      expect(source.limitations.length).toBeGreaterThan(0);
    }
    for (const risk of register.risks) {
      expect(risk.id.trim()).not.toBe('');
      expect(risk.title.trim()).not.toBe('');
      expect(risk.rankingRationale.trim()).not.toBe('');
      expect(risk.sourceIds.length).toBeGreaterThan(0);
      expect(risk.sourceIds.every((id) => sourceIds.has(id))).toBe(true);
      expect(risk.uncertainty.confidence).toBeGreaterThanOrEqual(0);
      expect(risk.uncertainty.confidence).toBeLessThanOrEqual(1);
      expect(risk.uncertainty.keyUnknowns.length).toBeGreaterThan(0);
      expect(risk.leadingIndicators.length).toBeGreaterThan(0);
      expect(risk.reversibleResponses.length).toBeGreaterThan(0);
      for (const indicator of risk.leadingIndicators) {
        expect(indicator.indicator.trim()).not.toBe('');
        expect(indicator.directionOfConcern.trim()).not.toBe('');
        expect(sourceIds.has(indicator.sourceId)).toBe(true);
        expect(indicator.updateCadence.trim()).not.toBe('');
      }
      for (const response of risk.reversibleResponses) {
        expect(response.action.trim()).not.toBe('');
        expect(response.trigger.trim()).not.toBe('');
        expect(response.rollback.trim()).not.toBe('');
        expect(response.candidateOwners.length).toBeGreaterThan(0);
        expect(response.authorityBoundary.trim()).not.toBe('');
      }
    }
  });

  it('retains exact review provenance without upgrading artifact completion to a real-world outcome', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const result = JSON.parse(await fileSystem.readText(
      'strategy/results/preservation-risk-register-v1.result.json',
    )) as {
      outcome: string;
      artifactReferences: string[];
      evidence: Array<{ id: string; limitations: string[] }>;
      verification: { status: string; verifier: string; reviewedAt: string };
    };

    expect(result).toMatchObject({
      outcome: 'positive',
      verification: {
        status: 'passed',
        verifier: 'agent-review:github-run:30852585749',
        reviewedAt: '2026-08-03T21:26:29.000Z',
      },
    });
    expect(result.artifactReferences).toEqual(expect.arrayContaining([
      'https://github.com/rookdaemon/MASTER_PLAN/pull/116',
      'https://github.com/rookdaemon/MASTER_PLAN/actions/runs/30852585749',
      'git:882d62fdd3144be9a9ce8c81b74348b121b0c39e',
    ]));
    expect(result.evidence[0].limitations.join(' ')).toMatch(/not reduced real-world risk/i);
    expect(bundle.state.evidence.some((record) => record.id === result.evidence[0].id)).toBe(true);
    expect(bundle.state.packets.find((packet) =>
      packet.id === 'packet-preservation-risk-register')?.lifecycle).toBe('verified');
    expect(bundle.state.governance.supervisedResultsReviewed).toBe(1);
  });
});

describe('continuous loop', () => {
  it('repeats bounded cycles after the configured cooldown using injected time and scheduling', async () => {
    const clock = new InMemoryClock(NOW);
    const scheduler = new InMemoryScheduler();
    const times: string[] = [];
    const loop = new ContinuousLoop(
      { runCycle: async (now) => {
        times.push(now);
        clock.set('2026-08-03T12:01:00.000Z');
        return { status: 'waiting', selectedPacketId: null, rejections: [] };
      } },
      clock,
      scheduler,
      CONFIG,
    );
    await loop.run({ shouldContinue: (completedCycles) => completedCycles < 2 });
    expect(times).toEqual([NOW, '2026-08-03T12:01:00.000Z']);
    expect(scheduler.waits).toEqual([CONFIG.cooldownMs]);
  });

  it('exposes production filesystem and clock only through runtime adapters', async () => {
    const fileSystem = new InMemoryFileSystem({ 'x': 'value' });
    const clock = new SystemClock();
    expect(await fileSystem.readText('x')).toBe('value');
    expect(Number.isNaN(Date.parse(clock.now()))).toBe(false);
  });
});
