import { describe, expect, it } from 'vitest';
import { integrateRepositoryPacketResult } from '../repository-result-integration.js';
import { runRepositoryResultIntegration } from '../cli/integrate-result.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import { InMemoryFileSystem } from '../testing/in-memory-adapters.js';
import type { FileSystemPort } from '../ports.js';
import type { PacketResult } from '../types.js';

const NOW = '2026-08-03T21:30:00.000Z';
const REVIEWED_AT = '2026-08-03T21:25:00.000Z';
const PACKET_ID = 'packet-preservation-risk-register';

const STRATEGY_FILES = [
  'strategy/constitution.json',
  'strategy/graph.json',
  'strategy/evidence.json',
  'strategy/work-packets.json',
  'strategy/approvals.json',
  'strategy/assessments.json',
  'strategy/audit-log.json',
  'strategy/portfolio.json',
  'strategy/governance.json',
  'strategy/escalations.json',
  'strategy/shadow-cycles.json',
  'strategy/shadow-reviews.json',
  'strategy/legacy-audit.json',
  'strategy/packet-templates.json',
  'strategy/observation-sources.json',
  'strategy/periodic-reviews.json',
  'strategy/ROADMAP.md',
  'STATUS.md',
] as const;

async function repositorySnapshot(source: FileSystemPort): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(
    STRATEGY_FILES.map(async (path) => [path, await source.readText(path)] as const),
  ));
}

async function eligibleRepositorySnapshot(source: FileSystemPort): Promise<Record<string, string>> {
  const snapshot = await repositorySnapshot(source);
  snapshot['strategy/work-packets.json'] = snapshot['strategy/work-packets.json'].replace(
    /("id": "packet-preservation-risk-register"[\s\S]*?"lifecycle": )"verified"/,
    '$1"eligible"',
  );
  snapshot['strategy/governance.json'] = snapshot['strategy/governance.json'].replace(
    /"supervisedResultsReviewed": \d+/,
    '"supervisedResultsReviewed": 0',
  );
  snapshot['strategy/evidence.json'] = `${JSON.stringify(
    (JSON.parse(snapshot['strategy/evidence.json']) as Array<{ id: string }>).filter((record) =>
      record.id !== 'evidence-preservation-risk-register-v1-reviewed'),
    null,
    2,
  )}\n`;
  snapshot['strategy/audit-log.json'] = `${JSON.stringify(
    (JSON.parse(snapshot['strategy/audit-log.json']) as Array<{ packetId?: string }>).filter((event) =>
      event.packetId !== PACKET_ID),
    null,
    2,
  )}\n`;
  snapshot['strategy/ROADMAP.md'] = snapshot['strategy/ROADMAP.md'].replace(
    /Automated results independently agent-reviewed: \d+\./,
    'Automated results independently agent-reviewed: 0.',
  );
  snapshot['STATUS.md'] = snapshot['STATUS.md'].replace(
    /Automated results independently agent-reviewed: \*\*\d+\*\*/,
    'Automated results independently agent-reviewed: **0**',
  );
  return snapshot;
}

function reviewedResult(): PacketResult {
  return {
    outcome: 'positive',
    artifactReferences: [
      'strategy/results/preservation-risk-register-v1.json',
      'https://github.com/rookdaemon/MASTER_PLAN/pull/116',
    ],
    evidence: [{
      id: 'evidence-preservation-risk-register-v1-reviewed',
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
      record.id === 'evidence-preservation-risk-register-v1-reviewed');
    expect(integratedEvidence?.limitations[0]).toMatch(/not reduced real-world risk/i);
    const governance = JSON.parse(await fileSystem.readText('strategy/governance.json')) as {
      supervisedResultsReviewed: number;
    };
    expect(governance.supervisedResultsReviewed).toBe(1);
    expect(await fileSystem.readText('strategy/graph.json')).toBe(initial['strategy/graph.json']);
    const originalPackets = initial['strategy/work-packets.json'];
    expect((await fileSystem.readText('strategy/work-packets.json')).replace('"lifecycle": "verified"', '"lifecycle": "eligible"'))
      .toBe(originalPackets);
    expect(await fileSystem.readText('strategy/ROADMAP.md')).toContain('Automated results independently agent-reviewed: 1.');
    expect(await fileSystem.readText('STATUS.md')).toContain('Automated results independently agent-reviewed: **1**');
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
