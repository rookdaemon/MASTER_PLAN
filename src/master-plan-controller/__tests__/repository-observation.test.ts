import { describe, expect, it } from 'vitest';
import {
  GitHubRepositoryControlObserver,
  runRepositoryObservation,
  type RepositoryControlObservationConfig,
} from '../repository-observation.js';
import { runRepositoryObservationCli } from '../cli/observe-repository.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import {
  InMemoryExternalData,
  InMemoryFileSystem,
  InMemoryNetwork,
} from '../testing/in-memory-adapters.js';
import { advanceTimestamp, nextRepositoryTimestamp } from './repository-test-time.js';

const NOW = '2026-08-04T05:00:00.000Z';
const REPOSITORY_URL = 'https://api.github.com/repos/owner/repo';
const PROTECTION_URL = `${REPOSITORY_URL}/branches/main`;
const CONFIG: RepositoryControlObservationConfig = {
  repository: 'owner/repo',
  branch: 'main',
  hypothesisId: 'hypothesis-live-stewardship-controls-aligned',
  branchProtected: true,
  requiredStatusChecks: ['typecheck', 'test', 'strategy-verify', 'proposal-review', 'agent-review'],
  enforceAdmins: true,
};

function responses(overrides: { checks?: string[] } = {}) {
  return {
    [`GET ${PROTECTION_URL}`]: {
      status: 200,
      body: JSON.stringify({
        protected: true,
        protection: {
          required_status_checks: {
            enforcement_level: 'everyone',
            contexts: overrides.checks ?? CONFIG.requiredStatusChecks,
          },
        },
      }),
    },
  };
}

async function repositorySnapshot(): Promise<Record<string, string>> {
  const source = new NodeFileSystem('.');
  const paths = [...await source.listFiles('strategy/'), ...await source.listFiles('plan/')];
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await source.readText(path)])));
}

describe('live repository control observation', () => {
  it('emits bounded positive evidence when live controls match policy', async () => {
    const network = new InMemoryNetwork(responses());
    const observer = new GitHubRepositoryControlObserver(network, CONFIG, 'token');

    const [evidence] = await observer.observe(NOW);

    expect(network.requests).toEqual([
      { method: 'GET', url: PROTECTION_URL, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer token' } },
    ]);
    expect(evidence).toMatchObject({
      outcome: 'positive',
      observedAt: NOW,
      supportedHypotheses: [CONFIG.hypothesisId],
      falsifiedHypotheses: [],
      verifier: 'deterministic-live-repository-control-observer:v1',
    });
    expect(evidence.claim).toMatch(/match/i);
    expect(evidence.limitations.join(' ')).toMatch(/snapshot/i);
  });

  it('emits stable negative evidence with explicit drift details', async () => {
    const observer = new GitHubRepositoryControlObserver(new InMemoryNetwork(responses({
      checks: ['typecheck'],
    })), CONFIG);

    const [first] = await observer.observe(NOW);
    const [second] = await observer.observe(advanceTimestamp(NOW));

    expect(first).toMatchObject({
      outcome: 'negative',
      supportedHypotheses: [],
      falsifiedHypotheses: [CONFIG.hypothesisId],
    });
    expect(first.id).toBe(second.id);
    expect(first.claim).toMatch(/drift/i);
    expect(first.method).toMatch(/branchProtected.*requiredStatusChecks/s);
  });

  it('fails closed on unavailable or malformed external state', async () => {
    const unavailable = new GitHubRepositoryControlObserver(new InMemoryNetwork({
      [`GET ${PROTECTION_URL}`]: { status: 503, body: 'unavailable' },
    }), CONFIG);
    await expect(unavailable.observe(NOW)).rejects.toThrow(/503/);

    const malformed = new GitHubRepositoryControlObserver(new InMemoryNetwork({
      [`GET ${PROTECTION_URL}`]: { status: 200, body: '{}' },
    }), CONFIG);
    await expect(malformed.observe(NOW)).rejects.toThrow(/malformed/i);
  });

  it('integrates observed evidence and hypothesis confidence before diagnosis', async () => {
    const initial = await repositorySnapshot();
    const fileSystem = new InMemoryFileSystem(initial);
    const now = nextRepositoryTimestamp(initial);
    const evidence = {
      id: 'evidence-live-controls-test',
      claim: 'Live repository controls match policy.',
      method: 'Deterministic comparison.',
      source: 'https://api.github.com/repos/owner/repo/branches/main/protection',
      strength: 0.6,
      limitations: ['One point-in-time external control-plane snapshot.'],
      supportedHypotheses: ['hypothesis-live-stewardship-controls-aligned'],
      falsifiedHypotheses: [],
      verifier: 'test-observer',
      observedAt: now,
      outcome: 'positive' as const,
    };

    const result = await runRepositoryObservation(
      fileSystem,
      new InMemoryExternalData([[evidence]]),
      now,
    );

    expect(result).toEqual({ observedEvidenceIds: [evidence.id], integratedEvidenceIds: [evidence.id] });
    const storedEvidence = JSON.parse(await fileSystem.readText('strategy/evidence.json')) as Array<{ id: string }>;
    expect(storedEvidence.at(-1)?.id).toBe(evidence.id);
    const graph = JSON.parse(await fileSystem.readText('strategy/graph.json')) as Array<{
      id: string; confidence: number; evidenceReferences: string[];
    }>;
    const hypothesis = graph.find((node) => node.id === 'hypothesis-live-stewardship-controls-aligned')!;
    expect(hypothesis.evidenceReferences).toContain(evidence.id);
    expect(hypothesis.confidence).toBeGreaterThan(0.5);
  });

  it('is byte-idempotent when an external snapshot was already integrated', async () => {
    const initial = await repositorySnapshot();
    const fileSystem = new InMemoryFileSystem(initial);
    const evidence = (JSON.parse(initial['strategy/evidence.json']) as Array<Record<string, unknown>>)[0] as never;
    const before = {
      evidence: await fileSystem.readText('strategy/evidence.json'),
      graph: await fileSystem.readText('strategy/graph.json'),
      assessments: await fileSystem.readText('strategy/assessments.json'),
    };

    const result = await runRepositoryObservation(
      fileSystem,
      new InMemoryExternalData([[evidence]]),
      nextRepositoryTimestamp(initial),
    );

    expect(result.integratedEvidenceIds).toEqual([]);
    expect(await fileSystem.readText('strategy/evidence.json')).toBe(before.evidence);
    expect(await fileSystem.readText('strategy/graph.json')).toBe(before.graph);
    expect(await fileSystem.readText('strategy/assessments.json')).toBe(before.assessments);
  });

  it('validates a duplicate snapshot before treating it as idempotent', async () => {
    const initial = await repositorySnapshot();
    const fileSystem = new InMemoryFileSystem(initial);
    const now = nextRepositoryTimestamp(initial);
    const existing = (JSON.parse(initial['strategy/evidence.json']) as Array<Record<string, unknown>>)[0];
    const replay = { ...existing, observedAt: advanceTimestamp(now) } as never;

    await expect(runRepositoryObservation(
      fileSystem,
      new InMemoryExternalData([[replay]]),
      now,
    )).rejects.toThrow(/future/i);

    expect(await fileSystem.readText('strategy/evidence.json')).toBe(initial['strategy/evidence.json']);
    expect(await fileSystem.readText('strategy/graph.json')).toBe(initial['strategy/graph.json']);
  });

  it('exposes an explicit timestamp CLI boundary', async () => {
    const initial = await repositorySnapshot();
    const fileSystem = new InMemoryFileSystem(initial);
    const now = nextRepositoryTimestamp(initial);
    const externalData = new InMemoryExternalData();

    expect(JSON.parse(await runRepositoryObservationCli(fileSystem, externalData, [now])))
      .toEqual({ observedEvidenceIds: [], integratedEvidenceIds: [] });
    await expect(runRepositoryObservationCli(fileSystem, externalData, [])).rejects.toThrow(/usage/i);
    await expect(runRepositoryObservationCli(fileSystem, externalData, [now, now])).rejects.toThrow(/usage/i);
  });
});
