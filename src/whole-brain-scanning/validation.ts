/**
 * Whole-Brain Scanning — Validation Functions
 *
 * Pure validation logic for scan parameters, timing constraints,
 * resolution requirements, and dataset integrity.
 *
 * Implements the constraint checks defined in:
 *   docs/whole-brain-scanning/ARCHITECTURE.md
 */

import type {
  ScanTimingProtocol,
  BrainScanDataset,
  FidelityLevel,
  ValidationReport,
} from "./types.js";
import { FIDELITY_RESOLUTION_NM } from "./types.js";
import type { ScanningThresholds } from "./constants.js";
import { DEFAULT_SCANNING_THRESHOLDS } from "./constants.js";

// ── Validation Result ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors };
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  return { valid: errors.length === 0, errors };
}

// ── Scan Timing Validation ──────────────────────────────────────────────────

/**
 * Validates that a scan timing protocol satisfies the drift-budget constraint:
 *   fixation_completion_time_ms < epsilon_drift_ms
 *
 * Also validates that all timing parameters are physically meaningful.
 */
export function validateScanTiming(timing: ScanTimingProtocol): ValidationResult {
  const errors: string[] = [];

  if (timing.epsilon_drift_ms <= 0) {
    errors.push("epsilon_drift_ms must be positive");
  }

  if (timing.fixation_completion_time_ms < 0) {
    errors.push("fixation_completion_time_ms must be non-negative");
  }

  if (timing.pre_fixation_recording_duration_s < 0) {
    errors.push("pre_fixation_recording_duration_s must be non-negative");
  }

  if (
    timing.epsilon_drift_ms > 0 &&
    timing.fixation_completion_time_ms >= timing.epsilon_drift_ms
  ) {
    errors.push(
      `fixation_completion_time_ms (${timing.fixation_completion_time_ms}) must be strictly less than epsilon_drift_ms (${timing.epsilon_drift_ms}) to stay within drift budget`
    );
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

// ── Resolution Validation ───────────────────────────────────────────────────

/**
 * Validates that the actual scanning resolution (in nm) is at least as fine
 * as the requirement for the specified fidelity level.
 *
 * A smaller resolution_nm value means finer resolution.
 */
export function validateResolutionForFidelity(
  resolution_nm: number,
  fidelity: FidelityLevel
): ValidationResult {
  const required = FIDELITY_RESOLUTION_NM[fidelity];
  if (resolution_nm > required) {
    return fail(
      `Scan resolution ${resolution_nm} nm is too coarse for ${fidelity}-level fidelity (requires ≤ ${required} nm)`
    );
  }
  return ok();
}

// ── Data Size Estimation ────────────────────────────────────────────────────

/**
 * Estimates raw data size in bytes for scanning a brain of given volume
 * at the specified fidelity level.
 *
 * Assumes:
 * - Isotropic voxels at the fidelity resolution
 * - 2 bytes per voxel (16-bit intensity)
 * - Reference: human brain ~1400 cm³
 *
 * From architecture doc:
 *   Connectome (~1 µm):  ~1.5 PB for human brain
 *   Cellular (~100 nm):  ~1.5 EB for human brain
 *   Molecular (~1 nm):   ~1.5 ZB for human brain
 */
export function estimateRawDataSize(
  fidelity: FidelityLevel,
  brainVolume_cm3: number
): number {
  const HUMAN_BRAIN_CM3 = 1400;
  const resolution_nm = FIDELITY_RESOLUTION_NM[fidelity];

  // Volume in nm³: 1 cm³ = 1e21 nm³
  const volume_nm3 = HUMAN_BRAIN_CM3 * 1e21;
  const voxelVolume_nm3 = resolution_nm ** 3;
  const voxelCount = volume_nm3 / voxelVolume_nm3;
  const bytesPerVoxel = 2;
  const humanBrainBytes = voxelCount * bytesPerVoxel;

  // Scale linearly by brain volume
  return humanBrainBytes * (brainVolume_cm3 / HUMAN_BRAIN_CM3);
}

// ── Full Dataset Validation ─────────────────────────────────────────────────

// ── Validation Report Validation ───────────────────────────────────────────

/**
 * Validates a ValidationReport against scanning threshold requirements.
 *
 * Checks detection metrics (neuron/synapse sensitivity/specificity),
 * weight estimation error, registration error, and cross-modality agreement
 * against configurable thresholds (injectable per CLAUDE.md).
 *
 * Contracts invariants:
 *   neuron_detection.sensitivity ≥ NEURON_DETECTION_SENSITIVITY_MIN
 *   synapse_detection.sensitivity ≥ SYNAPSE_DETECTION_SENSITIVITY_MIN
 *
 * Behavioral Spec Scenario 1 Then clauses:
 *   neuron_detection.sensitivity ≥ 0.95
 *   synapse_detection.sensitivity ≥ 0.90
 *   weight_estimation_error.mean ≤ 0.15
 *   registration_error_nm.mean ≤ 500
 *   cross_modality_agreement.overall ≥ 0.85
 */
export function validateValidationReport(
  report: ValidationReport,
  thresholds: ScanningThresholds = DEFAULT_SCANNING_THRESHOLDS,
): ValidationResult {
  const errors: string[] = [];

  if (report.neuron_detection.sensitivity < thresholds.neuronDetectionSensitivityMin) {
    errors.push(
      `neuron detection sensitivity (${report.neuron_detection.sensitivity}) is below minimum threshold (${thresholds.neuronDetectionSensitivityMin})`
    );
  }

  if (report.neuron_detection.specificity < thresholds.neuronDetectionSpecificityMin) {
    errors.push(
      `neuron detection specificity (${report.neuron_detection.specificity}) is below minimum threshold (${thresholds.neuronDetectionSpecificityMin})`
    );
  }

  if (report.synapse_detection.sensitivity < thresholds.synapseDetectionSensitivityMin) {
    errors.push(
      `synapse detection sensitivity (${report.synapse_detection.sensitivity}) is below minimum threshold (${thresholds.synapseDetectionSensitivityMin})`
    );
  }

  if (report.synapse_detection.specificity < thresholds.synapseDetectionSpecificityMin) {
    errors.push(
      `synapse detection specificity (${report.synapse_detection.specificity}) is below minimum threshold (${thresholds.synapseDetectionSpecificityMin})`
    );
  }

  if (report.weight_estimation_error.mean > thresholds.weightEstimationRmseMax) {
    errors.push(
      `weight estimation error mean (${report.weight_estimation_error.mean}) exceeds maximum threshold (${thresholds.weightEstimationRmseMax})`
    );
  }

  if (report.registration_error_nm.mean > thresholds.registrationErrorMaxNm) {
    errors.push(
      `registration error mean (${report.registration_error_nm.mean} nm) exceeds maximum threshold (${thresholds.registrationErrorMaxNm} nm)`
    );
  }

  if (report.cross_modality_agreement.overall < thresholds.crossModalityAgreementMin) {
    errors.push(
      `cross-modality agreement (${report.cross_modality_agreement.overall}) is below minimum threshold (${thresholds.crossModalityAgreementMin})`
    );
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

// ── Full Dataset Validation ─────────────────────────────────────────────────

/**
 * Validates an entire BrainScanDataset for internal consistency,
 * checking timing, resolution, destructiveness documentation,
 * and fidelity-specific requirements.
 */
export function validateBrainScanDataset(
  dataset: BrainScanDataset
): ValidationResult {
  const checks: ValidationResult[] = [];

  // Schema version must be present
  if (!dataset.schema_version) {
    checks.push(fail("schema_version must be a non-empty string"));
  }

  // Timing validation
  checks.push(validateScanTiming(dataset.timing));

  // Resolution must match fidelity
  checks.push(
    validateResolutionForFidelity(
      dataset.structural_data.resolution_nm,
      dataset.fidelity_level
    )
  );

  // Destructive scans must have justification
  if (
    !dataset.destructiveness.is_nondestructive &&
    !dataset.destructiveness.destruction_justification
  ) {
    checks.push(
      fail(
        "Destructive scan requires destruction_justification to document why non-destructive scanning is impossible at this fidelity"
      )
    );
  }

  // Molecular and quantum fidelity require ion channel state data
  if (
    (dataset.fidelity_level === "molecular" ||
      dataset.fidelity_level === "quantum") &&
    dataset.dynamic_state.ion_channel_states === null
  ) {
    checks.push(
      fail(
        `ion_channel_states must be provided for ${dataset.fidelity_level}-level fidelity`
      )
    );
  }

  return merge(...checks);
}
