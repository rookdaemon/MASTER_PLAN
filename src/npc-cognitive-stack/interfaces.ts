/**
 * Interface for the NPC Cognitive Stack (npc-cognitive-stack)
 *
 * ICognitiveAgent is the single entry point for consuming the NPC cognitive
 * stack in games and social simulations. It composes:
 *   - IPersonalityModel — trait-based behavioral influence
 *   - IMoodDynamics / IEmotionalInfluence / IEmotionalRegulation — emotion subsystem
 *   - ISocialCognitionModule — theory of mind, trust, empathy, perspective-taking
 *   - IDriveSystem — intrinsic motivation drives
 *
 * The interface is deliberately game-loop friendly: tick() is the only update
 * method and accepts a plain data input object.
 */

import type { IPersonalityModel } from '../personality/interfaces.js';
import type { IValenceMonitor } from '../emotion-appraisal/interfaces.js';
import type { ISocialCognitionModule } from '../social-cognition/interfaces.js';
import type { CognitiveAgentConfig, CognitiveSnapshot, CognitiveTickInput, CognitiveTickResult } from './types.js';

export interface ICognitiveAgent {
  /** The agent's unique identifier (from CognitiveAgentConfig.agentId). */
  readonly agentId: string;

  /**
   * Run one cognitive tick.
   *
   * Evaluates all drive dimensions against the injected context, updates
   * mood state via EWMA, checks emotional regulation thresholds, and returns
   * a complete CognitiveTickResult.
   *
   * Typical game loop usage:
   *   const result = agent.tick({ now: Date.now(), ...contextFromWorld });
   *   applyMoodToDialogue(result.moodState);
   *   applyDrivesToScheduler(result.goalCandidates);
   */
  tick(input: CognitiveTickInput): CognitiveTickResult;

  /**
   * Direct access to the personality model for trait queries and
   * communication style derivation.
   *
   * Useful for dialogue tone selection, animation state mapping, etc.
   */
  getPersonality(): IPersonalityModel;

  /**
   * Direct access to the social cognition module.
   *
   * Use to record interactions, update mental state models for known entities,
   * query trust scores, generate empathic responses, and simulate perspectives.
   */
  getSocialCognition(): ISocialCognitionModule;

  /**
   * Direct access to the valence monitor for safety/wellbeing inspection.
   *
   * Useful for external supervision or "NPC welfare" tooling.
   */
  getValenceMonitor(): IValenceMonitor;

  /**
   * Produce a fully serializable snapshot of the agent's current cognitive
   * state (personality traits, drive states, mood state).
   *
   * @param now - Current epoch ms, stamped onto the snapshot.
   */
  snapshot(now: number): CognitiveSnapshot;

  /**
   * Restore the agent's cognitive state from a previously produced snapshot.
   *
   * The snapshot's agentId must match this agent's agentId; an error is thrown
   * otherwise to prevent accidental cross-agent state injection.
   *
   * @throws {Error} if snapshot.agentId !== this.agentId
   */
  restoreFromSnapshot(snapshot: CognitiveSnapshot): void;
}

export type { CognitiveAgentConfig };
