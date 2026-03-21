/**
 * Sensorimotor-Consciousness Integration — Core Types
 *
 * Type definitions for all four subsystems:
 * - Sensory Phenomenal Binding
 * - Motor Intentionality Pathway
 * - Temporal Coherence Engine
 * - Adaptive Calibration System
 *
 * Reference: docs/sensorimotor-consciousness-integration/ARCHITECTURE.md
 */

// =============================================================================
// Primitive Types
// =============================================================================

/** High-resolution monotonic clock, nanoseconds */
export type Timestamp = number;

/** Duration in nanoseconds */
export type Duration = number;

/** Confidence value: 0.0 - 1.0 */
export type Confidence = number;

/** Coherence score: 0.0 - 1.0 */
export type CoherenceScore = number;

/** Stability score: 0.0 - 1.0 */
export type StabilityScore = number;

/** Unique identifier for a sensor modality */
export type ModalityId = string;

/** Unique identifier for an action */
export type ActionId = string;

/** Unique identifier for a provenance record */
export type ProvenanceId = string;

// =============================================================================
// Sensory Types
// =============================================================================

export type ModalityType =
  | 'VISION'
  | 'AUDITORY'
  | 'TACTILE'
  | 'PROPRIOCEPTIVE'
  | 'FORCE_TORQUE'
  | 'THERMAL'
  | 'PROXIMITY'
  | 'IMU'
  | 'CUSTOM';

export interface SpatialReference {
  /** Reference frame identifier (e.g., 'body', 'world', 'sensor-local') */
  frameId: string;
  /** Origin point in reference frame */
  origin: SpatialVector;
  /** Orientation in reference frame */
  orientation: SpatialVector;
}

export interface SpatialVector {
  x: number;
  y: number;
  z: number;
}

export interface SensoryFrame {
  modalityId: ModalityId;
  modalityType: ModalityType;
  timestamp: Timestamp;
  data: ArrayBuffer;
  confidence: Confidence;
  spatialRef: SpatialReference | null;
  metadata: Record<string, unknown>;
}

export interface QualiaRepresentation {
  modalityId: ModalityId;
  timestamp: Timestamp;
  /** Normalized phenomenal intensity: 0.0 - 1.0 */
  intensity: number;
  /** -1.0 (aversive) to +1.0 (attractive) */
  valence: number;
  spatialLocation: SpatialVector | null;
  /** Consciousness-substrate-specific encoding */
  phenomenalContent: ArrayBuffer;
  /** Attentional salience: 0.0 - 1.0 */
  salience: number;
}

export interface UnifiedQualiaField {
  timestamp: Timestamp;
  representations: QualiaRepresentation[];
  spatialCoherence: CoherenceScore;
  /** Phi-like measure of binding quality */
  integrationInfo: number;
  activeModalities: ModalityId[];
}

export interface SensorySnapshot {
  timestamp: Timestamp;
  frames: Map<ModalityId, SensoryFrame>;
}

export interface PredictedFrame extends SensoryFrame {
  predictionConfidence: Confidence;
  predictionHorizon: Duration;
}

export interface CrossModalConflict {
  modalityA: ModalityId;
  modalityB: ModalityId;
  conflictType: 'SPATIAL' | 'TEMPORAL' | 'SEMANTIC';
  severity: number;
  description: string;
  timestamp?: Timestamp;
}

export type SalienceMap = Map<ModalityId, number>;
export type AttentionWeightMap = Map<ModalityId, number>;

// =============================================================================
// Motor Types
// =============================================================================

export interface MotorCommand {
  actuatorId: string;
  commandType: 'POSITION' | 'VELOCITY' | 'TORQUE' | 'STOP';
  value: number[];
  timestamp: Timestamp;
}

export interface MotorPlan {
  commands: MotorCommand[];
  duration: Duration;
  feedbackRequired: boolean;
}

export type ActionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface ConsciousContext {
  /** The experiential state motivating this action */
  qualiaSnapshot: UnifiedQualiaField | null;
  /** Free-form description of the conscious motivation */
  motivation: string;
  /** Attention level dedicated to this action: 0.0 - 1.0 */
  attentionLevel: number;
}

export interface IntentionalAction {
  id: ActionId;
  /** Human-readable intent description */
  description: string;
  motorPlan: MotorPlan;
  priority: ActionPriority;
  consciousContext: ConsciousContext;
}

export type ActionSource = 'REFLEXIVE' | 'CONSCIOUS';

export interface ConsciousClaim {
  /** Whether the consciousness substrate retroactively claims/disowns this action */
  claimed: boolean;
  reason: string;
  timestamp: Timestamp;
}

export type ActionOutcome = 'COMPLETED' | 'ABORTED' | 'FAILED' | 'OVERRIDDEN';

export interface ActionProvenance {
  id: ProvenanceId;
  source: ActionSource;
  stimulus: SensoryFrame | null;
  timestamp: Timestamp;
  command: MotorCommand;
  outcome: ActionOutcome | null;
  consciousClaim: ConsciousClaim | null;
}

export interface ActionResult {
  actionId: ActionId;
  success: boolean;
  outcome: ActionOutcome;
  duration: Duration;
  feedback: ExecutionFeedback;
}

export interface AbortResult {
  actionId: ActionId;
  aborted: boolean;
  reason: string;
}

export interface ModifyResult {
  actionId: ActionId;
  modified: boolean;
  reason: string;
}

export interface ActionModification {
  description: string;
  updatedPlan?: MotorPlan;
  updatedPriority?: ActionPriority;
}

export interface ExecutionFeedback {
  actionId: ActionId;
  progress: number; // 0.0 - 1.0
  forces: number[];
  proprioceptiveState: SensoryFrame | null;
}

export interface ProvenanceFilter {
  source?: ActionSource;
  startTime?: Timestamp;
  endTime?: Timestamp;
  actuatorId?: string;
  limit?: number;
}

// =============================================================================
// Safety / Reflex Types
// =============================================================================

export type SafetyTriggerType =
  | 'FREEFALL'
  | 'TIPPING'
  | 'COLLISION'
  | 'FORCE_LIMIT'
  | 'EMERGENCY_STOP'
  | 'THERMAL_OVERLOAD';

export interface SafetyTrigger {
  type: SafetyTriggerType;
  modalityId: ModalityId;
  /** Threshold value that triggers the reflex */
  threshold: number;
  /** Comparison operator */
  comparison: 'GT' | 'LT' | 'ABS_GT';
}

export interface ReflexResponse {
  name: string;
  commands: MotorCommand[];
  maxLatencyMs: number;
}

export interface SafetyReflex {
  trigger: SafetyTrigger;
  response: ReflexResponse;
  enabled: boolean;
}

export interface ReflexEvent {
  reflex: SafetyReflex;
  triggerTimestamp: Timestamp;
  responseTimestamp: Timestamp;
  stimulus: SensoryFrame;
}

// =============================================================================
// Calibration Types
// =============================================================================

export type ModalityStatus = 'ACTIVE' | 'DEGRADED' | 'OFFLINE' | 'CALIBRATING';
export type SensorHealth = 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'OFFLINE';

export interface ModalityDescriptor {
  id: ModalityId;
  type: ModalityType;
  status: ModalityStatus;
  health: SensorHealth;
  lastUpdate: Timestamp;
}

export interface ModalityConfig {
  type: ModalityType;
  sampleRateHz: number;
  resolution: number[];
  calibrationParams?: CalibrationParams;
}

export interface CalibrationParams {
  offset: number[];
  gain: number[];
  transform?: number[][];
}

export interface CalibrationState {
  calibrated: boolean;
  lastCalibration: Timestamp;
  quality: Confidence;
  params: CalibrationParams;
}

export interface CalibrationResult {
  success: boolean;
  newState: CalibrationState;
  duration: Duration;
}

export interface DegradationInfo {
  modalityId: ModalityId;
  previousHealth: SensorHealth;
  currentHealth: SensorHealth;
  reason: string;
  timestamp: Timestamp;
}

export interface RemapResult {
  success: boolean;
  affectedModalities: ModalityId[];
  experienceContinuityMaintained: boolean;
  transitionDuration: Duration;
}

export interface RemapStatus {
  inProgress: boolean;
  affectedModalities: ModalityId[];
  progress: number; // 0.0 - 1.0
}

export interface RemapTransition {
  type: 'MODALITY_LOST' | 'MODALITY_ADDED' | 'MODALITY_DEGRADED';
  modalityId: ModalityId;
  startTimestamp: Timestamp;
}

export interface TransitionMonitorHandle {
  transitionId: string;
  transition: RemapTransition;
}

export interface RollbackResult {
  success: boolean;
  reason: string;
}

export interface UnregisterResult {
  success: boolean;
  modalityId: ModalityId;
}

// =============================================================================
// Temporal / Clock Types
// =============================================================================

export interface PredictionError {
  modalityId: ModalityId;
  meanAbsoluteError: number;
  maxError: number;
  sampleCount: number;
}

export interface SyncResult {
  lag: Duration;
  adjusted: boolean;
  compensationApplied: string | null;
}

// =============================================================================
// Callback / Handler Types
// =============================================================================

export type LagExceededHandler = (lag: Duration, threshold: Duration) => void;

export type ModalityChangeEvent = {
  type: 'ADDED' | 'REMOVED' | 'DEGRADED' | 'RECOVERED';
  modalityId: ModalityId;
  descriptor: ModalityDescriptor;
  timestamp: Timestamp;
};

export type ModalityChangeHandler = (event: ModalityChangeEvent) => void;

// =============================================================================
// Constants
// =============================================================================

/** Nanoseconds per millisecond */
export const NS_PER_MS = 1_000_000;

/**
 * Latency budgets in nanoseconds, as defined in ARCHITECTURE.md.
 */
export const LATENCY_BUDGET = {
  /** Reflexive motor response: stimulus to actuator < 10ms */
  REFLEXIVE_RESPONSE: 10 * NS_PER_MS,
  /** Sensor read + normalize per frame < 5ms */
  SENSOR_READ: 5 * NS_PER_MS,
  /** Qualia transformation per frame < 20ms */
  QUALIA_TRANSFORM: 20 * NS_PER_MS,
  /** Sensory binding all modalities < 30ms */
  SENSORY_BINDING: 30 * NS_PER_MS,
  /** Conscious deliberation: intention to motor plan < 200ms */
  CONSCIOUS_DELIBERATION: 200 * NS_PER_MS,
  /** Experience lag: physical event to conscious awareness < 150ms */
  EXPERIENCE_LAG: 150 * NS_PER_MS,
  /** Adaptive remapping: modality change to stable experience < 2000ms */
  ADAPTIVE_REMAPPING: 2000 * NS_PER_MS,
} as const;

/**
 * Minimum consciousness stability score for remapping to proceed.
 * Below this, Experience Continuity Guard blocks transitions.
 */
export const MIN_STABILITY_THRESHOLD: StabilityScore = 0.7;

/**
 * Below this confidence, predictions are considered unreliable.
 * Defines the maximum reliable prediction horizon boundary.
 */
export const PREDICTION_RELIABLE_CONFIDENCE: Confidence = 0.5;
