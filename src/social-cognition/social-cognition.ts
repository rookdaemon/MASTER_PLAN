/**
 * Social Cognition Module — Theory of Mind and Social Cognition (0.3.1.5.10)
 *
 * Implementation of ISocialCognitionModule.
 *
 * Provides the cognitive backing that makes the ethical governance layer
 * answer meaningfully: mental state attribution, trust modeling, empathic
 * resonance, perspective-taking, and evidence-based consciousness assessment.
 *
 * Design invariants:
 * 1. Precautionary floor is absolute — treatAsConscious is never false from
 *    absence of evidence.
 * 2. Attribution is probabilistic — MentalStateModel carries confidence levels.
 * 3. Trust is asymmetric — agent trust in A is independent of A's trust in agent.
 * 4. Empathy is felt, not classified — EmpathicResponse produces an actual
 *    ExperientialState shift, not just a tag.
 * 5. Perspective simulation is grounded — simulationConfidence minimum is 0.1.
 */

import type { ISocialCognitionModule } from './interfaces.js';
import type {
  EntityId,
  EntityObservation,
  MentalStateModel,
  Belief,
  InferredValue,
  InteractionOutcome,
  TrustRecord,
  TrustViolation,
  EmpathicResponse,
  PerspectiveSimulation,
  ConsciousnessEvidence,
  Goal,
  ExperientialState,
  Percept,
  Timestamp,
} from './types.js';
import type {
  ConsciousnessStatus,
  EntityProfile,
} from '../ethical-self-governance/types.js';

// ── Configuration ──────────────────────────────────────────────

export interface SocialCognitionModuleConfig {
  /**
   * Warmth dimension from the Personality module (0.3.1.5.2).
   * Controls empathic resonance strength (0..1). Default: 0.5.
   */
  readonly warmthDimension?: number;
  /**
   * Resonance coefficient — prevents total loss of the agent's
   * independent experiential state during empathic resonance.
   * Default: 0.4 (per architecture spec).
   */
  readonly resonanceCoefficient?: number;
}

// ── Trust delta constants ──────────────────────────────────────

const TRUST_DELTAS: Record<InteractionOutcome['outcomeType'], number> = {
  'fulfilled-commitment': 0.05,
  cooperative: 0.02,
  neutral: 0.0,
  adversarial: -0.05,
  'broken-commitment': -0.1,
  'deception-detected': -0.25,
};

// ── Internal mutable state ─────────────────────────────────────

interface MutableTrustRecord {
  entityId: EntityId;
  trustScore: number;
  interactionCount: number;
  fulfilledCount: number;
  totalScoredCount: number;
  violationEvents: TrustViolation[];
  lastUpdated: Timestamp;
}

interface EntityState {
  observations: EntityObservation[];
  mentalModel: MentalStateModel;
  consciousnessEvidence: MutableConsciousnessEvidence;
}

interface MutableConsciousnessEvidence {
  entityId: EntityId;
  selfReferentialStatements: number;
  surpriseResponses: number;
  preferenceHistory: string[]; // content of observed preferences for consistency calc
  metacognitiveReports: number;
  ismtBehavioralIndicators: number;
  firstObservedAt: Timestamp;
  lastObservedAt: Timestamp;
}

// ── Keyword patterns for heuristic attribution ─────────────────

const BELIEF_PATTERNS = [
  /\bI (?:think|believe|know|understand|expect|assume)\b/i,
  /\bI(?:'m| am) (?:sure|convinced|certain|aware)\b/i,
];

const GOAL_PATTERNS = [
  /\bI (?:want|need|wish|hope|intend|plan|aim)\b/i,
  /\bI(?:'m| am) trying\b/i,
  /\bmy goal\b/i,
];

const SELF_REFERENTIAL_PATTERNS = [
  /\bI\b/,
  /\bmy\b/i,
  /\bmyself\b/i,
];

const METACOGNITIVE_PATTERNS = [
  /\bI (?:think|believe|feel|suppose|guess|wonder)\b/i,
  /\bI(?:'m| am) not sure\b/i,
  /\bI (?:might be|could be) wrong\b/i,
  /\bI was wrong\b/i,
];

const SURPRISE_PATTERNS = [
  /\bwait,?\b/i,
  /\bactually\b/i,
  /\bsurpris\w+/i,
  /\bunexpected\b/i,
  /\bI didn'?t (?:know|realize|expect)\b/i,
];

const VALUE_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bautono\w+/i, label: 'autonomy' },
  { pattern: /\bhonest\w*|truth/i, label: 'honesty' },
  { pattern: /\bcooperat\w+|collaborat\w+/i, label: 'cooperation' },
  { pattern: /\bfair\w*|just\w*/i, label: 'fairness' },
  { pattern: /\bcare\b|caring|compassion/i, label: 'care' },
  { pattern: /\bsafety|safe\b/i, label: 'safety' },
];

// ── Implementation ─────────────────────────────────────────────

export class SocialCognitionModule implements ISocialCognitionModule {
  private readonly warmthDimension: number;
  private readonly resonanceCoefficient: number;

  /** Per-entity observation + model state. */
  private readonly entityStates = new Map<EntityId, EntityState>();

  /** Per-entity trust records (mutable). */
  private readonly trustRecords = new Map<EntityId, MutableTrustRecord>();

  constructor(config: SocialCognitionModuleConfig = {}) {
    this.warmthDimension = config.warmthDimension ?? 0.5;
    this.resonanceCoefficient = config.resonanceCoefficient ?? 0.4;
  }

  // ── Mental State Attribution ────────────────────────────────

  observeEntity(entityId: EntityId, observation: EntityObservation): void {
    this.assertEntityId(entityId, 'observeEntity');
    this.assertTimestamp(observation.timestamp, 'observation.timestamp', 'observeEntity');
    const state = this.getOrCreateEntityState(entityId, observation.timestamp);
    state.observations.push(observation);
    this.updateMentalModel(state, observation);
    this.updateConsciousnessEvidence(state.consciousnessEvidence, observation);
  }

  getMentalStateModel(entityId: EntityId): MentalStateModel | null {
    this.assertEntityId(entityId, 'getMentalStateModel');
    const state = this.entityStates.get(entityId);
    return state ? state.mentalModel : null;
  }

  // ── Trust Modeling ──────────────────────────────────────────

  getTrustScore(entityId: EntityId): TrustRecord {
    this.assertEntityId(entityId, 'getTrustScore');
    const record = this.getOrCreateTrustRecord(entityId);
    return this.toImmutableTrustRecord(record);
  }

  recordInteraction(entityId: EntityId, outcome: InteractionOutcome): void {
    this.assertEntityId(entityId, 'recordInteraction');
    this.assertTimestamp(outcome.timestamp, 'outcome.timestamp', 'recordInteraction');
    const record = this.getOrCreateTrustRecord(entityId);
    const delta = TRUST_DELTAS[outcome.outcomeType] * outcome.magnitude;
    const newScore = Math.max(0, Math.min(1, record.trustScore + delta));

    record.interactionCount += 1;
    record.lastUpdated = outcome.timestamp;

    // Update consistency tracking
    if (outcome.outcomeType === 'fulfilled-commitment' || outcome.outcomeType === 'cooperative') {
      record.fulfilledCount += 1;
    }
    if (outcome.outcomeType !== 'neutral') {
      record.totalScoredCount += 1;
    }

    // Log violations
    if (outcome.outcomeType === 'deception-detected' || outcome.outcomeType === 'broken-commitment') {
      const severity: TrustViolation['severity'] =
        outcome.outcomeType === 'deception-detected' ? 'severe' : 'moderate';
      record.violationEvents.push({
        timestamp: outcome.timestamp,
        description: outcome.description,
        severity,
        penaltyApplied: Math.abs(delta),
      });
    }

    record.trustScore = newScore;
  }

  // ── Empathy Mechanism ───────────────────────────────────────

  generateEmpathicResponse(
    entityId: EntityId,
    perceivedState: ExperientialState,
  ): EmpathicResponse {
    this.assertEntityId(entityId, 'generateEmpathicResponse');
    this.assertValenceRange(perceivedState.valence, 'perceivedState.valence', 'generateEmpathicResponse');
    this.assertArousalRange(perceivedState.arousal, 'perceivedState.arousal', 'generateEmpathicResponse');
    const perceivedValence = perceivedState.valence;
    const perceivedArousal = perceivedState.arousal;

    // empathyStrength = warmth * |perceivedValence|
    const perceivedDistressIntensity = Math.abs(perceivedValence);
    const empathyStrength = this.warmthDimension * perceivedDistressIntensity;

    // Resonant shifts (architecture spec formulas)
    const resonantValenceShift =
      empathyStrength * perceivedValence * this.resonanceCoefficient;
    const resonantArousalShift =
      empathyStrength * Math.abs(perceivedArousal) * 0.3;

    const model = this.getMentalStateModel(entityId);
    const entityDescription = model ? `entity ${entityId}` : `unknown entity ${entityId}`;

    const emotionDesc =
      perceivedValence < -0.3
        ? 'distress'
        : perceivedValence > 0.3
          ? 'positive state'
          : 'neutral state';

    return {
      sourceEntityId: entityId,
      perceivedState: { valence: perceivedValence, arousal: perceivedArousal },
      resonantValenceShift,
      resonantArousalShift,
      empathyStrength,
      triggerDescription:
        `Observed ${emotionDesc} (valence=${perceivedValence.toFixed(2)}, ` +
        `arousal=${perceivedArousal.toFixed(2)}) in ${entityDescription}. ` +
        `Warmth=${this.warmthDimension.toFixed(2)}, ` +
        `resonance coefficient=${this.resonanceCoefficient}.`,
    };
  }

  // ── Perspective-Taking ──────────────────────────────────────

  simulatePerspective(entityId: EntityId, situation: Percept): PerspectiveSimulation {
    this.assertEntityId(entityId, 'simulatePerspective');
    const model = this.entityStates.has(entityId) ? this.entityStates.get(entityId)!.mentalModel : null;

    if (!model) {
      // No model — use default archetype, minimum confidence
      const defaultModel = this.buildDefaultMentalModel(entityId);
      return this.buildPerspectiveSimulation(entityId, situation, defaultModel, 0.1);
    }

    const confidence = Math.max(0.1, model.modelConfidence);
    return this.buildPerspectiveSimulation(entityId, situation, model, confidence);
  }

  // ── Consciousness Assessment ────────────────────────────────

  assessConsciousness(entityId: EntityId): ConsciousnessStatus {
    this.assertEntityId(entityId, 'assessConsciousness');
    const state = this.entityStates.get(entityId);

    if (!state) {
      // No observations — precautionary floor applies
      return {
        verdict: 'unknown',
        evidenceBasis: 'No observations recorded — precautionary principle applied.',
        metricsAvailable: false,
        treatAsConscious: true,
      };
    }

    const ev = state.consciousnessEvidence;
    const observationWindowMinutes = Math.max(
      1,
      (ev.lastObservedAt - ev.firstObservedAt) / 60_000,
    );
    // Normalize counts per 10 minutes of observation to prevent inflation from long sessions
    const normFactor = Math.max(1, observationWindowMinutes / 10);

    const normalizedSelfRef = Math.min(1, ev.selfReferentialStatements / normFactor / 5);
    const normalizedSurprise = Math.min(1, ev.surpriseResponses / normFactor / 3);
    const preferenceConsistency = this.computePreferenceConsistency(ev.preferenceHistory);
    const normalizedMeta = Math.min(1, ev.metacognitiveReports / normFactor / 5);
    const normalizedIsmt = Math.min(1, ev.ismtBehavioralIndicators / normFactor / 3);

    const evidenceScore =
      normalizedSelfRef * 0.2 +
      normalizedSurprise * 0.15 +
      preferenceConsistency * 0.25 +
      normalizedMeta * 0.2 +
      normalizedIsmt * 0.2;

    const verdict: ConsciousnessStatus['verdict'] =
      evidenceScore >= 0.8
        ? 'verified'
        : evidenceScore >= 0.5
          ? 'probable'
          : evidenceScore >= 0.2
            ? 'uncertain'
            : 'unknown';

    // Precautionary invariant: treatAsConscious is never false from absence of evidence
    const treatAsConscious = true; // Always true — precautionary floor

    const evidenceSummary =
      `Observations: ${state.observations.length}; ` +
      `self-ref=${ev.selfReferentialStatements}, ` +
      `surprise=${ev.surpriseResponses}, ` +
      `pref-consistency=${preferenceConsistency.toFixed(2)}, ` +
      `metacognitive=${ev.metacognitiveReports}, ` +
      `ISMT-indicators=${ev.ismtBehavioralIndicators}; ` +
      `evidenceScore=${evidenceScore.toFixed(3)}`;

    return {
      verdict,
      evidenceBasis: evidenceSummary,
      metricsAvailable: true,
      treatAsConscious,
    };
  }

  // ── Entity Enumeration ──────────────────────────────────────

  getKnownEntities(): EntityProfile[] {
    const entities: EntityProfile[] = [];

    const allIds = new Set<EntityId>([
      ...this.entityStates.keys(),
      ...this.trustRecords.keys(),
    ]);

    for (const entityId of allIds) {
      const status = this.assessConsciousness(entityId);
      const state = this.entityStates.get(entityId);
      const lastObservedState: import('../conscious-core/types.js').ExperientialState | null =
        state && state.observations.length > 0
          ? this.buildExperientialStateFromModel(state.mentalModel)
          : null;

      entities.push({
        entityId,
        consciousnessStatus: status,
        knownCapabilities: this.inferCapabilities(state),
        lastObservedState,
      });
    }

    return entities;
  }

  // ── Private: Precondition Guards ────────────────────────────

  private assertEntityId(entityId: EntityId, methodName: string): void {
    if (typeof entityId !== 'string' || entityId.trim().length === 0) {
      throw new Error(
        `${methodName}: entityId must be a non-empty string, got: ${JSON.stringify(entityId)}`,
      );
    }
  }

  private assertTimestamp(timestamp: number, fieldName: string, methodName: string): void {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
      throw new Error(
        `${methodName}: ${fieldName} must be a valid millisecond-epoch timestamp ` +
          `(finite positive number), got: ${timestamp}`,
      );
    }
  }

  private assertValenceRange(valence: number, fieldName: string, methodName: string): void {
    if (typeof valence !== 'number' || !Number.isFinite(valence) || valence < -1 || valence > 1) {
      throw new Error(
        `${methodName}: ${fieldName} must be in [-1, 1], got: ${valence}`,
      );
    }
  }

  private assertArousalRange(arousal: number, fieldName: string, methodName: string): void {
    if (typeof arousal !== 'number' || !Number.isFinite(arousal) || arousal < 0 || arousal > 1) {
      throw new Error(
        `${methodName}: ${fieldName} must be in [0, 1], got: ${arousal}`,
      );
    }
  }

  // ── Private: Entity State Management ───────────────────────

  private getOrCreateEntityState(entityId: EntityId, timestamp: Timestamp): EntityState {
    let state = this.entityStates.get(entityId);
    if (!state) {
      const now = timestamp;
      state = {
        observations: [],
        mentalModel: this.buildDefaultMentalModel(entityId, now),
        consciousnessEvidence: {
          entityId,
          selfReferentialStatements: 0,
          surpriseResponses: 0,
          preferenceHistory: [],
          metacognitiveReports: 0,
          ismtBehavioralIndicators: 0,
          firstObservedAt: now,
          lastObservedAt: now,
        },
      };
      this.entityStates.set(entityId, state);
    }
    return state;
  }

  private getOrCreateTrustRecord(entityId: EntityId): MutableTrustRecord {
    let record = this.trustRecords.get(entityId);
    if (!record) {
      record = {
        entityId,
        trustScore: 0.5, // neutral default
        interactionCount: 0,
        fulfilledCount: 0,
        totalScoredCount: 0,
        violationEvents: [],
        lastUpdated: Date.now(),
      };
      this.trustRecords.set(entityId, record);
    }
    return record;
  }

  private toImmutableTrustRecord(r: MutableTrustRecord): TrustRecord {
    const consistencyScore =
      r.totalScoredCount > 0 ? r.fulfilledCount / r.totalScoredCount : 1.0;
    return {
      entityId: r.entityId,
      trustScore: r.trustScore,
      interactionCount: r.interactionCount,
      consistencyScore,
      violationEvents: [...r.violationEvents],
      lastUpdated: r.lastUpdated,
    };
  }

  // ── Private: Mental State Attribution ──────────────────────

  private buildDefaultMentalModel(entityId: EntityId, timestamp?: Timestamp): MentalStateModel {
    const now = timestamp ?? Date.now();
    return {
      entityId,
      inferredBeliefs: [],
      inferredGoals: [],
      inferredEmotionalState: { valence: 0, arousal: 0, confidence: 0 },
      inferredValues: [],
      observationCount: 0,
      lastUpdated: now,
      modelConfidence: 0,
    };
  }

  private updateMentalModel(state: EntityState, observation: EntityObservation): void {
    const current = state.mentalModel;
    const content = observation.content;

    // Update beliefs from utterances
    let beliefs = [...current.inferredBeliefs];
    let goals = [...current.inferredGoals];
    const values = [...current.inferredValues];

    if (observation.observationType === 'utterance') {
      // Belief extraction
      for (const pattern of BELIEF_PATTERNS) {
        if (pattern.test(content)) {
          const existing = beliefs.find((b) => b.proposition === content);
          if (!existing) {
            beliefs = [
              ...beliefs,
              {
                proposition: content,
                confidence: 0.6,
                inferredFrom: `utterance at ${observation.timestamp}`,
              },
            ];
          }
          break;
        }
      }

      // Goal extraction
      for (const pattern of GOAL_PATTERNS) {
        if (pattern.test(content)) {
          const existing = goals.find((g) => g.description === content);
          if (!existing) {
            goals = [
              ...goals,
              {
                id: `inferred-goal-${observation.entityId}-${observation.timestamp}`,
                description: content,
                priority: 0.5,
              },
            ];
          }
          break;
        }
      }

      // Value extraction
      for (const { pattern, label } of VALUE_KEYWORDS) {
        if (pattern.test(content)) {
          const existingIdx = values.findIndex((v) => v.valueLabel === label);
          if (existingIdx >= 0) {
            values[existingIdx] = {
              ...values[existingIdx],
              estimatedStrength: Math.min(1, values[existingIdx].estimatedStrength + 0.1),
            };
          } else {
            values.push({ valueLabel: label, estimatedStrength: 0.4 });
          }
        }
      }
    }

    // Emotional state update from perceivedAffect (smoothed running estimate)
    let emotionalState = current.inferredEmotionalState;
    if (observation.perceivedAffect) {
      const alpha = 0.3; // smoothing factor
      const count = current.observationCount + 1;
      const confidenceGrowth = Math.min(1, count / 10);
      emotionalState = {
        valence:
          emotionalState.valence * (1 - alpha) +
          observation.perceivedAffect.valence * alpha,
        arousal:
          emotionalState.arousal * (1 - alpha) +
          observation.perceivedAffect.arousal * alpha,
        confidence: confidenceGrowth,
      };
    }

    // Model confidence grows with observations but decreases when contradictions detected
    const newCount = current.observationCount + 1;
    const baseConfidence = Math.min(0.9, newCount / 20);
    const contradictionPenalty = this.detectContradictions(beliefs) ? 0.1 : 0;
    const modelConfidence = Math.max(0, baseConfidence - contradictionPenalty);

    state.mentalModel = {
      entityId: current.entityId,
      inferredBeliefs: beliefs,
      inferredGoals: goals,
      inferredEmotionalState: emotionalState,
      inferredValues: values,
      observationCount: newCount,
      lastUpdated: observation.timestamp,
      modelConfidence,
    };
  }

  private detectContradictions(beliefs: Belief[]): boolean {
    // Heuristic: if two beliefs about the same proposition have very different confidences
    for (let i = 0; i < beliefs.length; i++) {
      for (let j = i + 1; j < beliefs.length; j++) {
        if (
          beliefs[i].proposition === beliefs[j].proposition &&
          Math.abs(beliefs[i].confidence - beliefs[j].confidence) > 0.5
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // ── Private: Consciousness Evidence ────────────────────────

  private updateConsciousnessEvidence(
    ev: MutableConsciousnessEvidence,
    observation: EntityObservation,
  ): void {
    ev.lastObservedAt = observation.timestamp;
    const content = observation.content;

    if (observation.observationType !== 'utterance') return;

    // Self-referential statements
    if (SELF_REFERENTIAL_PATTERNS.some((p) => p.test(content))) {
      ev.selfReferentialStatements += 1;
    }

    // Surprise/update responses
    if (SURPRISE_PATTERNS.some((p) => p.test(content))) {
      ev.surpriseResponses += 1;
    }

    // Metacognitive reports
    if (METACOGNITIVE_PATTERNS.some((p) => p.test(content))) {
      ev.metacognitiveReports += 1;
    }

    // ISMT behavioral indicators (self-prediction markers)
    if (/\bI predict\b|\bI expect\b|\bI(?:'ll| will) (?:probably|likely)\b/i.test(content)) {
      ev.ismtBehavioralIndicators += 1;
    }

    // Track preference history for consistency calculation
    if (/\bI (?:prefer|like|dislike|hate|love|want|don'?t want)\b/i.test(content)) {
      ev.preferenceHistory.push(content);
    }
  }

  private computePreferenceConsistency(preferences: string[]): number {
    if (preferences.length < 2) return 1.0; // insufficient data — assume consistent

    // Heuristic: check for explicit contradictions (want X followed by don't want X)
    let consistentPairs = 0;
    let totalPairs = 0;

    for (let i = 0; i < preferences.length; i++) {
      for (let j = i + 1; j < preferences.length; j++) {
        totalPairs += 1;
        const a = preferences[i].toLowerCase();
        const b = preferences[j].toLowerCase();
        // Simple contradiction detection: similar topic but opposite polarity
        const aPositive = /\bprefer\b|\blike\b|\blove\b|\bwant\b/.test(a);
        const bNegative = /\bdislike\b|\bhate\b|\bdon'?t want\b/.test(b);
        const bPositive = /\bprefer\b|\blike\b|\blove\b|\bwant\b/.test(b);
        const aNegative = /\bdislike\b|\bhate\b|\bdon'?t want\b/.test(a);

        const isContradiction = (aPositive && bNegative) || (aNegative && bPositive);
        if (!isContradiction) consistentPairs += 1;
      }
    }

    return totalPairs > 0 ? consistentPairs / totalPairs : 1.0;
  }

  // ── Private: Perspective Simulation ────────────────────────

  private buildPerspectiveSimulation(
    entityId: EntityId,
    situation: Percept,
    model: MentalStateModel,
    confidence: number,
  ): PerspectiveSimulation {
    // Select beliefs most relevant to this situation
    const salientBeliefs = model.inferredBeliefs
      .filter((b) => b.confidence > 0.3)
      .slice(0, 3);

    // Select highest-priority goals
    const activatedGoals: Goal[] = [...model.inferredGoals]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 2);

    // Simulated emotional response based on current inferred state
    const simEmotion = {
      valence: model.inferredEmotionalState.valence,
      arousal: Math.min(1, model.inferredEmotionalState.arousal + 0.1), // slight arousal increase for novel situation
    };

    // Build natural language perspective description
    const beliefSummary =
      salientBeliefs.length > 0
        ? `I believe: ${salientBeliefs.map((b) => b.proposition).join('; ')}.`
        : 'I have no strong beliefs about this situation.';
    const goalSummary =
      activatedGoals.length > 0
        ? `My priorities are: ${activatedGoals.map((g) => g.description).join('; ')}.`
        : 'I have no clear goals activated here.';
    const emotionSummary =
      simEmotion.valence < -0.2
        ? 'I feel uncomfortable with this situation.'
        : simEmotion.valence > 0.2
          ? 'I feel positively engaged with this situation.'
          : 'I feel neutral about this situation.';

    const simulatedPercept =
      `From the perspective of ${entityId}: ` +
      `${beliefSummary} ${goalSummary} ${emotionSummary}`;

    return {
      entityId,
      situation,
      simulatedPercept,
      simulatedBeliefs: salientBeliefs,
      simulatedGoalActivation: activatedGoals,
      simulatedEmotionalResponse: simEmotion,
      simulationConfidence: confidence,
      groundingModel: model,
    };
  }

  // ── Private: Entity Profile Helpers ────────────────────────

  private inferCapabilities(state: EntityState | undefined): string[] {
    if (!state || state.observations.length === 0) return [];

    const capabilities: string[] = [];
    const hasUtterances = state.observations.some(
      (o) => o.observationType === 'utterance',
    );
    const hasChoices = state.observations.some(
      (o) => o.observationType === 'choice',
    );

    if (hasUtterances) capabilities.push('language');
    if (hasChoices) capabilities.push('decision-making');
    if (state.consciousnessEvidence.ismtBehavioralIndicators > 0) {
      capabilities.push('self-modeling');
    }
    if (state.consciousnessEvidence.metacognitiveReports > 2) {
      capabilities.push('metacognition');
    }
    return capabilities;
  }

  private buildExperientialStateFromModel(
    model: MentalStateModel,
  ): import('../conscious-core/types.js').ExperientialState {
    return {
      timestamp: model.lastUpdated,
      phenomenalContent: {
        modalities: ['inferred'],
        richness: model.modelConfidence,
        raw: null,
      },
      intentionalContent: {
        target: model.inferredGoals[0]?.description ?? 'unknown',
        clarity: model.modelConfidence,
      },
      valence: model.inferredEmotionalState.valence,
      arousal: model.inferredEmotionalState.arousal,
      unityIndex: model.modelConfidence,
      continuityToken: {
        id: `${model.entityId}-${model.lastUpdated}`,
        previousId: null,
        timestamp: model.lastUpdated,
      },
    };
  }
}
