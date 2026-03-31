/**
 * CognitiveAgent — NPC Cognitive Stack facade (npc-cognitive-stack)
 *
 * Composes the four cognitive modules into a single tick-based update loop
 * suitable for game NPCs and social simulation agents.
 *
 * Wired subsystems:
 *   PersonalityModel      — Big Five trait profile, communication style
 *   DriveSystem           — Curiosity, social, homeostatic, boredom, mastery, existential
 *   MoodDynamics          — EWMA mood persistence parameterised by personality
 *   EmotionalInfluence    — Mood → influence vector for downstream subsystems
 *   EmotionalRegulation   — Three-level suffering threshold monitor
 *   ValenceMonitor        — Real-time valence / suffering reporting
 *   SocialCognitionModule — Theory of mind, trust, empathy, perspective-taking
 *
 * All dependencies are constructed internally; consumers only need to supply
 * a CognitiveAgentConfig and feed CognitiveTickInput each tick.
 *
 * Design invariants:
 *   - tick() is the sole state-mutating entry point (besides restoreFromSnapshot)
 *   - Serialization is round-trip safe via snapshot() / restoreFromSnapshot()
 *   - No dependency on agent-runtime, LLM substrate, or persistent storage
 */

import { PersonalityModel } from '../personality/personality-model.js';
import type { IPersonalityModel } from '../personality/interfaces.js';
import type { TraitProfile } from '../personality/types.js';

import { DriveSystem } from '../intrinsic-motivation/drive-system.js';
import type {
  DriveContext,
  DrivePersonalityParams,
  ExperientialStateDelta,
} from '../intrinsic-motivation/types.js';

import { MoodDynamics } from '../emotion-appraisal/mood-dynamics.js';
import { EmotionalInfluence } from '../emotion-appraisal/emotional-influence.js';
import { EmotionalRegulation } from '../emotion-appraisal/emotional-regulation.js';
import { AppraisalEngine } from '../emotion-appraisal/appraisal-engine.js';
import { ValenceMonitor } from '../emotion-appraisal/valence-monitor.js';
import type {
  IMoodDynamics,
  IEmotionalInfluence,
  IEmotionalRegulation,
  IValenceMonitor,
} from '../emotion-appraisal/interfaces.js';
import type { MoodParameters } from '../emotion-appraisal/types.js';

import { SocialCognitionModule } from '../social-cognition/social-cognition.js';
import type { ISocialCognitionModule } from '../social-cognition/interfaces.js';

import type { ExperientialState, ContinuityToken } from '../conscious-core/types.js';

import type { ICognitiveAgent } from './interfaces.js';
import type {
  CognitiveAgentConfig,
  CognitiveSnapshot,
  CognitiveTickInput,
  CognitiveTickResult,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build a minimal ExperientialState from tick input and current mood.
 * Used to satisfy the DriveContext.currentState requirement without coupling
 * the NPC stack to the full conscious-core pipeline.
 */
function buildMinimalState(
  now: number,
  valence: number,
  arousal: number,
  previousToken: ContinuityToken | null,
): ExperientialState {
  const token: ContinuityToken = {
    id: `tok-${now}`,
    previousId: previousToken?.id ?? null,
    timestamp: now,
  };
  return {
    timestamp: now,
    phenomenalContent: { modalities: ['cognitive'], richness: 0.5, raw: null },
    intentionalContent: { target: 'environment', clarity: 0.5 },
    valence: clamp(valence, -1, 1),
    arousal: clamp(arousal, 0, 1),
    unityIndex: 0.5,
    continuityToken: token,
  };
}

/**
 * Derive DrivePersonalityParams from the personality trait profile.
 * Maps the agent's Big Five traits to the drive system's parameter set.
 */
function extractDrivePersonality(profile: TraitProfile): DrivePersonalityParams {
  const get = (id: string, def: number): number => {
    const dim = profile.traits.get(id);
    return dim?.value ?? def;
  };
  return {
    curiosityTrait:       get('openness', 0.65),
    warmthTrait:          get('warmth', 0.55),
    volatilityTrait:      get('volatility', 0.40),
    preferredArousal:     0.5,
    preferredLoad:        0.4,
    preferredNovelty:     0.4,
    opennessTrait:        get('openness', 0.65),
    deliberatenessTrait:  get('deliberateness', 0.60),
  };
}

/**
 * Derive MoodParameters from personality traits.
 * Volatility maps directly to the EWMA decay rate.
 */
function buildMoodParams(profile: TraitProfile): MoodParameters {
  const volatility = profile.traits.get('volatility')?.value ?? 0.40;
  return {
    decayRate:      clamp(volatility * 0.4 + 0.05, 0.05, 0.45),
    valenceFloor:   -0.85,
    valenceCeiling:  1.0,
    arousalFloor:    0.0,
    arousalCeiling:  1.0,
  };
}

// ── Emotion subsystem bundle ──────────────────────────────────────────────────

interface EmotionBundle {
  moodDynamics: IMoodDynamics;
  emotionalInfluence: IEmotionalInfluence;
  emotionalRegulation: IEmotionalRegulation;
  valenceMonitor: IValenceMonitor;
}

function buildEmotionBundle(
  initialValence: number,
  initialArousal: number,
): EmotionBundle {
  const appraisalEngine = new AppraisalEngine();
  const moodDynamics    = new MoodDynamics(initialValence, initialArousal);
  const emotionalInfluence   = new EmotionalInfluence(moodDynamics);
  const emotionalRegulation  = new EmotionalRegulation(moodDynamics, appraisalEngine);
  const valenceMonitor       = new ValenceMonitor(moodDynamics, emotionalRegulation);
  return { moodDynamics, emotionalInfluence, emotionalRegulation, valenceMonitor };
}

// ── CognitiveAgent ────────────────────────────────────────────────────────────

export class CognitiveAgent implements ICognitiveAgent {
  readonly agentId: string;

  private readonly _personality: PersonalityModel;
  private readonly _drives: DriveSystem;
  private readonly _social: SocialCognitionModule;

  private _emotion: EmotionBundle;

  /** Last continuity token — threads the experiential state across ticks. */
  private _lastToken: ContinuityToken | null = null;

  constructor(config: CognitiveAgentConfig) {
    if (!config.agentId) {
      throw new Error('CognitiveAgentConfig requires a non-empty agentId.');
    }
    this.agentId = config.agentId;

    this._personality = new PersonalityModel({
      agentId: config.agentId,
      initialTraits: config.initialTraits ?? {},
    });

    this._drives = new DriveSystem();

    // Wire social cognition with initial warmth from personality
    const initialWarmth = config.initialTraits?.['warmth'] ?? 0.55;
    this._social = new SocialCognitionModule({ warmthDimension: initialWarmth });

    // Build emotion bundle with optional initial mood override
    this._emotion = buildEmotionBundle(
      config.initialMoodValence ?? 0.0,
      config.initialMoodArousal ?? 0.5,
    );
  }

  // ── ICognitiveAgent ───────────────────────────────────────────────────────

  tick(input: CognitiveTickInput): CognitiveTickResult {
    const { now } = input;

    // 1. Read current personality profile for derived parameters
    const profile     = this._personality.getTraitProfile();
    const driveParms  = extractDrivePersonality(profile);
    const moodParams  = buildMoodParams(profile);

    // 2. Build minimal experiential state for the drive context
    const currentMood = this._emotion.moodDynamics.getCurrentMood();
    const state = buildMinimalState(
      now,
      input.currentValence ?? currentMood.valence,
      input.currentArousal ?? currentMood.arousal,
      this._lastToken,
    );
    this._lastToken = state.continuityToken;

    // 3. Assemble drive context and run drive tick
    const driveContext: DriveContext = {
      currentState: state,
      worldModelUncertainty:          input.worldModelUncertainty,
      timeSinceLastSocialInteraction:  input.timeSinceLastSocialInteraction,
      recentActivity:                  input.recentActivity,
      currentCognitiveLoad:            input.currentCognitiveLoad,
      currentNovelty:                  input.currentNovelty,
      selfModelCoherence:              input.selfModelCoherence,
      personality:                     driveParms,
      now,
    };
    const driveResult = this._drives.tick(state, driveContext);

    // 4. Update mood — natural EWMA decay (no full appraisal pipeline needed)
    const moodState = this._emotion.moodDynamics.update(null, moodParams);

    // 5. Compute emotional influence vector
    const influenceVector = this._emotion.emotionalInfluence.getInfluenceVector();

    // 6. Check emotional regulation
    const regulationOutcome = this._emotion.emotionalRegulation.checkAndRegulate(moodState);

    return {
      driveStates:        driveResult.updatedDriveStates,
      goalCandidates:     driveResult.goalCandidates,
      moodState,
      influenceVector,
      regulationOutcome,
      experientialDelta:  driveResult.experientialDelta,
      diagnostics:        driveResult.diagnostics,
    };
  }

  getPersonality(): IPersonalityModel {
    return this._personality;
  }

  getSocialCognition(): ISocialCognitionModule {
    return this._social;
  }

  getValenceMonitor(): IValenceMonitor {
    return this._emotion.valenceMonitor;
  }

  snapshot(now: number): CognitiveSnapshot {
    return {
      agentId:             this.agentId,
      personalitySnapshot: this._personality.snapshot(),
      driveSnapshot:       this._drives.getSnapshot(now),
      moodSnapshot:        this._emotion.moodDynamics.getCurrentMood(),
      snapshotAt:          now,
    };
  }

  restoreFromSnapshot(snapshot: CognitiveSnapshot): void {
    if (snapshot.agentId !== this.agentId) {
      throw new Error(
        `Cannot restore snapshot for agent "${snapshot.agentId}" into agent "${this.agentId}".`,
      );
    }

    // Restore personality traits
    this._personality.restoreSnapshot(snapshot.personalitySnapshot);

    // Restore drive states
    this._drives.restoreFromSnapshot(snapshot.driveSnapshot);

    // Rebuild emotion bundle with the snapshotted mood values so that
    // MoodDynamics, EmotionalInfluence, EmotionalRegulation, and
    // ValenceMonitor all share the restored MoodDynamics instance.
    this._emotion = buildEmotionBundle(
      snapshot.moodSnapshot.valence,
      snapshot.moodSnapshot.arousal,
    );

    // Reset continuity token so the next tick starts a fresh chain
    this._lastToken = null;
  }
}
