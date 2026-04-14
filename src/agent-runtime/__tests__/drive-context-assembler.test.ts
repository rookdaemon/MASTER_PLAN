/**
 * Drive Context Assembler — Unit Tests
 *
 * Verifies:
 *   - worldModelUncertainty uses avgRecentNovelty from the activity log
 *   - Falls back to (1 - selfModelCoherence) when activityLog is empty
 *   - Defaults to 0.7 when activityLog is empty (no-activity default)
 *   - Takes the max of avgRecentNovelty and (1 - selfModelCoherence)
 *   - currentCognitiveLoad is a composite of tool-call ratio, time ratio, and task depth
 *   - currentNovelty is an entropy-based estimate from topic diversity
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
    toolCallCount: 0,
    activeSubtaskDepth: 0,
    recentMemoryTopics: [],
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

  describe('currentCognitiveLoad — composite formula', () => {
    it('is 0 when all inputs are minimal (no tool calls, no time elapsed, no task depth)', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 0,
        phaseElapsedMs: 0,
        activeSubtaskDepth: 0,
        tickBudgetMs: 1000,
      }));
      expect(ctx.currentCognitiveLoad).toBeCloseTo(0);
    });

    it('scales with tool call count (6 calls → toolCallRatio = 1)', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 6,
        phaseElapsedMs: 0,
        activeSubtaskDepth: 0,
        tickBudgetMs: 1000,
      }));
      // 6/6 * 0.4 + 0 * 0.3 + 0 * 0.3 = 0.4
      expect(ctx.currentCognitiveLoad).toBeCloseTo(0.4);
    });

    it('scales with time elapsed ratio', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 0,
        phaseElapsedMs: 500,
        activeSubtaskDepth: 0,
        tickBudgetMs: 1000,
      }));
      // 0 * 0.4 + 0.5 * 0.3 + 0 * 0.3 = 0.15
      expect(ctx.currentCognitiveLoad).toBeCloseTo(0.15);
    });

    it('scales with active subtask depth', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 0,
        phaseElapsedMs: 0,
        activeSubtaskDepth: 4,
        tickBudgetMs: 1000,
      }));
      // 0 * 0.4 + 0 * 0.3 + (4/4) * 0.3 = 0.3
      expect(ctx.currentCognitiveLoad).toBeCloseTo(0.3);
    });

    it('combines all three signals correctly', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 3,   // 3/6 = 0.5
        phaseElapsedMs: 400, // 400/1000 = 0.4
        activeSubtaskDepth: 2, // 2/4 = 0.5
        tickBudgetMs: 1000,
      }));
      // 0.5 * 0.4 + 0.4 * 0.3 + 0.5 * 0.3 = 0.2 + 0.12 + 0.15 = 0.47
      expect(ctx.currentCognitiveLoad).toBeCloseTo(0.47);
    });

    it('clamps to 1 when inputs exceed expected range', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 12,  // exceeds max → clamped to 1
        phaseElapsedMs: 2000, // exceeds budget → clamped to 1
        activeSubtaskDepth: 8, // exceeds max → clamped to 1
        tickBudgetMs: 1000,
      }));
      expect(ctx.currentCognitiveLoad).toBeCloseTo(1);
    });

    it('uses 0 for time component when tickBudgetMs is zero (avoids division by zero)', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 3,
        phaseElapsedMs: 500,
        activeSubtaskDepth: 0,
        tickBudgetMs: 0,
      }));
      // 0.5 * 0.4 + 0 * 0.3 + 0 * 0.3 = 0.2
      expect(ctx.currentCognitiveLoad).toBeCloseTo(0.2);
    });

    it('is higher with more signals than with fewer', () => {
      const lowCtx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 1,
        phaseElapsedMs: 100,
        activeSubtaskDepth: 1,
        tickBudgetMs: 1000,
      }));
      const highCtx = assembleDriveContext(makeBaseOpts({
        toolCallCount: 5,
        phaseElapsedMs: 700,
        activeSubtaskDepth: 3,
        tickBudgetMs: 1000,
      }));
      expect(highCtx.currentCognitiveLoad).toBeGreaterThan(lowCtx.currentCognitiveLoad);
    });
  });

  describe('currentNovelty — entropy-based formula', () => {
    it('is 0.2 (base) when there are no memory topics and no real input', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: [],
        hasRealInput: false,
      }));
      // topicEntropy = 0, repetitionPenalty = 0, inputBoost = 0
      // 0 * 0.6 - 0 * 0.3 + 0 + 0.2 = 0.2
      expect(ctx.currentNovelty).toBeCloseTo(0.2);
    });

    it('adds 0.15 boost when hasRealInput is true (no topics)', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: [],
        hasRealInput: true,
      }));
      // 0 * 0.6 - 0 * 0.3 + 0.15 + 0.2 = 0.35
      expect(ctx.currentNovelty).toBeCloseTo(0.35);
    });

    it('increases with diverse topics (high entropy)', () => {
      // 4 fully distinct topics → Shannon entropy = log2(4) = 2 bits; maxEntropy = log2(4)
      // topicEntropy normalised = 1.0
      const ctx = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: ['alpha', 'beta', 'gamma', 'delta'],
        hasRealInput: false,
      }));
      // 1.0 * 0.6 - 0 * 0.3 + 0 + 0.2 = 0.8
      expect(ctx.currentNovelty).toBeCloseTo(0.8);
    });

    it('is lower with repeated topics (same-topic streak penalty)', () => {
      // All topics the same → topicEntropy = 0; streak = 4 → penalty = max(0,4-1)/5 = 0.6
      const ctx = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: ['code', 'code', 'code', 'code'],
        hasRealInput: false,
      }));
      // 0 * 0.6 - 0.6 * 0.3 + 0 + 0.2 = 0 - 0.18 + 0.2 = 0.02
      expect(ctx.currentNovelty).toBeCloseTo(0.02);
    });

    it('is higher with diverse topics than with repeated topics', () => {
      const diverseCtx = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: ['topic-a', 'topic-b', 'topic-c', 'topic-d'],
        hasRealInput: false,
      }));
      const repeatedCtx = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: ['code', 'code', 'code', 'code'],
        hasRealInput: false,
      }));
      expect(diverseCtx.currentNovelty).toBeGreaterThan(repeatedCtx.currentNovelty);
    });

    it('clamps to [0, 1]', () => {
      const ctx = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        hasRealInput: true,
      }));
      expect(ctx.currentNovelty).toBeGreaterThanOrEqual(0);
      expect(ctx.currentNovelty).toBeLessThanOrEqual(1);
    });

    it('combines entropy and input boost additively', () => {
      const withInput = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: ['alpha', 'beta'],
        hasRealInput: true,
      }));
      const withoutInput = assembleDriveContext(makeBaseOpts({
        recentMemoryTopics: ['alpha', 'beta'],
        hasRealInput: false,
      }));
      // inputBoost adds 0.15
      expect(withInput.currentNovelty).toBeCloseTo(withoutInput.currentNovelty + 0.15);
    });
  });

  describe('other fields', () => {
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
