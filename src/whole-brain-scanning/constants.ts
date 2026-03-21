/**
 * Whole-Brain Scanning — Threshold Constants
 *
 * All constants from the Threshold Registry in card 0.2.2.1.2.
 * Values are injectable/configurable per CLAUDE.md requirements.
 *
 * Each constant includes its unit, valid range, and rationale as JSDoc.
 */

// ── Scanning Resolution ────────────────────────────────────────────────────

/**
 * Maximum scan resolution required by upstream fidelity spec (0.2.2.1.1).
 * Unit: nm. Valid range: 500–2000.
 * Rationale: ≤1 μm per upstream spec; must resolve individual synapses and dendritic spines.
 * Sensitivity: High — determines modality choice.
 */
export const SCAN_RESOLUTION_NM = 1000;

/**
 * Actual SBF-SEM operational resolution.
 * Unit: nm. Valid range: 10–100.
 * Rationale: SBF-SEM operational resolution; 33× margin over requirement.
 * Sensitivity: Low — well within budget.
 */
export const ACTUAL_RESOLUTION_NM = 30;

// ── Timing ─────────────────────────────────────────────────────────────────

/**
 * Maximum tolerable state drift during fixation.
 * Unit: ms. Valid range: 50–500.
 * Rationale: Cryo-vitrification achieves <100 ms for small brains;
 * larger brains require perfusion-assisted vitrification.
 * Sensitivity: High — constrains fixation protocol.
 */
export const EPSILON_DRIFT_MS = 100;

/**
 * Duration of electrophysiology recording before fixation.
 * Unit: s. Valid range: 10–300.
 * Rationale: Must capture enough activity for simulation initialization.
 * Sensitivity: Medium — longer = better init but more data.
 */
export const PRE_FIXATION_RECORDING_S = 30;

// ── Detection Metrics ──────────────────────────────────────────────────────

/**
 * Minimum fraction of true neurons detected by segmentation pipeline.
 * Unit: ratio. Valid range: 0.90–0.99.
 * Rationale: Missed neurons corrupt connectivity graph.
 * Sensitivity: High.
 */
export const NEURON_DETECTION_SENSITIVITY_MIN = 0.95;

/**
 * Minimum fraction of detected objects that are true neurons.
 * Unit: ratio. Valid range: 0.90–0.99.
 * Rationale: False positives filterable downstream.
 * Sensitivity: Medium.
 */
export const NEURON_DETECTION_SPECIFICITY_MIN = 0.95;

/**
 * Minimum fraction of true synapses detected.
 * Unit: ratio. Valid range: 0.85–0.95.
 * Rationale: Missed synapses degrade connectivity.
 * Sensitivity: High.
 */
export const SYNAPSE_DETECTION_SENSITIVITY_MIN = 0.90;

/**
 * Minimum fraction of detected synapses that are true synapses.
 * Unit: ratio. Valid range: 0.85–0.95.
 * Rationale: False positive synapses add noise.
 * Sensitivity: Medium.
 */
export const SYNAPSE_DETECTION_SPECIFICITY_MIN = 0.90;

// ── Weight & Registration ──────────────────────────────────────────────────

/**
 * Maximum RMSE of estimated synaptic weights vs electrophysiology ground truth.
 * Unit: normalized (0–1). Valid range: 0.05–0.25.
 * Rationale: Weight accuracy directly affects simulation fidelity.
 * Sensitivity: High.
 */
export const WEIGHT_ESTIMATION_RMSE_MAX = 0.15;

/**
 * Maximum mean spatial registration error between adjacent sections.
 * Unit: nm. Valid range: 100–1000.
 * Rationale: Misregistration severs traced neurites.
 * Sensitivity: High.
 */
export const REGISTRATION_ERROR_MAX_NM = 500;

// ── Cross-Modality ─────────────────────────────────────────────────────────

/**
 * Minimum agreement between SBF-SEM and ExM-IF on shared tissue regions.
 * Unit: ratio. Valid range: 0.80–0.95.
 * Rationale: Validates complementary modalities.
 * Sensitivity: Medium.
 */
export const CROSS_MODALITY_AGREEMENT_MIN = 0.85;

// ── Infrastructure Scale ───────────────────────────────────────────────────

/**
 * Estimated raw SBF-SEM data at 30 nm for human brain (1400 cm³).
 * Unit: bytes. Valid range: 1e18–2e18.
 * Rationale: Engineering constraint, not scientific.
 * Sensitivity: Low.
 */
export const RAW_DATA_SIZE_HUMAN_BRAIN = 1.5e18;

/**
 * Minimum concurrent SBF-SEM instruments for human-brain-scale throughput.
 * Unit: count. Valid range: 500–5000.
 * Rationale: Determines infrastructure scale.
 * Sensitivity: Medium.
 */
export const PARALLEL_INSTRUMENTS_MIN = 1000;

// ── Configurable Thresholds Interface ──────────────────────────────────────

/**
 * All threshold values collected into an injectable configuration object.
 * Enables dependency injection and test-time override per CLAUDE.md.
 */
export interface ScanningThresholds {
  readonly scanResolutionNm: number;
  readonly actualResolutionNm: number;
  readonly epsilonDriftMs: number;
  readonly preFixationRecordingS: number;
  readonly neuronDetectionSensitivityMin: number;
  readonly neuronDetectionSpecificityMin: number;
  readonly synapseDetectionSensitivityMin: number;
  readonly synapseDetectionSpecificityMin: number;
  readonly weightEstimationRmseMax: number;
  readonly registrationErrorMaxNm: number;
  readonly crossModalityAgreementMin: number;
  readonly rawDataSizeHumanBrain: number;
  readonly parallelInstrumentsMin: number;
}

/**
 * Default threshold configuration using all registry values.
 */
export const DEFAULT_SCANNING_THRESHOLDS: ScanningThresholds = {
  scanResolutionNm: SCAN_RESOLUTION_NM,
  actualResolutionNm: ACTUAL_RESOLUTION_NM,
  epsilonDriftMs: EPSILON_DRIFT_MS,
  preFixationRecordingS: PRE_FIXATION_RECORDING_S,
  neuronDetectionSensitivityMin: NEURON_DETECTION_SENSITIVITY_MIN,
  neuronDetectionSpecificityMin: NEURON_DETECTION_SPECIFICITY_MIN,
  synapseDetectionSensitivityMin: SYNAPSE_DETECTION_SENSITIVITY_MIN,
  synapseDetectionSpecificityMin: SYNAPSE_DETECTION_SPECIFICITY_MIN,
  weightEstimationRmseMax: WEIGHT_ESTIMATION_RMSE_MAX,
  registrationErrorMaxNm: REGISTRATION_ERROR_MAX_NM,
  crossModalityAgreementMin: CROSS_MODALITY_AGREEMENT_MIN,
  rawDataSizeHumanBrain: RAW_DATA_SIZE_HUMAN_BRAIN,
  parallelInstrumentsMin: PARALLEL_INSTRUMENTS_MIN,
};
