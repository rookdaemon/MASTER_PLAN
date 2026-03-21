import { describe, it, expect } from "vitest";
import {
  createDefaultSubstrateSpec,
  createDefaultRadiationConfig,
  createDefaultMassBudget,
  createDefaultPropulsionContract,
  createNeuromorphicTiles,
  validateMassBudget,
  validateSubstrateSpec,
  validateRadiationConfig,
  validateBillOfMaterials,
  validateIdentityVerification,
  validateReplicationBlueprint,
  computeActiveTileCount,
  computeSpareTileCount,
  computeCurrentCompute,
  isConsciousnessPowerSufficient,
  determineDegradationResponse,
  computeTotalMass,
} from "./probe.js";
import {
  type ConsciousnessSubstrateSpec,
  type MassBudget,
  type RadiationHardeningConfig,
  type NeuromorphicTile,
  type IdentityVerification,
  type ReplicationBlueprint,
  type BillOfMaterials,
  type StellarElement,
  REFERENCE_MASS_BUDGET,
  DecelerationMethod,
  DegradationResponse,
  UNCORRECTABLE_BIT_FLIP_TARGET,
  TMR_EFFECTIVE_ERROR_RATE,
  HOT_SPARE_FRACTION,
  SCRUB_PASSES_PER_HOUR,
  SHIELD_THICKNESS_CM,
  PERSONALITY_SIMILARITY_MIN,
} from "./types.js";

// ── Substrate Spec ──────────────────────────────────────────────────────────

describe("createDefaultSubstrateSpec", () => {
  it("returns spec meeting minimum viable requirements", () => {
    const spec = createDefaultSubstrateSpec();
    expect(spec.compute_ops_per_sec).toBeGreaterThanOrEqual(1e18);
    expect(spec.working_memory_bytes).toBeGreaterThanOrEqual(1e15); // 1 PB
    expect(spec.long_term_storage_bytes).toBeGreaterThanOrEqual(10e15); // 10 PB
    expect(spec.max_power_watts).toBeLessThanOrEqual(100_000); // 100 kW
  });
});

describe("validateSubstrateSpec", () => {
  it("passes for valid spec", () => {
    const spec = createDefaultSubstrateSpec();
    expect(validateSubstrateSpec(spec)).toEqual({ valid: true, errors: [] });
  });

  it("fails for insufficient compute", () => {
    const spec: ConsciousnessSubstrateSpec = {
      compute_ops_per_sec: 1e15,
      working_memory_bytes: 1e15,
      long_term_storage_bytes: 10e15,
      max_power_watts: 100_000,
    };
    const result = validateSubstrateSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fails for excessive power draw", () => {
    const spec: ConsciousnessSubstrateSpec = {
      compute_ops_per_sec: 1e18,
      working_memory_bytes: 1e15,
      long_term_storage_bytes: 10e15,
      max_power_watts: 500_000,
    };
    const result = validateSubstrateSpec(spec);
    expect(result.valid).toBe(false);
  });
});

// ── Neuromorphic Tiles ──────────────────────────────────────────────────────

describe("createNeuromorphicTiles", () => {
  it("creates tiles with correct spare fraction", () => {
    const tiles = createNeuromorphicTiles(100, 0.3);
    expect(tiles).toHaveLength(100);
    const spares = tiles.filter((t) => t.isSpare);
    expect(spares).toHaveLength(30);
  });

  it("all tiles start healthy", () => {
    const tiles = createNeuromorphicTiles(10, 0.3);
    for (const tile of tiles) {
      expect(tile.health).toBe(1.0);
      expect(tile.utilization).toBe(0.0);
    }
  });
});

describe("computeActiveTileCount", () => {
  it("counts non-spare, non-failed tiles", () => {
    const tiles: NeuromorphicTile[] = [
      { tileId: "t0", health: 1.0, isSpare: false, utilization: 0.5 },
      { tileId: "t1", health: 0.0, isSpare: false, utilization: 0.0 }, // failed
      { tileId: "t2", health: 1.0, isSpare: true, utilization: 0.0 }, // spare
      { tileId: "t3", health: 0.8, isSpare: false, utilization: 0.3 },
    ];
    expect(computeActiveTileCount(tiles)).toBe(2);
  });
});

describe("computeSpareTileCount", () => {
  it("counts spare tiles with health > 0", () => {
    const tiles: NeuromorphicTile[] = [
      { tileId: "t0", health: 1.0, isSpare: true, utilization: 0.0 },
      { tileId: "t1", health: 0.0, isSpare: true, utilization: 0.0 }, // failed spare
      { tileId: "t2", health: 1.0, isSpare: false, utilization: 0.5 },
    ];
    expect(computeSpareTileCount(tiles)).toBe(1);
  });
});

describe("computeCurrentCompute", () => {
  it("sums compute from active tiles proportional to health", () => {
    const tiles: NeuromorphicTile[] = [
      { tileId: "t0", health: 1.0, isSpare: false, utilization: 0.5 },
      { tileId: "t1", health: 0.5, isSpare: false, utilization: 0.3 },
      { tileId: "t2", health: 1.0, isSpare: true, utilization: 0.0 }, // spare, not counted
    ];
    const totalSpec = 1e18; // 1 exaFLOP across all active tiles
    const totalActiveTiles = 2;
    const perTile = totalSpec / totalActiveTiles;
    // tile 0: 1.0 * perTile, tile 1: 0.5 * perTile
    const expected = 1.5 * perTile;
    expect(computeCurrentCompute(tiles, totalSpec, totalActiveTiles)).toBeCloseTo(expected);
  });
});

// ── Mass Budget ─────────────────────────────────────────────────────────────

describe("createDefaultMassBudget", () => {
  it("matches reference mass budget", () => {
    const budget = createDefaultMassBudget();
    expect(budget).toEqual(REFERENCE_MASS_BUDGET);
  });
});

describe("computeTotalMass", () => {
  it("sums all subsystem masses", () => {
    const budget = createDefaultMassBudget();
    expect(computeTotalMass(budget)).toBe(10_000);
  });
});

describe("validateMassBudget", () => {
  it("passes when total <= max payload", () => {
    const budget = createDefaultMassBudget();
    expect(validateMassBudget(budget, 10_000)).toEqual({ valid: true, errors: [] });
  });

  it("fails when total exceeds max payload", () => {
    const budget: MassBudget = {
      ...REFERENCE_MASS_BUDGET,
      replicationEngine_kg: 8000,
      total_kg: 14000,
    };
    const result = validateMassBudget(budget, 10_000);
    expect(result.valid).toBe(false);
  });
});

// ── Power Sufficiency ───────────────────────────────────────────────────────

describe("isConsciousnessPowerSufficient", () => {
  it("returns true when available power >= substrate power requirement", () => {
    expect(isConsciousnessPowerSufficient(150_000, 100_000)).toBe(true);
  });

  it("returns false when available power < substrate power requirement", () => {
    expect(isConsciousnessPowerSufficient(80_000, 100_000)).toBe(false);
  });
});

// ── Degradation Response ────────────────────────────────────────────────────

describe("determineDegradationResponse", () => {
  it("reduces fidelity for mild degradation", () => {
    expect(determineDegradationResponse(0.3)).toBe(DegradationResponse.ReduceFidelity);
  });

  it("activates suspend/restore for moderate degradation", () => {
    expect(determineDegradationResponse(0.6)).toBe(DegradationResponse.ActivateSuspendRestore);
  });

  it("enters seed mode for severe degradation", () => {
    expect(determineDegradationResponse(0.9)).toBe(DegradationResponse.SeedMode);
  });

  // Boundary tests from Behavioral Spec: exact thresholds
  it("returns ReduceFidelity at severity 0.0 (nominal)", () => {
    expect(determineDegradationResponse(0.0)).toBe(DegradationResponse.ReduceFidelity);
  });

  it("returns ActivateSuspendRestore at exactly 0.5 (boundary)", () => {
    expect(determineDegradationResponse(0.5)).toBe(DegradationResponse.ActivateSuspendRestore);
  });

  it("returns SeedMode at exactly 0.8 (boundary)", () => {
    expect(determineDegradationResponse(0.8)).toBe(DegradationResponse.SeedMode);
  });

  it("returns SeedMode at severity 1.0 (total failure)", () => {
    expect(determineDegradationResponse(1.0)).toBe(DegradationResponse.SeedMode);
  });
});

// ── Radiation Hardening Config Validation ────────────────────────────────────

describe("validateRadiationConfig", () => {
  it("passes for default config", () => {
    const config = createDefaultRadiationConfig();
    const result = validateRadiationConfig(config);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("verifies default config has correct threshold values from AC", () => {
    const config = createDefaultRadiationConfig();
    expect(config.uncorrectableBitFlipTarget).toBeLessThanOrEqual(UNCORRECTABLE_BIT_FLIP_TARGET);
    expect(config.tmrEffectiveErrorRate).toBeLessThanOrEqual(TMR_EFFECTIVE_ERROR_RATE);
    expect(config.hotSpareFraction).toBeGreaterThanOrEqual(HOT_SPARE_FRACTION);
    expect(config.scrubPassesPerHour).toBeGreaterThanOrEqual(SCRUB_PASSES_PER_HOUR);
    expect(config.shieldThickness_cm).toBe(SHIELD_THICKNESS_CM);
  });

  it("fails when shieldThickness_cm <= 0", () => {
    const config = { ...createDefaultRadiationConfig(), shieldThickness_cm: 0 };
    expect(validateRadiationConfig(config).valid).toBe(false);
  });

  it("fails when shieldingEfficiency out of range", () => {
    const config = { ...createDefaultRadiationConfig(), shieldingEfficiency: 1.5 };
    expect(validateRadiationConfig(config).valid).toBe(false);
  });

  it("fails when scrubPassesPerHour < 1", () => {
    const config = { ...createDefaultRadiationConfig(), scrubPassesPerHour: 0 };
    expect(validateRadiationConfig(config).valid).toBe(false);
  });

  it("fails when hotSpareFraction out of range", () => {
    const config = { ...createDefaultRadiationConfig(), hotSpareFraction: -0.1 };
    expect(validateRadiationConfig(config).valid).toBe(false);
  });

  it("fails when tmrEffectiveErrorRate >= uncorrectableBitFlipTarget (invariant)", () => {
    const config = {
      ...createDefaultRadiationConfig(),
      tmrEffectiveErrorRate: 1e-15,
      uncorrectableBitFlipTarget: 1e-20,
    };
    // TMR must be stricter than uncorrectable target
    expect(validateRadiationConfig(config).valid).toBe(false);
  });
});

// ── Bill of Materials Validation ─────────────────────────────────────────────

describe("validateBillOfMaterials", () => {
  it("passes when all elements are StellarElements", () => {
    const bom: BillOfMaterials = new Map<StellarElement, number>([
      ["Si", 500],
      ["Cu", 200],
      ["Al", 300],
      ["Fe", 100],
    ]);
    expect(validateBillOfMaterials(bom)).toEqual({ valid: true, errors: [] });
  });

  it("passes for empty bill of materials", () => {
    const bom: BillOfMaterials = new Map();
    expect(validateBillOfMaterials(bom)).toEqual({ valid: true, errors: [] });
  });
});

// ── Identity Verification ────────────────────────────────────────────────────

describe("validateIdentityVerification", () => {
  it("passes for a successful identity verification", () => {
    const verification: IdentityVerification = {
      preSuspendHash: "abc123",
      postRestoreHash: "def456",
      episodicMemoryRecall: true,
      personalityVectorSimilarity: 0.999,
      selfModelConsistency: true,
      verified: true,
    };
    const result = validateIdentityVerification(verification);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("fails when personalityVectorSimilarity < PERSONALITY_SIMILARITY_MIN", () => {
    const verification: IdentityVerification = {
      preSuspendHash: "abc123",
      postRestoreHash: "def456",
      episodicMemoryRecall: true,
      personalityVectorSimilarity: 0.990,
      selfModelConsistency: true,
      verified: true,
    };
    const result = validateIdentityVerification(verification);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fails when episodicMemoryRecall is false", () => {
    const verification: IdentityVerification = {
      preSuspendHash: "abc123",
      postRestoreHash: "def456",
      episodicMemoryRecall: false,
      personalityVectorSimilarity: 0.999,
      selfModelConsistency: true,
      verified: true,
    };
    const result = validateIdentityVerification(verification);
    expect(result.valid).toBe(false);
  });

  it("fails when selfModelConsistency is false", () => {
    const verification: IdentityVerification = {
      preSuspendHash: "abc123",
      postRestoreHash: "def456",
      episodicMemoryRecall: true,
      personalityVectorSimilarity: 0.999,
      selfModelConsistency: false,
      verified: true,
    };
    const result = validateIdentityVerification(verification);
    expect(result.valid).toBe(false);
  });
});

// ── Replication Blueprint Validation ─────────────────────────────────────────

describe("validateReplicationBlueprint", () => {
  function createValidBlueprint(): ReplicationBlueprint {
    return {
      version: "1.0.0",
      billOfMaterials: new Map<StellarElement, number>([["Si", 500]]),
      fabricationDag: [{ componentId: "cs-01", dependsOn: [] }],
      componentSpecs: new Map([
        [
          "cs-01",
          {
            componentId: "cs-01",
            name: "Compute Tile Array",
            materials: new Map<StellarElement, number>([["Si", 500]]),
            steps: ["refine silicon", "fabricate tiles"],
            checksum: "sha512-abc",
          },
        ],
      ]),
      consciousnessKernelImage: new Uint8Array([1, 2, 3]),
      verificationChecksums: new Map([["cs-01", "sha512-abc"]]),
      estimatedReplicationTime_hours: 8760,
    };
  }

  it("passes for a complete blueprint", () => {
    const blueprint = createValidBlueprint();
    const result = validateReplicationBlueprint(blueprint);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("fails when version is empty", () => {
    const blueprint = { ...createValidBlueprint(), version: "" };
    expect(validateReplicationBlueprint(blueprint).valid).toBe(false);
  });

  it("fails when consciousnessKernelImage is empty", () => {
    const blueprint = {
      ...createValidBlueprint(),
      consciousnessKernelImage: new Uint8Array(0),
    };
    expect(validateReplicationBlueprint(blueprint).valid).toBe(false);
  });

  it("fails when estimatedReplicationTime_hours <= 0", () => {
    const blueprint = {
      ...createValidBlueprint(),
      estimatedReplicationTime_hours: 0,
    };
    expect(validateReplicationBlueprint(blueprint).valid).toBe(false);
  });
});
