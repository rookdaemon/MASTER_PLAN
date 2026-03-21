/**
 * Whole-Brain Scanning — HDF5 Schema Mapping & Serialization
 *
 * Defines the HDF5 schema layout for BrainScanDataset (NeuroML-inspired),
 * converts in-memory types (Maps, TypedArrays) to a JSON-serializable form,
 * and validates datasets for serialization readiness.
 *
 * Implements:
 *   - Decision (Output Data Format): HDF5 with NeuroML-inspired schema
 *   - Contracts postcondition 7: serializable to HDF5
 *   - Contracts invariant: validation_checksums per scanned region
 *   - Behavioral Spec Scenario 1 Then: serializable to HDF5 and loadable
 */

import type { BrainScanDataset } from "./types.js";
import { validateBrainScanDataset, type ValidationResult } from "./validation.js";

// ── HDF5 Schema Types ────────────────────────────────────────────────────────

export interface HDF5SchemaEntry {
  /** HDF5 path (group or dataset path) */
  hdf5_path: string;
  /** HDF5 node type */
  hdf5_type: "group" | "attribute" | "dataset";
}

// ── HDF5 Schema Constant ─────────────────────────────────────────────────────

/**
 * Maps each top-level BrainScanDataset field to its HDF5 location.
 * All paths are under the NeuroML-inspired `/brain_scan` root group.
 *
 * - `schema_version` is a root-level attribute on `/brain_scan`
 * - Complex sub-structures are HDF5 groups
 * - Scalar metadata fields are attributes
 * - Large array data would be HDF5 datasets
 */
export const BRAIN_SCAN_HDF5_SCHEMA: Record<keyof BrainScanDataset, HDF5SchemaEntry> = {
  schema_version: {
    hdf5_path: "/brain_scan",
    hdf5_type: "attribute",
  },
  fidelity_level: {
    hdf5_path: "/brain_scan/fidelity_level",
    hdf5_type: "attribute",
  },
  subject_metadata: {
    hdf5_path: "/brain_scan/subject_metadata",
    hdf5_type: "group",
  },
  structural_data: {
    hdf5_path: "/brain_scan/structural_data",
    hdf5_type: "group",
  },
  dynamic_state: {
    hdf5_path: "/brain_scan/dynamic_state",
    hdf5_type: "group",
  },
  timing: {
    hdf5_path: "/brain_scan/timing",
    hdf5_type: "group",
  },
  destructiveness: {
    hdf5_path: "/brain_scan/destructiveness",
    hdf5_type: "group",
  },
  validation_checksums: {
    hdf5_path: "/brain_scan/validation_checksums",
    hdf5_type: "dataset",
  },
};

// ── Serializable Types ───────────────────────────────────────────────────────

/**
 * A fully JSON-serializable version of BrainScanDataset.
 * All Maps are converted to plain objects, all TypedArrays to number[].
 * Uses `any` for deep-converted nested structures since the shape
 * mirrors BrainScanDataset but with different container types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SerializableBrainScanDataset = Record<string, any>;

// ── Deep Conversion ──────────────────────────────────────────────────────────

/**
 * Recursively converts Maps to plain objects and TypedArrays to number[].
 */
function deepConvert(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Map → plain object (recursively convert values)
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value) {
      obj[String(k)] = deepConvert(v);
    }
    return obj;
  }

  // TypedArray → regular Array
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>);
  }

  // Regular Array → recurse into elements
  if (Array.isArray(value)) {
    return value.map(deepConvert);
  }

  // Plain object → recurse into properties
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = deepConvert(v);
    }
    return result;
  }

  // Scalars pass through
  return value;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts a BrainScanDataset to a plain-object form suitable for
 * JSON serialization and HDF5 writing.
 *
 * - Maps → plain objects
 * - TypedArrays → number[]
 * - Scalars and nulls preserved as-is
 */
export function toSerializableFormat(dataset: BrainScanDataset): SerializableBrainScanDataset {
  return deepConvert(dataset) as SerializableBrainScanDataset;
}

/**
 * Validates that a BrainScanDataset is ready for serialization.
 *
 * Checks:
 * 1. Underlying dataset validity (delegates to validateBrainScanDataset)
 * 2. Contracts invariant: validation_checksums must contain one entry per scanned section
 */
export function validateForSerialization(dataset: BrainScanDataset): ValidationResult {
  const errors: string[] = [];

  // Delegate to underlying dataset validation
  const datasetResult = validateBrainScanDataset(dataset);
  errors.push(...datasetResult.errors);

  // Contracts invariant: validation_checksums must have one entry per scanned region
  const sections = dataset.structural_data.sections;
  if (sections.length > 0) {
    for (const section of sections) {
      if (!dataset.validation_checksums.has(section.section_id)) {
        errors.push(
          `Missing checksum for section "${section.section_id}": validation_checksums must contain one entry per scanned region`
        );
      }
    }
  }

  return errors.length === 0
    ? { valid: true, errors: [] }
    : { valid: false, errors };
}
