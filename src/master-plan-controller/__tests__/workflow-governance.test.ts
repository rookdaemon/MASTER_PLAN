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

  it('keeps Guardian execution off CI and leaves a read-only handoff workflow', async () => {
    const guardian = await fileSystem.readText('.github/workflows/guardian-cycle.yml');
    expect(guardian).toContain('workflow_dispatch:');
    expect(guardian).not.toContain('schedule:');
    expect(guardian).toContain('contents: read');
    expect(guardian).toContain('authenticated host runs Guardian cycles');
    expect(guardian).not.toContain('npm run strategy:');
    expect(guardian).not.toContain('git push');
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
