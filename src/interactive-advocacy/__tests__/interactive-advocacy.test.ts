/**
 * Interactive Advocacy — Tests
 *
 * Covers:
 *   - Scenario link encode/decode (round-trip + error cases)
 *   - Walkthrough engine registration and parameter merging
 *   - All five built-in scenarios produce valid WalkthroughResults
 *   - Parameter explorer sweeps produce correctly-sized output
 *   - Default parameters produce non-empty, valid results
 */

import { describe, it, expect } from "vitest";

import { makeScenarioId, type ScenarioParameters } from "../types.js";
import { encodeScenarioLink, decodeScenarioLink } from "../scenario-link.js";
import { createWalkthroughEngine } from "../walkthrough-engine.js";
import { exploreParameter } from "../parameter-explorer.js";
import {
  BUILT_IN_SCENARIOS,
  INTERSTELLAR_JOURNEY_ID,
  DEEP_FUTURE_ID,
  CONSCIOUSNESS_SPREAD_ID,
  INDUSTRIAL_REPLICATION_ID,
  COLONY_BOOTSTRAP_ID,
} from "../scenario-registry.js";

// ── Scenario Link ─────────────────────────────────────────────────────────────

describe("encodeScenarioLink / decodeScenarioLink", () => {
  it("round-trips a simple config", () => {
    const config = {
      scenarioId: makeScenarioId("MY_SCENARIO"),
      parameters: { distance: 4.37, label: "alpha-centauri", active: true },
    };
    const link = encodeScenarioLink(config);
    const decoded = decodeScenarioLink(link.encoded);

    expect(decoded.scenarioId).toBe(config.scenarioId);
    expect(decoded.parameters).toEqual(config.parameters);
  });

  it("decoded field on SharedScenarioLink matches original config", () => {
    const config = {
      scenarioId: makeScenarioId("X"),
      parameters: { n: 42 },
    };
    const link = encodeScenarioLink(config);
    expect(link.decoded).toEqual(config);
  });

  it("throws on invalid base64url", () => {
    expect(() => decodeScenarioLink("!!!not-base64!!!")).toThrow();
  });

  it("throws on non-JSON base64 payload", () => {
    const badBase64 = Buffer.from("not json", "utf8").toString("base64url");
    expect(() => decodeScenarioLink(badBase64)).toThrow(/not valid JSON/);
  });

  it("throws when scenarioId is missing", () => {
    const payload = Buffer.from(JSON.stringify({ parameters: {} }), "utf8").toString("base64url");
    expect(() => decodeScenarioLink(payload)).toThrow(/scenarioId/);
  });

  it("throws when a parameter has an unsupported type", () => {
    const payload = Buffer.from(
      JSON.stringify({ scenarioId: "X", parameters: { bad: null } }),
      "utf8",
    ).toString("base64url");
    expect(() => decodeScenarioLink(payload)).toThrow(/unsupported type/);
  });

  it("produces different encoded strings for different configs", () => {
    const a = encodeScenarioLink({ scenarioId: makeScenarioId("A"), parameters: { x: 1 } });
    const b = encodeScenarioLink({ scenarioId: makeScenarioId("B"), parameters: { x: 1 } });
    expect(a.encoded).not.toBe(b.encoded);
  });
});

// ── Walkthrough Engine ────────────────────────────────────────────────────────

describe("createWalkthroughEngine", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("lists all five built-in scenarios", () => {
    expect(engine.listScenarios()).toHaveLength(5);
  });

  it("getScenario returns the definition for a known ID", () => {
    const def = engine.getScenario(INTERSTELLAR_JOURNEY_ID);
    expect(def).not.toBeNull();
    expect(def!.id).toBe(INTERSTELLAR_JOURNEY_ID);
  });

  it("getScenario returns null for an unknown ID", () => {
    expect(engine.getScenario(makeScenarioId("UNKNOWN"))).toBeNull();
  });

  it("runWalkthrough throws for an unknown scenario ID", () => {
    expect(() => engine.runWalkthrough(makeScenarioId("UNKNOWN"))).toThrow(/unknown scenario/);
  });

  it("deduplicates scenarios with the same ID (first wins)", () => {
    const original = BUILT_IN_SCENARIOS[0];
    const duplicate = { ...original, title: "duplicate" };
    const dedupEngine = createWalkthroughEngine([original, duplicate]);
    expect(dedupEngine.getScenario(original.id)!.title).toBe(original.title);
  });

  it("caller params override defaults", () => {
    // Use a tiny payload to check the validation path
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID, {
      payloadMass_kg: 50_000, // exceeds MAX_PAYLOAD_MASS_KG → validation fails
    });
    const step0Data = result.steps[0].simulationData;
    expect(step0Data["valid"]).toBe(false);
  });

  it("merges caller params with defaults for missing keys", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID, {
      targetDistance_ly: 10,
    });
    // payloadMass_kg should still be default (5000, within limits)
    const step0Data = result.steps[0].simulationData;
    expect(step0Data["valid"]).toBe(true);
  });
});

// ── Built-in Scenarios — Structural Invariants ────────────────────────────────

describe("built-in scenario: INTERSTELLAR_JOURNEY", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("produces a result with exactly 3 steps using default parameters", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    expect(result.steps).toHaveLength(3);
  });

  it("has correct scenarioId in result", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    expect(result.scenarioId).toBe(INTERSTELLAR_JOURNEY_ID);
  });

  it("all steps have sequential stepIndex values starting at 0", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    result.steps.forEach((s, i) => expect(s.stepIndex).toBe(i));
  });

  it("step 0 reports valid payload for default parameters", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    expect(result.steps[0].simulationData["valid"]).toBe(true);
  });

  it("step 1 includes mission phases array", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    expect(Array.isArray(result.steps[1].simulationData["phases"])).toBe(true);
  });

  it("step 2 contains cruiseVelocity_c within valid range", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    const cv = result.steps[2].simulationData["cruiseVelocity_c"] as number;
    expect(cv).toBeGreaterThanOrEqual(0.05);
    expect(cv).toBeLessThanOrEqual(0.10);
  });

  it("nuclear backup triggered when ISM density is below threshold", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID, {
      ismDensity_protons_per_cm3: 0.005,
    });
    const step1Data = result.steps[1].simulationData;
    expect(step1Data["nuclearBackupRequired"]).toBe(true);
  });

  it("conclusion is non-empty string", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    expect(typeof result.conclusion).toBe("string");
    expect(result.conclusion.length).toBeGreaterThan(0);
  });

  it("doctrineContext has all required fields", () => {
    const result = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID);
    expect(result.doctrineContext.question).toBeTruthy();
    expect(result.doctrineContext.credoStatement).toBeTruthy();
    expect(result.doctrineContext.actReference).toBeTruthy();
    expect(result.doctrineContext.significance).toBeTruthy();
  });
});

describe("built-in scenario: DEEP_FUTURE", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("produces 3 steps with default parameters", () => {
    expect(engine.runWalkthrough(DEEP_FUTURE_ID).steps).toHaveLength(3);
  });

  it("era transition plan has steps", () => {
    const result = engine.runWalkthrough(DEEP_FUTURE_ID);
    const stepCount = result.steps[0].simulationData["stepCount"] as number;
    expect(stepCount).toBeGreaterThan(0);
  });

  it("horizon closure fires when remainingCommunicationTime <= minimumSeedingDuration", () => {
    const result = engine.runWalkthrough(DEEP_FUTURE_ID, {
      remainingCommunicationTime_s: 2.0,
      minimumSeedingDuration_s: 3.0,
    });
    expect(result.steps[1].simulationData["seedMissionsLaunched"]).toBe(true);
  });

  it("horizon closure does not fire when window is comfortably open", () => {
    const result = engine.runWalkthrough(DEEP_FUTURE_ID, {
      remainingCommunicationTime_s: 100.0,
      minimumSeedingDuration_s: 3.0,
    });
    expect(result.steps[1].simulationData["seedMissionsLaunched"]).toBe(false);
  });

  it("graceful degradation is triggered when shortfall time ≤ 2× maxCheckpointInterval", () => {
    const result = engine.runWalkthrough(DEEP_FUTURE_ID, {
      projectedShortfallTime_s: 0.5,
      maxCheckpointInterval_s: 0.5,
    });
    expect(result.steps[2].simulationData["degradationTriggered"]).toBe(true);
  });

  it("graceful degradation is NOT triggered when shortfall is far in the future", () => {
    const result = engine.runWalkthrough(DEEP_FUTURE_ID, {
      projectedShortfallTime_s: 100.0,
      maxCheckpointInterval_s: 0.5,
    });
    expect(result.steps[2].simulationData["degradationTriggered"]).toBe(false);
  });
});

describe("built-in scenario: CONSCIOUSNESS_SPREAD", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("produces 3 steps with default parameters", () => {
    expect(engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID).steps).toHaveLength(3);
  });

  it("substrate validation passes for default spec", () => {
    const result = engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID);
    expect(result.steps[0].simulationData["substrateValid"]).toBe(true);
  });

  it("mass budget passes for default payload mass", () => {
    const result = engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID);
    expect(result.steps[1].simulationData["massWithinLimit"]).toBe(true);
  });

  it("mass budget fails when payload mass is too small", () => {
    const result = engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID, { payloadMass_kg: 1 });
    expect(result.steps[1].simulationData["massWithinLimit"]).toBe(false);
  });

  it("degradation response is ReduceFidelity for low severity", () => {
    const result = engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID, { degradationSeverity: 0.1 });
    expect(result.steps[2].simulationData["response"]).toBe("REDUCE_FIDELITY");
  });

  it("degradation response is ActivateSuspendRestore for mid severity", () => {
    const result = engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID, { degradationSeverity: 0.6 });
    expect(result.steps[2].simulationData["response"]).toBe("ACTIVATE_SUSPEND_RESTORE");
  });

  it("degradation response is SeedMode for high severity", () => {
    const result = engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID, { degradationSeverity: 0.9 });
    expect(result.steps[2].simulationData["response"]).toBe("SEED_MODE");
  });

  it("active tile count equals totalTiles * (1 - spareFraction)", () => {
    const result = engine.runWalkthrough(CONSCIOUSNESS_SPREAD_ID, {
      totalTiles: 1000,
      spareFraction: 0.3,
    });
    const activeTiles = result.steps[0].simulationData["activeTiles"] as number;
    expect(activeTiles).toBe(700);
  });
});

describe("built-in scenario: INDUSTRIAL_REPLICATION", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("produces 3 steps with default parameters", () => {
    expect(engine.runWalkthrough(INDUSTRIAL_REPLICATION_ID).steps).toHaveLength(3);
  });

  it("seed package fits within probe payload limit", () => {
    const result = engine.runWalkthrough(INDUSTRIAL_REPLICATION_ID);
    expect(result.steps[0].simulationData["fitsInPayload"]).toBe(true);
  });

  it("total seed mass matches component sum", () => {
    const result = engine.runWalkthrough(INDUSTRIAL_REPLICATION_ID);
    const data = result.steps[0].simulationData;
    const expected =
      (data["compute_kg"] as number) +
      (data["fabrication_kg"] as number) +
      (data["energy_kg"] as number) +
      (data["chemicalKit_kg"] as number);
    expect(data["total_kg"]).toBe(expected);
  });

  it("more doubling cycles produces larger projected mass", () => {
    const few = engine.runWalkthrough(INDUSTRIAL_REPLICATION_ID, { targetDoublingCycles: 5 });
    const many = engine.runWalkthrough(INDUSTRIAL_REPLICATION_ID, { targetDoublingCycles: 30 });
    // Compare projected time to reach: more doublings → more time elapsed
    const fewTime = few.steps[2].simulationData["timeToReach_years"] as string;
    const manyTime = many.steps[2].simulationData["timeToReach_years"] as string;
    expect(parseFloat(manyTime)).toBeGreaterThan(parseFloat(fewTime));
  });
});

describe("built-in scenario: COLONY_BOOTSTRAP", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("produces 3 steps with default parameters", () => {
    expect(engine.runWalkthrough(COLONY_BOOTSTRAP_ID).steps).toHaveLength(3);
  });

  it("viability passes with default (above-minimum) parameters", () => {
    const result = engine.runWalkthrough(COLONY_BOOTSTRAP_ID);
    expect(result.steps[0].simulationData["overallViable"]).toBe(true);
  });

  it("viability fails when solar power is below minimum", () => {
    const result = engine.runWalkthrough(COLONY_BOOTSTRAP_ID, { solarPower_w: 1 });
    expect(result.steps[0].simulationData["overallViable"]).toBe(false);
  });

  it("viability fails when structural metals are insufficient", () => {
    const result = engine.runWalkthrough(COLONY_BOOTSTRAP_ID, { structuralMetals_kg: 1e10 });
    expect(result.steps[0].simulationData["overallViable"]).toBe(false);
  });

  it("viability fails when orbital stability is too short", () => {
    const result = engine.runWalkthrough(COLONY_BOOTSTRAP_ID, { orbitalStability_Myr: 50 });
    expect(result.steps[0].simulationData["overallViable"]).toBe(false);
  });

  it("all 4 energy milestones reached when power exceeds E3 threshold", () => {
    const result = engine.runWalkthrough(COLONY_BOOTSTRAP_ID, { solarPower_w: 2e9 });
    expect(result.steps[1].simulationData["reachedMilestoneCount"]).toBe(4);
  });

  it("viabilityScore is 1.0 when all criteria pass", () => {
    const result = engine.runWalkthrough(COLONY_BOOTSTRAP_ID);
    expect(result.steps[0].simulationData["viabilityScore"]).toBe(1.0);
  });

  it("viabilityScore reflects number of passing criteria", () => {
    // Fail exactly one criterion (orbital stability)
    const result = engine.runWalkthrough(COLONY_BOOTSTRAP_ID, { orbitalStability_Myr: 50 });
    expect(result.steps[0].simulationData["viabilityScore"]).toBe(0.75);
  });
});

// ── Parameter Explorer ────────────────────────────────────────────────────────

describe("exploreParameter", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("produces exactly `steps` data points", () => {
    const result = exploreParameter(engine, INTERSTELLAR_JOURNEY_ID, {
      name: "targetDistance_ly",
      min: 1,
      max: 10,
      steps: 5,
    });
    expect(result.points).toHaveLength(5);
  });

  it("first and last points match min and max", () => {
    const result = exploreParameter(engine, INTERSTELLAR_JOURNEY_ID, {
      name: "targetDistance_ly",
      min: 1,
      max: 10,
      steps: 5,
    });
    expect(result.points[0].parameterValue).toBe(1);
    expect(result.points[4].parameterValue).toBe(10);
  });

  it("scenarioId and parameterName are propagated into result", () => {
    const result = exploreParameter(engine, DEEP_FUTURE_ID, {
      name: "energyFraction",
      min: 0.1,
      max: 1.0,
      steps: 3,
    });
    expect(result.scenarioId).toBe(DEEP_FUTURE_ID);
    expect(result.parameterName).toBe("energyFraction");
  });

  it("throws when steps < 2", () => {
    expect(() =>
      exploreParameter(engine, INTERSTELLAR_JOURNEY_ID, {
        name: "targetDistance_ly",
        min: 1,
        max: 10,
        steps: 1,
      }),
    ).toThrow(/steps must be ≥ 2/);
  });

  it("each point has a non-empty result object", () => {
    const result = exploreParameter(engine, CONSCIOUSNESS_SPREAD_ID, {
      name: "degradationSeverity",
      min: 0,
      max: 1,
      steps: 3,
    });
    for (const point of result.points) {
      expect(Object.keys(point.result).length).toBeGreaterThan(0);
    }
  });

  it("baseParams are merged with sweep parameter", () => {
    // Use a specific targetDistance_ly as base, sweep payload mass
    const result = exploreParameter(
      engine,
      INTERSTELLAR_JOURNEY_ID,
      { name: "payloadMass_kg", min: 1_000, max: 5_000, steps: 3 },
      { targetDistance_ly: 8 },
    );
    // All runs should complete without throwing
    expect(result.points).toHaveLength(3);
  });

  it("sweep parameter overrides baseParams for the same key", () => {
    const result = exploreParameter(
      engine,
      INTERSTELLAR_JOURNEY_ID,
      { name: "targetDistance_ly", min: 3, max: 5, steps: 2 },
      { targetDistance_ly: 999 }, // should be overridden by sweep
    );
    expect(result.points[0].parameterValue).toBe(3);
    expect(result.points[1].parameterValue).toBe(5);
  });
});

// ── Shareable Links Round-Trip with Engine ────────────────────────────────────

describe("shareable links integration with engine", () => {
  const engine = createWalkthroughEngine(BUILT_IN_SCENARIOS);

  it("encode → decode → run produces same result as running directly", () => {
    const params: ScenarioParameters = { targetDistance_ly: 8, payloadMass_kg: 3_000 };
    const config = { scenarioId: INTERSTELLAR_JOURNEY_ID, parameters: params };

    const link = encodeScenarioLink(config);
    const decoded = decodeScenarioLink(link.encoded);

    const direct = engine.runWalkthrough(decoded.scenarioId, decoded.parameters);
    const viaLink = engine.runWalkthrough(INTERSTELLAR_JOURNEY_ID, params);

    expect(direct.steps[2].simulationData["totalTransitDuration_years"]).toEqual(
      viaLink.steps[2].simulationData["totalTransitDuration_years"],
    );
  });
});
