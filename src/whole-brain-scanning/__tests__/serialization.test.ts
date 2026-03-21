/**
 * Whole-Brain Scanning — Serialization Tests (RED phase)
 *
 * Tests for HDF5 schema mapping and serialization contracts.
 * Maps to:
 *   - Contracts postcondition 7: "Is serializable to HDF5 format consumable by 0.2.2.1.3"
 *   - Decision (Output Data Format): "HDF5 with NeuroML-inspired schema, wrapped in BrainScanDataset envelope"
 *   - Behavioral Spec Scenario 1 Then: "Dataset is serializable to HDF5 and loadable by 0.2.2.1.3"
 */
import { describe, it, expect } from "vitest";
import {
  BRAIN_SCAN_HDF5_SCHEMA,
  toSerializableFormat,
  validateForSerialization,
} from "../serialization.js";
import type { SerializableBrainScanDataset, HDF5SchemaEntry } from "../serialization.js";
import type { BrainScanDataset } from "../types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSerializableDataset(): BrainScanDataset {
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
      resolution_nm: 30,
      volume_extent_mm3: 500,
      sections: [
        {
          section_id: "s001",
          thickness_nm: 30,
          image_stack: {
            dimensions: [1024, 1024, 256],
            voxelSize_nm: 30,
            data: new Uint16Array([1, 2, 3]),
          },
          segmentation: {
            neuronCount: 50,
            labelMap: new Map([["n1", new Uint32Array([1, 0, 1])]]),
            synapseCount: 200,
          },
        },
      ],
    },
    dynamic_state: {
      timestamp_relative_to_fixation_ms: -10,
      activity_recording: {
        modality: "high-density-electrophysiology",
        duration_s: 30,
        channelCount: 384,
        sampleRate_Hz: 30000,
        samples: new Float64Array([0.1, 0.2, 0.3]),
      },
      neurotransmitter_map: {
        species: ["glutamate", "GABA"],
        resolution_nm: 1000,
        concentrations: new Map([
          ["glutamate", new Float64Array([1.5, 2.0])],
          ["GABA", new Float64Array([0.5, 0.8])],
        ]),
      },
      synaptic_weight_estimates: {
        synapseCount: 200,
        weights: new Map([["syn1", 0.75], ["syn2", 0.30]]),
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
      destruction_justification: "SBF-SEM requires tissue sectioning and ablation",
      preservation_protocol: "cryo-preserved post-scan",
      minimal_alternative: "expansion microscopy with optical clearing",
    },
    validation_checksums: new Map([["s001", "sha256:abc123"]]),
  };
}

// ── HDF5 Schema Mapping ────────────────────────────────────────────────────

describe("BRAIN_SCAN_HDF5_SCHEMA", () => {
  it("maps all top-level BrainScanDataset fields to HDF5 paths", () => {
    const topLevelFields: (keyof BrainScanDataset)[] = [
      "schema_version",
      "fidelity_level",
      "subject_metadata",
      "structural_data",
      "dynamic_state",
      "timing",
      "destructiveness",
      "validation_checksums",
    ];

    for (const field of topLevelFields) {
      expect(BRAIN_SCAN_HDF5_SCHEMA).toHaveProperty(field);
    }
  });

  it("each entry has an hdf5_path and hdf5_type", () => {
    for (const [key, entry] of Object.entries(BRAIN_SCAN_HDF5_SCHEMA)) {
      const schemaEntry = entry as HDF5SchemaEntry;
      expect(schemaEntry.hdf5_path).toBeDefined();
      expect(typeof schemaEntry.hdf5_path).toBe("string");
      expect(schemaEntry.hdf5_path.startsWith("/")).toBe(true);
      expect(schemaEntry.hdf5_type).toBeDefined();
      expect(["group", "attribute", "dataset"]).toContain(schemaEntry.hdf5_type);
    }
  });

  it("uses NeuroML-inspired root group /brain_scan", () => {
    const paths = Object.values(BRAIN_SCAN_HDF5_SCHEMA).map(
      (e) => (e as HDF5SchemaEntry).hdf5_path
    );
    // All paths should be under /brain_scan root
    for (const path of paths) {
      expect(path.startsWith("/brain_scan")).toBe(true);
    }
  });

  it("includes schema_version as a root attribute", () => {
    const entry = BRAIN_SCAN_HDF5_SCHEMA.schema_version as HDF5SchemaEntry;
    expect(entry.hdf5_type).toBe("attribute");
    expect(entry.hdf5_path).toBe("/brain_scan");
  });
});

// ── Serializable Format Conversion ──────────────────────────────────────────

describe("toSerializableFormat", () => {
  it("converts a BrainScanDataset to a plain-object form (no Maps)", () => {
    const dataset = makeSerializableDataset();
    const result = toSerializableFormat(dataset);

    // validation_checksums should be a plain object, not a Map
    expect(result.validation_checksums).not.toBeInstanceOf(Map);
    expect(typeof result.validation_checksums).toBe("object");
    expect(result.validation_checksums["s001"]).toBe("sha256:abc123");
  });

  it("converts TypedArrays to regular arrays", () => {
    const dataset = makeSerializableDataset();
    const result = toSerializableFormat(dataset);

    // image_stack.data should be a regular array
    expect(result.structural_data.sections[0].image_stack.data).toBeInstanceOf(Array);
    expect(result.structural_data.sections[0].image_stack.data).toEqual([1, 2, 3]);

    // activity_recording.samples should be a regular array
    expect(result.dynamic_state.activity_recording.samples).toBeInstanceOf(Array);
    expect(result.dynamic_state.activity_recording.samples).toEqual([0.1, 0.2, 0.3]);
  });

  it("converts nested Maps to plain objects", () => {
    const dataset = makeSerializableDataset();
    const result = toSerializableFormat(dataset);

    // synaptic_weight_estimates.weights should be plain object
    const weights = result.dynamic_state.synaptic_weight_estimates.weights;
    expect(weights).not.toBeInstanceOf(Map);
    expect(weights["syn1"]).toBe(0.75);
    expect(weights["syn2"]).toBe(0.30);

    // neurotransmitter_map.concentrations should be plain object with arrays
    const concentrations = result.dynamic_state.neurotransmitter_map.concentrations;
    expect(concentrations).not.toBeInstanceOf(Map);
    expect(concentrations["glutamate"]).toEqual([1.5, 2.0]);
  });

  it("converts section segmentation labelMap to plain object", () => {
    const dataset = makeSerializableDataset();
    const result = toSerializableFormat(dataset);

    const labelMap = result.structural_data.sections[0].segmentation.labelMap;
    expect(labelMap).not.toBeInstanceOf(Map);
    expect(labelMap["n1"]).toEqual([1, 0, 1]);
  });

  it("preserves all scalar fields unchanged", () => {
    const dataset = makeSerializableDataset();
    const result = toSerializableFormat(dataset);

    expect(result.schema_version).toBe("1.0.0");
    expect(result.fidelity_level).toBe("cellular");
    expect(result.subject_metadata.species).toBe("Mus musculus");
    expect(result.structural_data.resolution_nm).toBe(30);
    expect(result.timing.fixation_completion_time_ms).toBe(50);
    expect(result.destructiveness.destruction_justification).toBe(
      "SBF-SEM requires tissue sectioning and ablation"
    );
  });

  it("produces a JSON-serializable result", () => {
    const dataset = makeSerializableDataset();
    const result = toSerializableFormat(dataset);

    // Should not throw — Maps and TypedArrays would cause issues
    const json = JSON.stringify(result);
    expect(typeof json).toBe("string");

    // Round-trip: parse and compare
    const parsed = JSON.parse(json);
    expect(parsed.schema_version).toBe("1.0.0");
    expect(parsed.validation_checksums["s001"]).toBe("sha256:abc123");
  });

  it("handles null ion_channel_states gracefully", () => {
    const dataset = makeSerializableDataset();
    dataset.dynamic_state.ion_channel_states = null;
    const result = toSerializableFormat(dataset);
    expect(result.dynamic_state.ion_channel_states).toBeNull();
  });

  it("converts ion_channel_states Maps when present", () => {
    const dataset = makeSerializableDataset();
    dataset.dynamic_state.ion_channel_states = {
      channelCount: 1,
      states: new Map([
        ["ch1", {
          channelType: "Nav1.1",
          openProbability: 0.3,
          membraneVoltage_mV: -65,
          conformationalState: "closed",
        }],
      ]),
    };
    const result = toSerializableFormat(dataset);
    const states = result.dynamic_state.ion_channel_states!.states;
    expect(states).not.toBeInstanceOf(Map);
    expect(states["ch1"].channelType).toBe("Nav1.1");
  });
});

// ── Serialization Validation ────────────────────────────────────────────────

describe("validateForSerialization", () => {
  it("passes for a valid dataset with checksums matching sections", () => {
    const dataset = makeSerializableDataset();
    const result = validateForSerialization(dataset);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when validation_checksums is empty but sections exist", () => {
    const dataset = makeSerializableDataset();
    dataset.validation_checksums = new Map();
    const result = validateForSerialization(dataset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("checksum"))).toBe(true);
  });

  it("fails when a section has no corresponding checksum entry", () => {
    const dataset = makeSerializableDataset();
    // Section "s001" exists but checksum is for a different section
    dataset.validation_checksums = new Map([["s999", "sha256:xyz"]]);
    const result = validateForSerialization(dataset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("s001"))).toBe(true);
  });

  it("fails when underlying dataset validation fails", () => {
    const dataset = makeSerializableDataset();
    dataset.schema_version = ""; // will fail validateBrainScanDataset
    const result = validateForSerialization(dataset);
    expect(result.valid).toBe(false);
  });
});
