/**
 * Whole-Brain Scanning — Validation Tests
 *
 * Red phase: these tests define the expected behavior of scan parameter
 * validation functions before implementation exists.
 */
import { describe, it, expect } from "vitest";
import {
  validateScanTiming,
  validateResolutionForFidelity,
  validateBrainScanDataset,
  estimateRawDataSize,
  validateValidationReport,
} from "../validation.js";
import type {
  ScanTimingProtocol,
  StructuralScan,
  DynamicStateSnapshot,
  DestructivenessAssessment,
  SubjectMetadata,
  BrainScanDataset,
  FidelityLevel,
  ValidationReport,
  StatisticalSummary,
} from "../types.js";
import type { ScanningThresholds } from "../constants.js";
import { DEFAULT_SCANNING_THRESHOLDS } from "../constants.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTiming(overrides?: Partial<ScanTimingProtocol>): ScanTimingProtocol {
  return {
    fixation_method: "cryo-vitrification",
    fixation_completion_time_ms: 50,
    pre_fixation_recording_duration_s: 30,
    epsilon_drift_ms: 100,
    ...overrides,
  };
}

function makeMinimalDataset(overrides?: Partial<BrainScanDataset>): BrainScanDataset {
  return {
    schema_version: "1.0.0",
    fidelity_level: "cellular",
    subject_metadata: {
      species: "Mus musculus",
      brain_volume_cm3: 0.5,
      neuron_count_estimate: 7e7,
      synapse_count_estimate: 1e11,
      age_at_scan: "P90",
      health_status: "healthy",
    },
    structural_data: {
      modality: "SBF-SEM",
      resolution_nm: 100,
      volume_extent_mm3: 500,
      sections: [],
    },
    dynamic_state: {
      timestamp_relative_to_fixation_ms: -10,
      activity_recording: {
        modality: "calcium-imaging",
        duration_s: 30,
        channelCount: 1000,
        sampleRate_Hz: 30,
        samples: new Float64Array(0),
      },
      neurotransmitter_map: {
        species: ["glutamate", "GABA"],
        resolution_nm: 1000,
        concentrations: new Map(),
      },
      synaptic_weight_estimates: {
        synapseCount: 1000,
        weights: new Map(),
        method: "spine-volume",
      },
      ion_channel_states: null,
    },
    timing: makeTiming(),
    destructiveness: {
      is_nondestructive: false,
      destruction_justification: "Cellular-resolution requires tissue sectioning",
      preservation_protocol: "cryo-preserved post-scan",
      minimal_alternative: "expansion microscopy with optical clearing",
    },
    validation_checksums: new Map(),
    ...overrides,
  };
}

// ── Scan Timing Validation ──────────────────────────────────────────────────

describe("validateScanTiming", () => {
  it("accepts timing where fixation < drift budget", () => {
    const result = validateScanTiming(makeTiming({
      fixation_completion_time_ms: 50,
      epsilon_drift_ms: 100,
    }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects timing where fixation exceeds drift budget", () => {
    const result = validateScanTiming(makeTiming({
      fixation_completion_time_ms: 150,
      epsilon_drift_ms: 100,
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("drift");
  });

  it("rejects timing where fixation equals drift budget (must be strictly less)", () => {
    const result = validateScanTiming(makeTiming({
      fixation_completion_time_ms: 100,
      epsilon_drift_ms: 100,
    }));
    expect(result.valid).toBe(false);
  });

  it("rejects negative pre-fixation recording duration", () => {
    const result = validateScanTiming(makeTiming({
      pre_fixation_recording_duration_s: -5,
    }));
    expect(result.valid).toBe(false);
  });

  it("rejects zero drift budget", () => {
    const result = validateScanTiming(makeTiming({
      epsilon_drift_ms: 0,
    }));
    expect(result.valid).toBe(false);
  });
});

// ── Resolution Validation ───────────────────────────────────────────────────

describe("validateResolutionForFidelity", () => {
  it("accepts resolution matching fidelity requirement", () => {
    const result = validateResolutionForFidelity(100, "cellular");
    expect(result.valid).toBe(true);
  });

  it("accepts resolution finer than fidelity requirement", () => {
    const result = validateResolutionForFidelity(50, "cellular");
    expect(result.valid).toBe(true);
  });

  it("rejects resolution coarser than fidelity requirement", () => {
    const result = validateResolutionForFidelity(500, "cellular");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("resolution");
  });

  it("works for connectome level", () => {
    expect(validateResolutionForFidelity(1000, "connectome").valid).toBe(true);
    expect(validateResolutionForFidelity(2000, "connectome").valid).toBe(false);
  });

  it("works for molecular level", () => {
    expect(validateResolutionForFidelity(1, "molecular").valid).toBe(true);
    expect(validateResolutionForFidelity(10, "molecular").valid).toBe(false);
  });
});

// ── Data Size Estimation ────────────────────────────────────────────────────

describe("estimateRawDataSize", () => {
  it("returns estimated bytes for a given fidelity and brain volume", () => {
    const bytes = estimateRawDataSize("connectome", 1400);
    expect(bytes).toBeGreaterThan(0);
    // 1400 cm³ × 1e21 nm³/cm³ ÷ (1000nm)³ × 2 bytes = 2.8 PB
    expect(bytes).toBeCloseTo(2.8e15, -14);
  });

  it("scales linearly with brain volume", () => {
    const small = estimateRawDataSize("connectome", 0.5);
    const large = estimateRawDataSize("connectome", 1.0);
    expect(large / small).toBeCloseTo(2, 1);
  });

  it("increases with finer fidelity", () => {
    const connectome = estimateRawDataSize("connectome", 1400);
    const cellular = estimateRawDataSize("cellular", 1400);
    expect(cellular).toBeGreaterThan(connectome);
  });
});

// ── Full Dataset Validation ─────────────────────────────────────────────────

describe("validateBrainScanDataset", () => {
  it("accepts a valid dataset", () => {
    const result = validateBrainScanDataset(makeMinimalDataset());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects dataset where structural resolution is too coarse for fidelity", () => {
    const result = validateBrainScanDataset(makeMinimalDataset({
      fidelity_level: "cellular",
      structural_data: {
        modality: "diffusion-tensor-MRI",
        resolution_nm: 5000,  // way too coarse for cellular
        volume_extent_mm3: 500,
        sections: [],
      },
    }));
    expect(result.valid).toBe(false);
  });

  it("rejects dataset where timing is invalid", () => {
    const result = validateBrainScanDataset(makeMinimalDataset({
      timing: makeTiming({
        fixation_completion_time_ms: 200,
        epsilon_drift_ms: 100,
      }),
    }));
    expect(result.valid).toBe(false);
  });

  it("rejects dataset with missing schema version", () => {
    const result = validateBrainScanDataset(makeMinimalDataset({
      schema_version: "",
    }));
    expect(result.valid).toBe(false);
  });

  it("requires destruction justification when scan is destructive", () => {
    const result = validateBrainScanDataset(makeMinimalDataset({
      destructiveness: {
        is_nondestructive: false,
        destruction_justification: null,  // missing!
        preservation_protocol: "cryo",
        minimal_alternative: null,
      },
    }));
    expect(result.valid).toBe(false);
  });

  it("requires ion_channel_states when fidelity is molecular", () => {
    const result = validateBrainScanDataset(makeMinimalDataset({
      fidelity_level: "molecular",
      structural_data: {
        modality: "cryo-ET",
        resolution_nm: 1,
        volume_extent_mm3: 500,
        sections: [],
      },
      dynamic_state: {
        timestamp_relative_to_fixation_ms: -10,
        activity_recording: {
          modality: "calcium-imaging",
          duration_s: 30,
          channelCount: 1000,
          sampleRate_Hz: 30,
          samples: new Float64Array(0),
        },
        neurotransmitter_map: {
          species: ["glutamate"],
          resolution_nm: 1,
          concentrations: new Map(),
        },
        synaptic_weight_estimates: {
          synapseCount: 1000,
          weights: new Map(),
          method: "spine-volume",
        },
        ion_channel_states: null,  // missing for molecular!
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("ion_channel_states"))).toBe(true);
  });
});

// ── Validation Report Validation ────────────────────────────────────────────

function makeStats(overrides?: Partial<StatisticalSummary>): StatisticalSummary {
  return {
    mean: 0.05,
    median: 0.04,
    stddev: 0.02,
    min: 0.01,
    max: 0.10,
    n: 100,
    ...overrides,
  };
}

function makeValidReport(overrides?: Partial<ValidationReport>): ValidationReport {
  return {
    cross_modality_agreement: {
      regions: new Map([["cortex", 0.90], ["hippocampus", 0.88]]),
      overall: 0.89,
    },
    known_circuit_accuracy: [
      { region: "cerebellar_cortex", expected_connectivity: "parallel_fiber→Purkinje", measured_connectivity: "parallel_fiber→Purkinje", accuracy: 0.95 },
    ],
    neuron_detection: { sensitivity: 0.97, specificity: 0.96 },
    synapse_detection: { sensitivity: 0.92, specificity: 0.91 },
    weight_estimation_error: makeStats({ mean: 0.10 }),
    registration_error_nm: makeStats({ mean: 300 }),
    overall_pass: true,
    ...overrides,
  };
}

describe("validateValidationReport", () => {
  // ── Behavioral Spec Scenario 1: all metrics pass ──────────────────────

  it("accepts a report where all metrics meet default thresholds", () => {
    const result = validateValidationReport(makeValidReport());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ── Contracts invariant: neuron_detection.sensitivity ≥ threshold ─────

  it("rejects when neuron detection sensitivity is below threshold", () => {
    const result = validateValidationReport(makeValidReport({
      neuron_detection: { sensitivity: 0.90, specificity: 0.96 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("neuron") && e.includes("sensitivity"))).toBe(true);
  });

  it("accepts neuron detection sensitivity exactly at threshold (0.95)", () => {
    const result = validateValidationReport(makeValidReport({
      neuron_detection: { sensitivity: 0.95, specificity: 0.96 },
    }));
    expect(result.valid).toBe(true);
  });

  it("rejects when neuron detection specificity is below threshold", () => {
    const result = validateValidationReport(makeValidReport({
      neuron_detection: { sensitivity: 0.97, specificity: 0.90 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("neuron") && e.includes("specificity"))).toBe(true);
  });

  // ── Contracts invariant: synapse_detection.sensitivity ≥ threshold ────

  it("rejects when synapse detection sensitivity is below threshold", () => {
    const result = validateValidationReport(makeValidReport({
      synapse_detection: { sensitivity: 0.85, specificity: 0.91 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("synapse") && e.includes("sensitivity"))).toBe(true);
  });

  it("accepts synapse detection sensitivity exactly at threshold (0.90)", () => {
    const result = validateValidationReport(makeValidReport({
      synapse_detection: { sensitivity: 0.90, specificity: 0.91 },
    }));
    expect(result.valid).toBe(true);
  });

  it("rejects when synapse detection specificity is below threshold", () => {
    const result = validateValidationReport(makeValidReport({
      synapse_detection: { sensitivity: 0.92, specificity: 0.80 },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("synapse") && e.includes("specificity"))).toBe(true);
  });

  // ── Behavioral Spec Scenario 1: weight_estimation_error.mean ≤ 0.15 ──

  it("rejects when weight estimation error mean exceeds threshold", () => {
    const result = validateValidationReport(makeValidReport({
      weight_estimation_error: makeStats({ mean: 0.20 }),
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("weight"))).toBe(true);
  });

  it("accepts weight estimation error mean exactly at threshold (0.15)", () => {
    const result = validateValidationReport(makeValidReport({
      weight_estimation_error: makeStats({ mean: 0.15 }),
    }));
    expect(result.valid).toBe(true);
  });

  // ── Behavioral Spec Scenario 1: registration_error_nm.mean ≤ 500 ─────

  it("rejects when registration error mean exceeds threshold", () => {
    const result = validateValidationReport(makeValidReport({
      registration_error_nm: makeStats({ mean: 600 }),
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("registration"))).toBe(true);
  });

  it("accepts registration error mean exactly at threshold (500)", () => {
    const result = validateValidationReport(makeValidReport({
      registration_error_nm: makeStats({ mean: 500 }),
    }));
    expect(result.valid).toBe(true);
  });

  // ── Contracts postcondition 6: cross-modality agreement ≥ 0.85 ────────

  it("rejects when cross-modality agreement is below threshold", () => {
    const result = validateValidationReport(makeValidReport({
      cross_modality_agreement: {
        regions: new Map([["cortex", 0.80]]),
        overall: 0.80,
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("cross") && e.includes("modality"))).toBe(true);
  });

  it("accepts cross-modality agreement exactly at threshold (0.85)", () => {
    const result = validateValidationReport(makeValidReport({
      cross_modality_agreement: {
        regions: new Map([["cortex", 0.85]]),
        overall: 0.85,
      },
    }));
    expect(result.valid).toBe(true);
  });

  // ── Injectable thresholds (CLAUDE.md: configurable/injectable) ────────

  it("uses custom thresholds when provided", () => {
    const strictThresholds: ScanningThresholds = {
      ...DEFAULT_SCANNING_THRESHOLDS,
      neuronDetectionSensitivityMin: 0.99,
    };
    // Report has 0.97 sensitivity — passes default but fails strict
    const result = validateValidationReport(makeValidReport(), strictThresholds);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("neuron") && e.includes("sensitivity"))).toBe(true);
  });

  it("uses lenient thresholds when provided", () => {
    const lenientThresholds: ScanningThresholds = {
      ...DEFAULT_SCANNING_THRESHOLDS,
      neuronDetectionSensitivityMin: 0.80,
    };
    // Report has sensitivity 0.90 — fails default but passes lenient
    const result = validateValidationReport(
      makeValidReport({ neuron_detection: { sensitivity: 0.90, specificity: 0.96 } }),
      lenientThresholds
    );
    expect(result.valid).toBe(true);
  });

  // ── Multiple failures accumulate ──────────────────────────────────────

  it("accumulates multiple errors when several metrics fail", () => {
    const result = validateValidationReport(makeValidReport({
      neuron_detection: { sensitivity: 0.80, specificity: 0.80 },
      synapse_detection: { sensitivity: 0.70, specificity: 0.70 },
      weight_estimation_error: makeStats({ mean: 0.30 }),
      registration_error_nm: makeStats({ mean: 1000 }),
      cross_modality_agreement: { regions: new Map(), overall: 0.50 },
    }));
    expect(result.valid).toBe(false);
    // Should have at least 5 distinct errors (one per failed metric category)
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});
