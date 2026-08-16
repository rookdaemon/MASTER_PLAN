import { waitForPullRequestMerge } from '../await-pr-merge.js';
import { NodeProcess, NodeScheduler } from '../runtime-adapters.js';
import { NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  try {
    const [pullRequest, repository, attemptsInput, delayInput] = cli.arguments();
    const result = await waitForPullRequestMerge(new NodeProcess(), new NodeScheduler(), {
      pullRequest: pullRequest ?? '',
      repository: repository ?? '',
      maximumAttempts: Number(attemptsInput),
      delayMs: Number(delayInput),
    });
    cli.write(JSON.stringify(result));
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
