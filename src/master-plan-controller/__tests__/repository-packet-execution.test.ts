import { describe, expect, it } from 'vitest';
import { executeRepositoryPacket, integrateReviewedRepositoryExecution } from '../repository-packet-execution.js';
import { runPacketExecutionCli } from '../cli/execute-packet.js';
import { runReviewedExecutionIntegrationCli } from '../cli/integrate-reviewed-execution.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import { InMemoryFileSystem } from '../testing/in-memory-adapters.js';
import type { FileSystemPort } from '../ports.js';
import { advanceTimestamp, nextRepositoryTimestamp } from './repository-test-time.js';
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

async function snapshot(source: FileSystemPort): Promise<Record<string, string>> {
  const paths = [...STRATEGY_FILES, ...await source.listFiles('plan')];
  const files = await Promise.all(paths.map(async (path) => [path, await source.readText(path)] as const));
  return Object.fromEntries(files);
}

async function executableRepository(): Promise<{ fileSystem: InMemoryFileSystem; now: string }> {
  const source = new NodeFileSystem('.');
  const initial: Record<string, string> = {
    ...await snapshot(source),
    'strategy/results/consciousness-prediction-registry-v1.json':
      await source.readText('strategy/results/consciousness-prediction-registry-v1.json'),
  };
  const packets = JSON.parse(initial['strategy/work-packets.json']) as Array<{ id: string; lifecycle: string }>;
  const executable = packets.find((packet) => packet.id === 'packet-indicator-framework-comparison-v1');
  if (!executable) throw new Error('Indicator comparison packet fixture is missing');
  executable.lifecycle = 'eligible';
  initial['strategy/work-packets.json'] = `${JSON.stringify(packets, null, 2)}\n`;
  return { fileSystem: new InMemoryFileSystem(initial), now: nextRepositoryTimestamp(initial) };
}

async function repositoryWithEligibleTemplate(packetId: string, runtimePacketId = packetId): Promise<{
  fileSystem: InMemoryFileSystem;
  now: string;
}> {
  const source = new NodeFileSystem('.');
  const initial: Record<string, string> = {
    ...await snapshot(source),
    'strategy/results/consciousness-prediction-registry-v1.json':
      await source.readText('strategy/results/consciousness-prediction-registry-v1.json'),
    'strategy/results/preservation-risk-register-v1.json':
      await source.readText('strategy/results/preservation-risk-register-v1.json'),
    'strategy/results/durable-compute-fault-model-v1.json':
      await source.readText('strategy/results/durable-compute-fault-model-v1.json'),
    'strategy/results/institutional-dependency-map-v1.json':
      await source.readText('strategy/results/institutional-dependency-map-v1.json'),
  };
  const now = nextRepositoryTimestamp(initial);
  const templates = JSON.parse(initial['strategy/packet-templates.json']) as Array<Record<string, unknown>>;
  const selected = templates.find((candidate) => candidate.id === packetId);
  if (!selected) throw new Error(`Packet template fixture is missing: ${packetId}`);
  const { trigger: _trigger, recurrence: _recurrence, ...definition } = selected;
  const version = /-v([1-9]\d*)$/.exec(runtimePacketId)?.[1] ?? '1';
  definition.id = runtimePacketId;
  definition.retrySignature = String(definition.retrySignature).replace(/-v1$/, `-v${version}`);
  definition.deliverables = (definition.deliverables as string[])
    .map((deliverable) => deliverable.replace(/-v1$/, `-v${version}`));
  const packets = JSON.parse(initial['strategy/work-packets.json']) as Array<Record<string, unknown>>;
  for (const packet of packets) packet.lifecycle = 'verified';
  packets.push({ ...definition, lifecycle: 'eligible', attempt: 0, reviewedAt: now });
  initial['strategy/work-packets.json'] = `${JSON.stringify(packets, null, 2)}\n`;
  return { fileSystem: new InMemoryFileSystem(initial), now };
}

describe('repository packet execution', () => {
  it('deterministically executes the selected indicator-comparison packet at the supplied timestamp', async () => {
    const { fileSystem, now } = await executableRepository();

    const result = await executeRepositoryPacket(fileSystem, now);

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
    expect(artifact.preparedAt).toBe(now);
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
    expect(execution.evidence[0].observedAt).toBe(now);
    expect(execution.evidence[0].limitations.join(' ')).toMatch(/independent agent review/i);
  });

  it.each([
    {
      packetId: 'packet-preservation-risk-register-refresh-v1',
      artifactPath: 'strategy/results/preservation-risk-register-refresh-v1.json',
      baselinePath: 'strategy/results/preservation-risk-register-v1.json',
      forbiddenScope: 'performsExternalIntervention',
    },
    {
      packetId: 'packet-durable-compute-fault-model-extension-v1',
      artifactPath: 'strategy/results/durable-compute-fault-model-extension-v1.json',
      baselinePath: 'strategy/results/durable-compute-fault-model-v1.json',
      forbiddenScope: 'operatesHardware',
    },
    {
      packetId: 'packet-institutional-dependency-map-refresh-v1',
      artifactPath: 'strategy/results/institutional-dependency-map-refresh-v1.json',
      baselinePath: 'strategy/results/institutional-dependency-map-v1.json',
      forbiddenScope: 'changesGovernance',
    },
  ])('executes $packetId through a deterministic bounded production handler', async ({
    packetId, artifactPath, baselinePath, forbiddenScope,
  }) => {
    const { fileSystem, now } = await repositoryWithEligibleTemplate(packetId);

    const execution = await executeRepositoryPacket(fileSystem, now);

    expect(execution).toEqual({
      status: 'executed',
      packetId,
      artifactPath,
      resultPath: artifactPath.replace(/\.json$/, '.result.json'),
    });
    const artifact = JSON.parse(await fileSystem.readText(artifactPath)) as {
      packetId: string;
      preparedAt: string;
      baselineArtifact: string;
      scope: Record<string, boolean>;
      findings: unknown[];
    };
    expect(artifact).toMatchObject({ packetId, preparedAt: now, baselineArtifact: baselinePath });
    expect(artifact.scope[forbiddenScope]).toBe(false);
    expect(artifact.findings.length).toBeGreaterThan(0);
    const result = JSON.parse(await fileSystem.readText(execution.resultPath!)) as {
      outcome: string;
      verification?: unknown;
      evidence: Array<{ observedAt: string; limitations: string[] }>;
    };
    expect(['positive', 'negative', 'null']).toContain(result.outcome);
    expect(result.verification).toBeUndefined();
    expect(result.evidence[0].observedAt).toBe(now);
    expect(result.evidence[0].limitations.join(' ')).toMatch(/agent review/i);
  });

  it('routes a later recurring packet version to its family executor and versioned artifacts', async () => {
    const templateId = 'packet-preservation-risk-register-refresh-v1';
    const packetId = 'packet-preservation-risk-register-refresh-v2';
    const { fileSystem, now } = await repositoryWithEligibleTemplate(templateId, packetId);

    const execution = await executeRepositoryPacket(fileSystem, now);

    expect(execution).toEqual({
      status: 'executed',
      packetId,
      artifactPath: 'strategy/results/preservation-risk-register-refresh-v2.json',
      resultPath: 'strategy/results/preservation-risk-register-refresh-v2.result.json',
    });
  });

  it('advances the durable-compute fault class and stress level across recurring versions', async () => {
    const templateId = 'packet-durable-compute-fault-model-extension-v1';
    const first = await repositoryWithEligibleTemplate(templateId);
    const second = await repositoryWithEligibleTemplate(
      templateId,
      'packet-durable-compute-fault-model-extension-v2',
    );

    const firstExecution = await executeRepositoryPacket(first.fileSystem, first.now);
    const secondExecution = await executeRepositoryPacket(second.fileSystem, second.now);
    const firstArtifact = JSON.parse(await first.fileSystem.readText(firstExecution.artifactPath!)) as {
      preregistration: { faultClass: string; injectedDelayMs: number };
    };
    const secondArtifact = JSON.parse(await second.fileSystem.readText(secondExecution.artifactPath!)) as {
      preregistration: { faultClass: string; injectedDelayMs: number };
    };

    expect(secondArtifact.preregistration.faultClass).not.toBe(firstArtifact.preregistration.faultClass);
    expect(secondArtifact.preregistration.injectedDelayMs)
      .toBeGreaterThan(firstArtifact.preregistration.injectedDelayMs);
  });

  it('is byte-idempotent after the execution artifacts exist', async () => {
    const { fileSystem, now } = await executableRepository();
    const first = await executeRepositoryPacket(fileSystem, now);
    const artifact = await fileSystem.readText(first.artifactPath!);
    const execution = await fileSystem.readText(first.resultPath!);

    const second = await executeRepositoryPacket(fileSystem, advanceTimestamp(now));

    expect(second).toEqual({ status: 'already-executed', packetId: first.packetId, artifactPath: first.artifactPath, resultPath: first.resultPath });
    expect(await fileSystem.readText(first.artifactPath!)).toBe(artifact);
    expect(await fileSystem.readText(first.resultPath!)).toBe(execution);
  });

  it('fails closed without writes when the selected packet has no registered executor', async () => {
    const { fileSystem, now } = await executableRepository();
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<Record<string, unknown>>;
    const selected = packets.find((packet) => packet.id === 'packet-indicator-framework-comparison-v1')!;
    selected.id = 'packet-unsupported';
    selected.retrySignature = 'unsupported';
    await fileSystem.writeText('strategy/work-packets.json', `${JSON.stringify(packets, null, 2)}\n`);
    const before = await fileSystem.listFiles('strategy/results/');

    await expect(executeRepositoryPacket(fileSystem, now)).rejects.toThrow(/no executor.*packet-unsupported/i);

    expect(await fileSystem.listFiles('strategy/results/')).toEqual(before);
  });

  it('rejects invalid caller timestamps before writing', async () => {
    const { fileSystem } = await executableRepository();
    const before = await fileSystem.listFiles('strategy/results/');

    await expect(executeRepositoryPacket(fileSystem, 'invalid')).rejects.toThrow(/timestamp/i);

    expect(await fileSystem.listFiles('strategy/results/')).toEqual(before);
  });

  it('exposes only an explicit timestamp through the injected CLI boundary', async () => {
    const { fileSystem, now } = await executableRepository();

    expect(JSON.parse(await runPacketExecutionCli(fileSystem, [now]))).toMatchObject({
      status: 'executed',
      packetId: 'packet-indicator-framework-comparison-v1',
    });
    await expect(runPacketExecutionCli(fileSystem, [])).rejects.toThrow(/usage.*timestamp/i);
    await expect(runPacketExecutionCli(fileSystem, [now, 'extra'])).rejects.toThrow(/usage.*timestamp/i);
  });

  it('binds an exact-head agent attestation before integrating the reviewed result', async () => {
    const { fileSystem, now } = await executableRepository();
    const execution = await executeRepositoryPacket(fileSystem, now);
    const reviewedAt = advanceTimestamp(now);
    const integratedAt = advanceTimestamp(reviewedAt);

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
    const { fileSystem, now } = await executableRepository();
    const execution = await executeRepositoryPacket(fileSystem, now);
    const resultBefore = await fileSystem.readText(execution.resultPath!);

    await expect(integrateReviewedRepositoryExecution(fileSystem, {
      packetId: execution.packetId!,
      resultPath: execution.resultPath!,
      reviewer: '',
      reviewRunId: 'not-a-run',
      reviewedHeadSha: 'not-a-sha',
      reviewedAt: advanceTimestamp(now, 2),
    }, advanceTimestamp(now))).rejects.toThrow(/attestation/i);

    expect(await fileSystem.readText(execution.resultPath!)).toBe(resultBefore);
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<{ id: string; lifecycle: string }>;
    expect(packets.find((packet) => packet.id === execution.packetId)?.lifecycle).toBe('eligible');
  });

  it('accepts explicit review provenance through the injected integration CLI', async () => {
    const { fileSystem, now } = await executableRepository();
    const execution = await executeRepositoryPacket(fileSystem, now);
    const reviewedAt = advanceTimestamp(now);
    const integratedAt = advanceTimestamp(reviewedAt);
    const output = await runReviewedExecutionIntegrationCli(fileSystem, [
      execution.packetId!, execution.resultPath!, 'github-hosted-agent-review', '42',
      'abcdefabcdefabcdefabcdefabcdefabcdefabcd', reviewedAt, integratedAt,
    ]);

    expect(output).toContain(execution.packetId!);
    expect(output).toContain('packet-verified');
    await expect(runReviewedExecutionIntegrationCli(fileSystem, [])).rejects.toThrow(/usage/i);
  });
});
