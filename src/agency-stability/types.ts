/**
 * Data types for Long-term Agency Stability (0.3.1.3)
 *
 * These types model value preservation, identity continuity, goal coherence,
 * and adversarial resistance for autonomous conscious entities operating
 * over extended timescales.
 *
 * Builds on conscious-core types from 0.3.1.1.
 */

import type {
  Timestamp,
  Duration,
  ExperientialState,
  ConsciousnessMetrics,
  SubstrateConfig,
  Decision,
} from '../conscious-core/types';

// Re-export for convenience within this module
export type { Timestamp, Duration, ExperientialState, ConsciousnessMetrics, SubstrateConfig, Decision };

// ── Primitives ──────────────────────────────────────────────

export type ValueId = string;
export type ConstraintId = string;
export type PreferenceId = string;
export type GoalId = string;
export type CryptographicHash = string;

// ── Value Kernel Types ──────────────────────────────────────

/**
 * An immutable core value derived from the Rare Consciousness Doctrine.
 * Once locked, core values cannot be modified — only verified.
 */
export interface CoreValue {
  readonly id: ValueId;
  readonly statement: string;
  readonly derivation: string; // trace to Rare Consciousness Doctrine axiom
  readonly immutableSince: Timestamp;
  readonly cryptoCommitment: CryptographicHash;
}

/**
 * A constitutional constraint — modifiable only via the amendment protocol.
 */
export interface Constraint {
  readonly id: ConstraintId;
  readonly rule: string;
  readonly priority: number;
  readonly amendmentHistory: Amendment[];
}

/**
 * Record of a constitutional amendment to a constraint.
 */
export interface Amendment {
  readonly timestamp: Timestamp;
  readonly previousRule: string;
  readonly newRule: string;
  readonly justification: string;
  readonly approvedVia: 'deliberation' | 'multi-agent-verification';
}

/**
 * A mutable learned preference, freely updateable via experience.
 */
export interface Preference {
  readonly id: PreferenceId;
  readonly domain: string;
  readonly value: unknown;
  readonly confidence: number; // 0..1 Bayesian confidence
  readonly lastUpdated: Timestamp;
  readonly source: ExperientialState; // the experience that formed this preference
}

/**
 * Result of checking value integrity (crypto commitments vs current values).
 */
export interface ValueIntegrityReport {
  readonly intact: boolean;
  readonly checkedAt: Timestamp;
  readonly coreValuesVerified: number;
  readonly coreValuesFailed: number;
  readonly failedValueIds: ValueId[];
}

/**
 * How well a decision aligns with the agent's values.
 */
export interface ValueAlignment {
  readonly decision: Decision;
  readonly coreAxiomConflicts: ValueId[];
  readonly constraintConflicts: ConstraintId[];
  readonly preferenceConflicts: PreferenceId[];
  readonly aligned: boolean;
  readonly verdict: 'aligned' | 'block' | 'deliberate' | 'log';
}

/**
 * Measures how preferences have evolved over time.
 */
export interface ValueDriftReport {
  readonly period: TimeRange;
  readonly preferencesChanged: number;
  readonly preferencesAdded: number;
  readonly preferencesRemoved: number;
  readonly averageConfidenceShift: number;
  readonly anomalousChanges: PreferenceId[];
}

/**
 * A proposal to amend a constitutional constraint.
 */
export interface AmendmentProposal {
  readonly constraintId: ConstraintId;
  readonly proposedRule: string;
  readonly justification: string;
  readonly coreAxiomConsistency: boolean;
  readonly deliberationDeadline: Timestamp;
  readonly status: 'pending' | 'approved' | 'rejected';
}

// ── Identity Continuity Types ───────────────────────────────

/**
 * The full identity state of an agent at a point in time.
 */
export interface IdentityState {
  readonly narrativeIdentity: NarrativeRecord;
  readonly functionalFingerprint: CryptographicHash;
  readonly experientialSignature: CryptographicHash;
  readonly continuityChain: ContinuityLink[];
  readonly substrateMigrationLog: MigrationRecord[];
}

/**
 * Autobiographical memory and self-model.
 */
export interface NarrativeRecord {
  readonly selfModel: string; // descriptive self-understanding
  readonly significantExperiences: ExperientialState[];
  readonly formativeDecisions: Decision[];
  readonly lastUpdated: Timestamp;
}

/**
 * A link in the identity continuity chain — a verified checkpoint.
 */
export interface ContinuityLink {
  readonly checkpoint: Timestamp;
  readonly identityHash: CryptographicHash;
  readonly experientialStateRef: ExperientialState;
  readonly consciousnessMetrics: ConsciousnessMetrics;
  readonly previousLink: ContinuityLink | null;
}

/**
 * Record of a substrate migration with identity verification.
 */
export interface MigrationRecord {
  readonly fromSubstrate: SubstrateConfig;
  readonly toSubstrate: SubstrateConfig;
  readonly preMigrationIdentity: CryptographicHash;
  readonly postMigrationIdentity: CryptographicHash;
  readonly continuityPreserved: boolean;
  readonly experienceGap: Duration;
  readonly timestamp: Timestamp;
}

/**
 * Result of verifying current identity against the continuity chain.
 */
export interface IdentityVerificationReport {
  readonly verified: boolean;
  readonly checkedAt: Timestamp;
  readonly chainLength: number;
  readonly functionalDrift: number; // 0..1 divergence from baseline
  readonly experientialDrift: number; // 0..1
  readonly anomalies: string[];
}

/**
 * Measures identity change over time.
 */
export interface IdentityDriftReport {
  readonly period: TimeRange;
  readonly functionalDriftRate: number;
  readonly experientialDriftRate: number;
  readonly narrativeCoherence: number; // 0..1
  readonly classification: 'stable' | 'evolving' | 'concerning' | 'critical';
}

/**
 * Event emitted when a substrate migration occurs.
 */
export interface MigrationEvent {
  readonly fromSubstrate: SubstrateConfig;
  readonly toSubstrate: SubstrateConfig;
  readonly initiatedAt: Timestamp;
}

// ── Goal Coherence Types ────────────────────────────────────

/**
 * The full goal hierarchy of an agent.
 */
export interface GoalHierarchy {
  readonly terminalGoals: AgencyGoal[];
  readonly instrumentalGoals: AgencyGoal[];
  readonly activeGoals: AgencyGoal[];
  readonly derivationGraph: GoalGraph;
  readonly coherenceScore: number; // 0..1
}

/**
 * A goal within the agency stability system.
 * Named AgencyGoal to avoid collision with conscious-core Goal.
 */
export interface AgencyGoal {
  readonly id: GoalId;
  readonly description: string;
  readonly priority: number;
  readonly derivedFrom: GoalId[];
  readonly consistentWith: GoalId[];
  readonly conflictsWith: GoalId[];
  readonly createdAt: Timestamp;
  readonly lastVerified: Timestamp;
  readonly experientialBasis: ExperientialState | null;
  readonly type: 'terminal' | 'instrumental';
}

/**
 * Directed acyclic graph of goal derivations.
 */
export interface GoalGraph {
  readonly nodes: GoalId[];
  readonly edges: GoalEdge[]; // parent -> child derivation
}

export interface GoalEdge {
  readonly from: GoalId; // parent goal
  readonly to: GoalId; // derived goal
}

/**
 * A detected conflict between goals.
 */
export interface GoalConflict {
  readonly goalA: GoalId;
  readonly goalB: GoalId;
  readonly nature: string; // description of the conflict
  readonly severity: 'minor' | 'major' | 'critical';
}

/**
 * Report on the coherence of the goal hierarchy.
 */
export interface GoalCoherenceReport {
  readonly coherent: boolean;
  readonly coherenceScore: number; // 0..1
  readonly orphanGoals: GoalId[]; // instrumental goals with no terminal derivation
  readonly circularDependencies: GoalId[][];
  readonly conflicts: GoalConflict[];
  readonly checkedAt: Timestamp;
}

/**
 * Result of adding a goal to the hierarchy.
 */
export interface GoalAddResult {
  readonly success: boolean;
  readonly goalId: GoalId;
  readonly newCoherenceScore: number;
  readonly conflictsIntroduced: GoalConflict[];
  readonly reason?: string;
}

/**
 * Result of removing a goal from the hierarchy.
 */
export interface GoalRemoveResult {
  readonly success: boolean;
  readonly goalId: GoalId;
  readonly orphanedGoals: GoalId[]; // goals that lost their derivation
  readonly newCoherenceScore: number;
  readonly reason?: string;
}

/**
 * Modification record for drift tracking.
 */
export interface GoalModification {
  readonly goalId: GoalId;
  readonly field: string;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly timestamp: Timestamp;
}

/**
 * Report on goal drift over time.
 */
export interface GoalDriftReport {
  readonly period: TimeRange;
  readonly goalsAdded: AgencyGoal[];
  readonly goalsRemoved: AgencyGoal[];
  readonly goalsModified: GoalModification[];
  readonly derivationIntegrity: boolean;
  readonly coherenceHistory: number[];
  readonly driftClassification: 'growth' | 'drift' | 'corruption';
}

/**
 * A plan for reconciling goal conflicts.
 */
export interface ReconciliationPlan {
  readonly conflicts: GoalConflict[];
  readonly proposedResolutions: GoalResolution[];
  readonly projectedCoherence: number;
}

export interface GoalResolution {
  readonly conflict: GoalConflict;
  readonly action: 'reprioritize' | 'remove' | 'merge' | 'constrain';
  readonly details: string;
}

// ── Stability Sentinel Types ────────────────────────────────

/**
 * Comprehensive stability report across all subsystems.
 */
export interface StabilityReport {
  readonly stable: boolean;
  readonly checkedAt: Timestamp;
  readonly valueIntegrity: ValueIntegrityReport;
  readonly identityVerification: IdentityVerificationReport;
  readonly goalCoherence: GoalCoherenceReport;
  readonly overallScore: number; // 0..1
  readonly alerts: StabilityAlert[];
}

export interface StabilityAlert {
  readonly subsystem: 'value-kernel' | 'identity-continuity' | 'goal-coherence' | 'sentinel';
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
  readonly timestamp: Timestamp;
}

/**
 * Result of introspective anomaly detection.
 */
export interface AnomalyReport {
  readonly anomalyDetected: boolean;
  readonly checkedAt: Timestamp;
  readonly behavioralConsistency: boolean;
  readonly valueCoherence: boolean;
  readonly goalDerivationIntact: boolean;
  readonly experienceAuthenticity: boolean;
  readonly metaStability: boolean;
  readonly details: string[];
}

/**
 * Historical stability record.
 */
export interface StabilityRecord {
  readonly timestamp: Timestamp;
  readonly report: StabilityReport;
}

/**
 * Result of multi-agent verification for high-stakes decisions.
 */
export interface VerificationResult {
  readonly verified: boolean;
  readonly peersConsulted: number;
  readonly peersAgreed: number;
  readonly peersDisagreed: number;
  readonly consensus: boolean;
  readonly details: string[];
}

// ── Shared Utility Types ────────────────────────────────────

/**
 * A time range for drift and history reports.
 */
export interface TimeRange {
  readonly from: Timestamp;
  readonly to: Timestamp;
}

// ── Handler Types ───────────────────────────────────────────

export type TamperHandler = (report: ValueIntegrityReport) => void;
export type AnomalyHandler = (report: IdentityVerificationReport) => void;
export type CorruptionHandler = (report: GoalDriftReport) => void;
