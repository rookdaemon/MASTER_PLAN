import {
  CompositeExternalData,
  GitHubRepositoryControlObserver,
  loadRepositoryControlObservationConfigs,
} from '../repository-observation.js';
import { FetchNetwork, NodeFileSystem } from '../runtime-adapters.js';
import { runRepositoryObservationCli } from './observe-repository.js';
import { NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const fileSystem = new NodeFileSystem(cli.environment('GITHUB_WORKSPACE') ?? '.');
  try {
    const repository = cli.environment('GITHUB_REPOSITORY');
    if (!repository) throw new Error('GITHUB_REPOSITORY is required');
    const network = new FetchNetwork();
    const configs = await loadRepositoryControlObservationConfigs(fileSystem, repository);
    const externalData = new CompositeExternalData(
      configs.map((config) => new GitHubRepositoryControlObserver(network, config)),
    );
    cli.write(await runRepositoryObservationCli(fileSystem, externalData, cli.arguments()));
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
