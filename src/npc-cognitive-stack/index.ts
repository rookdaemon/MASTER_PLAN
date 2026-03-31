/**
 * NPC Cognitive Stack — public module barrel
 *
 * Re-exports every public symbol so that consumers can import from the
 * module root rather than individual implementation files.
 *
 * Usage:
 *   import { CognitiveAgent } from '../npc-cognitive-stack/index.js';
 *   import type { CognitiveAgentConfig, CognitiveTickInput } from '../npc-cognitive-stack/index.js';
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  CognitiveAgentConfig,
  CognitiveTickInput,
  CognitiveTickResult,
  CognitiveSnapshot,
  MoodState,
  EmotionalInfluenceVector,
  RegulationOutcome,
  DriveGoalCandidate,
  DriveState,
  DriveType,
  DriveDiagnostic,
  ActivityRecord,
  ExperientialStateDelta,
  Timestamp,
  Duration,
  TraitDimensionId,
} from './types.js';

// ── Interface ─────────────────────────────────────────────────────────────────
export type { ICognitiveAgent } from './interfaces.js';

// ── Implementation ────────────────────────────────────────────────────────────
export { CognitiveAgent } from './cognitive-agent.js';
