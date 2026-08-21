import { describe, expect, it } from 'vitest';
import { NodeFileSystem } from '../runtime-adapters.js';
import { loadRepositoryStrategy, verifyRepositoryStrategy } from '../repository-strategy.js';
import { renderGateBlock, renderOperatingStateBlock, renderPortfolioBlock } from '../roadmap.js';
import { nextRepositoryTimestamp } from './repository-test-time.js';
const BASELINE_TIME = '2026-08-17T00:00:00.000Z';
const repositoryRoot = '.';

describe('unversioned repository strategy baseline', () => {
  it('loads one unversioned baseline and the current autonomous state', async () => {
    const fileSystem = new NodeFileSystem(repositoryRoot);
    const bundle = await loadRepositoryStrategy(fileSystem);

    expect(bundle.state.governance).toMatchObject({
      mode: 'automated-stewardship',
      safeAutoMergeEnabled: false,
    });
    expect(bundle.state.governance.reviewedResultCount).toBe(
      bundle.state.auditEvents.filter((event) => event.type === 'packet-verified').length,
    );
    expect(bundle.state.auditEvents.filter((event) => event.type === 'strategy-baselined')).toEqual([
      expect.objectContaining({ occurredAt: BASELINE_TIME }),
    ]);
    expect(bundle.state.packets.every((packet) => packet.seriesId && packet.runNumber)).toBe(true);
    expect(bundle.state.approvals).toEqual([]);
    expect(bundle.state.assessments).toEqual([]);
    expect(bundle.state.escalations).toEqual([]);
    expect(bundle).not.toHaveProperty('legacyAudit');
  });

  it('verifies research-area mappings, controller contracts, and generated document blocks', async () => {
    const fileSystem = new NodeFileSystem(repositoryRoot);
    const bundle = await loadRepositoryStrategy(fileSystem);
    const paths = await fileSystem.listFiles('strategy/');
    const files = Object.fromEntries(await Promise.all(
      paths.map(async (path) => [path, await fileSystem.readText(path)] as const),
    ));
    const report = await verifyRepositoryStrategy(fileSystem, bundle, nextRepositoryTimestamp(files));

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
