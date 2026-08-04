import { describe, expect, it } from 'vitest';
import {
  conductPeriodicReview,
  periodicReviewValidationErrors,
  runRepositoryPeriodicReview,
} from '../periodic-review.js';
import { runPeriodicReviewCli } from '../cli/periodic-review.js';
import { InMemoryFileSystem } from '../testing/in-memory-adapters.js';
import { CONFIG, makeEvidence, makeNode, makePacket, makeState } from './fixtures.js';

const REVIEWED_AT = '2026-08-04T06:00:00.000Z';

describe('automated periodic strategy review', () => {
  it('performs a caller-timestamped weekly whole-portfolio review', () => {
    const state = makeState({
      nodes: [
        makeNode({ id: 'preservation', portfolio: 'near-term-preservation', lifecycle: 'blocked' }),
        makeNode({ id: 'continuity', portfolio: 'institutional-continuity', lifecycle: 'eligible' }),
      ],
      packets: [makePacket({ id: 'active', lifecycle: 'active', portfolio: 'enabling-capabilities' })],
      activePacketId: 'active',
      portfolioEffort: {
        'consciousness-epistemics': 0.45,
        'near-term-preservation': 0.2,
        'enabling-capabilities': 0.25,
        'institutional-continuity': 0.1,
      },
    });

    const review = conductPeriodicReview(state, CONFIG, 'weekly', REVIEWED_AT);

    expect(review).toMatchObject({
      id: 'periodic-review-weekly-2026-08-04T06-00-00-000Z',
      cadence: 'weekly',
      reviewedAt: REVIEWED_AT,
      reviewer: 'automated-periodic-review:v1',
      portfolio: {
        activePacketIds: ['active'],
        neglectedPortfolios: ['near-term-preservation', 'institutional-continuity'],
        allocationGaps: {
          'near-term-preservation': 0.1,
          'institutional-continuity': 0.05,
        },
      },
      evidenceStandards: null,
      constitutionalRisks: null,
    });
    expect(review.findings).toContain('Blocked or invalidated nodes require strategy adaptation: preservation');
  });

  it('performs quarterly evidence, weight, and constitutional-risk review without amending the constitution', () => {
    const state = makeState({
      nodes: [makeNode({
        id: 'pending-amendment-node',
        constitutionalImpact: 'amendment',
        evidenceReferences: ['stale'],
      })],
      evidence: [makeEvidence({ id: 'stale', observedAt: '2025-01-01T00:00:00.000Z', outcome: 'null' })],
    });
    const before = structuredClone(state.constitution);

    const review = conductPeriodicReview(state, CONFIG, 'quarterly', REVIEWED_AT);

    expect(review.evidenceStandards).toMatchObject({
      recordCount: 1,
      staleEvidenceIds: ['stale'],
      outcomeCounts: { positive: 0, negative: 0, null: 1 },
    });
    expect(review.constitutionalRisks).toMatchObject({
      constitutionVersion: state.constitution.version,
      pendingAmendmentNodeIds: ['pending-amendment-node'],
    });
    expect(review.constitutionalRisks?.openRisks).toContain(
      'Node pending-amendment-node declares amendment impact without an approved amendment covering it.',
    );
    expect(state.constitution).toEqual(before);
  });

  it('rejects malformed or future-dated reviews', () => {
    const review = conductPeriodicReview(makeState(), CONFIG, 'weekly', REVIEWED_AT);
    expect(periodicReviewValidationErrors({ ...review, reviewedAt: '2027-01-01T00:00:00.000Z' }, REVIEWED_AT))
      .toContain(`Periodic review ${review.id} has an invalid review timestamp`);
    expect(periodicReviewValidationErrors({ ...review, findings: [] }, REVIEWED_AT))
      .toContain(`Periodic review ${review.id} has no findings`);
  });

  it('persists one idempotent review through the injected filesystem', async () => {
    const state = makeState();
    const fileSystem = new InMemoryFileSystem({
      'strategy/periodic-reviews.json': '[]\n',
    });

    const first = await runRepositoryPeriodicReview(fileSystem, state, CONFIG, 'weekly', REVIEWED_AT);
    const second = await runRepositoryPeriodicReview(fileSystem, state, CONFIG, 'weekly', REVIEWED_AT);

    expect(first).toEqual({ reviewId: 'periodic-review-weekly-2026-08-04T06-00-00-000Z', appended: true });
    expect(second).toEqual({ reviewId: first.reviewId, appended: false });
    expect(JSON.parse(await fileSystem.readText('strategy/periodic-reviews.json'))).toHaveLength(1);
  });

  it('validates CLI cadence and caller-supplied time', async () => {
    const fileSystem = new InMemoryFileSystem({ 'strategy/periodic-reviews.json': '[]\n' });
    const output = await runPeriodicReviewCli(
      fileSystem, makeState(), CONFIG, ['quarterly', REVIEWED_AT],
    );
    expect(JSON.parse(output)).toEqual({
      reviewId: 'periodic-review-quarterly-2026-08-04T06-00-00-000Z',
      appended: true,
    });
    await expect(runPeriodicReviewCli(fileSystem, makeState(), CONFIG, ['monthly', REVIEWED_AT]))
      .rejects.toThrow('Usage: strategy:review <weekly|quarterly> <ISO timestamp>');
  });
});
