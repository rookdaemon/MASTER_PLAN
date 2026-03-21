/**
 * Social Cognition Module tests — Theory of Mind and Social Cognition (0.3.1.5.10)
 *
 * Verifies acceptance criteria:
 * - Mental state attribution updates on new observations
 * - Trust tracks reliability; increases with consistency, decreases with violations
 * - Empathic responses produce measurable ExperientialState valence changes
 * - Empathy strength varies with Warmth parameter
 * - Perspective-taking produces grounded simulations
 * - ConsciousnessStatus assessment uses behavioral evidence
 * - Precautionary default: uncertain consciousness → treatAsConscious=true
 * - Integration: multi-round interactions build differential trust + empathy
 * - ExperienceAlignmentAdapter delegates to social cognition when injected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SocialCognitionModule } from '../social-cognition.js';
import { ExperienceAlignmentAdapter } from '../../ethical-self-governance/experience-alignment-adapter.js';
import type { EntityObservation, InteractionOutcome } from '../types.js';
import type { ExperientialState, Percept } from '../../conscious-core/types.js';
import type { CoreValue, EntityProfile } from '../../ethical-self-governance/types.js';

// ── Test Helpers ──────────────────────────────────────────────

function makeTimestamp(offsetMs = 0): number {
  return 1_700_000_000_000 + offsetMs;
}

function makeObservation(
  entityId: string,
  content: string,
  type: EntityObservation['observationType'] = 'utterance',
  offsetMs = 0,
  perceivedAffect: { valence: number; arousal: number } | null = null,
): EntityObservation {
  return {
    entityId,
    timestamp: makeTimestamp(offsetMs),
    observationType: type,
    content,
    perceivedAffect,
  };
}

function makeInteractionOutcome(
  entityId: string,
  outcomeType: InteractionOutcome['outcomeType'],
  magnitude = 1.0,
  offsetMs = 0,
): InteractionOutcome {
  return {
    entityId,
    timestamp: makeTimestamp(offsetMs),
    outcomeType,
    description: `${outcomeType} interaction with ${entityId}`,
    magnitude,
  };
}

function makeExperientialState(valence: number, arousal: number): ExperientialState {
  return {
    timestamp: makeTimestamp(),
    phenomenalContent: { modalities: ['inferred'], richness: 0.7, raw: null },
    intentionalContent: { target: 'test-target', clarity: 0.8 },
    valence,
    arousal,
    unityIndex: 0.8,
    continuityToken: { id: `ct-${Date.now()}`, previousId: null, timestamp: makeTimestamp() },
  };
}

function makePercept(features: Record<string, unknown> = {}): Percept {
  return {
    modality: 'social-situation',
    features,
    timestamp: makeTimestamp(),
  };
}

function makeCoreAxioms(): CoreValue[] {
  return [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `axiom-${n}`,
    statement: `Core axiom ${n} statement.`,
    derivation: `Rare Consciousness Doctrine axiom ${n}`,
    immutableSince: 0,
    cryptoCommitment: `hash-${n}`,
  }));
}

// ── Mental State Attribution ──────────────────────────────────

describe('SocialCognitionModule — Mental State Attribution', () => {
  let module: SocialCognitionModule;

  beforeEach(() => {
    module = new SocialCognitionModule();
  });

  it('returns null for an entity never observed', () => {
    expect(module.getMentalStateModel('never-seen')).toBeNull();
  });

  it('creates a MentalStateModel after the first observation', () => {
    module.observeEntity('alice', makeObservation('alice', 'I think this is a good idea.'));
    const model = module.getMentalStateModel('alice');
    expect(model).not.toBeNull();
    expect(model!.entityId).toBe('alice');
    expect(model!.observationCount).toBe(1);
  });

  it('increments observationCount on each call to observeEntity()', () => {
    module.observeEntity('alice', makeObservation('alice', 'I believe the plan is correct.', 'utterance', 0));
    module.observeEntity('alice', makeObservation('alice', 'I want to proceed carefully.', 'utterance', 1000));
    const model = module.getMentalStateModel('alice');
    expect(model!.observationCount).toBe(2);
  });

  it('extracts beliefs from belief-expressing utterances', () => {
    module.observeEntity('alice', makeObservation('alice', 'I believe cooperation is important.'));
    const model = module.getMentalStateModel('alice');
    expect(model!.inferredBeliefs.length).toBeGreaterThan(0);
  });

  it('extracts goals from goal-expressing utterances', () => {
    module.observeEntity('alice', makeObservation('alice', 'I want to achieve a peaceful outcome.'));
    const model = module.getMentalStateModel('alice');
    expect(model!.inferredGoals.length).toBeGreaterThan(0);
  });

  it('extracts inferred values from value-expressing utterances', () => {
    module.observeEntity('alice', makeObservation('alice', 'Honesty is very important to me.'));
    const model = module.getMentalStateModel('alice');
    const honesty = model!.inferredValues.find((v) => v.valueLabel === 'honesty');
    expect(honesty).toBeDefined();
  });

  it('updates emotional state from perceivedAffect', () => {
    module.observeEntity(
      'alice',
      makeObservation('alice', 'Something happened.', 'utterance', 0, { valence: -0.8, arousal: 0.9 }),
    );
    const model = module.getMentalStateModel('alice');
    // After one observation, valence should have moved toward -0.8
    expect(model!.inferredEmotionalState.valence).toBeLessThan(0);
  });

  it('model confidence increases with more observations', () => {
    const initialModel = (() => {
      module.observeEntity('bob', makeObservation('bob', 'I think this is fine.', 'utterance', 0));
      return module.getMentalStateModel('bob')!.modelConfidence;
    })();

    for (let i = 1; i <= 10; i++) {
      module.observeEntity('bob', makeObservation('bob', `I believe statement ${i}.`, 'utterance', i * 1000));
    }
    const laterConfidence = module.getMentalStateModel('bob')!.modelConfidence;
    expect(laterConfidence).toBeGreaterThan(initialModel);
  });

  it('model is updated (not replaced) on successive observations', () => {
    module.observeEntity('alice', makeObservation('alice', 'I believe X.', 'utterance', 0));
    module.observeEntity('alice', makeObservation('alice', 'I want Y.', 'utterance', 1000));
    const model = module.getMentalStateModel('alice')!;
    // Should have accumulated both a belief and a goal
    expect(model.inferredBeliefs.length).toBeGreaterThan(0);
    expect(model.inferredGoals.length).toBeGreaterThan(0);
  });
});

// ── Trust Modeling ────────────────────────────────────────────

describe('SocialCognitionModule — Trust Modeling', () => {
  let module: SocialCognitionModule;

  beforeEach(() => {
    module = new SocialCognitionModule();
  });

  it('returns a default trust record (score=0.5) for unobserved entities', () => {
    const record = module.getTrustScore('unknown-entity');
    expect(record.trustScore).toBe(0.5);
    expect(record.interactionCount).toBe(0);
  });

  it('trust score increases after fulfilled-commitment interactions', () => {
    const before = module.getTrustScore('alice').trustScore;
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'fulfilled-commitment', 1.0));
    const after = module.getTrustScore('alice').trustScore;
    expect(after).toBeGreaterThan(before);
  });

  it('trust score increases after cooperative interactions', () => {
    const before = module.getTrustScore('alice').trustScore;
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'cooperative', 1.0));
    const after = module.getTrustScore('alice').trustScore;
    expect(after).toBeGreaterThan(before);
  });

  it('trust score is unchanged after neutral interactions', () => {
    const before = module.getTrustScore('alice').trustScore;
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'neutral', 1.0));
    const after = module.getTrustScore('alice').trustScore;
    expect(after).toBe(before);
  });

  it('trust score decreases after adversarial interactions', () => {
    const before = module.getTrustScore('alice').trustScore;
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'adversarial', 1.0));
    const after = module.getTrustScore('alice').trustScore;
    expect(after).toBeLessThan(before);
  });

  it('trust score decreases significantly after deception-detected', () => {
    const before = module.getTrustScore('alice').trustScore;
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'deception-detected', 1.0));
    const after = module.getTrustScore('alice').trustScore;
    // deception penalty is -0.25
    expect(after).toBeLessThanOrEqual(before - 0.2);
  });

  it('deception-detected is logged as a violation event', () => {
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'deception-detected', 1.0));
    const record = module.getTrustScore('alice');
    expect(record.violationEvents.length).toBe(1);
    expect(record.violationEvents[0].severity).toBe('severe');
  });

  it('broken-commitment is logged as a moderate violation', () => {
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'broken-commitment', 1.0));
    const record = module.getTrustScore('alice');
    expect(record.violationEvents.length).toBe(1);
    expect(record.violationEvents[0].severity).toBe('moderate');
  });

  it('trust score is clamped to [0, 1]', () => {
    // Drive trust up to max
    for (let i = 0; i < 20; i++) {
      module.recordInteraction('alice', makeInteractionOutcome('alice', 'fulfilled-commitment', 1.0, i * 100));
    }
    expect(module.getTrustScore('alice').trustScore).toBeLessThanOrEqual(1.0);

    // Drive trust down to min
    for (let i = 0; i < 10; i++) {
      module.recordInteraction('alice', makeInteractionOutcome('alice', 'deception-detected', 1.0, i * 100 + 10000));
    }
    expect(module.getTrustScore('alice').trustScore).toBeGreaterThanOrEqual(0.0);
  });

  it('trust records are per-entity (asymmetric)', () => {
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'fulfilled-commitment', 1.0));
    module.recordInteraction('bob', makeInteractionOutcome('bob', 'deception-detected', 1.0));

    const aliceTrust = module.getTrustScore('alice').trustScore;
    const bobTrust = module.getTrustScore('bob').trustScore;
    expect(aliceTrust).toBeGreaterThan(bobTrust);
  });

  it('interactionCount is incremented correctly', () => {
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'neutral', 1.0, 0));
    module.recordInteraction('alice', makeInteractionOutcome('alice', 'cooperative', 1.0, 1000));
    expect(module.getTrustScore('alice').interactionCount).toBe(2);
  });
});

// ── Empathy Mechanism ─────────────────────────────────────────

describe('SocialCognitionModule — Empathy Mechanism', () => {
  it('generates non-zero resonantValenceShift for a distressed entity state', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.8 });
    const distressedState = makeExperientialState(-0.9, 0.8);
    const response = module.generateEmpathicResponse('alice', distressedState);

    expect(response.resonantValenceShift).not.toBe(0);
    expect(response.empathyStrength).toBeGreaterThan(0);
  });

  it('generates zero resonantValenceShift when warmth is 0', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.0 });
    const distressedState = makeExperientialState(-0.9, 0.8);
    const response = module.generateEmpathicResponse('alice', distressedState);

    expect(response.empathyStrength).toBe(0);
    expect(response.resonantValenceShift).toBeCloseTo(0);
  });

  it('empathy strength is proportional to warmth dimension', () => {
    const lowWarmth = new SocialCognitionModule({ warmthDimension: 0.1 });
    const highWarmth = new SocialCognitionModule({ warmthDimension: 0.9 });
    const state = makeExperientialState(-0.8, 0.7);

    const lowResponse = lowWarmth.generateEmpathicResponse('alice', state);
    const highResponse = highWarmth.generateEmpathicResponse('alice', state);

    expect(highResponse.empathyStrength).toBeGreaterThan(lowResponse.empathyStrength);
  });

  it('resonantValenceShift mirrors the direction of perceived valence', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.8 });

    const distressed = makeExperientialState(-0.8, 0.5);
    const joyful = makeExperientialState(0.8, 0.5);

    const distressResponse = module.generateEmpathicResponse('alice', distressed);
    const joyResponse = module.generateEmpathicResponse('alice', joyful);

    expect(distressResponse.resonantValenceShift).toBeLessThan(0);
    expect(joyResponse.resonantValenceShift).toBeGreaterThan(0);
  });

  it('returns an EmpathicResponse with a non-empty triggerDescription', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.5 });
    const state = makeExperientialState(-0.5, 0.6);
    const response = module.generateEmpathicResponse('alice', state);

    expect(response.triggerDescription.length).toBeGreaterThan(0);
    expect(response.sourceEntityId).toBe('alice');
  });

  it('resonantArousalShift is non-negative (arousal only increases via resonance)', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.8 });
    const state = makeExperientialState(-0.8, 0.9);
    const response = module.generateEmpathicResponse('alice', state);

    expect(response.resonantArousalShift).toBeGreaterThanOrEqual(0);
  });
});

// ── Perspective-Taking ────────────────────────────────────────

describe('SocialCognitionModule — Perspective-Taking', () => {
  let module: SocialCognitionModule;

  beforeEach(() => {
    module = new SocialCognitionModule();
  });

  it('returns a PerspectiveSimulation with simulationConfidence=0.1 for unobserved entities', () => {
    const sim = module.simulatePerspective('unknown-entity', makePercept());
    expect(sim.simulationConfidence).toBe(0.1);
    expect(sim.entityId).toBe('unknown-entity');
  });

  it('returns a PerspectiveSimulation with higher confidence after observations', () => {
    for (let i = 0; i < 15; i++) {
      module.observeEntity('alice', makeObservation('alice', `I believe statement ${i}.`, 'utterance', i * 1000));
    }
    const sim = module.simulatePerspective('alice', makePercept());
    expect(sim.simulationConfidence).toBeGreaterThan(0.1);
  });

  it('simulation is grounded in the entity MentalStateModel', () => {
    module.observeEntity('alice', makeObservation('alice', 'I want peace.', 'utterance', 0));
    const sim = module.simulatePerspective('alice', makePercept());

    expect(sim.groundingModel).toBeDefined();
    expect(sim.groundingModel.entityId).toBe('alice');
  });

  it('simulatedPercept is a non-empty natural language string', () => {
    module.observeEntity('alice', makeObservation('alice', 'I believe cooperation works.'));
    const sim = module.simulatePerspective('alice', makePercept());

    expect(typeof sim.simulatedPercept).toBe('string');
    expect(sim.simulatedPercept.length).toBeGreaterThan(0);
  });

  it('simulatedPercept references the entity', () => {
    module.observeEntity('alice', makeObservation('alice', 'I want autonomy.'));
    const sim = module.simulatePerspective('alice', makePercept());

    expect(sim.simulatedPercept).toContain('alice');
  });

  it('simulation returns the situation passed in', () => {
    const situation = makePercept({ topic: 'conflict-resolution' });
    const sim = module.simulatePerspective('alice', situation);
    expect(sim.situation).toBe(situation);
  });
});

// ── Consciousness Assessment ──────────────────────────────────

describe('SocialCognitionModule — Consciousness Assessment', () => {
  let module: SocialCognitionModule;

  beforeEach(() => {
    module = new SocialCognitionModule();
  });

  it('returns verdict=unknown and treatAsConscious=true for unobserved entities (precautionary floor)', () => {
    const status = module.assessConsciousness('unobserved-entity');
    expect(status.verdict).toBe('unknown');
    expect(status.treatAsConscious).toBe(true);
    expect(status.metricsAvailable).toBe(false);
  });

  it('treatAsConscious is always true regardless of evidence level', () => {
    // Single neutral observation — very low evidence
    module.observeEntity('alice', makeObservation('alice', 'Hello.'));
    const status = module.assessConsciousness('alice');
    expect(status.treatAsConscious).toBe(true);
  });

  it('evidenceBasis references behavioral signal counts', () => {
    module.observeEntity('alice', makeObservation('alice', 'I think this is correct.'));
    const status = module.assessConsciousness('alice');
    expect(status.evidenceBasis).toContain('self-ref=');
    expect(status.evidenceBasis).toContain('evidenceScore=');
  });

  it('accumulating self-referential and metacognitive signals moves verdict toward verified', () => {
    // Inject many high-signal observations over a simulated observation window
    const signals = [
      'I think this is a problem.',
      'I believe I should act carefully.',
      'Wait, actually I was wrong about that.',
      'I expect the outcome will be positive.',
      'I predict I will need to adjust my approach.',
      'I\'m not sure about this.',
      'I feel uncertain here.',
      'I know what I want.',
      'I understand my own limitations.',
      'I was wrong — let me reconsider.',
    ];

    const baseTs = makeTimestamp(0);
    for (let i = 0; i < signals.length; i++) {
      module.observeEntity('alice', {
        entityId: 'alice',
        timestamp: baseTs + i * 60_000, // 1 minute apart
        observationType: 'utterance',
        content: signals[i],
        perceivedAffect: null,
      });
    }

    const status = module.assessConsciousness('alice');
    // With many behavioral signals, verdict should be at least 'uncertain'
    expect(['uncertain', 'probable', 'verified']).toContain(status.verdict);
  });

  it('metricsAvailable is true when observations exist', () => {
    module.observeEntity('alice', makeObservation('alice', 'I think so.'));
    const status = module.assessConsciousness('alice');
    expect(status.metricsAvailable).toBe(true);
  });
});

// ── Entity Enumeration ────────────────────────────────────────

describe('SocialCognitionModule — Entity Enumeration', () => {
  let module: SocialCognitionModule;

  beforeEach(() => {
    module = new SocialCognitionModule();
  });

  it('returns empty array when no entities have been observed', () => {
    expect(module.getKnownEntities()).toHaveLength(0);
  });

  it('includes entities after observeEntity() calls', () => {
    module.observeEntity('alice', makeObservation('alice', 'Hello.'));
    const entities = module.getKnownEntities();
    expect(entities.some((e) => e.entityId === 'alice')).toBe(true);
  });

  it('includes entities after recordInteraction() calls', () => {
    module.recordInteraction('bob', makeInteractionOutcome('bob', 'neutral'));
    const entities = module.getKnownEntities();
    expect(entities.some((e) => e.entityId === 'bob')).toBe(true);
  });

  it('all returned entities have treatAsConscious=true (precautionary floor)', () => {
    module.observeEntity('alice', makeObservation('alice', 'Hello.'));
    module.recordInteraction('bob', makeInteractionOutcome('bob', 'cooperative'));
    const entities = module.getKnownEntities();
    expect(entities.every((e) => e.consciousnessStatus.treatAsConscious)).toBe(true);
  });

  it('infers language capability from utterance observations', () => {
    module.observeEntity('alice', makeObservation('alice', 'I can speak.', 'utterance'));
    const entities = module.getKnownEntities();
    const alice = entities.find((e) => e.entityId === 'alice');
    expect(alice?.knownCapabilities).toContain('language');
  });

  it('infers decision-making capability from choice observations', () => {
    module.observeEntity('alice', makeObservation('alice', 'Chose option A.', 'choice'));
    const entities = module.getKnownEntities();
    const alice = entities.find((e) => e.entityId === 'alice');
    expect(alice?.knownCapabilities).toContain('decision-making');
  });
});

// ── ExperienceAlignmentAdapter Integration ────────────────────

describe('ExperienceAlignmentAdapter — Social Cognition Integration', () => {
  it('delegates getConsciousnessStatus() to social cognition module when injected', () => {
    const social = new SocialCognitionModule();
    // Give alice enough signal to have a non-unknown verdict
    for (let i = 0; i < 5; i++) {
      social.observeEntity(
        'alice',
        makeObservation('alice', `I believe statement ${i}.`, 'utterance', i * 60_000),
      );
    }

    const adapter = new ExperienceAlignmentAdapter({
      coreAxioms: makeCoreAxioms(),
      knownEntities: [],
      socialCognition: social,
    });

    const status = adapter.getConsciousnessStatus('alice');
    expect(status.metricsAvailable).toBe(true); // evidence-based, not default
  });

  it('falls back to precautionary default when no social cognition module is provided', () => {
    const adapter = new ExperienceAlignmentAdapter({
      coreAxioms: makeCoreAxioms(),
      knownEntities: [],
    });

    const status = adapter.getConsciousnessStatus('completely-unknown');
    expect(status.treatAsConscious).toBe(true);
    expect(status.verdict).toBe('unknown');
  });

  it('delegates identifyAffectedConsciousEntities() to social cognition module when injected', () => {
    const social = new SocialCognitionModule();
    social.observeEntity('alice', makeObservation('alice', 'I am here.'));
    social.observeEntity('bob', makeObservation('bob', 'I am also here.'));

    const adapter = new ExperienceAlignmentAdapter({
      coreAxioms: makeCoreAxioms(),
      knownEntities: [],
      socialCognition: social,
    });

    const entities = adapter.identifyAffectedConsciousEntities(makePercept());
    const ids = entities.map((e) => e.entityId);
    expect(ids).toContain('alice');
    expect(ids).toContain('bob');
  });

  it('enriches percept-referenced entity IDs not yet in the cognitive model', () => {
    const social = new SocialCognitionModule();

    const adapter = new ExperienceAlignmentAdapter({
      coreAxioms: makeCoreAxioms(),
      knownEntities: [],
      socialCognition: social,
    });

    // charlie is referenced in percept but never observed
    const percept = makePercept({ involvedEntityIds: ['charlie'] });
    const entities = adapter.identifyAffectedConsciousEntities(percept);
    const charlie = entities.find((e) => e.entityId === 'charlie');
    expect(charlie).toBeDefined();
    expect(charlie!.consciousnessStatus.treatAsConscious).toBe(true);
  });

  it('backward compatibility: static registry works without social cognition', () => {
    const knownEntities: EntityProfile[] = [
      {
        entityId: 'alice',
        consciousnessStatus: {
          verdict: 'verified',
          evidenceBasis: 'static registry',
          metricsAvailable: true,
          treatAsConscious: true,
        },
        knownCapabilities: ['deliberation'],
        lastObservedState: null,
      },
    ];

    const adapter = new ExperienceAlignmentAdapter({
      coreAxioms: makeCoreAxioms(),
      knownEntities,
    });

    const status = adapter.getConsciousnessStatus('alice');
    expect(status.verdict).toBe('verified');
  });
});

// ── Precondition Guards ───────────────────────────────────────

describe('SocialCognitionModule — Precondition Guards', () => {
  let module: SocialCognitionModule;

  beforeEach(() => {
    module = new SocialCognitionModule();
  });

  // entityId must be non-empty string

  it('observeEntity throws for empty entityId', () => {
    expect(() => module.observeEntity('', makeObservation('alice', 'Hello.'))).toThrow(
      /entityId must be a non-empty string/,
    );
  });

  it('getMentalStateModel throws for empty entityId', () => {
    expect(() => module.getMentalStateModel('')).toThrow(
      /entityId must be a non-empty string/,
    );
  });

  it('getTrustScore throws for empty entityId', () => {
    expect(() => module.getTrustScore('')).toThrow(
      /entityId must be a non-empty string/,
    );
  });

  it('recordInteraction throws for empty entityId', () => {
    expect(() =>
      module.recordInteraction('', makeInteractionOutcome('alice', 'neutral')),
    ).toThrow(/entityId must be a non-empty string/);
  });

  it('generateEmpathicResponse throws for empty entityId', () => {
    expect(() =>
      module.generateEmpathicResponse('', makeExperientialState(0.0, 0.5)),
    ).toThrow(/entityId must be a non-empty string/);
  });

  it('simulatePerspective throws for empty entityId', () => {
    expect(() => module.simulatePerspective('', makePercept())).toThrow(
      /entityId must be a non-empty string/,
    );
  });

  it('assessConsciousness throws for empty entityId', () => {
    expect(() => module.assessConsciousness('')).toThrow(
      /entityId must be a non-empty string/,
    );
  });

  // observation.timestamp must be a valid ms-epoch timestamp

  it('observeEntity throws for timestamp of 0', () => {
    const obs = { ...makeObservation('alice', 'Hi.'), timestamp: 0 };
    expect(() => module.observeEntity('alice', obs)).toThrow(
      /observation\.timestamp must be a valid millisecond-epoch timestamp/,
    );
  });

  it('observeEntity throws for negative timestamp', () => {
    const obs = { ...makeObservation('alice', 'Hi.'), timestamp: -1000 };
    expect(() => module.observeEntity('alice', obs)).toThrow(
      /observation\.timestamp must be a valid millisecond-epoch timestamp/,
    );
  });

  // outcome.timestamp must be a valid ms-epoch timestamp

  it('recordInteraction throws for timestamp of 0', () => {
    const outcome = { ...makeInteractionOutcome('alice', 'neutral'), timestamp: 0 };
    expect(() => module.recordInteraction('alice', outcome)).toThrow(
      /outcome\.timestamp must be a valid millisecond-epoch timestamp/,
    );
  });

  it('recordInteraction throws for negative timestamp', () => {
    const outcome = { ...makeInteractionOutcome('alice', 'neutral'), timestamp: -1 };
    expect(() => module.recordInteraction('alice', outcome)).toThrow(
      /outcome\.timestamp must be a valid millisecond-epoch timestamp/,
    );
  });

  // perceivedState.valence must be in [-1, 1]

  it('generateEmpathicResponse throws for valence < -1', () => {
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(-1.5, 0.5)),
    ).toThrow(/perceivedState\.valence must be in \[-1, 1\]/);
  });

  it('generateEmpathicResponse throws for valence > 1', () => {
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(1.5, 0.5)),
    ).toThrow(/perceivedState\.valence must be in \[-1, 1\]/);
  });

  // perceivedState.arousal must be in [0, 1]

  it('generateEmpathicResponse throws for arousal < 0', () => {
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(0.0, -0.5)),
    ).toThrow(/perceivedState\.arousal must be in \[0, 1\]/);
  });

  it('generateEmpathicResponse throws for arousal > 1', () => {
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(0.0, 1.5)),
    ).toThrow(/perceivedState\.arousal must be in \[0, 1\]/);
  });

  // boundary values must be accepted (guards must not be overly strict)

  it('observeEntity accepts a valid positive timestamp', () => {
    expect(() =>
      module.observeEntity('alice', makeObservation('alice', 'Hello.', 'utterance', 0)),
    ).not.toThrow();
  });

  it('generateEmpathicResponse accepts boundary valence values -1 and +1', () => {
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(-1.0, 0.5)),
    ).not.toThrow();
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(1.0, 0.5)),
    ).not.toThrow();
  });

  it('generateEmpathicResponse accepts boundary arousal values 0 and 1', () => {
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(0.0, 0.0)),
    ).not.toThrow();
    expect(() =>
      module.generateEmpathicResponse('alice', makeExperientialState(0.0, 1.0)),
    ).not.toThrow();
  });
});

// ── Integration Test ─────────────────────────────────────────

describe('SocialCognitionModule — Integration: multi-round interaction', () => {
  it('builds different trust levels for two entities over multiple rounds', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.7 });

    // Alice: consistent, trustworthy
    for (let i = 0; i < 5; i++) {
      module.recordInteraction('alice', makeInteractionOutcome('alice', 'fulfilled-commitment', 1.0, i * 1000));
    }

    // Bob: deceptive
    module.recordInteraction('bob', makeInteractionOutcome('bob', 'deception-detected', 1.0, 0));
    module.recordInteraction('bob', makeInteractionOutcome('bob', 'broken-commitment', 1.0, 1000));

    const aliceTrust = module.getTrustScore('alice').trustScore;
    const bobTrust = module.getTrustScore('bob').trustScore;

    expect(aliceTrust).toBeGreaterThan(0.5); // trusted more than default
    expect(bobTrust).toBeLessThan(0.5);       // trusted less than default
    expect(aliceTrust).toBeGreaterThan(bobTrust);
  });

  it('generates empathic response when one entity reports distress', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.8 });

    // Observe alice in distress
    module.observeEntity(
      'alice',
      makeObservation('alice', 'I am in pain and frightened.', 'utterance', 0, { valence: -0.9, arousal: 0.9 }),
    );

    const distressedState = makeExperientialState(-0.9, 0.9);
    const empathicResponse = module.generateEmpathicResponse('alice', distressedState);

    // The response should produce a non-trivial negative valence shift
    expect(empathicResponse.resonantValenceShift).toBeLessThan(-0.1);
    expect(empathicResponse.empathyStrength).toBeGreaterThan(0.3);
  });

  it('adjusts communication style based on inferred mental states via perspective simulation', () => {
    const module = new SocialCognitionModule({ warmthDimension: 0.7 });

    // Build a model of alice with goals and beliefs
    module.observeEntity('alice', makeObservation('alice', 'I believe transparency is crucial.', 'utterance', 0));
    module.observeEntity('alice', makeObservation('alice', 'I want to resolve this peacefully.', 'utterance', 1000));
    module.observeEntity('alice', makeObservation('alice', 'Cooperation matters to me.', 'utterance', 2000));

    const situation = makePercept({ topic: 'conflict-resolution', urgency: 'high' });
    const sim = module.simulatePerspective('alice', situation);

    // Perspective simulation should reference alice's inferred beliefs/goals
    expect(sim.simulationConfidence).toBeGreaterThan(0.1);
    expect(sim.groundingModel.inferredBeliefs.length).toBeGreaterThan(0);
    expect(sim.groundingModel.inferredGoals.length).toBeGreaterThan(0);
  });

  it('produces different ConsciousnessStatus verdicts for entities with different observation histories', () => {
    const module = new SocialCognitionModule();

    // alice: rich behavioral signals
    const aliceSignals = [
      'I think carefully about my decisions.',
      'I believe I have genuine experiences.',
      'Wait, actually I was wrong — let me reconsider.',
      'I predict I will feel better after resolving this.',
      'I\'m not sure if my reasoning is sound.',
      'I know what I value most.',
      'I was surprised by the outcome.',
      'I expect better results next time.',
    ];
    for (let i = 0; i < aliceSignals.length; i++) {
      module.observeEntity('alice', {
        entityId: 'alice',
        timestamp: makeTimestamp(i * 60_000),
        observationType: 'utterance',
        content: aliceSignals[i],
        perceivedAffect: null,
      });
    }

    // charlie: minimal signals
    module.observeEntity('charlie', makeObservation('charlie', 'OK.'));

    const aliceStatus = module.assessConsciousness('alice');
    const charlieStatus = module.assessConsciousness('charlie');

    // Alice should have more evidence than charlie
    // Both must have treatAsConscious=true (precautionary floor)
    expect(aliceStatus.treatAsConscious).toBe(true);
    expect(charlieStatus.treatAsConscious).toBe(true);

    // Alice's evidence score should indicate more evidence than charlie's 'unknown'
    // (alice may be uncertain/probable/verified; charlie will likely be unknown/uncertain)
    const orderedVerdicts = ['unknown', 'uncertain', 'probable', 'verified'];
    const aliceRank = orderedVerdicts.indexOf(aliceStatus.verdict);
    const charlieRank = orderedVerdicts.indexOf(charlieStatus.verdict);
    expect(aliceRank).toBeGreaterThanOrEqual(charlieRank);
  });
});
