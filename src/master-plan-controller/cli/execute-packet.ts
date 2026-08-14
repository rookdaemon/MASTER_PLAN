import type { FileSystemPort } from '../ports.js';
import { executeRepositoryPacket } from '../repository-packet-execution.js';
import type { Timestamp } from '../types.js';

export async function runPacketExecutionCli(
  fileSystem: FileSystemPort,
  args: readonly string[],
): Promise<string> {
  const [now, ...extra] = args;
  if (!now || extra.length > 0 || Number.isNaN(Date.parse(now))) {
    throw new Error('Usage: strategy:execute <ISO timestamp>');
  }
  return JSON.stringify(await executeRepositoryPacket(fileSystem, now as Timestamp));
}
