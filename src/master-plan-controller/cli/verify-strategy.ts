import { loadRepositoryStrategy, verifyRepositoryStrategy } from '../repository-strategy.js';
import { NodeFileSystem, SystemClock } from '../runtime-adapters.js';
import { NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const fileSystem = new NodeFileSystem(cli.environment('GITHUB_WORKSPACE') ?? '.');
  const now = new SystemClock().now();
  try {
    const bundle = await loadRepositoryStrategy(fileSystem);
    const report = await verifyRepositoryStrategy(fileSystem, bundle, now);
    if (report.errors.length > 0) {
      for (const error of report.errors) cli.writeError(error);
      cli.fail();
      return;
    }
    cli.write(`strategy verified: ${report.researchAreaCount} research areas at ${report.verifiedAt}`);
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
