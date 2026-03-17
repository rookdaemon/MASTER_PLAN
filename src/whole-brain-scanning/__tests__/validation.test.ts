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
} from "../validation.js";
import type {
  ScanTimingProtocol,
  StructuralScan,
  DynamicStateSnapshot,
  DestructivenessAssessment,
  SubjectMetadata,
  BrainScanDataset,
  FidelityLevel,
} from "../types.js";

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
