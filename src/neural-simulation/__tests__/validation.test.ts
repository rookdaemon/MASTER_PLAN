/**
 * Neural Simulation — Validation Module Tests (RED phase)
 *
 * Tests define expected behavior of the biological validation benchmark
 * execution module before the implementation exists. All tests will fail
 * until src/neural-simulation/validation.ts is created (RED → GREEN).
 *
 * Maps to:
 * - Contracts: Validation Output Interface (preconditions, postconditions, invariants)
 * - Behavioral Spec Scenario 2: biological validation benchmark execution
 * - Threshold Registry:
 *     ap_waveform_tolerance = 0.05 (5% relative)
 *     oscillatory_power_tolerance = 0.20 (20% relative)
 *     resting_fc_correlation_min = 0.8 (Pearson r)
 */

import { describe, it, expect } from "vitest";
import {
  evaluateBenchmark,
  evaluateSuite,
  makeAPWaveformBenchmark,
  makeOscillatoryPowerBenchmark,
  makeRestingFCBenchmark,
  createValidationSuite,
} from "../validation.js";
import type { ValidationBenchmark, ValidationSuite } from "../types.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const FIXED_TIMESTAMP = "2026-03-21T00:00:00.000Z";

function makeTimeSteppingConfig() {
  return {
    dt_fast_ms: 0.025,
    dt_medium_ms: 0.1,
    dt_slow_ms: 1.0,
    dt_structural_ms: 100,
    integration_method: "semi-implicit-euler" as const,
    conservation_correction_interval_ms: 1000,
  };
}

/** Creates a minimal ValidationSuite with no benchmarks yet registered. */
function makeEmptySuite(): ValidationSuite {
  return createValidationSuite(makeTimeSteppingConfig(), FIXED_TIMESTAMP);
}

// ── evaluateBenchmark — postcondition 2 ──────────────────────────────────────

describe("evaluateBenchmark — result structure", () => {
  it("returns a ValidationResult with simulated_value, deviation_from_reference, passed, and timestamp", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    const result = evaluateBenchmark(benchmark, 100, FIXED_TIMESTAMP);
    expect(result.benchmark).toBe(benchmark);
    expect(result.simulated_value).toBe(100);
    expect(typeof result.deviation_from_reference).toBe("number");
    expect(typeof result.passed).toBe("boolean");
    expect(result.timestamp).toBe(FIXED_TIMESTAMP);
  });

  it("computes deviation_from_reference as absolute relative deviation: |sim - ref| / ref", () => {
    const benchmark = makeAPWaveformBenchmark(100); // reference = 100 mV
    const result = evaluateBenchmark(benchmark, 104, FIXED_TIMESTAMP);
    // |104 - 100| / 100 = 0.04
    expect(result.deviation_from_reference).toBeCloseTo(0.04, 10);
  });
});

// ── AP waveform benchmark — Behavioral Spec Scenario 2 (single-neuron scale) ─

describe("makeAPWaveformBenchmark — single-neuron AP peak tolerance = 0.05", () => {
  it("passes when simulated AP peak is exactly at reference", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    const result = evaluateBenchmark(benchmark, 100, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("passes when simulated AP peak is within 5% above reference (4.9% deviation)", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    const result = evaluateBenchmark(benchmark, 104.9, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("passes when simulated AP peak is exactly at 5% above reference", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    const result = evaluateBenchmark(benchmark, 105, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("fails when simulated AP peak exceeds 5% tolerance (6% deviation)", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    const result = evaluateBenchmark(benchmark, 106, FIXED_TIMESTAMP);
    expect(result.passed).toBe(false);
  });

  it("fails when simulated AP peak is below reference by more than 5%", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    const result = evaluateBenchmark(benchmark, 94, FIXED_TIMESTAMP);
    expect(result.passed).toBe(false);
  });

  it("benchmark scale is 'single_neuron'", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    expect(benchmark.scale).toBe("single_neuron");
  });
});

// ── Oscillatory power benchmark — Behavioral Spec Scenario 2 (circuit scale) ─

describe("makeOscillatoryPowerBenchmark — circuit oscillatory band power tolerance = 0.20", () => {
  it("passes when simulated band power is exactly at reference", () => {
    const benchmark = makeOscillatoryPowerBenchmark("alpha", 50);
    const result = evaluateBenchmark(benchmark, 50, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("passes when simulated power is within 20% of reference (19% deviation)", () => {
    const benchmark = makeOscillatoryPowerBenchmark("gamma", 100);
    const result = evaluateBenchmark(benchmark, 119, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("passes when deviation is exactly 20%", () => {
    const benchmark = makeOscillatoryPowerBenchmark("beta", 100);
    const result = evaluateBenchmark(benchmark, 120, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("fails when deviation exceeds 20% (21% above reference)", () => {
    const benchmark = makeOscillatoryPowerBenchmark("alpha", 100);
    const result = evaluateBenchmark(benchmark, 121, FIXED_TIMESTAMP);
    expect(result.passed).toBe(false);
  });

  it("benchmark scale is 'circuit'", () => {
    const benchmark = makeOscillatoryPowerBenchmark("alpha", 50);
    expect(benchmark.scale).toBe("circuit");
  });
});

// ── Resting-state FC benchmark — Behavioral Spec Scenario 2 (whole_brain scale)

describe("makeRestingFCBenchmark — whole-brain resting-state FC correlation >= 0.8", () => {
  it("passes when simulated correlation equals reference (0.85 >= 0.8)", () => {
    const benchmark = makeRestingFCBenchmark(0.85);
    const result = evaluateBenchmark(benchmark, 0.85, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("passes when simulated correlation is exactly 0.8 (minimum threshold)", () => {
    const benchmark = makeRestingFCBenchmark(0.85);
    // resting_fc_correlation_min = 0.8: simulation must achieve >= 0.8
    const result = evaluateBenchmark(benchmark, 0.8, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("passes when simulated correlation exceeds reference", () => {
    const benchmark = makeRestingFCBenchmark(0.85);
    const result = evaluateBenchmark(benchmark, 0.9, FIXED_TIMESTAMP);
    expect(result.passed).toBe(true);
  });

  it("fails when simulated correlation is below 0.8 (minimum from Threshold Registry)", () => {
    const benchmark = makeRestingFCBenchmark(0.85);
    const result = evaluateBenchmark(benchmark, 0.79, FIXED_TIMESTAMP);
    expect(result.passed).toBe(false);
  });

  it("benchmark scale is 'whole_brain'", () => {
    const benchmark = makeRestingFCBenchmark(0.85);
    expect(benchmark.scale).toBe("whole_brain");
  });
});

// ── evaluateSuite — postconditions 1, 3, 4 ───────────────────────────────────

describe("evaluateSuite — suite-level evaluation", () => {
  it("postcondition 1: ValidationSuite contains results for all registered benchmarks", () => {
    const suite = makeEmptySuite();
    const benchmarks: ValidationBenchmark[] = [
      makeAPWaveformBenchmark(100),
      makeOscillatoryPowerBenchmark("alpha", 50),
      makeRestingFCBenchmark(0.85),
    ];
    const values = new Map([
      [benchmarks[0]!.name, 100],
      [benchmarks[1]!.name, 50],
      [benchmarks[2]!.name, 0.9],
    ]);
    const evaluated = evaluateSuite({ ...suite, benchmarks }, values, FIXED_TIMESTAMP);
    expect(evaluated.results).toHaveLength(3);
    const resultNames = evaluated.results.map((r) => r.benchmark.name);
    for (const b of benchmarks) {
      expect(resultNames).toContain(b.name);
    }
  });

  it("postcondition 3: overall_pass is true when ALL benchmarks pass", () => {
    const suite = makeEmptySuite();
    const benchmarks: ValidationBenchmark[] = [
      makeAPWaveformBenchmark(100),
      makeOscillatoryPowerBenchmark("alpha", 50),
      makeRestingFCBenchmark(0.85),
    ];
    const values = new Map([
      [benchmarks[0]!.name, 100],   // exact match — passes
      [benchmarks[1]!.name, 50],    // exact match — passes
      [benchmarks[2]!.name, 0.9],   // above min — passes
    ]);
    const evaluated = evaluateSuite({ ...suite, benchmarks }, values, FIXED_TIMESTAMP);
    expect(evaluated.overall_pass).toBe(true);
  });

  it("postcondition 3: overall_pass is false when ANY benchmark fails", () => {
    const suite = makeEmptySuite();
    const benchmarks: ValidationBenchmark[] = [
      makeAPWaveformBenchmark(100),
      makeOscillatoryPowerBenchmark("alpha", 50),
      makeRestingFCBenchmark(0.85),
    ];
    const values = new Map([
      [benchmarks[0]!.name, 100],   // passes
      [benchmarks[1]!.name, 50],    // passes
      [benchmarks[2]!.name, 0.5],   // FAILS (below 0.8)
    ]);
    const evaluated = evaluateSuite({ ...suite, benchmarks }, values, FIXED_TIMESTAMP);
    expect(evaluated.overall_pass).toBe(false);
  });

  it("postcondition 3: overall_pass is false when only one benchmark fails", () => {
    const suite = makeEmptySuite();
    const benchmarks: ValidationBenchmark[] = [
      makeAPWaveformBenchmark(100),
      makeOscillatoryPowerBenchmark("alpha", 50),
    ];
    const values = new Map([
      [benchmarks[0]!.name, 115],  // FAILS (15% > 5% tolerance)
      [benchmarks[1]!.name, 50],   // passes
    ]);
    const evaluated = evaluateSuite({ ...suite, benchmarks }, values, FIXED_TIMESTAMP);
    expect(evaluated.overall_pass).toBe(false);
  });

  it("postcondition 4: suite results are serializable (JSON round-trip)", () => {
    const suite = makeEmptySuite();
    const benchmarks: ValidationBenchmark[] = [makeAPWaveformBenchmark(100)];
    const values = new Map([[benchmarks[0]!.name, 100]]);
    const evaluated = evaluateSuite({ ...suite, benchmarks }, values, FIXED_TIMESTAMP);
    const json = JSON.stringify({
      overall_pass: evaluated.overall_pass,
      timestamp: evaluated.timestamp,
      results: evaluated.results.map((r) => ({
        name: r.benchmark.name,
        simulated_value: r.simulated_value,
        deviation_from_reference: r.deviation_from_reference,
        passed: r.passed,
        timestamp: r.timestamp,
      })),
    });
    const parsed = JSON.parse(json) as { overall_pass: boolean; timestamp: string };
    expect(parsed.overall_pass).toBe(true);
    expect(parsed.timestamp).toBe(FIXED_TIMESTAMP);
  });

  it("postcondition 4: suite has a timestamp", () => {
    const suite = makeEmptySuite();
    expect(suite.timestamp).toBe(FIXED_TIMESTAMP);
  });
});

// ── Invariants ────────────────────────────────────────────────────────────────

describe("Invariants — benchmark immutability", () => {
  it("benchmark biological_reference is readonly (TypeScript contract)", () => {
    const benchmark = makeAPWaveformBenchmark(100);
    // The type enforces readonly — this test verifies the value doesn't change
    // after creation (runtime check via Object.isFrozen or stable value)
    const refBefore = benchmark.biological_reference;
    // Attempt assignment in a way that TypeScript allows at runtime but should not mutate
    const mutableBenchmark = benchmark as { biological_reference: number };
    expect(() => {
      mutableBenchmark.biological_reference = 999;
    }).not.toThrow(); // JS allows this on plain objects; the invariant is enforced at the type level
    // But if the factory returns a frozen object, the assignment should have no effect
    // or throw in strict mode. Test that the reference value is stable in evaluateBenchmark:
    const result = evaluateBenchmark(benchmark, 100, FIXED_TIMESTAMP);
    // deviation should be computed against 100 (the original reference), not 999
    expect(result.deviation_from_reference).toBeCloseTo(0, 10);
  });

  it("suite with empty benchmarks has overall_pass === true (vacuous truth)", () => {
    const suite = makeEmptySuite();
    const evaluated = evaluateSuite(suite, new Map(), FIXED_TIMESTAMP);
    expect(evaluated.overall_pass).toBe(true);
    expect(evaluated.results).toHaveLength(0);
  });
});

// ── Behavioral Spec Scenario 2: complete pipeline ────────────────────────────

describe("Behavioral Spec Scenario 2 — complete validation pipeline", () => {
  it("single-neuron + circuit + whole-brain benchmarks all pass → overall_pass === true", () => {
    const suite = makeEmptySuite();
    const benchmarks: ValidationBenchmark[] = [
      makeAPWaveformBenchmark(100),                  // AP peak reference: 100 mV
      makeOscillatoryPowerBenchmark("alpha", 50),    // alpha-band power reference: 50 µV²/Hz
      makeOscillatoryPowerBenchmark("gamma", 30),    // gamma-band power reference: 30 µV²/Hz
      makeRestingFCBenchmark(0.87),                  // FC reference: 0.87
    ];
    const values = new Map([
      [benchmarks[0]!.name, 103],   // 3% deviation → within 5% tolerance ✓
      [benchmarks[1]!.name, 58],    // 16% deviation → within 20% tolerance ✓
      [benchmarks[2]!.name, 27],    // 10% deviation → within 20% tolerance ✓
      [benchmarks[3]!.name, 0.83],  // 0.83 >= 0.8 ✓
    ]);
    const evaluated = evaluateSuite({ ...suite, benchmarks }, values, FIXED_TIMESTAMP);
    expect(evaluated.overall_pass).toBe(true);
    expect(evaluated.results).toHaveLength(4);
    for (const result of evaluated.results) {
      expect(result.passed).toBe(true);
    }
  });

  it("whole-brain FC below 0.8 causes overall_pass === false regardless of other benchmarks", () => {
    const suite = makeEmptySuite();
    const benchmarks: ValidationBenchmark[] = [
      makeAPWaveformBenchmark(100),
      makeRestingFCBenchmark(0.87),
    ];
    const values = new Map([
      [benchmarks[0]!.name, 100],  // passes
      [benchmarks[1]!.name, 0.75], // FAILS: below resting_fc_correlation_min = 0.8
    ]);
    const evaluated = evaluateSuite({ ...suite, benchmarks }, values, FIXED_TIMESTAMP);
    expect(evaluated.overall_pass).toBe(false);
  });
});
