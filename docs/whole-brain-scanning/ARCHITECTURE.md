# Whole-Brain Scanning — Architecture

## Overview

This document defines the architecture for scanning a complete biological brain at the resolution specified by 0.2.2.1.1 (Emulation Fidelity Requirements), capturing both structural and dynamic state data in a format consumable by the simulation pipeline (0.2.2.1.3).

## Dependency: Fidelity Level

All scanning parameters derive from the **L2+ cellular fidelity** selected by 0.2.2.1.1. The required output captures individual neuron morphology, synaptic connectivity and weights, receptor distributions, glial topology, an abstracted neuromodulatory baseline, and pre-fixation activity. Full molecular reconstruction and quantum-state capture are outside this card's scope.

| Fidelity Level | Spatial Resolution | Key Data Captured |
|---|---|---|
| Connectome | ~1 µm | Neuron positions, axon/dendrite paths, synaptic contacts |
| Cellular | ~100 nm | Neuron morphology, dendritic spines, glial contacts |
| Molecular | ~1 nm | Protein conformations, ion channel states, vesicle contents |
| Quantum | sub-nm | Quantum state of microtubule subunits (if required) |

## System Components

### 1. Scanning Modality Pipeline

A multi-modal scanning approach is required because no single technology currently captures both structure and dynamics at sufficient resolution.

#### 1a. Structural Scanning Subsystem

**Purpose:** Capture the static connectome — neuron positions, morphology, and synaptic connectivity.

**Selected modalities:**
- **Primary:** Massively parallel serial block-face scanning electron microscopy (SBF-SEM) at approximately 30 nm isotropic resolution for morphology and connectivity.
- **Complementary:** Expansion microscopy with multiplexed fluorescence (ExM-IF) on registered, interleaved tissue blocks for receptor distributions.
- **Preservation:** Cryo-vitrification fixes the dynamic state before destructive structural acquisition.

**Interface:**
```
StructuralScan {
  modality: string                   // e.g. "SBF-SEM", "cryo-ET"
  resolution_nm: number              // isotropic voxel size
  volume_extent_mm3: number          // total scanned volume
  sections: SectionData[]            // ordered from anterior to posterior
}

SectionData {
  section_id: string
  thickness_nm: number
  image_stack: ImageVolume           // 3D voxel data
  segmentation: NeuronSegmentation   // computed post-acquisition
}
```

#### 1b. Dynamic State Capture Subsystem

**Purpose:** Capture a snapshot of the brain's dynamic state — synaptic weights, neurotransmitter concentrations, ion channel configurations, and ongoing activity — at a single timepoint.

**Candidate modalities:**
- **Synaptic weights:** Inferred from structural scanning (spine volume, synapse area, receptor density via immuno-EM)
- **Neurotransmitter levels:** Multiplexed fluorescence and calibrated pre-fixation measurements
- **Ion-channel effects:** Represented by the L2+ stochastic-noise abstraction rather than molecular reconstruction
- **Activity snapshot:** High-density electrophysiology immediately before fixation

**Interface:**
```
DynamicStateSnapshot {
  timestamp_relative_to_fixation_ms: number
  activity_recording: ActivityData           // final moments of neural activity
  neurotransmitter_map: VolumetricConcentrationMap
  synaptic_weight_estimates: SynapticWeightMap
  ion_channel_states: IonChannelStateMap     // if molecular fidelity required
}
```

### 2. Scan Coordination and Timing

**Problem:** The brain's state drifts during scanning. A scan that takes hours or days captures an inconsistent snapshot.

**Architecture:**
- **Rapid fixation protocol:** Flash-fixation (chemical or cryo) captures dynamic state at a defined instant (t₀). All structural scanning then proceeds on the fixed tissue at leisure.
- **Pre-fixation activity recording:** High-density electrodes or calcium imaging record neural dynamics for a window before fixation, providing initialization data for the simulator.
- **Drift error budget:** Define maximum allowable temporal inconsistency (ε_drift) as a function of fidelity level. Fixation must complete within ε_drift.

**Interface:**
```
ScanTimingProtocol {
  fixation_method: "cryo-vitrification" | "aldehyde-perfusion" | "hybrid"
  fixation_completion_time_ms: number        // must be < epsilon_drift
  pre_fixation_recording_duration_s: number  // activity window captured alive
  epsilon_drift_ms: number                   // max tolerable state drift
}
```

**Destructiveness decision:** The selected SBF-SEM pipeline is destructive because no demonstrated non-destructive modality resolves synapses across a whole brain at the required fidelity. ExM with optical clearing is the minimally destructive alternative, but it is complementary rather than sufficient for connectivity ground truth. Every dataset records this justification, the preservation protocol, and the alternative considered.

```
DestructivenessAssessment {
  is_nondestructive: boolean
  destruction_justification: string | null    // formal argument if destructive
  preservation_protocol: string               // how original is handled
  minimal_alternative: string | null          // least-destructive option explored
}
```

### 3. Data Acquisition and Storage Pipeline

**Problem:** A molecular-resolution scan of a human brain produces on the order of exabytes of raw data.

**Scale estimates:**
| Fidelity | Voxel size | Raw data (human brain) | Segmented/compressed |
|---|---|---|---|
| Connectome (~1 µm) | ~1 µm³ | ~1.5 PB | ~100 TB |
| Cellular (~100 nm) | ~(100 nm)³ | ~1.5 EB | ~100 PB |
| Molecular (~1 nm) | ~(1 nm)³ | ~1.5 ZB | impractical without hierarchical LOD |

**Architecture:**
- **Streaming acquisition:** Data flows from scanner → local buffer → segmentation pipeline → compressed representation. Raw data is not stored beyond local buffer.
- **Hierarchical Level-of-Detail (LOD):** Store full resolution only where needed (synapses, active zones); use coarser representation for bulk neuropil.
- **Schema:** Output in a documented, versioned format compatible with 0.2.2.1.3 simulation pipeline.

**Interface:**
```
BrainScanDataset {
  schema_version: string
  fidelity_level: "connectome" | "cellular" | "molecular"
  subject_metadata: SubjectMetadata
  structural_data: StructuralScan
  dynamic_state: DynamicStateSnapshot
  timing: ScanTimingProtocol
  destructiveness: DestructivenessAssessment
  validation_checksums: Map<region_id, checksum>
}

SubjectMetadata {
  species: string
  brain_volume_cm3: number
  neuron_count_estimate: number
  synapse_count_estimate: number
  age_at_scan: string
  health_status: string
}
```

### 4. Validation Subsystem

**Purpose:** Verify scan accuracy against independent ground-truth measurements.

**Approach:**
- **Cross-modality validation:** Compare structural results from primary modality against a secondary modality on sample regions (e.g., compare SBF-SEM reconstruction with confocal fluorescence tracing of the same neurons)
- **Known-circuit benchmarks:** Scan brain regions with well-characterized circuits (e.g., cerebellar cortex) and verify that reconstructed connectivity matches published literature
- **Quantitative metrics:**
  - Neuron detection rate (sensitivity/specificity)
  - Synapse detection accuracy
  - Synaptic weight estimation error vs. electrophysiological ground truth
  - Spatial registration error across sections

```
ValidationReport {
  cross_modality_agreement: PercentageByRegion
  known_circuit_accuracy: CircuitBenchmarkResult[]
  neuron_detection: { sensitivity: number, specificity: number }
  synapse_detection: { sensitivity: number, specificity: number }
  weight_estimation_error: StatisticalSummary
  registration_error_nm: StatisticalSummary
  overall_pass: boolean
}
```

## Output Contract

The final deliverable of the scanning pipeline is a `BrainScanDataset` object (serialized to a documented on-disk format) that:
1. Contains complete structural and dynamic data at the fidelity specified by 0.2.2.1.1
2. Passes the `ValidationReport` with `overall_pass: true`
3. Is directly consumable by 0.2.2.1.3 (Neural Simulation) as initialization input
4. Includes full provenance metadata for reproducibility

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Required fidelity is molecular or quantum | Data volume becomes impractical | Hierarchical LOD; scan only critical structures at full resolution |
| Non-destructive scanning impossible at required fidelity | Ethical and practical constraints | Document formal proof; specify minimally-destructive protocol with informed consent framework |
| Fixation introduces artifacts | Dynamic state data is inaccurate | Cross-validate with pre-fixation recordings; characterize and correct for known fixation artifacts |
| Scan duration exceeds drift budget | Inconsistent state capture | Improve fixation speed; accept and model temporal uncertainty |
| Data pipeline cannot keep up with acquisition | Bottleneck or data loss | Streaming architecture with backpressure; parallel segmentation |

## Files Produced by This Card

- `docs/whole-brain-scanning/ARCHITECTURE.md` — this document
- `src/whole-brain-scanning/types.ts` — dataset and scanning-domain contracts
- `src/whole-brain-scanning/constants.ts` — injectable threshold registry
- `src/whole-brain-scanning/validation.ts` — dataset, timing, resolution, and accuracy validation
- `src/whole-brain-scanning/serialization.ts` — HDF5 schema mapping and serialization-readiness contract
