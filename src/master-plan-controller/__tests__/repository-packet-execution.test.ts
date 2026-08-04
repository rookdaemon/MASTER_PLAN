import { describe, expect, it } from 'vitest';
import { runRepositoryCandidateGeneration } from '../repository-candidate-generation.js';
import { executeRepositoryPacket, integrateReviewedRepositoryExecution } from '../repository-packet-execution.js';
import { runPacketExecutionCli } from '../cli/execute-packet.js';
import { runReviewedExecutionIntegrationCli } from '../cli/integrate-reviewed-execution.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import { InMemoryFileSystem } from '../testing/in-memory-adapters.js';
import type { FileSystemPort } from '../ports.js';

const NOW = '2026-08-04T03:00:00.000Z';
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
  'strategy/ROADMAP.md',
  'STATUS.md',
] as const;

async function snapshot(source: FileSystemPort): Promise<Record<string, string>> {
  const paths = [...STRATEGY_FILES, ...await source.listFiles('plan')];
  const files = await Promise.all(paths.map(async (path) => [path, await source.readText(path)] as const));
  return Object.fromEntries(files);
}

async function executableRepository(): Promise<InMemoryFileSystem> {
  const source = new NodeFileSystem('.');
  const fileSystem = new InMemoryFileSystem({
    ...await snapshot(source),
    'strategy/results/consciousness-prediction-registry-v1.json':
      await source.readText('strategy/results/consciousness-prediction-registry-v1.json'),
  });
  await runRepositoryCandidateGeneration(fileSystem, NOW);
  return fileSystem;
}

describe('repository packet execution', () => {
  it('deterministically executes the selected indicator-comparison packet at the supplied timestamp', async () => {
    const fileSystem = await executableRepository();

    const result = await executeRepositoryPacket(fileSystem, NOW);

    expect(result).toEqual({
      status: 'executed',
      packetId: 'packet-indicator-framework-comparison-v1',
      artifactPath: 'strategy/results/indicator-framework-comparison-v1.json',
      resultPath: 'strategy/results/indicator-framework-comparison-v1.result.json',
    });
    const artifact = JSON.parse(await fileSystem.readText(result.artifactPath!)) as {
      preparedAt: string;
      sourceRegistry: string;
      indicators: Array<{
        predictionId: string;
        theoryId: string;
        counterexamples: string[];
        uncertainty: string[];
        falsificationCondition: string;
        sourceIds: string[];
      }>;
    };
    expect(artifact.preparedAt).toBe(NOW);
    expect(artifact.sourceRegistry).toBe('strategy/results/consciousness-prediction-registry-v1.json');
    expect(artifact.indicators.length).toBeGreaterThan(0);
    for (const indicator of artifact.indicators) {
      expect(indicator.predictionId).not.toBe('');
      expect(indicator.theoryId).not.toBe('');
      expect(indicator.counterexamples.length).toBeGreaterThan(0);
      expect(indicator.uncertainty.length).toBeGreaterThan(0);
      expect(indicator.falsificationCondition).not.toBe('');
      expect(indicator.sourceIds.length).toBeGreaterThan(0);
    }
    const execution = JSON.parse(await fileSystem.readText(result.resultPath!)) as {
      verification?: unknown;
      artifactReferences: string[];
      evidence: Array<{ observedAt: string; limitations: string[] }>;
    };
    expect(execution.verification).toBeUndefined();
    expect(execution.artifactReferences).toContain(result.artifactPath);
    expect(execution.evidence[0].observedAt).toBe(NOW);
    expect(execution.evidence[0].limitations.join(' ')).toMatch(/independent agent review/i);
  });

  it('is byte-idempotent after the execution artifacts exist', async () => {
    const fileSystem = await executableRepository();
    const first = await executeRepositoryPacket(fileSystem, NOW);
    const artifact = await fileSystem.readText(first.artifactPath!);
    const execution = await fileSystem.readText(first.resultPath!);

    const second = await executeRepositoryPacket(fileSystem, '2026-08-04T03:30:00.000Z');

    expect(second).toEqual({ status: 'already-executed', packetId: first.packetId, artifactPath: first.artifactPath, resultPath: first.resultPath });
    expect(await fileSystem.readText(first.artifactPath!)).toBe(artifact);
    expect(await fileSystem.readText(first.resultPath!)).toBe(execution);
  });

  it('fails closed without writes when the selected packet has no registered executor', async () => {
    const fileSystem = await executableRepository();
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<Record<string, unknown>>;
    const selected = packets.find((packet) => packet.id === 'packet-indicator-framework-comparison-v1')!;
    selected.id = 'packet-unsupported';
    selected.retrySignature = 'unsupported';
    await fileSystem.writeText('strategy/work-packets.json', `${JSON.stringify(packets, null, 2)}\n`);
    const before = await fileSystem.listFiles('strategy/results/');

    await expect(executeRepositoryPacket(fileSystem, NOW)).rejects.toThrow(/no executor.*packet-unsupported/i);

    expect(await fileSystem.listFiles('strategy/results/')).toEqual(before);
  });

  it('rejects invalid caller timestamps before writing', async () => {
    const fileSystem = await executableRepository();
    const before = await fileSystem.listFiles('strategy/results/');

    await expect(executeRepositoryPacket(fileSystem, 'invalid')).rejects.toThrow(/timestamp/i);

    expect(await fileSystem.listFiles('strategy/results/')).toEqual(before);
  });

  it('exposes only an explicit timestamp through the injected CLI boundary', async () => {
    const fileSystem = await executableRepository();

    expect(JSON.parse(await runPacketExecutionCli(fileSystem, [NOW]))).toMatchObject({
      status: 'executed',
      packetId: 'packet-indicator-framework-comparison-v1',
    });
    await expect(runPacketExecutionCli(fileSystem, [])).rejects.toThrow(/usage.*timestamp/i);
    await expect(runPacketExecutionCli(fileSystem, [NOW, 'extra'])).rejects.toThrow(/usage.*timestamp/i);
  });

  it('binds an exact-head agent attestation before integrating the reviewed result', async () => {
    const fileSystem = await executableRepository();
    const execution = await executeRepositoryPacket(fileSystem, NOW);
    const reviewedAt = '2026-08-04T03:04:00.000Z';
    const integratedAt = '2026-08-04T03:05:00.000Z';

    const integrated = await integrateReviewedRepositoryExecution(fileSystem, {
      packetId: execution.packetId!,
      resultPath: execution.resultPath!,
      reviewer: 'github-hosted-agent-review',
      reviewRunId: '30872448965',
      reviewedHeadSha: '0123456789abcdef0123456789abcdef01234567',
      reviewedAt,
    }, integratedAt);

    expect(integrated.event.type).toBe('packet-verified');
    const result = JSON.parse(await fileSystem.readText(execution.resultPath!)) as {
      verification: { status: string; verifier: string; reviewedAt: string };
      evidence: Array<{ verifier: string }>;
    };
    expect(result.verification).toEqual({
      status: 'passed',
      verifier: 'github-hosted-agent-review:run:30872448965:head:0123456789abcdef0123456789abcdef01234567',
      reviewedAt,
    });
    expect(result.evidence.every((record) => record.verifier === result.verification.verifier)).toBe(true);
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<{ id: string; lifecycle: string }>;
    expect(packets.find((packet) => packet.id === execution.packetId)?.lifecycle).toBe('verified');
  });

  it('rejects malformed or future review attestations before integration', async () => {
    const fileSystem = await executableRepository();
    const execution = await executeRepositoryPacket(fileSystem, NOW);
    const resultBefore = await fileSystem.readText(execution.resultPath!);

    await expect(integrateReviewedRepositoryExecution(fileSystem, {
      packetId: execution.packetId!,
      resultPath: execution.resultPath!,
      reviewer: '',
      reviewRunId: 'not-a-run',
      reviewedHeadSha: 'not-a-sha',
      reviewedAt: '2026-08-04T04:00:00.000Z',
    }, '2026-08-04T03:05:00.000Z')).rejects.toThrow(/attestation/i);

    expect(await fileSystem.readText(execution.resultPath!)).toBe(resultBefore);
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<{ id: string; lifecycle: string }>;
    expect(packets.find((packet) => packet.id === execution.packetId)?.lifecycle).toBe('eligible');
  });

  it('accepts explicit review provenance through the injected integration CLI', async () => {
    const fileSystem = await executableRepository();
    const execution = await executeRepositoryPacket(fileSystem, NOW);
    const output = await runReviewedExecutionIntegrationCli(fileSystem, [
      execution.packetId!, execution.resultPath!, 'github-hosted-agent-review', '42',
      'abcdefabcdefabcdefabcdefabcdefabcdefabcd', '2026-08-04T03:04:00.000Z',
      '2026-08-04T03:05:00.000Z',
    ]);

    expect(output).toContain(execution.packetId!);
    expect(output).toContain('packet-verified');
    await expect(runReviewedExecutionIntegrationCli(fileSystem, [])).rejects.toThrow(/usage/i);
  });
});
