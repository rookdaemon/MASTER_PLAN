import { NodeFileSystem } from '../runtime-adapters.js';
import { runPacketExecutionCli } from './execute-packet.js';
import { NodeCliRuntime } from './runtime.js';

async function main(): Promise<void> {
  const cli = new NodeCliRuntime();
  const fileSystem = new NodeFileSystem(cli.environment('GITHUB_WORKSPACE') ?? '.');
  try {
    cli.write(await runPacketExecutionCli(fileSystem, cli.arguments()));
  } catch (error) {
    cli.writeError(error instanceof Error ? error.message : String(error));
    cli.fail();
  }
}

void main();
