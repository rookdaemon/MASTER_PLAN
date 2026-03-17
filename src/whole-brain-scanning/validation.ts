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
} from "./types.js";
import { FIDELITY_RESOLUTION_NM } from "./types.js";

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
