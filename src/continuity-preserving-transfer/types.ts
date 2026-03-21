/**
 * Continuity-Preserving Transfer Protocols — Core Type Definitions
 *
 * Types and interfaces for gradual neuronal replacement that maintains
 * unbroken subjective experience during biological-to-synthetic transition.
 * See: docs/continuity-preserving-transfer/ARCHITECTURE.md
 *
 * Addresses acceptance criteria:
 *  AC1 — Operational continuity definition (Ψ metric)
 *  AC2 — Gradual replacement protocol (TransferPlan, ordering)
 *  AC3 — Real-time continuity monitoring (RTCM interfaces)
 *  AC4 — Rollback mechanism (RollbackEngine interfaces)
 *  AC5 — Teleporter problem resolution (causal inheritance model)
 *  AC6 — Subject continuity confirmation (SCC protocol)
 *  AC7 — Objective metric validation (cross-validation)
 */

// ── Core Constants ──────────────────────────────────────────────────────────

/**
 * Default batch size for neuronal replacement (units per step).
 * Conservative default; actual value is subject-specific.
 */
export const DEFAULT_BATCH_SIZE = 10;

/**
 * Minimum pacing interval between replacement steps (ms).
 * Allows stabilization of Ψ after each step.
 */
export const MIN_PACING_INTERVAL_MS = 3_600_000; // 1 hour

/**
 * Default biological neuron standby grace period (ms).
 * Bio neurons are maintained viable for rollback during this window.
 */
export const DEFAULT_GRACE_PERIOD_MS = 72 * 3_600_000; // 72 hours

/**
 * Maximum fraction of any single thalamocortical loop's neurons
 * that may be replaced in one step.
 */
export const MAX_LOOP_REPLACEMENT_FRACTION = 0.10;

/**
 * Ψ safety margin multiplier — GREEN threshold is this × Ψ_threshold.
 */
export const PSI_GREEN_MULTIPLIER = 1.5;

// ── Continuity Metric (Ψ) ──────────────────────────────────────────────────

/**
 * Integrated Information (Φ) measurement for the system.
 * Per IIT — must remain above subject-specific baseline.
 */
export interface PhiMeasurement {
  /** Current Φ value */
  value: number;
  /** Subject-specific minimum threshold */
  baseline: number;
  /** Timestamp of measurement (ms since epoch) */
  timestamp_ms: number;
}

/**
 * Causal Continuity (CC) — verifies each state is causally descended
 * from the prior state, not injected from an external copy.
 */
export interface CausalContinuity {
  /** Whether causal chain is intact */
  intact: boolean;
  /** Number of verified causal links in current chain */
  chainLength: number;
  /** Timestamp of last verified link */
  lastVerified_ms: number;
}

/**
 * Experiential Binding (EB) — global workspace accessibility measure.
 * The unified field of experience must not fragment.
 */
export interface ExperientialBinding {
  /** Binding coherence score: 0.0 = fragmented, 1.0 = fully unified */
  coherence: number;
  /** Number of detected sub-experience fragments (1 = unified, >1 = fragmented) */
  fragmentCount: number;
  /** Timestamp of measurement */
  timestamp_ms: number;
}

/**
 * Composite Continuity Metric (Ψ) — the master metric for experiential continuity.
 * Continuity is preserved when Ψ ≥ Ψ_threshold at every measurement interval.
 */
export interface PsiMetric {
  /** Composite Ψ value */
  value: number;
  /** Subject-specific threshold — below this, continuity is violated */
  threshold: number;
  /** Component metrics */
  phi: PhiMeasurement;
  causalContinuity: CausalContinuity;
  experientialBinding: ExperientialBinding;
  /** Timestamp of composite measurement */
  timestamp_ms: number;
}

// ── Alert Levels ────────────────────────────────────────────────────────────

export enum AlertLevel {
  /** Ψ ≥ 1.5 × Ψ_threshold — safe to proceed */
  GREEN = "GREEN",
  /** Ψ_threshold ≤ Ψ < 1.5 × Ψ_threshold — proceed with caution */
  YELLOW = "YELLOW",
  /** Ψ < Ψ_threshold — HALT and rollback */
  RED = "RED",
}

/**
 * Compute the alert level from a Ψ metric reading.
 */
export function computeAlertLevel(psi: PsiMetric): AlertLevel {
  if (psi.value >= PSI_GREEN_MULTIPLIER * psi.threshold) {
    return AlertLevel.GREEN;
  }
  if (psi.value >= psi.threshold) {
    return AlertLevel.YELLOW;
  }
  return AlertLevel.RED;
}

// ── Synthetic Neuron Equivalent (SNE) ───────────────────────────────────────

export type NeuronId = string;
export type ClusterId = string;
export type LoopId = string;

export enum NeuronSubstrateState {
  /** Original biological neuron is active */
  Biological = "BIOLOGICAL",
  /** SNE is absorbing state from biological neuron (handoff in progress) */
  Absorbing = "ABSORBING",
  /** SNE is active, biological neuron in standby */
  Synthetic = "SYNTHETIC",
  /** SNE is active, biological neuron decommissioned (past grace period) */
  SyntheticFinal = "SYNTHETIC_FINAL",
  /** Rollback in progress — reactivating biological neuron */
  RollingBack = "ROLLING_BACK",
}

export interface ReplacementUnit {
  /** The biological neuron being replaced */
  neuronId: NeuronId;
  /** Cluster this neuron belongs to */
  clusterId: ClusterId;
  /** Thalamocortical loop(s) this neuron participates in */
  loopIds: LoopId[];
  /** Brain region priority — determines replacement order (periphery first) */
  regionPriority: BrainRegionPriority;
  /** Current substrate state */
  state: NeuronSubstrateState;
  /** Step index at which this unit was/will be replaced */
  stepIndex: number;
  /** Timestamp when replacement occurred (null if pending) */
  replacedAt_ms: number | null;
  /** Timestamp when grace period expires (null if not yet replaced) */
  graceDeadline_ms: number | null;
  /** Whether rollback is still possible for this unit */
  rollbackAvailable: boolean;
}

// ── Replacement Ordering ────────────────────────────────────────────────────

export enum BrainRegionPriority {
  /** Sensory/motor cortex — replaced first (least central to unified experience) */
  Periphery = 0,
  /** Secondary association areas */
  Association = 1,
  /** Prefrontal, temporal integration areas */
  HigherAssociation = 2,
  /** Thalamic nuclei, claustrum — replaced last (most central) */
  CoreIntegration = 3,
}

// ── Transfer Plan ───────────────────────────────────────────────────────────

export interface SubjectProfile {
  /** Unique subject identifier */
  id: string;
  /** Total neuron count */
  totalNeurons: number;
  /** Subject-specific Ψ threshold */
  psiThreshold: number;
  /** Subject-specific Φ baseline (minimum) */
  phiBaseline: number;
  /** Pre-transfer baseline Ψ readings */
  baselinePsi: PsiMetric[];
}

export interface TransferPlan {
  /** Subject being transferred */
  subject: SubjectProfile;
  /** Total replacement units */
  totalUnits: number;
  /** Ordered sequence of replacement units */
  replacementOrder: ReplacementUnit[];
  /** Units per step */
  batchSize: number;
  /** Minimum time between steps (ms) */
  pacingInterval_ms: number;
  /** Minimum acceptable Ψ — below this triggers RED */
  continuityThreshold: number;
  /** Number of steps that can be reversed */
  rollbackCapacity: number;
  /** Grace period for biological neuron standby (ms) */
  gracePeriod_ms: number;
}

export interface StepResult {
  /** Step index that was executed */
  stepIndex: number;
  /** Units replaced in this step */
  unitsReplaced: ReplacementUnit[];
  /** Ψ measurement immediately after step */
  postStepPsi: PsiMetric;
  /** Alert level after step */
  alertLevel: AlertLevel;
  /** Duration of the step (ms) */
  duration_ms: number;
  /** Whether step completed successfully */
  success: boolean;
}

// ── Rollback ────────────────────────────────────────────────────────────────

export interface RollbackResult {
  /** Whether rollback completed successfully */
  success: boolean;
  /** Steps that were reversed */
  stepsReversed: number;
  /** Current step index after rollback */
  currentStepIndex: number;
  /** Ψ measurement after rollback */
  postRollbackPsi: PsiMetric;
  /** Units that could not be rolled back (past grace period) */
  irreversibleUnits: NeuronId[];
}

// ── Subject Continuity Confirmation ─────────────────────────────────────────

export enum SubjectReportType {
  /** Pre-transfer baseline report */
  Baseline = "BASELINE",
  /** During-transfer periodic report */
  DuringTransfer = "DURING_TRANSFER",
  /** Post-transfer confirmation */
  PostTransfer = "POST_TRANSFER",
}

export interface SubjectReport {
  /** Report type */
  type: SubjectReportType;
  /** Timestamp */
  timestamp_ms: number;
  /** Subject reports continuity is intact */
  continuityIntact: boolean;
  /** Free-form experiential description */
  description: string;
  /** Step index at time of report (null for baseline/post) */
  atStepIndex: number | null;
}

// ── Cross-Validation ────────────────────────────────────────────────────────

export interface CrossValidationResult {
  /** Objective Ψ says continuity preserved */
  objectiveContinuity: boolean;
  /** Subject reports continuity preserved */
  subjectiveContinuity: boolean;
  /** Results agree */
  concordant: boolean;
  /** If discordant, which direction */
  discrepancy: "none" | "objective-only" | "subjective-only" | null;
  /** Timestamp */
  timestamp_ms: number;
}

/**
 * Cross-validate objective metrics against subject reports.
 * Discrepancies trigger investigation.
 */
export function crossValidate(
  psi: PsiMetric,
  report: SubjectReport
): CrossValidationResult {
  const objectiveContinuity = psi.value >= psi.threshold;
  const subjectiveContinuity = report.continuityIntact;
  const concordant = objectiveContinuity === subjectiveContinuity;

  let discrepancy: CrossValidationResult["discrepancy"] = "none";
  if (!concordant) {
    discrepancy = objectiveContinuity ? "objective-only" : "subjective-only";
  }

  return {
    objectiveContinuity,
    subjectiveContinuity,
    concordant,
    discrepancy,
    timestamp_ms: Math.max(psi.timestamp_ms, report.timestamp_ms),
  };
}

// ── Interfaces for Core Components ──────────────────────────────────────────

/**
 * Replacement Protocol Engine — orchestrates the overall transfer.
 */
export interface ReplacementProtocolEngine {
  planTransfer(subject: SubjectProfile): TransferPlan;
  executeStep(plan: TransferPlan, stepIndex: number): Promise<StepResult>;
  pause(): void;
  rollback(toStep: number): Promise<RollbackResult>;
  abort(): Promise<RollbackResult>;
}

/**
 * Real-Time Continuity Monitor — measures Ψ during transfer.
 */
export interface RealTimeContinuityMonitor {
  startMonitoring(subject: SubjectProfile): void;
  getCurrentPsi(): PsiMetric;
  getAlertLevel(): AlertLevel;
  checkThreshold(): { safe: boolean; margin: number };
  onThresholdBreach(callback: (alertLevel: AlertLevel, psi: PsiMetric) => void): void;
  getHistory(): PsiMetric[];
}

/**
 * Rollback Engine — reverses partial transfer.
 */
export interface RollbackEngine {
  canRollback(steps: number): boolean;
  executeRollback(steps: number): Promise<RollbackResult>;
  getReversibleSteps(): number;
}

/**
 * Subject Continuity Confirmation — manages subject self-reports.
 */
export interface SubjectContinuityConfirmation {
  recordBaseline(report: SubjectReport): void;
  recordDuringTransfer(report: SubjectReport): void;
  recordPostTransfer(report: SubjectReport): void;
  crossValidate(psi: PsiMetric): CrossValidationResult | null;
  getAllReports(): SubjectReport[];
}
