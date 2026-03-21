/**
 * Bio-Synthetic Interface Design — Public API
 *
 * Barrel export for the bio-synthetic interface module.
 * Layers 1-4 of the neural interface stack.
 */

// Layer 1/2 types and threshold constants
export {
  // Threshold constants
  ELECTRODE_DENSITY,
  AMPLIFIER_INPUT_NOISE,
  ADC_SAMPLING_RATE,
  ADC_RESOLUTION,
  READ_PATHWAY_LATENCY,
  WRITE_PATHWAY_LATENCY,
  ROUND_TRIP_LATENCY,
  CHARGE_DENSITY_LIMIT,
  SPIKE_DETECTION_TPR,
  SPIKE_DETECTION_FPR,
  SPIKE_SORTING_ACCURACY,
  STIMULATION_SPATIAL_PRECISION,
  BIOCOMPATIBILITY_DURATION,
  SIGNAL_DEGRADATION_THRESHOLD,
  CORTICAL_COLUMN_BANDWIDTH,
  MIN_ADC_SAMPLING_RATE,
  // Domain types
  type BrainAtlasCoordinate,
  type ElectrodeChannel,
  type RawNeuralSignal,
  type SpikeTrainEvent,
  type StimulationCommand,
  type NeuralStateSnapshot,
  type SyntheticActivationRequest,
  type ArrayHealthStatus,
  type InterfaceHealthReport,
  type CalibrationFeedback,
  type BandwidthAllocation,
  // Guard/validation functions
  validateRawNeuralSignal,
  validateSpikeTrainEvent,
  validateStimulationCommand,
  validateNeuralStateSnapshot,
  validateSyntheticActivationRequest,
  validateInterfaceHealthReport,
  validateCalibrationFeedback,
  validateBandwidthAllocation,
} from "./types.js";

// Layer 2: Signal conditioning (read + write pathways)
export {
  type Clock,
  type SafetyValidator,
  type SignalConditioningConfig,
  type StimulationResult,
  DEFAULT_SIGNAL_CONDITIONING_CONFIG,
  SignalConditioner,
} from "./signal-conditioning.js";

// Layer 3: Neural protocol adapter (coordinate mapping, calibration, safety envelope)
export {
  type CoordinateMap,
  type ElectrodeMapping,
  type CalibrationEngine,
  type SafetyEnvelope,
  type NeuralProtocolAdapterConfig,
  DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG,
  NeuralProtocolAdapter,
} from "./neural-protocol-adapter.js";

// Layer 4: Integration gateway (multi-array multiplexing, HybridCognitionBus)
export {
  type ArrayAdapter,
  type DegradationNotifier,
  type IntegrationGatewayConfig,
  DEFAULT_INTEGRATION_GATEWAY_CONFIG,
  IntegrationGateway,
} from "./integration-gateway.js";

// Safety interlock (hardware-enforced safety)
export {
  SEIZURE_DETECTION_SIGMA_THRESHOLD,
  SEIZURE_CHANNEL_PERCENTAGE_THRESHOLD,
  SEIZURE_SUBSIDENCE_DURATION_US,
  type SeizureEvent,
  type SafetyEventLogger,
  type SafetyInterlockConfig,
  DEFAULT_SAFETY_INTERLOCK_CONFIG,
  SafetyInterlock,
} from "./safety-interlock.js";
