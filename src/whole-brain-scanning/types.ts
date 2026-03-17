/**
 * Whole-Brain Scanning — Core Type Definitions
 *
 * Types and interfaces for the multi-modal brain scanning pipeline
 * defined in docs/whole-brain-scanning/ARCHITECTURE.md
 *
 * Implements card 0.2.2.1.2: scanning a complete biological brain at the
 * resolution determined by 0.2.2.1.1 (Emulation Fidelity Requirements).
 */

// ── Fidelity Levels ─────────────────────────────────────────────────────────

export type FidelityLevel = "connectome" | "cellular" | "molecular" | "quantum";

/** Spatial resolution in nanometers for each fidelity level */
export const FIDELITY_RESOLUTION_NM: Record<FidelityLevel, number> = {
  connectome: 1000,   // ~1 µm
  cellular: 100,      // ~100 nm
  molecular: 1,       // ~1 nm
  quantum: 0.1,       // sub-nm
};

// ── Structural Scanning ─────────────────────────────────────────────────────

export type StructuralModality =
  | "diffusion-tensor-MRI"
  | "light-sheet-microscopy"
  | "SBF-SEM"
  | "expansion-microscopy"
  | "cryo-ET"
  | "x-ray-nanotomography";

export interface ImageVolume {
  /** Dimensions in voxels [x, y, z] */
  dimensions: [number, number, number];
  /** Voxel size in nanometers (isotropic) */
  voxelSize_nm: number;
  /** Raw voxel data — typed array for efficiency */
  data: Uint16Array;
}

export interface NeuronSegmentation {
  /** Number of neurons detected in this section */
  neuronCount: number;
  /** Neuron IDs mapped to voxel label masks */
  labelMap: Map<string, Uint32Array>;
  /** Synaptic contacts detected */
  synapseCount: number;
}

export interface SectionData {
  section_id: string;
  thickness_nm: number;
  image_stack: ImageVolume;
  segmentation: NeuronSegmentation;
}

export interface StructuralScan {
  modality: StructuralModality;
  /** Isotropic voxel size in nm */
  resolution_nm: number;
  /** Total scanned volume in mm³ */
  volume_extent_mm3: number;
  /** Ordered from anterior to posterior */
  sections: SectionData[];
}

// ── Dynamic State Capture ───────────────────────────────────────────────────

export interface ActivityData {
  /** Recording modality (e.g. "calcium-imaging", "high-density-electrophysiology") */
  modality: string;
  /** Duration of recording in seconds */
  duration_s: number;
  /** Number of channels/neurons recorded */
  channelCount: number;
  /** Sample rate in Hz */
  sampleRate_Hz: number;
  /** Time-series data: channels × samples */
  samples: Float64Array;
}

export interface VolumetricConcentrationMap {
  /** Chemical species mapped */
  species: string[];
  /** Resolution in nm */
  resolution_nm: number;
  /** Concentration values in mol/L, indexed by species then spatial position */
  concentrations: Map<string, Float64Array>;
}

export interface SynapticWeightMap {
  /** Number of synapses with weight estimates */
  synapseCount: number;
  /** Synapse ID → estimated weight (normalized 0-1) */
  weights: Map<string, number>;
  /** Estimation method used */
  method: "spine-volume" | "receptor-density" | "immuno-EM" | "electrophysiology-inferred";
}

export interface IonChannelStateMap {
  /** Number of ion channel instances mapped */
  channelCount: number;
  /** Channel ID → conformational state */
  states: Map<string, IonChannelState>;
}

export interface IonChannelState {
  channelType: string;
  /** Open probability at time of fixation */
  openProbability: number;
  /** Voltage at time of fixation in mV */
  membraneVoltage_mV: number;
  /** Conformational state identifier */
  conformationalState: string;
}

export interface DynamicStateSnapshot {
  /** Time relative to fixation in ms (negative = before fixation) */
  timestamp_relative_to_fixation_ms: number;
  activity_recording: ActivityData;
  neurotransmitter_map: VolumetricConcentrationMap;
  synaptic_weight_estimates: SynapticWeightMap;
  /** Present only if molecular fidelity or higher is required */
  ion_channel_states: IonChannelStateMap | null;
}

// ── Scan Timing & Fixation ──────────────────────────────────────────────────

export type FixationMethod = "cryo-vitrification" | "aldehyde-perfusion" | "hybrid";

export interface ScanTimingProtocol {
  fixation_method: FixationMethod;
  /** Must be < epsilon_drift */
  fixation_completion_time_ms: number;
  /** Activity window captured while alive, in seconds */
  pre_fixation_recording_duration_s: number;
  /** Maximum tolerable state drift in ms */
  epsilon_drift_ms: number;
}

// ── Destructiveness Assessment ──────────────────────────────────────────────

export interface DestructivenessAssessment {
  is_nondestructive: boolean;
  /** Formal argument if destructive; null if non-destructive */
  destruction_justification: string | null;
  /** How the original tissue is handled */
  preservation_protocol: string;
  /** Least-destructive option explored; null if non-destructive */
  minimal_alternative: string | null;
}

// ── Subject Metadata ────────────────────────────────────────────────────────

export interface SubjectMetadata {
  species: string;
  brain_volume_cm3: number;
  neuron_count_estimate: number;
  synapse_count_estimate: number;
  age_at_scan: string;
  health_status: string;
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface StatisticalSummary {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  n: number;
}

export interface DetectionMetrics {
  sensitivity: number;
  specificity: number;
}

export interface CircuitBenchmarkResult {
  region: string;
  expected_connectivity: string;
  measured_connectivity: string;
  accuracy: number;
}

export interface PercentageByRegion {
  regions: Map<string, number>;
  overall: number;
}

export interface ValidationReport {
  cross_modality_agreement: PercentageByRegion;
  known_circuit_accuracy: CircuitBenchmarkResult[];
  neuron_detection: DetectionMetrics;
  synapse_detection: DetectionMetrics;
  weight_estimation_error: StatisticalSummary;
  registration_error_nm: StatisticalSummary;
  overall_pass: boolean;
}

// ── Top-Level Dataset ───────────────────────────────────────────────────────

export interface BrainScanDataset {
  schema_version: string;
  fidelity_level: FidelityLevel;
  subject_metadata: SubjectMetadata;
  structural_data: StructuralScan;
  dynamic_state: DynamicStateSnapshot;
  timing: ScanTimingProtocol;
  destructiveness: DestructivenessAssessment;
  validation_checksums: Map<string, string>;
}

// ── Data Scale Estimates ────────────────────────────────────────────────────

export interface DataScaleEstimate {
  fidelity: FidelityLevel;
  voxelSize_nm: number;
  /** Raw data in bytes for a human brain (~1400 cm³) */
  rawDataBytes: number;
  /** Estimated compressed/segmented size in bytes */
  compressedDataBytes: number;
  /** Whether full storage is practical */
  practical: boolean;
}

/** Pre-computed scale estimates from the architecture document */
export const DATA_SCALE_ESTIMATES: DataScaleEstimate[] = [
  {
    fidelity: "connectome",
    voxelSize_nm: 1000,
    rawDataBytes: 1.5e15,         // ~1.5 PB
    compressedDataBytes: 1e14,    // ~100 TB
    practical: true,
  },
  {
    fidelity: "cellular",
    voxelSize_nm: 100,
    rawDataBytes: 1.5e18,         // ~1.5 EB
    compressedDataBytes: 1e17,    // ~100 PB
    practical: true,
  },
  {
    fidelity: "molecular",
    voxelSize_nm: 1,
    rawDataBytes: 1.5e21,         // ~1.5 ZB
    compressedDataBytes: NaN,     // impractical without hierarchical LOD
    practical: false,
  },
];
