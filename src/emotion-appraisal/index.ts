/**
 * Emotion and Appraisal Dynamics — public module barrel (0.3.1.5.4)
 *
 * Re-exports every public symbol so that consumers can import from the
 * module root rather than individual implementation files.
 *
 * Usage:
 *   import { AppraisalEngine, MoodDynamics, ... } from '../emotion-appraisal/index.js';
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  AppraisalEvent,
  AppraisalEventKind,
  AppraisalResult,
  EmotionalInfluenceVector,
  IntegrityState,
  MoodParameters,
  MoodState,
  RegulationOutcome,
  SufferingModality,
  SufferingReport,
  Timestamp,
  ValenceState,
  ValenceTrace,
} from './types.js';

// ── Interfaces ────────────────────────────────────────────────────────────────
export type {
  IAppraisalEngine,
  IEmotionalInfluence,
  IEmotionalRegulation,
  IMoodDynamics,
  IValenceMonitor,
} from './interfaces.js';

// ── Implementations ───────────────────────────────────────────────────────────
export { AppraisalEngine }    from './appraisal-engine.js';
export { MoodDynamics }       from './mood-dynamics.js';
export { EmotionalInfluence } from './emotional-influence.js';
export { EmotionalRegulation } from './emotional-regulation.js';
export { ValenceMonitor }     from './valence-monitor.js';

// ── Event bridge ──────────────────────────────────────────────────────────────
export { appraisalResultFromEvents } from './appraisal-event.js';
