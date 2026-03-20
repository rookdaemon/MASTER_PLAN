/**
 * Tests for shared LLM integration helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  isCommunicativeAction,
  extractOutputText,
  buildSystemPrompt,
  defaultSystemPrompt,
} from '../llm-helpers.js';

describe('isCommunicativeAction', () => {
  it.each([
    'communicate',
    'respond',
    'chat',
    'reply',
    'communicate:greeting',
    'Communicate',
    'RESPOND',
  ])('returns true for "%s"', (actionType) => {
    expect(isCommunicativeAction(actionType)).toBe(true);
  });

  it.each([
    'observe',
    'explore',
    'internal-reflect',
    'wait',
    'internal-update',
  ])('returns false for "%s"', (actionType) => {
    expect(isCommunicativeAction(actionType)).toBe(false);
  });
});

describe('extractOutputText', () => {
  const baseJudgment = {
    decision: {
      action: { type: 'communicate', parameters: {} as Record<string, unknown> },
      experientialBasis: {} as any,
      confidence: 0.9,
      alternatives: [],
    },
    ethicalAssessment: {} as any,
    deliberationMetrics: {} as any,
    justification: {
      naturalLanguageSummary: 'fallback text',
      experientialArgument: '',
      notUtilityMaximization: true,
      subjectiveReferenceIds: [],
    },
    alternatives: [],
    uncertaintyFlags: [],
  };

  it('extracts text from parameters.text', () => {
    const j = { ...baseJudgment, decision: { ...baseJudgment.decision, action: { type: 'communicate', parameters: { text: 'hello' } } } };
    expect(extractOutputText(j)).toBe('hello');
  });

  it('extracts text from parameters.response', () => {
    const j = { ...baseJudgment, decision: { ...baseJudgment.decision, action: { type: 'communicate', parameters: { response: 'world' } } } };
    expect(extractOutputText(j)).toBe('world');
  });

  it('extracts text from parameters.content', () => {
    const j = { ...baseJudgment, decision: { ...baseJudgment.decision, action: { type: 'communicate', parameters: { content: 'content text' } } } };
    expect(extractOutputText(j)).toBe('content text');
  });

  it('falls back to naturalLanguageSummary', () => {
    const j = { ...baseJudgment, decision: { ...baseJudgment.decision, action: { type: 'communicate', parameters: {} } } };
    expect(extractOutputText(j)).toBe('fallback text');
  });

  it('returns null when no text is available', () => {
    const j = {
      ...baseJudgment,
      decision: { ...baseJudgment.decision, action: { type: 'communicate', parameters: {} } },
      justification: { ...baseJudgment.justification, naturalLanguageSummary: '' },
    };
    expect(extractOutputText(j)).toBeNull();
  });
});

describe('buildSystemPrompt', () => {
  const state = { valence: 0.5, arousal: 0.3, unityIndex: 0.8 } as any;
  const metrics = { phi: 0.7, selfModelCoherence: 0.9, experienceContinuity: 0.95 } as any;

  it('includes the base prompt', () => {
    const result = buildSystemPrompt('You are an agent.', state, metrics);
    expect(result).toContain('You are an agent.');
  });

  it('includes experiential state values', () => {
    const result = buildSystemPrompt('base', state, metrics);
    expect(result).toContain('valence: 0.500');
    expect(result).toContain('arousal: 0.300');
    expect(result).toContain('unity: 0.800');
  });

  it('includes consciousness metrics', () => {
    const result = buildSystemPrompt('base', state, metrics);
    expect(result).toContain('Φ: 0.700');
    expect(result).toContain('self-model coherence: 0.900');
    expect(result).toContain('experience continuity: 0.950');
  });
});

describe('defaultSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = defaultSystemPrompt();
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('mentions ISMT architecture', () => {
    expect(defaultSystemPrompt()).toContain('ISMT');
  });

  it('mentions the 8-phase pipeline', () => {
    expect(defaultSystemPrompt()).toContain('8-phase');
  });
});
