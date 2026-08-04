import { describe, expect, it } from 'vitest';
import { runRepositoryCandidateGeneration } from '../repository-candidate-generation.js';
import { runCandidateGenerationCli } from '../cli/generate-candidates.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import { InMemoryFileSystem } from '../testing/in-memory-adapters.js';
import { advanceTimestamp, nextRepositoryTimestamp } from './repository-test-time.js';

async function repositorySnapshot(): Promise<Record<string, string>> {
  const source = new NodeFileSystem('.');
  const paths = [
    ...(await source.listFiles('strategy/')),
    ...(await source.listFiles('plan/')),
  ];
  const snapshot = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await source.readText(path)])));
  snapshot['strategy/work-packets.json'] = `${JSON.stringify(
    (JSON.parse(snapshot['strategy/work-packets.json']) as Array<{ id: string }>).filter((packet) =>
      packet.id !== 'packet-indicator-framework-comparison-v1'),
    null,
    2,
  )}\n`;
  snapshot['strategy/audit-log.json'] = `${JSON.stringify(
    (JSON.parse(snapshot['strategy/audit-log.json']) as Array<{ packetId?: string }>).filter((event) =>
      event.packetId !== 'packet-indicator-framework-comparison-v1'),
    null,
    2,
  )}\n`;
  return snapshot;
}

describe('repository candidate generation', () => {
  it('persists and audits a deterministic candidate using only the caller timestamp', async () => {
    const initial = await repositorySnapshot();
    const fileSystem = new InMemoryFileSystem(initial);
    const now = nextRepositoryTimestamp(initial);

    const result = await runRepositoryCandidateGeneration(fileSystem, now);

    expect(result).toEqual({
      generatedPacketIds: ['packet-indicator-framework-comparison-v1'],
      selectedPacketId: 'packet-indicator-framework-comparison-v1',
    });
    const packets = JSON.parse(await fileSystem.readText('strategy/work-packets.json')) as Array<{
      id: string; lifecycle: string; reviewedAt: string;
    }>;
    expect(packets.at(-1)).toMatchObject({
      id: 'packet-indicator-framework-comparison-v1', lifecycle: 'eligible', reviewedAt: now,
    });
    const audit = JSON.parse(await fileSystem.readText('strategy/audit-log.json')) as Array<{
      type: string; packetId: string; occurredAt: string;
    }>;
    expect(audit.at(-1)).toMatchObject({
      type: 'packet-generated', packetId: 'packet-indicator-framework-comparison-v1', occurredAt: now,
    });
    const originalPacketPrefix = initial['strategy/work-packets.json'].trimEnd().slice(0, -1).trimEnd();
    expect((await fileSystem.readText('strategy/work-packets.json')).slice(0, originalPacketPrefix.length))
      .toBe(originalPacketPrefix);
  });

  it('is idempotent while executable persisted work exists', async () => {
    const initial = await repositorySnapshot();
    const fileSystem = new InMemoryFileSystem(initial);
    const now = nextRepositoryTimestamp(initial);
    await runRepositoryCandidateGeneration(fileSystem, now);
    const packetsAfterFirst = await fileSystem.readText('strategy/work-packets.json');
    const auditAfterFirst = await fileSystem.readText('strategy/audit-log.json');

    const second = await runRepositoryCandidateGeneration(fileSystem, advanceTimestamp(now));

    expect(second).toEqual({ generatedPacketIds: [], selectedPacketId: 'packet-indicator-framework-comparison-v1' });
    expect(await fileSystem.readText('strategy/work-packets.json')).toBe(packetsAfterFirst);
    expect(await fileSystem.readText('strategy/audit-log.json')).toBe(auditAfterFirst);
  });

  it('rejects an invalid supplied timestamp before writing', async () => {
    const initial = await repositorySnapshot();
    const fileSystem = new InMemoryFileSystem(initial);
    await expect(runRepositoryCandidateGeneration(fileSystem, 'not-a-timestamp')).rejects.toThrow(/timestamp/i);
    expect(await fileSystem.readText('strategy/work-packets.json')).toBe(initial['strategy/work-packets.json']);
    expect(await fileSystem.readText('strategy/audit-log.json')).toBe(initial['strategy/audit-log.json']);
  });

  it('exposes an explicit-timestamp CLI boundary', async () => {
    const fileSystem = new InMemoryFileSystem(await repositorySnapshot());
    const now = nextRepositoryTimestamp(await repositorySnapshot());
    expect(JSON.parse(await runCandidateGenerationCli(fileSystem, [now]))).toMatchObject({
      generatedPacketIds: ['packet-indicator-framework-comparison-v1'],
    });
    await expect(runCandidateGenerationCli(fileSystem, [])).rejects.toThrow(/usage/i);
    await expect(runCandidateGenerationCli(fileSystem, [now, now])).rejects.toThrow(/usage/i);
  });
});
