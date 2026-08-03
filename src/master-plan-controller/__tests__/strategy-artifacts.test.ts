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

const STRATEGY_NOW = '2026-08-03T17:00:00.000Z';

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
    expect(bundle.state.evidence).toHaveLength(3);
    expect(bundle.state.evidence.every((record) => record.limitations.length > 0)).toBe(true);
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

  it('reports automated review progress separately from generated shadow cycles', async () => {
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
    expect(checkedIn).toEqual(report);
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
