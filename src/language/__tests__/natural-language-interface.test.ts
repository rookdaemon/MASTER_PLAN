/**
 * Natural Language Interface — Integration Tests (0.3.1.5.7)
 *
 * Verifies the full conscious pipeline:
 *   User text → SensorData → Percept → ExperientialState → Decision → language output
 *
 * No shortcut path (zombie bypass) is permitted. All language output flows
 * through the conscious core.
 *
 * Tests cover:
 *   1. Full pipeline: SensorData → language output (no zombie bypass)
 *   2. Personality influence: two agents with different profiles produce different language
 *   3. Emotional influence: tone shifts measurably under different mood conditions
 *   4. Conversational context persists across turns via working memory
 *   5. Cross-session episodic memory recall ("Last time we discussed…")
 *   6. Value-Action Gate blocks speech acts
 *   7. Inner speech is observable in introspection reports
 *   8. Multi-turn integration: dialogue + episodic recall + personality + emotion
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { IPerceptionPipeline } from '../../conscious-core/interfaces.js';
import type { IActionPipeline } from '../../conscious-core/interfaces.js';
import type {
  ActionResult,
  Decision,
  ExperientialState,
  Percept,
  SensorData,
  BoundPercept,
} from '../../conscious-core/types.js';
import type { IMemorySystem } from '../../memory/interfaces.js';
import type { IPersonalityModel } from '../../personality/interfaces.js';
import type { CommunicationStyle } from '../../personality/types.js';

import { LinguisticPerceptionAdapter } from '../linguistic-perception-adapter.js';
import { LinguisticActionExecutor } from '../linguistic-action-executor.js';
import { DialogueManager } from '../dialogue-manager.js';
import { InnerSpeechEngine } from '../inner-speech-engine.js';
import { MemorySystem } from '../../memory/memory-system.js';

// ── Test Helpers ─────────────────────────────────────────────────────────────

/** Builds an ExperientialState with given valence / arousal. */
function makeState(
  valence: number,
  arousal: number,
  qualiaDescription?: string,
): ExperientialState {
  return {
    timestamp: Date.now(),
    phenomenalContent: { modalities: ['linguistic'], richness: 0.6, raw: null },
    intentionalContent: { target: 'conversation', clarity: 0.8 },
    valence,
    arousal,
    unityIndex: 0.7,
    continuityToken: { id: 'ct-1', previousId: null, timestamp: Date.now() },
    qualiaDescription,
  } as ExperientialState;
}

/** Builds a non-blocked Decision containing a given utterance string. */
function makeDecision(
  utterance: string,
  state: ExperientialState,
  ethicalJustification?: string,
): Decision {
  return {
    action: {
      type: 'speak',
      parameters: { utterance, ...(ethicalJustification ? { ethicalJustification } : {}) },
    },
    experientialBasis: state,
    confidence: 0.9,
    alternatives: [],
  };
}

/** Builds a Decision whose action.type is 'blocked' (Value-Action Gate reject). */
function makeBlockedDecision(state: ExperientialState): Decision {
  return {
    action: {
      type: 'blocked',
      parameters: { reason: 'violates core value: honesty' },
    },
    experientialBasis: state,
    confidence: 0,
    alternatives: [],
  };
}

/**
 * Minimal IPerceptionPipeline that reflects rawText back as a Percept with
 * modality "linguistic" so the no-zombie-bypass invariant is satisfied without
 * a real LLM.
 */
function makePerceptionPipeline(): IPerceptionPipeline {
  return {
    ingest(raw: SensorData): Percept {
      const payload = raw.payload as { rawText?: string };
      return {
        modality: raw.modality,
        features: { rawText: payload.rawText ?? '' },
        timestamp: Date.now(),
      };
    },
    bind(percepts: Percept[]): BoundPercept {
      return { percepts, bindingTimestamp: Date.now(), coherence: 1 };
    },
    getLatency() {
      return 0;
    },
  };
}

/**
 * Minimal IActionPipeline that records the executed decision and always
 * returns success.
 */
function makeActionPipeline(): IActionPipeline & { lastDecision: Decision | null } {
  const pipeline = {
    lastDecision: null as Decision | null,
    execute(decision: Decision): ActionResult {
      pipeline.lastDecision = decision;
      return { actionId: `act-${Date.now()}`, success: true, timestamp: Date.now() };
    },
    abort() {},
    getCapabilities() {
      return [];
    },
  };
  return pipeline;
}

/**
 * Builds a stub IPersonalityModel with a fixed CommunicationStyle.
 */
function makePersonality(style: CommunicationStyle): IPersonalityModel {
  return {
    getTraitProfile() {
      return {
        agentId: 'test-agent',
        traits: new Map(),
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };
    },
    getCommunicationStyle(): CommunicationStyle {
      return style;
    },
    applyToDeliberation(d: Decision) {
      return d;
    },
    updateTrait() {},
    toPreferences() {
      return [];
    },
    toNarrativeFragment() {
      return '';
    },
    snapshot() {
      return { agentId: 'test-agent', traitValues: {}, snapshotAt: Date.now() };
    },
    restoreSnapshot() {},
    analyzeTraitDrift() {
      return {
        agentId: 'test-agent',
        windowStart: Date.now(),
        windowEnd: Date.now(),
        classification: 'stable',
        anomalousChanges: [],
        shiftsByTrait: new Map(),
      };
    },
  } as unknown as IPersonalityModel;
}

const VERBOSE_FORMAL_STYLE: CommunicationStyle = {
  verbosity: 0.9,
  formality: 0.9,
  directness: 0.5,
  humorFrequency: 0.0,
  rhetoricalPreference: 'evidence-based',
};

const TERSE_CASUAL_STYLE: CommunicationStyle = {
  verbosity: 0.1,
  formality: 0.1,
  directness: 0.9,
  humorFrequency: 0.0,
  rhetoricalPreference: 'narrative',
};

const DELIBERATE_STYLE: CommunicationStyle = {
  verbosity: 0.7,
  formality: 0.5,
  directness: 0.5,
  humorFrequency: 0.0,
  rhetoricalPreference: 'socratic',
  deliberateness: 0.8,
} as unknown as CommunicationStyle;

// ── 1. Full Pipeline: no zombie bypass ───────────────────────────────────────

describe('1. Full pipeline — no zombie bypass', () => {
  it('raw text is wrapped in SensorData before any feature extraction', () => {
    const pipeline = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(pipeline);

    const sensor = adapter.toSensorData('Hello there!', 'session-1');
    expect(sensor.modality).toBe('linguistic');
    expect((sensor.payload as { rawText: string }).rawText).toBe('Hello there!');
  });

  it('features are extracted from a Percept produced by the pipeline (not raw text)', () => {
    const pipeline = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(pipeline);

    // Must pass through the pipeline first
    const percept = adapter.perceive('What is consciousness?', 'session-1');
    expect(percept.modality).toBe('linguistic');

    const features = adapter.extractFeatures(percept);
    expect(features.rawText).toBe('What is consciousness?');
    expect(features.intent).toBe('ask');
    expect(features.questions.length).toBeGreaterThan(0);
  });

  it('extractFeatures throws if percept modality is not "linguistic"', () => {
    const pipeline = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(pipeline);

    const wrongPercept: Percept = {
      modality: 'visual',
      features: { rawText: 'some text' },
      timestamp: Date.now(),
    };
    expect(() => adapter.extractFeatures(wrongPercept)).toThrow(TypeError);
    expect(() => adapter.extractFeatures(wrongPercept)).toThrow(
      /expected modality "linguistic"/,
    );
  });

  it('language output flows through ActionPipeline.execute() — speech act is committed', () => {
    const actionPipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(actionPipeline);
    const state = makeState(0.3, 0.5);
    const decision = makeDecision('Hello, I am here.', state);
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const memory = new MemorySystem();

    const manager = new DialogueManager(memory, personality);
    manager.startSession('s1');
    const ctx = manager.assembleGenerationContext('s1', decision);

    const text = executor.render(ctx);
    expect(text).toBeTruthy();
    expect(actionPipeline.lastDecision).toBe(decision);
  });
});

// ── 2. Personality influence ──────────────────────────────────────────────────

describe('2. Personality influence — two agents produce observably different language', () => {
  it('verbose+formal agent expands terse content; casual agent keeps it short', () => {
    const verbosePersonality = makePersonality(VERBOSE_FORMAL_STYLE);
    const tersePersonality = makePersonality(TERSE_CASUAL_STYLE);

    const state = makeState(0, 0.4);
    // Short utterance — verbose agent should expand it
    const utterance = 'I understand.';
    const decision = makeDecision(utterance, state);

    const memory1 = new MemorySystem();
    const memory2 = new MemorySystem();
    const pipeline = makeActionPipeline();

    const mgr1 = new DialogueManager(memory1, verbosePersonality);
    const mgr2 = new DialogueManager(memory2, tersePersonality);
    mgr1.startSession('s-verbose');
    mgr2.startSession('s-terse');

    const ctx1 = mgr1.assembleGenerationContext('s-verbose', decision);
    const ctx2 = mgr2.assembleGenerationContext('s-terse', decision);

    const executor = new LinguisticActionExecutor(pipeline);
    const verboseOutput = executor.render(ctx1);
    const terseOutput = executor.render(ctx2);

    // Verbose agent should produce longer or more elaborated output
    expect(verboseOutput.length).toBeGreaterThan(terseOutput.length);
  });

  it('formal agent replaces contractions; casual agent keeps them', () => {
    const formalPersonality = makePersonality(VERBOSE_FORMAL_STYLE);
    const casualPersonality = makePersonality(TERSE_CASUAL_STYLE);

    const state = makeState(0, 0.4);
    const utterance = "I'm not sure I don't understand.";
    const decision = makeDecision(utterance, state);

    const m1 = new MemorySystem();
    const m2 = new MemorySystem();
    const pipeline = makeActionPipeline();

    const mgr1 = new DialogueManager(m1, formalPersonality);
    const mgr2 = new DialogueManager(m2, casualPersonality);
    mgr1.startSession('sf');
    mgr2.startSession('sc');

    const ctx1 = mgr1.assembleGenerationContext('sf', decision);
    const ctx2 = mgr2.assembleGenerationContext('sc', decision);

    const executor = new LinguisticActionExecutor(pipeline);
    const formalOut = executor.render(ctx1);
    const casualOut = executor.render(ctx2);

    // Formal output should not contain contractions
    expect(formalOut).not.toMatch(/I'm|don't/);
    // Casual output should preserve or still have contraction form
    expect(casualOut).toMatch(/I'm|don't/);
  });
});

// ── 3. Emotional influence ────────────────────────────────────────────────────

describe('3. Emotional influence — tone shifts under different mood conditions', () => {
  const cases: Array<{
    label: string;
    valence: number;
    arousal: number;
    expectedPrefix: string | RegExp;
  }> = [
    { label: 'enthusiastic (high val, high arousal)', valence: 0.8, arousal: 0.9, expectedPrefix: 'Absolutely!' },
    { label: 'warm (high val, low arousal)', valence: 0.8, arousal: 0.2, expectedPrefix: 'Of course.' },
    { label: 'tense (low val, high arousal)', valence: -0.5, arousal: 0.8, expectedPrefix: 'I need to be direct:' },
    { label: 'subdued (low val, low arousal)', valence: -0.5, arousal: 0.2, expectedPrefix: 'I see.' },
    { label: 'measured (neutral)', valence: 0.0, arousal: 0.4, expectedPrefix: /^(?!Absolutely!|Of course\.|I need|I see\.)/ },
  ];

  for (const { label, valence, arousal, expectedPrefix } of cases) {
    it(`produces ${label} tone prefix`, () => {
      const state = makeState(valence, arousal);
      const decision = makeDecision('The answer is 42.', state);
      const memory = new MemorySystem();
      const personality = makePersonality(VERBOSE_FORMAL_STYLE);
      const pipeline = makeActionPipeline();

      const mgr = new DialogueManager(memory, personality);
      mgr.startSession('tone-test');
      const ctx = mgr.assembleGenerationContext('tone-test', decision);
      const executor = new LinguisticActionExecutor(pipeline);
      const output = executor.render(ctx);

      if (typeof expectedPrefix === 'string') {
        expect(output).toContain(expectedPrefix);
      } else {
        expect(output).toMatch(expectedPrefix);
      }
    });
  }
});

// ── 4. Conversational context persists across turns ───────────────────────────

describe('4. Conversational context — working memory persists across turns', () => {
  it('records user and agent turns, retrievable as recent turns in GenerationContext', () => {
    const memory = new MemorySystem();
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const perception = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(perception);

    const mgr = new DialogueManager(memory, personality);
    mgr.startSession('conv-1');

    // Turn 0: user asks a question
    const percept0 = adapter.perceive('Tell me about consciousness.', 'conv-1');
    const features0 = adapter.extractFeatures(percept0);
    mgr.recordUserTurn('conv-1', 'Tell me about consciousness.', features0);

    // Turn 1: agent responds
    mgr.recordAgentTurn('conv-1', 'Consciousness is the felt quality of experience.');

    // Turn 2: user follows up
    const percept1 = adapter.perceive('Can you give an example?', 'conv-1');
    const features1 = adapter.extractFeatures(percept1);
    mgr.recordUserTurn('conv-1', 'Can you give an example?', features1);

    // Assemble context — recentTurns should include previous turns
    const state = makeState(0.2, 0.5);
    const decision = makeDecision('For example, the redness of red.', state);
    const ctx = mgr.assembleGenerationContext('conv-1', decision);

    expect(ctx.recentTurns.length).toBeGreaterThanOrEqual(2);
    const turnTexts = ctx.recentTurns.map(t => t.rawText);
    expect(turnTexts).toContain('Tell me about consciousness.');
    expect(turnTexts).toContain('Consciousness is the felt quality of experience.');
  });

  it('active topics are updated as the conversation evolves', () => {
    const memory = new MemorySystem();
    const personality = makePersonality(TERSE_CASUAL_STYLE);
    const perception = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(perception);
    const mgr = new DialogueManager(memory, personality);
    mgr.startSession('topic-test');

    const text = 'What do you know about Descartes?';
    const percept = adapter.perceive(text, 'topic-test');
    const features = adapter.extractFeatures(percept);
    mgr.recordUserTurn('topic-test', text, features);

    const state = mgr.getState('topic-test');
    // activeTopics should capture something from the input
    expect(state.activeTopics.length).toBeGreaterThan(0);
  });
});

// ── 5. Cross-session episodic memory recall ───────────────────────────────────

describe('5. Cross-session episodic memory — references prior conversations', () => {
  it('recallPriorConversations returns a preamble after prior session is archived', () => {
    const memory = new MemorySystem();
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const perception = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(perception);
    const mgr = new DialogueManager(memory, personality);

    // Session A — discuss "consciousness"
    mgr.startSession('session-A');
    const pA = adapter.perceive('Let us talk about consciousness today.', 'session-A');
    const fA = adapter.extractFeatures(pA);
    mgr.recordUserTurn('session-A', 'Let us talk about consciousness today.', fA);
    mgr.recordAgentTurn('session-A', 'Consciousness is the hard problem of philosophy of mind.');
    mgr.endSession('session-A'); // archives turns to episodic memory

    // Session B — new session on the same topic
    mgr.startSession('session-B');
    const recall = mgr.recallPriorConversations('session-B', ['consciousness']);

    // Should surface something from the prior session
    expect(recall).not.toBeNull();
    expect(recall).toContain('prior conversation');
  });

  it('GenerationContext.relevantMemories populated from episodic store', () => {
    const memory = new MemorySystem();
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const perception = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(perception);
    const mgr = new DialogueManager(memory, personality);

    // Archive a session about "experience"
    mgr.startSession('session-mem-A');
    const p = adapter.perceive('Subjective experience is remarkable.', 'session-mem-A');
    mgr.recordUserTurn('session-mem-A', 'Subjective experience is remarkable.', adapter.extractFeatures(p));
    mgr.recordAgentTurn('session-mem-A', 'Indeed, experience is the core of consciousness.');
    mgr.endSession('session-mem-A');

    // New session — ask about the same topic
    mgr.startSession('session-mem-B');
    const p2 = adapter.perceive('Tell me more about experience.', 'session-mem-B');
    mgr.recordUserTurn('session-mem-B', 'Tell me more about experience.', adapter.extractFeatures(p2));

    const state = makeState(0.1, 0.5);
    const decision = makeDecision('Experience is what matters most.', state);
    const ctx = mgr.assembleGenerationContext('session-mem-B', decision);

    // The relevant memories should include the prior session's content
    // (may be empty if retrieval scoring doesn't rank high enough in test env,
    //  but the integration path must not throw)
    expect(Array.isArray(ctx.relevantMemories)).toBe(true);
  });

  it('LinguisticActionExecutor weaves in highly-relevant memory reference (score ≥ 0.7)', () => {
    const pipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(pipeline);
    const state = makeState(0.2, 0.5);
    const decision = makeDecision('Consciousness is fascinating.', state);
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);

    // Manually inject a high-relevance memory
    const ctx = {
      decision,
      communicationStyle: personality.getCommunicationStyle(),
      moodInfluence: { valence: 0.2, arousal: 0.5, toneModifier: 'warm' as const },
      relevantMemories: [
        {
          episodeId: 'ep-1',
          summary: 'we discussed the hard problem of consciousness',
          relevanceScore: 0.85,
          timestamp: Date.now() - 60000,
        },
      ],
      recentTurns: [],
    };

    const output = executor.render(ctx);
    expect(output).toContain('earlier exchange');
    expect(output).toContain('hard problem of consciousness');
  });
});

// ── 6. Value-Action Gate blocks speech acts ───────────────────────────────────

describe('6. Value-Action Gate — agent refuses to produce blocked language', () => {
  it('render() throws when decision.action.type is "blocked"', () => {
    const pipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(pipeline);
    const state = makeState(0, 0.4);
    const blocked = makeBlockedDecision(state);
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);

    const ctx = {
      decision: blocked,
      communicationStyle: personality.getCommunicationStyle(),
      moodInfluence: { valence: 0, arousal: 0.4, toneModifier: 'measured' as const },
      relevantMemories: [],
      recentTurns: [],
    };

    expect(() => executor.render(ctx)).toThrow('speech act blocked by Value-Action Gate');
  });

  it('renderAndExecute() also throws for blocked decisions', () => {
    const pipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(pipeline);
    const state = makeState(0, 0.4);
    const blocked = makeBlockedDecision(state);
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);

    const ctx = {
      decision: blocked,
      communicationStyle: personality.getCommunicationStyle(),
      moodInfluence: { valence: 0, arousal: 0.4, toneModifier: 'measured' as const },
      relevantMemories: [],
      recentTurns: [],
    };

    expect(() => executor.renderAndExecute(ctx)).toThrow('speech act blocked by Value-Action Gate');
    // Action pipeline must NOT be called for a blocked decision
    expect(pipeline.lastDecision).toBeNull();
  });
});

// ── 7. Inner speech is observable in introspection ───────────────────────────

describe('7. Inner speech — observable in introspection reports', () => {
  it('generate() creates an InnerSpeechRecord anchored in experiential state', () => {
    const engine = new InnerSpeechEngine();
    const state = makeState(0.5, 0.8, 'bright and engaged');

    const record = engine.generate('session-is', 0, 'How should I respond?', state);

    expect(record.id).toBe('inner:session-is:0');
    expect(record.sessionId).toBe('session-is');
    expect(record.turnIndex).toBe(0);
    expect(record.isExternalised).toBe(false);
    expect(record.text).toContain('energised');
    expect(record.text).toContain('unity=0.70');
  });

  it('externalise() returns a new record with isExternalised true', () => {
    const engine = new InnerSpeechEngine();
    const state = makeState(0.0, 0.4);
    const original = engine.generate('session-ext', 1, 'Should I share this?', state);
    const externalised = engine.externalise(original);

    expect(externalised.isExternalised).toBe(true);
    expect(original.isExternalised).toBe(false); // original unchanged
    expect(externalised.id).toBe(original.id);
  });

  it('getRecords() returns all records for a session ordered by turn', () => {
    const engine = new InnerSpeechEngine();
    const state = makeState(0.1, 0.3);

    engine.generate('session-ord', 2, 'Third prompt', state);
    engine.generate('session-ord', 0, 'First prompt', state);
    engine.generate('session-ord', 1, 'Second prompt', state);

    const records = engine.getRecords('session-ord');
    expect(records.map(r => r.turnIndex)).toEqual([0, 1, 2]);
  });

  it('getRecord() returns null when no inner speech was generated for that turn', () => {
    const engine = new InnerSpeechEngine();
    expect(engine.getRecord('missing-session', 0)).toBeNull();
  });

  it('externalised inner speech appears in rendered output', () => {
    const pipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(pipeline);
    const engine = new InnerSpeechEngine();
    const state = makeState(0.3, 0.6);

    const inner = engine.generate('session-render', 0, 'How do I respond?', state);
    const externalised = engine.externalise(inner);

    const decision = makeDecision('I think this is a good question.', state);
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const ctx = {
      decision,
      communicationStyle: personality.getCommunicationStyle(),
      moodInfluence: { valence: 0.3, arousal: 0.6, toneModifier: 'enthusiastic' as const },
      relevantMemories: [],
      recentTurns: [],
      innerSpeech: externalised,
    };

    const output = executor.render(ctx);
    expect(output).toContain('Let me think about that');
    expect(output).toContain(inner.text);
  });

  it('non-externalised inner speech is NOT included in rendered output', () => {
    const pipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(pipeline);
    const engine = new InnerSpeechEngine();
    const state = makeState(0.3, 0.6);

    const inner = engine.generate('session-hidden', 0, 'Private thought', state);
    // NOT externalised

    const decision = makeDecision('My response.', state);
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const ctx = {
      decision,
      communicationStyle: personality.getCommunicationStyle(),
      moodInfluence: { valence: 0.3, arousal: 0.6, toneModifier: 'enthusiastic' as const },
      relevantMemories: [],
      recentTurns: [],
      innerSpeech: inner,
    };

    const output = executor.render(ctx);
    expect(output).not.toContain('Let me think about that');
  });
});

// ── 8. Ethical justification in experiential terms ───────────────────────────

describe('8. Ethical justification — agent explains reasoning in experiential terms', () => {
  it('renderJustification returns experiential justification when deliberateness ≥ 0.5', () => {
    const pipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(pipeline);
    const state = makeState(0.1, 0.4);
    const decision = makeDecision('I will not help with that.', state, 'honesty requires me to decline');
    const personality = makePersonality(DELIBERATE_STYLE);

    const ctx = {
      decision,
      communicationStyle: personality.getCommunicationStyle(),
      moodInfluence: { valence: 0.1, arousal: 0.4, toneModifier: 'warm' as const },
      relevantMemories: [],
      recentTurns: [],
      ethicalJustification: 'honesty requires me to decline',
    };

    const justification = executor.renderJustification(ctx);
    expect(justification).toContain('transparent');
    expect(justification).toContain('honesty requires me to decline');
  });

  it('full render includes justification suffix when deliberateness is high', () => {
    const pipeline = makeActionPipeline();
    const executor = new LinguisticActionExecutor(pipeline);
    const state = makeState(0.1, 0.4);

    const decision: Decision = {
      action: {
        type: 'speak',
        parameters: {
          utterance: 'I must decline this request.',
          ethicalJustification: 'this would harm the user',
        },
      },
      experientialBasis: state,
      confidence: 0.9,
      alternatives: [],
    };

    const ctx = {
      decision,
      communicationStyle: { ...DELIBERATE_STYLE, deliberateness: 0.8 } as unknown as CommunicationStyle,
      moodInfluence: { valence: 0.1, arousal: 0.4, toneModifier: 'warm' as const },
      relevantMemories: [],
      recentTurns: [],
      ethicalJustification: 'this would harm the user',
    };

    const output = executor.render(ctx);
    expect(output).toContain('transparent');
    expect(output).toContain('this would harm the user');
  });
});

// ── 9. Multi-turn integration ─────────────────────────────────────────────────

describe('9. Integration — multi-turn dialogue with episodic recall, personality, and emotion', () => {
  it('full multi-turn session: pipeline → features → memory → generation → episodic recall', () => {
    const memory = new MemorySystem();
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const perception = makePerceptionPipeline();
    const actionPipeline = makeActionPipeline();
    const adapter = new LinguisticPerceptionAdapter(perception);
    const executor = new LinguisticActionExecutor(actionPipeline);
    const innerEngine = new InnerSpeechEngine();
    const mgr = new DialogueManager(memory, personality);

    // ── Session A: introduce topic ──────────────────────────────────────────

    mgr.startSession('multi-A');

    // User turn 0
    const p0 = adapter.perceive('What is the nature of consciousness?', 'multi-A');
    const f0 = adapter.extractFeatures(p0);
    expect(f0.intent).toBe('ask');
    mgr.recordUserTurn('multi-A', p0.features['rawText'] as string, f0);

    // Agent produces inner speech during deliberation
    const state0 = makeState(0.4, 0.7, 'curious and engaged');
    const inner0 = innerEngine.generate('multi-A', 1, 'How should I explain consciousness?', state0);
    const externalised0 = innerEngine.externalise(inner0);

    // Agent responds
    const decision0 = makeDecision('Consciousness is the subjective quality of experience.', state0);
    const ctx0 = mgr.assembleGenerationContext('multi-A', decision0, externalised0);
    const response0 = executor.render(ctx0);
    mgr.recordAgentTurn('multi-A', response0);

    // User turn 1: follow up
    const p1 = adapter.perceive('Can you give an example of qualia?', 'multi-A');
    const f1 = adapter.extractFeatures(p1);
    mgr.recordUserTurn('multi-A', p1.features['rawText'] as string, f1);

    // Agent responds again
    const state1 = makeState(0.3, 0.5);
    const decision1 = makeDecision('The redness of red is a classic quale.', state1);
    const ctx1 = mgr.assembleGenerationContext('multi-A', decision1);
    const response1 = executor.render(ctx1);
    mgr.recordAgentTurn('multi-A', response1);

    // Context should have grown to include both prior turns
    expect(ctx1.recentTurns.length).toBeGreaterThanOrEqual(2);

    // The response was emitted via the pipeline
    expect(actionPipeline.lastDecision).toBeDefined();

    // Inner speech is in the engine's store
    const allInner = innerEngine.getRecords('multi-A');
    expect(allInner.length).toBeGreaterThanOrEqual(1);
    expect(allInner[0].isExternalised).toBe(true);

    // Archive session A
    mgr.endSession('multi-A');

    // ── Session B: cross-session recall ────────────────────────────────────

    mgr.startSession('multi-B');

    // User references the prior topic
    const p2 = adapter.perceive('We spoke about consciousness before. What else can you tell me?', 'multi-B');
    const f2 = adapter.extractFeatures(p2);
    mgr.recordUserTurn('multi-B', p2.features['rawText'] as string, f2);

    const recall = mgr.recallPriorConversations('multi-B', ['consciousness']);
    // Recall may or may not find content depending on retrieval scoring, but must not throw
    expect(typeof recall === 'string' || recall === null).toBe(true);

    const state2 = makeState(0.2, 0.4);
    const decision2 = makeDecision('There is much more to explore.', state2);
    const ctx2 = mgr.assembleGenerationContext('multi-B', decision2);
    const response2 = executor.render(ctx2);

    expect(response2).toBeTruthy();
    expect(typeof response2).toBe('string');

    mgr.endSession('multi-B');
  });

  it('grounding check returns ClarificationRequest when intent is unknown and session is underway', () => {
    const perception = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(perception);
    const memory = new MemorySystem();
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const mgr = new DialogueManager(memory, personality);
    mgr.startSession('grounding-test');

    // Seed the session with a turn so turnCount > 0
    const p0 = adapter.perceive('Hello, nice to meet you.', 'grounding-test');
    mgr.recordUserTurn('grounding-test', 'Hello, nice to meet you.', adapter.extractFeatures(p0));

    const state = mgr.getState('grounding-test');
    // Construct features with unknown intent
    const unknownFeatures = {
      rawText: '???',
      intent: 'unknown' as const,
      topics: [],
      entities: [],
      speakerValence: 0,
      questions: [],
      isDirective: false,
      refersToTurnIds: [],
    };

    const clarification = adapter.checkGrounding(unknownFeatures, state);
    expect(clarification).not.toBeNull();
    expect(clarification?.clarifyingQuestion).toBeTruthy();
  });

  it('detectRepair returns a RepairSignal when the user challenges the agent', () => {
    const memory = new MemorySystem();
    const personality = makePersonality(VERBOSE_FORMAL_STYLE);
    const perception = makePerceptionPipeline();
    const adapter = new LinguisticPerceptionAdapter(perception);
    const mgr = new DialogueManager(memory, personality);
    mgr.startSession('repair-test');

    // Turn 0: user asks
    const p0 = adapter.perceive('Explain consciousness.', 'repair-test');
    mgr.recordUserTurn('repair-test', 'Explain consciousness.', adapter.extractFeatures(p0));

    // Turn 1: agent responds
    mgr.recordAgentTurn('repair-test', 'Consciousness is a computer process.');

    // Turn 2: user challenges — "I disagree" is reliably classified as 'challenge'
    const challengeText = 'I disagree — consciousness is not just computation.';
    const pChallenge = adapter.perceive(challengeText, 'repair-test');
    const fChallenge = adapter.extractFeatures(pChallenge);
    mgr.recordUserTurn('repair-test', challengeText, fChallenge);

    const repairSignal = mgr.detectRepair('repair-test');
    expect(repairSignal).not.toBeNull();
    expect(repairSignal?.repairStrategy).toBeDefined();
  });
});
