/**
 * Unified Consciousness Across Mixed Substrates
 *
 * Public API for cross-substrate consciousness integration, temporal
 * synchronization, fragmentation detection, and recovery.
 */

// Core types, enums, interfaces, constants, utility functions
export {
  // Constants
  GAMMA_BINDING_LATENCY_MS,
  GAMMA_CYCLE_MIN_MS,
  GAMMA_CYCLE_MAX_MS,
  MAX_DETECTION_LATENCY_MS,
  TOTAL_RECOVERY_BUDGET_MS,
  MIN_AGREEING_METRICS,
  FREQUENCY_BAND_RANGES,

  // Enums
  BindingDomain,
  CoherenceMode,
  FrequencyBand,
  SyncMode,
  CorrectionMode,
  InterpolationMode,
  OverflowPolicy,
  MetricType,
  Severity,
  RecoveryActionType,
  RecoveryOutcome,

  // Types
  type ChannelId,

  // Interfaces
  type NeuralPopulation,
  type ComputeNodeSet,
  type BindingChannel,
  type SyncPulse,
  type IntegrationFrame,
  type BindingVerification,
  type OscillationTracker,
  type SyncController,
  type AdaptiveBuffer,
  type SubstrateCoverage,
  type UnityMetric,
  type FragmentationDetectorConfig,
  type FragmentationAlert,
  type CognitiveTask,
  type CalibrationProtocol,
  type RecoveryAction,
  type RecoveryStrategy,
  type RecoveryLog,

  // Utility functions
  classifyFragmentationSeverity,
  isChannelLatencyValid,
  isDetectorConfigValid,
  defaultRecoveryStrategy,
  isInFrequencyBand,
} from './types.js';

// Fragmentation detection (UMI)
export {
  type FragmentationDetectorState,
  FragmentationDetector,
} from './fragmentation-detector.js';

// Recovery execution (FRS)
export { RecoveryExecutor } from './recovery-executor.js';

// Cross-Substrate Integration Protocol (CSIP)
export { CrossSubstrateIntegrationProtocol } from './csip.js';

// Temporal Synchronization Engine (TSE)
export {
  type TSEConfig,
  TemporalSynchronizationEngine,
} from './tse.js';
