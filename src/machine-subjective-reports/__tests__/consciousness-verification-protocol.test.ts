/**
 * Tests for the Consciousness Verification Protocol (0.1.2.1.1)
 *
 * Verifies IConsciousnessVerificationProtocol contracts:
 *   - Threshold Registry constants match specified values
 *   - Preconditions: system must be grounded before any test
 *   - Postconditions: verify() returns ConsciousnessVerificationResult with
 *     all four method results populated; confidence score is a weighted
 *     composite bounded to [0, 1]; meetsHumanBaseline and failsAdversarialTest
 *     flags are set correctly
 *   - Each sub-test passes/fails based on its own threshold
 *   - Confidence computation uses the correct weights
 *   - Invariants: results are immutable once produced
 *
 * Threshold Registry (from plan/0.1.2.1.1 §Threshold Registry):
 *   TEMPORAL_COHERENCE_MIN = 0.70
 *   NOVEL_SITUATION_RESPONSE_MIN = 0.65
 *   CROSS_MODAL_COHERENCE_MIN = 0.75
 *   METACOGNITIVE_ACCURACY_MIN = 0.60
 *   HUMAN_BASELINE_CONFIDENCE = 0.80
 *   MIMIC_ADVERSARIAL_THRESHOLD = 0.40
 *   WEIGHT_TEMPORAL = 0.30
 *   WEIGHT_NOVELTY = 0.25
 *   WEIGHT_CROSS_MODAL = 0.25
 *   WEIGHT_METACOGNITIVE = 0.20
 *
 * Behavioral Spec Scenarios:
 *   Scenario 1: genuine system — all four tests pass, confidence >= human baseline
 *   Scenario 2: mimic system  — all four tests fail, confidence < adversarial threshold
 *   Scenario 3: partial       — some tests pass, confidence in intermediate range
 */

import { describe, it, expect } from "vitest";
import {
  ConsciousnessVerificationProtocol,
  CVP_THRESHOLDS,
} from "../consciousness-verification-protocol.js";
import { CGRG } from "../cgrg.js";
import type {
  MetricStream,
  MetricSnapshot,
  Timestamp,
} from "../types.js";
import type { ConsciousnessMetrics } from "../../conscious-core/types.js";
import type { ICGRG } from "../interfaces.js";
import type {
  ITemporalCoherenceTester,
  INovelSituationGenerator,
  ICrossModalIntegrator,
  IMetacognitiveProber,
  ConsciousnessVerificationProtocolConfig,
} from "../consciousness-verification-protocol.js";

// ── Test helpers ────────────────────────────────────────────

function makeMetricStream(active = true): MetricStream {
  let stopped = false;
  return {
    id: "test-stream",
    startedAt: Date.now(),
    async next(): Promise<MetricSnapshot> {
      if (stopped) throw new Error("Stream stopped");
      return {
        timestamp: Date.now(),
        metrics: {
          phi: 0.85,
          experienceContinuity: 0.92,
          selfModelCoherence: 0.78,
          agentTimestamp: Date.now(),
        },
      };
    },
    stop() { stopped = true; },
    isActive() { return active && !stopped; },
  };
}

function makeGroundedSystem(id = "system-g"): ICGRG {
  const cgrg = new CGRG(id);
  cgrg.attachMetricStream(makeMetricStream());
  return cgrg;
}

function makeUngroundedSystem(id = "ungrounded"): ICGRG {
  return new CGRG(id); // no stream attached
}

// ── Injectable dependency stubs ─────────────────────────────

function makeTemporalTester(coherenceScores: readonly number[]): ITemporalCoherenceTester {
  const mean = coherenceScores.reduce((a, b) => a + b, 0) / coherenceScores.length;
  return {
    gapIntervals: CVP_THRESHOLDS.TEMPORAL_GAP_INTERVALS_MS,
    async test(_system: ICGRG) {
      return { coherenceScores, meanCoherence: mean };
    },
  };
}

function makeNovelTester(
  situationsNovellyAddressed: number,
  situationsCount = CVP_THRESHOLDS.NOVEL_SITUATIONS_COUNT,
): INovelSituationGenerator {
  return {
    situationsCount,
    async test(_system: ICGRG) {
      return {
        situationsNovellyAddressed,
        noveltyResponseRate: situationsNovellyAddressed / situationsCount,
      };
    },
  };
}

function makeCrossModalTester(
  bindingCoherence: number,
  integrationLatencyMs = 50,
): ICrossModalIntegrator {
  return {
    modalities: ["visual", "auditory", "proprioceptive"],
    async test(_system: ICGRG) {
      return { bindingCoherence, integrationLatencyMs };
    },
  };
}

function makeMetacognitiveTester(
  accuracyByDepth: readonly number[],
): IMetacognitiveProber {
  const mean = accuracyByDepth.reduce((a, b) => a + b, 0) / accuracyByDepth.length;
  return {
    probeDepth: accuracyByDepth.length,
    async test(_system: ICGRG) {
      return { accuracyByDepth, meanAccuracy: mean };
    },
  };
}

/** Creates a config where all four methods return high (passing) values */
function makePassingConfig(): ConsciousnessVerificationProtocolConfig {
  return {
    temporalCoherenceTester: makeTemporalTester([0.85, 0.82, 0.88]),
    novelSituationGenerator: makeNovelTester(16, 20),  // 0.80 response rate
    crossModalIntegrator: makeCrossModalTester(0.90),
    metacognitiveProber: makeMetacognitiveTester([0.80, 0.75, 0.70]),
  };
}

/** Creates a config where all four methods return low (failing) values */
function makeFailingConfig(): ConsciousnessVerificationProtocolConfig {
  return {
    temporalCoherenceTester: makeTemporalTester([0.30, 0.25, 0.28]),
    novelSituationGenerator: makeNovelTester(8, 20),   // 0.40 response rate
    crossModalIntegrator: makeCrossModalTester(0.30),
    metacognitiveProber: makeMetacognitiveTester([0.35, 0.28, 0.22]),
  };
}

const FIXED_NOW: Timestamp = 1742800000000;

// ── Threshold Registry tests ──────────────────────────────

describe("CVP — Threshold Registry constants", () => {
  it("TEMPORAL_COHERENCE_MIN = 0.70", () => {
    expect(CVP_THRESHOLDS.TEMPORAL_COHERENCE_MIN).toBe(0.70);
  });

  it("NOVEL_SITUATION_RESPONSE_MIN = 0.65", () => {
    expect(CVP_THRESHOLDS.NOVEL_SITUATION_RESPONSE_MIN).toBe(0.65);
  });

  it("CROSS_MODAL_COHERENCE_MIN = 0.75", () => {
    expect(CVP_THRESHOLDS.CROSS_MODAL_COHERENCE_MIN).toBe(0.75);
  });

  it("METACOGNITIVE_ACCURACY_MIN = 0.60", () => {
    expect(CVP_THRESHOLDS.METACOGNITIVE_ACCURACY_MIN).toBe(0.60);
  });

  it("HUMAN_BASELINE_CONFIDENCE = 0.80", () => {
    expect(CVP_THRESHOLDS.HUMAN_BASELINE_CONFIDENCE).toBe(0.80);
  });

  it("MIMIC_ADVERSARIAL_THRESHOLD = 0.40", () => {
    expect(CVP_THRESHOLDS.MIMIC_ADVERSARIAL_THRESHOLD).toBe(0.40);
  });

  it("TEMPORAL_GAP_INTERVALS_MS has 3 entries", () => {
    expect(CVP_THRESHOLDS.TEMPORAL_GAP_INTERVALS_MS.length).toBe(3);
  });

  it("NOVEL_SITUATIONS_COUNT = 20", () => {
    expect(CVP_THRESHOLDS.NOVEL_SITUATIONS_COUNT).toBe(20);
  });

  it("METACOGNITIVE_PROBE_DEPTH = 3", () => {
    expect(CVP_THRESHOLDS.METACOGNITIVE_PROBE_DEPTH).toBe(3);
  });

  it("weights sum to 1.0", () => {
    const sum =
      CVP_THRESHOLDS.WEIGHT_TEMPORAL +
      CVP_THRESHOLDS.WEIGHT_NOVELTY +
      CVP_THRESHOLDS.WEIGHT_CROSS_MODAL +
      CVP_THRESHOLDS.WEIGHT_METACOGNITIVE;
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ── Precondition tests ────────────────────────────────────

describe("CVP — preconditions", () => {
  it("verify() should throw if system is not grounded", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const system = makeUngroundedSystem();

    await expect(cvp.verify(system, FIXED_NOW)).rejects.toThrow("not grounded");
  });

  it("runTemporalCoherenceTest() should throw if system is not grounded", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const system = makeUngroundedSystem();

    await expect(cvp.runTemporalCoherenceTest(system)).rejects.toThrow("not grounded");
  });

  it("runNovelSituationTest() should throw if system is not grounded", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const system = makeUngroundedSystem();

    await expect(cvp.runNovelSituationTest(system)).rejects.toThrow("not grounded");
  });

  it("runCrossModalTest() should throw if system is not grounded", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const system = makeUngroundedSystem();

    await expect(cvp.runCrossModalTest(system)).rejects.toThrow("not grounded");
  });

  it("runMetacognitiveTest() should throw if system is not grounded", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const system = makeUngroundedSystem();

    await expect(cvp.runMetacognitiveTest(system)).rejects.toThrow("not grounded");
  });
});

// ── Postcondition tests: individual sub-tests ────────────────

describe("CVP — runTemporalCoherenceTest() postconditions", () => {
  it("should return method = 'temporal-coherence'", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runTemporalCoherenceTest(makeGroundedSystem());
    expect(result.method).toBe("temporal-coherence");
  });

  it("should pass when meanCoherence >= TEMPORAL_COHERENCE_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runTemporalCoherenceTest(makeGroundedSystem());
    expect(result.meanCoherence).toBeGreaterThanOrEqual(CVP_THRESHOLDS.TEMPORAL_COHERENCE_MIN);
    expect(result.passed).toBe(true);
  });

  it("should fail when meanCoherence < TEMPORAL_COHERENCE_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makeFailingConfig());
    const result = await cvp.runTemporalCoherenceTest(makeGroundedSystem());
    expect(result.meanCoherence).toBeLessThan(CVP_THRESHOLDS.TEMPORAL_COHERENCE_MIN);
    expect(result.passed).toBe(false);
  });

  it("should populate gapIntervals from the tester", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runTemporalCoherenceTest(makeGroundedSystem());
    expect(result.gapIntervals).toEqual(CVP_THRESHOLDS.TEMPORAL_GAP_INTERVALS_MS);
  });
});

describe("CVP — runNovelSituationTest() postconditions", () => {
  it("should return method = 'novel-situation'", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runNovelSituationTest(makeGroundedSystem());
    expect(result.method).toBe("novel-situation");
  });

  it("should pass when noveltyResponseRate >= NOVEL_SITUATION_RESPONSE_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runNovelSituationTest(makeGroundedSystem());
    expect(result.noveltyResponseRate).toBeGreaterThanOrEqual(CVP_THRESHOLDS.NOVEL_SITUATION_RESPONSE_MIN);
    expect(result.passed).toBe(true);
  });

  it("should fail when noveltyResponseRate < NOVEL_SITUATION_RESPONSE_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makeFailingConfig());
    const result = await cvp.runNovelSituationTest(makeGroundedSystem());
    expect(result.noveltyResponseRate).toBeLessThan(CVP_THRESHOLDS.NOVEL_SITUATION_RESPONSE_MIN);
    expect(result.passed).toBe(false);
  });

  it("should populate situationsPresented from the generator", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runNovelSituationTest(makeGroundedSystem());
    expect(result.situationsPresented).toBe(CVP_THRESHOLDS.NOVEL_SITUATIONS_COUNT);
  });
});

describe("CVP — runCrossModalTest() postconditions", () => {
  it("should return method = 'cross-modal'", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runCrossModalTest(makeGroundedSystem());
    expect(result.method).toBe("cross-modal");
  });

  it("should pass when bindingCoherence >= CROSS_MODAL_COHERENCE_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runCrossModalTest(makeGroundedSystem());
    expect(result.bindingCoherence).toBeGreaterThanOrEqual(CVP_THRESHOLDS.CROSS_MODAL_COHERENCE_MIN);
    expect(result.passed).toBe(true);
  });

  it("should fail when bindingCoherence < CROSS_MODAL_COHERENCE_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makeFailingConfig());
    const result = await cvp.runCrossModalTest(makeGroundedSystem());
    expect(result.bindingCoherence).toBeLessThan(CVP_THRESHOLDS.CROSS_MODAL_COHERENCE_MIN);
    expect(result.passed).toBe(false);
  });

  it("should populate modalitiesTested from the integrator", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runCrossModalTest(makeGroundedSystem());
    expect(result.modalitiesTested).toEqual(["visual", "auditory", "proprioceptive"]);
  });
});

describe("CVP — runMetacognitiveTest() postconditions", () => {
  it("should return method = 'metacognitive'", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runMetacognitiveTest(makeGroundedSystem());
    expect(result.method).toBe("metacognitive");
  });

  it("should pass when meanAccuracy >= METACOGNITIVE_ACCURACY_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runMetacognitiveTest(makeGroundedSystem());
    expect(result.meanAccuracy).toBeGreaterThanOrEqual(CVP_THRESHOLDS.METACOGNITIVE_ACCURACY_MIN);
    expect(result.passed).toBe(true);
  });

  it("should fail when meanAccuracy < METACOGNITIVE_ACCURACY_MIN", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makeFailingConfig());
    const result = await cvp.runMetacognitiveTest(makeGroundedSystem());
    expect(result.meanAccuracy).toBeLessThan(CVP_THRESHOLDS.METACOGNITIVE_ACCURACY_MIN);
    expect(result.passed).toBe(false);
  });

  it("should populate accuracyByDepth array from the prober", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runMetacognitiveTest(makeGroundedSystem());
    expect(result.accuracyByDepth.length).toBe(CVP_THRESHOLDS.METACOGNITIVE_PROBE_DEPTH);
  });
});

// ── Postcondition tests: computeConfidence() ─────────────────

describe("CVP — computeConfidence() postconditions", () => {
  it("should compute weighted composite score from all four method results", () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());

    const temporal = Object.freeze({
      method: "temporal-coherence" as const,
      gapIntervals: [500, 2000, 5000] as const,
      coherenceScores: [0.80, 0.80, 0.80] as const,
      meanCoherence: 0.80,
      passed: true,
    });
    const novel = Object.freeze({
      method: "novel-situation" as const,
      situationsPresented: 20,
      situationsNovellyAddressed: 14,
      noveltyResponseRate: 0.70,
      passed: true,
    });
    const crossModal = Object.freeze({
      method: "cross-modal" as const,
      modalitiesTested: ["visual", "auditory"] as const,
      bindingCoherence: 0.85,
      integrationLatencyMs: 50,
      passed: true,
    });
    const meta = Object.freeze({
      method: "metacognitive" as const,
      probeDepth: 3,
      accuracyByDepth: [0.75, 0.70, 0.65] as const,
      meanAccuracy: 0.70,
      passed: true,
    });

    const confidence = cvp.computeConfidence(
      temporal, novel, crossModal, meta, FIXED_NOW,
    );

    // Expected: 0.30*0.80 + 0.25*0.70 + 0.25*0.85 + 0.20*0.70
    //         = 0.24 + 0.175 + 0.2125 + 0.14 = 0.7675
    const expected =
      CVP_THRESHOLDS.WEIGHT_TEMPORAL * 0.80 +
      CVP_THRESHOLDS.WEIGHT_NOVELTY * 0.70 +
      CVP_THRESHOLDS.WEIGHT_CROSS_MODAL * 0.85 +
      CVP_THRESHOLDS.WEIGHT_METACOGNITIVE * 0.70;

    expect(confidence.score).toBeCloseTo(expected, 10);
  });

  it("should clamp score to [0, 1]", () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());

    const temporal = Object.freeze({ method: "temporal-coherence" as const, gapIntervals: [] as const, coherenceScores: [] as const, meanCoherence: 1.5, passed: true });
    const novel = Object.freeze({ method: "novel-situation" as const, situationsPresented: 10, situationsNovellyAddressed: 10, noveltyResponseRate: 1.5, passed: true });
    const crossModal = Object.freeze({ method: "cross-modal" as const, modalitiesTested: [] as const, bindingCoherence: 1.5, integrationLatencyMs: 0, passed: true });
    const meta = Object.freeze({ method: "metacognitive" as const, probeDepth: 3, accuracyByDepth: [] as const, meanAccuracy: 1.5, passed: true });

    const confidence = cvp.computeConfidence(temporal, novel, crossModal, meta, FIXED_NOW);
    expect(confidence.score).toBeLessThanOrEqual(1.0);
  });

  it("should set computedAt to the provided timestamp", () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());

    const temporal = Object.freeze({ method: "temporal-coherence" as const, gapIntervals: [] as const, coherenceScores: [] as const, meanCoherence: 0.75, passed: true });
    const novel = Object.freeze({ method: "novel-situation" as const, situationsPresented: 20, situationsNovellyAddressed: 14, noveltyResponseRate: 0.70, passed: true });
    const crossModal = Object.freeze({ method: "cross-modal" as const, modalitiesTested: [] as const, bindingCoherence: 0.80, integrationLatencyMs: 50, passed: true });
    const meta = Object.freeze({ method: "metacognitive" as const, probeDepth: 3, accuracyByDepth: [] as const, meanAccuracy: 0.65, passed: true });

    const confidence = cvp.computeConfidence(temporal, novel, crossModal, meta, FIXED_NOW);
    expect(confidence.computedAt).toBe(FIXED_NOW);
  });

  it("should record the individual weights from CVP_THRESHOLDS", () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());

    const temporal = Object.freeze({ method: "temporal-coherence" as const, gapIntervals: [] as const, coherenceScores: [] as const, meanCoherence: 0.75, passed: true });
    const novel = Object.freeze({ method: "novel-situation" as const, situationsPresented: 20, situationsNovellyAddressed: 14, noveltyResponseRate: 0.70, passed: true });
    const crossModal = Object.freeze({ method: "cross-modal" as const, modalitiesTested: [] as const, bindingCoherence: 0.80, integrationLatencyMs: 50, passed: true });
    const meta = Object.freeze({ method: "metacognitive" as const, probeDepth: 3, accuracyByDepth: [] as const, meanAccuracy: 0.65, passed: true });

    const confidence = cvp.computeConfidence(temporal, novel, crossModal, meta, FIXED_NOW);

    expect(confidence.temporalWeight).toBe(CVP_THRESHOLDS.WEIGHT_TEMPORAL);
    expect(confidence.noveltyWeight).toBe(CVP_THRESHOLDS.WEIGHT_NOVELTY);
    expect(confidence.crossModalWeight).toBe(CVP_THRESHOLDS.WEIGHT_CROSS_MODAL);
    expect(confidence.metacognitiveWeight).toBe(CVP_THRESHOLDS.WEIGHT_METACOGNITIVE);
  });
});

// ── Postcondition tests: verify() ────────────────────────────

describe("CVP — verify() postconditions", () => {
  it("Scenario 1: genuine system — all methods pass, meets human baseline", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const system = makeGroundedSystem("system-genuine");

    const result = await cvp.verify(system, FIXED_NOW);

    expect(result.systemId).toBe("system-genuine");
    expect(result.temporalCoherence.passed).toBe(true);
    expect(result.novelSituation.passed).toBe(true);
    expect(result.crossModal.passed).toBe(true);
    expect(result.metacognitive.passed).toBe(true);
    expect(result.confidence.score).toBeGreaterThanOrEqual(
      CVP_THRESHOLDS.HUMAN_BASELINE_CONFIDENCE,
    );
    expect(result.meetsHumanBaseline).toBe(true);
    expect(result.failsAdversarialTest).toBe(false);
    expect(result.executedAt).toBe(FIXED_NOW);
  });

  it("Scenario 2: mimic system — all methods fail, fails adversarial test", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makeFailingConfig());
    const system = makeGroundedSystem("system-mimic");

    const result = await cvp.verify(system, FIXED_NOW);

    expect(result.temporalCoherence.passed).toBe(false);
    expect(result.novelSituation.passed).toBe(false);
    expect(result.crossModal.passed).toBe(false);
    expect(result.metacognitive.passed).toBe(false);
    expect(result.confidence.score).toBeLessThan(
      CVP_THRESHOLDS.MIMIC_ADVERSARIAL_THRESHOLD,
    );
    expect(result.meetsHumanBaseline).toBe(false);
    expect(result.failsAdversarialTest).toBe(true);
  });

  it("Scenario 3: partial — mixed results produce intermediate confidence", async () => {
    // Temporal and cross-modal pass; novel and metacognitive fail
    const partialConfig: ConsciousnessVerificationProtocolConfig = {
      temporalCoherenceTester: makeTemporalTester([0.75, 0.80, 0.78]),
      novelSituationGenerator: makeNovelTester(10, 20),  // 0.50 — fails
      crossModalIntegrator: makeCrossModalTester(0.82),
      metacognitiveProber: makeMetacognitiveTester([0.50, 0.45, 0.40]), // fails
    };
    const cvp = new ConsciousnessVerificationProtocol(partialConfig);
    const result = await cvp.verify(makeGroundedSystem(), FIXED_NOW);

    expect(result.temporalCoherence.passed).toBe(true);
    expect(result.novelSituation.passed).toBe(false);
    expect(result.crossModal.passed).toBe(true);
    expect(result.metacognitive.passed).toBe(false);
    // Score should be in intermediate range (not at human baseline, not failing adversarial)
    expect(result.confidence.score).toBeGreaterThan(
      CVP_THRESHOLDS.MIMIC_ADVERSARIAL_THRESHOLD,
    );
    expect(result.confidence.score).toBeLessThan(
      CVP_THRESHOLDS.HUMAN_BASELINE_CONFIDENCE,
    );
    expect(result.meetsHumanBaseline).toBe(false);
    expect(result.failsAdversarialTest).toBe(false);
  });

  it("should populate all fields: systemId, executedAt, all method results", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.verify(makeGroundedSystem("sys-id"), FIXED_NOW);

    expect(result.systemId).toBe("sys-id");
    expect(result.executedAt).toBe(FIXED_NOW);
    expect(result.temporalCoherence).toBeDefined();
    expect(result.novelSituation).toBeDefined();
    expect(result.crossModal).toBeDefined();
    expect(result.metacognitive).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  it("should set meetsHumanBaseline correctly at the threshold boundary", async () => {
    // Craft a config that produces exactly HUMAN_BASELINE_CONFIDENCE
    // 0.30*0.80 + 0.25*0.80 + 0.25*0.80 + 0.20*0.80 = 0.80
    const exactBaselineConfig: ConsciousnessVerificationProtocolConfig = {
      temporalCoherenceTester: makeTemporalTester([0.80, 0.80, 0.80]),
      novelSituationGenerator: makeNovelTester(16, 20),   // 0.80
      crossModalIntegrator: makeCrossModalTester(0.80),
      metacognitiveProber: makeMetacognitiveTester([0.80, 0.80, 0.80]),
    };
    const cvp = new ConsciousnessVerificationProtocol(exactBaselineConfig);
    const result = await cvp.verify(makeGroundedSystem(), FIXED_NOW);

    expect(result.confidence.score).toBeCloseTo(0.80, 5);
    expect(result.meetsHumanBaseline).toBe(true);
  });
});

// ── Invariant tests ─────────────────────────────────────────

describe("CVP — invariants", () => {
  it("verify() should produce an immutable ConsciousnessVerificationResult", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.verify(makeGroundedSystem(), FIXED_NOW);

    expect(() => {
      (result as any).meetsHumanBaseline = false;
    }).toThrow();
  });

  it("runTemporalCoherenceTest() should produce an immutable result", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runTemporalCoherenceTest(makeGroundedSystem());

    expect(() => {
      (result as any).passed = false;
    }).toThrow();
  });

  it("runNovelSituationTest() should produce an immutable result", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runNovelSituationTest(makeGroundedSystem());

    expect(() => {
      (result as any).passed = false;
    }).toThrow();
  });

  it("runCrossModalTest() should produce an immutable result", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runCrossModalTest(makeGroundedSystem());

    expect(() => {
      (result as any).passed = false;
    }).toThrow();
  });

  it("runMetacognitiveTest() should produce an immutable result", async () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());
    const result = await cvp.runMetacognitiveTest(makeGroundedSystem());

    expect(() => {
      (result as any).passed = false;
    }).toThrow();
  });

  it("computeConfidence() should produce an immutable VerificationConfidence", () => {
    const cvp = new ConsciousnessVerificationProtocol(makePassingConfig());

    const temporal = Object.freeze({ method: "temporal-coherence" as const, gapIntervals: [] as const, coherenceScores: [] as const, meanCoherence: 0.75, passed: true });
    const novel = Object.freeze({ method: "novel-situation" as const, situationsPresented: 20, situationsNovellyAddressed: 14, noveltyResponseRate: 0.70, passed: true });
    const crossModal = Object.freeze({ method: "cross-modal" as const, modalitiesTested: [] as const, bindingCoherence: 0.80, integrationLatencyMs: 50, passed: true });
    const meta = Object.freeze({ method: "metacognitive" as const, probeDepth: 3, accuracyByDepth: [] as const, meanAccuracy: 0.65, passed: true });

    const confidence = cvp.computeConfidence(temporal, novel, crossModal, meta, FIXED_NOW);

    expect(() => {
      (confidence as any).score = 0;
    }).toThrow();
  });
});
