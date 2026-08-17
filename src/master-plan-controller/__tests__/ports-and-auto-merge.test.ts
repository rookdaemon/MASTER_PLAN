import { describe, expect, it } from 'vitest';
import { AutoMergeService } from '../auto-merge-service.js';
import { safeAutoMergeFeatureEnabled } from '../auto-merge-gate.js';
import { ProcessGit, ProcessGitHub } from '../process-adapters.js';
import {
  InMemoryClock,
  InMemoryFileSystem,
  InMemoryGit,
  InMemoryGitHub,
  InMemoryNetwork,
  InMemoryProcess,
  InMemoryScheduler,
} from '../testing/in-memory-adapters.js';
import { NOW } from './fixtures.js';

describe('in-memory environment adapters', () => {
  it('supports deterministic clock, filesystem, network, process, Git, and scheduling tests', async () => {
    const clock = new InMemoryClock(NOW);
    const fileSystem = new InMemoryFileSystem({ 'strategy/graph.json': '[]' });
    const network = new InMemoryNetwork({ 'GET https://example.test/evidence': { status: 200, body: 'evidence' } });
    const process = new InMemoryProcess([{ exitCode: 0, stdout: 'ok', stderr: '' }]);
    const git = new InMemoryGit([{ path: 'src/a.ts', additions: 1, deletions: 0 }]);
    const scheduler = new InMemoryScheduler();

    expect(clock.now()).toBe(NOW);
    expect(await fileSystem.readText('strategy/graph.json')).toBe('[]');
    await fileSystem.writeText('strategy/evidence.json', '[]');
    expect(await fileSystem.listFiles('strategy/')).toContain('strategy/evidence.json');
    expect((await network.request({ method: 'GET', url: 'https://example.test/evidence' })).body).toBe('evidence');
    expect((await process.run({ command: 'test', args: [] })).exitCode).toBe(0);
    expect(await git.diff('base', 'head')).toHaveLength(1);
    await git.prepareBranch('work/packet-1');
    await scheduler.wait(1234);
    expect(scheduler.waits).toEqual([1234]);
  });

  it('reads revision-scoped text through the injected process port', async () => {
    const process = new InMemoryProcess([
      { exitCode: 0, stdout: '[{"id":"existing"}]\n', stderr: '' },
    ]);
    const git = new ProcessGit(process, '/workspace');
    expect(await git.readTextAtRevision('base-sha', 'strategy/evidence.json'))
      .toBe('[{"id":"existing"}]\n');
    expect(process.requests).toEqual([{
      command: 'git',
      args: ['show', 'base-sha:strategy/evidence.json'],
      cwd: '/workspace',
    }]);
  });
});

describe('repository auto-merge gate', () => {
  it('requires both recorded repository enablement and the external repository switch', () => {
    expect(safeAutoMergeFeatureEnabled(false, true)).toBe(false);
    expect(safeAutoMergeFeatureEnabled(true, false)).toBe(false);
    expect(safeAutoMergeFeatureEnabled(true, true)).toBe(true);
  });
});

describe('ProcessGitHub protected-branch verification', () => {
  it('does not treat a merely present but incomplete protection response as verified controls', async () => {
    const process = new InMemoryProcess([
      { exitCode: 0, stdout: JSON.stringify({ allow_auto_merge: true }), stderr: '' },
      { exitCode: 0, stdout: JSON.stringify({ required_status_checks: null }), stderr: '' },
      { exitCode: 0, stdout: JSON.stringify([{ name: 'typecheck', state: 'SUCCESS' }]), stderr: '' },
    ]);
    const github = new ProcessGitHub(process, {
      repository: 'owner/repo',
      branch: 'main',
      pullRequestNumber: 1,
      requiredChecks: ['typecheck'],
      featureEnabled: true,
      workingDirectory: '.',
    });
    expect((await github.getRepositoryControls()).branchProtected).toBe(false);
  });

  it('accepts protection only when every declared control is present', async () => {
    const process = new InMemoryProcess([
      { exitCode: 0, stdout: JSON.stringify({ allow_auto_merge: true }), stderr: '' },
      {
        exitCode: 0,
        stdout: JSON.stringify({
          required_status_checks: { strict: true, contexts: ['typecheck', 'test'] },
          enforce_admins: { enabled: true },
          required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true },
          required_conversation_resolution: { enabled: true },
          allow_force_pushes: { enabled: false },
          allow_deletions: { enabled: false },
        }),
        stderr: '',
      },
      {
        exitCode: 0,
        stdout: JSON.stringify([
          { name: 'typecheck', state: 'SUCCESS' },
          { name: 'test', state: 'SUCCESS' },
        ]),
        stderr: '',
      },
    ]);
    const github = new ProcessGitHub(process, {
      repository: 'owner/repo',
      branch: 'main',
      pullRequestNumber: 1,
      requiredChecks: ['typecheck', 'test'],
      featureEnabled: true,
      workingDirectory: '.',
    });
    expect((await github.getRepositoryControls()).branchProtected).toBe(true);
  });

  it('accepts protected checks without a universal approval rule when configured for zero approvals', async () => {
    const process = new InMemoryProcess([
      { exitCode: 0, stdout: JSON.stringify({ allow_auto_merge: true }), stderr: '' },
      {
        exitCode: 0,
        stdout: JSON.stringify({
          required_status_checks: { strict: true, contexts: ['typecheck'] },
          enforce_admins: { enabled: true },
          required_pull_request_reviews: null,
          required_conversation_resolution: { enabled: true },
          allow_force_pushes: { enabled: false },
          allow_deletions: { enabled: false },
        }),
        stderr: '',
      },
      { exitCode: 0, stdout: JSON.stringify([{ name: 'typecheck', state: 'SUCCESS' }]), stderr: '' },
    ]);
    const github = new ProcessGitHub(process, {
      repository: 'owner/repo', branch: 'main', pullRequestNumber: 1,
      requiredChecks: ['typecheck'], requiredApprovingReviewCount: 0,
      dismissStaleReviews: false, featureEnabled: true, workingDirectory: '.',
    });
    expect((await github.getRepositoryControls()).branchProtected).toBe(true);
  });

  it('rejects protection that leaves stale approvals valid after a push', async () => {
    const process = new InMemoryProcess([
      { exitCode: 0, stdout: JSON.stringify({ allow_auto_merge: true }), stderr: '' },
      {
        exitCode: 0,
        stdout: JSON.stringify({
          required_status_checks: { strict: true, contexts: ['typecheck'] },
          enforce_admins: { enabled: true },
          required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: false },
          required_conversation_resolution: { enabled: true },
          allow_force_pushes: { enabled: false },
          allow_deletions: { enabled: false },
        }),
        stderr: '',
      },
      { exitCode: 0, stdout: JSON.stringify([{ name: 'typecheck', state: 'SUCCESS' }]), stderr: '' },
    ]);
    const github = new ProcessGitHub(process, {
      repository: 'owner/repo', branch: 'main', pullRequestNumber: 1,
      requiredChecks: ['typecheck'], featureEnabled: true, workingDirectory: '.',
    });
    expect((await github.getRepositoryControls()).branchProtected).toBe(false);
  });

  it('rejects protection that administrators can bypass', async () => {
    const process = new InMemoryProcess([
      { exitCode: 0, stdout: JSON.stringify({ allow_auto_merge: true }), stderr: '' },
      {
        exitCode: 0,
        stdout: JSON.stringify({
          required_status_checks: { strict: true, contexts: ['typecheck'] },
          enforce_admins: { enabled: false },
          required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true },
          required_conversation_resolution: { enabled: true },
          allow_force_pushes: { enabled: false },
          allow_deletions: { enabled: false },
        }),
        stderr: '',
      },
      { exitCode: 0, stdout: JSON.stringify([{ name: 'typecheck', state: 'SUCCESS' }]), stderr: '' },
    ]);
    const github = new ProcessGitHub(process, {
      repository: 'owner/repo', branch: 'main', pullRequestNumber: 1,
      requiredChecks: ['typecheck'], featureEnabled: true, workingDirectory: '.',
    });
    expect((await github.getRepositoryControls()).branchProtected).toBe(false);
  });
});

describe('AutoMergeService with an injected GitHub port', () => {
  const safeRequest = {
    files: [
      { path: 'src/safe.ts', additions: 2, deletions: 0 },
      { path: 'src/safe.test.ts', additions: 4, deletions: 0 },
    ],
    backwardCompatible: true,
    behaviorCoveredByTests: true,
    maximumChangedLines: 100,
  };

  it('requests auto-merge only after repository controls are verified', async () => {
    const github = new InMemoryGitHub({
      featureEnabled: true,
      branchProtected: true,
      autoMergeAllowedByRepository: true,
      requiredChecks: ['typecheck', 'test'],
      passingChecks: ['typecheck', 'test'],
    });
    const assessment = await new AutoMergeService(github).evaluateAndRequest(42, safeRequest);
    expect(assessment.allowed).toBe(true);
    expect(github.autoMergeRequests).toEqual([42]);
  });

  it('does not mutate GitHub when the diff or controls are forbidden', async () => {
    const github = new InMemoryGitHub({
      featureEnabled: false,
      branchProtected: false,
      autoMergeAllowedByRepository: false,
      requiredChecks: ['typecheck'],
      passingChecks: [],
    });
    const assessment = await new AutoMergeService(github).evaluateAndRequest(42, {
      ...safeRequest,
      files: [{ path: 'strategy/constitution.md', additions: 1, deletions: 0 }],
    });
    expect(assessment.allowed).toBe(false);
    expect(github.autoMergeRequests).toEqual([]);
  });
});
