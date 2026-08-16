import type { FileSystemPort } from '../ports.js';
import { integrateReviewedRepositoryExecution } from '../repository-packet-execution.js';
import type { Timestamp } from '../types.js';

export async function runReviewedExecutionIntegrationCli(
  fileSystem: FileSystemPort,
  args: readonly string[],
): Promise<string> {
  const [packetId, resultPath, reviewer, reviewRunId, reviewedHeadSha, reviewedAt, now, ...extra] = args;
  if (!packetId || !resultPath || !reviewer || !reviewRunId || !reviewedHeadSha || !reviewedAt || !now ||
    extra.length > 0 || Number.isNaN(Date.parse(reviewedAt)) || Number.isNaN(Date.parse(now))) {
    throw new Error('Usage: strategy:integrate-reviewed-execution <packet-id> <result-path> <reviewer> <review-run-id> <reviewed-head-sha> <reviewed-at> <integration-timestamp>');
  }
  const integrated = await integrateReviewedRepositoryExecution(fileSystem, {
    packetId,
    resultPath,
    reviewer,
    reviewRunId,
    reviewedHeadSha,
    reviewedAt: reviewedAt as Timestamp,
  }, now as Timestamp);
  return `Integrated reviewed execution ${packetId} as ${integrated.event.type} at ${now}`;
}
