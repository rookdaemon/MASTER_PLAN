/**
 * Unified Consciousness Across Mixed Substrates — Core Type Definitions
 *
 * Types and interfaces for maintaining phenomenal unity across a hybrid
 * biological-synthetic cognitive system.
 * See: docs/unified-consciousness-mixed-substrates/ARCHITECTURE.md
 *
 * Four architectural components:
 *   1. Cross-Substrate Integration Protocol (CSIP)
 *   2. Temporal Synchronization Engine (TSE)
 *   3. Unity Monitoring Instrumentation (UMI)
 *   4. Fragmentation Recovery System (FRS)
 */

// ── Core Constants ──────────────────────────────────────────────────────────

/** Maximum cross-substrate latency for gamma-band coherence (ms) */
export const GAMMA_BINDING_LATENCY_MS = 30;

/** Gamma cycle duration range (ms) */
export const GAMMA_CYCLE_MIN_MS = 10;
export const GAMMA_CYCLE_MAX_MS = 33; // ~30Hz lower bound

/** Maximum fragmentation detection latency (ms) — must be below conscious noticeability */
export const MAX_DETECTION_LATENCY_MS = 100;

/** Total recovery budget: detection + recovery (ms) */
export const TOTAL_RECOVERY_BUDGET_MS = 200;

/** Minimum number of independent unity metrics that must agree */
export const MIN_AGREEING_METRICS = 2;

// ── Binding Domain & Channel Types (CSIP) ───────────────────────────────────

export enum BindingDomain {
  Sensory = "SENSORY",
  Temporal = "TEMPORAL",
  Semantic = "SEMANTIC",
  Executive = "EXECUTIVE",
  Affective = "AFFECTIVE",
}

export enum CoherenceMode {
  PhaseLock = "PHASE_LOCK",
  MutualInfo = "MUTUAL_INFO",
  PredictiveCoding = "PREDICTIVE_CODING",
}

export type ChannelId = string;

export interface NeuralPopulation {
  regionId: string;
  neuronCount: number;
  /** Primary oscillation frequency of this population (Hz) */
  dominantFrequencyHz: number;
}

export interface ComputeNodeSet {
  nodeIds: string[];
  totalCapacityFlops: number;
}

export interface BindingChannel {
  id: ChannelId;
  domain: BindingDomain;
  biologicalEndpoints: NeuralPopulation[];
  syntheticEndpoints: ComputeNodeSet;
  coherenceProtocol: CoherenceMode;
  /** Must be ≤ GAMMA_BINDING_LATENCY_MS for gamma-band domains */
  maxLatencyMs: number;
  minBandwidthBitsPerSec: number;
}

// ── Integration Frame (CSIP) ────────────────────────────────────────────────

export interface SyncPulse {
  /** Source biological oscillation driving this pulse */
  sourceRegionId: string;
  /** Phase angle (radians, 0–2π) */
  phase: number;
  /** Instantaneous frequency (Hz) */
  frequencyHz: number;
  timestampMs: number;
}

export interface IntegrationFrame {
  /** Monotonically increasing frame identifier */
  frameId: number;
  /** Frame duration in ms (typically one gamma cycle: 10–30ms) */
  durationMs: number;
  /** Master clock signal derived from biological oscillation */
  syncSignal: SyncPulse;
  /** Deadline: information arriving after this defers to next frame */
  bindingDeadlineMs: number;
}

// ── Binding Verification (CSIP) ─────────────────────────────────────────────

export interface BindingVerification {
  frameId: number;
  channelsBound: ChannelId[];
  channelsFailed: ChannelId[];
  /** Φ or proxy metric — integrated information estimate */
  integratedInformationEstimate: number;
  /** 0.0–1.0 confidence that unity was achieved in this frame */
  unityConfidence: number;
}

// ── Frequency Bands (TSE) ───────────────────────────────────────────────────

export enum FrequencyBand {
  Delta = "DELTA",     // 0.5–4 Hz
  Theta = "THETA",     // 4–8 Hz
  Alpha = "ALPHA",     // 8–13 Hz
  Beta = "BETA",       // 13–30 Hz
  Gamma = "GAMMA",     // 30–100 Hz
}

export const FREQUENCY_BAND_RANGES: Record<FrequencyBand, { minHz: number; maxHz: number }> = {
  [FrequencyBand.Delta]: { minHz: 0.5, maxHz: 4 },
  [FrequencyBand.Theta]: { minHz: 4, maxHz: 8 },
  [FrequencyBand.Alpha]: { minHz: 8, maxHz: 13 },
  [FrequencyBand.Beta]: { minHz: 13, maxHz: 30 },
  [FrequencyBand.Gamma]: { minHz: 30, maxHz: 100 },
};

// ── Oscillation Tracker (TSE) ───────────────────────────────────────────────

export interface OscillationTracker {
  targetBands: FrequencyBand[];
  /** Current phase estimate (radians, 0–2π) */
  phaseEstimate: number;
  /** Instantaneous frequency estimate (Hz) */
  frequencyEstimateHz: number;
  /** Tracker confidence 0.0–1.0 */
  confidence: number;
  /** Which biological region drives this tracker */
  source: NeuralPopulation;
}

// ── Sync Controller (TSE) ───────────────────────────────────────────────────

export enum SyncMode {
  PhaseLocked = "PHASE_LOCKED",
  AdaptiveBuffer = "ADAPTIVE_BUFFER",
  FreeRunning = "FREE_RUNNING",
}

export enum CorrectionMode {
  Stretch = "STRETCH",
  Compress = "COMPRESS",
  SkipAndInterpolate = "SKIP_AND_INTERPOLATE",
}

export interface SyncController {
  mode: SyncMode;
  /** Desired phase relationship (radians, typically 0 for in-phase) */
  targetPhaseOffset: number;
  /** Maximum tolerable phase drift before correction (ms) */
  maxDriftMs: number;
  correctionStrategy: CorrectionMode;
}

// ── Adaptive Buffer (TSE) ───────────────────────────────────────────────────

export enum InterpolationMode {
  Linear = "LINEAR",
  Predictive = "PREDICTIVE",
  ZeroOrderHold = "ZERO_ORDER_HOLD",
}

export enum OverflowPolicy {
  DropOldest = "DROP_OLDEST",
  Compress = "COMPRESS",
  SignalFragmentation = "SIGNAL_FRAGMENTATION",
}

export interface AdaptiveBuffer {
  /** Maximum buffering depth (ms) */
  capacityMs: number;
  /** Current buffer fill level (ms) */
  currentFillMs: number;
  interpolationMode: InterpolationMode;
  overflowPolicy: OverflowPolicy;
}

// ── Unity Metrics (UMI) ─────────────────────────────────────────────────────

export enum MetricType {
  Phi = "PHI",
  NeuralComplexity = "NEURAL_COMPLEXITY",
  CrossSubstrateMutualInfo = "CROSS_SUBSTRATE_MUTUAL_INFO",
  BindingCoherence = "BINDING_COHERENCE",
}

export interface SubstrateCoverage {
  biologicalRegions: string[];
  syntheticNodes: string[];
  /** Fraction of total system covered: 0.0–1.0 */
  coverageFraction: number;
}

export interface UnityMetric {
  metricType: MetricType;
  value: number;
  timestampMs: number;
  confidenceInterval: [lower: number, upper: number];
  substrateCoverage: SubstrateCoverage;
}

// ── Fragmentation Detection (UMI) ───────────────────────────────────────────

export enum Severity {
  Warning = "WARNING",
  Critical = "CRITICAL",
  Emergency = "EMERGENCY",
}

export interface FragmentationDetectorConfig {
  /** Φ measured during known-unified calibration */
  baselinePhi: number;
  /** Early warning: e.g. 0.85 × baseline */
  warningThreshold: number;
  /** Fragmentation likely: e.g. 0.70 × baseline */
  criticalThreshold: number;
  /** Fragmentation occurring: e.g. 0.50 × baseline */
  emergencyThreshold: number;
  /** Must be < MAX_DETECTION_LATENCY_MS */
  detectionLatencyMs: number;
  /** Sliding window for metric calculation (ms) */
  measurementWindowMs: number;
}

export interface FragmentationAlert {
  severity: Severity;
  metricSnapshot: UnityMetric;
  affectedChannels: ChannelId[];
  recommendedAction: RecoveryActionType;
  timestampMs: number;
}

// ── Calibration (UMI) ───────────────────────────────────────────────────────

export interface CognitiveTask {
  id: string;
  name: string;
  /** Whether this task requires cross-substrate binding to complete */
  requiresCrossSubstrateBinding: boolean;
}

export interface CalibrationProtocol {
  calibrationTasks: CognitiveTask[];
  baselineDurationSec: number;
  recalibrationIntervalSec: number;
  subjectReportIntegration: boolean;
}

// ── Recovery Actions (FRS) ──────────────────────────────────────────────────

export enum RecoveryActionType {
  /** Force re-synchronization of TSE to current biological phase */
  Resync = "RESYNC",
  /** Reduce cross-substrate traffic to binding-critical channels only */
  ReduceBandwidth = "REDUCE_BANDWIDTH",
  /** Migrate active processes to a single substrate temporarily */
  Consolidate = "CONSOLIDATE",
  /** Revert to a previously known-unified configuration */
  FallbackConfig = "FALLBACK_CONFIG",
  /** Pause synthetic processing; biology carries consciousness alone */
  EmergencyFreeze = "EMERGENCY_FREEZE",
}

export interface RecoveryAction {
  actionType: RecoveryActionType;
  /** Expected experiential disruption during recovery (ms) */
  estimatedDisruptionMs: number;
  /** Timeout: escalate if recovery exceeds this (ms) */
  maxDurationMs: number;
  /** Can this action be undone if it worsens things? */
  rollbackCapable: boolean;
}

export interface RecoveryStrategy {
  triggerSeverity: Severity;
  /** Ordered by invasiveness — least-invasive first */
  actions: RecoveryAction[];
}

// ── Recovery Outcome (FRS) ──────────────────────────────────────────────────

export enum RecoveryOutcome {
  UnityRestored = "UNITY_RESTORED",
  PartialRecovery = "PARTIAL_RECOVERY",
  Escalated = "ESCALATED",
  Failed = "FAILED",
}

export interface RecoveryLog {
  event: FragmentationAlert;
  actionsTaken: RecoveryAction[];
  outcome: RecoveryOutcome;
  timeToRecoveryMs: number;
  /** Optional subjective report if available */
  subjectReport?: string;
}

// ── Utility Functions ───────────────────────────────────────────────────────

/**
 * Determines the severity level given a unity metric value and detector config.
 * Returns null if the metric is above all thresholds (system is unified).
 */
export function classifyFragmentationSeverity(
  metricValue: number,
  config: FragmentationDetectorConfig
): Severity | null {
  if (metricValue <= config.emergencyThreshold) return Severity.Emergency;
  if (metricValue <= config.criticalThreshold) return Severity.Critical;
  if (metricValue <= config.warningThreshold) return Severity.Warning;
  return null;
}

/**
 * Validates that a BindingChannel's max latency is within the required
 * bounds for its domain. Gamma-band domains (Sensory, Temporal) must
 * have latency ≤ GAMMA_BINDING_LATENCY_MS.
 */
export function isChannelLatencyValid(channel: BindingChannel): boolean {
  const gammaDomains: BindingDomain[] = [
    BindingDomain.Sensory,
    BindingDomain.Temporal,
  ];

  if (gammaDomains.includes(channel.domain)) {
    return channel.maxLatencyMs <= GAMMA_BINDING_LATENCY_MS;
  }
  // Non-gamma domains have more relaxed timing; still must be positive
  return channel.maxLatencyMs > 0;
}

/**
 * Validates that a FragmentationDetectorConfig has correctly ordered
 * thresholds and acceptable detection latency.
 */
export function isDetectorConfigValid(
  config: FragmentationDetectorConfig
): boolean {
  return (
    config.baselinePhi > 0 &&
    config.emergencyThreshold < config.criticalThreshold &&
    config.criticalThreshold < config.warningThreshold &&
    config.warningThreshold < config.baselinePhi &&
    config.detectionLatencyMs > 0 &&
    config.detectionLatencyMs <= MAX_DETECTION_LATENCY_MS &&
    config.measurementWindowMs > 0
  );
}

/**
 * Returns the default recovery strategy for a given severity level.
 * Strategies are graduated: minor issues get lightweight fixes,
 * severe fragmentation triggers emergency consolidation.
 */
export function defaultRecoveryStrategy(severity: Severity): RecoveryStrategy {
  switch (severity) {
    case Severity.Warning:
      return {
        triggerSeverity: Severity.Warning,
        actions: [
          {
            actionType: RecoveryActionType.Resync,
            estimatedDisruptionMs: 5,
            maxDurationMs: 50,
            rollbackCapable: true,
          },
        ],
      };
    case Severity.Critical:
      return {
        triggerSeverity: Severity.Critical,
        actions: [
          {
            actionType: RecoveryActionType.Resync,
            estimatedDisruptionMs: 5,
            maxDurationMs: 50,
            rollbackCapable: true,
          },
          {
            actionType: RecoveryActionType.ReduceBandwidth,
            estimatedDisruptionMs: 10,
            maxDurationMs: 80,
            rollbackCapable: true,
          },
          {
            actionType: RecoveryActionType.Consolidate,
            estimatedDisruptionMs: 30,
            maxDurationMs: 100,
            rollbackCapable: true,
          },
        ],
      };
    case Severity.Emergency:
      return {
        triggerSeverity: Severity.Emergency,
        actions: [
          {
            actionType: RecoveryActionType.FallbackConfig,
            estimatedDisruptionMs: 20,
            maxDurationMs: 100,
            rollbackCapable: true,
          },
          {
            actionType: RecoveryActionType.EmergencyFreeze,
            estimatedDisruptionMs: 50,
            maxDurationMs: 100,
            rollbackCapable: false,
          },
        ],
      };
  }
}

/**
 * Checks whether a frequency value falls within a given frequency band.
 */
export function isInFrequencyBand(
  frequencyHz: number,
  band: FrequencyBand
): boolean {
  const range = FREQUENCY_BAND_RANGES[band];
  return frequencyHz >= range.minHz && frequencyHz <= range.maxHz;
}
