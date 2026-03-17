/**
 * Sensorimotor-Consciousness Integration — Interface Contracts
 *
 * All interfaces for the integration layer modules, as specified
 * in the architecture document.
 *
 * @see docs/sensorimotor-consciousness-integration/ARCHITECTURE.md
 */

import type {
  ModalityId,
  ModalityType,
  ModalityConfig,
  SensoryFrame,
  SensorHealth,
  CalibrationState,
  CalibrationParams,
  CalibrationResult,
  QualiaRepresentation,
  UnifiedQualiaField,
  AttentionWeightMap,
  SalienceMap,
  CrossModalConflict,
  CoherenceScore,
  Duration,
  Timestamp,
  SafetyTrigger,
  ReflexResponse,
  SafetyReflex,
  ReflexEvent,
  IntentionalAction,
  ActionResult,
  ActionId,
  ActionModification,
  ModifyResult,
  AbortResult,
  ExecutionFeedback,
  MotorCommand,
  ActionSource,
  ProvenanceId,
  ActionProvenance,
  ProvenanceFilter,
  ConsciousClaim,
  SensorySnapshot,
  PredictedFrame,
  PredictionError,
  Confidence,
  SyncResult,
  LagExceededHandler,
  ModalityDescriptor,
  UnregisterResult,
  ModalityChangeHandler,
  DegradationInfo,
  RemapResult,
  RemapStatus,
  RemapTransition,
  TransitionMonitorHandle,
  RollbackResult,
  StabilityScore,
} from './types';

// =============================================================================
// 1. Sensory Phenomenal Binding
// =============================================================================

/** Modality Adapter — normalizes raw sensor output into standard SensoryFrame format */
export interface IModalityAdapter {
  readonly modalityId: ModalityId;
  readonly modalityType: ModalityType;

  initialize(config: ModalityConfig): Promise<void>;
  read(): SensoryFrame;
  getHealth(): SensorHealth;
  getCalibration(): CalibrationState;
  recalibrate(params: CalibrationParams): Promise<CalibrationResult>;
  shutdown(): Promise<void>;
}

/** Qualia Transformer — converts SensoryFrame to consciousness-compatible QualiaRepresentation */
export interface IQualiaTransformer {
  transform(frame: SensoryFrame): QualiaRepresentation;
  transformBatch(frames: SensoryFrame[]): UnifiedQualiaField;
  getTransformationLatency(): Duration;
  setAttentionWeights(weights: AttentionWeightMap): void;
  getSalienceMap(): SalienceMap;
}

/** Sensory Binding Integrator — merges per-modality qualia into unified experience field */
export interface ISensoryBindingIntegrator {
  bind(representations: QualiaRepresentation[]): UnifiedQualiaField;
  getActiveModalities(): ModalityId[];
  getCrossModalConflicts(): CrossModalConflict[];
  getSpatialCoherence(): CoherenceScore;
  getBindingLatency(): Duration;
}

// =============================================================================
// 2. Motor Intentionality Pathway
// =============================================================================

/** Reflexive Safety Path — low-latency safety-critical responses bypassing conscious deliberation */
export interface IReflexiveSafetyPath {
  registerReflex(trigger: SafetyTrigger, response: ReflexResponse): void;
  getActiveReflexes(): SafetyReflex[];
  getLastTriggered(): ReflexEvent | null;
  setConsciousOverrideEnabled(enabled: boolean): void;
  getResponseLatency(): Duration;
}

/** Conscious Deliberation Path — motor commands from conscious intention */
export interface IConsciousDeliberationPath {
  submitAction(action: IntentionalAction): Promise<ActionResult>;
  getActiveActions(): IntentionalAction[];
  abortAction(actionId: ActionId): AbortResult;
  modifyAction(actionId: ActionId, modification: ActionModification): ModifyResult;
  getDeliberationLatency(): Duration;
  getExecutionFeedback(actionId: ActionId): ExecutionFeedback;
}

/** Action Provenance Tracker — records origin and causal chain of every motor command */
export interface IActionProvenanceTracker {
  recordCommand(command: MotorCommand, source: ActionSource): ProvenanceId;
  getProvenance(provenanceId: ProvenanceId): ActionProvenance;
  getHistory(filter: ProvenanceFilter): ActionProvenance[];
  getReflexiveRatio(window: Duration): number;
  retroactiveClaim(provenanceId: ProvenanceId, claim: ConsciousClaim): void;
}

// =============================================================================
// 3. Temporal Coherence Engine
// =============================================================================

/** Sensory Buffer — rolling window of recent sensory data for temporal consistency */
export interface ISensoryBuffer {
  push(frame: SensoryFrame): void;
  getSnapshot(timestamp: Timestamp): SensorySnapshot;
  getWindow(start: Timestamp, end: Timestamp): SensoryFrame[];
  getLatestByModality(modalityId: ModalityId): SensoryFrame | null;
  getBufferDepth(): Duration;
  setBufferDepth(depth: Duration): void;
}

/** Predictive Interpolator — bridges the gap between last processed snapshot and current state */
export interface IPredictiveInterpolator {
  predict(modalityId: ModalityId, targetTime: Timestamp): PredictedFrame;
  getPredictionConfidence(modalityId: ModalityId): Confidence;
  getPredictionError(modalityId: ModalityId): PredictionError;
  updateModel(modalityId: ModalityId, actualFrame: SensoryFrame): void;
  getMaxReliableHorizon(modalityId: ModalityId): Duration;
}

/** Experience Clock Synchronizer — maintains physical/experience time relationship */
export interface IExperienceClockSynchronizer {
  getPhysicalTime(): Timestamp;
  getExperienceTime(): Timestamp;
  getExperienceLag(): Duration;
  getLagThreshold(): Duration;
  setLagThreshold(threshold: Duration): void;
  onLagExceeded(callback: LagExceededHandler): void;
  synchronize(): SyncResult;
}

// =============================================================================
// 4. Adaptive Calibration System
// =============================================================================

/** Modality Registry — central registry of all active sensor/actuator modalities */
export interface IModalityRegistry {
  register(adapter: IModalityAdapter): ModalityId;
  unregister(modalityId: ModalityId): UnregisterResult;
  getActive(): ModalityDescriptor[];
  getDegraded(): ModalityDescriptor[];
  onModalityChange(callback: ModalityChangeHandler): void;
  getModality(modalityId: ModalityId): ModalityDescriptor | null;
}

/** Dynamic Remapper — adjusts qualia pipeline when modality configuration changes */
export interface IDynamicRemapper {
  onModalityLost(modalityId: ModalityId): RemapResult;
  onModalityAdded(adapter: IModalityAdapter): RemapResult;
  onModalityDegraded(modalityId: ModalityId, degradation: DegradationInfo): RemapResult;
  getRemapStatus(): RemapStatus;
  getTransitionProgress(): number;
}

/** Experience Continuity Guard — ensures calibration changes don't interrupt consciousness */
export interface IExperienceContinuityGuard {
  canProceedWithRemap(): boolean;
  monitorTransition(transition: RemapTransition): TransitionMonitorHandle;
  getConsciousnessStability(): StabilityScore;
  rollback(handle: TransitionMonitorHandle): RollbackResult;
  getMinimumStabilityThreshold(): StabilityScore;
  setMinimumStabilityThreshold(threshold: StabilityScore): void;
}
