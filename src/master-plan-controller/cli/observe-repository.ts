import type { ExternalDataPort, FileSystemPort } from '../ports.js';
import { runRepositoryObservation } from '../repository-observation.js';
import type { Timestamp } from '../types.js';

export async function runRepositoryObservationCli(
  fileSystem: FileSystemPort,
  externalData: ExternalDataPort,
  args: readonly string[],
): Promise<string> {
  const [now, ...extra] = args;
  if (!now || extra.length > 0 || Number.isNaN(Date.parse(now))) {
    throw new Error('Usage: strategy:observe <ISO timestamp>');
  }
  return JSON.stringify(await runRepositoryObservation(fileSystem, externalData, now as Timestamp));
}
