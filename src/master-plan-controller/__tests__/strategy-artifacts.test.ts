import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../runtime-adapters.js';
import { loadRepositoryStrategy, verifyRepositoryStrategy } from '../repository-strategy.js';
import { renderGateBlock, renderOperatingStateBlock, renderPortfolioBlock } from '../roadmap.js';
const BASELINE_TIME = '2026-08-17T00:00:00.000Z';
const repositoryRoot = '.';

describe('unversioned repository strategy baseline', () => {
  it('loads a clean controller bundle with one baseline event and no historical rollout state', async () => {
    const fileSystem = new NodeFileSystem(repositoryRoot);
    const bundle = await loadRepositoryStrategy(fileSystem);

    expect(bundle.state.governance).toEqual({
      mode: 'automated-stewardship',
      reviewedResultCount: 0,
      safeAutoMergeEnabled: true,
    });
    expect(bundle.state.auditEvents).toEqual([
      expect.objectContaining({ type: 'strategy-baselined', occurredAt: BASELINE_TIME }),
    ]);
    expect(bundle.state.packets).toEqual([]);
    expect(bundle.state.approvals).toEqual([]);
    expect(bundle.state.assessments).toEqual([]);
    expect(bundle.state.escalations).toEqual([]);
    expect(bundle).not.toHaveProperty('legacyAudit');
    expect(bundle.state).not.toHaveProperty('shadowCycles');
    expect(bundle.state).not.toHaveProperty('shadowCycleReviews');
  });

  it('verifies research-area mappings, controller contracts, and generated document blocks', async () => {
    const fileSystem = new NodeFileSystem(repositoryRoot);
    const bundle = await loadRepositoryStrategy(fileSystem);
    const report = await verifyRepositoryStrategy(fileSystem, bundle, BASELINE_TIME);

    expect(report.errors).toEqual([]);
    expect(report.researchAreaCount).toBeGreaterThanOrEqual(30);
    expect(renderPortfolioBlock(bundle)).toContain('Consciousness epistemics');
    expect(renderGateBlock(bundle)).toContain('program-self-replication');
    expect(renderOperatingStateBlock(bundle)).toContain('automated stewardship');
  });

  it('retains exactly four consolidated findings', async () => {
    const files = await new NodeFileSystem(repositoryRoot).listFiles('strategy/findings/');
    expect(files).toEqual([
      'strategy/findings/consciousness-assessment.json',
      'strategy/findings/durable-compute.json',
      'strategy/findings/institutional-continuity.json',
      'strategy/findings/preservation-risks.json',
    ]);
  });
});
