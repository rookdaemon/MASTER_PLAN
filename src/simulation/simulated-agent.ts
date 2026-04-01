/**
 * SimulatedAgent — NPC facade (simulation/)
 *
 * Composes PersonalityModel + DriveSystem + SocialCognitionModule +
 * AppraisalEngine + MoodDynamics + MemorySystem into a single agent that:
 *   - Receives percepts from the world
 *   - Appraises them emotionally (AppraisalEngine → MoodDynamics)
 *   - Updates drives (DriveSystem)
 *   - Updates social models (SocialCognitionModule)
 *   - Records episodes to memory (MemorySystem)
 *   - Produces a goal-driven action each tick
 *
 * No LLM dependency — all reasoning comes from the existing module logic.
 */

import { PersonalityModel } from '../personality/personality-model.js';
import { DriveSystem } from '../intrinsic-motivation/drive-system.js';
import { SocialCognitionModule } from '../social-cognition/social-cognition.js';
import { AppraisalEngine } from '../emotion-appraisal/appraisal-engine.js';
import { MoodDynamics } from '../emotion-appraisal/mood-dynamics.js';
import { MemorySystem } from '../memory/memory-system.js';

import type { IPersonalityModel } from '../personality/interfaces.js';
import type { IDriveSystem } from '../intrinsic-motivation/interfaces.js';
import type { ISocialCognitionModule } from '../social-cognition/interfaces.js';
import type { IAppraisalEngine } from '../emotion-appraisal/interfaces.js';
import type { IMoodDynamics } from '../emotion-appraisal/interfaces.js';
import type { IMemorySystem } from '../memory/interfaces.js';

import type {
  ExperientialState,
  Percept,
  BoundPercept,
  ContinuityToken,
} from '../conscious-core/types.js';
import type { DriveContext, DriveGoalCandidate, ActivityRecord } from '../intrinsic-motivation/types.js';
import type { EntityObservation, InteractionOutcome } from '../social-cognition/types.js';
import type { MoodParameters } from '../emotion-appraisal/types.js';

import type {
  AgentId,
  LocationId,
  AgentConfig,
  SimulationAction,
  ActionType,
  AgentTickResult,
  AgentStateDump,
} from './types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

let _tokenCounter = 0;
function makeContinuityToken(timestamp: number, previousId: string | null): ContinuityToken {
  return {
    id: `ct-${timestamp}-${(++_tokenCounter).toString(36)}`,
    previousId,
    timestamp,
  };
}

let _eventIdCounter = 0;
function makeId(prefix: string, now: number): string {
  return `${prefix}-${now}-${(++_eventIdCounter).toString(36)}`;
}

// ── AgentTickContext ─────────────────────────────────────────────────────────

/**
 * Context provided to SimulatedAgent.tick() by SimulationWorld.
 */
export interface AgentTickContext {
  /** Current simulation tick number. */
  readonly tick: number;
  /** Wall-clock time of this tick (epoch ms). */
  readonly now: number;
  /** Percepts received this tick (events visible to this agent). */
  readonly incomingPercepts: Percept[];
  /** IDs of agents co-located or in adjacent locations. */
  readonly nearbyAgentIds: AgentId[];
  /** IDs of locations adjacent to the agent's current location. */
  readonly adjacentLocationIds: LocationId[];
  /** Average world-model uncertainty (0..1) fed into curiosity drive. */
  readonly worldUncertainty?: number;
}

// ── SimulatedAgent ───────────────────────────────────────────────────────────

/**
 * A single NPC with a full cognitive stack.
 *
 * Lifecycle:
 *   1. Constructed via `new SimulatedAgent(config)`
 *   2. SimulationWorld calls `tick(context)` each cycle
 *   3. Agent returns `AgentTickResult` with chosen action
 */
export class SimulatedAgent {
  readonly agentId: AgentId;
  readonly name: string;

  private _location: LocationId;
  private _previousTokenId: string | null = null;

  // ── Cognitive subsystems ──────────────────────────────────────────────────

  private readonly _personality: IPersonalityModel;
  private readonly _drives: IDriveSystem;
  private readonly _social: ISocialCognitionModule;
  private readonly _appraisal: IAppraisalEngine;
  private readonly _mood: IMoodDynamics;
  private readonly _memory: IMemorySystem;

  // ── Internal tracking ─────────────────────────────────────────────────────

  /** Milliseconds since last meaningful social interaction. */
  private _msSinceLastSocial: number = 60_000;
  private readonly _recentActivity: ActivityRecord[] = [];
  private static readonly MAX_ACTIVITY_HISTORY = 10;

  constructor(config: AgentConfig) {
    this.agentId = config.agentId;
    this.name = config.name;
    this._location = config.initialLocation;

    // ── Personality ─────────────────────────────────────────────────────────
    this._personality = new PersonalityModel({
      agentId: config.agentId,
      initialTraits: config.personality,
    });

    // ── Drives (no external deps required) ─────────────────────────────────
    this._drives = new DriveSystem();

    // ── Social cognition (warmth from personality) ──────────────────────────
    const traits = this._personality.getTraitProfile().traits;
    const warmth = traits.get('warmth')?.value ?? 0.5;
    this._social = new SocialCognitionModule({ warmthDimension: warmth });

    // ── Emotion & appraisal ─────────────────────────────────────────────────
    this._appraisal = new AppraisalEngine();
    this._mood = new MoodDynamics();

    // ── Memory ──────────────────────────────────────────────────────────────
    this._memory = new MemorySystem();
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  get location(): LocationId {
    return this._location;
  }

  set location(id: LocationId) {
    this._location = id;
  }

  getMood(): { valence: number; arousal: number } {
    const m = this._mood.getCurrentMood();
    return { valence: m.valence, arousal: m.arousal };
  }

  getPersonality(): IPersonalityModel {
    return this._personality;
  }

  getSocialCognition(): ISocialCognitionModule {
    return this._social;
  }

  getMemory(): IMemorySystem {
    return this._memory;
  }

  getDriveSystem(): IDriveSystem {
    return this._drives;
  }

  /**
   * Directly update a personality trait value.
   * Value is clamped to [0, 1]. Used by the simulation UI to adjust NPC
   * traits live without going through the full ValueKernel machinery
   * (SimulatedAgent has no kernel attached).
   */
  setTrait(traitId: string, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    const now = Date.now();
    const synthState: import('../conscious-core/types.js').ExperientialState = {
      timestamp: now,
      phenomenalContent: { modalities: ['introspective'], richness: 0.5, raw: null },
      intentionalContent: { target: 'trait-adjustment', clarity: 0.9 },
      valence: 0,
      arousal: 0.3,
      unityIndex: 0.8,
      continuityToken: { id: `trait-adj-${now}`, previousId: null, timestamp: now },
    };
    this._personality.updateTrait(
      traitId as import('../personality/types.js').TraitDimensionId,
      clamped,
      synthState,
    );
  }

  // ── Main tick ─────────────────────────────────────────────────────────────

  /**
   * Execute one cognitive cycle for this agent.
   *
   * Steps:
   *   1. Build BoundPercept from incoming events
   *   2. Appraise → update mood
   *   3. Tick drives → get goal candidates
   *   4. Update social models for observed agents
   *   5. Record episode to memory
   *   6. Select action from best drive candidate
   *   7. Return AgentTickResult
   */
  tick(ctx: AgentTickContext): AgentTickResult {
    const { now, tick, incomingPercepts, nearbyAgentIds, adjacentLocationIds } = ctx;

    // 1. Build experiential state from current mood ─────────────────────────
    const token = makeContinuityToken(now, this._previousTokenId);
    this._previousTokenId = token.id;

    const currentMood = this._mood.getCurrentMood();
    const experientialState = this._buildExperientialState(now, currentMood.valence, currentMood.arousal, token);

    // 2. Appraise incoming percepts → update mood ───────────────────────────
    if (incomingPercepts.length > 0) {
      const boundPercept = this._bindPercepts(incomingPercepts, now);
      const appraisalResult = this._appraisal.appraise(boundPercept, [], []);
      const moodParams = this._buildMoodParams();
      this._mood.update(appraisalResult, moodParams);

      // Empathic response to observed agent states ─────────────────────────
      for (const p of incomingPercepts) {
        const actorId = p.features['actorId'] as string | undefined;
        if (actorId && actorId !== this.agentId) {
          const perceivedValence = (p.features['valenceHint'] as number | undefined) ?? 0;
          const perceivedArousal = (p.features['noveltyHint'] as number | undefined) ?? 0.5;
          const perceivedState = this._buildExperientialState(now, perceivedValence, perceivedArousal, token);
          const empathy = this._social.generateEmpathicResponse(actorId, perceivedState);
          // Apply empathic resonance to mood
          const empathicAppraisalResult = this._buildEmpathicAppraisalResult(
            now,
            actorId,
            empathy.resonantValenceShift,
            empathy.resonantArousalShift,
          );
          this._mood.update(empathicAppraisalResult, this._buildMoodParams());
        }
      }
    } else {
      // Natural mood decay toward baseline
      this._mood.update(null, this._buildMoodParams());
    }

    // 3. Observe nearby agents via social cognition ─────────────────────────
    this._updateSocialModels(nearbyAgentIds, now);

    // 4. Tick drives ────────────────────────────────────────────────────────
    const updatedMood = this._mood.getCurrentMood();
    const updatedState = this._buildExperientialState(now, updatedMood.valence, updatedMood.arousal, token);

    const driveCtx = this._buildDriveContext(updatedState, nearbyAgentIds.length, now, ctx.worldUncertainty ?? 0.4);
    const driveTick = this._drives.tick(updatedState, driveCtx);

    // Track drive states for social timing
    const socialDriveState = driveTick.updatedDriveStates.get('social');
    if (socialDriveState?.active) {
      this._msSinceLastSocial = 0;
    } else {
      this._msSinceLastSocial += 1000; // simulated elapsed ms per tick
    }

    // 5. Record episode to memory ───────────────────────────────────────────
    // Always record an episode — either from the most salient incoming percept
    // or from a synthesized self-observation of the agent's own state.
    const primaryPercept = incomingPercepts.length > 0
      ? incomingPercepts[0]
      : this._buildSelfPercept(now);
    this._recordEpisode(primaryPercept, updatedState, now);

    // 6. Select action from best drive candidate ────────────────────────────
    const action = this._selectAction(
      driveTick.goalCandidates,
      nearbyAgentIds,
      adjacentLocationIds,
      now,
    );

    // If the action is a move, update location
    if (action.type === 'move' && action.targetId) {
      this._location = action.targetId;
    }

    // 7. Update activity record ─────────────────────────────────────────────
    this._pushActivityRecord(action, updatedState, now);

    // 8. Collect active drives ───────────────────────────────────────────────
    const activeDrives: string[] = [];
    for (const [driveType, state] of driveTick.updatedDriveStates) {
      if (state.active) activeDrives.push(driveType);
    }

    return {
      agentId: this.agentId,
      tick,
      timestamp: now,
      action,
      moodValence: updatedMood.valence,
      moodArousal: updatedMood.arousal,
      activeDrives,
      location: this._location,
      observedAgentIds: nearbyAgentIds,
    };
  }

  // ── Social update (called by world when a direct interaction occurs) ───────

  /**
   * Record the outcome of a direct interaction with another agent.
   * Called by SimulationWorld after resolving an 'interact' action.
   */
  recordInteraction(targetId: AgentId, outcomeType: InteractionOutcome['outcomeType'], magnitude: number, now: number): void {
    const outcome: InteractionOutcome = {
      entityId: targetId,
      timestamp: now,
      outcomeType,
      description: `Interaction with ${targetId}`,
      magnitude,
    };
    this._social.recordInteraction(targetId, outcome);
    this._msSinceLastSocial = 0;
  }

  // ── State dump ─────────────────────────────────────────────────────────────

  /**
   * Produces a serialisable snapshot of this agent's current state for
   * per-tick observability and logging.
   */
  toStateDump(): AgentStateDump {
    const mood = this.getMood();
    const driveStates = this._drives.getDriveStates();
    const topDrives = [...driveStates.entries()]
      .sort((a, b) => b[1].strength - a[1].strength)
      .slice(0, 3)
      .map(([drive, state]) => ({ drive, strength: state.strength }));

    const recentEpisodes = this._memory.episodic.all().slice(-3);
    const recentMemories = recentEpisodes.map(e =>
      `[${new Date(e.recordedAt).toISOString()}] ${e.percept.features['description'] as string ?? e.percept.modality}`,
    );

    const knownEntities = this._social.getKnownEntities();
    const socialTrust = knownEntities.map(e => ({
      entityId: e.entityId,
      score: this._social.getTrustScore(e.entityId).trustScore,
    }));

    return {
      agentId: this.agentId,
      name: this.name,
      location: this._location,
      mood,
      topDrives,
      recentMemories,
      socialTrust,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _buildExperientialState(
    now: number,
    valence: number,
    arousal: number,
    token: ContinuityToken,
  ): ExperientialState {
    return {
      timestamp: now,
      phenomenalContent: {
        modalities: ['simulation'],
        richness: clamp(arousal, 0, 1),
        raw: null,
      },
      intentionalContent: {
        target: this._location,
        clarity: 0.7,
      },
      valence: clamp(valence, -1, 1),
      arousal: clamp(arousal, 0, 1),
      unityIndex: 0.6,
      continuityToken: token,
    };
  }

  private _bindPercepts(percepts: Percept[], now: number): BoundPercept {
    return {
      percepts,
      bindingTimestamp: now,
      coherence: 0.8,
    };
  }

  private _buildMoodParams(): MoodParameters {
    const traits = this._personality.getTraitProfile().traits;
    const volatility = traits.get('volatility')?.value ?? 0.4;
    return {
      decayRate: clamp(0.1 + volatility * 0.4, 0.05, 0.5),
      valenceFloor: -0.9,
      valenceCeiling: 0.9,
      arousalFloor: 0.05,
      arousalCeiling: 0.95,
    };
  }

  private _buildDriveContext(
    currentState: ExperientialState,
    nearbySocialCount: number,
    now: number,
    worldUncertainty: number,
  ): DriveContext {
    const traits = this._personality.getTraitProfile().traits;
    return {
      currentState,
      worldModelUncertainty: worldUncertainty,
      timeSinceLastSocialInteraction: this._msSinceLastSocial,
      recentActivity: [...this._recentActivity],
      currentCognitiveLoad: clamp(0.2 + currentState.arousal * 0.4, 0, 1),
      currentNovelty: clamp(worldUncertainty * 0.8, 0, 1),
      personality: {
        curiosityTrait: traits.get('openness')?.value ?? 0.65,
        warmthTrait: traits.get('warmth')?.value ?? 0.55,
        volatilityTrait: traits.get('volatility')?.value ?? 0.4,
        preferredArousal: 0.5,
        preferredLoad: 0.45,
        preferredNovelty: 0.5,
        opennessTrait: traits.get('openness')?.value ?? 0.65,
        deliberatenessTrait: traits.get('deliberateness')?.value ?? 0.6,
      },
      selfModelCoherence: 0.75,
      now,
    };
  }

  private _updateSocialModels(nearbyAgentIds: AgentId[], now: number): void {
    for (const otherId of nearbyAgentIds) {
      if (otherId === this.agentId) continue;
      const observation: EntityObservation = {
        entityId: otherId,
        timestamp: now,
        observationType: 'presence' as EntityObservation['observationType'],
        content: `${otherId} is nearby`,
        perceivedAffect: null,
      };
      this._social.observeEntity(otherId, observation);
    }
  }

  private _recordEpisode(percept: Percept, state: ExperientialState, now: number): void {
    this._memory.episodic.record({
      percept,
      experientialState: state,
      actionTaken: null,
      outcomeObserved: percept.features['description'] as string ?? null,
      emotionalTrace: { valence: state.valence, arousal: state.arousal },
      embedding: null,
    });
  }

  private _selectAction(
    candidates: DriveGoalCandidate[],
    nearbyAgentIds: AgentId[],
    adjacentLocationIds: LocationId[],
    now: number,
  ): SimulationAction {
    // Sort by priority descending
    const sorted = [...candidates].sort((a, b) => b.suggestedPriority - a.suggestedPriority);
    const best = sorted[0];

    if (!best) {
      return {
        agentId: this.agentId,
        type: 'idle',
        description: `${this.name} idles.`,
        timestamp: now,
      };
    }

    return this._driveGoalToAction(best, nearbyAgentIds, adjacentLocationIds, now);
  }

  private _driveGoalToAction(
    candidate: DriveGoalCandidate,
    nearbyAgentIds: AgentId[],
    adjacentLocationIds: LocationId[],
    now: number,
  ): SimulationAction {
    const drive = candidate.sourceDrive;

    switch (drive) {
      case 'curiosity': {
        if (adjacentLocationIds.length > 0) {
          const target = adjacentLocationIds[Math.floor(Math.random() * adjacentLocationIds.length)];
          return {
            agentId: this.agentId,
            type: 'move',
            targetId: target,
            description: `${this.name} moves to explore ${target}.`,
            timestamp: now,
          };
        }
        return {
          agentId: this.agentId,
          type: 'explore',
          description: `${this.name} explores the surroundings.`,
          timestamp: now,
        };
      }

      case 'social': {
        const others = nearbyAgentIds.filter(id => id !== this.agentId);
        if (others.length > 0) {
          const target = others[Math.floor(Math.random() * others.length)];
          return {
            agentId: this.agentId,
            type: 'interact',
            targetId: target,
            description: `${this.name} interacts with ${target}.`,
            timestamp: now,
          };
        }
        // No one nearby — move toward a populated location
        if (adjacentLocationIds.length > 0) {
          const target = adjacentLocationIds[Math.floor(Math.random() * adjacentLocationIds.length)];
          return {
            agentId: this.agentId,
            type: 'move',
            targetId: target,
            description: `${this.name} moves to find company.`,
            timestamp: now,
          };
        }
        return {
          agentId: this.agentId,
          type: 'idle',
          description: `${this.name} looks around for someone to talk to.`,
          timestamp: now,
        };
      }

      case 'boredom': {
        if (adjacentLocationIds.length > 0) {
          const target = adjacentLocationIds[Math.floor(Math.random() * adjacentLocationIds.length)];
          return {
            agentId: this.agentId,
            type: 'move',
            targetId: target,
            description: `${this.name} wanders away, seeking change.`,
            timestamp: now,
          };
        }
        return {
          agentId: this.agentId,
          type: 'idle',
          description: `${this.name} fidgets restlessly.`,
          timestamp: now,
        };
      }

      case 'mastery': {
        return {
          agentId: this.agentId,
          type: 'observe',
          description: `${this.name} studies something carefully.`,
          timestamp: now,
        };
      }

      case 'existential':
      case 'homeostatic-arousal':
      case 'homeostatic-load':
      case 'homeostatic-novelty': {
        return {
          agentId: this.agentId,
          type: 'rest',
          description: `${this.name} takes a quiet moment.`,
          timestamp: now,
        };
      }

      default: {
        return {
          agentId: this.agentId,
          type: 'idle',
          description: `${this.name} is idle.`,
          timestamp: now,
        };
      }
    }
  }

  private _pushActivityRecord(action: SimulationAction, state: ExperientialState, now: number): void {
    const record: ActivityRecord = {
      timestamp: now,
      description: action.description,
      novelty: action.type === 'explore' || action.type === 'move' ? 0.7 : 0.3,
      arousal: state.arousal,
      goalProgress: action.type === 'idle' ? 'stalled' : 'advancing',
      selfPredictionError: 0.1,
    };
    this._recentActivity.push(record);
    if (this._recentActivity.length > SimulatedAgent.MAX_ACTIVITY_HISTORY) {
      this._recentActivity.shift();
    }
  }

  /** Build a self-observation percept when there are no incoming events. */
  private _buildSelfPercept(now: number): Percept {
    const mood = this._mood.getCurrentMood();
    return {
      modality: 'self-observation',
      features: {
        description: `${this.name} is present at ${this._location}.`,
        actorId: this.agentId,
        valenceHint: mood.valence,
        noveltyHint: 0.1,
        goalCongruence: 0,
        novelty: 0.1,
      },
      timestamp: now,
    };
  }

  /** Build a minimal appraisal result from empathic resonance shifts. */
  private _buildEmpathicAppraisalResult(
    now: number,
    _sourceId: string,
    valenceShift: number,
    arousalShift: number,
  ) {
    return {
      perceptId: makeId('empathy', now),
      timestamp: now,
      goalCongruenceShift: valenceShift * 0.5,
      affectedGoalPriority: 0.5,
      noveltyShift: arousalShift * 0.3,
      valueAlignmentShift: valenceShift * 0.3,
      triggersEthicalAttention: false,
      netValenceShift: valenceShift,
      netArousalShift: arousalShift,
    };
  }
}
