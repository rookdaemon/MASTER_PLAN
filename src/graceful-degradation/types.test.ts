/**
 * Graceful Degradation — Type and MVC Logic Tests
 *
 * Card: 0.2.2.4.3
 */
import { describe, it, expect } from "vitest";
import {
  Substrate,
  FailureSpeed,
  FailureExtent,
  DegradationTier,
  MirrorCategory,
  MergeStrategy,
  type MVCThreshold,
  type ConsciousnessMetrics,
  type MVCStatus,
  type FailureClass,
  type CrossSubstrateMirror,
  type LoadDistribution,
  type FunctionId,
  type SyncConfig,
  type TransitionStep,
} from "./types.js";
import {
  evaluateMVC,
  classifyDegradationTier,
  computeTransitionStep,
  allFailureClasses,
  mirrorCategoryConstraints,
  validateMirrorConfig,
} from "./mvc.js";

// ── Helper: create branded FunctionId ───────────────────────────────────────

function fnId(id: string): FunctionId {
  return id as FunctionId;
}

// ── MVC Evaluation ──────────────────────────────────────────────────────────

describe("evaluateMVC", () => {
  const threshold: MVCThreshold = {
    C_min: 0.3,
    B_min: 0.4,
    Phi_min: 0.5,
  };

  it("returns met=true when all metrics exceed thresholds", () => {
    const metrics: ConsciousnessMetrics = {
      substrateCapacity: 0.8,
      bindingCoherence: 0.7,
      integrationMetrics: 0.9,
    };
    const status = evaluateMVC(metrics, threshold);
    expect(status.met).toBe(true);
    expect(status.margin).toBeGreaterThan(0);
    expect(status.dimensions.capacity.met).toBe(true);
    expect(status.dimensions.binding.met).toBe(true);
    expect(status.dimensions.integration.met).toBe(true);
  });

  it("returns met=false when capacity is below threshold", () => {
    const metrics: ConsciousnessMetrics = {
      substrateCapacity: 0.2,
      bindingCoherence: 0.7,
      integrationMetrics: 0.9,
    };
    const status = evaluateMVC(metrics, threshold);
    expect(status.met).toBe(false);
    expect(status.dimensions.capacity.met).toBe(false);
    expect(status.margin).toBeLessThan(0);
  });

  it("returns met=false when binding is below threshold", () => {
    const metrics: ConsciousnessMetrics = {
      substrateCapacity: 0.8,
      bindingCoherence: 0.2,
      integrationMetrics: 0.9,
    };
    const status = evaluateMVC(metrics, threshold);
    expect(status.met).toBe(false);
    expect(status.dimensions.binding.met).toBe(false);
  });

  it("returns met=false when integration is below threshold", () => {
    const metrics: ConsciousnessMetrics = {
      substrateCapacity: 0.8,
      bindingCoherence: 0.7,
      integrationMetrics: 0.3,
    };
    const status = evaluateMVC(metrics, threshold);
    expect(status.met).toBe(false);
    expect(status.dimensions.integration.met).toBe(false);
  });

  it("margin is the smallest gap across all three dimensions", () => {
    const metrics: ConsciousnessMetrics = {
      substrateCapacity: 0.35, // margin = 0.05
      bindingCoherence: 0.9, // margin = 0.50
      integrationMetrics: 0.6, // margin = 0.10
    };
    const status = evaluateMVC(metrics, threshold);
    expect(status.margin).toBeCloseTo(0.05, 5);
  });

  it("margin is negative when below threshold", () => {
    const metrics: ConsciousnessMetrics = {
      substrateCapacity: 0.1, // margin = -0.2
      bindingCoherence: 0.3, // margin = -0.1
      integrationMetrics: 0.4, // margin = -0.1
    };
    const status = evaluateMVC(metrics, threshold);
    expect(status.margin).toBeCloseTo(-0.2, 5);
  });
});

// ── Degradation Tier Classification ─────────────────────────────────────────

describe("classifyDegradationTier", () => {
  it("returns GREEN when both substrates ≥ 80%", () => {
    expect(classifyDegradationTier(0.9, 0.85)).toBe(DegradationTier.Green);
  });

  it("returns YELLOW when one substrate is 50–80%", () => {
    expect(classifyDegradationTier(0.6, 0.9)).toBe(DegradationTier.Yellow);
    expect(classifyDegradationTier(0.9, 0.55)).toBe(DegradationTier.Yellow);
  });

  it("returns ORANGE when one substrate is 25–50%", () => {
    expect(classifyDegradationTier(0.3, 0.9)).toBe(DegradationTier.Orange);
    expect(classifyDegradationTier(0.9, 0.4)).toBe(DegradationTier.Orange);
  });

  it("returns RED when one substrate < 25%", () => {
    expect(classifyDegradationTier(0.1, 0.9)).toBe(DegradationTier.Red);
    expect(classifyDegradationTier(0.9, 0.15)).toBe(DegradationTier.Red);
  });

  it("returns RED for single-substrate operation (0%)", () => {
    expect(classifyDegradationTier(0.0, 0.9)).toBe(DegradationTier.Red);
  });

  it("uses the worse substrate to determine tier", () => {
    // Bio at 30% (ORANGE), Synth at 60% (YELLOW) → worst wins → ORANGE
    expect(classifyDegradationTier(0.3, 0.6)).toBe(DegradationTier.Orange);
  });
});

// ── Smooth Transition ───────────────────────────────────────────────────────

describe("computeTransitionStep", () => {
  it("at progress=0, all load remains on failing substrate", () => {
    const step = computeTransitionStep(0.0, 1.0, 0.0);
    expect(step.failingSubstrateLoad).toBeCloseTo(1.0);
    expect(step.healthySubstrateLoad).toBeCloseTo(0.0);
  });

  it("at progress=1, all load is on healthy substrate", () => {
    const step = computeTransitionStep(1.0, 1.0, 0.0);
    expect(step.failingSubstrateLoad).toBeCloseTo(0.0);
    expect(step.healthySubstrateLoad).toBeCloseTo(1.0);
  });

  it("at progress=0.5, load is split evenly", () => {
    const step = computeTransitionStep(0.5, 1.0, 0.0);
    expect(step.failingSubstrateLoad).toBeCloseTo(0.5);
    expect(step.healthySubstrateLoad).toBeCloseTo(0.5);
  });

  it("accounts for existing load on healthy substrate", () => {
    const step = computeTransitionStep(0.5, 0.8, 0.2);
    expect(step.failingSubstrateLoad).toBeCloseTo(0.4); // 0.8 * (1 - 0.5)
    expect(step.healthySubstrateLoad).toBeCloseTo(0.6); // 0.2 + 0.8 * 0.5
  });
});

// ── Failure Taxonomy ────────────────────────────────────────────────────────

describe("allFailureClasses", () => {
  it("produces exactly 8 failure classes", () => {
    const classes = allFailureClasses();
    expect(classes).toHaveLength(8);
  });

  it("covers both substrates", () => {
    const classes = allFailureClasses();
    const bioClasses = classes.filter((c) => c.substrate === Substrate.Bio);
    const synthClasses = classes.filter((c) => c.substrate === Substrate.Synth);
    expect(bioClasses).toHaveLength(4);
    expect(synthClasses).toHaveLength(4);
  });

  it("covers both speeds and extents for each substrate", () => {
    const classes = allFailureClasses();
    for (const substrate of [Substrate.Bio, Substrate.Synth]) {
      const sub = classes.filter((c) => c.substrate === substrate);
      const combos = sub.map((c) => `${c.speed}-${c.extent}`).sort();
      expect(combos).toEqual([
        "GRADUAL-PARTIAL",
        "GRADUAL-TOTAL",
        "SUDDEN-PARTIAL",
        "SUDDEN-TOTAL",
      ]);
    }
  });
});

// ── Mirror Category Constraints ─────────────────────────────────────────────

describe("mirrorCategoryConstraints", () => {
  it("core-conscious has strictest requirements", () => {
    const constraints = mirrorCategoryConstraints();
    const core = constraints.get(MirrorCategory.CoreConscious)!;
    const exp = constraints.get(MirrorCategory.ExperienceSupporting)!;
    const cap = constraints.get(MirrorCategory.Capability)!;

    expect(core.maxSyncInterval_ms).toBeLessThan(exp.maxSyncInterval_ms);
    expect(exp.maxSyncInterval_ms).toBeLessThan(cap.maxSyncInterval_ms);
    expect(core.minFidelity).toBeGreaterThan(exp.minFidelity);
    expect(exp.minFidelity).toBeGreaterThan(cap.minFidelity);
  });

  it("matches architecture spec values", () => {
    const constraints = mirrorCategoryConstraints();
    const core = constraints.get(MirrorCategory.CoreConscious)!;
    expect(core.maxSyncInterval_ms).toBe(10);
    expect(core.minFidelity).toBe(0.99);

    const exp = constraints.get(MirrorCategory.ExperienceSupporting)!;
    expect(exp.maxSyncInterval_ms).toBe(25);
    expect(exp.minFidelity).toBe(0.95);

    const cap = constraints.get(MirrorCategory.Capability)!;
    expect(cap.maxSyncInterval_ms).toBe(100);
    expect(cap.minFidelity).toBe(0.90);
  });
});

// ── Mirror Config Validation ────────────────────────────────────────────────

describe("validateMirrorConfig", () => {
  const validMirror: CrossSubstrateMirror = {
    functionId: fnId("sensory-integration"),
    category: MirrorCategory.CoreConscious,
    primarySubstrate: Substrate.Bio,
    primaryInstance: "cortex-v1",
    mirrorSubstrate: Substrate.Synth,
    mirrorInstance: "synth-v1-mirror",
    syncConfig: {
      syncInterval_ms: 8,
      syncFidelity: 0.995,
      syncLatencyBudget_ms: 5,
    },
    activationLatency_ms: 5,
    fidelityAtActivation: 0.99,
  };

  it("accepts a valid core-conscious mirror config", () => {
    const errors = validateMirrorConfig(validMirror);
    expect(errors).toHaveLength(0);
  });

  it("rejects sync interval exceeding category maximum", () => {
    const bad = { ...validMirror, syncConfig: { ...validMirror.syncConfig, syncInterval_ms: 15 } };
    const errors = validateMirrorConfig(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("syncInterval");
  });

  it("rejects fidelity below category minimum", () => {
    const bad = { ...validMirror, syncConfig: { ...validMirror.syncConfig, syncFidelity: 0.9 } };
    const errors = validateMirrorConfig(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Fidelity");
  });

  it("rejects mirror on same substrate as primary", () => {
    const bad = { ...validMirror, mirrorSubstrate: Substrate.Bio };
    const errors = validateMirrorConfig(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("substrate");
  });
});
