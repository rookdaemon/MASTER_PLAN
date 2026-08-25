import { describe, expect, it } from 'vitest';
import { NodeFileSystem, NodeProcess, normalizeRepositoryPath, normalizeRepositoryText } from '../runtime-adapters.js';

describe('repository filesystem normalization', () => {
  it('returns portable repository paths from platform-specific paths', () => {
    expect(normalizeRepositoryPath('docs\\reference\\consciousness-science.md'))
      .toBe('docs/reference/consciousness-science.md');
    expect(normalizeRepositoryPath('strategy/graph.json')).toBe('strategy/graph.json');
  });

  it('returns deterministic LF text from checked-out repository text', () => {
    expect(normalizeRepositoryText('first\r\nsecond\r\n')).toBe('first\nsecond\n');
    expect(normalizeRepositoryText('first\nsecond\n')).toBe('first\nsecond\n');
  });

  it('treats an absent output directory as an empty portable file set', async () => {
    await expect(new NodeFileSystem('.').listFiles('strategy/absent-output-fixture/')).resolves.toEqual([]);
  });
});

describe('node process adapter', () => {
  it('closes stdin for an unattended command', async () => {
    const result = await new NodeProcess().run({
      command: process.execPath,
      args: ['-e', "process.stdin.on('end', () => process.stdout.write('stdin closed'))"],
      timeoutMs: 500,
    });

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('terminates a timed-out command and reports a bounded failure', async () => {
    const result = await new NodeProcess().run({
      command: process.execPath,
      args: ['-e', 'setInterval(() => undefined, 1_000)'],
      timeoutMs: 50,
    });

    expect(result.exitCode).toBe(124);
    expect(result.stderr).toContain('Process timed out after 50ms.');
  });
});
