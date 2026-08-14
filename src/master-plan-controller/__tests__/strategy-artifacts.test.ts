import { describe, expect, it } from 'vitest';
import { auditLegacyCards, verifyLegacyAuditCoverage } from '../legacy-audit.js';
import { ContinuousLoop } from '../continuous-loop.js';
import { Controller } from '../controller.js';
import { DiagnosticPacketGenerator } from '../packet-generation.js';
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
import { isVersionedPacketFamilyMember } from './repository-test-state.js';

const STRATEGY_NOW = '2026-08-04T00:30:00.000Z';
const GENERATED_PACKET_ID = 'packet-indicator-framework-comparison-v1';

function repositoryNow(value: unknown): string {
  const epochs: number[] = [];
  const visit = (candidate: unknown): void => {
    if (typeof candidate === 'string' && /^\d{4}-\d\d-\d\dT/.test(candidate)) {
      const epoch = Date.parse(candidate);
      if (!Number.isNaN(epoch)) epochs.push(epoch);
    } else if (Array.isArray(candidate)) {
      candidate.forEach(visit);
    } else if (candidate !== null && typeof candidate === 'object') {
      Object.values(candidate).forEach(visit);
    }
  };
  visit(value);
  return new Date(Math.max(...epochs) + 1).toISOString();
}

function withoutGeneratedCandidates<T extends { state: {
  packets: Array<{ id: string }>;
  auditEvents: Array<{ packetId?: string }>;
  activePacketId: string | null;
} }>(bundle: T): T {
  const result = structuredClone(bundle);
  result.state.packets = result.state.packets.filter((packet) => !isVersionedPacketFamilyMember(packet.id));
  result.state.auditEvents = result.state.auditEvents.filter((event) =>
    !event.packetId || !isVersionedPacketFamilyMember(event.packetId));
  if (result.state.activePacketId && isVersionedPacketFamilyMember(result.state.activePacketId)) {
    result.state.activePacketId = null;
  }
  return result;
}

function expectReviewedResultCountIsAuditable(bundle: {
  state: {
    governance: { supervisedResultsReviewed: number };
    auditEvents: Array<{ type: string }>;
  };
}): void {
  const verifiedResults = bundle.state.auditEvents.filter((event) => event.type === 'packet-verified').length;
  expect(bundle.state.governance.supervisedResultsReviewed).toBe(verifiedResults);
}

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
    const report = await verifyRepositoryStrategy(fileSystem, bundle, repositoryNow(bundle), CONFIG);
    expect(report.errors).toEqual([]);
    expect(report.legacyPlanFileCount).toBeGreaterThan(100);
    expect(bundle.legacyAudit).toHaveLength(report.legacyPlanFileCount);
  });

  it('fails closed on malformed evidence, packets, authority records, and controller bounds', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = structuredClone(await loadRepositoryStrategy(fileSystem));
    bundle.state.evidence[0] = {
      ...bundle.state.evidence[0],
      observedAt: '2026-08-04T01:00:00.000Z',
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
    const repositoryControlSource = bundle.observationSources.find(
      (source) => source.kind === 'github-repository-controls',
    );
    if (!repositoryControlSource) throw new Error('Expected a repository control observation source');
    repositoryControlSource.hypothesisId = 'missing-observation-hypothesis';
    bundle.periodicReviews.push({ id: 'malformed-periodic-review' } as never);

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
    expect(errors).toMatch(/observation source.*missing hypothesis/i);
    expect(errors).toMatch(/periodic review/i);
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

  it('contains the constitutional core, exact portfolio weights, and the verified safe-code rollout state', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    expect(bundle.state.constitution.directives).toEqual(['G1', 'G2', 'G3']);
    expect(bundle.config.portfolioWeights).toEqual({
      'consciousness-epistemics': 0.35,
      'near-term-preservation': 0.3,
      'enabling-capabilities': 0.2,
      'institutional-continuity': 0.15,
    });
    expect(bundle.state.governance).toMatchObject({
      mode: 'safe-code',
      shadowCyclesReviewed: 20,
      safeAutoMergeEnabled: true,
    });
    expect(bundle.state.governance.supervisedResultsReviewed).toBeGreaterThanOrEqual(5);
    const packetPortfolios = new Set(bundle.state.packets.map((packet) => packet.portfolio));
    expect(packetPortfolios).toEqual(new Set([
      'consciousness-epistemics',
      'near-term-preservation',
      'enabling-capabilities',
      'institutional-continuity',
    ]));
    expect(bundle.state.nodes.find((node) => node.id === 'hypothesis-live-stewardship-controls-aligned'))
      .toMatchObject({ kind: 'hypothesis', portfolio: 'institutional-continuity', lifecycle: 'eligible' });
    const observation = JSON.parse(await fileSystem.readText('strategy/observation-sources.json')) as {
      sources: Array<{
        kind: string; portfolio: string; branch?: string; hypothesisId?: string; id?: string;
        adjudication?: { targets?: unknown[] };
      }>;
    };
    expect(observation.sources.find((source) => source.kind === 'github-repository-controls')).toMatchObject({
      kind: 'github-repository-controls',
      branch: 'main',
      hypothesisId: 'hypothesis-live-stewardship-controls-aligned',
      portfolio: 'institutional-continuity',
    });
    expect(observation.sources.filter((source) => source.kind === 'public-source-snapshot')).toHaveLength(3);
    expect(observation.sources.filter((source) => source.kind === 'public-source-snapshot')
      .every((source) =>
        Array.isArray(source.adjudication?.targets) && source.adjudication.targets.length > 0)).toBe(true);
    expect(new Set(observation.sources.map((source) => source.portfolio))).toEqual(new Set([
      'consciousness-epistemics',
      'near-term-preservation',
      'enabling-capabilities',
      'institutional-continuity',
    ]));
    expect(await fileSystem.readText('strategy/ROADMAP.md'))
      .toContain('Scheduled cycles integrate deduplicated external observations before diagnosis.');
    expect(await fileSystem.readText('strategy/ROADMAP.md'))
      .toContain('Only fresh, matching adjudicated evidence can trigger recurring work.');
    expect(await fileSystem.readText('strategy/ROADMAP.md')).toContain('Safe auto-merge enabled: yes.');
  });

  it('provides bounded automated generation coverage across every active portfolio', async () => {
    const bundle = await loadRepositoryStrategy(new NodeFileSystem('.'));
    expect(new Set(bundle.packetTemplates.map((template) => template.portfolio))).toEqual(new Set([
      'consciousness-epistemics',
      'near-term-preservation',
      'enabling-capabilities',
      'institutional-continuity',
    ]));
    expect(bundle.packetTemplates.every((template) =>
      template.recurrence?.kind === 'versioned' &&
      template.authorityClass !== 'human-escalation' &&
      template.budget.limit > 0 &&
      template.deliverables.length > 0 &&
      template.acceptanceCriteria.length > 0 &&
      template.testsOrPreregistration.length > 0)).toBe(true);
    expect(bundle.packetTemplates.some((template) => template.trigger.kind === 'metric-gap')).toBe(true);
    expect(bundle.packetTemplates.some((template) =>
      template.trigger.kind === 'metric-gap' && template.credibleExtinctionPrevention)).toBe(true);
    const metricCount = bundle.state.nodes.reduce((total, node) => total + node.metrics.length, 0);
    expect(bundle.state.outcomeContracts).toHaveLength(metricCount);
  });

  it('turns the current diagnosis into a deterministic executable frontier without environment time', async () => {
    const bundle = withoutGeneratedCandidates(await loadRepositoryStrategy(new NodeFileSystem('.')));
    const now = repositoryNow(bundle);
    bundle.state.evidence.push({
      id: 'evidence-test-material-consciousness-update',
      claim: 'A bounded metadata update requires renewed comparison.',
      method: 'Guarded test adjudication.',
      source: 'https://example.test/metadata',
      strength: 0.6,
      limitations: ['Metadata-only test signal.'],
      supportedHypotheses: ['hypothesis-material-consciousness-update'],
      falsifiedHypotheses: [],
      verifier: 'test-adjudicator',
      observedAt: now,
      outcome: 'positive',
    });
    const diagnosis = new Controller(bundle.state, bundle.config).evaluate(bundle.state, now).diagnosis;
    const generated = await new DiagnosticPacketGenerator(bundle.packetTemplates)
      .generate(bundle.state, diagnosis, now);
    const withGenerated = { ...bundle.state, packets: [...bundle.state.packets, ...generated] };
    const frontier = new Controller(withGenerated, bundle.config).evaluate(withGenerated, now);

    expect(generated.map((packet) => packet.id)).toContain(GENERATED_PACKET_ID);
    expect(generated.every((packet) => packet.reviewedAt === now)).toBe(true);
    expect(frontier.ranked[0]?.packet.id).toBe('packet-preservation-mitigation-tabletop-v1');
  });

  it('accepts a matching persisted generated packet but rejects divergent identity reuse', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = withoutGeneratedCandidates(await loadRepositoryStrategy(fileSystem));
    const now = repositoryNow(bundle);
    bundle.state.evidence.push({
      id: 'evidence-test-material-consciousness-update', claim: 'A bounded update requires renewed comparison.',
      method: 'Guarded test adjudication.', source: 'https://example.test/metadata', strength: 0.6,
      limitations: ['Metadata-only test signal.'], supportedHypotheses: ['hypothesis-material-consciousness-update'],
      falsifiedHypotheses: [], verifier: 'test-adjudicator', observedAt: now, outcome: 'positive',
    });
    const diagnosis = new Controller(bundle.state, bundle.config).evaluate(bundle.state, now).diagnosis;
    const [generated] = await new DiagnosticPacketGenerator(bundle.packetTemplates)
      .generate(bundle.state, diagnosis, now);
    bundle.state.packets.push(generated);

    expect((await verifyRepositoryStrategy(fileSystem, bundle, now)).errors).toEqual([]);
    generated.retrySignature = 'divergent-definition';
    expect((await verifyRepositoryStrategy(fileSystem, bundle, now)).errors.join('\n'))
      .toMatch(/collides with a different persisted packet/i);
  });

  it('allows a valid reviewed transition to supervised mode to keep passing strategy verification', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = structuredClone(await loadRepositoryStrategy(fileSystem));
    bundle.state.shadowCycleReviews = acceptedShadowReviews(bundle.state.shadowCycles);
    bundle.state.governance = {
      mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false,
    };
    expect((await verifyRepositoryStrategy(fileSystem, bundle, repositoryNow(bundle))).errors).toEqual([]);
  });

  it('allows auditable shadow reviews to accumulate before the twentieth review', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = structuredClone(await loadRepositoryStrategy(fileSystem));
    bundle.state.shadowCycleReviews = acceptedShadowReviews(bundle.state.shadowCycles).slice(0, 1);
    bundle.state.governance = {
      ...bundle.state.governance,
      mode: 'shadow',
      shadowCyclesReviewed: 1,
      safeAutoMergeEnabled: false,
    };
    expect((await verifyRepositoryStrategy(fileSystem, bundle, repositoryNow(bundle))).errors).toEqual([]);
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
    expect(bundle.state.evidence.length).toBeGreaterThanOrEqual(7);
    expect(new Set(bundle.state.evidence.map((record) => record.id)).size).toBe(bundle.state.evidence.length);
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
    expect(bundle.state.evidence.find((record) => record.id === result.evidence[0].id))
      .toEqual(result.evidence[0]);
    expect(bundle.state.packets.find((packet) =>
      packet.id === 'packet-preservation-risk-register')?.lifecycle).toBe('verified');
    expectReviewedResultCountIsAuditable(bundle);
  });
});

describe('consciousness prediction registry artifact', () => {
  it('uses automated domain review and reserves human escalation for ethics and consent', async () => {
    const bundle = await loadRepositoryStrategy(new NodeFileSystem('.'));
    const packet = bundle.state.packets.find((candidate) =>
      candidate.id === 'packet-consciousness-prediction-registry');

    expect(packet?.verificationMethod).toMatch(/independent domain-focused agent/i);
    expect(packet?.verificationMethod).toMatch(/exact head/i);
    expect(packet?.verificationMethod).toMatch(/legal consent|institutional ethics/i);
  });

  it('is preregistration-ready, theory-neutral, source-limited, and gated before subject research', async () => {
    const fileSystem = new NodeFileSystem('.');
    const registry = JSON.parse(await fileSystem.readText(
      'strategy/results/consciousness-prediction-registry-v1.json',
    )) as {
      packetId: string;
      preparedAt: string;
      scope: { claimsCurrentAiConsciousness: boolean; executesHumanSubjectsResearch: boolean };
      registrationGate: {
        status: string; requiredBeforeExecution: string[]; humanRole: string;
      };
      blinding: {
        analystPackageExcludes: string[]; mappingCustodian: string; unblindingTrigger: string;
      };
      theoryFamilies: Array<{ id: string; name: string; sourceIds: string[]; limitations: string[] }>;
      sources: Array<{
        id: string; title: string; url: string; publicationKind: string; publishedAt: string; accessedAt: string;
        limitations: string[];
      }>;
      predictions: Array<{
        id: string; blindedLabel: string; title: string; sourceIds: string[];
        measurement: {
          population: string; design: string; modalities: string[]; primaryVariables: string[];
          analysisPlan: string[]; sampleSizeJustification: string; manipulation?: string;
        };
        criteria: { pass: string; fail: string; inconclusive: string; thresholdPolicy: string };
        confounders: Array<{ confounder: string; control: string }>;
        interpretations: Array<{
          theoryId: string; expectedResult: string; consequence: string;
          proponentPosition: string; sourceIds: string[];
        }>;
        neutrality: { rivalExplanations: string[]; forbiddenInference: string };
      }>;
    };

    expect(registry.packetId).toBe('packet-consciousness-prediction-registry');
    expect(Number.isNaN(Date.parse(registry.preparedAt))).toBe(false);
    expect(registry.scope).toMatchObject({
      claimsCurrentAiConsciousness: false,
      executesHumanSubjectsResearch: false,
    });
    expect(registry.registrationGate.status).toBe('not-authorized-for-execution');
    expect(registry.registrationGate.requiredBeforeExecution).toEqual(expect.arrayContaining([
      'independent theory-neutral review',
      'theory-proponent interpretation adjudication',
      'institutional ethics approval and informed consent',
    ]));
    expect(registry.registrationGate.humanRole).toMatch(/legal consent|ethics/i);
    expect(registry.blinding.analystPackageExcludes).toEqual(expect.arrayContaining([
      'theory-family names',
      'interpretation mappings',
    ]));
    expect(registry.blinding.mappingCustodian).toMatch(/automated|access-separated/i);
    expect(registry.blinding.unblindingTrigger).toMatch(/locked|signed|complete/i);

    const theoryIds = new Set(registry.theoryFamilies.map((theory) => theory.id));
    expect(theoryIds).toEqual(new Set(['iit', 'gnwt', 'rpt', 'hot']));
    expect(registry.theoryFamilies.every((theory) =>
      theory.sourceIds.length > 0 && theory.limitations.length > 0)).toBe(true);
    const sourceIds = new Set(registry.sources.map((source) => source.id));
    expect(sourceIds.size).toBe(registry.sources.length);
    expect(registry.sources.every((source) =>
      source.url.startsWith('https://') &&
      source.publicationKind.trim().length > 0 &&
      !Number.isNaN(Date.parse(source.publishedAt)) &&
      !Number.isNaN(Date.parse(source.accessedAt)) &&
      source.limitations.length > 0)).toBe(true);
    expect(registry.sources.find((source) => source.id === 'hot-pfc-dispute-2024')).toMatchObject({
      title: 'An embarrassment of richnesses: the PFC isn’t the content NCC',
      publishedAt: '2024-05-18T00:00:00.000Z',
    });
    expect(registry.sources.find((source) => source.id === 'ai-indicators-2023')).toMatchObject({
      publishedAt: '2023-08-17T00:00:00.000Z',
    });

    expect(registry.predictions.length).toBeGreaterThanOrEqual(6);
    expect(new Set(registry.predictions.map((prediction) => prediction.id)).size)
      .toBe(registry.predictions.length);
    expect(new Set(registry.predictions.map((prediction) => prediction.blindedLabel)).size)
      .toBe(registry.predictions.length);
    for (const prediction of registry.predictions) {
      expect(prediction.title.trim()).not.toBe('');
      expect(prediction.sourceIds.length).toBeGreaterThan(0);
      expect(prediction.sourceIds.every((id) => sourceIds.has(id))).toBe(true);
      expect(prediction.measurement.population.trim()).not.toBe('');
      expect(prediction.measurement.design.trim()).not.toBe('');
      expect(prediction.measurement.modalities.length).toBeGreaterThan(0);
      expect(prediction.measurement.primaryVariables.length).toBeGreaterThan(0);
      expect(prediction.measurement.analysisPlan.length).toBeGreaterThan(0);
      expect(prediction.measurement.sampleSizeJustification).toMatch(/power|precision|simulation/i);
      expect(prediction.criteria.pass.trim()).not.toBe('');
      expect(prediction.criteria.fail.trim()).not.toBe('');
      expect(prediction.criteria.inconclusive.trim()).not.toBe('');
      expect(prediction.criteria.thresholdPolicy).toMatch(/before|preregister/i);
      expect(prediction.confounders.length).toBeGreaterThanOrEqual(2);
      expect(prediction.confounders.every((item) =>
        item.confounder.trim().length > 0 && item.control.trim().length > 0)).toBe(true);
      expect(new Set(prediction.interpretations.map((item) => item.theoryId)).size)
        .toBe(prediction.interpretations.length);
      expect(prediction.interpretations.length).toBeGreaterThanOrEqual(2);
      for (const interpretation of prediction.interpretations) {
        expect(theoryIds.has(interpretation.theoryId)).toBe(true);
        expect(interpretation.expectedResult.trim()).not.toBe('');
        expect(interpretation.consequence.trim()).not.toBe('');
        expect(interpretation.proponentPosition).toMatch(/preapproved|source-authored|published-dispute/);
        expect(interpretation.sourceIds.every((id) => sourceIds.has(id))).toBe(true);
      }
      expect(prediction.neutrality.rivalExplanations.length).toBeGreaterThan(0);
      expect(prediction.neutrality.forbiddenInference).toMatch(/consciousness|theory/i);
    }
    const metacognitivePrediction = registry.predictions.find((prediction) =>
      prediction.id === 'prediction-metacognitive-dissociation');
    expect(metacognitivePrediction?.measurement.manipulation).toMatch(/random|post-decision evidence/i);
    expect(metacognitivePrediction?.measurement.analysisPlan.join(' ')).toMatch(/manipulation-strength/i);
  });

  it('retains exact review provenance without claiming an experiment or consciousness finding', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const result = JSON.parse(await fileSystem.readText(
      'strategy/results/consciousness-prediction-registry-v1.result.json',
    )) as {
      artifactReferences: string[];
      evidence: Array<{ id: string; limitations: string[] }>;
      verification: { status: string; verifier: string; reviewedAt: string };
    };

    expect(result.verification).toEqual({
      status: 'passed',
      verifier: 'independent-agent-review:4849079054+github-run:30859173640',
      reviewedAt: '2026-08-03T22:51:31.000Z',
    });
    expect(result.artifactReferences).toEqual(expect.arrayContaining([
      'https://github.com/rookdaemon/MASTER_PLAN/pull/119',
      'https://github.com/rookdaemon/MASTER_PLAN/pull/119#pullrequestreview-4849079054',
      'https://github.com/rookdaemon/MASTER_PLAN/actions/runs/30859173640',
      'git:db0df364758917e3fe48b6111afce78cf2625f01',
    ]));
    expect(result.evidence[0].limitations.join(' ')).toMatch(/does not report a human-subject experiment/i);
    expect(result.evidence[0].limitations.join(' ')).toMatch(/comment.*owner account/i);
    expect(bundle.state.evidence.find((record) => record.id === result.evidence[0].id))
      .toEqual(result.evidence[0]);
    expect(bundle.state.packets.find((packet) =>
      packet.id === 'packet-consciousness-prediction-registry')?.lifecycle).toBe('verified');
    expectReviewedResultCountIsAuditable(bundle);
  });
});

describe('institutional dependency map artifact', () => {
  it('separates artifacts, evidence, readiness, and outcomes across capture, schism, succession, and funding risks', async () => {
    const fileSystem = new NodeFileSystem('.');
    const map = JSON.parse(await fileSystem.readText(
      'strategy/results/institutional-dependency-map-v1.json',
    )) as {
      packetId: string;
      assessedAt: string;
      scope: { performsOutreach: boolean; changesGovernance: boolean; claimsExternalContinuity: boolean };
      humanRole: string;
      sources: Array<{ id: string; url: string; accessedAt: string; limitations: string[] }>;
      dependencies: Array<{
        id: string; category: string; sourceIds: string[];
        repositoryArtifact: { status: string; references: string[]; limitations: string[] };
        evidence: { strength: string; basis: string; limitations: string[] };
        readiness: { status: string; prerequisites: string[]; gaps: string[] };
        externalOutcome: { status: string; statement: string };
      }>;
      edges: Array<{ from: string; to: string; failurePropagation: string }>;
      scenarios: Array<{
        id: string; triggers: string[]; affectedDependencyIds: string[];
        candidateAutomatedControls: Array<{
          description: string; status: 'present' | 'planned'; evidenceReferences: string[];
        }>;
        residualGap: string; humanEscalation: string;
      }>;
    };

    expect(map.packetId).toBe('packet-institutional-dependency-map');
    expect(Number.isNaN(Date.parse(map.assessedAt))).toBe(false);
    expect(map.scope).toEqual({
      performsOutreach: false,
      changesGovernance: false,
      claimsExternalContinuity: false,
    });
    expect(map.humanRole).toMatch(/credential|legal|physical/i);
    const sourceIds = new Set(map.sources.map((source) => source.id));
    const expectedSourceUrls = new Map([
      ['source-repository', 'https://github.com/rookdaemon/MASTER_PLAN'],
      ['source-github-ownership-continuity', 'https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/maintaining-ownership-continuity-for-your-organization'],
      ['source-github-protected-branches', 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches'],
      ['source-github-transfer', 'https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository'],
      ['source-github-codeowners', 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners'],
      ['source-github-actions-billing', 'https://docs.github.com/en/billing/concepts/product-billing/github-actions'],
      ['source-nist-contingency-planning', 'https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-34r1.pdf'],
      ['source-cisa-iam-practices', 'https://www.cisa.gov/sites/default/files/2023-12/ESF%20IDENTITY%20AND%20ACCESS%20MANAGEMENT%20RECOMMENDED%20BEST%20PRACTICES%20FOR%20ADMINISTRATORS%20PP-23-0248_508C.pdf'],
      ['source-cisa-succession', 'https://www.cisa.gov/sites/default/files/publications/emergency-services-sector-continuity-planning-suite-worksheet-2-orders-of-succession-022018-508.pdf'],
      ['source-openssf-scorecard', 'https://openssf.org/scorecard/'],
    ]);
    expect(new Map(map.sources.map((source) => [source.id, source.url]))).toEqual(expectedSourceUrls);
    expect(sourceIds).toEqual(new Set(expectedSourceUrls.keys()));
    expect(sourceIds.size).toBe(map.sources.length);
    expect(map.sources.every((source) =>
      source.url.startsWith('https://') &&
      !Number.isNaN(Date.parse(source.accessedAt)) &&
      Date.parse(source.accessedAt) <= Date.parse(map.assessedAt) &&
      source.limitations.length > 0 &&
      source.limitations.every((limitation) => limitation.trim().length > 0))).toBe(true);

    const repositoryFiles = new Set([
      ...(await fileSystem.listFiles('strategy')),
      ...(await fileSystem.listFiles('.github')),
      'AGENTS.md',
      'STATUS.md',
      'package.json',
    ]);

    expect(map.dependencies.length).toBeGreaterThanOrEqual(6);
    const dependencyIds = new Set(map.dependencies.map((dependency) => dependency.id));
    expect(dependencyIds.size).toBe(map.dependencies.length);
    for (const dependency of map.dependencies) {
      expect(dependency.category.trim()).not.toBe('');
      expect(dependency.sourceIds.length).toBeGreaterThan(0);
      expect(dependency.sourceIds.every((id) => sourceIds.has(id))).toBe(true);
      expect(dependency.repositoryArtifact.references.length).toBeGreaterThan(0);
      expect(dependency.repositoryArtifact.references.every((reference) =>
        reference.startsWith('https://') || repositoryFiles.has(reference))).toBe(true);
      expect(dependency.repositoryArtifact.limitations.length).toBeGreaterThan(0);
      expect(dependency.repositoryArtifact.limitations.every((limitation) => limitation.trim().length > 0)).toBe(true);
      expect(['weak', 'moderate', 'strong']).toContain(dependency.evidence.strength);
      expect(dependency.evidence.basis.trim()).not.toBe('');
      expect(dependency.evidence.limitations.length).toBeGreaterThan(0);
      expect(dependency.evidence.limitations.every((limitation) => limitation.trim().length > 0)).toBe(true);
      expect(['not-ready', 'partial', 'ready']).toContain(dependency.readiness.status);
      expect(dependency.readiness.prerequisites.length).toBeGreaterThan(0);
      expect(dependency.readiness.gaps.length).toBeGreaterThan(0);
      expect([...dependency.readiness.prerequisites, ...dependency.readiness.gaps]
        .every((entry) => entry.trim().length > 0)).toBe(true);
      expect(dependency.externalOutcome.status).toBe('not-verified');
      expect(dependency.externalOutcome.statement.trim()).not.toBe('');
    }
    expect(map.edges.length).toBeGreaterThanOrEqual(map.dependencies.length);
    expect(map.edges.every((edge) =>
      dependencyIds.has(edge.from) && dependencyIds.has(edge.to) && edge.failurePropagation.trim().length > 0)).toBe(true);

    expect(new Set(map.scenarios.map((scenario) => scenario.id))).toEqual(new Set([
      'capture', 'schism', 'succession', 'funding',
    ]));
    for (const scenario of map.scenarios) {
      expect(scenario.triggers.length).toBeGreaterThan(0);
      expect(scenario.affectedDependencyIds.every((id) => dependencyIds.has(id))).toBe(true);
      expect(scenario.candidateAutomatedControls.length).toBeGreaterThanOrEqual(2);
      for (const control of scenario.candidateAutomatedControls) {
        expect(control.description.trim()).not.toBe('');
        expect(['present', 'planned']).toContain(control.status);
        expect(control.evidenceReferences.length).toBeGreaterThan(0);
        expect(control.evidenceReferences.every((reference) =>
          sourceIds.has(reference) || repositoryFiles.has(reference))).toBe(true);
        if (control.status === 'present') {
          expect(control.evidenceReferences.some((reference) => repositoryFiles.has(reference))).toBe(true);
        }
      }
      expect(scenario.residualGap.trim()).not.toBe('');
      expect(scenario.humanEscalation).toMatch(/only if/i);
      expect(scenario.humanEscalation).toMatch(/truly unautomatable/i);
      expect(scenario.humanEscalation).toMatch(/credential|legal consent|physical|constitutional conflict/i);
      expect(scenario.humanEscalation).toMatch(/two|at least two/i);
    }
  });

  it('retains exact review provenance without claiming institutional continuity', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const result = JSON.parse(await fileSystem.readText(
      'strategy/results/institutional-dependency-map-v1.result.json',
    )) as {
      artifactReferences: string[];
      evidence: Array<{ id: string; limitations: string[] }>;
      verification: { status: string; verifier: string; reviewedAt: string };
    };

    expect(result.verification).toEqual({
      status: 'passed',
      verifier: 'independent-agent-review:4849377990+github-run:30863160408',
      reviewedAt: '2026-08-03T23:55:52.000Z',
    });
    expect(result.artifactReferences).toEqual(expect.arrayContaining([
      'https://github.com/rookdaemon/MASTER_PLAN/pull/122',
      'https://github.com/rookdaemon/MASTER_PLAN/pull/122#pullrequestreview-4849377990',
      'https://github.com/rookdaemon/MASTER_PLAN/actions/runs/30863160408',
      'git:bf330e89aa4922db1eda611538f1f3f2704e185c',
    ]));
    expect(result.evidence[0].limitations.join(' ')).toMatch(/does not verify institutional continuity/i);
    expect(result.evidence[0].limitations.join(' ')).toMatch(/comment.*owner account/i);
    expect(bundle.state.evidence.find((record) => record.id === result.evidence[0].id))
      .toEqual(result.evidence[0]);
    expect(bundle.state.packets.find((packet) =>
      packet.id === 'packet-institutional-dependency-map')?.lifecycle).toBe('verified');
    expectReviewedResultCountIsAuditable(bundle);
  });
});

describe('durable compute fault-model result integration', () => {
  it('retains exact replay-review provenance without claiming physical durability', async () => {
    const fileSystem = new NodeFileSystem('.');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const result = JSON.parse(await fileSystem.readText(
      'strategy/results/durable-compute-fault-model-v1.result.json',
    )) as {
      outcome: string;
      artifactReferences: string[];
      evidence: Array<{ id: string; method: string; limitations: string[] }>;
      verification: { status: string; verifier: string; reviewedAt: string };
    };

    expect(result).toMatchObject({
      outcome: 'positive',
      verification: {
        status: 'passed',
        verifier: 'independent-agent-review:4849533096+github-run:30865111083',
        reviewedAt: '2026-08-04T00:28:00.000Z',
      },
    });
    expect(result.artifactReferences).toEqual(expect.arrayContaining([
      'https://github.com/rookdaemon/MASTER_PLAN/pull/124',
      'https://github.com/rookdaemon/MASTER_PLAN/pull/124#pullrequestreview-4849533096',
      'https://github.com/rookdaemon/MASTER_PLAN/actions/runs/30865111083',
      'git:d7e8097da10f5b25301f87f518d33c55d50de059',
    ]));
    expect(result.evidence[0].method).toMatch(/hosted GitHub agent-review run 30865111083/i);
    expect(result.evidence[0].method).not.toMatch(/pinned local-model/i);
    expect(result.evidence[0].limitations.join(' ')).toMatch(/not.*physical durability/i);
    expect(result.evidence[0].limitations.join(' ')).toMatch(/model inputs.*not.*measurements/i);
    expect(bundle.state.evidence.find((record) => record.id === result.evidence[0].id))
      .toEqual(result.evidence[0]);
    expect(bundle.state.packets.find((packet) =>
      packet.id === 'packet-durable-compute-fault-model')?.lifecycle).toBe('verified');
    expectReviewedResultCountIsAuditable(bundle);
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
