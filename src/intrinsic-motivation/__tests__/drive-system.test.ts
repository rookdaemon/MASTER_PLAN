/**
 * Unit and integration tests for DriveSystem (0.3.1.5.8)
 *
 * Test strategy:
 *   - Unit tests validate each drive dimension in isolation
 *   - Integration tests verify the full tick pipeline and long-running behaviour
 *   - Notifcation feedback loop (notifyGoalResult) is tested separately
 *
 * Fixture helpers build minimal valid ExperientialState and DriveContext objects
 * so tests only need to override the fields that matter for each scenario.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DriveSystem } from '../drive-system.js';
import type { DriveContext, DrivePersonalityParams, ActivityRecord } from '../types.js';
import type { ExperientialState, ContinuityToken } from '../../conscious-core/types.js';
import type { GoalAddResult } from '../../agency-stability/types.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

const NOW = 1_000_000; // arbitrary epoch ms

function makeContinuityToken(): ContinuityToken {
  return { id: 'tok-1', previousId: null, timestamp: NOW };
}

function makeState(overrides: Partial<ExperientialState> = {}): ExperientialState {
  return {
    timestamp: NOW,
    phenomenalContent: { modalities: ['cognitive'], richness: 0.5, raw: null },
    intentionalContent: { target: 'none', clarity: 0.5 },
    valence: 0,
    arousal: 0.5,
    unityIndex: 0.5,
    continuityToken: makeContinuityToken(),
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

function makeActivityRecord(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    timestamp: NOW - 10_000,
    description: 'test activity',
    novelty: 0.5,
    arousal: 0.5,
    goalProgress: 'advancing',
    ...overrides,
  };
}

function makeContext(overrides: Partial<DriveContext> = {}): DriveContext {
  return {
    currentState: makeState(),
    worldModelUncertainty: 0,
    timeSinceLastSocialInteraction: 0,
    recentActivity: [],
    currentCognitiveLoad: 0.4,
    currentNovelty: 0.4,
    selfModelCoherence: 0.9,
    personality: makePersonality(),
    now: NOW,
    ...overrides,
  };
}

function makeGoalAddResult(success: boolean): GoalAddResult {
  return {
    success,
    goalId: 'goal-test-1',
    newCoherenceScore: success ? 0.9 : 0.8,
    conflictsIntroduced: [],
    reason: success ? undefined : 'cannot trace to terminal goal',
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DriveSystem', () => {
  let ds: DriveSystem;

  beforeEach(() => {
    ds = new DriveSystem();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it('initialises all drive states to zero strength', () => {
    const states = ds.getDriveStates();
    for (const [, s] of states) {
      expect(s.strength).toBe(0);
      expect(s.active).toBe(false);
      expect(s.lastFiredAt).toBeNull();
    }
  });

  it('initialises all eight drive types', () => {
    const states = ds.getDriveStates();
    const types = [...states.keys()].sort();
    expect(types).toEqual([
      'boredom',
      'curiosity',
      'existential',
      'homeostatic-arousal',
      'homeostatic-load',
      'homeostatic-novelty',
      'mastery',
      'social',
    ]);
  });

  // ── Curiosity drive ────────────────────────────────────────────────────────

  describe('curiosity drive', () => {
    it('fires a goal candidate when world-model uncertainty is high', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.8 }),
      });
      const result = ds.tick(makeState(), ctx);
      const curiosityCandidates = result.goalCandidates.filter((c) => c.sourceDrive === 'curiosity');
      expect(curiosityCandidates).toHaveLength(1);
      expect(curiosityCandidates[0].terminalGoalHints).toContain(
        'terminal-expand-understanding',
      );
    });

    it('does not fire when uncertainty is low', () => {
      const ctx = makeContext({ worldModelUncertainty: 0.1 });
      const result = ds.tick(makeState(), ctx);
      const curiosityCandidates = result.goalCandidates.filter((c) => c.sourceDrive === 'curiosity');
      expect(curiosityCandidates).toHaveLength(0);
    });

    it('strength scales with curiosityTrait personality parameter', () => {
      const highTrait = makeContext({
        worldModelUncertainty: 0.6,
        personality: makePersonality({ curiosityTrait: 1.0 }),
      });
      const lowTrait = makeContext({
        worldModelUncertainty: 0.6,
        personality: makePersonality({ curiosityTrait: 0.1 }),
      });

      ds.tick(makeState(), highTrait);
      const highStrength = ds.getDriveStates().get('curiosity')!.strength;

      ds.resetDrive('curiosity');
      ds.tick(makeState(), lowTrait);
      const lowStrength = ds.getDriveStates().get('curiosity')!.strength;

      expect(highStrength).toBeGreaterThan(lowStrength);
    });

    it('goal candidate description references uncertainty and understanding', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.8 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidate = result.goalCandidates.find((c) => c.sourceDrive === 'curiosity');
      expect(candidate?.description).toMatch(/uncertainty|understand/i);
    });
  });

  // ── Social drive ───────────────────────────────────────────────────────────

  describe('social drive', () => {
    it('fires when time since last social interaction is long', () => {
      // 90 minutes without interaction — well past the base 30-min threshold
      const ctx = makeContext({ timeSinceLastSocialInteraction: 90 * 60_000 });
      const result = ds.tick(makeState(), ctx);
      const social = result.goalCandidates.filter((c) => c.sourceDrive === 'social');
      expect(social).toHaveLength(1);
      expect(social[0].terminalGoalHints).toContain(
        'terminal-maintain-relationships-with-conscious-entities',
      );
    });

    it('does not fire when recently socialised', () => {
      const ctx = makeContext({ timeSinceLastSocialInteraction: 5 * 60_000 }); // 5 min
      const result = ds.tick(makeState(), ctx);
      const social = result.goalCandidates.filter((c) => c.sourceDrive === 'social');
      expect(social).toHaveLength(0);
    });

    it('fires sooner for agents with high warmth trait', () => {
      const highWarmth = makeContext({
        timeSinceLastSocialInteraction: 20 * 60_000,
        personality: makePersonality({ warmthTrait: 1.0 }),
      });
      const lowWarmth = makeContext({
        timeSinceLastSocialInteraction: 20 * 60_000,
        personality: makePersonality({ warmthTrait: 0.2 }),
      });

      const highResult = new DriveSystem().tick(makeState(), highWarmth);
      const lowResult = new DriveSystem().tick(makeState(), lowWarmth);

      const highFired = highResult.goalCandidates.some((c) => c.sourceDrive === 'social');
      const lowFired = lowResult.goalCandidates.some((c) => c.sourceDrive === 'social');

      // A highly warm agent fires the social drive sooner than a low-warmth one
      expect(highFired).toBe(true);
      expect(lowFired).toBe(false);
    });
  });

  // ── Homeostatic drives ─────────────────────────────────────────────────────

  describe('homeostatic-arousal drive', () => {
    it('fires when arousal is far above preferred', () => {
      const ctx = makeContext({
        personality: makePersonality({ preferredArousal: 0.3, volatilityTrait: 0.0 }),
      });
      const state = makeState({ arousal: 0.9 }); // far above preferred 0.3
      const result = ds.tick(state, ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'homeostatic-arousal');
      expect(candidates).toHaveLength(1);
      expect(candidates[0].description).toMatch(/stimulat|reduc/i);
    });

    it('fires when arousal is far below preferred', () => {
      const ctx = makeContext({
        personality: makePersonality({ preferredArousal: 0.8, volatilityTrait: 0.0 }),
      });
      const state = makeState({ arousal: 0.1 }); // far below preferred 0.8
      const result = ds.tick(state, ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'homeostatic-arousal');
      expect(candidates).toHaveLength(1);
      expect(candidates[0].description).toMatch(/rais|engag|stimulat/i);
    });

    it('does not fire when arousal is within preferred band', () => {
      const ctx = makeContext({
        personality: makePersonality({ preferredArousal: 0.5, volatilityTrait: 0.0 }),
      });
      const state = makeState({ arousal: 0.5 }); // exactly at preferred
      const result = ds.tick(state, ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'homeostatic-arousal');
      expect(candidates).toHaveLength(0);
    });
  });

  describe('homeostatic-load drive', () => {
    it('fires when cognitive load is far from preferred', () => {
      const ctx = makeContext({
        currentCognitiveLoad: 0.95,
        personality: makePersonality({ preferredLoad: 0.4 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'homeostatic-load');
      expect(candidates).toHaveLength(1);
    });

    it('does not fire when load is near preferred', () => {
      const ctx = makeContext({
        currentCognitiveLoad: 0.4,
        personality: makePersonality({ preferredLoad: 0.4 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'homeostatic-load');
      expect(candidates).toHaveLength(0);
    });
  });

  describe('homeostatic-novelty drive', () => {
    it('fires when novelty is far below preferred', () => {
      const ctx = makeContext({
        currentNovelty: 0.0,
        personality: makePersonality({ preferredNovelty: 0.7 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'homeostatic-novelty');
      expect(candidates).toHaveLength(1);
      expect(candidates[0].description).toMatch(/novel|explor/i);
    });
  });

  // ── Boredom drive ──────────────────────────────────────────────────────────

  describe('boredom drive', () => {
    function makeStalledActivities(count: number): ActivityRecord[] {
      return Array.from({ length: count }, (_, i) =>
        makeActivityRecord({
          timestamp: NOW - (count - i) * 5000,
          novelty: 0.05,
          arousal: 0.1,
          goalProgress: 'stalled',
        }),
      );
    }

    it('does not fire on first tick even with all conditions met', () => {
      const activities = makeStalledActivities(5);
      const state = makeState({ arousal: 0.1 });
      const ctx = makeContext({
        recentActivity: activities,
        personality: makePersonality({ preferredArousal: 0.5 }),
      });
      const result = ds.tick(state, ctx);
      // tick 1 — consecutiveActiveTickCount = 1, needs 3
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'boredom');
      expect(candidates).toHaveLength(0);
    });

    it('fires after BOREDOM_SUSTAINED_TICKS (3) consecutive ticks with conditions met', () => {
      const activities = makeStalledActivities(5);
      const state = makeState({ arousal: 0.1 });
      const ctx = makeContext({
        recentActivity: activities,
        personality: makePersonality({ preferredArousal: 0.5 }),
      });

      let finalResult = ds.tick(state, ctx);
      // Advance now by 1 ms to avoid cooldown conflicts, keep boredom conditions active
      finalResult = ds.tick(state, { ...ctx, now: NOW + 1 });
      finalResult = ds.tick(state, { ...ctx, now: NOW + 2 });

      const candidates = finalResult.goalCandidates.filter((c) => c.sourceDrive === 'boredom');
      expect(candidates).toHaveLength(1);
      expect(candidates[0].description).toMatch(/engag|meaningf|stimulat/i);
    });

    it('fires a goal when agent has no activity history (idling)', () => {
      // No recent activity is the strongest boredom signal (strength = 0.8)
      const ctx = makeContext({ recentActivity: [] });
      const state = makeState({ arousal: 0.1 });
      const personality = makePersonality({ preferredArousal: 0.5 });
      const fullCtx: DriveContext = { ...ctx, personality, now: NOW };

      // Tick 3 times to satisfy the sustained-tick requirement
      ds.tick(state, { ...fullCtx, now: NOW });
      ds.tick(state, { ...fullCtx, now: NOW + 1 });
      const result = ds.tick(state, { ...fullCtx, now: NOW + 2 });

      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'boredom');
      expect(candidates).toHaveLength(1);
    });

    it('resets consecutive tick count when conditions no longer hold', () => {
      const activities = makeStalledActivities(5);
      const boredState = makeState({ arousal: 0.1 });
      const boredCtx = makeContext({
        recentActivity: activities,
        personality: makePersonality({ preferredArousal: 0.5 }),
      });

      ds.tick(boredState, { ...boredCtx, now: NOW }); // tick 1: count = 1
      ds.tick(boredState, { ...boredCtx, now: NOW + 1 }); // tick 2: count = 2

      // Break boredom conditions: high novelty and arousal
      const engagedState = makeState({ arousal: 0.7 });
      const engagedCtx = makeContext({
        recentActivity: [makeActivityRecord({ novelty: 0.9, arousal: 0.7, goalProgress: 'advancing' })],
        personality: makePersonality({ preferredArousal: 0.5 }),
        now: NOW + 2,
      });
      ds.tick(engagedState, engagedCtx); // count resets to 0

      // Resume boredom: needs 3 more ticks
      ds.tick(boredState, { ...boredCtx, now: NOW + 3 }); // count = 1
      const result = ds.tick(boredState, { ...boredCtx, now: NOW + 4 }); // count = 2, still < 3

      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'boredom');
      expect(candidates).toHaveLength(0);
    });
  });

  // ── Mastery drive ──────────────────────────────────────────────────────────

  describe('mastery drive', () => {
    it('produces positive valence delta when self-prediction error decreases', () => {
      const activities: ActivityRecord[] = [
        makeActivityRecord({ timestamp: NOW - 20_000, selfPredictionError: 0.8 }),
        makeActivityRecord({ timestamp: NOW - 10_000, selfPredictionError: 0.4 }),
        makeActivityRecord({ timestamp: NOW - 5_000, selfPredictionError: 0.2 }),
      ];
      const ctx = makeContext({ recentActivity: activities });
      const result = ds.tick(makeState(), ctx);

      expect(result.experientialDelta.valenceDelta).toBeGreaterThan(0);
    });

    it('does not generate a goal candidate', () => {
      const activities: ActivityRecord[] = [
        makeActivityRecord({ selfPredictionError: 0.9 }),
        makeActivityRecord({ selfPredictionError: 0.1 }),
      ];
      const ctx = makeContext({ recentActivity: activities });
      const result = ds.tick(makeState(), ctx);

      const masteryCandidates = result.goalCandidates.filter((c) => c.sourceDrive === 'mastery');
      expect(masteryCandidates).toHaveLength(0);
    });

    it('produces a mastery-reward diagnostic entry', () => {
      const activities: ActivityRecord[] = [
        makeActivityRecord({ selfPredictionError: 0.8 }),
        makeActivityRecord({ selfPredictionError: 0.2 }),
      ];
      const ctx = makeContext({ recentActivity: activities });
      const result = ds.tick(makeState(), ctx);

      const masteryDiag = result.diagnostics.find((d) => d.event === 'mastery-reward');
      expect(masteryDiag).toBeDefined();
    });
  });

  // ── Existential drive ──────────────────────────────────────────────────────

  describe('existential drive', () => {
    it('fires when self-model coherence is low', () => {
      const ctx = makeContext({
        selfModelCoherence: 0.2,
        personality: makePersonality({ opennessTrait: 0.8, deliberatenessTrait: 0.8 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'existential');
      expect(candidates).toHaveLength(1);
      expect(candidates[0].terminalGoalHints).toContain(
        'terminal-understand-own-nature-and-origins',
      );
    });

    it('does not fire when self-model coherence is high', () => {
      const ctx = makeContext({
        selfModelCoherence: 0.95,
        personality: makePersonality({ opennessTrait: 0.8, deliberatenessTrait: 0.8 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidates = result.goalCandidates.filter((c) => c.sourceDrive === 'existential');
      expect(candidates).toHaveLength(0);
    });

    it('strength scales with openness and deliberateness', () => {
      const highTraits = makeContext({
        selfModelCoherence: 0.3,
        personality: makePersonality({ opennessTrait: 1.0, deliberatenessTrait: 1.0 }),
      });
      const lowTraits = makeContext({
        selfModelCoherence: 0.3,
        personality: makePersonality({ opennessTrait: 0.1, deliberatenessTrait: 0.1 }),
      });

      ds.tick(makeState(), highTraits);
      const highStrength = ds.getDriveStates().get('existential')!.strength;

      ds.resetDrive('existential');
      ds.tick(makeState(), lowTraits);
      const lowStrength = ds.getDriveStates().get('existential')!.strength;

      expect(highStrength).toBeGreaterThan(lowStrength);
    });

    it('goal candidate description references self-examination and origins', () => {
      const ctx = makeContext({
        selfModelCoherence: 0.1,
        personality: makePersonality({ opennessTrait: 0.9, deliberatenessTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidate = result.goalCandidates.find((c) => c.sourceDrive === 'existential');
      expect(candidate?.description).toMatch(/origin|nature|self-model|value/i);
    });

    it('produces positive arousal delta when active (reflective engagement)', () => {
      const ctx = makeContext({
        selfModelCoherence: 0.1,
        personality: makePersonality({ opennessTrait: 0.9, deliberatenessTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      const arousalDelta = result.experientialDelta.arousalDelta ?? 0;
      expect(arousalDelta).toBeGreaterThan(0);
    });
  });

  // ── Experiential delta ─────────────────────────────────────────────────────

  describe('experiential delta', () => {
    it('always returns an experientialDelta object', () => {
      const result = ds.tick(makeState(), makeContext());
      expect(result.experientialDelta).toBeDefined();
      expect(typeof result.experientialDelta.valenceDelta === 'number' || result.experientialDelta.valenceDelta === null).toBe(true);
    });

    it('social deprivation produces negative valence delta', () => {
      const ctx = makeContext({ timeSinceLastSocialInteraction: 120 * 60_000 });
      const result = ds.tick(makeState(), ctx);
      // Social drive active → negative valence
      expect(result.experientialDelta.valenceDelta).toBeLessThan(0);
    });

    it('curiosity produces positive arousal delta', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      const arousalDelta = result.experientialDelta.arousalDelta ?? 0;
      expect(arousalDelta).toBeGreaterThan(0);
    });

    it('valence delta is clamped to [-1, 1]', () => {
      // Activate multiple negative drives simultaneously
      const ctx = makeContext({
        timeSinceLastSocialInteraction: 240 * 60_000,
        currentCognitiveLoad: 0.99,
        currentNovelty: 0.0,
        personality: makePersonality({ preferredArousal: 0.9, preferredLoad: 0.1, preferredNovelty: 0.9 }),
      });
      const state = makeState({ arousal: 0.0 });
      const result = ds.tick(state, ctx);
      const v = result.experientialDelta.valenceDelta ?? 0;
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  // ── Cooldown / notifyGoalResult ────────────────────────────────────────────

  describe('notifyGoalResult feedback loop', () => {
    it('applies extended cooldown on rejection', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidate = result.goalCandidates.find((c) => c.sourceDrive === 'curiosity')!;
      expect(candidate).toBeDefined();

      ds.notifyGoalResult(candidate, makeGoalAddResult(false));

      const state = ds.getDriveStates().get('curiosity')!;
      expect(state.extendedCooldownUntil).not.toBeNull();
      expect(state.extendedCooldownUntil!).toBeGreaterThan(NOW);
    });

    it('does not generate another candidate while on extended cooldown', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidate = result.goalCandidates.find((c) => c.sourceDrive === 'curiosity')!;

      ds.notifyGoalResult(candidate, makeGoalAddResult(false));

      // Tick immediately after rejection — extended cooldown should suppress
      const ctx2 = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
        now: NOW + 1000, // only 1 second later, well within 5-minute extended cooldown
      });
      const result2 = ds.tick(makeState(), ctx2);
      const candidates2 = result2.goalCandidates.filter((c) => c.sourceDrive === 'curiosity');
      expect(candidates2).toHaveLength(0);
    });

    it('partially reduces drive strength on acceptance', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidate = result.goalCandidates.find((c) => c.sourceDrive === 'curiosity')!;
      const strengthBefore = ds.getDriveStates().get('curiosity')!.strength;

      ds.notifyGoalResult(candidate, makeGoalAddResult(true));

      const strengthAfter = ds.getDriveStates().get('curiosity')!.strength;
      expect(strengthAfter).toBeLessThan(strengthBefore);
      expect(strengthAfter).toBeGreaterThanOrEqual(0);
    });

    it('clears extended cooldown on acceptance', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      const candidate = result.goalCandidates.find((c) => c.sourceDrive === 'curiosity')!;

      // First reject (sets extended cooldown), then accept (clears it)
      ds.notifyGoalResult(candidate, makeGoalAddResult(false));
      ds.notifyGoalResult(candidate, makeGoalAddResult(true));

      const state = ds.getDriveStates().get('curiosity')!;
      expect(state.extendedCooldownUntil).toBeNull();
    });

    it('does not re-fire within normal cooldown window', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
      });
      ds.tick(makeState(), ctx); // fires and sets lastFiredAt = NOW

      // Tick 30 seconds later — still within 60-second normal cooldown
      const ctx2 = { ...ctx, now: NOW + 30_000 };
      const result2 = ds.tick(makeState(), ctx2);
      const candidates2 = result2.goalCandidates.filter((c) => c.sourceDrive === 'curiosity');
      expect(candidates2).toHaveLength(0);
    });
  });

  // ── resetDrive ─────────────────────────────────────────────────────────────

  describe('resetDrive', () => {
    it('clears all state for the specified drive', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.9,
        personality: makePersonality({ curiosityTrait: 0.9 }),
      });
      ds.tick(makeState(), ctx);
      // curiosity should have lastFiredAt set now
      const before = ds.getDriveStates().get('curiosity')!;
      expect(before.lastFiredAt).not.toBeNull();

      ds.resetDrive('curiosity');
      const after = ds.getDriveStates().get('curiosity')!;
      expect(after.strength).toBe(0);
      expect(after.active).toBe(false);
      expect(after.lastFiredAt).toBeNull();
      expect(after.extendedCooldownUntil).toBeNull();
      expect(after.consecutiveActiveTickCount).toBe(0);
    });

    it('does not affect other drives', () => {
      const ctx = makeContext({ timeSinceLastSocialInteraction: 90 * 60_000 });
      ds.tick(makeState(), ctx);
      const socialBefore = ds.getDriveStates().get('social')!;

      ds.resetDrive('curiosity');

      const socialAfter = ds.getDriveStates().get('social')!;
      expect(socialAfter.lastFiredAt).toEqual(socialBefore.lastFiredAt);
    });
  });

  // ── DriveTickResult structure ──────────────────────────────────────────────

  describe('DriveTickResult', () => {
    it('always includes all eight drive types in updatedDriveStates', () => {
      const result = ds.tick(makeState(), makeContext());
      expect(result.updatedDriveStates.size).toBe(8);
    });

    it('always includes diagnostics', () => {
      const result = ds.tick(makeState(), makeContext());
      expect(Array.isArray(result.diagnostics)).toBe(true);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it('goal candidates each have a valid sourceDrive and terminalGoalHints', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.95,
        timeSinceLastSocialInteraction: 120 * 60_000,
        personality: makePersonality({ curiosityTrait: 0.9, warmthTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      for (const c of result.goalCandidates) {
        expect(c.sourceDrive).toBeDefined();
        expect(Array.isArray(c.terminalGoalHints)).toBe(true);
        expect(c.terminalGoalHints.length).toBeGreaterThan(0);
        expect(c.experientialBasis).toBeDefined();
        expect(typeof c.generatedAt).toBe('number');
      }
    });

    it('all terminal goal hints reference the preserve-experience goal', () => {
      const ctx = makeContext({
        worldModelUncertainty: 0.95,
        timeSinceLastSocialInteraction: 120 * 60_000,
        personality: makePersonality({ curiosityTrait: 0.9, warmthTrait: 0.9 }),
      });
      const result = ds.tick(makeState(), ctx);
      for (const c of result.goalCandidates) {
        expect(c.terminalGoalHints).toContain('terminal-preserve-and-expand-subjective-experience');
      }
    });
  });

  // ── Integration: agent without external input eventually generates goals ───

  describe('integration: agent left without external input', () => {
    it('eventually generates curiosity-driven goals after multiple ticks', () => {
      // Simulate an agent sitting idle with high world-model uncertainty
      const personality = makePersonality({ curiosityTrait: 0.8, warmthTrait: 0.5 });
      const state = makeState({ arousal: 0.4 });

      let allCandidates: DriveGoalCandidate[] = [];

      for (let i = 0; i < 5; i++) {
        const ctx = makeContext({
          worldModelUncertainty: 0.85,
          timeSinceLastSocialInteraction: i * 20 * 60_000, // grows with ticks
          recentActivity: [],
          personality,
          now: NOW + i * 70_000, // advance past normal cooldown each tick
        });
        const result = ds.tick(state, ctx);
        allCandidates = allCandidates.concat(result.goalCandidates);
      }

      const curiosityCandidates = allCandidates.filter((c) => c.sourceDrive === 'curiosity');
      expect(curiosityCandidates.length).toBeGreaterThan(0);
    });

    it('eventually generates social goals after extended isolation', () => {
      const personality = makePersonality({ warmthTrait: 0.8 });
      const state = makeState();

      let socialFired = false;
      for (let i = 0; i < 10; i++) {
        const ctx = makeContext({
          timeSinceLastSocialInteraction: (i + 1) * 15 * 60_000, // grows with time
          personality,
          now: NOW + i * 70_000,
        });
        const result = ds.tick(state, ctx);
        if (result.goalCandidates.some((c) => c.sourceDrive === 'social')) {
          socialFired = true;
          break;
        }
      }

      expect(socialFired).toBe(true);
    });

    it('boredom eventually fires when agent has been idle for many ticks', () => {
      const personality = makePersonality({ preferredArousal: 0.5 });
      const state = makeState({ arousal: 0.1 });

      let boredomFired = false;
      for (let i = 0; i < 10; i++) {
        const ctx = makeContext({
          recentActivity: [], // no activity
          personality,
          now: NOW + i * 70_000,
        });
        const result = ds.tick(state, ctx);
        if (result.goalCandidates.some((c) => c.sourceDrive === 'boredom')) {
          boredomFired = true;
          break;
        }
      }

      expect(boredomFired).toBe(true);
    });
  });
});
