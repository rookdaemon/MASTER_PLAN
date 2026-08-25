import { describe, expect, it } from 'vitest';
import { runHostGuardianSupervisor, type HostGuardianConfig } from '../host-guardian-supervisor.js';
import { InMemoryClock, InMemoryFileSystem, InMemoryProcess } from '../testing/in-memory-adapters.js';

const NOW = '2026-08-25T12:00:00.000Z';
const config: HostGuardianConfig = {
  workingDirectory: '/workspace',
  statePath: '.guardian/host-guardian-state.json',
  intervalMs: 60 * 60 * 1_000,
  codexModel: 'gpt-5.6-sol',
};

describe('host Guardian supervisor', () => {
  it('runs one Codex-led, deterministic Guardian cycle and records its caller-supplied timestamp', async () => {
    const fs = new InMemoryFileSystem();
    const process = new InMemoryProcess(Array.from({ length: 8 }, () => ({ exitCode: 0, stdout: '{}', stderr: '' })));

    const result = await runHostGuardianSupervisor({ fs, process, clock: new InMemoryClock(NOW) }, config);

    expect(result.ran).toBe(true);
    expect(process.requests).toEqual([
      expect.objectContaining({ command: 'codex', args: expect.arrayContaining(['exec', '--sandbox', 'workspace-write', '--approve-for-me', '--ephemeral', '-m', 'gpt-5.6-sol']) }),
      expect.objectContaining({ command: 'npm', args: ['run', 'strategy:generate', '--', NOW] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'strategy:execute', '--', NOW] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'strategy:verify'] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'docs:verify'] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'lint'] }),
      expect.objectContaining({ command: 'npm', args: ['test'] }),
      expect.objectContaining({ command: 'npm', args: ['run', 'guardian:summary', '--', NOW, '{}', '{}'] }),
    ]);
    expect(process.requests[0].args.at(-1)).toContain('Only modify docs/ and strategy/.');
    expect(JSON.parse(await fs.readText(config.statePath))).toEqual({ version: 1, completedAt: NOW });
  });

  it('does not repeat a cycle before its configured interval', async () => {
    const fs = new InMemoryFileSystem({
      [config.statePath]: JSON.stringify({ version: 1, completedAt: '2026-08-25T11:30:00.000Z' }),
    });
    const process = new InMemoryProcess();

    const result = await runHostGuardianSupervisor({ fs, process, clock: new InMemoryClock(NOW) }, config);

    expect(result).toEqual({ ran: false });
    expect(process.requests).toEqual([]);
  });

  it('treats the Node filesystem ENOENT form as an absent runtime state file', async () => {
    const missingStateFs = {
      readText: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
      writeText: async () => undefined,
      listFiles: async () => [],
    };
    const process = new InMemoryProcess(Array.from({ length: 8 }, () => ({ exitCode: 0, stdout: '{}', stderr: '' })));

    await expect(runHostGuardianSupervisor({ fs: missingStateFs, process, clock: new InMemoryClock(NOW) }, config))
      .resolves.toEqual({ ran: true });
  });

  it('does not record a failed Codex or deterministic command as complete', async () => {
    const fs = new InMemoryFileSystem();
    const process = new InMemoryProcess([{ exitCode: 1, stdout: '', stderr: 'authentication unavailable' }]);

    await expect(runHostGuardianSupervisor({ fs, process, clock: new InMemoryClock(NOW) }, config))
      .rejects.toThrow('host guardian command failed: authentication unavailable');
    await expect(fs.readText(config.statePath)).rejects.toThrow('File not found');
  });
});
