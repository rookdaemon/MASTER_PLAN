/**
 * Sensorimotor-Consciousness Integration — Core Types
 *
 * All type definitions for the integration layer that bridges
 * the embodied robotic platform (0.3.1.2.1) and the conscious
 * AI architecture (0.3.1.1).
 *
 * @see docs/sensorimotor-consciousness-integration/ARCHITECTURE.md
 */

// =============================================================================
// Primitive Aliases
// =============================================================================

/** High-resolution monotonic clock timestamp in nanoseconds */
export type Timestamp = number;

/** Duration in nanoseconds */
export type Duration = number;

/** Confidence value: 0.0 - 1.0 */
export type Confidence = number;

/** Coherence score: 0.0 - 1.0 */
export type CoherenceScore = number;

/** Stability score: 0.0 - 1.0 */
export type StabilityScore = number;

/** Unique identifier for a sensory modality instance */
export type ModalityId = string;

/** Unique identifier for an intentional action */
export type ActionId = string;

/** Unique identifier for an action provenance record */
export type ProvenanceId = string;

// =============================================================================
// Duration Constants (nanoseconds)
// =============================================================================

export const NS_PER_MS = 1_000_000;
export const NS_PER_S = 1_000_000_000;

/** Latency budgets from architecture spec */
export const LATENCY_BUDGET = {
  REFLEXIVE_RESPONSE: 10 * NS_PER_MS,       // < 10ms
  SENSOR_READ_NORMALIZE: 5 * NS_PER_MS,     // < 5ms
  QUALIA_TRANSFORM: 20 * NS_PER_MS,         // < 20ms
  SENSORY_BINDING: 30 * NS_PER_MS,          // < 30ms
  CONSCIOUS_DELIBERATION: 200 * NS_PER_MS,  // < 200ms
  EXPERIENCE_LAG: 150 * NS_PER_MS,          // < 150ms threshold
  ADAPTIVE_REMAPPING: 2000 * NS_PER_MS,     // < 2000ms
} as const;

/** Default sensory buffer depth: 2 seconds (10x conscious processing budget) */
export const DEFAULT_BUFFER_DEPTH: Duration = 2 * NS_PER_S;

// =============================================================================
// Sensory Types
// =============================================================================

/** Supported sensor modality types */
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

/** Health status of a sensor */
export type SensorHealth = 'HEALTHY' | 'DEGRADED' | 'FAILING' | 'OFFLINE';

/** 3D spatial vector */
export interface SpatialVector {
  x: number;
  y: number;
  z: number;
}

/** Reference frame for spatial data */
export interface SpatialReference {
  frameId: string;
  origin: SpatialVector;
  orientation: SpatialVector; // Euler angles (roll, pitch, yaw)
}

/** A single frame of sensory data from one modality */
export interface SensoryFrame {
  modalityId: ModalityId;
  modalityType: ModalityType;
  timestamp: Timestamp;
  data: ArrayBuffer;
  confidence: Confidence;
  spatialRef: SpatialReference | null;
  metadata: Record<string, unknown>;
}

/** Qualia representation — consciousness-compatible encoding of sensory data */
export interface QualiaRepresentation {
  modalityId: ModalityId;
  timestamp: Timestamp;
  intensity: number;          // 0.0 - 1.0, normalized phenomenal intensity
  valence: number;            // -1.0 (aversive) to +1.0 (attractive)
  spatialLocation: SpatialVector | null;
  phenomenalContent: ArrayBuffer;  // consciousness-substrate-specific encoding
  salience: number;           // 0.0 - 1.0, attentional salience
}

/** Unified multi-modal qualia field — the integrated conscious experience */
export interface UnifiedQualiaField {
  timestamp: Timestamp;
  representations: QualiaRepresentation[];
  spatialCoherence: CoherenceScore;
  integrationInfo: number;    // phi-like measure of binding quality
  activeModalities: ModalityId[];
}

/** Map of modality IDs to attention weights */
export type AttentionWeightMap = Map<ModalityId, number>;

/** Salience map across modalities */
export type SalienceMap = Map<ModalityId, number>;

/** Cross-modal conflict detected during binding */
export interface CrossModalConflict {
  modalityA: ModalityId;
  modalityB: ModalityId;
  conflictType: 'SPATIAL' | 'TEMPORAL' | 'SEMANTIC';
  severity: number;   // 0.0 - 1.0
  description: string;
}

/** A predicted sensory frame with prediction metadata */
export interface PredictedFrame extends SensoryFrame {
  predictionConfidence: Confidence;
  predictionHorizon: Duration;
}

/** Temporal snapshot of all modalities at a given timestamp */
export interface SensorySnapshot {
  timestamp: Timestamp;
  frames: Map<ModalityId, SensoryFrame>;
}

/** Prediction error metrics for one modality */
export interface PredictionError {
  modalityId: ModalityId;
  meanError: number;
  maxError: number;
  sampleCount: number;
}

// =============================================================================
// Motor Types
// =============================================================================

/** Source of a motor command */
export type ActionSource = 'REFLEXIVE' | 'CONSCIOUS';

/** Priority level for intentional actions */
export type ActionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

/** Type of motor command */
export type CommandType = 'POSITION' | 'VELOCITY' | 'TORQUE' | 'STOP';

/** Conscious context that motivates an action */
export interface ConsciousContext {
  experientialState: string;       // description of the experiential state
  qualiaFieldSnapshot: UnifiedQualiaField | null;
  deliberationTrace: string[];     // chain of reasoning steps
}

/** A single motor command to one actuator */
export interface MotorCommand {
  actuatorId: string;
  commandType: CommandType;
  value: number[];
  timestamp: Timestamp;
}

/** A plan consisting of motor commands */
export interface MotorPlan {
  commands: MotorCommand[];
  duration: Duration;
  feedbackRequired: boolean;
}

/** An action originating from conscious deliberation */
export interface IntentionalAction {
  id: ActionId;
  description: string;
  motorPlan: MotorPlan;
  priority: ActionPriority;
  consciousContext: ConsciousContext;
}

/** Outcome of an executed action */
export interface ActionOutcome {
  actionId: ActionId;
  success: boolean;
  completionTime: Timestamp;
  feedbackSummary: string;
}

/** Result of executing an intentional action */
export interface ActionResult {
  actionId: ActionId;
  success: boolean;
  outcome: ActionOutcome | null;
  error: string | null;
}

/** Result of aborting an action */
export interface AbortResult {
  actionId: ActionId;
  aborted: boolean;
  reason: string;
}

/** Modification to an in-progress action */
export interface ActionModification {
  updatedPlan?: MotorPlan;
  updatedPriority?: ActionPriority;
  reason: string;
}

/** Result of modifying an action */
export interface ModifyResult {
  actionId: ActionId;
  modified: boolean;
  reason: string;
}

/** Feedback during action execution */
export interface ExecutionFeedback {
  actionId: ActionId;
  progress: number;        // 0.0 - 1.0
  currentForces: number[];
  currentPositions: number[];
  timestamp: Timestamp;
}

/** A conscious claim on a reflexive action */
export interface ConsciousClaim {
  claimType: 'ENDORSED' | 'DISOWNED' | 'NEUTRAL';
  reason: string;
  claimTimestamp: Timestamp;
}

/** Full provenance record for an action */
export interface ActionProvenance {
  id: ProvenanceId;
  source: ActionSource;
  stimulus: SensoryFrame | null;
  timestamp: Timestamp;
  command: MotorCommand;
  outcome: ActionOutcome | null;
  consciousClaim: ConsciousClaim | null;
}

/** Filter for querying provenance records */
export interface ProvenanceFilter {
  source?: ActionSource;
  startTime?: Timestamp;
  endTime?: Timestamp;
  actuatorId?: string;
  limit?: number;
}

// =============================================================================
// Reflexive Safety Types
// =============================================================================

/** Trigger condition for a safety reflex */
export interface SafetyTrigger {
  triggerType: 'FREEFALL' | 'TIPPING' | 'PROXIMITY_BREACH' | 'FORCE_LIMIT' | 'EMERGENCY_STOP' | 'THERMAL_OVERTEMP';
  sensorModalityType: ModalityType;
  threshold: number;
  description: string;
}

/** Pre-defined response to a safety trigger */
export interface ReflexResponse {
  responseType: 'BRACE' | 'HALT' | 'RELAX' | 'SAFE_STATE' | 'SHUTDOWN_ACTUATOR';
  actuatorTargets: string[];  // actuator IDs to command
  commands: MotorCommand[];
}

/** A registered safety reflex (trigger + response pair) */
export interface SafetyReflex {
  trigger: SafetyTrigger;
  response: ReflexResponse;
  enabled: boolean;
}

/** Event record when a reflex fires */
export interface ReflexEvent {
  reflex: SafetyReflex;
  triggerTimestamp: Timestamp;
  responseTimestamp: Timestamp;
  stimulus: SensoryFrame;
  latency: Duration;
}

// =============================================================================
// Calibration Types
// =============================================================================

/** Configuration for a modality adapter */
export interface ModalityConfig {
  modalityType: ModalityType;
  sampleRate: number;        // Hz
  resolution: number[];      // modality-specific resolution parameters
  calibrationParams: CalibrationParams;
  metadata: Record<string, unknown>;
}

/** Parameters for sensor calibration */
export interface CalibrationParams {
  offsetCorrection: number[];
  gainCorrection: number[];
  referenceValues: Record<string, number>;
}

/** Current calibration state */
export interface CalibrationState {
  isCalibrated: boolean;
  lastCalibrationTime: Timestamp;
  calibrationParams: CalibrationParams;
  quality: Confidence;
}

/** Result of a calibration procedure */
export interface CalibrationResult {
  success: boolean;
  newState: CalibrationState;
  error: string | null;
}

/** Descriptor for a registered modality */
export interface ModalityDescriptor {
  id: ModalityId;
  type: ModalityType;
  status: 'ACTIVE' | 'DEGRADED' | 'OFFLINE' | 'CALIBRATING';
  health: SensorHealth;
  lastUpdate: Timestamp;
}

/** Degradation information for a modality */
export interface DegradationInfo {
  modalityId: ModalityId;
  degradationType: 'SIGNAL_LOSS' | 'NOISE_INCREASE' | 'LATENCY_INCREASE' | 'PARTIAL_FAILURE';
  severity: number;   // 0.0 (minor) - 1.0 (critical)
  affectedCapabilities: string[];
}

/** Result of a remapping operation */
export interface RemapResult {
  success: boolean;
  affectedModalities: ModalityId[];
  experienceContinuityMaintained: boolean;
  transitionDuration: Duration;
}

/** Status of an ongoing remap */
export interface RemapStatus {
  isRemapping: boolean;
  startTime: Timestamp | null;
  affectedModalities: ModalityId[];
  progress: number;   // 0.0 - 1.0
}

/** Handle for monitoring a remapping transition */
export interface RemapTransition {
  id: string;
  type: 'MODALITY_LOST' | 'MODALITY_ADDED' | 'MODALITY_DEGRADED';
  modalityId: ModalityId;
  startTime: Timestamp;
}

/** Handle returned by transition monitoring */
export interface TransitionMonitorHandle {
  transitionId: string;
  cancel: () => void;
}

/** Result of rolling back a remap */
export interface RollbackResult {
  success: boolean;
  restoredState: boolean;
  reason: string;
}

// =============================================================================
// Clock Synchronization Types
// =============================================================================

/** Result of a clock synchronization operation */
export interface SyncResult {
  physicalTime: Timestamp;
  experienceTime: Timestamp;
  lag: Duration;
  compensationApplied: boolean;
}

/** Handler called when experience lag exceeds threshold */
export type LagExceededHandler = (lag: Duration, threshold: Duration) => void;

/** Result of unregistering a modality */
export interface UnregisterResult {
  success: boolean;
  modalityId: ModalityId;
  reason: string;
}

/** Callback for modality configuration changes */
export type ModalityChangeHandler = (
  change: ModalityChangeEvent
) => void;

/** Event describing a modality configuration change */
export interface ModalityChangeEvent {
  type: 'ADDED' | 'REMOVED' | 'DEGRADED' | 'RESTORED';
  modalityId: ModalityId;
  descriptor: ModalityDescriptor | null;
  timestamp: Timestamp;
}
