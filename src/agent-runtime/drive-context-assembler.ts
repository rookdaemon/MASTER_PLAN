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

// ── Private helpers ──────────────────────────────────────────────

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Shannon entropy (bits) of a string array.
 * Returns 0 for an empty array.
 */
function shannonEntropy(items: string[]): number {
  if (items.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / items.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Count how many items at the end of the array share the same value as the
 * last item (i.e. the length of the terminal same-topic streak).
 * Returns 0 for an empty array.
 */
function sameTopicStreak(items: string[]): number {
  if (items.length === 0) return 0;
  const last = items[items.length - 1];
  let streak = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i] === last) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ── Cognitive load formula constants ────────────────────────────
/** Expected maximum tool calls in a single cycle (for ratio normalisation). */
const TYPICAL_MAX_TOOL_CALLS_PER_CYCLE = 6;
/** Expected maximum remaining subtasks that indicate full task depth. */
const TYPICAL_MAX_REMAINING_SUBTASKS = 4;
/** Weight of tool-call ratio in the cognitive load composite (0..1). */
const TOOL_CALL_WEIGHT = 0.4;
/** Weight of phase-elapsed ratio in the cognitive load composite (0..1). */
const TIME_RATIO_WEIGHT = 0.3;
/** Weight of task depth in the cognitive load composite (0..1). */
const TASK_DEPTH_WEIGHT = 0.3;

// ── Novelty formula constants ────────────────────────────────────
/** Weight of normalised topic entropy in the novelty composite. */
const ENTROPY_WEIGHT = 0.6;
/** Weight of the repetition penalty in the novelty composite. */
const REPETITION_PENALTY_WEIGHT = 0.3;
/** Number of consecutive same-topic repetitions needed to reach full penalty. */
const REPETITION_PENALTY_NORMALIZER = 5;
/** Additive novelty boost when real (external) input is present. */
const REAL_INPUT_BOOST = 0.15;
/** Base novelty floor applied before all other components. */
const NOVELTY_BASE_FLOOR = 0.2;

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
  /** Number of tool calls made during the most recently completed ACT phase. */
  toolCallCount: number;
  /** Number of remaining (active + pending) subtasks in the current active task. 0 if no task. */
  activeSubtaskDepth: number;
  /** Topics of recent semantic memory entries (newest first, last N). */
  recentMemoryTopics: string[];
  personality: DrivePersonalityParams;
  now: number;
}): DriveContext {
  // World-model uncertainty: inverse of exploration progress.
  // Use average novelty of the most recent activities as a proxy —
  // high novelty means the agent is exploring unknown territory, i.e. high uncertainty.
  // Fall back to (1 - selfModelCoherence) as a floor so that low self-coherence
  // still contributes some uncertainty signal when the activity log is empty or stale.
  const avgRecentNovelty = opts.activityLog.length > 0
    ? opts.activityLog.slice(-10).reduce((s, r) => s + r.novelty, 0) /
      Math.min(opts.activityLog.length, 10)
    : 0.7; // high uncertainty when no activity yet

  // ── Cognitive Load — multi-signal composite ──────────────────
  // Combines: tool-call intensity, phase elapsed ratio, and active task depth.
  const toolCallRatio = clamp(opts.toolCallCount / TYPICAL_MAX_TOOL_CALLS_PER_CYCLE, 0, 1);
  const timeRatio = opts.tickBudgetMs > 0
    ? clamp(opts.phaseElapsedMs / opts.tickBudgetMs, 0, 1)
    : 0;
  const taskDepth = clamp(opts.activeSubtaskDepth / TYPICAL_MAX_REMAINING_SUBTASKS, 0, 1);
  const currentCognitiveLoad =
    toolCallRatio * TOOL_CALL_WEIGHT +
    timeRatio     * TIME_RATIO_WEIGHT +
    taskDepth     * TASK_DEPTH_WEIGHT;

  // ── Novelty — entropy-based estimate ────────────────────────
  // Topic entropy captures diversity of recent memory activity.
  // A streak of identical topics penalises novelty; real input provides a boost.
  const maxTopicEntropy = opts.recentMemoryTopics.length > 1
    ? Math.log2(opts.recentMemoryTopics.length)
    : 1; // avoid division by zero; single-item entropy is 0 anyway
  const topicEntropy = shannonEntropy(opts.recentMemoryTopics) / maxTopicEntropy;
  const streak = sameTopicStreak(opts.recentMemoryTopics);
  // Only penalise repetition beyond the first occurrence (streak of 1 = no actual repeat).
  const repetitionPenalty = clamp(Math.max(0, streak - 1) / REPETITION_PENALTY_NORMALIZER, 0, 1);
  const inputBoost = opts.hasRealInput ? REAL_INPUT_BOOST : 0;
  const currentNovelty = clamp(
    topicEntropy * ENTROPY_WEIGHT -
    repetitionPenalty * REPETITION_PENALTY_WEIGHT +
    inputBoost +
    NOVELTY_BASE_FLOOR,
    0, 1,
  );

  return {
    currentState: opts.expState,
    worldModelUncertainty: Math.max(
      avgRecentNovelty,                         // high novelty = exploring unknown territory
      1 - opts.metrics.selfModelCoherence,      // keep as fallback floor
    ),
    timeSinceLastSocialInteraction: opts.now - opts.lastSocialInteractionAt,
    recentActivity: opts.activityLog.slice(-10),
    currentCognitiveLoad,
    currentNovelty,
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
