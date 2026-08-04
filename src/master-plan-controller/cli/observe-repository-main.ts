import {
  CompositeExternalData,
  GitHubRepositoryControlObserver,
  PublicSourceSnapshotObserver,
  loadPublicSourceSnapshotConfigs,
  loadRepositoryControlObservationConfigs,
} from '../repository-observation.js';
import { GuardedAgentEvidenceAdjudicator } from '../evidence-adjudication.js';
import { FetchNetwork, NodeFileSystem, NodeSha256Fingerprint } from '../runtime-adapters.js';
import { runRepositoryObservationCli } from './observe-repository.js';
import { NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const fileSystem = new NodeFileSystem(cli.environment('GITHUB_WORKSPACE') ?? '.');
  try {
    const repository = cli.environment('GITHUB_REPOSITORY');
    if (!repository) throw new Error('GITHUB_REPOSITORY is required');
    const network = new FetchNetwork();
    const [controlConfigs, publicConfigs] = await Promise.all([
      loadRepositoryControlObservationConfigs(fileSystem, repository),
      loadPublicSourceSnapshotConfigs(fileSystem),
    ]);
    const fingerprint = new NodeSha256Fingerprint();
    const adjudicatorUrl = cli.environment('EVIDENCE_ADJUDICATOR_URL');
    const adjudicator = adjudicatorUrl
      ? new GuardedAgentEvidenceAdjudicator(
        network,
        adjudicatorUrl,
        cli.environment('EVIDENCE_ADJUDICATOR_MODEL') ?? 'Qwen3-4B-Q4_K_M.gguf',
      )
      : undefined;
    const externalData = new CompositeExternalData(
      [
        ...controlConfigs.map((config) => new GitHubRepositoryControlObserver(network, config)),
        ...publicConfigs.map((config) => new PublicSourceSnapshotObserver(network, config, fingerprint, adjudicator)),
      ],
    );
    cli.write(await runRepositoryObservationCli(fileSystem, externalData, cli.arguments()));
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
