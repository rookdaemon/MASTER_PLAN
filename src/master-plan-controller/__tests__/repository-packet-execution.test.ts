import { describe, expect, it } from 'vitest';
import { executeRepositoryPacket } from '../repository-packet-execution.js';
import { runPacketExecutionCli } from '../cli/execute-packet.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import { InMemoryFileSystem } from '../testing/in-memory-adapters.js';
import type { FileSystemPort } from '../ports.js';
import { advanceTimestamp, nextRepositoryTimestamp } from './repository-test-time.js';
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
] as const;

async function snapshot(source: FileSystemPort): Promise<Record<string, string>> {
  const paths = [...STRATEGY_FILES, ...await source.listFiles('docs')];
  const files = await Promise.all(paths.map(async (path) => [path, await source.readText(path)] as const));
  return Object.fromEntries(files);
}

async function executableRepository(): Promise<{ fileSystem: InMemoryFileSystem; now: string }> {
  return repositoryWithEligibleTemplate('packet-indicator-framework-comparison');
}

async function repositoryWithEligibleTemplate(seriesId: string, runtimePacketId = `${seriesId}-run-1`): Promise<{
  fileSystem: InMemoryFileSystem;
  now: string;
}> {
  const source = new NodeFileSystem('.');
  const initial: Record<string, string> = {
    ...await snapshot(source),
    'strategy/findings/consciousness-assessment.json':
      await source.readText('strategy/findings/consciousness-assessment.json'),
    'strategy/findings/preservation-risks.json':
      await source.readText('strategy/findings/preservation-risks.json'),
    'strategy/findings/durable-compute.json':
      await source.readText('strategy/findings/durable-compute.json'),
    'strategy/findings/institutional-continuity.json':
      await source.readText('strategy/findings/institutional-continuity.json'),
  };
  const now = nextRepositoryTimestamp(initial);
  const templates = JSON.parse(initial['strategy/packet-templates.json']) as Array<Record<string, unknown>>;
  const selected = templates.find((candidate) => candidate.id === seriesId);
  if (!selected) throw new Error(`Packet template fixture is missing: ${seriesId}`);
  const { trigger: _trigger, recurrence: _recurrence, ...definition } = selected;
  const runNumber = Number(/-run-([1-9]\d*)$/.exec(runtimePacketId)?.[1] ?? '1');
  definition.id = runtimePacketId;
  definition.seriesId = seriesId;
  definition.runNumber = runNumber;
  definition.retrySignature = `${String(definition.retrySignature)}-run-${runNumber}`;
  definition.deliverables = (definition.deliverables as string[])
    .map((deliverable) => `${deliverable}-run-${runNumber}`);
  // Replace a live instance of this template, if present, with the controlled eligible fixture below.
  const packets: Array<Record<string, unknown>> =
    (JSON.parse(initial['strategy/work-packets.json']) as Array<Record<string, unknown>>)
    .filter((packet) => packet.id !== runtimePacketId)
    .map((packet) => ({ ...packet, lifecycle: 'verified' }));
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
      packetId: 'packet-indicator-framework-comparison-run-1',
      artifactPath: 'strategy/results/indicator-framework-comparison-run-1.json',
      resultPath: 'strategy/results/indicator-framework-comparison-run-1.result.json',
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
    expect(artifact.sourceRegistry).toBe('strategy/findings/consciousness-assessment.json');
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
      verification: { status: string; verifier: string; reviewedAt: string };
      artifactReferences: string[];
      evidence: Array<{ observedAt: string; limitations: string[] }>;
    };
    expect(execution.verification).toEqual({
      status: 'passed', verifier: 'deterministic-repository-executor', reviewedAt: now,
    });
    expect(execution.artifactReferences).toContain(result.artifactPath);
    expect(execution.evidence[0].observedAt).toBe(now);
    expect(execution.evidence[0].limitations.join(' ')).toMatch(/repository artifact|real-world outcome/i);
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<{
      id: string; lifecycle: string;
    }>;
    expect(packets.find((packet) => packet.id === result.packetId)?.lifecycle).toBe('verified');
  });

  it.each([
    {
      packetId: 'packet-preservation-mitigation-tabletop',
      artifactPath: 'strategy/results/preservation-mitigation-tabletop-run-1.json',
      baselinePath: 'strategy/findings/preservation-risks.json',
      forbiddenScope: 'performsExternalIntervention',
    },
    {
      packetId: 'packet-preservation-risk-register-refresh',
      artifactPath: 'strategy/results/preservation-risk-register-refresh-run-1.json',
      baselinePath: 'strategy/findings/preservation-risks.json',
      forbiddenScope: 'performsExternalIntervention',
    },
    {
      packetId: 'packet-durable-compute-fault-model-extension',
      artifactPath: 'strategy/results/durable-compute-fault-model-extension-run-1.json',
      baselinePath: 'strategy/findings/durable-compute.json',
      forbiddenScope: 'operatesHardware',
    },
    {
      packetId: 'packet-institutional-dependency-map-refresh',
      artifactPath: 'strategy/results/institutional-dependency-map-refresh-run-1.json',
      baselinePath: 'strategy/findings/institutional-continuity.json',
      forbiddenScope: 'changesGovernance',
    },
  ])('executes $packetId through a deterministic bounded production handler', async ({
    packetId, artifactPath, baselinePath, forbiddenScope,
  }) => {
    const { fileSystem, now } = await repositoryWithEligibleTemplate(packetId);
    const runtimePacketId = `${packetId}-run-1`;

    const execution = await executeRepositoryPacket(fileSystem, now);

    expect(execution).toEqual({
      status: 'executed',
      packetId: runtimePacketId,
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
    expect(artifact).toMatchObject({ packetId: runtimePacketId, preparedAt: now, baselineArtifact: baselinePath });
    expect(artifact.scope[forbiddenScope]).toBe(false);
    expect(artifact.findings.length).toBeGreaterThan(0);
    const result = JSON.parse(await fileSystem.readText(execution.resultPath!)) as {
      outcome: string;
      verification: { status: string; verifier: string; reviewedAt: string };
      evidence: Array<{ observedAt: string; limitations: string[] }>;
    };
    expect(['positive', 'negative', 'null']).toContain(result.outcome);
    expect(result.verification).toEqual({
      status: 'passed', verifier: 'deterministic-repository-executor', reviewedAt: now,
    });
    expect(result.evidence[0].observedAt).toBe(now);
      expect(result.evidence[0].limitations.join(' ')).toMatch(/artifact|simulation|external|physical|observed|supplied/i);
  });

  it('routes a later explicitly numbered run to its family executor', async () => {
    const templateId = 'packet-preservation-risk-register-refresh';
    const packetId = 'packet-preservation-risk-register-refresh-run-2';
    const { fileSystem, now } = await repositoryWithEligibleTemplate(templateId, packetId);

    const execution = await executeRepositoryPacket(fileSystem, now);

    expect(execution).toEqual({
      status: 'executed',
      packetId,
      artifactPath: 'strategy/results/preservation-risk-register-refresh-run-2.json',
      resultPath: 'strategy/results/preservation-risk-register-refresh-run-2.result.json',
    });
  });

  it('advances the durable-compute fault class and stress level across recurring runs', async () => {
    const templateId = 'packet-durable-compute-fault-model-extension';
    const first = await repositoryWithEligibleTemplate(templateId);
    const second = await repositoryWithEligibleTemplate(
      templateId,
      'packet-durable-compute-fault-model-extension-run-2',
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

  it('does not re-execute a packet after deterministic integration', async () => {
    const { fileSystem, now } = await executableRepository();
    const first = await executeRepositoryPacket(fileSystem, now);
    const artifact = await fileSystem.readText(first.artifactPath!);
    const execution = await fileSystem.readText(first.resultPath!);

    const second = await executeRepositoryPacket(fileSystem, advanceTimestamp(now));

    expect(second).toEqual({ status: 'waiting', packetId: null, artifactPath: null, resultPath: null });
    expect(await fileSystem.readText(first.artifactPath!)).toBe(artifact);
    expect(await fileSystem.readText(first.resultPath!)).toBe(execution);
  });

  it('fails closed without writes when the selected packet has no registered executor', async () => {
    const { fileSystem, now } = await executableRepository();
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<Record<string, unknown>>;
    const selected = packets.find((packet) => packet.id === 'packet-indicator-framework-comparison-run-1')!;
    selected.id = 'packet-unsupported';
    delete selected.seriesId;
    delete selected.runNumber;
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
      packetId: 'packet-indicator-framework-comparison-run-1',
    });
    await expect(runPacketExecutionCli(fileSystem, [])).rejects.toThrow(/usage.*timestamp/i);
    await expect(runPacketExecutionCli(fileSystem, [now, 'extra'])).rejects.toThrow(/usage.*timestamp/i);
  });

});
