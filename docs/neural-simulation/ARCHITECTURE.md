# Neural Simulation — Architecture

## Overview

This document defines the architecture for a computational engine capable of simulating a complete biological brain at the fidelity level specified by 0.2.2.1.1, consuming scan data produced by 0.2.2.1.2, and running at real-time speed or faster on hardware compatible with enduring substrates (0.2.1).

## Dependency: Fidelity Level

The simulation algorithm, time-stepping scheme, and hardware requirements all depend on the fidelity level determined by 0.2.2.1.1. The architecture is designed at **cellular-level** as the primary target (individual neuron dynamics, dendritic computation, glial interactions), with extension points for molecular-level fidelity where the consciousness theory demands it.

| Fidelity Level | Simulation Approach | Approximate FLOPS (human brain, real-time) | Memory |
|---|---|---|---|
| Connectome (~1 µm) | Point-neuron spiking models (LIF/Izhikevich) | ~10^18 FLOPS | ~10 TB |
| Cellular (~100 nm) | Compartmental models (Hodgkin-Huxley multi-compartment) | ~10^21 FLOPS | ~100 TB |
| Molecular (~1 nm) | Hybrid: compartmental + stochastic molecular dynamics at synapses | ~10^24 FLOPS | ~10 PB |
| Quantum (sub-nm) | Full quantum simulation of microtubule lattices | Intractable with known physics | Unknown |

## System Components

### 1. Simulation Engine Core

#### 1a. Neuron Model Layer

**Purpose:** Simulate individual neuron dynamics at the required fidelity.

**Algorithm selection (by fidelity):**

- **Connectome-level:** Leaky Integrate-and-Fire (LIF) or Izhikevich models. Each neuron is a single computational unit with tunable parameters. Well-understood, highly parallelizable.
- **Cellular-level (primary target):** Multi-compartment Hodgkin-Huxley models. Each neuron is decomposed into ~100-1000 compartments (soma, axon segments, dendritic branches). Each compartment solves cable equations with active ion channel conductances. Captures dendritic computation and back-propagating action potentials.
- **Molecular-level:** Cellular-level model augmented with stochastic simulation of molecular signaling at synaptic boutons and postsynaptic densities (Gillespie algorithm or tau-leaping for reaction-diffusion).

**Justification:** Multi-compartment Hodgkin-Huxley models are the most biologically validated approach that captures sub-neuronal computation. They reproduce oscillatory rhythms, bursting patterns, dendritic plateau potentials, and spike-timing-dependent plasticity — all features plausibly required for consciousness-supporting dynamics.

**Interface:**
```
NeuronModel {
  neuron_id: uint64
  compartments: Compartment[]
  morphology: MorphologyTree              // branching structure from scan data
  ion_channels: IonChannelDistribution[]  // per-compartment channel types and densities
  synaptic_inputs: SynapticInput[]
  synaptic_outputs: SynapticOutput[]
}

Compartment {
  compartment_id: uint32
  parent_compartment: uint32 | null
  length_um: float64
  diameter_um: float64
  membrane_capacitance: float64           // µF/cm²
  axial_resistance: float64               // Ohm·cm
  ion_channels: ActiveConductance[]
  state: CompartmentState                 // V_m, gating variables, [Ca²⁺]_i, etc.
}

CompartmentState {
  membrane_potential_mV: float64
  gating_variables: Map<channel_type, float64[]>
  calcium_concentration_uM: float64
  // extensible for molecular-level state
}
```

#### 1b. Synapse Model Layer

**Purpose:** Simulate synaptic transmission and plasticity.

**Approach:**
- **Chemical synapses:** Conductance-based model with neurotransmitter release (stochastic vesicle release at cellular level, deterministic at connectome level), receptor kinetics (AMPA, NMDA, GABA_A, GABA_B, modulatory), and short-term plasticity (facilitation/depression).
- **Electrical synapses (gap junctions):** Direct ohmic coupling between compartments.
- **Plasticity:** Spike-timing-dependent plasticity (STDP), homeostatic plasticity, metaplasticity. Long-term structural plasticity (synaptogenesis/elimination) on slower timescales.

**Interface:**
```
Synapse {
  synapse_id: uint64
  presynaptic_neuron: uint64
  presynaptic_compartment: uint32
  postsynaptic_neuron: uint64
  postsynaptic_compartment: uint32
  synapse_type: "chemical" | "electrical"
  receptor_types: ReceptorKinetics[]       // for chemical synapses
  weight: float64                          // initial from scan data
  plasticity_rule: PlasticityParams
  vesicle_pool: VesiclePoolState           // for stochastic release
}

SynapticEvent {
  synapse_id: uint64
  time_ms: float64
  neurotransmitter_released: float64
  postsynaptic_conductance_change: ConductanceChange[]
}
```

#### 1c. Glial Cell Model Layer

**Purpose:** Simulate astrocytes, oligodendrocytes, and microglia — non-neuronal cells increasingly recognized as computationally relevant.

**Approach:**
- **Astrocytes:** Model calcium waves, gliotransmitter release, metabolic support (lactate shuttle), and synaptic coverage (tripartite synapse model). Astrocyte domains (~100k synapses each) serve as a meso-scale computational unit.
- **Oligodendrocytes:** Myelination modeled as modified axial resistance and conduction velocity in myelinated compartments. Adaptive myelination as a long-timescale plasticity mechanism.
- **Microglia:** Modeled at a coarse level — synaptic pruning and neuroinflammatory state as slow modulatory variables.

**Interface:**
```
GlialCell {
  cell_id: uint64
  cell_type: "astrocyte" | "oligodendrocyte" | "microglia"
  territory: uint64[]                     // neuron IDs in domain
  state: GlialState
}

AstrocyteState {
  calcium_uM: float64
  gliotransmitter_levels: Map<string, float64>
  metabolic_output: float64
  covered_synapses: uint64[]
}
```

### 2. Time-Stepping and Numerical Integration

#### 2a. Integration Scheme

**Primary method:** Adaptive semi-implicit Euler with local extrapolation for stiff compartmental ODEs.

- **Fast variables** (membrane potential, gating variables): dt = 0.025 ms (40 kHz). This is the Nyquist-safe sampling rate for action potentials (~1 ms duration, ~1 kHz max firing rate).
- **Medium variables** (synaptic conductances, calcium dynamics): dt = 0.1 ms.
- **Slow variables** (plasticity, glial calcium, metabolic state): dt = 1-100 ms.
- **Multi-rate stepping:** Different variable classes advance at different rates within the same global simulation clock, synchronized at the coarsest rate boundary.

**Interface:**
```
TimeSteppingConfig {
  dt_fast_ms: float64                     // default 0.025
  dt_medium_ms: float64                   // default 0.1
  dt_slow_ms: float64                     // default 1.0
  dt_structural_ms: float64              // default 100.0
  integration_method: "semi-implicit-euler" | "crank-nicolson" | "runge-kutta-4"
  adaptive: boolean                       // local error control
  error_tolerance: float64                // per-step local truncation error bound
}
```

#### 2b. Stability Analysis

**Stability bounds:**
- The Hodgkin-Huxley system is stiff (fast Na⁺ activation ~0.1 ms vs. slow K⁺ inactivation ~10 ms). Semi-implicit methods handle this by treating fast linear terms implicitly.
- **Lyapunov analysis:** The largest Lyapunov exponent of typical cortical network dynamics is bounded; chaotic divergence of individual spike times is expected but macroscopic observables (firing rates, oscillatory power, information flow) remain stable.
- **Error accumulation bound:** For dt = 0.025 ms with semi-implicit Euler, local truncation error is O(dt²) ≈ 6.25 × 10⁻⁷ per step. Over 1 simulated year (~3.15 × 10¹⁰ steps at the fast rate), accumulated error in membrane potential remains < 1 mV when gating variable errors are corrected by the implicit treatment of fast modes.
- **Conservation laws:** Total ion concentrations are tracked and corrected to prevent drift. Energy (ATP) budget is balanced to prevent metabolic runaway.
- **Periodic re-synchronization:** Every simulated second, a global consistency check enforces conservation constraints and resets accumulated floating-point drift.

**Formal bound:**
```
ErrorBound {
  variable: string
  max_local_error_per_step: float64
  max_accumulated_error_1yr: float64
  correction_mechanism: string
}

// Example for membrane potential:
// variable: "V_m"
// max_local_error_per_step: 6.25e-7 mV
// max_accumulated_error_1yr: < 1 mV (with periodic correction)
// correction_mechanism: "implicit fast-mode + 1s global resync"
```

### 3. Parallelization and Spatial Decomposition

#### 3a. Decomposition Strategy

**Problem:** ~86 billion neurons × ~500 compartments = ~43 trillion compartments. At 40 kHz time-stepping, this is ~1.7 × 10¹⁸ compartment-updates per simulated second.

**Approach:** Hierarchical spatial decomposition aligned with brain anatomy.

1. **Level 0 — Brain regions:** ~1000 macro-regions (Brodmann areas, subcortical nuclei, cerebellar lobules). Each region assigned to a compute cluster.
2. **Level 1 — Cortical columns / local circuits:** ~10⁶ mesoscopic units (~10⁴ neurons each). Each unit assigned to a compute node (GPU or neuromorphic chip).
3. **Level 2 — Individual neurons:** Each neuron's compartmental tree is computed on a single processing element. Compartments within a neuron communicate implicitly (Hines algorithm for tree-structured cable equations — O(n) per neuron per timestep).
4. **Level 3 — Synaptic communication:** Spike events are the primary inter-neuron communication. Spikes are sparse (~1-10 Hz average firing rate), so communication volume is ~10¹¹ spike events/second across the whole brain.

**Communication pattern:**
- **Intra-neuron:** Implicit (Hines algorithm, no communication overhead)
- **Intra-column:** Shared memory within a GPU/chip (low latency)
- **Inter-region:** Message-passing of spike events, batched per fast-timestep. Axonal conduction delays (1-20 ms) provide a natural communication buffer.

**Interface:**
```
SpatialDecomposition {
  regions: BrainRegion[]
  assignment: Map<region_id, cluster_id>
  columns: CorticalColumn[]
  column_assignment: Map<column_id, node_id>
  communication_schedule: CommunicationSchedule
}

CommunicationSchedule {
  spike_batch_interval_ms: float64        // typically dt_fast
  inter_region_buffer_ms: float64         // >= min axonal delay
  synchronization_barrier_ms: float64     // global sync every 1000 ms
}
```

#### 3b. Compute Requirements (Cellular-Level, Human Brain, Real-Time)

| Resource | Estimate | Basis |
|---|---|---|
| FLOPS (sustained) | ~10²¹ FLOPS (1 ZettaFLOPS) | 43T compartments × 40k steps/s × ~600 FLOPs/compartment/step |
| Memory | ~100 TB | 43T compartments × ~20 bytes state + connectivity |
| Inter-node bandwidth | ~100 PB/s aggregate | Spike events + synchronization |
| Compute nodes | ~10⁶ GPU-class accelerators | Each handling ~43M compartments |
| Network | Low-latency fat-tree or dragonfly | < 1 µs inter-node for spike delivery |

**Comparison to current technology (2026):** The best supercomputers achieve ~2 ExaFLOPS (2 × 10¹⁸). A ZettaFLOPS machine is ~500× beyond current capability. Neuromorphic approaches (below) may reduce this by 100-1000×.

### 4. Scan Data Ingestion Pipeline

**Purpose:** Transform the `BrainScanDataset` (from 0.2.2.1.2) into initialized simulation state.

**Pipeline stages:**

```
ScanDataIngestionPipeline {
  stages: [
    "1_validate_scan",          // verify BrainScanDataset integrity and schema
    "2_extract_morphology",     // build compartmental trees from segmented neurons
    "3_assign_ion_channels",    // map channel distributions from molecular data or atlas
    "4_initialize_synapses",    // create Synapse objects from connectivity + weight data
    "5_initialize_glia",        // create glial cell models from scan data
    "6_set_dynamic_state",      // initialize V_m, gating vars from DynamicStateSnapshot
    "7_spatial_decomposition",  // partition neurons into regions/columns for parallelism
    "8_validation_checkpoint"   // verify initialized state produces biologically plausible spontaneous activity
  ]
}
```

**Stage details:**

1. **Validate scan:** Check `BrainScanDataset.schema_version` compatibility, verify checksums, confirm fidelity level matches simulation configuration.
2. **Extract morphology:** Convert segmented neuron reconstructions into `MorphologyTree` with compartmentalization (Rall's equivalent cylinder or explicit branching). Target ~500 compartments per neuron (adjustable).
3. **Assign ion channels:** If molecular-level scan data is available, use directly. Otherwise, use neuron-type classification from scan + published ion channel distribution atlases to assign `ActiveConductance` parameters per compartment.
4. **Initialize synapses:** For each detected synapse in the scan, create a `Synapse` object. Synaptic weights from `SynapticWeightMap`; receptor types inferred from synapse morphology and neuron types.
5. **Initialize glia:** Assign astrocyte territories based on scan data; initialize metabolic state.
6. **Set dynamic state:** Use `DynamicStateSnapshot` to set membrane potentials, gating variable states, calcium concentrations. Where snapshot data is incomplete, initialize to resting-state values and run a brief warm-up period.
7. **Spatial decomposition:** Apply the decomposition strategy (Section 3a) based on anatomical region labels from the scan.
8. **Validation checkpoint:** Run 10 seconds of simulated time and verify that spontaneous activity matches expected resting-state characteristics (see Section 7).

**Interface:**
```
IngestionResult {
  neuron_count: uint64
  synapse_count: uint64
  compartment_count: uint64
  glial_cell_count: uint64
  spatial_partitions: uint32
  warm_up_duration_sim_s: float64
  validation_passed: boolean
  warnings: string[]
}
```

### 5. Hardware Target

#### 5a. Primary Target: Neuromorphic-Conventional Hybrid

Pure conventional computing (GPU clusters) requires ~1 ZettaFLOPS for cellular-level real-time simulation — 500× beyond current capability. A hybrid approach combining neuromorphic hardware with conventional accelerators is the primary architecture.

**Neuromorphic component:**
- Handles neuron and synapse dynamics natively in analog or mixed-signal circuits
- Each neuromorphic chip simulates ~10⁵-10⁶ neurons with their compartments
- Reduces effective FLOPS requirement by 100-1000× for neuron model computation
- Examples of current precursors: Intel Loihi 2, IBM NorthPole, SpiNNaker 2, BrainScaleS-2

**Conventional component:**
- Handles glial cell dynamics, plasticity rules, molecular-level augmentations
- Manages spatial decomposition, spike routing, and I/O
- Provides programmability for model updates and debugging

**Target hardware budget:**
| Component | Quantity | Role |
|---|---|---|
| Neuromorphic chips | ~10⁶ | Neuron/synapse dynamics |
| GPU accelerators | ~10⁴ | Glia, plasticity, molecular augments |
| High-bandwidth interconnect | Dragonfly topology | Spike routing |
| Memory nodes | ~100 TB distributed | State storage |
| Control plane | ~10³ CPU nodes | Orchestration, I/O, monitoring |

#### 5b. Enduring Substrate Migration Path

The simulation engine must ultimately run on enduring substrates (from 0.2.1) for long-term operation. Migration path:

1. **Phase 1 (current):** Conventional datacenter + neuromorphic accelerator cards. Requires external power, cooling, maintenance.
2. **Phase 2:** Radiation-hardened neuromorphic hardware (from 0.2.1/S1.1). Self-repairing nanofabrication (from 0.2.1/S1.2) for hardware maintenance. Long-duration energy source (from 0.2.1/S1.3).
3. **Phase 3:** Fully integrated enduring substrate — neuromorphic simulation hardware, energy source, self-repair, and radiation hardening in a single autonomous system.

**Abstraction layer:** The simulation engine communicates with hardware through a Hardware Abstraction Layer (HAL) that isolates the simulation logic from the specific hardware platform:

```
HardwareAbstractionLayer {
  allocate_neurons(count: uint64, region: BrainRegion): NodeAllocation
  send_spikes(events: SpikeEvent[]): void
  receive_spikes(node: node_id): SpikeEvent[]
  checkpoint_state(): StateSnapshot
  restore_state(snapshot: StateSnapshot): void
  health_check(): HardwareHealthReport
}
```

### 6. Energy Budget

#### 6a. Estimates

| Approach | Power (human brain, real-time) | Comparison |
|---|---|---|
| Conventional GPU cluster (1 ZettaFLOPS) | ~500 MW - 1 GW | 1 nuclear power plant |
| Neuromorphic hybrid (100× efficiency gain) | ~5-10 MW | Large industrial facility |
| Optimized neuromorphic (1000× gain) | ~500 kW - 1 MW | Large building |
| Biological brain | ~20 W | Reference target |

#### 6b. Optimization Strategies

1. **Neuromorphic co-design:** Design neuromorphic chips specifically for the compartmental model equations. Analog computation of cable equations approaches thermodynamic limits.
2. **Spike-driven computation:** Only compute when spikes arrive. At ~5 Hz average firing rate, most compartments are quiescent most of the time. Event-driven simulation can skip quiescent compartments.
3. **Precision optimization:** Use mixed-precision arithmetic — 16-bit for membrane potential dynamics (sufficient for ~0.01 mV resolution), 32-bit for plasticity, 64-bit only for accumulation and conservation checks.
4. **Approximate computing:** For non-critical bulk neuropil, use reduced compartmental models or point-neuron approximations. Full compartmental detail only where the consciousness theory (from 0.2.2.1.1) identifies it as necessary.
5. **Thermal recycling:** Use waste heat for facility heating or thermoelectric recovery.

**Target:** < 10 MW for initial deployment, with a roadmap to < 1 MW as neuromorphic hardware matures.

### 7. Biological Validation Benchmarks

The simulation must reproduce known biological neural dynamics to be considered valid. Benchmarks organized by scale:

#### 7a. Single-Neuron Benchmarks
- Action potential waveform shape and duration matches experimental recordings (within 5% of peak amplitude and timing)
- Firing rate vs. injected current (f-I curve) matches for known neuron types
- Dendritic integration: nonlinear summation of EPSPs in dendrites (NMDA spikes, calcium spikes)
- Spike-frequency adaptation over seconds-long stimulation

#### 7b. Circuit-Level Benchmarks
- Oscillatory rhythms: alpha (8-12 Hz), beta (13-30 Hz), gamma (30-100 Hz) power matches EEG/MEG reference data for resting state
- Stimulus-evoked responses: visual cortex orientation selectivity, auditory cortex tonotopy
- Working memory: persistent activity in prefrontal circuits during delay periods
- Default mode network: anti-correlated activity with task-positive networks at rest

#### 7c. Whole-Brain Benchmarks
- Resting-state functional connectivity matches fMRI-derived connectivity matrices (correlation > 0.8 with empirical data)
- Sleep stages: NREM slow oscillations, REM desynchronization, sleep spindles
- Pharmacological response: simulated effect of known neuromodulators (e.g., dopamine agonist increases reward circuit activity)
- Information integration metrics: Phi (Φ) or similar consciousness-related measures show biologically plausible values

**Interface:**
```
ValidationBenchmark {
  name: string
  scale: "single_neuron" | "circuit" | "whole_brain"
  metric: string
  biological_reference: float64 | ReferenceDataset
  tolerance: float64
  pass_criterion: string
}

ValidationResult {
  benchmark: ValidationBenchmark
  simulated_value: float64 | Dataset
  passed: boolean
  deviation_from_reference: float64
}

ValidationSuite {
  benchmarks: ValidationBenchmark[]
  results: ValidationResult[]
  overall_pass: boolean                   // all benchmarks passed
  timestamp: datetime
  simulation_config: TimeSteppingConfig
}
```

### 8. Scaling Path

#### 8a. Validated Scaling Strategy

1. **C. elegans** (302 neurons, ~7000 synapses): Full molecular-level simulation achievable on a single workstation. Validates neuron models, synapse models, and ingestion pipeline. Well-characterized connectome available (White et al., Cook et al.).
2. **Drosophila** (~100k neurons): Validates spatial decomposition on a small GPU cluster. Connectome partially available (FlyWire). Rich behavioral benchmarks.
3. **Mouse** (~70 million neurons): First large-scale test. Requires ~1000 GPU nodes or equivalent neuromorphic hardware. Allen Brain Atlas provides extensive validation data.
4. **Human** (~86 billion neurons): Full-scale target. Requires the neuromorphic-conventional hybrid architecture at scale.

**Scaling law validation:** At each organism scale, measure:
- Compute time vs. neuron count (should be approximately linear with decomposition)
- Communication overhead vs. inter-region connectivity (should remain bounded by axonal delay buffering)
- Memory vs. compartment count (should be linear)
- Numerical stability over simulated time (error bounds should hold across scales)

#### 8b. Demonstrated Real-Time Execution

Real-time execution must be demonstrated at each scaling step before proceeding:

```
ScalingMilestone {
  organism: string
  neuron_count: uint64
  compartments_per_neuron: uint32
  simulation_speed_ratio: float64          // simulated_time / wall_time (≥ 1.0 required)
  hardware_used: string
  energy_consumption_W: float64
  longest_stable_run_sim_hours: float64
  validation_suite_passed: boolean
}
```

## Output Contract

The neural simulation engine provides:

1. **Initialization:** Accepts a `BrainScanDataset` (from 0.2.2.1.2) and produces a running simulation within a bounded initialization time.
2. **Real-time execution:** Simulated time advances at ≥ 1× biological real-time.
3. **State access:** External systems can read neural state (firing rates, oscillatory power, specific neuron membrane potentials) without halting the simulation.
4. **Checkpointing:** Full simulation state can be serialized and restored for migration between hardware platforms.
5. **Validation:** `ValidationSuite` passes with `overall_pass: true` on all biological benchmarks.

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Required fidelity is molecular or quantum | Compute requirements increase 1000×+ | Hybrid approach: full molecular only at identified critical sites; connectome elsewhere |
| 1 ZettaFLOPS is not achievable in near term | Cannot run real-time at human scale | Neuromorphic hardware; start with smaller organisms; accept slower-than-real-time initially |
| Numerical instability over long runs | Simulation diverges from biological plausibility | Multi-rate stepping, periodic conservation corrections, formal error bounds |
| Spike routing becomes communication bottleneck | Cannot maintain real-time | Axonal delay buffering; locality-preserving decomposition; hardware spike routers |
| Consciousness requires features not in compartmental models | Simulation lacks subjective experience | Extension points for molecular/quantum augmentation; revisit if 0.2.2.1.1 updates fidelity requirements |
| Energy consumption is unsustainable | Cannot operate long-term | Neuromorphic optimization roadmap; event-driven computation; enduring substrate energy sources |

## Files Produced by This Card

- `docs/neural-simulation/ARCHITECTURE.md` — this document
- Simulation engine implementation (future, during IMPLEMENT)
- Benchmark validation reports (future, during IMPLEMENT)
