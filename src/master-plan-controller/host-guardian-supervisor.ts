/** Host-owned, one-shot Guardian scheduler. All host effects enter via ports. */
import type { ClockPort, FileSystemPort, ProcessPort, ProcessRequest } from './ports.js';

export interface HostGuardianConfig {
  workingDirectory: string;
  statePath: string;
  intervalMs: number;
  codexModel: string;
  codexTimeoutMs: number;
  deterministicCommandTimeoutMs: number;
}

export interface HostGuardianDeps {
  fs: FileSystemPort;
  process: ProcessPort;
  clock: ClockPort;
}

interface State { version: 1; completedAt?: string; }

export async function runHostGuardianSupervisor(
  deps: HostGuardianDeps,
  config: HostGuardianConfig,
): Promise<{ ran: boolean }> {
  const now = deps.clock.now();
  assertTimestamp(now);
  assertPositiveDuration(config.codexTimeoutMs, 'Codex timeout');
  assertPositiveDuration(config.deterministicCommandTimeoutMs, 'deterministic command timeout');
  const state = await loadState(deps.fs, config.statePath);
  if (!isDue(state.completedAt, config.intervalMs, now)) return { ran: false };

  let generation = '';
  let execution = '';
  for (const request of commands(now, config)) {
    const result = await deps.process.run(request);
    if (result.exitCode !== 0) {
      throw new Error(`host guardian command failed: ${result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`}`);
    }
    if (request.args.includes('strategy:generate')) generation = result.stdout.trim();
    if (request.args.includes('strategy:execute')) execution = result.stdout.trim();
  }
  const summary = await deps.process.run({
    command: 'npm', args: ['run', 'guardian:summary', '--', now, generation, execution], cwd: config.workingDirectory,
    timeoutMs: config.deterministicCommandTimeoutMs,
  });
  if (summary.exitCode !== 0) {
    throw new Error(`host guardian command failed: ${summary.stderr.trim() || summary.stdout.trim() || `exit code ${summary.exitCode}`}`);
  }

  await deps.fs.writeText(config.statePath, `${JSON.stringify({ version: 1, completedAt: now })}\n`);
  return { ran: true };
}

function commands(now: string, config: HostGuardianConfig): ProcessRequest[] {
  const cwd = config.workingDirectory;
  const prompt = [
    'You are the host-owned Master Plan Guardian.',
    'Inspect the current strategy and complete exactly one bounded, repository-scoped improvement.',
    'Only modify docs/ and strategy/.',
    'Respect strategy authority boundaries and do not use credentials, push, commit, alter CI, or perform external actions.',
    'Work only in this worktree. If no safe material improvement is available, make no change and exit.',
  ].join(' ');
  const npm = (args: string[]): ProcessRequest => ({ command: 'npm', args, cwd, timeoutMs: config.deterministicCommandTimeoutMs });
  const agent: ProcessRequest = {
    command: 'codex',
    args: ['exec', '--approve-for-me', '--json', '--color', 'never', '--ephemeral', '-m', config.codexModel, '-C', cwd, prompt],
    cwd,
    timeoutMs: config.codexTimeoutMs,
  };
  const generation = npm(['run', 'strategy:generate', '--', now]);
  const execution = npm(['run', 'strategy:execute', '--', now]);
  const verification = [
    npm(['run', 'strategy:verify']), npm(['run', 'docs:verify']), npm(['run', 'lint']), npm(['test']),
  ];
  return [agent, generation, execution, ...verification];
}

async function loadState(fs: FileSystemPort, path: string): Promise<State> {
  try {
    const parsed = JSON.parse(await fs.readText(path)) as Partial<State>;
    if (parsed.version !== 1 || (parsed.completedAt !== undefined && typeof parsed.completedAt !== 'string')) {
      throw new Error('host Guardian state is malformed');
    }
    if (parsed.completedAt) assertTimestamp(parsed.completedAt);
    return { version: 1, ...(parsed.completedAt ? { completedAt: parsed.completedAt } : {}) };
  } catch (error) {
    if (isMissingFile(error)) return { version: 1 };
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (
    error.message.startsWith('File not found:') ||
    (typeof (error as NodeJS.ErrnoException).code === 'string' && (error as NodeJS.ErrnoException).code === 'ENOENT')
  );
}

function isDue(last: string | undefined, intervalMs: number, now: string): boolean {
  assertPositiveDuration(intervalMs, 'host Guardian interval');
  return !last || Date.parse(now) - Date.parse(last) >= intervalMs;
}

function assertPositiveDuration(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function assertTimestamp(value: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error('A valid caller-supplied timestamp is required');
}
