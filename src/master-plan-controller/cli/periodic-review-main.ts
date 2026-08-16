import { loadRepositoryStrategy, verifyRepositoryStrategy } from '../repository-strategy.js';
import { NodeFileSystem } from '../runtime-adapters.js';
import { runPeriodicReviewCli } from './periodic-review.js';
import { NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const fileSystem = new NodeFileSystem(cli.environment('GITHUB_WORKSPACE') ?? '.');
  try {
    const args = cli.arguments();
    const now = args[1];
    if (!now) throw new Error('Usage: strategy:review <weekly|quarterly> <ISO timestamp>');
    const bundle = await loadRepositoryStrategy(fileSystem);
    const verification = await verifyRepositoryStrategy(fileSystem, bundle, now);
    if (verification.errors.length > 0) {
      throw new Error(`Strategy verification failed: ${verification.errors.join('; ')}`);
    }
    cli.write(await runPeriodicReviewCli(fileSystem, bundle.state, bundle.config, args));
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
