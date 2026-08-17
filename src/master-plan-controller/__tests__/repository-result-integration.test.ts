import { describe, expect, it } from 'vitest';
import { integrateRepositoryPacketResult } from '../repository-result-integration.js';
import { runRepositoryResultIntegration } from '../cli/integrate-result.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import { InMemoryFileSystem } from '../testing/in-memory-adapters.js';
import type { FileSystemPort } from '../ports.js';
import type { PacketResult } from '../types.js';

const NOW = '2026-08-17T02:00:00.000Z';
const REVIEWED_AT = '2026-08-17T01:55:00.000Z';
const PACKET_SERIES = 'packet-preservation-mitigation-tabletop';
const PACKET_ID = `${PACKET_SERIES}-run-1`;

const STRATEGY_FILES = [
  'strategy/constitution.json',
  'strategy/graph.json',
  'strategy/evidence.json',
  'strategy/outcome-contracts.json',
  'strategy/work-packets.json',
  'strategy/approvals.json',
  'strategy/assessments.json',
  'strategy/audit-log.json',
  'strategy/portfolio.json',
  'strategy/governance.json',
  'strategy/escalations.json',
  'strategy/research-areas.json',
  'strategy/packet-templates.json',
  'strategy/observation-sources.json',
  'strategy/periodic-reviews.json',
  'docs/PLAN.md',
  'docs/OPERATIONS.md',
] as const;

async function repositorySnapshot(source: FileSystemPort): Promise<Record<string, string>> {
  const paths = [...new Set([...STRATEGY_FILES, ...await source.listFiles('docs')])];
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await source.readText(path)] as const)));
}

async function eligibleRepositorySnapshot(source: FileSystemPort): Promise<Record<string, string>> {
  const snapshot = await repositorySnapshot(source);
  const templates = JSON.parse(snapshot['strategy/packet-templates.json']) as Array<Record<string, unknown>>;
  const template = templates.find((candidate) => candidate.id === PACKET_SERIES);
  if (!template) throw new Error(`Expected packet template ${PACKET_SERIES}`);
  const { trigger: _trigger, recurrence: _recurrence, ...definition } = template;
  snapshot['strategy/work-packets.json'] = `${JSON.stringify([{
    ...definition,
    id: PACKET_ID,
    seriesId: PACKET_SERIES,
    runNumber: 1,
    retrySignature: `${String(definition.retrySignature)}-run-1`,
    deliverables: (definition.deliverables as string[]).map((deliverable) => `${deliverable}-run-1`),
    lifecycle: 'eligible',
    attempt: 0,
    reviewedAt: '2026-08-17T01:00:00.000Z',
  }], null, 2)}\n`;
  return snapshot;
}

function reviewedResult(): PacketResult {
  return {
    outcome: 'positive',
    artifactReferences: [
      'strategy/findings/preservation-risks.json',
      'https://github.com/rookdaemon/MASTER_PLAN/pull/116',
    ],
    evidence: [{
      id: 'evidence-preservation-mitigation-tabletop-reviewed',
      claim: 'The repository risk-register artifact satisfies its schema and received independent agent review.',
      method: 'CI, exact-head independent agent review, and a pinned local-model review of pull request 116.',
      source: 'https://github.com/rookdaemon/MASTER_PLAN/pull/116',
      strength: 0.9,
      limitations: [
        'This verifies a repository artifact, not reduced real-world risk or external deployment.',
      ],
      supportedHypotheses: [],
      falsifiedHypotheses: [],
      verifier: 'independent-agent-review:4848516713',
      observedAt: REVIEWED_AT,
      outcome: 'positive',
    }],
    acceptanceCriteriaMet: true,
    verification: {
      status: 'passed',
      verifier: 'independent-agent-review:4848516713',
      reviewedAt: REVIEWED_AT,
    },
    portfolioEffortAfter: {
      'consciousness-epistemics': 0.35,
      'near-term-preservation': 0.3,
      'enabling-capabilities': 0.2,
      'institutional-continuity': 0.15,
    },
  };
}

describe('repository packet-result integration', () => {
  it('persists a reviewed result through controller semantics using the supplied timestamp', async () => {
    const initial = await eligibleRepositorySnapshot(new NodeFileSystem('.'));
    const fileSystem = new InMemoryFileSystem(initial);

    const outcome = await integrateRepositoryPacketResult(fileSystem, PACKET_ID, reviewedResult(), NOW);

    expect(outcome.event).toMatchObject({
      id: `audit:${PACKET_ID}:packet-verified:${NOW}`,
      type: 'packet-verified',
      occurredAt: NOW,
    });
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<{
      id: string; lifecycle: string;
    }>;
    expect(packets.find((packet) => packet.id === PACKET_ID)?.lifecycle).toBe('verified');
    const evidence = JSON.parse(await fileSystem.readText('strategy/evidence.json')) as Array<{
      id: string; limitations: string[];
    }>;
    const integratedEvidence = evidence.find((record) =>
      record.id === 'evidence-preservation-mitigation-tabletop-reviewed');
    expect(integratedEvidence?.limitations[0]).toMatch(/not reduced real-world risk/i);
    const governance = JSON.parse(await fileSystem.readText('strategy/governance.json')) as {
      reviewedResultCount: number;
    };
    expect(governance.reviewedResultCount).toBe(1);
    expect(await fileSystem.readText('strategy/graph.json')).toBe(initial['strategy/graph.json']);
    const originalPackets = initial['strategy/work-packets.json'];
    expect((await fileSystem.readText('strategy/work-packets.json')).replace('"lifecycle": "verified"', '"lifecycle": "eligible"'))
      .toBe(originalPackets);
    expect(await fileSystem.readText('docs/OPERATIONS.md')).toContain('Reviewed results since the current baseline: **1**.');
  });

  it('fails closed without writing when controller verification does not pass', async () => {
    const initial = await eligibleRepositorySnapshot(new NodeFileSystem('.'));
    const fileSystem = new InMemoryFileSystem(initial);
    const pending = reviewedResult();
    pending.verification = { status: 'pending', verifier: '', reviewedAt: REVIEWED_AT };

    await expect(integrateRepositoryPacketResult(fileSystem, PACKET_ID, pending, NOW))
      .rejects.toThrow(/packet-verified/);

    for (const path of STRATEGY_FILES) expect(await fileSystem.readText(path)).toBe(initial[path]);
  });

  it('persists a contract-qualified outcome measurement into the graph', async () => {
    const initial = await eligibleRepositorySnapshot(new NodeFileSystem('.'));
    const contracts = JSON.parse(initial['strategy/outcome-contracts.json']) as Array<Record<string, unknown>>;
    const contract = contracts.find((candidate) =>
      candidate.nodeId === 'capability-near-term-preservation' && candidate.metricId === 'risk-register-coverage');
    if (!contract) throw new Error('Expected preservation outcome contract');
    contract.allowedSourcePrefixes = ['https://github.com/rookdaemon/MASTER_PLAN/'];
    contract.requiredVerifierPrefix = 'independent-agent-review:';
    initial['strategy/outcome-contracts.json'] = `${JSON.stringify(contracts, null, 2)}\n`;
    const fileSystem = new InMemoryFileSystem(initial);
    const result = reviewedResult();
    result.metricMeasurements = [{
      outcomeContractId: String(contract.id),
      evidenceId: result.evidence[0].id,
      value: 1,
      observedAt: result.evidence[0].observedAt,
    }];

    await integrateRepositoryPacketResult(fileSystem, PACKET_ID, result, NOW);

    const graph = JSON.parse(await fileSystem.readText('strategy/graph.json')) as Array<{
      id: string; externallyDemonstrated?: boolean; metrics: Array<{ id: string; current: number }>;
    }>;
    const node = graph.find((candidate) => candidate.id === 'capability-near-term-preservation');
    expect(node?.metrics.find((metric) => metric.id === 'risk-register-coverage')?.current).toBe(1);
    expect(node?.externallyDemonstrated).toBe(true);
  });

  it('rejects replay of an already verified packet without changing a byte', async () => {
    const fileSystem = new InMemoryFileSystem(await eligibleRepositorySnapshot(new NodeFileSystem('.')));
    await integrateRepositoryPacketResult(fileSystem, PACKET_ID, reviewedResult(), NOW);
    const afterFirstIntegration = await repositorySnapshot(fileSystem);

    await expect(integrateRepositoryPacketResult(fileSystem, PACKET_ID, reviewedResult(), NOW))
      .rejects.toThrow(/already verified/i);

    for (const path of STRATEGY_FILES) {
      expect(await fileSystem.readText(path)).toBe(afterFirstIntegration[path]);
    }
  });

  it('runs from explicit CLI arguments and an injected filesystem', async () => {
    const initial = await eligibleRepositorySnapshot(new NodeFileSystem('.'));
    const resultPath = 'strategy/results/test-reviewed-result.json';
    const fileSystem = new InMemoryFileSystem({
      ...initial,
      [resultPath]: JSON.stringify(reviewedResult()),
    });

    const output = await runRepositoryResultIntegration(fileSystem, [PACKET_ID, resultPath, NOW]);

    expect(output).toContain(`Integrated ${PACKET_ID}`);
    expect(output).toContain(NOW);
  });
});
