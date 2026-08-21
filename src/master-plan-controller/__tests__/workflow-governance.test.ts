import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../runtime-adapters.js';

const fileSystem = new NodeFileSystem('.');

describe('streamlined update workflows', () => {
  it('keeps deterministic CI as the only checked-in update gate', async () => {
    const workflow = await fileSystem.readText('.github/workflows/ci.yml');
    expect(workflow).not.toContain('continue-on-error');
    expect(workflow).toMatch(/\n\s+typecheck:/);
    expect(workflow).toMatch(/\n\s+test:/);
    expect(workflow).toMatch(/\n\s+strategy-verify:/);
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run strategy:verify');
    expect(workflow).toContain('npm run docs:verify');

    const controls = JSON.parse(await fileSystem.readText('strategy/branch-protection.json')) as {
      requiredStatusChecks: string[];
      requiredApprovingReviewCount: number;
      reviewGateEnabled: boolean;
    };
    expect(controls).toMatchObject({
      requiredStatusChecks: ['typecheck', 'test', 'strategy-verify'],
      requiredApprovingReviewCount: 0,
      reviewGateEnabled: false,
    });
  });

  it('does not retain reviewer or merge-policy update workflows', async () => {
    const files = await fileSystem.listFiles('.github/workflows/');
    for (const removed of [
      'agent-review.yml',
      'agent-review-request.yml',
      'merge-policy.yml',
      'proposal-review.yml',
      'safe-auto-merge.yml',
      'safe-auto-merge-request.yml',
      'strategy-integrate-reviewed.yml',
    ]) {
      expect(files).not.toContain(`.github/workflows/${removed}`);
    }
  });

  it('runs one bounded Guardian cycle every hour without a reviewer or pull-request detour', async () => {
    const guardian = await fileSystem.readText('.github/workflows/guardian-cycle.yml');
    expect(guardian).toContain("cron: '17 * * * *'");
    expect(guardian).toContain('workflow_dispatch:');
    expect(guardian).toContain('npm run strategy:generate -- "$cycle_time"');
    expect(guardian).toContain('npm run strategy:execute -- "$cycle_time"');
    expect(guardian).toContain('npm run strategy:verify');
    expect(guardian).toContain('npm run docs:verify');
    expect(guardian).toContain('npm run lint');
    expect(guardian).toContain('npm test');
    expect(guardian).toContain('git push origin HEAD:main');
    expect(guardian).not.toMatch(/agent.review|copilot|pull request|gh pr/i);
  });

  it('documents CI-only update handling without independent agent-review requirements', async () => {
    const [agents, operations] = await Promise.all([
      fileSystem.readText('AGENTS.md'),
      fileSystem.readText('docs/OPERATIONS.md'),
    ]);
    for (const policy of [agents, operations]) {
      expect(policy).toMatch(/deterministic CI/i);
      expect(policy).not.toMatch(/independent GitHub agent review|exact-head agent review|protected agent-review path/i);
    }
  });
});
