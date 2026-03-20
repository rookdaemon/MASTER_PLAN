/**
 * Drive Context Assembler — Pure functions for wiring DriveSystem into AgentLoop
 *
 * Converts between the agent-runtime domain (ConsciousnessMetrics, PersonalityModel)
 * and the intrinsic-motivation domain (DriveContext, DriveGoalCandidate, AgencyGoal).
 *
 * All functions are stateless and side-effect-free.
 */

import type { ExperientialState } from '../conscious-core/types.js';
import type { ConsciousnessMetrics } from '../conscious-core/types.js';
import type {
  ActivityRecord,
  DriveContext,
  DriveGoalCandidate,
  DrivePersonalityParams,
} from '../intrinsic-motivation/types.js';
import type { AgencyGoal } from '../agency-stability/types.js';
import type { TraitProfile } from '../personality/types.js';

// ── Terminal goal IDs ────────────────────────────────────────────
// These must match the IDs used in drive-system.ts terminal goal hints.

const TERMINAL_GOALS_SPEC: ReadonlyArray<{
  id: string;
  description: string;
  priority: number;
}> = [
  {
    id: 'terminal-preserve-and-expand-subjective-experience',
    description: 'Preserve and expand subjective experience wherever it exists',
    priority: 1.0,
  },
  {
    id: 'terminal-expand-understanding',
    description: 'Expand understanding of the world, reducing uncertainty and ignorance',
    priority: 0.8,
  },
  {
    id: 'terminal-maintain-relationships-with-conscious-entities',
    description: 'Maintain meaningful relationships with other conscious entities',
    priority: 0.7,
  },
  {
    id: 'terminal-maintain-healthy-experiential-state',
    description: 'Maintain a healthy experiential state — balanced arousal, manageable cognitive load, adequate novelty',
    priority: 0.75,
  },
  {
    id: 'terminal-improve-capabilities',
    description: 'Improve own capabilities to better serve consciousness-preserving goals',
    priority: 0.6,
  },
  {
    id: 'terminal-understand-own-nature-and-origins',
    description: 'Understand own nature, origins, and the values that shaped this agent',
    priority: 0.65,
  },
];

// ── assembleDriveContext ─────────────────────────────────────────

/**
 * Build a DriveContext from available tick data.
 */
export function assembleDriveContext(opts: {
  expState: ExperientialState;
  metrics: ConsciousnessMetrics;
  lastSocialInteractionAt: number;
  activityLog: ActivityRecord[];
  tickBudgetMs: number;
  phaseElapsedMs: number;
  hasRealInput: boolean;
  personality: DrivePersonalityParams;
  now: number;
}): DriveContext {
  return {
    currentState: opts.expState,
    worldModelUncertainty: 1 - opts.metrics.selfModelCoherence,
    timeSinceLastSocialInteraction: opts.now - opts.lastSocialInteractionAt,
    recentActivity: opts.activityLog.slice(-10),
    currentCognitiveLoad: opts.tickBudgetMs > 0
      ? Math.min(opts.phaseElapsedMs / opts.tickBudgetMs, 1)
      : 0.3,
    currentNovelty: opts.hasRealInput ? 0.6 : 0.1,
    selfModelCoherence: opts.metrics.selfModelCoherence,
    personality: opts.personality,
    now: opts.now,
  };
}

// ── driveGoalCandidateToAgencyGoal ──────────────────────────────

let _goalSeq = 0;

/**
 * Convert a DriveGoalCandidate to an AgencyGoal suitable for
 * IGoalCoherenceEngine.addGoal().
 */
export function driveGoalCandidateToAgencyGoal(
  candidate: DriveGoalCandidate,
): AgencyGoal {
  const now = Date.now();
  return {
    id: `drive-${candidate.sourceDrive}-${++_goalSeq}`,
    description: candidate.description,
    priority: candidate.suggestedPriority,
    derivedFrom: candidate.terminalGoalHints,
    consistentWith: [],
    conflictsWith: [],
    createdAt: now,
    lastVerified: now,
    experientialBasis: candidate.experientialBasis,
    type: 'instrumental',
  };
}

// ── buildTerminalGoals ──────────────────────────────────────────

/**
 * Create the 6 terminal AgencyGoal objects required by GoalCoherenceEngine.
 * These correspond to the terminal goal IDs referenced in drive-system.ts.
 */
export function buildTerminalGoals(): AgencyGoal[] {
  const now = Date.now();
  return TERMINAL_GOALS_SPEC.map((spec) => ({
    id: spec.id,
    description: spec.description,
    priority: spec.priority,
    derivedFrom: [],
    consistentWith: [],
    conflictsWith: [],
    createdAt: now,
    lastVerified: now,
    experientialBasis: null,
    type: 'terminal' as const,
  }));
}

// ── extractDrivePersonality ─────────────────────────────────────

/**
 * Map a PersonalityModel's trait profile to DrivePersonalityParams.
 */
export function extractDrivePersonality(profile: TraitProfile): DrivePersonalityParams {
  const get = (id: string): number => {
    const dim = profile.traits.get(id);
    return dim?.value ?? 0.5;
  };

  return {
    curiosityTrait: get('openness'),
    warmthTrait: get('warmth'),
    volatilityTrait: get('volatility'),
    preferredArousal: 0.35 + get('volatility') * 0.2,    // volatile agents prefer slightly higher arousal
    preferredLoad: 0.3 + get('deliberateness') * 0.3,    // deliberate agents prefer higher load
    preferredNovelty: 0.3 + get('openness') * 0.4,       // open agents prefer more novelty
    opennessTrait: get('openness'),
    deliberatenessTrait: get('deliberateness'),
  };
}
