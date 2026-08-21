import { FetchNetwork, NodeFileSystem } from '../runtime-adapters.js';
import { runGuardianConversationCli } from './guardian-conversation.js';
import { NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const fileSystem = new NodeFileSystem(cli.environment('GITHUB_WORKSPACE') ?? '.');
  try {
    cli.write(await runGuardianConversationCli(
      fileSystem,
      new FetchNetwork(),
      cli.arguments(),
      cli.environment('SLACK_WEBHOOK_URL'),
    ));
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
