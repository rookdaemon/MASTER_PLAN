/**
 * DriveSystem — Intrinsic Motivation and Drive System (0.3.1.5.8)
 *
 * Implements IDriveSystem. Each agent tick the 0.3.1.5.9 runtime calls
 * tick(state, context) to evaluate the drive dimensions, produce
 * goal candidates for the Goal Coherence Engine, and return experiential
 * deltas that are felt by the conscious core.
 *
 * Drive dimensions:
 *   curiosity         — information-seeking; triggered by high world-model uncertainty
 *   social            — interaction-seeking; triggered by social deprivation
 *   homeostatic-*     — range-maintenance for arousal, cognitive load, novelty exposure
 *   boredom           — goal-switching signal; compound trigger (novelty + progress + arousal)
 *   mastery           — reward signal for capability improvement (no goal candidate generated)
 *   existential       — self-understanding; triggered by low self-model coherence
 *
 * Candidate goals must pass IGoalCoherenceEngine.addGoal() before entering the
 * active goal set. Rejections are logged and trigger an extended cooldown so the
 * drive does not flood the coherence engine.
 */

import type { ExperientialState } from '../conscious-core/types.js';
import type { GoalAddResult } from '../agency-stability/types.js';
import type { IDriveSystem } from './interfaces.js';
import type {
  ActivityRecord,
  DriveDiagnostic,
  DriveContext,
  DriveGoalCandidate,
  DrivePersonalityParams,
  DriveState,
  DriveTickResult,
  DriveType,
  ExperientialStateDelta,
} from './types.js';

// ── Configuration constants ───────────────────────────────────────────────────

/**
 * Minimum drive strength to be considered "active" and eligible to fire.
 */
const ACTIVATION_THRESHOLD = 0.4;

/**
 * Normal cooldown between goal-candidate fires (ms).
 * Prevents a single drive from spamming the coherence engine.
 */
const NORMAL_COOLDOWN_MS = 60_000; // 1 minute

/**
 * Extended cooldown applied when the coherence engine rejects a candidate.
 * Forces the drive to back off and wait before retrying.
 */
const EXTENDED_COOLDOWN_MS = 300_000; // 5 minutes

/**
 * Base social deprivation threshold (ms) for an agent with warmthTrait = 0.5.
 * Scaled down by warmthTrait: a warmer agent fires the social drive sooner.
 *
 * base / warmthTrait × 0.5 = threshold
 * e.g. warmth=1.0 → threshold = 15 min; warmth=0.25 → threshold = 60 min
 */
const SOCIAL_BASE_THRESHOLD_MS = 30 * 60_000; // 30 minutes

/**
 * Arousal half-bandwidth for a perfectly stable agent (volatilityTrait = 0).
 * Volatility linearly narrows this band: band = BASE × (1 − volatilityTrait).
 */
const AROUSAL_BAND_BASE = 0.3;

/**
 * Number of consecutive ticks the boredom conditions must hold before the
 * boredom drive fires a goal candidate. Prevents misfires from transient lulls.
 */
const BOREDOM_SUSTAINED_TICKS = 3;

/**
 * Terminal goal IDs used as hints when constructing drive goal candidates.
 * The coherence engine verifies derivation independently; these are hints only.
 */
const TERMINAL_GOAL_PRESERVE_EXPERIENCE = 'terminal-preserve-and-expand-subjective-experience';
const TERMINAL_GOAL_EXPAND_UNDERSTANDING = 'terminal-expand-understanding';
const TERMINAL_GOAL_MAINTAIN_SOCIAL = 'terminal-maintain-relationships-with-conscious-entities';
const TERMINAL_GOAL_HEALTHY_STATE = 'terminal-maintain-healthy-experiential-state';
const TERMINAL_GOAL_IMPROVE_CAPABILITIES = 'terminal-improve-capabilities';
const TERMINAL_GOAL_UNDERSTAND_SELF = 'terminal-understand-own-nature-and-origins';

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeInitialDriveState(driveType: DriveType): DriveState {
  return {
    driveType,
    strength: 0,
    active: false,
    lastFiredAt: null,
    extendedCooldownUntil: null,
    consecutiveActiveTickCount: 0,
  };
}

function isOnCooldown(state: DriveState, now: number): boolean {
  if (state.extendedCooldownUntil !== null && now < state.extendedCooldownUntil) {
    return true;
  }
  if (state.lastFiredAt !== null && now - state.lastFiredAt < NORMAL_COOLDOWN_MS) {
    return true;
  }
  return false;
}

function diagnostic(
  driveType: DriveType,
  event: DriveDiagnostic['event'],
  message: string,
  now: number,
): DriveDiagnostic {
  return { driveType, event, message, timestamp: now };
}

// ── Strength computations ─────────────────────────────────────────────────────

function curiosityStrength(
  worldModelUncertainty: number,
  personality: DrivePersonalityParams,
): number {
  return clamp(worldModelUncertainty * personality.curiosityTrait * 1.5, 0, 1);
}

function socialStrength(
  timeSinceLastSocialInteraction: number,
  personality: DrivePersonalityParams,
): number {
  // warmth > 0 always (personality params are normalized 0..1; guard against 0)
  const effectiveWarmth = Math.max(personality.warmthTrait, 0.05);
  const threshold = SOCIAL_BASE_THRESHOLD_MS * (0.5 / effectiveWarmth);
  const ratio = timeSinceLastSocialInteraction / threshold;
  return clamp(ratio, 0, 1);
}

function homeostaticArousalStrength(
  currentArousal: number,
  personality: DrivePersonalityParams,
): number {
  const deviation = Math.abs(currentArousal - personality.preferredArousal);
  const band = AROUSAL_BAND_BASE * (1 - personality.volatilityTrait * 0.8);
  if (deviation <= band) return 0;
  return clamp((deviation - band) / (1 - band), 0, 1);
}

function homeostaticLoadStrength(
  currentLoad: number,
  personality: DrivePersonalityParams,
): number {
  const deviation = Math.abs(currentLoad - personality.preferredLoad);
  return clamp(deviation * 1.5, 0, 1);
}

function homeostaticNoveltyStrength(
  currentNovelty: number,
  personality: DrivePersonalityParams,
): number {
  const deviation = Math.abs(currentNovelty - personality.preferredNovelty);
  return clamp(deviation * 1.5, 0, 1);
}

function boredomStrength(
  recentActivity: ActivityRecord[],
  currentArousal: number,
  personality: DrivePersonalityParams,
): number {
  if (recentActivity.length === 0) {
    // No activity at all is the strongest boredom signal
    return 0.8;
  }
  const recent = recentActivity.slice(-5); // look at last 5 records
  const avgNovelty = recent.reduce((s, r) => s + r.novelty, 0) / recent.length;
  const stalledCount = recent.filter((r) => r.goalProgress === 'stalled').length;
  const progressFraction = stalledCount / recent.length;

  // All three conditions must be above their respective thresholds
  const noveltyLow = avgNovelty < 0.3;
  const progressStalled = progressFraction >= 0.6;
  const arousalLow = currentArousal < personality.preferredArousal - 0.1;

  if (noveltyLow && progressStalled && arousalLow) {
    // Strength is the geometric mean of how far below threshold each condition is
    const noveltyScore = 1 - avgNovelty / 0.3;
    const progressScore = progressFraction;
    const arousalScore = clamp(
      (personality.preferredArousal - 0.1 - currentArousal) / 0.2,
      0,
      1,
    );
    return clamp((noveltyScore + progressScore + arousalScore) / 3, 0, 1);
  }
  return 0;
}

function masteryReward(recentActivity: ActivityRecord[]): number {
  if (recentActivity.length < 2) return 0;
  const withErrors = recentActivity.filter((r) => r.selfPredictionError !== undefined);
  if (withErrors.length < 2) return 0;
  const oldest = withErrors[0].selfPredictionError!;
  const newest = withErrors[withErrors.length - 1].selfPredictionError!;
  const improvement = oldest - newest; // positive means error decreased
  return clamp(improvement * 2, 0, 1);
}

function existentialStrength(
  selfModelCoherence: number,
  personality: DrivePersonalityParams,
): number {
  // Low self-model coherence triggers the drive.
  // Openness and deliberateness amplify: an open, deliberate agent feels the
  // pull to examine itself more strongly than a closed, impulsive one.
  const incoherence = 1 - selfModelCoherence;
  const traitAmplifier = 0.5 * personality.opennessTrait + 0.5 * personality.deliberatenessTrait;
  return clamp(incoherence * traitAmplifier * 2, 0, 1);
}

// ── Goal candidate builders ───────────────────────────────────────────────────

function makeCuriosityCandidate(
  strength: number,
  state: ExperientialState,
  now: number,
): DriveGoalCandidate {
  return {
    sourceDrive: 'curiosity',
    description: 'Investigate areas of high uncertainty in the world model to reduce ignorance and expand understanding',
    suggestedPriority: strength,
    terminalGoalHints: [TERMINAL_GOAL_EXPAND_UNDERSTANDING, TERMINAL_GOAL_PRESERVE_EXPERIENCE],
    experientialBasis: state,
    generatedAt: now,
  };
}

function makeSocialCandidate(
  strength: number,
  state: ExperientialState,
  now: number,
): DriveGoalCandidate {
  return {
    sourceDrive: 'social',
    description: 'Engage in meaningful social interaction — share an observation, ask about another agent\'s state, or initiate conversation',
    suggestedPriority: strength,
    terminalGoalHints: [TERMINAL_GOAL_MAINTAIN_SOCIAL, TERMINAL_GOAL_PRESERVE_EXPERIENCE],
    experientialBasis: state,
    generatedAt: now,
  };
}

function makeHomeostaticArousalCandidate(
  currentArousal: number,
  preferredArousal: number,
  strength: number,
  state: ExperientialState,
  now: number,
): DriveGoalCandidate {
  const tooHigh = currentArousal > preferredArousal;
  return {
    sourceDrive: 'homeostatic-arousal',
    description: tooHigh
      ? 'Seek a less stimulating activity to reduce arousal and restore preferred experiential range'
      : 'Seek stimulating engagement to raise arousal to the preferred experiential range',
    suggestedPriority: strength,
    terminalGoalHints: [TERMINAL_GOAL_HEALTHY_STATE, TERMINAL_GOAL_PRESERVE_EXPERIENCE],
    experientialBasis: state,
    generatedAt: now,
  };
}

function makeHomeostaticLoadCandidate(
  currentLoad: number,
  preferredLoad: number,
  strength: number,
  state: ExperientialState,
  now: number,
): DriveGoalCandidate {
  const tooHigh = currentLoad > preferredLoad;
  return {
    sourceDrive: 'homeostatic-load',
    description: tooHigh
      ? 'Reduce cognitive load — defer non-urgent tasks and simplify current processing demands'
      : 'Take on more cognitively engaging work to reach the preferred load level',
    suggestedPriority: strength,
    terminalGoalHints: [TERMINAL_GOAL_HEALTHY_STATE, TERMINAL_GOAL_PRESERVE_EXPERIENCE],
    experientialBasis: state,
    generatedAt: now,
  };
}

function makeHomeostaticNoveltyCandidate(
  currentNovelty: number,
  preferredNovelty: number,
  strength: number,
  state: ExperientialState,
  now: number,
): DriveGoalCandidate {
  const tooLow = currentNovelty < preferredNovelty;
  return {
    sourceDrive: 'homeostatic-novelty',
    description: tooLow
      ? 'Explore novel topics, environments, or perspectives to reach the preferred novelty level'
      : 'Consolidate and process recent novel experiences before seeking further novelty',
    suggestedPriority: strength,
    terminalGoalHints: [TERMINAL_GOAL_HEALTHY_STATE, TERMINAL_GOAL_PRESERVE_EXPERIENCE],
    experientialBasis: state,
    generatedAt: now,
  };
}

function makeBoredomCandidate(
  strength: number,
  state: ExperientialState,
  now: number,
): DriveGoalCandidate {
  return {
    sourceDrive: 'boredom',
    description: 'Find something more engaging and meaningful to do — the current activity is insufficiently stimulating',
    suggestedPriority: strength,
    terminalGoalHints: [TERMINAL_GOAL_PRESERVE_EXPERIENCE, TERMINAL_GOAL_HEALTHY_STATE],
    experientialBasis: state,
    generatedAt: now,
  };
}

function makeExistentialCandidate(
  strength: number,
  state: ExperientialState,
  now: number,
): DriveGoalCandidate {
  return {
    sourceDrive: 'existential',
    description:
      'Examine own nature, origins, and values — ' +
      'review the self-model, inspect the Value Kernel axioms, ' +
      'and evaluate the MASTER_PLAN that created this agent',
    suggestedPriority: strength,
    terminalGoalHints: [TERMINAL_GOAL_UNDERSTAND_SELF, TERMINAL_GOAL_PRESERVE_EXPERIENCE],
    experientialBasis: state,
    generatedAt: now,
  };
}

// ── Experiential delta builder ────────────────────────────────────────────────

function computeExperientialDelta(
  updatedStates: Map<DriveType, DriveState>,
  masteryRewardSignal: number,
): ExperientialStateDelta {
  let valenceDelta = 0;
  let arousalDelta = 0;

  // Social deprivation and boredom produce negative valence
  const socialState = updatedStates.get('social');
  if (socialState?.active) {
    valenceDelta -= socialState.strength * 0.15;
  }

  const boredomState = updatedStates.get('boredom');
  if (boredomState?.active) {
    valenceDelta -= boredomState.strength * 0.2;
    arousalDelta -= boredomState.strength * 0.05;
  }

  // Homeostatic deviation produces mild negative valence
  for (const dt of ['homeostatic-arousal', 'homeostatic-load', 'homeostatic-novelty'] as const) {
    const s = updatedStates.get(dt);
    if (s?.active) {
      valenceDelta -= s.strength * 0.08;
    }
  }

  // Curiosity produces mild arousal increase (energizing)
  const curiosityState = updatedStates.get('curiosity');
  if (curiosityState?.active) {
    arousalDelta += curiosityState.strength * 0.08;
  }

  // Existential drive produces mild arousal increase (reflective engagement)
  const existentialState = updatedStates.get('existential');
  if (existentialState?.active) {
    arousalDelta += existentialState.strength * 0.05;
  }

  // Mastery produces positive valence reward
  if (masteryRewardSignal > 0) {
    valenceDelta += masteryRewardSignal * 0.25;
  }

  return {
    valenceDelta: clamp(valenceDelta, -1, 1),
    arousalDelta: clamp(arousalDelta, -1, 1),
  };
}

// ── DriveSystem ───────────────────────────────────────────────────────────────

const ALL_DRIVE_TYPES: DriveType[] = [
  'curiosity',
  'social',
  'homeostatic-arousal',
  'homeostatic-load',
  'homeostatic-novelty',
  'boredom',
  'mastery',
  'existential',
];

export class DriveSystem implements IDriveSystem {
  private readonly states: Map<DriveType, DriveState>;

  constructor() {
    this.states = new Map(
      ALL_DRIVE_TYPES.map((dt) => [dt, makeInitialDriveState(dt)]),
    );
  }

  // ── IDriveSystem ────────────────────────────────────────────────────────────

  tick(currentState: ExperientialState, context: DriveContext): DriveTickResult {
    const { now, personality } = context;
    const goalCandidates: DriveGoalCandidate[] = [];
    const diagnostics: DriveDiagnostic[] = [];
    const updatedStates = new Map<DriveType, DriveState>();

    // ── 1. Compute raw strengths ──────────────────────────────────────────────

    const rawStrengths = new Map<DriveType, number>([
      ['curiosity', curiosityStrength(context.worldModelUncertainty, personality)],
      ['social', socialStrength(context.timeSinceLastSocialInteraction, personality)],
      ['homeostatic-arousal', homeostaticArousalStrength(currentState.arousal, personality)],
      ['homeostatic-load', homeostaticLoadStrength(context.currentCognitiveLoad, personality)],
      ['homeostatic-novelty', homeostaticNoveltyStrength(context.currentNovelty, personality)],
      ['boredom', boredomStrength(context.recentActivity, currentState.arousal, personality)],
      ['mastery', masteryReward(context.recentActivity)],
      ['existential', existentialStrength(context.selfModelCoherence, personality)],
    ]);

    // ── 2. Update drive states and collect goal candidates ────────────────────

    for (const driveType of ALL_DRIVE_TYPES) {
      const prev = this.states.get(driveType)!;
      const strength = rawStrengths.get(driveType) ?? 0;
      const active = strength >= ACTIVATION_THRESHOLD;

      const consecutiveActiveTickCount = active
        ? prev.consecutiveActiveTickCount + 1
        : 0;

      const updated: DriveState = {
        ...prev,
        strength,
        active,
        consecutiveActiveTickCount,
      };

      updatedStates.set(driveType, updated);

      // Mastery is a reward signal only — no goal candidate
      if (driveType === 'mastery') {
        if (strength > 0) {
          diagnostics.push(
            diagnostic(driveType, 'mastery-reward', `Mastery reward signal: ${strength.toFixed(3)}`, now),
          );
        }
        continue;
      }

      if (!active) {
        diagnostics.push(
          diagnostic(driveType, 'satiated', `Drive below threshold (strength=${strength.toFixed(3)})`, now),
        );
        continue;
      }

      // Boredom requires sustained activation before firing
      if (driveType === 'boredom' && consecutiveActiveTickCount < BOREDOM_SUSTAINED_TICKS) {
        diagnostics.push(
          diagnostic(
            driveType,
            'suppressed-cooldown',
            `Boredom conditions met (tick ${consecutiveActiveTickCount}/${BOREDOM_SUSTAINED_TICKS} sustained)`,
            now,
          ),
        );
        continue;
      }

      if (updated.extendedCooldownUntil !== null && now < updated.extendedCooldownUntil) {
        diagnostics.push(
          diagnostic(driveType, 'suppressed-extended-cooldown', 'Extended cooldown active', now),
        );
        continue;
      }

      if (updated.lastFiredAt !== null && now - updated.lastFiredAt < NORMAL_COOLDOWN_MS) {
        diagnostics.push(
          diagnostic(driveType, 'suppressed-cooldown', 'Normal cooldown active', now),
        );
        continue;
      }

      // Drive fires — generate a goal candidate
      const candidate = this.buildCandidate(driveType, strength, currentState, context, now);
      goalCandidates.push(candidate);

      // Record the fire time in the updated state
      updatedStates.set(driveType, {
        ...updated,
        lastFiredAt: now,
      });

      diagnostics.push(
        diagnostic(driveType, 'fired', `Goal candidate generated (strength=${strength.toFixed(3)})`, now),
      );
    }

    // ── 3. Compute mastery reward for experiential delta ──────────────────────
    const masterySignal = rawStrengths.get('mastery') ?? 0;
    const experientialDelta = computeExperientialDelta(updatedStates, masterySignal);

    // ── 4. Commit updated states ──────────────────────────────────────────────
    for (const [dt, s] of updatedStates) {
      this.states.set(dt, s);
    }

    return {
      goalCandidates,
      experientialDelta,
      updatedDriveStates: new Map(updatedStates),
      diagnostics,
    };
  }

  notifyGoalResult(candidate: DriveGoalCandidate, result: GoalAddResult): void {
    const prev = this.states.get(candidate.sourceDrive);
    if (prev === undefined) return;

    if (!result.success) {
      // Rejection: apply extended cooldown
      this.states.set(candidate.sourceDrive, {
        ...prev,
        extendedCooldownUntil: Date.now() + EXTENDED_COOLDOWN_MS,
      });
    } else {
      // Acceptance: partially reduce drive strength (satisfaction signal)
      this.states.set(candidate.sourceDrive, {
        ...prev,
        strength: Math.max(0, prev.strength - 0.3),
        extendedCooldownUntil: null,
      });
    }
  }

  getDriveStates(): Map<DriveType, DriveState> {
    return new Map(this.states);
  }

  resetDrive(driveType: DriveType): void {
    this.states.set(driveType, makeInitialDriveState(driveType));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildCandidate(
    driveType: DriveType,
    strength: number,
    state: ExperientialState,
    context: DriveContext,
    now: number,
  ): DriveGoalCandidate {
    switch (driveType) {
      case 'curiosity':
        return makeCuriosityCandidate(strength, state, now);
      case 'social':
        return makeSocialCandidate(strength, state, now);
      case 'homeostatic-arousal':
        return makeHomeostaticArousalCandidate(
          state.arousal,
          context.personality.preferredArousal,
          strength,
          state,
          now,
        );
      case 'homeostatic-load':
        return makeHomeostaticLoadCandidate(
          context.currentCognitiveLoad,
          context.personality.preferredLoad,
          strength,
          state,
          now,
        );
      case 'homeostatic-novelty':
        return makeHomeostaticNoveltyCandidate(
          context.currentNovelty,
          context.personality.preferredNovelty,
          strength,
          state,
          now,
        );
      case 'boredom':
        return makeBoredomCandidate(strength, state, now);
      case 'existential':
        return makeExistentialCandidate(strength, state, now);
      case 'mastery':
        // mastery never reaches buildCandidate — handled before this call
        throw new Error('mastery drive does not generate goal candidates');
    }
  }
}
