/**
 * Neural Simulation — Core Type Definitions
 *
 * Types and interfaces for the neural simulation engine defined in
 * docs/neural-simulation/ARCHITECTURE.md
 *
 * Implements card 0.2.2.1.3: computational infrastructure for simulating
 * a complete biological brain at L2+ fidelity in real-time or faster.
 *
 * Decision: O4 — Multi-compartment Hodgkin-Huxley with event-driven optimization
 * Decision: O3 — Neuromorphic-conventional hybrid with HAL
 * Decision: O3 — Multi-rate semi-implicit Euler with 4 rate tiers
 */

import type {
  BrainScanDataset,
  FidelityLevel,
  SynapticWeightMap,
  DynamicStateSnapshot,
} from "../whole-brain-scanning/types.js";

// Re-export upstream types consumed by this module
export type { BrainScanDataset, FidelityLevel };

// ── Neuron Model (Decision: O4 Multi-compartment HH) ───────────────────────

/**
 * Active ion channel conductance on a compartment.
 * Per ARCHITECTURE.md Section 1a and Contracts: Scan Data Ingestion
 * postcondition 3 (valid morphology trees with ion channel distributions).
 */
export interface ActiveConductance {
  /** Ion channel type (e.g. "Na_transient", "K_delayed_rectifier", "Ca_L") */
  readonly channelType: string;
  /** Maximum conductance in mS/cm² */
  readonly maxConductance_mS_per_cm2: number;
  /** Reversal potential in mV */
  readonly reversalPotential_mV: number;
  /** Gating variable names for this channel (e.g. ["m", "h"] for Na) */
  readonly gatingVariables: readonly string[];
}

/**
 * Dynamic state of a single compartment.
 * Per ARCHITECTURE.md CompartmentState interface.
 * Invariant: membrane_potential_mV in [-90, +40] at initialization.
 */
export interface CompartmentState {
  /** Membrane potential in mV */
  membrane_potential_mV: number;
  /** Gating variable values keyed by channel type, then variable name */
  gating_variables: Map<string, number[]>;
  /** Intracellular calcium concentration in µM */
  calcium_concentration_uM: number;
}

/**
 * A single compartment within a multi-compartment neuron model.
 * Per ARCHITECTURE.md Compartment interface and Contracts postcondition 3:
 * every neuron has >= compartments_per_neuron_min (5) compartments.
 */
export interface Compartment {
  /** Unique compartment ID within this neuron */
  readonly compartment_id: number;
  /** Parent compartment ID (null for soma / root) */
  readonly parent_compartment: number | null;
  /** Length of this compartment in µm */
  readonly length_um: number;
  /** Diameter of this compartment in µm */
  readonly diameter_um: number;
  /** Membrane capacitance in µF/cm² */
  readonly membrane_capacitance: number;
  /** Axial resistance in Ohm·cm */
  readonly axial_resistance: number;
  /** Active ion channel conductances on this compartment */
  readonly ion_channels: readonly ActiveConductance[];
  /** Current dynamic state */
  state: CompartmentState;
}

/**
 * Receptor kinetics parameters for a synapse type.
 * Per ARCHITECTURE.md Section 1b (AMPA, NMDA, GABA_A, GABA_B, modulatory).
 */
export interface ReceptorKinetics {
  /** Receptor type identifier */
  readonly receptorType: string;
  /** Rise time constant in ms */
  readonly tau_rise_ms: number;
  /** Decay time constant in ms */
  readonly tau_decay_ms: number;
  /** Peak conductance in nS */
  readonly peak_conductance_nS: number;
  /** Reversal potential in mV */
  readonly reversal_mV: number;
}

/**
 * Plasticity rule parameters.
 * Per ARCHITECTURE.md Section 1b (STDP, homeostatic, metaplasticity).
 */
export interface PlasticityParams {
  /** Plasticity rule type */
  readonly rule: "STDP" | "homeostatic" | "metaplasticity" | "none";
  /** Learning rate */
  readonly learningRate: number;
  /** STDP time window in ms (positive for potentiation window) */
  readonly stdpWindow_ms: number;
  /** Weight bounds [min, max] */
  readonly weightBounds: readonly [number, number];
}

/**
 * Vesicle pool state for stochastic release.
 * Per ARCHITECTURE.md Section 1b (stochastic vesicle release at cellular level).
 */
export interface VesiclePoolState {
  /** Number of readily-releasable vesicles */
  readilyReleasable: number;
  /** Number of recycling vesicles */
  recycling: number;
  /** Release probability per spike */
  releaseProbability: number;
}

/**
 * A synapse connecting two compartments on two neurons.
 * Per ARCHITECTURE.md Synapse interface and Contracts: Scan Data Ingestion
 * postcondition 4 (valid pre/post pair, receptor type, initial weight).
 * Invariant: no synapse references a nonexistent neuron or compartment.
 */
export interface Synapse {
  readonly synapse_id: string;
  readonly presynaptic_neuron: string;
  readonly presynaptic_compartment: number;
  readonly postsynaptic_neuron: string;
  readonly postsynaptic_compartment: number;
  readonly synapse_type: "chemical" | "electrical";
  readonly receptor_types: readonly ReceptorKinetics[];
  weight: number;
  readonly plasticity_rule: PlasticityParams;
  vesicle_pool: VesiclePoolState;
}

/**
 * Complete multi-compartment Hodgkin-Huxley neuron model.
 * Per ARCHITECTURE.md NeuronModel interface and Decision O4.
 */
export interface NeuronModel {
  readonly neuron_id: string;
  /** Brain region this neuron belongs to */
  readonly region_id: string;
  /** Neuron type classification (e.g. "pyramidal", "interneuron", "Purkinje") */
  readonly neuron_type: string;
  /** Compartments forming the morphology tree (minimum 5 per L2+ spec) */
  readonly compartments: readonly Compartment[];
  /** IDs of synapses where this neuron is presynaptic */
  readonly synaptic_output_ids: readonly string[];
  /** IDs of synapses where this neuron is postsynaptic */
  readonly synaptic_input_ids: readonly string[];
}

// ── Glial Cell Model ────────────────────────────────────────────────────────

/** Glial cell type. Per ARCHITECTURE.md Section 1c. */
export type GlialCellType = "astrocyte" | "oligodendrocyte" | "microglia";

/**
 * Astrocyte-specific state: calcium dynamics, gliotransmitter, metabolic output.
 * Per Decision O4 augmentation point 3 (tripartite synapse, calcium waves).
 */
export interface AstrocyteState {
  calcium_uM: number;
  gliotransmitter_levels: Map<string, number>;
  metabolic_output: number;
  covered_synapse_ids: readonly string[];
}

/**
 * Oligodendrocyte-specific state.
 * Per ARCHITECTURE.md Section 1c (myelination as modified axial resistance).
 */
export interface OligodendrocyteState {
  /** Neuron compartment IDs this oligodendrocyte myelinates */
  readonly myelinated_compartments: ReadonlyMap<string, readonly number[]>;
  /** Myelination thickness factor (affects conduction velocity) */
  myelination_factor: number;
}

/**
 * Microglia-specific state.
 * Per ARCHITECTURE.md Section 1c (synaptic pruning, neuroinflammatory state).
 */
export interface MicrogliaState {
  /** Activation level (0 = resting, 1 = fully activated) */
  activation_level: number;
  /** Synapse IDs targeted for pruning */
  pruning_targets: readonly string[];
}

/**
 * A glial cell model.
 * Per ARCHITECTURE.md GlialCell interface and Contracts: Scan Data Ingestion
 * postcondition 5 (dynamic state initialized from DynamicStateSnapshot).
 */
export interface GlialCell {
  readonly cell_id: string;
  readonly cell_type: GlialCellType;
  /** Neuron IDs in this cell's territory */
  readonly territory: readonly string[];
  /** Type-specific state */
  state: AstrocyteState | OligodendrocyteState | MicrogliaState;
}

// ── Time-Stepping (Decision: O3 Multi-rate semi-implicit Euler) ─────────────

/**
 * Integration method selection.
 * Decision O3 chose semi-implicit-euler; others kept as extension points.
 */
export type IntegrationMethod =
  | "semi-implicit-euler"
  | "crank-nicolson"
  | "runge-kutta-4";

/**
 * Multi-rate time-stepping configuration.
 * Per ARCHITECTURE.md TimeSteppingConfig and Decision: Time-Stepping Scheme.
 * All dt values from Threshold Registry.
 */
export interface TimeSteppingConfig {
  /** Fast time step for V_m and gating variables (default: 0.025 ms) */
  readonly dt_fast_ms: number;
  /** Medium time step for synaptic conductances and calcium (default: 0.1 ms) */
  readonly dt_medium_ms: number;
  /** Slow time step for plasticity and neuromodulation (default: 1.0 ms) */
  readonly dt_slow_ms: number;
  /** Structural plasticity time step (default: 100 ms) */
  readonly dt_structural_ms: number;
  /** Integration method — Decision O3: semi-implicit-euler */
  readonly integration_method: IntegrationMethod;
  /** Conservation correction interval in simulated ms (default: 1000) */
  readonly conservation_correction_interval_ms: number;
}

// ── Spatial Decomposition ───────────────────────────────────────────────────

/**
 * A brain region in the hierarchical spatial decomposition.
 * Per ARCHITECTURE.md Section 3a Level 0.
 */
export interface BrainRegion {
  readonly region_id: string;
  readonly name: string;
  readonly neuron_ids: readonly string[];
}

/**
 * A cortical column / local circuit unit.
 * Per ARCHITECTURE.md Section 3a Level 1.
 */
export interface CorticalColumn {
  readonly column_id: string;
  readonly region_id: string;
  readonly neuron_ids: readonly string[];
}

/**
 * Communication schedule for spike batching and synchronization.
 * Per ARCHITECTURE.md CommunicationSchedule.
 */
export interface CommunicationSchedule {
  /** Spike batch interval — typically dt_fast */
  readonly spike_batch_interval_ms: number;
  /** Inter-region buffer — must be >= min axonal delay */
  readonly inter_region_buffer_ms: number;
  /** Global sync barrier interval in ms */
  readonly synchronization_barrier_ms: number;
}

/**
 * Complete spatial decomposition of the simulation.
 * Per ARCHITECTURE.md SpatialDecomposition interface.
 * Invariant: total neuron count across all partitions equals neuron_count.
 * Invariant: every neuron assigned to exactly one partition.
 */
export interface SpatialDecomposition {
  readonly regions: readonly BrainRegion[];
  readonly region_to_cluster: ReadonlyMap<string, string>;
  readonly columns: readonly CorticalColumn[];
  readonly column_to_node: ReadonlyMap<string, string>;
  readonly communication_schedule: CommunicationSchedule;
}

// ── Ingestion Pipeline ──────────────────────────────────────────────────────

/**
 * Stages of the scan data ingestion pipeline.
 * Per ARCHITECTURE.md Section 4 and Behavioral Spec Scenario 1.
 */
export type IngestionStage =
  | "1_validate_scan"
  | "2_extract_morphology"
  | "3_assign_ion_channels"
  | "4_initialize_synapses"
  | "5_initialize_glia"
  | "6_set_dynamic_state"
  | "7_spatial_decomposition"
  | "8_validation_checkpoint";

/**
 * Result of the scan data ingestion pipeline.
 * Per ARCHITECTURE.md IngestionResult and Contracts: Scan Data Ingestion postconditions.
 */
export interface IngestionResult {
  readonly neuron_count: number;
  readonly synapse_count: number;
  readonly compartment_count: number;
  readonly glial_cell_count: number;
  readonly spatial_partitions: number;
  readonly warm_up_duration_sim_s: number;
  readonly validation_passed: boolean;
  readonly warnings: readonly string[];
  /** The neurons produced by ingestion */
  readonly neurons: readonly NeuronModel[];
  /** The synapses produced by ingestion */
  readonly synapses: readonly Synapse[];
  /** The glial cells produced by ingestion */
  readonly glial_cells: readonly GlialCell[];
  /** The spatial decomposition */
  readonly spatial_decomposition: SpatialDecomposition;
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Benchmark scale levels. Per ARCHITECTURE.md Section 7. */
export type BenchmarkScale = "single_neuron" | "circuit" | "whole_brain";

/**
 * A biological validation benchmark definition.
 * Per ARCHITECTURE.md ValidationBenchmark and Contracts: Validation Output postcondition 1.
 * Invariant: benchmark definitions are immutable once registered.
 */
export interface ValidationBenchmark {
  readonly name: string;
  readonly scale: BenchmarkScale;
  readonly metric: string;
  readonly biological_reference: number;
  readonly tolerance: number;
  readonly pass_criterion: string;
}

/**
 * Result of running a single validation benchmark.
 * Per ARCHITECTURE.md ValidationResult and Contracts: Validation Output postcondition 2.
 */
export interface ValidationResult {
  readonly benchmark: ValidationBenchmark;
  readonly simulated_value: number;
  readonly deviation_from_reference: number;
  readonly passed: boolean;
  /** ISO 8601 timestamp for reproducibility */
  readonly timestamp: string;
}

/**
 * Complete validation suite result.
 * Per ARCHITECTURE.md ValidationSuite and Contracts: Validation Output postconditions 3-4.
 * Postcondition: overall_pass is true iff ALL individual benchmarks pass.
 * Invariant: a passing suite at scale N is prerequisite for advancing to N+1.
 */
export interface ValidationSuite {
  readonly benchmarks: readonly ValidationBenchmark[];
  readonly results: readonly ValidationResult[];
  readonly overall_pass: boolean;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  readonly simulation_config: TimeSteppingConfig;
}

// ── Scaling Milestones ──────────────────────────────────────────────────────

/** Organism scale levels for the validated scaling path. */
export type OrganismScale = "c_elegans" | "drosophila" | "mouse" | "human";

/**
 * A scaling milestone record.
 * Per ARCHITECTURE.md ScalingMilestone and Behavioral Spec Scenario 3.
 * Invariant: scale N+1 may only be attempted after scale N passes all criteria.
 */
export interface ScalingMilestone {
  readonly organism: OrganismScale;
  readonly neuron_count: number;
  readonly compartments_per_neuron: number;
  /** Simulated time / wall time — must be >= 1.0 */
  readonly simulation_speed_ratio: number;
  readonly hardware_used: string;
  readonly energy_consumption_W: number;
  readonly longest_stable_run_sim_hours: number;
  readonly validation_suite_passed: boolean;
}

// ── Hardware Abstraction Layer (Decision: Neuromorphic-conventional hybrid) ─

/**
 * A spike event routed through the HAL.
 * Per ARCHITECTURE.md Section 5b and Contracts: HAL postconditions 2-3.
 * Invariant: spike ordering preserved within each source neuron.
 */
export interface SpikeEvent {
  readonly source_neuron_id: string;
  readonly target_neuron_id: string;
  readonly target_compartment_id: number;
  readonly time_ms: number;
  /** Axonal delay in ms */
  readonly delay_ms: number;
}

/**
 * Mapping of neurons to hardware nodes.
 * Per Contracts: HAL postcondition 1.
 */
export interface NodeAllocation {
  /** neuron_id -> hardware node_id */
  readonly allocation: ReadonlyMap<string, string>;
  readonly total_neurons: number;
  readonly total_nodes: number;
}

/**
 * Serializable simulation state snapshot.
 * Per Contracts: HAL postconditions 4 (checkpoint/restore idempotent).
 */
export interface StateSnapshot {
  readonly snapshot_id: string;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  readonly simulation_time_ms: number;
  readonly neuron_states: ReadonlyMap<string, readonly CompartmentState[]>;
  readonly synapse_weights: ReadonlyMap<string, number>;
  readonly glial_states: ReadonlyMap<string, AstrocyteState | OligodendrocyteState | MicrogliaState>;
}

/**
 * Hardware health report.
 * Per Contracts: HAL postcondition 5.
 */
export interface HardwareHealthReport {
  readonly healthy: boolean;
  readonly node_failures: readonly string[];
  readonly temperature_celsius: ReadonlyMap<string, number>;
  readonly power_consumption_W: number;
  readonly error_rate: number;
}

/**
 * Hardware Abstraction Layer interface.
 * Per ARCHITECTURE.md Section 5b and Contracts: HAL Interface.
 * Invariant: interface is identical across all hardware targets.
 *
 * Preconditions:
 * - Hardware platform is operational and passes health_check()
 * - Sufficient capacity exists for requested neuron allocation
 *
 * Postconditions:
 * - allocate_neurons() maps every neuron to a node
 * - send_spikes() delivers within axonal delay budget
 * - receive_spikes() returns all spikes in temporal order
 * - checkpoint/restore is idempotent and bitwise identical for deterministic components
 * - health_check() reports full hardware status
 *
 * Invariants:
 * - No spike lost in transit (guaranteed delivery)
 * - Spike ordering preserved within each source neuron
 * - checkpoint + restore is idempotent
 */
export interface HardwareAbstractionLayer {
  allocate_neurons(
    count: number,
    region: BrainRegion
  ): Promise<NodeAllocation>;

  send_spikes(events: readonly SpikeEvent[]): Promise<void>;

  receive_spikes(node_id: string): Promise<readonly SpikeEvent[]>;

  checkpoint_state(): Promise<StateSnapshot>;

  restore_state(snapshot: StateSnapshot): Promise<void>;

  health_check(): Promise<HardwareHealthReport>;
}

// ── Supported Schema Versions ───────────────────────────────────────────────

/**
 * Schema versions of BrainScanDataset that this simulation engine supports.
 * Per Contracts: Scan Data Ingestion precondition 3 (schema_version compatible).
 */
export const SUPPORTED_SCAN_SCHEMA_VERSIONS: readonly string[] = ["1.0.0"];
