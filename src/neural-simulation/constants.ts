/**
 * Neural Simulation — Threshold Constants
 *
 * All constants from the Threshold Registry in card 0.2.2.1.3.
 * Injectable/configurable per CLAUDE.md: consumers create a config via
 * `createNeuralSimConfig(overrides?)` rather than importing raw values.
 *
 * Decision: O3 — Multi-rate semi-implicit Euler (dt values)
 * Decision: O4 — Multi-compartment HH with event-driven optimization (compartment counts, FLOPS)
 * Decision: O3 — Neuromorphic-conventional hybrid (energy targets)
 */

// ── Type Definition ──────────────────────────────────────────────────────────

/**
 * All threshold constants for the neural simulation engine.
 * Each field corresponds to one row in the Threshold Registry.
 */
export interface NeuralSimConstants {
  // Time-stepping (Decision: O3 Multi-rate semi-implicit Euler)
  /** Fast time step for V_m and gating variables, in ms */
  readonly dt_fast: number;
  /** Medium time step for synaptic conductances and calcium, in ms */
  readonly dt_medium: number;
  /** Slow time step for plasticity and neuromodulation, in ms */
  readonly dt_slow: number;
  /** Structural plasticity time step, in ms */
  readonly dt_structural: number;

  // Compartment counts
  /** Minimum compartments per neuron per L2+ spec */
  readonly compartments_per_neuron_min: number;
  /** Typical compartments for detailed morphology, count */
  readonly compartments_per_neuron_typical: number;

  // Compute requirements
  /** Sustained FLOPS for human brain real-time at L2+ */
  readonly L2plus_FLOPS_sustained: number;
  /** Effective FLOPS with event-driven optimization */
  readonly L2plus_FLOPS_optimized: number;
  /** Total state memory in bytes (1 PB) */
  readonly L2plus_memory: number;
  /** Inter-node communication bandwidth in bytes/s */
  readonly L2plus_bandwidth: number;

  // Biological parameters
  /** Average neuronal firing rate in Hz */
  readonly spike_rate_avg: number;

  // Energy targets
  /** Phase 1 energy budget target in MW */
  readonly energy_target_phase1: number;
  /** Phase 2 energy budget target in MW */
  readonly energy_target_phase2: number;
  /** Biological brain power consumption in W */
  readonly energy_biological: number;

  // Error bounds
  /** Local truncation error per fast step in mV */
  readonly error_local_per_step: number;
  /** Max accumulated membrane potential error over 1 year in mV */
  readonly error_accumulated_1yr: number;

  // Conservation correction
  /** Interval between global conservation corrections in ms (sim time) */
  readonly conservation_correction_interval: number;

  // Warm-up and validation
  /** Post-ingestion warm-up duration in s (sim time) */
  readonly warm_up_duration: number;
  /** Min acceptable spontaneous firing rate per neuron type in Hz */
  readonly validation_firing_rate_min: number;
  /** Max acceptable spontaneous firing rate per neuron type in Hz */
  readonly validation_firing_rate_max: number;
  /** Min correlation between simulated and empirical resting-state FC */
  readonly resting_fc_correlation_min: number;
  /** Max relative deviation of AP peak amplitude/timing from reference */
  readonly ap_waveform_tolerance: number;
  /** Max relative deviation of oscillatory band power from reference */
  readonly oscillatory_power_tolerance: number;
}

// ── Valid Ranges (from Threshold Registry) ────────────────────────────────────

/**
 * Valid ranges for each constant. Used for injection-time validation.
 * Keys match NeuralSimConstants fields; values are [min, max] inclusive.
 */
const VALID_RANGES: Record<keyof NeuralSimConstants, readonly [number, number]> = {
  dt_fast:                         [0.01,   0.05],
  dt_medium:                       [0.05,   0.5],
  dt_slow:                         [0.5,    10.0],
  dt_structural:                   [50,     1000],
  compartments_per_neuron_min:     [3,      20],
  compartments_per_neuron_typical: [100,    1000],
  L2plus_FLOPS_sustained:          [1e20,   1e22],
  L2plus_FLOPS_optimized:          [1e18,   1e20],
  L2plus_memory:                   [1e14,   1e16],
  L2plus_bandwidth:                [1e17,   1e19],
  spike_rate_avg:                  [1,      20],
  energy_target_phase1:            [5,      50],
  energy_target_phase2:            [0.5,    5],
  energy_biological:               [15,     25],
  error_local_per_step:            [1e-8,   1e-5],
  error_accumulated_1yr:           [0.1,    10],
  conservation_correction_interval: [100,   10000],
  warm_up_duration:                [5,      60],
  validation_firing_rate_min:      [0.01,   1.0],
  validation_firing_rate_max:      [20,     100],
  resting_fc_correlation_min:      [0.6,    0.95],
  ap_waveform_tolerance:           [0.01,   0.10],
  oscillatory_power_tolerance:     [0.10,   0.30],
};

// ── Defaults (from Threshold Registry "Value" column) ─────────────────────────

/**
 * Default values for all neural simulation constants.
 * Each value matches the "Value" column in the Threshold Registry.
 */
export const NEURAL_SIM_DEFAULTS: Readonly<NeuralSimConstants> = Object.freeze({
  // Time-stepping
  dt_fast:                         0.025,
  dt_medium:                       0.1,
  dt_slow:                         1.0,
  dt_structural:                   100,

  // Compartment counts
  compartments_per_neuron_min:     5,
  compartments_per_neuron_typical: 500,

  // Compute requirements
  L2plus_FLOPS_sustained:          1e21,
  L2plus_FLOPS_optimized:          1e19,
  L2plus_memory:                   1e15,
  L2plus_bandwidth:                1e18,

  // Biological parameters
  spike_rate_avg:                  5,

  // Energy targets
  energy_target_phase1:            10,
  energy_target_phase2:            1,
  energy_biological:               20,

  // Error bounds
  error_local_per_step:            6.25e-7,
  error_accumulated_1yr:           1.0,

  // Conservation correction
  conservation_correction_interval: 1000,

  // Warm-up and validation
  warm_up_duration:                10,
  validation_firing_rate_min:      0.1,
  validation_firing_rate_max:      50,
  resting_fc_correlation_min:      0.8,
  ap_waveform_tolerance:           0.05,
  oscillatory_power_tolerance:     0.20,
});

// ── Factory (injectable/configurable per CLAUDE.md) ──────────────────────────

/**
 * Creates a neural simulation configuration with optional overrides.
 * All overrides are validated against the Threshold Registry valid ranges.
 *
 * @param overrides - Partial set of constants to override. Each value must
 *   fall within its documented valid range or a RangeError is thrown.
 * @returns A frozen NeuralSimConstants with defaults merged with overrides.
 * @throws RangeError if any override value is outside its valid range.
 */
export function createNeuralSimConfig(
  overrides?: Partial<NeuralSimConstants>
): Readonly<NeuralSimConstants> {
  if (!overrides) {
    return NEURAL_SIM_DEFAULTS;
  }

  // Validate each override against its valid range
  for (const [key, value] of Object.entries(overrides)) {
    const range = VALID_RANGES[key as keyof NeuralSimConstants];
    if (range && (value < range[0] || value > range[1])) {
      throw new RangeError(
        `${key} = ${value} is outside valid range [${range[0]}, ${range[1]}]`
      );
    }
  }

  return Object.freeze({ ...NEURAL_SIM_DEFAULTS, ...overrides });
}
