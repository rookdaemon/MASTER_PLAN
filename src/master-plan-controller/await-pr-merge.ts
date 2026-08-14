import type { ProcessPort, SchedulerPort } from './ports.js';
import type { Timestamp } from './types.js';

export interface PullRequestMergeWaitOptions {
  pullRequest: string;
  repository: string;
  maximumAttempts: number;
  delayMs: number;
}

export interface PullRequestMergeWaitResult {
  mergedAt: Timestamp;
  attempts: number;
}

interface PullRequestState {
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergedAt: string | null;
}

function validOptions(options: PullRequestMergeWaitOptions): boolean {
  return options.pullRequest.trim().length > 0 &&
    /^[^/\s]+\/[^/\s]+$/.test(options.repository) &&
    Number.isSafeInteger(options.maximumAttempts) && options.maximumAttempts > 0 &&
    Number.isSafeInteger(options.delayMs) && options.delayMs >= 0;
}

function parseState(stdout: string): PullRequestState {
  try {
    const parsed = JSON.parse(stdout) as Partial<PullRequestState>;
    if (!['OPEN', 'CLOSED', 'MERGED'].includes(parsed.state ?? '') ||
      (parsed.mergedAt !== null && typeof parsed.mergedAt !== 'string')) {
      throw new Error('invalid fields');
    }
    return parsed as PullRequestState;
  } catch {
    throw new Error('Pull request state response is malformed');
  }
}

export async function waitForPullRequestMerge(
  process: ProcessPort,
  scheduler: SchedulerPort,
  options: PullRequestMergeWaitOptions,
): Promise<PullRequestMergeWaitResult> {
  if (!validOptions(options)) throw new Error('Pull request merge wait options are invalid');
  for (let attempt = 1; attempt <= options.maximumAttempts; attempt += 1) {
    const observation = await process.run({
      command: 'gh',
      args: ['pr', 'view', options.pullRequest, '--repo', options.repository, '--json', 'state,mergedAt'],
    });
    if (observation.exitCode !== 0) {
      throw new Error(`Pull request lookup failed: ${observation.stderr}`);
    }
    const state = parseState(observation.stdout);
    if (state.state === 'MERGED') {
      if (!state.mergedAt || Number.isNaN(Date.parse(state.mergedAt))) {
        throw new Error('Pull request state response is malformed');
      }
      return { mergedAt: state.mergedAt, attempts: attempt };
    }
    if (state.state === 'CLOSED') throw new Error('Pull request closed without merging');
    if (attempt < options.maximumAttempts) await scheduler.wait(options.delayMs);
  }
  throw new Error(`Pull request did not merge after ${options.maximumAttempts} observations`);
}
