/**
 * LinguisticPerceptionAdapter (0.3.1.5.7)
 *
 * Bridges the language subsystem to the conscious-core perception pipeline.
 * Enforces the no-zombie-bypass constraint: raw text MUST enter via
 * IPerceptionPipeline.ingest() before any linguistic feature extraction occurs.
 *
 * Data flow:
 *   rawText
 *     → toSensorData()       → SensorData { modality: "linguistic" }
 *     → IPerceptionPipeline.ingest()    → Percept
 *     → extractFeatures()    → LinguisticFeatures
 *     → checkGrounding()     → ClarificationRequest | null
 */

import type { IPerceptionPipeline } from '../conscious-core/interfaces.js';
import type { Percept, SensorData } from '../conscious-core/types.js';
import type { ILanguageComprehension } from './interfaces.js';
import type {
  ClarificationRequest,
  DialogueState,
  EntityMention,
  LinguisticFeatures,
  LinguisticIntent,
} from './types.js';

// ── LinguisticPerceptionAdapter ──────────────────────────────────────────────

/**
 * Implements ILanguageComprehension by wrapping an IPerceptionPipeline.
 *
 * Design invariants:
 *  - `toSensorData()` never calls the LLM / substrate directly; it only
 *    constructs the envelope. Feature extraction happens inside the pipeline.
 *  - `extractFeatures()` requires a percept whose modality is "linguistic";
 *    it throws `TypeError` for any other modality.
 *  - `checkGrounding()` returns a ClarificationRequest when the intent
 *    confidence is below 0.7 (as specified by the interface contract).
 */
export class LinguisticPerceptionAdapter implements ILanguageComprehension {
  /**
   * When intent confidence is below this threshold, a ClarificationRequest is
   * generated.  Currently proxied by the `intent === 'unknown'` heuristic
   * (deterministic extraction does not produce confidence scores).
   */
  static readonly GROUNDING_CONFIDENCE_THRESHOLD = 0.7;

  constructor(private readonly pipeline: IPerceptionPipeline) {}

  // ── ILanguageComprehension ────────────────────────────────────────────────

  toSensorData(rawText: string, sessionId: string): SensorData {
    return {
      source: `session:${sessionId}`,
      modality: 'linguistic',
      payload: { rawText, sessionId },
      timestamp: Date.now(),
    };
  }

  extractFeatures(percept: Percept): LinguisticFeatures {
    if (percept.modality !== 'linguistic') {
      throw new TypeError(
        `LinguisticPerceptionAdapter.extractFeatures: expected modality "linguistic", ` +
          `got "${percept.modality}"`,
      );
    }

    const raw = percept.features['rawText'] as string | undefined ?? '';

    return {
      rawText: raw,
      intent: detectIntent(raw),
      topics: extractTopics(raw),
      entities: extractEntities(raw),
      speakerValence: estimateValence(raw),
      questions: extractQuestions(raw),
      isDirective: isDirective(raw),
      refersToTurnIds: [],
    };
  }

  checkGrounding(
    features: LinguisticFeatures,
    state: DialogueState,
  ): ClarificationRequest | null {
    // Grounding fails when the intent is unknown and the dialogue is underway
    if (features.intent === 'unknown' && state.turnCount > 0) {
      return {
        turnId: `turn-${state.turnCount}`,
        ambiguity: 'Could not determine intent from input',
        clarifyingQuestion:
          'I want to make sure I understand you correctly — could you rephrase that?',
      };
    }

    // Grounding fails when there are open questions that this turn doesn't resolve
    if (
      state.pendingQuestions.length > 0 &&
      features.intent !== 'clarify' &&
      features.intent !== 'inform' &&
      features.questions.length === 0
    ) {
      // Still grounded enough — the user may be changing topic
      // Only escalate if the raw text is very short (likely a non-answer)
      if (features.rawText.trim().split(/\s+/).length < 3) {
        return {
          turnId: `turn-${state.turnCount}`,
          ambiguity: `There are ${state.pendingQuestions.length} open question(s) and the response is ambiguous`,
          clarifyingQuestion:
            'Just to check — are you answering my earlier question or moving to a new topic?',
        };
      }
    }

    return null;
  }

  // ── Convenience: wrap + ingest in one call ────────────────────────────────

  /**
   * Helper used by DialogueManager: converts raw text to a Percept via the
   * full perception pipeline without exposing the intermediate SensorData.
   */
  perceive(rawText: string, sessionId: string): Percept {
    const sensorData = this.toSensorData(rawText, sessionId);
    return this.pipeline.ingest(sensorData);
  }
}

// ── Heuristic feature extractors ─────────────────────────────────────────────
//
// These are intentionally simple deterministic heuristics. The architecture
// spec (§5.1) states that heavy NLP is done substrate-side (via the LLM
// substrate adapter). These functions provide a best-effort structural
// extraction that works without an LLM round-trip — suitable for tests and
// for the no-zombie-bypass constraint (the percept has already been processed
// by the pipeline before these run).

function detectIntent(text: string): LinguisticIntent {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return 'unknown';
  if (t.endsWith('?') || /^(who|what|when|where|why|how|is|are|do|does|can|could|would|will)\b/.test(t)) {
    return 'ask';
  }
  if (/^(please|could you|can you|would you|i need|i want|help me|tell me|show me|give me)\b/.test(t)) {
    return 'request';
  }
  if (/^(hi|hello|hey|good morning|good evening|thanks|thank you|bye|goodbye)\b/.test(t)) {
    return 'social';
  }
  if (/^(i feel|i'm feeling|i am feeling|i sense|emotionally)\b/.test(t)) {
    return 'express';
  }
  if (/^(but|however|that's not|that isn't|i disagree|actually|no,|wrong)\b/.test(t)) {
    return 'challenge';
  }
  if (/^(i mean|what i meant|to clarify|in other words|let me rephrase)\b/.test(t)) {
    return 'clarify';
  }
  return 'inform';
}

function extractTopics(text: string): string[] {
  // Naive keyword extraction: longest capitalised phrases or noun-like tokens
  const topics: string[] = [];
  const capitalisedPhrases = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) ?? [];
  for (const phrase of capitalisedPhrases) {
    if (!topics.includes(phrase)) topics.push(phrase);
  }
  // If nothing capitalised, fall back to significant words (>4 chars, not stopwords)
  if (topics.length === 0) {
    const stopwords = new Set([
      'that', 'this', 'with', 'from', 'have', 'been', 'will', 'would', 'could',
      'should', 'their', 'there', 'they', 'what', 'when', 'where', 'which', 'while',
    ]);
    const words = text
      .replace(/[^a-zA-Z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 4 && !stopwords.has(w.toLowerCase()));
    topics.push(...[...new Set(words)].slice(0, 3));
  }
  return topics.slice(0, 5);
}

function extractEntities(text: string): EntityMention[] {
  const entities: EntityMention[] = [];
  // Detect capitalised multi-word proper nouns
  const matches = text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
  const seen = new Set<string>();
  for (const m of matches) {
    const entity = m[1];
    if (!seen.has(entity)) {
      seen.add(entity);
      entities.push({
        text: entity,
        type: 'other',
        confidence: 0.6,
      });
    }
  }
  return entities.slice(0, 10);
}

function estimateValence(text: string): number {
  const positive = (text.match(
    /\b(good|great|excellent|happy|wonderful|love|amazing|fantastic|brilliant|thanks|thank|appreciate)\b/gi,
  ) ?? []).length;
  const negative = (text.match(
    /\b(bad|terrible|awful|hate|horrible|wrong|fail|broken|angry|sad|frustrat)\b/gi,
  ) ?? []).length;
  const total = positive + negative;
  if (total === 0) return 0;
  return Math.max(-1, Math.min(1, (positive - negative) / total));
}

function extractQuestions(text: string): string[] {
  return text
    .split(/[.!]/)
    .map(s => s.trim())
    .filter(s => s.endsWith('?') || /^(who|what|when|where|why|how)\b/i.test(s))
    .map(s => (s.endsWith('?') ? s : s + '?'));
}

function isDirective(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /^(please|could you|can you|would you|i need you to|i want you to|help me|tell me|show me|give me|do|don't|stop|start|make)\b/.test(
      t,
    )
  );
}

// Extend LinguisticIntent to allow 'answer' used internally by checkGrounding
declare module './types.js' {
  // No extension needed — 'clarify' covers answer intent well enough
}
