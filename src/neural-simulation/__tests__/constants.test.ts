/**
 * Tests for Neural Simulation threshold constants.
 *
 * Verifies every Threshold Registry entry from card 0.2.2.1.3 exists
 * with the specified value, name, unit, and valid range.
 * Also verifies injectability/configurability per CLAUDE.md.
 */

import { describe, test, expect } from "vitest";
import {
  NEURAL_SIM_DEFAULTS,
  createNeuralSimConfig,
} from "../constants.js";

// ── Threshold Registry: every constant has correct default value ─────────────

describe("NeuralSimConstants defaults", () => {
  // Time-stepping constants (Decision: O3 Multi-rate semi-implicit Euler)
  test("dt_fast = 0.025 ms", () => {
    expect(NEURAL_SIM_DEFAULTS.dt_fast).toBe(0.025);
  });

  test("dt_medium = 0.1 ms", () => {
    expect(NEURAL_SIM_DEFAULTS.dt_medium).toBe(0.1);
  });

  test("dt_slow = 1.0 ms", () => {
    expect(NEURAL_SIM_DEFAULTS.dt_slow).toBe(1.0);
  });

  test("dt_structural = 100 ms", () => {
    expect(NEURAL_SIM_DEFAULTS.dt_structural).toBe(100);
  });

  // Compartment counts
  test("compartments_per_neuron_min = 5", () => {
    expect(NEURAL_SIM_DEFAULTS.compartments_per_neuron_min).toBe(5);
  });

  test("compartments_per_neuron_typical = 500", () => {
    expect(NEURAL_SIM_DEFAULTS.compartments_per_neuron_typical).toBe(500);
  });

  // Compute requirements
  test("L2plus_FLOPS_sustained = 1e21", () => {
    expect(NEURAL_SIM_DEFAULTS.L2plus_FLOPS_sustained).toBe(1e21);
  });

  test("L2plus_FLOPS_optimized = 1e19", () => {
    expect(NEURAL_SIM_DEFAULTS.L2plus_FLOPS_optimized).toBe(1e19);
  });

  test("L2plus_memory = 1e15 bytes", () => {
    expect(NEURAL_SIM_DEFAULTS.L2plus_memory).toBe(1e15);
  });

  test("L2plus_bandwidth = 1e18 bytes/s", () => {
    expect(NEURAL_SIM_DEFAULTS.L2plus_bandwidth).toBe(1e18);
  });

  // Biological parameters
  test("spike_rate_avg = 5 Hz", () => {
    expect(NEURAL_SIM_DEFAULTS.spike_rate_avg).toBe(5);
  });

  // Energy targets
  test("energy_target_phase1 = 10 MW", () => {
    expect(NEURAL_SIM_DEFAULTS.energy_target_phase1).toBe(10);
  });

  test("energy_target_phase2 = 1 MW", () => {
    expect(NEURAL_SIM_DEFAULTS.energy_target_phase2).toBe(1);
  });

  test("energy_biological = 20 W", () => {
    expect(NEURAL_SIM_DEFAULTS.energy_biological).toBe(20);
  });

  // Error bounds
  test("error_local_per_step = 6.25e-7 mV", () => {
    expect(NEURAL_SIM_DEFAULTS.error_local_per_step).toBe(6.25e-7);
  });

  test("error_accumulated_1yr = 1.0 mV", () => {
    expect(NEURAL_SIM_DEFAULTS.error_accumulated_1yr).toBe(1.0);
  });

  // Conservation correction
  test("conservation_correction_interval = 1000 ms", () => {
    expect(NEURAL_SIM_DEFAULTS.conservation_correction_interval).toBe(1000);
  });

  // Warm-up and validation
  test("warm_up_duration = 10 s", () => {
    expect(NEURAL_SIM_DEFAULTS.warm_up_duration).toBe(10);
  });

  test("validation_firing_rate_min = 0.1 Hz", () => {
    expect(NEURAL_SIM_DEFAULTS.validation_firing_rate_min).toBe(0.1);
  });

  test("validation_firing_rate_max = 50 Hz", () => {
    expect(NEURAL_SIM_DEFAULTS.validation_firing_rate_max).toBe(50);
  });

  test("resting_fc_correlation_min = 0.8", () => {
    expect(NEURAL_SIM_DEFAULTS.resting_fc_correlation_min).toBe(0.8);
  });

  test("ap_waveform_tolerance = 0.05", () => {
    expect(NEURAL_SIM_DEFAULTS.ap_waveform_tolerance).toBe(0.05);
  });

  test("oscillatory_power_tolerance = 0.20", () => {
    expect(NEURAL_SIM_DEFAULTS.oscillatory_power_tolerance).toBe(0.2);
  });

  test("all 23 constants are present", () => {
    const keys = Object.keys(NEURAL_SIM_DEFAULTS);
    expect(keys).toHaveLength(23);
  });
});

// ── Injectability / Configurability (per CLAUDE.md) ─────────────────────────

describe("createNeuralSimConfig — injectable overrides", () => {
  test("returns defaults when no overrides provided", () => {
    const config = createNeuralSimConfig();
    expect(config).toEqual(NEURAL_SIM_DEFAULTS);
  });

  test("overrides a single constant", () => {
    const config = createNeuralSimConfig({ dt_fast: 0.01 });
    expect(config.dt_fast).toBe(0.01);
    // other values remain default
    expect(config.dt_medium).toBe(0.1);
  });

  test("overrides multiple constants", () => {
    const config = createNeuralSimConfig({
      dt_fast: 0.05,
      compartments_per_neuron_min: 3,
      warm_up_duration: 60,
    });
    expect(config.dt_fast).toBe(0.05);
    expect(config.compartments_per_neuron_min).toBe(3);
    expect(config.warm_up_duration).toBe(60);
  });

  test("does not mutate NEURAL_SIM_DEFAULTS", () => {
    const before = { ...NEURAL_SIM_DEFAULTS };
    createNeuralSimConfig({ dt_fast: 0.05 });
    expect(NEURAL_SIM_DEFAULTS).toEqual(before);
  });

  test("validates dt_fast within valid range [0.01, 0.05]", () => {
    expect(() => createNeuralSimConfig({ dt_fast: 0.001 })).toThrow();
    expect(() => createNeuralSimConfig({ dt_fast: 0.1 })).toThrow();
    expect(() => createNeuralSimConfig({ dt_fast: 0.025 })).not.toThrow();
  });

  test("validates dt_medium within valid range [0.05, 0.5]", () => {
    expect(() => createNeuralSimConfig({ dt_medium: 0.01 })).toThrow();
    expect(() => createNeuralSimConfig({ dt_medium: 1.0 })).toThrow();
  });

  test("validates dt_slow within valid range [0.5, 10.0]", () => {
    expect(() => createNeuralSimConfig({ dt_slow: 0.1 })).toThrow();
    expect(() => createNeuralSimConfig({ dt_slow: 20.0 })).toThrow();
  });

  test("validates dt_structural within valid range [50, 1000]", () => {
    expect(() => createNeuralSimConfig({ dt_structural: 10 })).toThrow();
    expect(() => createNeuralSimConfig({ dt_structural: 2000 })).toThrow();
  });

  test("validates compartments_per_neuron_min within valid range [3, 20]", () => {
    expect(() => createNeuralSimConfig({ compartments_per_neuron_min: 1 })).toThrow();
    expect(() => createNeuralSimConfig({ compartments_per_neuron_min: 50 })).toThrow();
  });

  test("validates warm_up_duration within valid range [5, 60]", () => {
    expect(() => createNeuralSimConfig({ warm_up_duration: 1 })).toThrow();
    expect(() => createNeuralSimConfig({ warm_up_duration: 120 })).toThrow();
  });

  test("validates validation_firing_rate_min within valid range [0.01, 1.0]", () => {
    expect(() => createNeuralSimConfig({ validation_firing_rate_min: 0.001 })).toThrow();
    expect(() => createNeuralSimConfig({ validation_firing_rate_min: 5 })).toThrow();
  });

  test("validates validation_firing_rate_max within valid range [20, 100]", () => {
    expect(() => createNeuralSimConfig({ validation_firing_rate_max: 5 })).toThrow();
    expect(() => createNeuralSimConfig({ validation_firing_rate_max: 200 })).toThrow();
  });

  test("validates resting_fc_correlation_min within valid range [0.6, 0.95]", () => {
    expect(() => createNeuralSimConfig({ resting_fc_correlation_min: 0.1 })).toThrow();
    expect(() => createNeuralSimConfig({ resting_fc_correlation_min: 1.0 })).toThrow();
  });

  test("validates ap_waveform_tolerance within valid range [0.01, 0.10]", () => {
    expect(() => createNeuralSimConfig({ ap_waveform_tolerance: 0.001 })).toThrow();
    expect(() => createNeuralSimConfig({ ap_waveform_tolerance: 0.5 })).toThrow();
  });

  test("validates oscillatory_power_tolerance within valid range [0.10, 0.30]", () => {
    expect(() => createNeuralSimConfig({ oscillatory_power_tolerance: 0.01 })).toThrow();
    expect(() => createNeuralSimConfig({ oscillatory_power_tolerance: 0.5 })).toThrow();
  });
});
