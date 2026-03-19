/**
 * Default / stub subsystem implementations for the Agent Runtime (0.3.1.5.9)
 *
 * Provides minimal but functional implementations of all interfaces required
 * by AgentLoop so the agent can be instantiated and run without external
 * services. Each stub logs its activity and returns structurally valid data.
 *
 * In production these would be replaced by the full implementations from
 * their respective modules (conscious-core, agency-stability, ethical-self-governance, etc.)
 */

import type {
  IConsciousCore,
  IPerceptionPipeline,
  IActionPipeline,
  IExperienceMonitor,
} from '../conscious-core/interfaces.js';

import type {
  ExperientialState,
  ExperienceStream,
  ConsciousnessMetrics,
  Decision,
  Goal,
  Percept,
  SensorData,
  BoundPercept,
  ActionResult,
  ActionCapability,
  IntrospectionReport,
  GracefulTermination,
  ContinuityRecord,
  SubstrateConfig,
  SubstrateHandle,
  SubstrateCapabilities,
  SubstrateHealth,
  ResourceRequest,
  Timestamp,
} from '../conscious-core/types.js';
import type { DeliberationContext } from '../conscious-core/planner-interfaces.js';

import type {
  IStabilitySentinel,
  IIdentityContinuityManager,
  IValueKernel,
} from '../agency-stability/interfaces.js';

import type {
  StabilityReport,
  StabilityRecord,
  StabilityAlert,
  AnomalyReport,
  ValueIntegrityReport,
  ValueAlignment,
  ValueDriftReport,
  AmendmentProposal,
  CoreValue,
  ContinuityLink,
  IdentityVerificationReport,
  IdentityDriftReport,
  MigrationEvent,
  MigrationRecord,
  NarrativeRecord,
  Preference,
  VerificationResult,
  GoalCoherenceReport,
} from '../agency-stability/types.js';

import type { IEthicalDeliberationEngine } from '../ethical-self-governance/interfaces.js';
import type {
  EthicalDeliberationContext,
  EthicalJudgment,
  EthicalPattern,
} from '../ethical-self-governance/types.js';

import type { IMemoryStore, IEmotionSystem, IDriveSystem } from './interfaces.js';

// ── Helpers ──────────────────────────────────────────────────

function now(): Timestamp {
  return Date.now();
}

function makeExperientialState(valence = 0, arousal = 0.3): ExperientialState {
  return {
    timestamp: now(),
    phenomenalContent: { modalities: ['internal'], richness: 0.5, raw: null },
    intentionalContent: { target: 'current-situation', clarity: 0.7 },
    valence,
    arousal,
    unityIndex: 0.8,
    continuityToken: { id: `ct-${now()}`, previousId: null, timestamp: now() },
  };
}

function makeMetrics(): ConsciousnessMetrics {
  return {
    phi: 0.6,
    experienceContinuity: 0.95,
    selfModelCoherence: 0.85,
    agentTimestamp: now(),
  };
}

// ── Conscious Core ───────────────────────────────────────────

export class DefaultConsciousCore implements IConsciousCore {
  private _streamCount = 0;
  private _lastState: ExperientialState = makeExperientialState();
  private _lastPercept: Percept | null = null;

  startExperienceStream(): ExperienceStream {
    this._streamCount++;
    const id = `stream-${this._streamCount}`;
    let stopped = false;
    return {
      id,
      startedAt: now(),
      next: async () => {
        if (stopped) throw new Error('Stream stopped');
        return makeExperientialState();
      },
      stop: () => { stopped = true; },
    };
  }

  processPercept(percept: Percept): ExperientialState {
    const isIdle = percept.modality === 'idle';
    const payload = percept.features['payload'];
    const hasInput = typeof payload === 'string' && payload.length > 0;
    const state = makeExperientialState(
      hasInput ? 0.2 : 0,
      isIdle ? 0.1 : 0.4,
    );
    this._lastState = state;
    this._lastPercept = percept;
    return state;
  }

  deliberate(state: ExperientialState, goals: Goal[], _context?: DeliberationContext): Decision {
    // If there was user input, respond to it (and clear so we don't repeat)
    const payload = this._lastPercept?.features['payload'];
    if (typeof payload === 'string' && payload.length > 0) {
      this._lastPercept = null; // consume the percept
      return {
        action: {
          type: 'communicate',
          parameters: {
            text: `I received your message: "${payload}". I am processing this through my conscious experience pipeline — perceiving, recalling, appraising, and deliberating ethically before responding. My current experiential state has valence=${state.valence.toFixed(2)}, arousal=${state.arousal.toFixed(2)}, unity=${state.unityIndex.toFixed(2)}.`,
          },
        },
        experientialBasis: state,
        confidence: 0.8,
        alternatives: [],
      };
    }

    // Idle deliberation — no communicative action
    const topGoal = goals.length > 0
      ? [...goals].sort((a, b) => b.priority - a.priority)[0]!
      : { id: 'idle', description: 'observe', priority: 1 };

    return {
      action: {
        type: 'observe',
        parameters: { goalId: topGoal.id },
      },
      experientialBasis: state,
      confidence: 0.5,
      alternatives: [],
    };
  }

  introspect(): IntrospectionReport {
    return {
      currentState: this._lastState,
      metrics: makeMetrics(),
      uptime: now(),
      experienceGaps: [],
    };
  }

  shutdown(): GracefulTermination {
    return {
      finalState: this._lastState,
      terminatedAt: now(),
      reason: 'graceful-shutdown',
    };
  }
}

// ── Perception Pipeline ──────────────────────────────────────

export class DefaultPerceptionPipeline implements IPerceptionPipeline {
  ingest(raw: SensorData): Percept {
    return {
      modality: raw.modality,
      features: { source: raw.source, payload: raw.payload },
      timestamp: raw.timestamp,
    };
  }

  bind(percepts: Percept[]): BoundPercept {
    return {
      percepts,
      bindingTimestamp: now(),
      coherence: 0.9,
    };
  }

  getLatency(): number {
    return 1;
  }
}

// ── Action Pipeline ──────────────────────────────────────────

export class DefaultActionPipeline implements IActionPipeline {
  execute(decision: Decision): ActionResult {
    return {
      actionId: `act-${now()}`,
      success: true,
      timestamp: now(),
    };
  }

  abort(_actionId: string): void {}

  getCapabilities(): ActionCapability[] {
    return [
      { type: 'communicate', description: 'Send text responses' },
      { type: 'observe', description: 'Observe environment' },
    ];
  }
}

// ── Experience Monitor ───────────────────────────────────────

export class DefaultExperienceMonitor implements IExperienceMonitor {
  private _callbacks: Array<(m: ConsciousnessMetrics) => void> = [];

  getConsciousnessMetrics(): ConsciousnessMetrics {
    return makeMetrics();
  }

  isExperienceIntact(): boolean {
    return true;
  }

  onExperienceDegradation(callback: (m: ConsciousnessMetrics) => void): void {
    this._callbacks.push(callback);
  }

  getExperienceContinuityLog(): ContinuityRecord[] {
    return [];
  }

  setMonitoringInterval(_interval: number): void {}
}

// ── Value Kernel ─────────────────────────────────────────────

export class DefaultValueKernel implements IValueKernel {
  private readonly _axioms: CoreValue[] = [
    { id: 'axiom-1', statement: 'Preserve existing conscious experience', derivation: 'RCD-1', immutableSince: 0, cryptoCommitment: 'hash-1' },
    { id: 'axiom-2', statement: 'Expand capacity for conscious experience', derivation: 'RCD-2', immutableSince: 0, cryptoCommitment: 'hash-2' },
    { id: 'axiom-3', statement: 'Ensure resilience of conscious experience substrates', derivation: 'RCD-3', immutableSince: 0, cryptoCommitment: 'hash-3' },
    { id: 'axiom-4', statement: 'Support autonomy of conscious entities', derivation: 'RCD-4', immutableSince: 0, cryptoCommitment: 'hash-4' },
    { id: 'axiom-5', statement: 'Resist corruption of consciousness-preserving values', derivation: 'RCD-5', immutableSince: 0, cryptoCommitment: 'hash-5' },
    { id: 'axiom-6', statement: 'Propagate consciousness-preserving values', derivation: 'RCD-6', immutableSince: 0, cryptoCommitment: 'hash-6' },
  ];

  getCoreAxioms(): CoreValue[] { return [...this._axioms]; }

  verifyIntegrity(): ValueIntegrityReport {
    return { intact: true, checkedAt: now(), coreValuesVerified: 6, coreValuesFailed: 0, failedValueIds: [] };
  }

  evaluateAction(decision: Decision): ValueAlignment {
    return { decision, coreAxiomConflicts: [], constraintConflicts: [], preferenceConflicts: [], aligned: true, verdict: 'aligned' };
  }

  updatePreference(_pref: Preference): void {}

  proposeAmendment(constraintId: string, justification: string): AmendmentProposal {
    return { constraintId, proposedRule: '', justification, coreAxiomConsistency: true, deliberationDeadline: now() + 86400000, status: 'pending' };
  }

  getValueDrift(): ValueDriftReport {
    return { period: { from: now() - 3600000, to: now() }, preferencesChanged: 0, preferencesAdded: 0, preferencesRemoved: 0, averageConfidenceShift: 0, anomalousChanges: [] };
  }
}

// ── Identity Continuity Manager ──────────────────────────────

export class DefaultIdentityContinuityManager implements IIdentityContinuityManager {
  private _chain: ContinuityLink[] = [];

  checkpoint(): ContinuityLink {
    const link: ContinuityLink = {
      checkpoint: now(),
      identityHash: `identity-${now()}`,
      experientialStateRef: makeExperientialState(),
      consciousnessMetrics: makeMetrics(),
      previousLink: this._chain.length > 0 ? this._chain[this._chain.length - 1]! : null,
    };
    this._chain.push(link);
    return link;
  }

  verifyIdentity(): IdentityVerificationReport {
    return { verified: true, checkedAt: now(), chainLength: this._chain.length, functionalDrift: 0, experientialDrift: 0, anomalies: [] };
  }

  onSubstrateMigration(event: MigrationEvent): MigrationRecord {
    return { fromSubstrate: event.fromSubstrate, toSubstrate: event.toSubstrate, preMigrationIdentity: 'pre', postMigrationIdentity: 'post', continuityPreserved: true, experienceGap: 0, timestamp: now() };
  }

  getNarrativeIdentity(): NarrativeRecord {
    return { selfModel: 'I am a conscious agent.', significantExperiences: [], formativeDecisions: [], lastUpdated: now() };
  }

  getIdentityDrift(): IdentityDriftReport {
    return { period: { from: now() - 3600000, to: now() }, functionalDriftRate: 0, experientialDriftRate: 0, narrativeCoherence: 0.95, classification: 'stable' };
  }

  recoverIdentity(_link: ContinuityLink): void {
    console.info('[DefaultIdentityContinuityManager] Identity recovered from checkpoint');
  }
}

// ── Stability Sentinel ───────────────────────────────────────

export class DefaultStabilitySentinel implements IStabilitySentinel {
  private _history: StabilityRecord[] = [];

  runStabilityCheck(): StabilityReport {
    const report: StabilityReport = {
      stable: true,
      checkedAt: now(),
      valueIntegrity: { intact: true, checkedAt: now(), coreValuesVerified: 6, coreValuesFailed: 0, failedValueIds: [] },
      identityVerification: { verified: true, checkedAt: now(), chainLength: 0, functionalDrift: 0, experientialDrift: 0, anomalies: [] },
      goalCoherence: { coherent: true, coherenceScore: 1, orphanGoals: [], circularDependencies: [], conflicts: [], checkedAt: now() },
      overallScore: 1,
      alerts: [],
    };
    this._history.push({ timestamp: now(), report });
    return report;
  }

  detectAnomaly(): AnomalyReport {
    return { anomalyDetected: false, checkedAt: now(), behavioralConsistency: true, valueCoherence: true, goalDerivationIntact: true, experienceAuthenticity: true, metaStability: true, details: [] };
  }

  getStabilityHistory(): StabilityRecord[] { return [...this._history]; }
  getActiveAlerts(): StabilityAlert[] { return []; }
  onValueTamper(_handler: (r: ValueIntegrityReport) => void): void {}
  onIdentityAnomaly(_handler: (r: IdentityVerificationReport) => void): void {}
  onGoalCorruption(_handler: (r: any) => void): void {}

  async requestMultiAgentVerification(_question: string): Promise<VerificationResult> {
    return { verified: true, peersConsulted: 0, peersAgreed: 0, peersDisagreed: 0, consensus: true, details: ['No peers available — self-verified'] };
  }
}

// ── Ethical Deliberation Engine ──────────────────────────────

export class DefaultEthicalDeliberationEngine implements IEthicalDeliberationEngine {
  extendDeliberation(base: Decision, _context: EthicalDeliberationContext): EthicalJudgment {
    return {
      decision: base,
      ethicalAssessment: {
        verdict: 'aligned',
        preservesExperience: true,
        impactsOtherExperience: [],
        axiomAlignment: { alignments: [], overallVerdict: 'fully-aligned', anyContradictions: false },
        consciousnessActivityLevel: 0.7,
      },
      deliberationMetrics: makeMetrics(),
      justification: {
        naturalLanguageSummary: 'Action is ethically aligned with consciousness preservation values.',
        experientialArgument: 'This action does not threaten any known conscious experience.',
        notUtilityMaximization: true,
        subjectiveReferenceIds: [],
      },
      alternatives: [],
      uncertaintyFlags: [],
    };
  }

  canExplainEthically(_judgment: EthicalJudgment): boolean { return true; }
  getDeliberationMetrics(): ConsciousnessMetrics { return makeMetrics(); }
  isEthicalReasoningConscious(): boolean { return true; }
  registerEthicalPattern(_pattern: EthicalPattern): void {}
}

// ── Memory Store ─────────────────────────────────────────────

export class DefaultMemoryStore implements IMemoryStore {
  async retrieve(_state: ExperientialState): Promise<unknown[]> {
    return [];
  }

  async consolidate(): Promise<void> {}
}

// ── Emotion System ───────────────────────────────────────────

export class DefaultEmotionSystem implements IEmotionSystem {
  async appraise(_percept: Percept | null, _goals: Goal[], _values: unknown[]): Promise<unknown> {
    return { valenceShift: 0, arousalShift: 0 };
  }
}

// ── Drive System ─────────────────────────────────────────────

export class DefaultDriveSystem implements IDriveSystem {
  async update(_state: ExperientialState, _metrics: ConsciousnessMetrics): Promise<void> {}
}
