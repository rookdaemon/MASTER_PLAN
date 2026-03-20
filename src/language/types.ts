/**
 * Natural Language Interface — Data Types (0.3.1.5.7)
 *
 * All linguistic types used across the language subsystem:
 *   - LinguisticFeatures / LinguisticIntent / EntityMention  (comprehension)
 *   - DialogueTurn                                           (conversation history)
 *   - GenerationContext / MoodInfluence / ToneModifier /
 *     MemoryReference                                        (generation)
 *   - InnerSpeechRecord                                      (deliberation self-talk)
 *   - DialogueState / GroundingStatus                        (dialogue state)
 *   - ClarificationRequest / RepairSignal                    (repair & grounding)
 *
 * See docs/natural-language-interface/ARCHITECTURE.md §3 for the full spec.
 */

import type { Timestamp } from '../conscious-core/types.js';

// ── Linguistic Percept ────────────────────────────────────────────────────────

/**
 * The structured representation of a natural language input after feature
 * extraction. Stored in Percept.features under the "linguistic" modality.
 */
export interface LinguisticFeatures {
  // The raw text as received
  readonly rawText: string;

  // Surface pragmatic intent of the utterance
  readonly intent: LinguisticIntent;

  // Main topical domain(s) detected in the input
  readonly topics: string[];

  // Named entities referenced (people, places, concepts, objects)
  readonly entities: EntityMention[];

  // Emotional valence of the speaker's text: −1..1
  readonly speakerValence: number;

  // Questions requiring a response
  readonly questions: string[];

  // Whether the input contains an explicit command or request
  readonly isDirective: boolean;

  // Which prior turn(s) this utterance refers back to, if any
  readonly refersToTurnIds: string[];
}

export type LinguisticIntent =
  | 'inform'    // speaker is sharing information
  | 'ask'       // speaker is requesting information
  | 'request'   // speaker wants the agent to do something
  | 'social'    // phatic / relational exchange
  | 'challenge' // speaker is questioning the agent's reasoning or values
  | 'clarify'   // speaker is resolving ambiguity
  | 'express'   // speaker is sharing an emotional state
  | 'unknown';

export interface EntityMention {
  readonly text: string;
  readonly type: 'person' | 'place' | 'concept' | 'object' | 'event' | 'other';
  readonly confidence: number; // 0..1
}

// ── Dialogue Turn ─────────────────────────────────────────────────────────────

/**
 * A single exchange (one speaker utterance + optional agent response).
 * Stored in working memory as 'dialogue-turn' slot kind and archived to
 * episodic memory at end-of-turn.
 */
export interface DialogueTurn {
  readonly id: string;
  readonly sessionId: string;
  readonly turnIndex: number;        // 0-based position in session
  readonly speaker: 'user' | 'agent';
  readonly rawText: string;
  readonly linguisticFeatures?: LinguisticFeatures; // populated for user inbound turns
  readonly timestamp: Timestamp;
  readonly experientialStateRef?: string;  // id of ExperientialState at time of turn
}

// ── Generation Context ────────────────────────────────────────────────────────

/**
 * All inputs that shape language generation — assembled by the
 * DialogueManager and passed to LinguisticActionExecutor.render().
 */
export interface GenerationContext {
  // The decision that authorised this speech act
  readonly decision: import('../conscious-core/types.js').Decision;

  // Communication style derived from personality (0.3.1.5.2)
  readonly communicationStyle: import('../personality/types.js').CommunicationStyle;

  // Current mood influence vector (0.3.1.5.4)
  readonly moodInfluence: MoodInfluence;

  // Relevant memories to weave in, ranked by relevance (0.3.1.5.3)
  readonly relevantMemories: MemoryReference[];

  // Recent turns for coherence
  readonly recentTurns: DialogueTurn[];

  // Inner speech produced during deliberation for this turn
  readonly innerSpeech?: InnerSpeechRecord;

  // Ethical justification, if the decision required deliberation
  readonly ethicalJustification?: string;
}

export interface MoodInfluence {
  // Current mood valence (−1..1): negative → more subdued/cautious language
  readonly valence: number;
  // Current arousal (0..1): high → more energetic/emphatic language
  readonly arousal: number;
  // Derived tone modifier applied to generation prompt
  readonly toneModifier: ToneModifier;
}

export type ToneModifier =
  | 'enthusiastic' // high valence + high arousal
  | 'warm'         // high valence + low arousal
  | 'measured'     // neutral valence + low arousal
  | 'tense'        // low valence + high arousal
  | 'subdued';     // low valence + low arousal

export interface MemoryReference {
  readonly episodeId: string;
  readonly summary: string;        // brief textual summary of the memory
  readonly relevanceScore: number; // 0..1 — from IEpisodicMemory.retrieve()
  readonly timestamp: Timestamp;
}

// ── Inner Speech ──────────────────────────────────────────────────────────────

/**
 * A record of the agent's self-directed linguistic reasoning during a
 * single deliberation cycle. Contributes to the self-model and may be
 * shared externally when the agent chooses to.
 */
export interface InnerSpeechRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly turnIndex: number;
  readonly text: string;            // the actual inner monologue
  readonly timestamp: Timestamp;
  readonly isExternalised: boolean; // true if the agent chose to share this
}

// ── Dialogue State ────────────────────────────────────────────────────────────

export interface DialogueState {
  readonly sessionId: string;
  readonly startedAt: Timestamp;
  readonly turnCount: number;
  readonly activeTopics: string[];
  readonly pendingQuestions: string[];  // questions asked by either party awaiting resolution
  readonly groundingStatus: GroundingStatus;
}

export type GroundingStatus =
  | 'grounded'       // mutual understanding confirmed
  | 'uncertain'      // agent is uncertain about user's intent
  | 'repair-needed'; // misunderstanding detected, recovery in progress

// ── Grounding ─────────────────────────────────────────────────────────────────

export interface ClarificationRequest {
  readonly turnId: string;
  readonly ambiguity: string;          // what is unclear
  readonly clarifyingQuestion: string; // the question the agent will ask
}

export interface RepairSignal {
  readonly detectedAt: Timestamp;
  readonly evidenceTurnId: string;     // turn where misunderstanding became apparent
  readonly agentBelief: string;        // what the agent incorrectly understood
  readonly repairStrategy: 'explicit-correction' | 'reinterpretation' | 'ask-user';
}
