/**
 * Compositional Adaptation — Tests
 *
 * Verifies the compositional variance adaptation from Architecture Section 6:
 *   - Gap analysis between required and available materials
 *   - Substitution lookup for deficit/absent materials (feasible and infeasible)
 *   - Substitution plan validation against MAX_SUBSTITUTION_DEGRADATION_PERCENT
 *   - Adaptation entry creation with timestamps
 *   - Stellar type timeline adjustment (F, G, K, M multipliers)
 *   - Full adaptation pipeline end-to-end
 *
 * Tests cover acceptance criteria:
 *   - Given deficit materials with available substitutes → feasible = true
 *   - Given no substitutes available → feasible = false with reason
 *   - Given G-type star → computeAdjustedTimeline(50, "G") returns 50
 *   - Given M-type star → computeAdjustedTimeline(50, "M") returns 200
 */

import { describe, it, expect } from "vitest";
import {
  analyzeGaps,
  lookupSubstitutions,
  validateSubstitutionPlan,
  createAdaptationEntries,
  getStellarTypeAdaptation,
  computeAdjustedTimeline,
  runAdaptationPipeline,
  MATERIAL_SUBSTITUTION_TABLE,
} from "../compositional-adaptation.js";
import {
  MAX_SUBSTITUTION_DEGRADATION_PERCENT,
  STELLAR_TYPE_ADAPTATIONS,
} from "../types.js";

// ── Gap Analysis ─────────────────────────────────────────────────────────────

describe("analyzeGaps", () => {
  it("categorizes surplus materials (available > 1.5x required)", () => {
    const result = analyzeGaps({
      requiredMaterials: new Map([["iron", 100]]),
      availableMaterials: new Map([["iron", 200]]),
    });

    expect(result.surplus).toContain("iron");
    expect(result.deficit).toHaveLength(0);
    expect(result.absent).toHaveLength(0);
  });

  it("categorizes sufficient materials (available >= required, <= 1.5x)", () => {
    const result = analyzeGaps({
      requiredMaterials: new Map([["iron", 100]]),
      availableMaterials: new Map([["iron", 120]]),
    });

    expect(result.sufficient).toContain("iron");
  });

  it("categorizes deficit materials (available > 0 but < required)", () => {
    const result = analyzeGaps({
      requiredMaterials: new Map([["tungsten", 100]]),
      availableMaterials: new Map([["tungsten", 30]]),
    });

    expect(result.deficit).toContain("tungsten");
  });

  it("categorizes absent materials (not available at all)", () => {
    const result = analyzeGaps({
      requiredMaterials: new Map([["tungsten", 100]]),
      availableMaterials: new Map(),
    });

    expect(result.absent).toContain("tungsten");
  });

  it("handles mixed categories across multiple materials", () => {
    const result = analyzeGaps({
      requiredMaterials: new Map([
        ["iron", 100],
        ["tungsten", 50],
        ["copper", 30],
        ["gold", 10],
      ]),
      availableMaterials: new Map([
        ["iron", 200],     // surplus
        ["tungsten", 50],  // sufficient (exactly at 1.0x)
        ["copper", 10],    // deficit
        // gold absent
      ]),
    });

    expect(result.surplus).toContain("iron");
    expect(result.sufficient).toContain("tungsten");
    expect(result.deficit).toContain("copper");
    expect(result.absent).toContain("gold");
  });
});

// ── Substitution Lookup ──────────────────────────────────────────────────────

describe("lookupSubstitutions", () => {
  it("returns feasible plan when deficit materials have available substitutes", () => {
    const gapReport = {
      surplus: [],
      sufficient: [],
      deficit: ["tungsten" as const],
      absent: [],
    };

    const availableMaterials = new Map([
      ["molybdenum", 100],
    ]);

    const plan = lookupSubstitutions(gapReport, availableMaterials);

    expect(plan.feasible).toBe(true);
    expect(plan.infeasibilityReason).toBeNull();
    expect(plan.substitutions).toHaveLength(1);
    expect(plan.substitutions[0].originalMaterial).toBe("tungsten");
    expect(plan.substitutions[0].substituteMaterial).toBe("molybdenum");
    expect(Math.abs(plan.substitutions[0].performanceDeltaPercent)).toBeLessThanOrEqual(
      MAX_SUBSTITUTION_DEGRADATION_PERCENT,
    );
  });

  it("returns infeasible plan when no substitutes are available", () => {
    const gapReport = {
      surplus: [],
      sufficient: [],
      deficit: [],
      absent: ["unobtanium" as const],
    };

    const availableMaterials = new Map<string, number>();

    const plan = lookupSubstitutions(gapReport, availableMaterials);

    expect(plan.feasible).toBe(false);
    expect(plan.infeasibilityReason).not.toBeNull();
    expect(plan.infeasibilityReason).toContain("unobtanium");
  });

  it("handles absent materials - picks first available substitute", () => {
    const gapReport = {
      surplus: [],
      sufficient: [],
      deficit: [],
      absent: ["aluminum" as const],
    };

    // Only titanium available, not magnesium_alloy — skips to titanium
    const availableMaterials = new Map([
      ["titanium", 50],
    ]);

    const plan = lookupSubstitutions(gapReport, availableMaterials);

    expect(plan.feasible).toBe(true);
    expect(plan.substitutions[0].substituteMaterial).toBe("titanium");
  });

  it("handles multiple deficit materials", () => {
    const gapReport = {
      surplus: [],
      sufficient: [],
      deficit: ["tungsten" as const, "copper" as const],
      absent: [],
    };

    const availableMaterials = new Map([
      ["molybdenum", 100],
      ["silver", 50],
    ]);

    const plan = lookupSubstitutions(gapReport, availableMaterials);

    expect(plan.feasible).toBe(true);
    expect(plan.substitutions).toHaveLength(2);
  });

  it("returns infeasible when substitute exists in table but is not available locally", () => {
    const gapReport = {
      surplus: [],
      sufficient: [],
      deficit: ["tungsten" as const],
      absent: [],
    };

    // Neither molybdenum nor lead available
    const availableMaterials = new Map<string, number>();

    const plan = lookupSubstitutions(gapReport, availableMaterials);

    expect(plan.feasible).toBe(false);
    expect(plan.infeasibilityReason).toContain("tungsten");
  });
});

// ── Substitution Plan Validation ─────────────────────────────────────────────

describe("validateSubstitutionPlan", () => {
  it("validates a feasible plan with degradation within limits", () => {
    const plan = {
      substitutions: [
        {
          originalMaterial: "tungsten",
          substituteMaterial: "molybdenum",
          application: "radiation_shielding",
          performanceDeltaPercent: -5,
          reason: "tungsten unavailable",
        },
      ],
      feasible: true,
      infeasibilityReason: null,
    };

    expect(validateSubstitutionPlan(plan)).toBe(true);
  });

  it("rejects an infeasible plan", () => {
    const plan = {
      substitutions: [],
      feasible: false,
      infeasibilityReason: "No viable substitutions",
    };

    expect(validateSubstitutionPlan(plan)).toBe(false);
  });

  it("rejects a plan with degradation exceeding MAX_SUBSTITUTION_DEGRADATION_PERCENT", () => {
    const plan = {
      substitutions: [
        {
          originalMaterial: "specialium",
          substituteMaterial: "weakium",
          application: "structural",
          performanceDeltaPercent: -15, // exceeds 10%
          reason: "only option",
        },
      ],
      feasible: true,
      infeasibilityReason: null,
    };

    expect(validateSubstitutionPlan(plan)).toBe(false);
  });
});

// ── Adaptation Entry Creation ────────────────────────────────────────────────

describe("createAdaptationEntries", () => {
  it("creates adaptation entries from a substitution plan", () => {
    const plan = {
      substitutions: [
        {
          originalMaterial: "tungsten",
          substituteMaterial: "molybdenum",
          application: "radiation_shielding",
          performanceDeltaPercent: -5,
          reason: "tungsten unavailable",
        },
      ],
      feasible: true,
      infeasibilityReason: null,
    };

    const entries = createAdaptationEntries(plan, 42.5);

    expect(entries).toHaveLength(1);
    expect(entries[0].timestampYears).toBe(42.5);
    expect(entries[0].category).toBe("material_substitution");
    expect(entries[0].validated).toBe(true);
    expect(entries[0].description).toContain("tungsten");
    expect(entries[0].description).toContain("molybdenum");
    expect(entries[0].substitution).not.toBeNull();
  });

  it("creates multiple entries for multiple substitutions", () => {
    const plan = {
      substitutions: [
        {
          originalMaterial: "tungsten",
          substituteMaterial: "molybdenum",
          application: "radiation_shielding",
          performanceDeltaPercent: -5,
          reason: "deficit",
        },
        {
          originalMaterial: "copper",
          substituteMaterial: "silver",
          application: "thermal_electrical",
          performanceDeltaPercent: -2,
          reason: "deficit",
        },
      ],
      feasible: true,
      infeasibilityReason: null,
    };

    const entries = createAdaptationEntries(plan, 100);

    expect(entries).toHaveLength(2);
    expect(entries[0].substitution!.originalMaterial).toBe("tungsten");
    expect(entries[1].substitution!.originalMaterial).toBe("copper");
  });
});

// ── Stellar Type Adaptation ──────────────────────────────────────────────────

describe("getStellarTypeAdaptation", () => {
  it("returns adaptation for G-type star", () => {
    const adaptation = getStellarTypeAdaptation("G");
    expect(adaptation).not.toBeNull();
    expect(adaptation!.spectralClass).toBe("G");
    expect(adaptation!.timelineMultiplier).toBe(1.0);
  });

  it("returns adaptation for M-type star", () => {
    const adaptation = getStellarTypeAdaptation("M");
    expect(adaptation).not.toBeNull();
    expect(adaptation!.spectralClass).toBe("M");
    expect(adaptation!.timelineMultiplier).toBe(4.0);
  });

  it("returns adaptation for F-type star", () => {
    const adaptation = getStellarTypeAdaptation("F");
    expect(adaptation).not.toBeNull();
    expect(adaptation!.timelineMultiplier).toBe(0.8);
  });

  it("returns adaptation for K-type star", () => {
    const adaptation = getStellarTypeAdaptation("K");
    expect(adaptation).not.toBeNull();
    expect(adaptation!.timelineMultiplier).toBe(2.0);
  });
});

describe("computeAdjustedTimeline", () => {
  it("returns baseline duration for G-type star (multiplier 1.0)", () => {
    expect(computeAdjustedTimeline(50, "G")).toBe(50);
  });

  it("returns 4x duration for M-type star (multiplier 4.0)", () => {
    expect(computeAdjustedTimeline(50, "M")).toBe(200);
  });

  it("returns 0.8x duration for F-type star (multiplier 0.8)", () => {
    expect(computeAdjustedTimeline(50, "F")).toBe(40);
  });

  it("returns 2x duration for K-type star (multiplier 2.0)", () => {
    expect(computeAdjustedTimeline(50, "K")).toBe(100);
  });

  it("returns baseline for unknown stellar type", () => {
    expect(computeAdjustedTimeline(50, "O" as any)).toBe(50);
  });
});

// ── Full Adaptation Pipeline ─────────────────────────────────────────────────

describe("runAdaptationPipeline", () => {
  it("runs full pipeline successfully with substitutions needed", () => {
    const result = runAdaptationPipeline({
      requiredMaterials: new Map([
        ["iron", 100],
        ["tungsten", 50],
      ]),
      availableMaterials: new Map([
        ["iron", 200],
        ["molybdenum", 100],
      ]),
      spectralClass: "G",
      timestampYears: 42,
      baselineDurationYears: 50,
    });

    expect(result.gapReport.surplus).toContain("iron");
    expect(result.gapReport.absent).toContain("tungsten");
    expect(result.substitutionPlan.feasible).toBe(true);
    expect(result.feasible).toBe(true);
    expect(result.adaptationEntries.length).toBeGreaterThan(0);
    expect(result.adjustedDurationYears).toBe(50); // G-type = 1.0x
    expect(result.infeasibilityReason).toBeNull();
  });

  it("reports infeasible when substitutions cannot be resolved", () => {
    const result = runAdaptationPipeline({
      requiredMaterials: new Map([
        ["unobtanium", 100],
      ]),
      availableMaterials: new Map(),
      spectralClass: "K",
      timestampYears: 100,
      baselineDurationYears: 50,
    });

    expect(result.feasible).toBe(false);
    expect(result.infeasibilityReason).not.toBeNull();
    expect(result.adaptationEntries).toHaveLength(0);
    expect(result.adjustedDurationYears).toBe(100); // K-type = 2.0x
  });

  it("adjusts timeline for M-type stellar system", () => {
    const result = runAdaptationPipeline({
      requiredMaterials: new Map([["iron", 100]]),
      availableMaterials: new Map([["iron", 200]]),
      spectralClass: "M",
      timestampYears: 200,
      baselineDurationYears: 50,
    });

    expect(result.adjustedDurationYears).toBe(200); // M-type = 4.0x
    expect(result.feasible).toBe(true);
  });
});

// ── Material Substitution Table Invariants ───────────────────────────────────

describe("MATERIAL_SUBSTITUTION_TABLE", () => {
  it("has entries only within MAX_SUBSTITUTION_DEGRADATION_PERCENT", () => {
    for (const entry of MATERIAL_SUBSTITUTION_TABLE) {
      expect(entry.maxDegradationPercent).toBeLessThanOrEqual(
        MAX_SUBSTITUTION_DEGRADATION_PERCENT,
      );
    }
  });

  it("has non-empty required and substitute materials", () => {
    for (const entry of MATERIAL_SUBSTITUTION_TABLE) {
      expect(entry.requiredMaterial.length).toBeGreaterThan(0);
      expect(entry.allowedSubstitute.length).toBeGreaterThan(0);
      expect(entry.application.length).toBeGreaterThan(0);
    }
  });
});
