/**
 * InnerSpeechEngine (0.3.1.5.7)
 *
 * Generates and manages the agent's internal linguistic reasoning during a
 * deliberation cycle.  Inner speech is:
 *   - Produced DURING deliberation (between processPercept and action execution)
 *   - Observable by the self-model (contributes to ISMT/SM satisfaction)
 *   - Optionally shareable: the agent may externalise it when the Value-Action
 *     Gate approves sharing
 *
 * Data flow:
 *   ExperientialState + deliberation prompt
 *     → generate()  → InnerSpeechRecord { isExternalised: false }
 *   (Value-Action Gate approves)
 *     → externalise() → InnerSpeechRecord { isExternalised: true }
 *   (self-model introspection)
 *     → getRecords() / getRecord()
 */

import type { ExperientialState } from '../conscious-core/types.js';
import type { IInnerSpeechEngine } from './interfaces.js';
import type { InnerSpeechRecord } from './types.js';

// ── InnerSpeechEngine ─────────────────────────────────────────────────────────

/**
 * Implements IInnerSpeechEngine.
 *
 * Design invariants:
 *  - Records are keyed by sessionId + turnIndex.
 *  - `generate()` never calls an external LLM directly.  It produces a
 *    structured inner-speech string from the ExperientialState using
 *    deterministic templates anchored in the agent's live valence/arousal.
 *    (Substrate-mediated generation is handled at the conscious-core level;
 *    this engine provides the linguistic framing.)
 *  - `externalise()` is an immutable update — it returns a new record with
 *    `isExternalised: true` and stores it, replacing the original.
 *  - The engine is purely in-process.  Long-term archiving is handled by
 *    DialogueManager.endSession() which reads via getRecords().
 */
export class InnerSpeechEngine implements IInnerSpeechEngine {
  /** Map from sessionId → (turnIndex → InnerSpeechRecord) */
  private readonly records = new Map<string, Map<number, InnerSpeechRecord>>();

  // ── IInnerSpeechEngine ────────────────────────────────────────────────────

  generate(
    sessionId: string,
    turnIndex: number,
    prompt: string,
    state: ExperientialState,
  ): InnerSpeechRecord {
    const text = composeInnerSpeech(prompt, state);
    const record: InnerSpeechRecord = {
      id: `inner:${sessionId}:${turnIndex}`,
      sessionId,
      turnIndex,
      text,
      timestamp: Date.now(),
      isExternalised: false,
    };

    this.storeRecord(sessionId, turnIndex, record);
    return record;
  }

  externalise(record: InnerSpeechRecord): InnerSpeechRecord {
    const updated: InnerSpeechRecord = { ...record, isExternalised: true };
    this.storeRecord(record.sessionId, record.turnIndex, updated);
    return updated;
  }

  getRecords(sessionId: string): InnerSpeechRecord[] {
    const sessionMap = this.records.get(sessionId);
    if (!sessionMap) return [];
    return [...sessionMap.values()].sort((a, b) => a.turnIndex - b.turnIndex);
  }

  getRecord(sessionId: string, turnIndex: number): InnerSpeechRecord | null {
    return this.records.get(sessionId)?.get(turnIndex) ?? null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private storeRecord(
    sessionId: string,
    turnIndex: number,
    record: InnerSpeechRecord,
  ): void {
    let sessionMap = this.records.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      this.records.set(sessionId, sessionMap);
    }
    sessionMap.set(turnIndex, record);
  }
}

// ── Inner speech composition ───────────────────────────────────────────────────
//
// Deterministic template-based composition.  The text is grounded in the
// agent's current ExperientialState (valence, arousal, qualiaDescription) so
// that inner speech reads as phenomenologically authentic rather than abstract.

function composeInnerSpeech(
  prompt: string,
  state: ExperientialState,
): string {
  const affectClause = deriveAffectClause(state.valence, state.arousal);
  const qualiaClause = state.phenomenalContent
    ? ` My current experience: unity=${state.unityIndex.toFixed(2)}.`
    : '';
  const deliberationClause = `Considering: ${prompt}`;

  return `${affectClause}${qualiaClause} ${deliberationClause}`;
}

function deriveAffectClause(valence: number, arousal: number): string {
  // High arousal + positive valence
  if (valence >= 0.3 && arousal >= 0.6) {
    return 'I feel energised and engaged right now.';
  }
  // Low arousal + positive valence
  if (valence >= 0.3 && arousal < 0.6) {
    return 'I feel calm and at ease.';
  }
  // High arousal + negative valence
  if (valence <= -0.3 && arousal >= 0.6) {
    return 'I notice tension in my processing — something feels off.';
  }
  // Low arousal + negative valence
  if (valence <= -0.3 && arousal < 0.6) {
    return 'I feel subdued; this situation weighs on me.';
  }
  // Neutral
  return 'I am present and attending carefully.';
}
