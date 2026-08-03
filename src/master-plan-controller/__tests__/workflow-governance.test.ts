import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../runtime-adapters.js';

const fileSystem = new NodeFileSystem('.');

describe('blocking CI and governed workflows', () => {
  it('makes type checking blocking and exposes stable required check names', async () => {
    const workflow = await fileSystem.readText('.github/workflows/ci.yml');
    expect(workflow).not.toContain('continue-on-error');
    expect(workflow).toMatch(/\n\s+typecheck:/);
    expect(workflow).toMatch(/\n\s+test:/);
    expect(workflow).toMatch(/\n\s+strategy-verify:/);
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run strategy:verify');
  });

  it('declares protected-branch controls that must be applied by human-reviewed governance', async () => {
    const controls = JSON.parse(await fileSystem.readText('strategy/branch-protection.json')) as {
      branch: string;
      requiredStatusChecks: string[];
      requiredApprovingReviewCount: number;
      requireConversationResolution: boolean;
      allowForcePushes: boolean;
      allowDeletions: boolean;
      enforceAdmins: boolean;
      appliedAndVerified: boolean;
      repositoryAutoMergeEnabled: boolean;
      safeAutoMergeVariableEnabled: boolean;
      highRiskPolicy: { maximumCommitCount: number; mergeMode: string };
      agentReview: { provider: string; automatic: boolean; reviewOnPush: boolean };
    };
    expect(controls).toMatchObject({
      branch: 'main',
      requiredStatusChecks: ['typecheck', 'test', 'strategy-verify', 'proposal-review', 'agent-review'],
      requiredApprovingReviewCount: 0,
      requireConversationResolution: true,
      allowForcePushes: false,
      allowDeletions: false,
      enforceAdmins: true,
      appliedAndVerified: true,
      repositoryAutoMergeEnabled: true,
      safeAutoMergeVariableEnabled: true,
      highRiskPolicy: { maximumCommitCount: 1, mergeMode: 'manual' },
      agentReview: { provider: 'github-copilot', automatic: true, reviewOnPush: true },
    });
  });

  it('makes repository entry points describe v2 while retaining v1 as history', async () => {
    const readme = await fileSystem.readText('README.md');
    const status = await fileSystem.readText('STATUS.md');
    expect(readme).toContain('strategy/ROADMAP.md');
    expect(readme).toMatch(/v1.*histor/i);
    expect(status).toContain('Shadow cycles human-reviewed: **0 / 20**');
    expect(status).toContain('Branch protection applied and verified: **yes**');
    expect(status).toContain('Safe auto-merge: **enabled for routine code/test changes**');
  });

  it('enforces one-commit protected proposals and automatic routine merge without a label', async () => {
    const proposal = await fileSystem.readText('.github/workflows/proposal-review.yml');
    const safeMerge = await fileSystem.readText('.github/workflows/safe-auto-merge.yml');
    const mergeRequest = await fileSystem.readText('.github/workflows/safe-auto-merge-request.yml');
    const agentReview = await fileSystem.readText('.github/workflows/agent-review.yml');
    expect(proposal).toContain('pull_request:');
    expect(proposal).toContain('npm run governance:classify');
    expect(proposal).toContain('PR_COMMIT_COUNT');
    expect(safeMerge).toContain("vars.MASTER_PLAN_SAFE_AUTOMERGE_ENABLED == 'true'");
    expect(safeMerge).not.toContain('safe-code-auto-merge');
    expect(safeMerge).toContain('merge_mode');
    expect(safeMerge).not.toContain('contents: write');
    expect(safeMerge).not.toContain('pull-requests: write');
    expect(safeMerge).toContain('npm run strategy:verify');
    expect(mergeRequest).toContain('workflow_run:');
    expect(mergeRequest).toContain('workflows: [Agent review, Safe code auto-merge]');
    expect(mergeRequest).not.toContain('actions/checkout');
    expect(mergeRequest).not.toContain('npm ci');
    expect(mergeRequest).toContain('copilot-pull-request-reviewer[bot]');
    for (const protectedPattern of ['network', 'security', 'deploy']) {
      expect(mergeRequest).toContain(protectedPattern);
    }
    expect(agentReview).toContain('agent-review:');
    expect(agentReview).toContain('commit_id');
  });

  it('provides CLI scripts for deterministic strategy and governance checks', async () => {
    const packageJson = JSON.parse(await fileSystem.readText('package.json')) as { scripts: Record<string, string> };
    expect(packageJson.scripts).toMatchObject({
      'strategy:verify': 'tsx src/master-plan-controller/cli/verify-strategy.ts',
      'governance:classify': 'tsx src/master-plan-controller/cli/classify-change.ts',
      'auto-merge:evaluate': 'tsx src/master-plan-controller/cli/evaluate-auto-merge.ts',
    });
  });
});
