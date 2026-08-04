import type { FileSystemPort } from '../ports.js';
import { runRepositoryCandidateGeneration } from '../repository-candidate-generation.js';
import type { Timestamp } from '../types.js';

export async function runCandidateGenerationCli(
  fileSystem: FileSystemPort,
  args: readonly string[],
): Promise<string> {
  const [now, ...extra] = args;
  if (!now || extra.length > 0 || Number.isNaN(Date.parse(now))) {
    throw new Error('Usage: strategy:generate <ISO timestamp>');
  }
  const result = await runRepositoryCandidateGeneration(fileSystem, now as Timestamp);
  return JSON.stringify(result);
}
