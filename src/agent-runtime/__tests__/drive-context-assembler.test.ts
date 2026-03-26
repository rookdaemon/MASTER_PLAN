/**
 * Drive Context Assembler — Unit Tests
 *
 * Verifies:
 *   - worldModelUncertainty uses avgRecentNovelty from the activity log
 *   - Falls back to (1 - selfModelCoherence) when activityLog is empty
 *   - Defaults to 0.7 when activityLog is empty (no-activity default)
 *   - Takes the max of avgRecentNovelty and (1 - selfModelCoherence)
 *   - Other DriveContext fields are assembled correctly
 */

import { describe, it, expect } from 'vitest';
import { assembleDriveContext } from '../drive-context-assembler.js';
import type { ActivityRecord, DrivePersonalityParams } from '../../intrinsic-motivation/types.js';
import type { ExperientialState, ConsciousnessMetrics } from '../../conscious-core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 2_000_000; // arbitrary epoch ms used as a fixed test timestamp

function makeExpState(overrides: Partial<ExperientialState> = {}): ExperientialState {
  return {
    timestamp: NOW,
    phenomenalContent: { modalities: ['cognitive'], richness: 0.5, raw: null },
    intentionalContent: { target: 'none', clarity: 0.5 },
    valence: 0,
    arousal: 0.5,
    unityIndex: 0.5,
    continuityToken: { id: 'tok-1', previousId: null, timestamp: NOW },
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<ConsciousnessMetrics> = {}): ConsciousnessMetrics {
  return {
    phi: 0.8,
    experienceContinuity: 1.0,
    selfModelCoherence: 0.85,
    agentTimestamp: NOW,
    ...overrides,
  };
}

function makePersonality(overrides: Partial<DrivePersonalityParams> = {}): DrivePersonalityParams {
  return {
    curiosityTrait: 0.5,
    warmthTrait: 0.5,
    volatilityTrait: 0.3,
    preferredArousal: 0.5,
    preferredLoad: 0.4,
    preferredNovelty: 0.4,
    opennessTrait: 0.5,
    deliberatenessTrait: 0.5,
    ...overrides,
  };
}

function makeActivity(novelty: number, overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    timestamp: NOW - 5_000,
    description: 'test activity',
    novelty,
    arousal: 0.5,
    goalProgress: 'advancing',
    ...overrides,
  };
}

function makeBaseOpts(overrides: Partial<Parameters<typeof assembleDriveContext>[0]> = {}) {
  return {
    expState: makeExpState(),
    metrics: makeMetrics(),
    lastSocialInteractionAt: NOW - 60_000,
    activityLog: [],
    tickBudgetMs: 1000,
    phaseElapsedMs: 300,
    hasRealInput: false,
    personality: makePersonality(),
    now: NOW,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('assembleDriveContext', () => {
  describe('worldModelUncertainty', () => {
    it('defaults to 0.7 when activityLog is empty', () => {
      // selfModelCoherence = 0.85 → fallback = 0.15; empty log default = 0.7
      const ctx = assembleDriveContext(makeBaseOpts({
        activityLog: [],
        metrics: makeMetrics({ selfModelCoherence: 0.85 }),
      }));
      // max(0.7, 1 - 0.85) = max(0.7, 0.15) = 0.7
      expect(ctx.worldModelUncertainty).toBeCloseTo(0.7);
    });

    it('uses avgRecentNovelty when activity log has entries', () => {
      const activityLog = [
        makeActivity(0.8),
        makeActivity(0.6),
        makeActivity(0.4),
      ];
      const ctx = assembleDriveContext(makeBaseOpts({
        activityLog,
        metrics: makeMetrics({ selfModelCoherence: 0.9 }),
      }));
      // avgRecentNovelty = (0.8 + 0.6 + 0.4) / 3 ≈ 0.6
      // fallback = 1 - 0.9 = 0.1
      // result = max(0.6, 0.1) = 0.6
      expect(ctx.worldModelUncertainty).toBeCloseTo(0.6);
    });

    it('uses (1 - selfModelCoherence) floor when it exceeds avgRecentNovelty', () => {
      const activityLog = [
        makeActivity(0.1),
        makeActivity(0.1),
      ];
      const ctx = assembleDriveContext(makeBaseOpts({
        activityLog,
        metrics: makeMetrics({ selfModelCoherence: 0.5 }), // fallback = 0.5
      }));
      // avgRecentNovelty = 0.1; fallback = 0.5
      // result = max(0.1, 0.5) = 0.5
      expect(ctx.worldModelUncertainty).toBeCloseTo(0.5);
    });

    it('caps activity window at 10 most-recent records', () => {
      // 15 entries: first 5 have novelty=0.9, last 10 have novelty=0.2
      const activityLog = [
        ...Array.from({ length: 5 }, () => makeActivity(0.9)),
        ...Array.from({ length: 10 }, () => makeActivity(0.2)),
      ];
      const ctx = assembleDriveContext(makeBaseOpts({
        activityLog,
        metrics: makeMetrics({ selfModelCoherence: 0.99 }), // negligible fallback
      }));
      // Only last 10 (all 0.2) should count → avg = 0.2
      expect(ctx.worldModelUncertainty).toBeCloseTo(0.2);
    });

    it('is responsive to activity novelty, not just selfModelCoherence', () => {
      const highNoveltyLog = [makeActivity(0.9), makeActivity(0.85)];
      const lowNoveltyLog  = [makeActivity(0.1), makeActivity(0.15)];
      const metrics = makeMetrics({ selfModelCoherence: 0.85 }); // fixed

      const highCtx = assembleDriveContext(makeBaseOpts({ activityLog: highNoveltyLog, metrics }));
      const lowCtx  = assembleDriveContext(makeBaseOpts({ activityLog: lowNoveltyLog, metrics }));

      expect(highCtx.worldModelUncertainty).toBeGreaterThan(lowCtx.worldModelUncertainty);
    });

    it('no longer returns exactly (1 - selfModelCoherence) when activity log is populated', () => {
      // The old implementation always returned 1 - selfModelCoherence.
      // With novelty 0.6 and selfModelCoherence 0.85, result should be 0.6, not 0.15.
      const activityLog = [makeActivity(0.6)];
      const ctx = assembleDriveContext(makeBaseOpts({
        activityLog,
        metrics: makeMetrics({ selfModelCoherence: 0.85 }),
      }));
      expect(ctx.worldModelUncertainty).not.toBeCloseTo(1 - 0.85);
      expect(ctx.worldModelUncertainty).toBeCloseTo(0.6);
    });
  });

  describe('other fields', () => {
    it('currentCognitiveLoad is elapsed/budget ratio', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        tickBudgetMs: 1000,
        phaseElapsedMs: 400,
      }));
      expect(ctx.currentCognitiveLoad).toBeCloseTo(0.4);
    });

    it('currentCognitiveLoad falls back to 0.3 when tickBudgetMs is zero', () => {
      const ctx = assembleDriveContext(makeBaseOpts({ tickBudgetMs: 0 }));
      expect(ctx.currentCognitiveLoad).toBe(0.3);
    });

    it('currentNovelty is 0.7 when hasRealInput is true', () => {
      const ctx = assembleDriveContext(makeBaseOpts({ hasRealInput: true }));
      expect(ctx.currentNovelty).toBe(0.7);
    });

    it('currentNovelty is 0.4 when hasRealInput is false', () => {
      const ctx = assembleDriveContext(makeBaseOpts({ hasRealInput: false }));
      expect(ctx.currentNovelty).toBe(0.4);
    });

    it('recentActivity is capped to last 10 entries', () => {
      const log = Array.from({ length: 15 }, (_, i) => makeActivity(i / 15));
      const ctx = assembleDriveContext(makeBaseOpts({ activityLog: log }));
      expect(ctx.recentActivity).toHaveLength(10);
      expect(ctx.recentActivity).toEqual(log.slice(-10));
    });

    it('timeSinceLastSocialInteraction is computed as now minus lastSocialInteractionAt', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        lastSocialInteractionAt: NOW - 5_000,
        now: NOW,
      }));
      expect(ctx.timeSinceLastSocialInteraction).toBe(5_000);
    });

    it('selfModelCoherence is passed through from metrics', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        metrics: makeMetrics({ selfModelCoherence: 0.72 }),
      }));
      expect(ctx.selfModelCoherence).toBeCloseTo(0.72);
    });
  });
});
