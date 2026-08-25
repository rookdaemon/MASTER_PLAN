import { NodeFileSystem, NodeProcess, SystemClock } from '../runtime-adapters.js';
import { runHostGuardianSupervisor } from '../host-guardian-supervisor.js';

async function main(): Promise<void> {
  const workingDirectory = process.cwd();
  const result = await runHostGuardianSupervisor(
    { fs: new NodeFileSystem(workingDirectory), process: new NodeProcess(), clock: new SystemClock() },
    {
      workingDirectory,
      statePath: '.guardian/host-guardian-state.json',
      intervalMs: 60 * 60 * 1_000,
      codexModel: process.env['MASTER_PLAN_CODEX_MODEL'] ?? 'gpt-5.6-sol',
    },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
