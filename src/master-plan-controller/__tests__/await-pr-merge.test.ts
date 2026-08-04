import { describe, expect, it } from 'vitest';
import { waitForPullRequestMerge } from '../await-pr-merge.js';
import type { ProcessPort, ProcessRequest, ProcessResult } from '../ports.js';
import { InMemoryScheduler } from '../testing/in-memory-adapters.js';

class SequencedProcess implements ProcessPort {
  readonly requests: ProcessRequest[] = [];

  constructor(private readonly results: ProcessResult[]) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(structuredClone(request));
    const result = this.results.shift();
    if (!result) throw new Error('Unexpected process invocation');
    return result;
  }
}

const result = (stdout: string, exitCode = 0): ProcessResult => ({ exitCode, stdout, stderr: '' });

describe('reviewed pull-request merge wait', () => {
  it('polls through the injected process and scheduler until the PR merges', async () => {
    const process = new SequencedProcess([
      result('{"state":"OPEN","mergedAt":null}'),
      result('{"state":"MERGED","mergedAt":"2026-08-04T08:00:00Z"}'),
    ]);
    const scheduler = new InMemoryScheduler();

    await expect(waitForPullRequestMerge(process, scheduler, {
      pullRequest: 'https://github.com/rookdaemon/MASTER_PLAN/pull/142',
      repository: 'rookdaemon/MASTER_PLAN',
      maximumAttempts: 3,
      delayMs: 10_000,
    })).resolves.toEqual({ mergedAt: '2026-08-04T08:00:00Z', attempts: 2 });

    expect(process.requests).toEqual([
      {
        command: 'gh',
        args: ['pr', 'view', 'https://github.com/rookdaemon/MASTER_PLAN/pull/142', '--repo',
          'rookdaemon/MASTER_PLAN', '--json', 'state,mergedAt'],
      },
      {
        command: 'gh',
        args: ['pr', 'view', 'https://github.com/rookdaemon/MASTER_PLAN/pull/142', '--repo',
          'rookdaemon/MASTER_PLAN', '--json', 'state,mergedAt'],
      },
    ]);
    expect(scheduler.waits).toEqual([10_000]);
  });

  it('fails closed on closed, malformed, failed, and timed-out observations', async () => {
    const cases: Array<[ProcessResult[], RegExp]> = [
      [[result('{"state":"CLOSED","mergedAt":null}')], /closed without merging/i],
      [[result('not-json')], /malformed/i],
      [[{ exitCode: 1, stdout: '', stderr: 'unavailable' }], /lookup failed.*unavailable/i],
      [[result('{"state":"OPEN","mergedAt":null}'), result('{"state":"OPEN","mergedAt":null}')], /did not merge/i],
    ];
    for (const [results, expected] of cases) {
      const scheduler = new InMemoryScheduler();
      await expect(waitForPullRequestMerge(new SequencedProcess(results), scheduler, {
        pullRequest: '142', repository: 'rookdaemon/MASTER_PLAN', maximumAttempts: 2, delayMs: 1,
      })).rejects.toThrow(expected);
    }
  });
});
