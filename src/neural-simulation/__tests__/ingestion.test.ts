/**
 * Neural Simulation — Ingestion Pipeline Tests (RED phase)
 *
 * Tests define expected behavior of the scan data ingestion pipeline
 * before the implementation exists. All tests will fail until
 * src/neural-simulation/ingestion.ts is created (RED → GREEN).
 *
 * Maps to:
 * - Contracts: Scan Data Ingestion Interface (preconditions, postconditions, invariants)
 * - Behavioral Spec Scenario 1: 8-stage scan data ingestion pipeline
 * - Threshold Registry: compartments_per_neuron_min = 5, warm_up_duration = 10 s,
 *   validation_firing_rate_min = 0.1 Hz, validation_firing_rate_max = 50 Hz
 */

import { describe, it, expect } from "vitest";
import {
  ingestBrainScan,
  validateScanCompatibility,
} from "../ingestion.js";
import type { NeuronModel } from "../types.js";
import type { BrainScanDataset, FidelityLevel } from "../../whole-brain-scanning/types.js";

// ── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a minimal valid BrainScanDataset for testing.
 * Uses neuron IDs from the label map (neuron-0 … neuron-N).
 * Synapses default to 0 to avoid connectivity derivation complexity.
 */
function makeScan({
  neuronCount = 5,
  synapseCount = 0,
  fidelityLevel = "cellular" as FidelityLevel,
  schemaVersion = "1.0.0",
}: {
  neuronCount?: number;
  synapseCount?: number;
  fidelityLevel?: FidelityLevel;
  schemaVersion?: string;
} = {}): BrainScanDataset {
  const labelMap = new Map<string, Uint32Array>();
  for (let i = 0; i < neuronCount; i++) {
    labelMap.set(`neuron-${i}`, new Uint32Array([i]));
  }

  return {
    schema_version: schemaVersion,
    fidelity_level: fidelityLevel,
    subject_metadata: {
      species: "test-organism",
      brain_volume_cm3: 0.001,
      neuron_count_estimate: neuronCount,
      synapse_count_estimate: synapseCount,
      age_at_scan: "P0",
      health_status: "healthy",
    },
    structural_data: {
      modality: "SBF-SEM",
      resolution_nm: 30,
      volume_extent_mm3: 0.001,
      sections: [
        {
          section_id: "section-0",
          thickness_nm: 30,
          image_stack: {
            dimensions: [10, 10, 1],
            voxelSize_nm: 30,
            data: new Uint16Array(100),
          },
          segmentation: {
            neuronCount,
            labelMap,
            synapseCount,
          },
        },
      ],
    },
    dynamic_state: {
      timestamp_relative_to_fixation_ms: -10,
      activity_recording: {
        modality: "high-density-electrophysiology",
        duration_s: 30,
        channelCount: neuronCount,
        sampleRate_Hz: 30000,
        samples: new Float64Array(neuronCount * 30),
      },
      neurotransmitter_map: {
        species: ["glutamate", "GABA"],
        resolution_nm: 1000,
        concentrations: new Map([
          ["glutamate", new Float64Array(1)],
          ["GABA", new Float64Array(1)],
        ]),
      },
      synaptic_weight_estimates: {
        synapseCount,
        weights: new Map(),
        method: "spine-volume",
      },
      ion_channel_states: null,
    },
    timing: {
      fixation_method: "cryo-vitrification",
      fixation_completion_time_ms: 50,
      pre_fixation_recording_duration_s: 30,
      epsilon_drift_ms: 100,
    },
    destructiveness: {
      is_nondestructive: false,
      destruction_justification: "SBF-SEM requires tissue sectioning",
      preservation_protocol: "tissue archival",
      minimal_alternative: "expansion microscopy",
    },
    validation_checksums: new Map([["section-0", "abc123"]]),
  };
}

/**
 * Mock warm-up simulator returning valid firing rates (5 Hz per type).
 * Per Threshold Registry: validation_firing_rate_min = 0.1 Hz,
 * validation_firing_rate_max = 50 Hz; 5 Hz is well within range.
 */
function makeValidWarmup(
  _neuronCount: number
): (_neurons: readonly NeuronModel[], _duration_s: number) => Map<string, number> {
  return (_neurons, _duration_s) => new Map([["default", 5.0]]);
}

/**
 * Mock warm-up simulator returning too-low firing rates (below 0.1 Hz min).
 * Simulates dead neurons / fully inhibited network.
 */
function makeLowFiringWarmup(): (
  _neurons: readonly NeuronModel[],
  _duration_s: number
) => Map<string, number> {
  return (_neurons, _duration_s) => new Map([["default", 0.001]]);
}

/**
 * Mock warm-up simulator returning too-high firing rates (above 50 Hz max).
 * Simulates runaway excitation.
 */
function makeHighFiringWarmup(): (
  _neurons: readonly NeuronModel[],
  _duration_s: number
) => Map<string, number> {
  return (_neurons, _duration_s) => new Map([["default", 1000.0]]);
}

// ── validateScanCompatibility — precondition checks ──────────────────────────

describe("validateScanCompatibility", () => {
  // Contract precondition: fidelity_level is "cellular" or finer
  it("accepts dataset with fidelity_level === 'cellular' (L2+ compatible)", () => {
    const result = validateScanCompatibility(makeScan({ fidelityLevel: "cellular" }));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts dataset with fidelity_level === 'molecular' (finer than L2+)", () => {
    const result = validateScanCompatibility(makeScan({ fidelityLevel: "molecular" }));
    expect(result.valid).toBe(true);
  });

  it("rejects dataset with fidelity_level === 'connectome' (insufficient for L2+)", () => {
    const result = validateScanCompatibility(makeScan({ fidelityLevel: "connectome" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("fidelity"))).toBe(true);
  });

  // Contract precondition: schema_version is compatible
  it("accepts schema_version '1.0.0' (supported)", () => {
    const result = validateScanCompatibility(makeScan({ schemaVersion: "1.0.0" }));
    expect(result.valid).toBe(true);
  });

  it("rejects unsupported schema_version with schema error", () => {
    const result = validateScanCompatibility(makeScan({ schemaVersion: "99.0.0" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("schema"))).toBe(true);
  });

  it("returns valid: false and accumulates all errors when multiple preconditions fail", () => {
    const result = validateScanCompatibility(
      makeScan({ fidelityLevel: "connectome", schemaVersion: "99.0.0" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── ingestBrainScan — precondition enforcement ───────────────────────────────

describe("ingestBrainScan — precondition enforcement", () => {
  it("rejects dataset with 'connectome' fidelity (stage 1: validate scan)", async () => {
    await expect(
      ingestBrainScan(makeScan({ fidelityLevel: "connectome" }), {
        warmupSimulator: makeValidWarmup(5),
      })
    ).rejects.toThrow(/fidelity|connectome/i);
  });

  it("rejects dataset with unsupported schema_version (stage 1: validate scan)", async () => {
    await expect(
      ingestBrainScan(makeScan({ schemaVersion: "99.0.0" }), {
        warmupSimulator: makeValidWarmup(5),
      })
    ).rejects.toThrow(/schema/i);
  });
});

// ── ingestBrainScan — postconditions ─────────────────────────────────────────

describe("ingestBrainScan — postconditions (5-neuron, 0-synapse dataset)", () => {
  const NEURON_COUNT = 5;

  it("postcondition 1: neuron_count is within ±5% of subject_metadata.neuron_count_estimate", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(NEURON_COUNT),
    });
    const estimate = dataset.subject_metadata.neuron_count_estimate;
    expect(result.neuron_count).toBeGreaterThanOrEqual(estimate * 0.95);
    expect(result.neuron_count).toBeLessThanOrEqual(estimate * 1.05);
  });

  it("postcondition 2: synapse_count is within ±10% of subject_metadata.synapse_count_estimate", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT, synapseCount: 0 });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(NEURON_COUNT),
    });
    const estimate = dataset.subject_metadata.synapse_count_estimate;
    // For estimate = 0, allow range [0, 0]
    const tolerance = Math.max(estimate * 0.1, 0);
    expect(result.synapse_count).toBeGreaterThanOrEqual(estimate - tolerance);
    expect(result.synapse_count).toBeLessThanOrEqual(estimate + tolerance);
  });

  it("postcondition 3: every neuron has >= 5 compartments (compartments_per_neuron_min from Threshold Registry)", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(NEURON_COUNT),
    });
    for (const neuron of result.neurons) {
      expect(neuron.compartments.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("postcondition 5 (partial): all compartment V_m in [-90, +40] mV at initialization", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(NEURON_COUNT),
    });
    for (const neuron of result.neurons) {
      for (const compartment of neuron.compartments) {
        expect(compartment.state.membrane_potential_mV).toBeGreaterThanOrEqual(-90);
        expect(compartment.state.membrane_potential_mV).toBeLessThanOrEqual(40);
      }
    }
  });

  it("postcondition 6: spatial decomposition assigns all neurons to exactly one partition", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(NEURON_COUNT),
    });
    const assigned = new Set<string>();
    for (const column of result.spatial_decomposition.columns) {
      for (const neuronId of column.neuron_ids) {
        expect(assigned.has(neuronId)).toBe(false); // each neuron appears exactly once
        assigned.add(neuronId);
      }
    }
    expect(assigned.size).toBe(result.neuron_count);
  });

  it("postcondition 8: validation_passed is true when warm-up produces valid firing rates", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(NEURON_COUNT),
    });
    expect(result.validation_passed).toBe(true);
  });

  it("postcondition 8 (negative): validation_passed is false when firing rates below 0.1 Hz minimum", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeLowFiringWarmup(),
    });
    expect(result.validation_passed).toBe(false);
  });

  it("postcondition 8 (negative): validation_passed is false when firing rates above 50 Hz maximum", async () => {
    const dataset = makeScan({ neuronCount: NEURON_COUNT });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeHighFiringWarmup(),
    });
    expect(result.validation_passed).toBe(false);
  });
});

// ── ingestBrainScan — invariants ─────────────────────────────────────────────

describe("ingestBrainScan — invariants", () => {
  it("invariant: every neuron has at least one compartment (soma — no compartment-less neurons)", async () => {
    const dataset = makeScan({ neuronCount: 3 });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(3),
    });
    for (const neuron of result.neurons) {
      expect(neuron.compartments.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("invariant: total neuron count across all spatial partitions equals result.neuron_count", async () => {
    const dataset = makeScan({ neuronCount: 7 });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(7),
    });
    let totalInPartitions = 0;
    for (const column of result.spatial_decomposition.columns) {
      totalInPartitions += column.neuron_ids.length;
    }
    expect(totalInPartitions).toBe(result.neuron_count);
  });

  it("invariant: ion channel conductances are within physiological range [0, 200] mS/cm²", async () => {
    const dataset = makeScan({ neuronCount: 3 });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(3),
    });
    for (const neuron of result.neurons) {
      for (const compartment of neuron.compartments) {
        for (const channel of compartment.ion_channels) {
          expect(channel.maxConductance_mS_per_cm2).toBeGreaterThanOrEqual(0);
          expect(channel.maxConductance_mS_per_cm2).toBeLessThanOrEqual(200);
        }
      }
    }
  });
});

// ── Behavioral Spec Scenario 1: pipeline stage verification ──────────────────

describe("Behavioral Spec Scenario 1 — 8-stage ingestion pipeline", () => {
  it("stage 1 (validate scan): rejects incompatible fidelity before any processing", async () => {
    await expect(
      ingestBrainScan(makeScan({ fidelityLevel: "connectome" }), {
        warmupSimulator: makeValidWarmup(1),
      })
    ).rejects.toThrow(/fidelity|connectome/i);
  });

  it("stage 2 (extract morphology): every neuron has >= compartments_per_neuron_min (5) compartments", async () => {
    const dataset = makeScan({ neuronCount: 4 });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(4),
    });
    for (const neuron of result.neurons) {
      expect(neuron.compartments.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("stage 6 (set dynamic state): V_m defaults to resting potential when no DynamicStateSnapshot data available", async () => {
    // Dataset with empty activity recording → resting-state defaults applied
    const dataset = makeScan({ neuronCount: 2 });
    // Clear the samples so no dynamic state can be derived from electrophysiology
    dataset.dynamic_state.activity_recording.samples = new Float64Array(0);
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(2),
    });
    // Per Behavioral Spec: resting-state default is -65 mV
    for (const neuron of result.neurons) {
      for (const compartment of neuron.compartments) {
        expect(compartment.state.membrane_potential_mV).toBeCloseTo(-65, 0); // within ±0.5 mV
      }
    }
  });

  it("stage 7 (spatial decomposition): all partitions are non-empty", async () => {
    const dataset = makeScan({ neuronCount: 5 });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(5),
    });
    expect(result.spatial_partitions).toBeGreaterThan(0);
    for (const column of result.spatial_decomposition.columns) {
      expect(column.neuron_ids.length).toBeGreaterThan(0);
    }
  });

  it("stage 8 (validation checkpoint): warm_up_duration_sim_s equals configured warm_up_duration (10 s default)", async () => {
    const dataset = makeScan({ neuronCount: 3 });
    const result = await ingestBrainScan(dataset, {
      warmupSimulator: makeValidWarmup(3),
    });
    // Per Threshold Registry: warm_up_duration = 10 s
    expect(result.warm_up_duration_sim_s).toBe(10);
  });
});
