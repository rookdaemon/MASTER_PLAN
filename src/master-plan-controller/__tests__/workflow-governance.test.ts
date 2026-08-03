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

  it('declares protected-branch controls for automated stewardship', async () => {
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
      agentReview: { provider: string; automatic: boolean; reviewOnPush: boolean; fallback: string };
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
      highRiskPolicy: { maximumCommitCount: 1, mergeMode: 'agent-controlled' },
      agentReview: {
        provider: 'github-agent-reviewers', automatic: true, reviewOnPush: true,
        fallback: 'github-models',
      },
    });
  });

  it('makes repository entry points describe v2 while retaining v1 as history', async () => {
    const readme = await fileSystem.readText('README.md');
    const status = await fileSystem.readText('STATUS.md');
    expect(readme).toContain('strategy/ROADMAP.md');
    expect(readme).toMatch(/v1.*histor/i);
    expect(status).toContain('Shadow cycles agent-reviewed: **20 / 20**');
    expect(status).toContain('Human role: **servant leader for exceptional escalation**');
    expect(status).toContain('Branch protection applied and verified: **yes**');
    expect(status).toContain('Safe auto-merge: **enabled for routine code/test changes**');
  });

  it('enforces one-commit protected proposals and automatic routine merge without a label', async () => {
    const proposal = await fileSystem.readText('.github/workflows/proposal-review.yml');
    const safeMerge = await fileSystem.readText('.github/workflows/safe-auto-merge.yml');
    const mergeRequest = await fileSystem.readText('.github/workflows/safe-auto-merge-request.yml');
    const agentReview = await fileSystem.readText('.github/workflows/agent-review.yml');
    const agentReviewRequest = await fileSystem.readText('.github/workflows/agent-review-request.yml');
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
    expect(mergeRequest).toContain('workflows: [CI, Proposal review, Agent review, Safe code auto-merge]');
    expect(mergeRequest).not.toContain('actions/checkout');
    expect(mergeRequest).not.toContain('npm ci');
    expect(mergeRequest).not.toContain('copilot-pull-request-reviewer[bot]');
    expect(mergeRequest).toContain('commit_count');
    expect(mergeRequest).toContain('agent_controlled_candidate');
    expect(mergeRequest).toContain('.github/workflows/agent-review.yml');
    expect(mergeRequest).toContain('.pull_requests');
    for (const protectedPattern of ['network', 'security', 'deploy']) {
      expect(mergeRequest).toContain(protectedPattern);
    }
    expect(agentReview).toContain("name='agent-review'");
    expect(agentReview).toContain('pull_request_target:');
    expect(agentReview).toContain('workflow_dispatch:');
    expect(agentReview).toContain('external_id');
    expect(agentReview).toContain('actions: write');
    expect(agentReview).toContain('commit_id');
    expect(agentReview).toContain('models: read');
    expect(agentReview).toContain('checks: write');
    expect(agentReview).toContain('/check-runs');
    expect(agentReview).toContain('head.sha');
    expect(agentReview).toContain('models.github.ai/inference/chat/completions');
    expect(agentReview).toContain('response_format');
    expect(agentReview).not.toContain('actions/checkout');
    expect(agentReviewRequest).toContain('schedule:');
    expect(agentReviewRequest).toContain('requested_reviewers');
    expect(agentReviewRequest).toContain('if ! gh api --method POST');
    expect(agentReviewRequest).toContain('gh workflow run agent-review.yml');
    expect(mergeRequest).toContain('workflow_dispatch:');
    expect(agentReviewRequest).not.toContain('actions/checkout');
    expect(agentReviewRequest).not.toContain('npm ci');
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
