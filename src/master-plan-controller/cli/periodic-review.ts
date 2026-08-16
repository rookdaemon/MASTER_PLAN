import type { FileSystemPort } from '../ports.js';
import { runRepositoryPeriodicReview, type PeriodicReviewCadence } from '../periodic-review.js';
import type { ControllerConfig, StrategyState } from '../types.js';

export async function runPeriodicReviewCli(
  fileSystem: FileSystemPort,
  state: StrategyState,
  config: ControllerConfig,
  args: readonly string[],
): Promise<string> {
  const [cadence, now, ...extra] = args;
  if ((cadence !== 'weekly' && cadence !== 'quarterly') || !now || extra.length > 0 || Number.isNaN(Date.parse(now))) {
    throw new Error('Usage: strategy:review <weekly|quarterly> <ISO timestamp>');
  }
  return JSON.stringify(await runRepositoryPeriodicReview(
    fileSystem, state, config, cadence as PeriodicReviewCadence, now,
  ));
}
