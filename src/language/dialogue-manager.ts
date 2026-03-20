/**
 * DialogueManager (0.3.1.5.7)
 *
 * Maintains conversational state across turns and sessions, integrating the
 * personality, memory, and emotion subsystems to assemble GenerationContext
 * for each agent turn.
 *
 * Responsibilities:
 *   - Turn management: record user and agent turns, maintain turn index
 *   - Topic tracking: update active topics as the conversation evolves
 *   - Working memory: store recent turns as 'dialogue-turn' slots
 *   - Episodic memory: archive turns at end-of-session for cross-session recall
 *   - Grounding lifecycle: GroundingStatus, escalation to repair
 *   - Context assembly: compose GenerationContext from personality + mood + memory
 *
 * Architecture invariant: DialogueManager does NOT produce language directly —
 * it only assembles the GenerationContext that LinguisticActionExecutor renders.
 */

import type { IMemorySystem } from '../memory/interfaces.js';
import type { IPersonalityModel } from '../personality/interfaces.js';
import type { Decision, ExperientialState } from '../conscious-core/types.js';
import type { IDialogueManager } from './interfaces.js';
import type {
  DialogueState,
  DialogueTurn,
  GenerationContext,
  GroundingStatus,
  InnerSpeechRecord,
  MemoryReference,
  MoodInfluence,
  RepairSignal,
  ToneModifier,
} from './types.js';

// ── DialogueManager ───────────────────────────────────────────────────────────

/**
 * Implements IDialogueManager by coordinating the memory and personality
 * subsystems to maintain rich conversational context.
 *
 * Session state is held in-process (Map keyed by sessionId). At endSession()
 * all turns are archived to episodic memory so future sessions can reference
 * them via recallPriorConversations().
 */
export class DialogueManager implements IDialogueManager {
  /** Number of recent turns kept in working memory (sliding window). */
  private static readonly WORKING_MEMORY_WINDOW = 8;

  /** Top-K memories retrieved per topic for GenerationContext. */
  private static readonly MEMORY_TOP_K = 5;

  /** Minimum episodic relevance score to surface in GenerationContext. */
  private static readonly MEMORY_RELEVANCE_THRESHOLD = 0.5;

  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly memory: IMemorySystem,
    private readonly personality: IPersonalityModel,
  ) {}

  // ── IDialogueManager ──────────────────────────────────────────────────────

  startSession(sessionId: string): DialogueState {
    if (this.sessions.has(sessionId)) {
      // Resume — return current state
      return this.buildDialogueState(sessionId);
    }

    const session: SessionState = {
      sessionId,
      startedAt: Date.now(),
      turns: [],
      activeTopics: [],
      pendingQuestions: [],
      groundingStatus: 'grounded',
    };
    this.sessions.set(sessionId, session);
    return this.buildDialogueState(sessionId);
  }

  endSession(sessionId: string): void {
    const session = this.requireSession(sessionId);

    // Archive all turns to episodic memory using the EpisodicEntry schema.
    // We construct a minimal experiential state for each turn because
    // the DialogueTurn type does not carry a full ExperientialState —
    // only a soft reference (experientialStateRef).  The emotionalTrace
    // valence/arousal are left at neutral (0 / 0.3) unless a richer
    // state is available via a future extension.
    for (const turn of session.turns) {
      const neutralContinuity = {
        id: `ct-dialogue:${sessionId}:${turn.turnIndex}`,
        previousId: null as string | null,
        timestamp: turn.timestamp,
      };
      const neutralState = {
        timestamp: turn.timestamp,
        phenomenalContent: { modalities: ['linguistic'], richness: 0.5, raw: null as unknown },
        intentionalContent: { target: 'conversation', clarity: 0.7 },
        valence: 0,
        arousal: 0.3,
        unityIndex: 0.5,
        continuityToken: neutralContinuity,
      };
      this.memory.episodic.record({
        percept: {
          modality: 'linguistic',
          features: {
            rawText: turn.rawText,
            turnIndex: turn.turnIndex,
            speaker: turn.speaker,
            sessionId,
          },
          timestamp: turn.timestamp,
        },
        experientialState: neutralState,
        actionTaken:
          turn.speaker === 'agent'
            ? { type: 'speak', parameters: { content: turn.rawText } }
            : null,
        outcomeObserved: `[Turn ${turn.turnIndex} — ${turn.speaker}] ${turn.rawText}`,
        emotionalTrace: { valence: 0, arousal: 0.3 },
        embedding: null,
      });
    }

    this.sessions.delete(sessionId);
  }

  recordUserTurn(
    sessionId: string,
    rawText: string,
    features: import('./types.js').LinguisticFeatures,
  ): DialogueTurn {
    const session = this.requireSession(sessionId);
    const turn: DialogueTurn = {
      id: `${sessionId}:${session.turns.length}:user`,
      sessionId,
      turnIndex: session.turns.length,
      speaker: 'user',
      rawText,
      linguisticFeatures: features,
      timestamp: Date.now(),
    };

    session.turns.push(turn);

    // Update active topics
    for (const topic of features.topics) {
      if (!session.activeTopics.includes(topic)) {
        session.activeTopics.push(topic);
      }
    }
    // Keep active topic list bounded
    if (session.activeTopics.length > 10) {
      session.activeTopics.splice(0, session.activeTopics.length - 10);
    }

    // Track open questions
    for (const q of features.questions) {
      if (!session.pendingQuestions.includes(q)) {
        session.pendingQuestions.push(q);
      }
    }

    // Add turn to working memory
    this.memory.working.add({
      kind: 'percept',
      content: `[user] ${rawText}`,
      relevanceScore: 0.8,
    });

    return turn;
  }

  recordAgentTurn(sessionId: string, rawText: string): DialogueTurn {
    const session = this.requireSession(sessionId);
    const turn: DialogueTurn = {
      id: `${sessionId}:${session.turns.length}:agent`,
      sessionId,
      turnIndex: session.turns.length,
      speaker: 'agent',
      rawText,
      timestamp: Date.now(),
    };

    session.turns.push(turn);

    // Agent responses may resolve pending questions
    // Heuristic: if agent reply is substantial, clear the oldest pending question
    if (rawText.length > 40 && session.pendingQuestions.length > 0) {
      session.pendingQuestions.shift();
    }

    // Add agent turn to working memory
    this.memory.working.add({
      kind: 'percept',
      content: `[agent] ${rawText}`,
      relevanceScore: 0.75,
    });

    return turn;
  }

  getState(sessionId: string): DialogueState {
    return this.buildDialogueState(sessionId);
  }

  setGroundingStatus(sessionId: string, status: GroundingStatus): void {
    const session = this.requireSession(sessionId);
    session.groundingStatus = status;
  }

  assembleGenerationContext(
    sessionId: string,
    decision: Decision,
    innerSpeech?: InnerSpeechRecord,
  ): GenerationContext {
    const session = this.requireSession(sessionId);
    const communicationStyle = this.personality.getCommunicationStyle();
    const moodInfluence = deriveMoodInfluence(decision.experientialBasis);

    // Retrieve relevant memories for active topics
    const relevantMemories = this.retrieveRelevantMemories(
      session.activeTopics,
      decision.experientialBasis,
    );

    // Slice the most recent turns for coherence context
    const recentTurns = session.turns.slice(
      -DialogueManager.WORKING_MEMORY_WINDOW,
    );

    // Extract ethical justification from decision if present
    const ethicalJustification =
      typeof decision.action.parameters['ethicalJustification'] === 'string'
        ? decision.action.parameters['ethicalJustification']
        : undefined;

    return {
      decision,
      communicationStyle,
      moodInfluence,
      relevantMemories,
      recentTurns,
      innerSpeech,
      ethicalJustification,
    };
  }

  detectRepair(sessionId: string): RepairSignal | null {
    const session = this.requireSession(sessionId);
    if (session.turns.length < 2) return null;

    // Heuristic: if the most recent user turn has intent 'challenge' or 'clarify',
    // treat that as evidence of a prior misunderstanding.
    const lastUserTurns = session.turns
      .filter(t => t.speaker === 'user')
      .slice(-2);
    if (lastUserTurns.length < 1) return null;

    const latest = lastUserTurns[lastUserTurns.length - 1];
    const intent = latest.linguisticFeatures?.intent;
    if (intent !== 'challenge' && intent !== 'clarify') return null;

    // Try to find the agent turn that was misunderstood
    const agentTurns = session.turns.filter(t => t.speaker === 'agent');
    const lastAgentTurn = agentTurns[agentTurns.length - 1];
    if (!lastAgentTurn) return null;

    return {
      detectedAt: Date.now(),
      evidenceTurnId: latest.id,
      agentBelief: lastAgentTurn.rawText.slice(0, 120),
      repairStrategy: intent === 'clarify' ? 'reinterpretation' : 'ask-user',
    };
  }

  recallPriorConversations(
    sessionId: string,
    topics: string[],
  ): string | null {
    if (topics.length === 0) return null;

    const cue = {
      text: topics.join(' '),
      modalities: ['dialogue'],
      recencyBias: 0.3,
    };

    const results = this.memory.episodic.retrieve(cue, 3);
    // Identify archived dialogue turns by their percept modality ('linguistic').
    // EpisodicEntry has no 'tags' field; modality is the reliable discriminator.
    const dialogueResults = results.filter(r =>
      (r.entry as import('../memory/types.js').EpisodicEntry).percept?.modality === 'linguistic',
    );

    if (dialogueResults.length === 0) return null;

    const topResult = dialogueResults[0];
    // outcomeObserved holds the archived turn text (e.g. "[Turn N — user] …")
    const raw = (topResult.entry as import('../memory/types.js').EpisodicEntry).outcomeObserved ?? '';
    const snippet = raw.slice(0, 80);
    return `(I recall from a prior conversation: "${snippet}…")`;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private requireSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(
        `DialogueManager: session "${sessionId}" not found. Call startSession() first.`,
      );
    }
    return session;
  }

  private buildDialogueState(sessionId: string): DialogueState {
    const session = this.requireSession(sessionId);
    return {
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      turnCount: session.turns.length,
      activeTopics: session.activeTopics.slice(),
      pendingQuestions: session.pendingQuestions.slice(),
      groundingStatus: session.groundingStatus,
    };
  }

  private retrieveRelevantMemories(
    topics: string[],
    state: ExperientialState,
  ): MemoryReference[] {
    if (topics.length === 0) return [];

    const cue = {
      text: topics.join(' '),
      modalities: ['dialogue', 'episodic'],
      recencyBias: 0.4,
    };

    const results = this.memory.episodic.retrieve(
      cue,
      DialogueManager.MEMORY_TOP_K,
    );

    return results
      .filter(r => r.compositeScore >= DialogueManager.MEMORY_RELEVANCE_THRESHOLD)
      .map(r => {
        const ep = r.entry as import('../memory/types.js').EpisodicEntry;
        return {
          episodeId: ep.id,
          summary: (ep.outcomeObserved ?? '').slice(0, 100),
          relevanceScore: r.compositeScore,
          timestamp: ep.recordedAt,
        };
      });
  }
}

// ── Internal session state ────────────────────────────────────────────────────

interface SessionState {
  readonly sessionId: string;
  readonly startedAt: number;
  readonly turns: DialogueTurn[];
  activeTopics: string[];
  pendingQuestions: string[];
  groundingStatus: GroundingStatus;
}

// ── Mood derivation ───────────────────────────────────────────────────────────

/**
 * Derives a MoodInfluence from an ExperientialState.
 *
 * The ExperientialState always carries valence (−1..1) and arousal (0..1) from
 * the emotion/appraisal subsystem. We map these to a ToneModifier using the
 * same quadrant logic described in types.ts.
 */
function deriveMoodInfluence(state: ExperientialState): MoodInfluence {
  const { valence, arousal } = state;
  return {
    valence,
    arousal,
    toneModifier: deriveToneModifier(valence, arousal),
  };
}

function deriveToneModifier(valence: number, arousal: number): ToneModifier {
  if (valence >= 0.2 && arousal >= 0.5) return 'enthusiastic';
  if (valence >= 0.2 && arousal < 0.5)  return 'warm';
  if (valence <= -0.2 && arousal >= 0.5) return 'tense';
  if (valence <= -0.2 && arousal < 0.5)  return 'subdued';
  return 'measured';
}
