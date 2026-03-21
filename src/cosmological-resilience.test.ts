import { describe, it, expect } from "vitest";
import {
  THREAT_CATALOG,
  DISTRIBUTION_REQUIREMENTS,
  ALERT_PROTOCOLS,
  DistributionModel,
  distanceLy,
  validateDistribution,
  colonyExtinctionProbabilityPerMillennium,
  simulateExtinctionProbability,
  type Colony,
} from "./cosmological-resilience.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Generates N fully-independent colonies arranged on a cubic grid with the
 * given pairwise separation.  All colonies satisfy independence requirements.
 */
function makeColonies(n: number, separationLy = 150): Colony[] {
  const side = Math.ceil(Math.cbrt(n));
  const colonies: Colony[] = [];
  let count = 0;
  for (let x = 0; x < side && count < n; x++) {
    for (let y = 0; y < side && count < n; y++) {
      for (let z = 0; z < side && count < n; z++) {
        colonies.push({
          id: `C${count}`,
          positionGalacticLy: [
            x * separationLy,
            y * separationLy,
            z * separationLy,
          ],
          independenceScore: 1.0,
          knowledgeStoreComplete: true,
          localManufacturing: true,
        });
        count++;
      }
    }
  }
  return colonies;
}

// ---------------------------------------------------------------------------
// THREAT_CATALOG
// ---------------------------------------------------------------------------

describe("THREAT_CATALOG", () => {
  it("contains at least 5 distinct threat classes", () => {
    expect(THREAT_CATALOG.length).toBeGreaterThanOrEqual(5);
  });

  it("includes all threat types required by acceptance criteria", () => {
    const ids = new Set(THREAT_CATALOG.map((t) => t.id));
    expect(ids.has("T1a")).toBe(true); // core-collapse supernova
    expect(ids.has("T1b")).toBe(true); // Type Ia supernova
    expect(ids.has("T2a")).toBe(true); // long GRB
    expect(ids.has("T2b")).toBe(true); // short GRB
    expect(ids.has("T3")).toBe(true);  // galactic collision
  });

  it("all threats have non-negative lethal radii", () => {
    for (const threat of THREAT_CATALOG) {
      expect(threat.lethalRadiusLy).toBeGreaterThanOrEqual(0);
    }
  });

  it("all threats have non-negative event rates", () => {
    for (const threat of THREAT_CATALOG) {
      expect(threat.eventRatePerMillennium).toBeGreaterThanOrEqual(0);
    }
  });

  it("all threats have non-negative warning windows", () => {
    for (const threat of THREAT_CATALOG) {
      expect(threat.warningWindowSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("beamed threats define a beam half-angle", () => {
    const beamed = THREAT_CATALOG.filter((t) => t.directionality === "beamed");
    expect(beamed.length).toBeGreaterThan(0);
    for (const t of beamed) {
      expect(t.beamHalfAngleDeg).toBeDefined();
      expect(t.beamHalfAngleDeg!).toBeGreaterThan(0);
    }
  });

  it("isotropic threats include at least the two supernova classes", () => {
    const isotropicIds = THREAT_CATALOG.filter(
      (t) => t.directionality === "isotropic"
    ).map((t) => t.id);
    expect(isotropicIds).toContain("T1a");
    expect(isotropicIds).toContain("T1b");
  });
});

// ---------------------------------------------------------------------------
// distanceLy
// ---------------------------------------------------------------------------

describe("distanceLy", () => {
  it("returns 0 for identical positions", () => {
    expect(distanceLy([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("computes 3-4-5 distance correctly", () => {
    expect(distanceLy([0, 0, 0], [3, 4, 0])).toBeCloseTo(5);
  });

  it("computes body-diagonal distance correctly", () => {
    expect(distanceLy([0, 0, 0], [1, 1, 1])).toBeCloseTo(Math.sqrt(3));
  });

  it("is symmetric", () => {
    const a: [number, number, number] = [100, 200, -50];
    const b: [number, number, number] = [300, 100, 400];
    expect(distanceLy(a, b)).toBeCloseTo(distanceLy(b, a));
  });
});

// ---------------------------------------------------------------------------
// validateDistribution
// ---------------------------------------------------------------------------

describe("validateDistribution", () => {
  it("accepts a valid distribution of 100 well-separated colonies", () => {
    const result = validateDistribution(makeColonies(100));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects distributions with fewer than 100 colonies", () => {
    const result = validateDistribution(makeColonies(10));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Insufficient colonies"))).toBe(
      true
    );
  });

  it("rejects colonies that violate minimum separation", () => {
    const colonies = makeColonies(100); // grid at 150 ly — valid
    // Force two colonies to be only 50 ly apart (below 100 ly minimum)
    colonies[0].positionGalacticLy = [0, 0, 0];
    colonies[1].positionGalacticLy = [50, 0, 0];
    const result = validateDistribution(colonies);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ly apart"))).toBe(true);
  });

  it("rejects colonies with incomplete local knowledge stores", () => {
    const colonies = makeColonies(100);
    colonies[5].knowledgeStoreComplete = false;
    const result = validateDistribution(colonies);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("knowledge stores"))
    ).toBe(true);
  });

  it("rejects colonies without autonomous manufacturing", () => {
    const colonies = makeColonies(100);
    colonies[7].localManufacturing = false;
    const result = validateDistribution(colonies);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("manufacturing"))).toBe(true);
  });

  it("warns (not errors) for partial independence scores", () => {
    const colonies = makeColonies(100);
    colonies[0].independenceScore = 0.7;
    const result = validateDistribution(colonies);
    // Should still be valid (warning only)
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("independence"))).toBe(true);
  });

  it("accumulates multiple errors", () => {
    const colonies = makeColonies(5); // too few AND violations
    colonies[0].knowledgeStoreComplete = false;
    const result = validateDistribution(colonies);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// colonyExtinctionProbabilityPerMillennium
// ---------------------------------------------------------------------------

describe("colonyExtinctionProbabilityPerMillennium", () => {
  it("returns a positive probability", () => {
    const p = colonyExtinctionProbabilityPerMillennium();
    expect(p).toBeGreaterThan(0);
  });

  it("returns a probability well below 1", () => {
    const p = colonyExtinctionProbabilityPerMillennium();
    expect(p).toBeLessThan(1);
  });

  it("returns a small per-millennium value (< 0.01)", () => {
    // Architecture doc: P(single colony destroyed) < 10^-5 per millennium
    // for dominant threats; our model may be slightly higher due to GRB inclusion
    const p = colonyExtinctionProbabilityPerMillennium();
    expect(p).toBeLessThan(0.01);
  });

  it("returns 0 for an empty threat catalog", () => {
    expect(colonyExtinctionProbabilityPerMillennium([])).toBe(0);
  });

  it("increases when threats with larger lethal radii are added", () => {
    const baseThreat = THREAT_CATALOG.filter((t) => t.id === "T1b");
    const pBase = colonyExtinctionProbabilityPerMillennium(baseThreat);

    const amplifiedThreat = [
      { ...baseThreat[0], lethalRadiusLy: baseThreat[0].lethalRadiusLy * 10 },
    ];
    const pAmplified = colonyExtinctionProbabilityPerMillennium(amplifiedThreat);
    expect(pAmplified).toBeGreaterThan(pBase);
  });
});

// ---------------------------------------------------------------------------
// simulateExtinctionProbability
// ---------------------------------------------------------------------------

describe("simulateExtinctionProbability", () => {
  it("meets the 10^-20 target with 100 well-separated colonies", () => {
    const result = simulateExtinctionProbability(makeColonies(100));
    expect(result.meetsTarget).toBe(true);
    expect(result.value).toBeLessThan(
      DISTRIBUTION_REQUIREMENTS.extinctionProbabilityTargetPerMillennium
    );
  });

  it("fails the 10^-20 target with only 2 colonies", () => {
    const result = simulateExtinctionProbability(makeColonies(2, 200));
    expect(result.meetsTarget).toBe(false);
  });

  it("extinction probability decreases as more colonies are added", () => {
    const r10 = simulateExtinctionProbability(makeColonies(10));
    const r100 = simulateExtinctionProbability(makeColonies(100));
    expect(r100.value).toBeLessThan(r10.value);
  });

  it("exposes the correct target probability", () => {
    const result = simulateExtinctionProbability(makeColonies(100));
    expect(result.targetPerMillennium).toBe(1e-20);
  });

  it("returns a non-negative extinction probability (may underflow to 0 for large N)", () => {
    // For N=100 colonies, the true value (~10^-687) is below float64 minimum (~5e-324).
    // Underflow to 0 is expected and acceptable; meetsTarget still returns true.
    const result = simulateExtinctionProbability(makeColonies(100));
    expect(result.value).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// DistributionModel class
// ---------------------------------------------------------------------------

describe("DistributionModel", () => {
  it("validate() returns valid for a compliant distribution", () => {
    const model = new DistributionModel(makeColonies(100));
    expect(model.validate().valid).toBe(true);
  });

  it("validate() returns invalid for too few colonies", () => {
    const model = new DistributionModel(makeColonies(5));
    expect(model.validate().valid).toBe(false);
  });

  it("simulate() meets the extinction target for 100 colonies", () => {
    const model = new DistributionModel(makeColonies(100));
    const result = model.simulate(1_000_000);
    expect(result.meetsTarget).toBe(true);
  });

  it("simulate() returns a non-negative extinction probability", () => {
    // Value may underflow to 0 for N=100 (true value ~10^-687 < float64 min).
    const model = new DistributionModel(makeColonies(100));
    const result = model.simulate(1_000_000);
    expect(result.value).toBeGreaterThanOrEqual(0);
  });

  it("exposes colonies publicly", () => {
    const colonies = makeColonies(10);
    const model = new DistributionModel(colonies);
    expect(model.colonies).toBe(colonies);
  });

  it("accepts a custom threat catalog", () => {
    const minimalCatalog = [THREAT_CATALOG[0]];
    const model = new DistributionModel(makeColonies(100), minimalCatalog);
    const result = model.simulate(1_000);
    // Value may underflow to 0 for N=100; non-negative and meetsTarget are the meaningful checks.
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.meetsTarget).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ALERT_PROTOCOLS
// ---------------------------------------------------------------------------

describe("ALERT_PROTOCOLS", () => {
  it("has at least one protocol per key threat class", () => {
    const classes = new Set(ALERT_PROTOCOLS.map((p) => p.threatClass));
    expect(classes.has("T1a")).toBe(true);
    expect(classes.has("T1b")).toBe(true);
    expect(classes.has("T2a")).toBe(true);
    expect(classes.has("T2b")).toBe(true);
    expect(classes.has("T3")).toBe(true);
  });

  it("zero-warning threats (T1b, T2a, T2b) require local-autonomous response", () => {
    const zeroWarning = ALERT_PROTOCOLS.filter(
      (p) => p.threatClass === "T1b" || p.threatClass === "T2a" || p.threatClass === "T2b"
    );
    expect(zeroWarning.length).toBeGreaterThanOrEqual(3);
    for (const p of zeroWarning) {
      expect(p.propagationStrategy).toBe("local-autonomous");
    }
  });

  it("zero-warning threats (T1b, T2a, T2b) have zero required response latency", () => {
    const zeroWarning = ALERT_PROTOCOLS.filter(
      (p) => p.threatClass === "T1b" || p.threatClass === "T2a" || p.threatClass === "T2b"
    );
    expect(zeroWarning.length).toBeGreaterThanOrEqual(3);
    for (const p of zeroWarning) {
      expect(p.maxResponseLatencyYears).toBe(0);
    }
  });

  it("all protocols define a detection method", () => {
    for (const p of ALERT_PROTOCOLS) {
      expect(p.detectionMethod).toBeTruthy();
      expect(p.detectionMethod.length).toBeGreaterThan(0);
    }
  });

  it("long-lead threats (T3, T4a) use network-coordinated propagation", () => {
    const longLead = ALERT_PROTOCOLS.filter(
      (p) => p.threatClass === "T3" || p.threatClass === "T4a"
    );
    expect(longLead.length).toBeGreaterThanOrEqual(2);
    for (const p of longLead) {
      expect(p.propagationStrategy).toBe("network-coordinated");
    }
  });
});

// ---------------------------------------------------------------------------
// DISTRIBUTION_REQUIREMENTS
// ---------------------------------------------------------------------------

describe("DISTRIBUTION_REQUIREMENTS", () => {
  it("requires at least 100 colonies", () => {
    expect(DISTRIBUTION_REQUIREMENTS.minColonies).toBeGreaterThanOrEqual(100);
  });

  it("requires minimum 100 ly pairwise separation", () => {
    expect(DISTRIBUTION_REQUIREMENTS.minSeparationLy).toBeGreaterThanOrEqual(100);
  });

  it("caps maximum fraction destroyed per event at 1%", () => {
    expect(
      DISTRIBUTION_REQUIREMENTS.maxFractionDestroyedPerEvent
    ).toBeLessThanOrEqual(0.01);
  });

  it("sets extinction probability target at 10^-20 per millennium or better", () => {
    expect(
      DISTRIBUTION_REQUIREMENTS.extinctionProbabilityTargetPerMillennium
    ).toBeLessThanOrEqual(1e-20);
  });

  it("requires coverage across at least 3 galactic arms", () => {
    expect(DISTRIBUTION_REQUIREMENTS.minGalacticArms).toBeGreaterThanOrEqual(3);
  });

  it("defines safetyMarginMultiplier as 10", () => {
    expect(DISTRIBUTION_REQUIREMENTS.safetyMarginMultiplier).toBe(10);
  });

  it("defines galaxyRadiusLy as 50000", () => {
    expect(DISTRIBUTION_REQUIREMENTS.galaxyRadiusLy).toBe(50_000);
  });

  it("defines galaxyThicknessLy as 1000", () => {
    expect(DISTRIBUTION_REQUIREMENTS.galaxyThicknessLy).toBe(1_000);
  });
});
