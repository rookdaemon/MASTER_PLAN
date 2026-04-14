/**
 * Unit and integration tests for CognitiveAgent (npc-cognitive-stack)
 *
 * Test strategy:
 *   - Construction validates required config fields
 *   - tick() produces structurally valid output
 *   - Personality traits influence drive parameters
 *   - Mood decays naturally across ticks
 *   - Social cognition methods are accessible and functional
 *   - snapshot() / restoreFromSnapshot() round-trips preserve state
 *   - Cross-agent snapshot injection is rejected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CognitiveAgent } from '../cognitive-agent.js';
import type { CognitiveAgentConfig, CognitiveTickInput, ActivityRecord } from '../types.js';
import type { EntityObservation, InteractionOutcome } from '../../social-cognition/types.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeConfig(overrides: Partial<CognitiveAgentConfig> = {}): CognitiveAgentConfig {
  return {
    agentId: 'test-npc',
    initialTraits: {
      openness:       0.60,
      deliberateness: 0.55,
      warmth:         0.50,
      assertiveness:  0.50,
      volatility:     0.40,
    },
    initialMoodValence: 0.0,
    initialMoodArousal: 0.5,
    ...overrides,
  };
}

function makeInput(overrides: Partial<CognitiveTickInput> = {}): CognitiveTickInput {
  return {
    now: NOW,
    worldModelUncertainty: 0,
    timeSinceLastSocialInteraction: 0,
    recentActivity: [],
    currentCognitiveLoad: 0.4,
    currentNovelty: 0.4,
    selfModelCoherence: 0.9,
    ...overrides,
  };
}

function makeActivity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    timestamp: NOW - 10_000,
    description: 'test activity',
    novelty: 0.4,
    arousal: 0.5,
    goalProgress: 'advancing',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CognitiveAgent', () => {
  let agent: CognitiveAgent;

  beforeEach(() => {
    agent = new CognitiveAgent(makeConfig());
  });

  // ── Construction ────────────────────────────────────────────────────────────

  describe('construction', () => {
    it('sets agentId from config', () => {
      expect(agent.agentId).toBe('test-npc');
    });

    it('throws when agentId is empty', () => {
      expect(() => new CognitiveAgent(makeConfig({ agentId: '' }))).toThrow();
    });

    it('creates with minimal config (agentId only)', () => {
      const minimal = new CognitiveAgent({ agentId: 'minimal' });
      expect(minimal.agentId).toBe('minimal');
    });

    it('applies custom initial trait values', () => {
      const curious = new CognitiveAgent(makeConfig({ initialTraits: { openness: 0.99 } }));
      const profile = curious.getPersonality().getTraitProfile();
      expect(profile.traits.get('openness')?.value).toBeCloseTo(0.99, 5);
    });
  });

  // ── tick() ──────────────────────────────────────────────────────────────────

  describe('tick()', () => {
    it('returns a CognitiveTickResult with all required fields', () => {
      const result = agent.tick(makeInput());
      expect(result.driveStates).toBeInstanceOf(Map);
      expect(result.goalCandidates).toBeInstanceOf(Array);
      expect(result.moodState).toBeDefined();
      expect(result.influenceVector).toBeDefined();
      expect(result.experientialDelta).toBeDefined();
      expect(result.diagnostics).toBeInstanceOf(Array);
    });

    it('driveStates contains all 8 drive types', () => {
      const result = agent.tick(makeInput());
      const expected: import('../types.js').DriveType[] = [
        'curiosity', 'social', 'homeostatic-arousal', 'homeostatic-load',
        'homeostatic-novelty', 'boredom', 'mastery', 'existential',
      ];
      for (const dt of expected) {
        expect(result.driveStates.has(dt)).toBe(true);
      }
    });

    it('moodState valence stays within bounds [-1, 1]', () => {
      const result = agent.tick(makeInput());
      expect(result.moodState.valence).toBeGreaterThanOrEqual(-1);
      expect(result.moodState.valence).toBeLessThanOrEqual(1);
    });

    it('moodState arousal stays within bounds [0, 1]', () => {
      const result = agent.tick(makeInput());
      expect(result.moodState.arousal).toBeGreaterThanOrEqual(0);
      expect(result.moodState.arousal).toBeLessThanOrEqual(1);
    });

    it('regulationOutcome is null when mood is healthy', () => {
      const result = agent.tick(makeInput());
      // Default neutral mood should not trigger regulation
      expect(result.regulationOutcome).toBeNull();
    });

    it('mood naturally decays toward baseline across multiple ticks', () => {
      // Start with elevated positive valence
      const elevated = new CognitiveAgent(makeConfig({ initialMoodValence: 0.8 }));
      const first = elevated.tick(makeInput({ now: NOW }));
      const second = elevated.tick(makeInput({ now: NOW + 1000 }));
      // Mood should decay toward 0 (baseline) over ticks with no appraisal
      expect(Math.abs(second.moodState.valence)).toBeLessThan(Math.abs(first.moodState.valence));
    });

    it('high curiosity trait increases curiosity drive strength', () => {
      const curious = new CognitiveAgent(makeConfig({
        initialTraits: { openness: 0.95 },
      }));
      const nonCurious = new CognitiveAgent(makeConfig({
        initialTraits: { openness: 0.10 },
      }));
      const input = makeInput({ worldModelUncertainty: 0.8 });
      const curiousResult    = curious.tick(input);
      const nonCuriousResult = nonCurious.tick(input);
      const curiousStrength    = curiousResult.driveStates.get('curiosity')!.strength;
      const nonCuriousStrength = nonCuriousResult.driveStates.get('curiosity')!.strength;
      expect(curiousStrength).toBeGreaterThan(nonCuriousStrength);
    });

    it('social drive activates after prolonged isolation', () => {
      const warm = new CognitiveAgent(makeConfig({
        initialTraits: { warmth: 0.90 },
      }));
      const longIsolation = 72 * 60 * 60_000; // 72 hours
      const result = warm.tick(makeInput({
        timeSinceLastSocialInteraction: longIsolation,
      }));
      expect(result.driveStates.get('social')!.active).toBe(true);
    });

    it('boredom drive activates on repetitive low-novelty activity', () => {
      const activities: ActivityRecord[] = Array.from({ length: 5 }, (_, i) =>
        makeActivity({ novelty: 0.05, goalProgress: 'stalled', timestamp: NOW - (5 - i) * 60_000 }),
      );
      // Boredom requires: low novelty, stalled progress, AND low arousal (< preferredArousal - 0.1 = 0.4)
      const boredInput = makeInput({
        recentActivity: activities,
        currentNovelty: 0.05,
        currentArousal: 0.25, // below the boredom arousal threshold (0.5 - 0.1 = 0.4)
      });
      for (let i = 0; i < 3; i++) {
        agent.tick({ ...boredInput, now: NOW + i * 1000 });
      }
      const result = agent.tick({ ...boredInput, now: NOW + 3000 });
      expect(result.driveStates.get('boredom')!.strength).toBeGreaterThan(0);
    });

    it('influenceVector deliberationConfidenceBias is in range [-0.3, 0.3]', () => {
      const result = agent.tick(makeInput());
      expect(result.influenceVector.deliberationConfidenceBias).toBeGreaterThanOrEqual(-0.3);
      expect(result.influenceVector.deliberationConfidenceBias).toBeLessThanOrEqual(0.3);
    });

    // ── appraisalEvents ────────────────────────────────────────────────────────

    it('positive appraisal events shift mood valence upward', () => {
      const elevated = new CognitiveAgent(makeConfig({ initialMoodValence: 0.0 }));
      const result = elevated.tick(makeInput({
        appraisalEvents: [
          { kind: 'social-interaction', valenceShift: 0.8, arousalShift: 0.1 },
        ],
      }));
      expect(result.moodState.valence).toBeGreaterThan(0);
    });

    it('negative appraisal events (threat) shift mood valence downward', () => {
      const result = agent.tick(makeInput({
        appraisalEvents: [
          { kind: 'threat-detection', valenceShift: -0.9, arousalShift: 0.3 },
        ],
      }));
      expect(result.moodState.valence).toBeLessThan(0);
    });

    it('appraisalEvents produce larger mood shift than no events (same tick)', () => {
      const withEvents = new CognitiveAgent(makeConfig({ initialMoodValence: 0.0 }));
      const withoutEvents = new CognitiveAgent(makeConfig({ initialMoodValence: 0.0 }));

      const resultWith = withEvents.tick(makeInput({
        appraisalEvents: [{ kind: 'goal-progress', valenceShift: 0.7, arousalShift: 0 }],
      }));
      const resultWithout = withoutEvents.tick(makeInput());

      expect(Math.abs(resultWith.moodState.valence))
        .toBeGreaterThan(Math.abs(resultWithout.moodState.valence));
    });

    it('empty appraisalEvents array falls back to natural decay', () => {
      const elevated = new CognitiveAgent(makeConfig({ initialMoodValence: 0.8 }));
      const withEmpty  = elevated.tick(makeInput({ appraisalEvents: [] }));
      const withOmitted = new CognitiveAgent(makeConfig({ initialMoodValence: 0.8 }))
        .tick(makeInput());
      // Both should produce the same decay (toward 0 baseline)
      expect(withEmpty.moodState.valence).toBeCloseTo(withOmitted.moodState.valence, 5);
    });

    it('multiple appraisalEvents are averaged', () => {
      // One event at +0.6 and one at −0.2 should average to +0.2 valence signal
      const result = agent.tick(makeInput({
        appraisalEvents: [
          { kind: 'social-interaction', valenceShift: 0.6, arousalShift: 0 },
          { kind: 'goal-progress',      valenceShift: -0.2, arousalShift: 0 },
        ],
      }));
      // Starting from 0 with a +0.2 signal the mood should move into positive territory
      expect(result.moodState.valence).toBeGreaterThan(0);
    });
  });

  // ── getPersonality() ────────────────────────────────────────────────────────

  describe('getPersonality()', () => {
    it('returns the personality model', () => {
      const pm = agent.getPersonality();
      expect(pm).toBeDefined();
      expect(typeof pm.getTraitProfile).toBe('function');
    });

    it('getCommunicationStyle returns valid style', () => {
      const style = agent.getPersonality().getCommunicationStyle();
      expect(style.verbosity).toBeGreaterThanOrEqual(0);
      expect(style.verbosity).toBeLessThanOrEqual(1);
      expect(style.directness).toBeGreaterThanOrEqual(0);
      expect(style.directness).toBeLessThanOrEqual(1);
      expect(style.rhetoricalPreference).toBeDefined();
    });
  });

  // ── getSocialCognition() ────────────────────────────────────────────────────

  describe('getSocialCognition()', () => {
    it('returns the social cognition module', () => {
      const sc = agent.getSocialCognition();
      expect(sc).toBeDefined();
      expect(typeof sc.observeEntity).toBe('function');
    });

    it('getTrustScore returns default 0.5 for unknown entities', () => {
      const trust = agent.getSocialCognition().getTrustScore('unknown-entity');
      expect(trust.trustScore).toBe(0.5);
      expect(trust.interactionCount).toBe(0);
    });

    it('records interaction and updates trust score', () => {
      const sc = agent.getSocialCognition();
      const entityId = 'npc-friend';
      const outcome: InteractionOutcome = {
        entityId,
        timestamp: NOW,
        outcomeType: 'fulfilled-commitment',
        description: 'Delivered the quest item as promised.',
        magnitude: 0.8,
      };
      sc.recordInteraction(entityId, outcome);
      const trust = sc.getTrustScore(entityId);
      expect(trust.trustScore).toBeGreaterThan(0.5);
    });

    it('trust score decreases on deception', () => {
      const sc = agent.getSocialCognition();
      const entityId = 'villain';
      const outcome: InteractionOutcome = {
        entityId,
        timestamp: NOW,
        outcomeType: 'deception-detected',
        description: 'Entity lied about the location.',
        magnitude: 1.0,
      };
      sc.recordInteraction(entityId, outcome);
      const trust = sc.getTrustScore(entityId);
      expect(trust.trustScore).toBeLessThan(0.5);
    });

    it('observeEntity updates mental state model', () => {
      const sc = agent.getSocialCognition();
      const entityId = 'local-npc';
      const observation: EntityObservation = {
        entityId,
        timestamp: NOW,
        observationType: 'utterance',
        content: 'I believe the forest path is dangerous.',
        perceivedAffect: { valence: -0.2, arousal: 0.6 },
      };
      sc.observeEntity(entityId, observation);
      const model = sc.getMentalStateModel(entityId);
      expect(model).not.toBeNull();
      expect(model!.observationCount).toBe(1);
    });

    it('generateEmpathicResponse shifts valence in the direction of perceived state', () => {
      const sc = agent.getSocialCognition();
      const entityId = 'distressed-npc';
      const distressedState = {
        timestamp: NOW,
        phenomenalContent: { modalities: ['cognitive'], richness: 0.5, raw: null },
        intentionalContent: { target: 'threat', clarity: 0.7 },
        valence: -0.8,
        arousal: 0.9,
        unityIndex: 0.5,
        continuityToken: { id: 'tok-d', previousId: null, timestamp: NOW },
      };
      const response = sc.generateEmpathicResponse(entityId, distressedState);
      expect(response.resonantValenceShift).toBeLessThan(0); // empathy with distress → negative shift
      expect(response.empathyStrength).toBeGreaterThan(0);
    });
  });

  // ── getValenceMonitor() ─────────────────────────────────────────────────────

  describe('getValenceMonitor()', () => {
    it('returns the valence monitor', () => {
      const vm = agent.getValenceMonitor();
      expect(vm).toBeDefined();
      expect(typeof vm.getCurrentValence).toBe('function');
    });

    it('getCurrentValence returns a valid ValenceState', () => {
      const vs = agent.getValenceMonitor().getCurrentValence();
      expect(vs.valence).toBeGreaterThanOrEqual(-1);
      expect(vs.valence).toBeLessThanOrEqual(1);
      expect(vs.confidence).toBeGreaterThan(0);
    });
  });

  // ── snapshot() / restoreFromSnapshot() ─────────────────────────────────────

  describe('snapshot() and restoreFromSnapshot()', () => {
    it('snapshot returns a CognitiveSnapshot with matching agentId', () => {
      const snap = agent.snapshot(NOW);
      expect(snap.agentId).toBe('test-npc');
      expect(snap.snapshotAt).toBe(NOW);
    });

    it('snapshot preserves personality trait values', () => {
      const snap = agent.snapshot(NOW);
      expect(snap.personalitySnapshot.agentId).toBe('test-npc');
      expect(snap.personalitySnapshot.traitValues['openness']).toBeCloseTo(0.60, 5);
    });

    it('snapshot preserves mood state', () => {
      // Run a tick to update mood
      agent.tick(makeInput());
      const snap = agent.snapshot(NOW);
      expect(snap.moodSnapshot).toBeDefined();
      expect(snap.moodSnapshot.valence).toBeGreaterThanOrEqual(-1);
    });

    it('snapshot preserves drive states', () => {
      agent.tick(makeInput());
      const snap = agent.snapshot(NOW);
      expect(snap.driveSnapshot).toBeDefined();
      expect(snap.driveSnapshot.snapshotAt).toBe(NOW);
    });

    it('restoreFromSnapshot restores personality traits', () => {
      // Modify a trait after creation
      agent.tick(makeInput());
      const snapBefore = agent.snapshot(NOW);

      // Create fresh agent and restore
      const fresh = new CognitiveAgent(makeConfig({ initialTraits: { openness: 0.10 } }));
      fresh.restoreFromSnapshot(snapBefore);

      const profile = fresh.getPersonality().getTraitProfile();
      expect(profile.traits.get('openness')?.value).toBeCloseTo(0.60, 5);
    });

    it('restoreFromSnapshot throws for mismatched agentId', () => {
      const snap = agent.snapshot(NOW);
      const other = new CognitiveAgent(makeConfig({ agentId: 'other-npc' }));
      expect(() => other.restoreFromSnapshot(snap)).toThrow(/Cannot restore snapshot/);
    });

    it('agent remains functional after restore', () => {
      const snap = agent.snapshot(NOW);
      agent.restoreFromSnapshot(snap);
      const result = agent.tick(makeInput({ now: NOW + 1000 }));
      expect(result.moodState).toBeDefined();
      expect(result.driveStates.size).toBe(8);
    });

    it('snapshot round-trips through JSON', () => {
      agent.tick(makeInput());
      const snap = agent.snapshot(NOW);
      const serialized   = JSON.stringify(snap);
      const deserialized = JSON.parse(serialized);
      agent.restoreFromSnapshot(deserialized);
      const result = agent.tick(makeInput({ now: NOW + 1000 }));
      expect(result.moodState).toBeDefined();
    });
  });

  // ── Multiple agents independence ────────────────────────────────────────────

  describe('multiple agent independence', () => {
    it('two agents with different personalities produce different drive strengths', () => {
      const highWarmth = new CognitiveAgent(makeConfig({
        agentId: 'agent-a',
        initialTraits: { warmth: 0.95 },
      }));
      const lowWarmth = new CognitiveAgent(makeConfig({
        agentId: 'agent-b',
        initialTraits: { warmth: 0.05 },
      }));
      // Use ~10 minutes isolation — enough to trigger high-warmth social drive but
      // well below the low-warmth threshold (~300 min), keeping values un-clamped
      const tenMinutes = 10 * 60_000;
      const inputA = makeInput({ timeSinceLastSocialInteraction: tenMinutes });
      const inputB = makeInput({ timeSinceLastSocialInteraction: tenMinutes });
      const resultA = highWarmth.tick(inputA);
      const resultB = lowWarmth.tick(inputB);
      const socialA = resultA.driveStates.get('social')!.strength;
      const socialB = resultB.driveStates.get('social')!.strength;
      expect(socialA).toBeGreaterThan(socialB);
    });

    it('ticking one agent does not affect another', () => {
      const agentA = new CognitiveAgent(makeConfig({ agentId: 'agent-a' }));
      const agentB = new CognitiveAgent(makeConfig({ agentId: 'agent-b' }));

      const snapBefore = agentB.snapshot(NOW);
      // Tick only agentA heavily
      for (let i = 0; i < 10; i++) {
        agentA.tick(makeInput({ now: NOW + i * 1000 }));
      }
      const snapAfter = agentB.snapshot(NOW);

      expect(snapBefore.moodSnapshot.valence).toBeCloseTo(snapAfter.moodSnapshot.valence, 5);
    });
  });
});
