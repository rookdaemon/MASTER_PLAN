import type { FileSystemPort } from '../ports.js';
import { integrateRepositoryPacketResult } from '../repository-result-integration.js';
import type { PacketResult, Timestamp } from '../types.js';

export async function runRepositoryResultIntegration(
  fileSystem: FileSystemPort,
  args: readonly string[],
): Promise<string> {
  const [packetId, resultPath, now, ...extra] = args;
  if (!packetId || !resultPath || !now || extra.length > 0 || Number.isNaN(Date.parse(now))) {
    throw new Error('Usage: strategy:integrate-result <packet-id> <result-json-path> <ISO timestamp>');
  }
  const result = JSON.parse(await fileSystem.readText(resultPath)) as PacketResult;
  const integrated = await integrateRepositoryPacketResult(fileSystem, packetId, result, now as Timestamp);
  return `Integrated ${packetId} as ${integrated.event.type} at ${now}`;
}
