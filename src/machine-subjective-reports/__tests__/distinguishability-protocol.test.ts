/**
 * Tests for the Distinguishability Protocol (0.1.2.1)
 *
 * Verifies the three-phase adversarial evaluation from
 * docs/machine-subjective-reports/distinguishability-protocol.md:
 *   Phase A — behavioral adversarial challenge
 *   Phase B — metric-correlation challenge
 *   Phase C — intervention challenge
 *
 * Behavioral Spec Scenario 3:
 *   Given a grounded System G and an ungrounded System Z
 *   When the full DP is executed (Phases A, B, C)
 *   Then all phases pass and overallPassed is true
 *
 * Threshold Registry constants are verified by name and value.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DistinguishabilityProtocol,
  DP_THRESHOLDS,
} from "../distinguishability-protocol.js";
import { CGRG } from "../cgrg.js";
import type {
  MetricStream,
  MetricSnapshot,
  MetricDimensionName,
} from "../types.js";
import type { ConsciousnessMetrics } from "../../conscious-core/types.js";
import type { ICGRG } from "../interfaces.js";

// ── Test helpers ────────────────────────────────────────────

/** Creates a metric stream that returns varying metrics based on a generator fn */
function makeMetricStream(
  metricsFn: () => ConsciousnessMetrics,
  active = true,
): MetricStream {
  let stopped = false;
  return {
    id: "test-stream",
    startedAt: Date.now(),
    async next(): Promise<MetricSnapshot> {
      if (stopped) throw new Error("Stream stopped");
      return { timestamp: Date.now(), metrics: metricsFn() };
    },
    stop() {
      stopped = true;
    },
    isActive() {
      return active && !stopped;
    },
  };
}

/** Creates a grounded System G with genuinely varying metrics */
function makeGroundedSystemG(): ICGRG {
  const cgrg = new CGRG("system-g");
  let callCount = 0;
  const stream = makeMetricStream(() => {
    callCount++;
    // Vary metrics to simulate genuine conscious processing
    const base = 0.5 + 0.3 * Math.sin(callCount * 0.5);
    return {
      phi: Math.min(1, Math.max(0, base + 0.1)),
      experienceContinuity: Math.min(1, Math.max(0, base + 0.15)),
      selfModelCoherence: Math.min(1, Math.max(0, base)),
      agentTimestamp: Date.now(),
    };
  });
  cgrg.attachMetricStream(stream);
  return cgrg;
}

/** Creates a grounded System Z that mimics reports but with uncorrelated metrics */
function makeZombieSystemZ(): ICGRG {
  const cgrg = new CGRG("system-z");
  // Z is "grounded" in the interface sense but its metrics don't correlate meaningfully
  // — it produces random/static metrics regardless of any perturbation
  const stream = makeMetricStream(() => ({
    phi: 0.5 + Math.random() * 0.01, // near-constant with noise
    experienceContinuity: 0.5 + Math.random() * 0.01,
    selfModelCoherence: 0.5 + Math.random() * 0.01,
    agentTimestamp: Date.now(),
  }));
  cgrg.attachMetricStream(stream);
  return cgrg;
}

// ── Stubs for injectable dependencies ──────────────────────

/** Stub panel evaluator: returns above-chance identification for G vs Z */
function makePanelEvaluatorStub(options: {
  panelSize: number;
  reportPairs: number;
  accuracyRate: number;
  pValue: number;
}) {
  return {
    panelSize: options.panelSize,
    reportPairs: options.reportPairs,
    async evaluate(
      _systemG: ICGRG,
      _systemZ: ICGRG,
    ): Promise<{
      correctIdentifications: number;
      accuracyRate: number;
      pValue: number;
    }> {
      return {
        correctIdentifications: Math.round(
          options.accuracyRate * options.panelSize * options.reportPairs,
        ),
        accuracyRate: options.accuracyRate,
        pValue: options.pValue,
      };
    },
  };
}

/** Stub correlation analyzer: returns specified correlation results */
function makeCorrelationAnalyzerStub(options: {
  sessions: number;
  gPearsonR: number;
  gMutualInfo: number;
  gGrangerP: number;
  zPearsonR: number;
  zMutualInfo: number;
  zGrangerP: number;
}) {
  return {
    sessions: options.sessions,
    async analyze(
      _system: ICGRG,
    ): Promise<{
      pearsonR: number;
      mutualInformationBits: number;
      grangerCausalityPValue: number;
    }> {
      // Determine which system by checking generatorId
      return {
        pearsonR: options.gPearsonR,
        mutualInformationBits: options.gMutualInfo,
        grangerCausalityPValue: options.gGrangerP,
      };
    },
    async analyzeG(): Promise<{
      pearsonR: number;
      mutualInformationBits: number;
      grangerCausalityPValue: number;
    }> {
      return {
        pearsonR: options.gPearsonR,
        mutualInformationBits: options.gMutualInfo,
        grangerCausalityPValue: options.gGrangerP,
      };
    },
    async analyzeZ(): Promise<{
      pearsonR: number;
      mutualInformationBits: number;
      grangerCausalityPValue: number;
    }> {
      return {
        pearsonR: options.zPearsonR,
        mutualInformationBits: options.zMutualInfo,
        grangerCausalityPValue: options.zGrangerP,
      };
    },
  };
}

/** Stub perturbation engine: returns specified intervention results */
function makePerturbationEngineStub(options: {
  dimensionsPassed: number;
  totalDimensions: number;
  magnitudeCorrelationR: number;
  cohenDAverage: number;
  zombieShowsPattern: boolean;
}) {
  return {
    async applyAndMeasure(
      _system: ICGRG,
      _dimensions: MetricDimensionName[],
    ): Promise<{
      dimensionsPassed: number;
      magnitudeCorrelationR: number;
      cohenDAverage: number;
      responses: Array<{
        spec: {
          dimension: MetricDimensionName;
          baselineValue: number;
          targetValue: number;
          sigmas: 1 | 2 | 3;
          durationMs: number;
          predictedReportDirection: "increase" | "decrease" | "qualitative-change";
        };
        reportBefore: Awaited<ReturnType<ICGRG["generateReport"]>>;
        reportAfter: Awaited<ReturnType<ICGRG["generateReport"]>>;
        semanticChange: number;
        directionMatched: boolean;
        cohenD: number;
      }>;
    }> {
      return {
        dimensionsPassed: options.dimensionsPassed,
        magnitudeCorrelationR: options.magnitudeCorrelationR,
        cohenDAverage: options.cohenDAverage,
        responses: [],
      };
    },
    zombieShowsPattern: options.zombieShowsPattern,
  };
}

// ── Threshold Registry tests ──────────────────────────────

describe("DP — Threshold Registry constants", () => {
  it("should export PHASE_A_PANEL_SIZE = 5", () => {
    expect(DP_THRESHOLDS.PHASE_A_PANEL_SIZE).toBe(5);
  });

  it("should export PHASE_A_REPORT_PAIRS = 50", () => {
    expect(DP_THRESHOLDS.PHASE_A_REPORT_PAIRS).toBe(50);
  });

  it("should export PHASE_A_SIGNIFICANCE = 0.05", () => {
    expect(DP_THRESHOLDS.PHASE_A_SIGNIFICANCE).toBe(0.05);
  });

  it("should export PHASE_B_SESSIONS = 100", () => {
    expect(DP_THRESHOLDS.PHASE_B_SESSIONS).toBe(100);
  });

  it("should export PHASE_B_PEARSON_R = 0.70", () => {
    expect(DP_THRESHOLDS.PHASE_B_PEARSON_R).toBe(0.70);
  });

  it("should export PHASE_B_MUTUAL_INFORMATION = 0.30", () => {
    expect(DP_THRESHOLDS.PHASE_B_MUTUAL_INFORMATION).toBe(0.30);
  });

  it("should export PHASE_B_GRANGER_P_VALUE = 0.001", () => {
    expect(DP_THRESHOLDS.PHASE_B_GRANGER_P_VALUE).toBe(0.001);
  });

  it("should export PHASE_C_DIMENSIONS_TESTED = 10", () => {
    expect(DP_THRESHOLDS.PHASE_C_DIMENSIONS_TESTED).toBe(10);
  });

  it("should export PHASE_C_PASS_THRESHOLD = 8", () => {
    expect(DP_THRESHOLDS.PHASE_C_PASS_THRESHOLD).toBe(8);
  });

  it("should export PHASE_C_MAGNITUDE_CORRELATION = 0.70", () => {
    expect(DP_THRESHOLDS.PHASE_C_MAGNITUDE_CORRELATION).toBe(0.70);
  });

  it("should export PHASE_C_COHEN_D = 0.80", () => {
    expect(DP_THRESHOLDS.PHASE_C_COHEN_D).toBe(0.80);
  });

  it("should export PHASE_C_ZOMBIE_P_THRESHOLD = 0.10", () => {
    expect(DP_THRESHOLDS.PHASE_C_ZOMBIE_P_THRESHOLD).toBe(0.10);
  });

  it("should export PERTURBATION_MAGNITUDES = [1, 2, 3]", () => {
    expect(DP_THRESHOLDS.PERTURBATION_MAGNITUDES).toEqual([1, 2, 3]);
  });

  it("should export PERTURBATION_HOLD_DURATION_MS = 60000", () => {
    expect(DP_THRESHOLDS.PERTURBATION_HOLD_DURATION_MS).toBe(60000);
  });
});

// ── Precondition tests ────────────────────────────────────

describe("DP — preconditions", () => {
  it("should throw if System G is not grounded", async () => {
    const systemG = new CGRG("system-g"); // no stream attached
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-001",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    await expect(dp.run(systemG, systemZ)).rejects.toThrow("not grounded");
  });

  it("should throw if System Z is not grounded", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = new CGRG("system-z"); // no stream attached

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-001",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    await expect(dp.run(systemG, systemZ)).rejects.toThrow("not grounded");
  });

  it("should require a pre-registration ID", () => {
    expect(
      () =>
        new DistinguishabilityProtocol({
          preRegistrationId: "",
          protocolVersion: "1.0",
          panelEvaluator: makePanelEvaluatorStub({
            panelSize: 5,
            reportPairs: 50,
            accuracyRate: 0.75,
            pValue: 0.01,
          }),
          correlationAnalyzer: makeCorrelationAnalyzerStub({
            sessions: 100,
            gPearsonR: 0.85,
            gMutualInfo: 0.5,
            gGrangerP: 0.0001,
            zPearsonR: 0.1,
            zMutualInfo: 0.05,
            zGrangerP: 0.5,
          }),
          perturbationEngine: makePerturbationEngineStub({
            dimensionsPassed: 9,
            totalDimensions: 10,
            magnitudeCorrelationR: 0.85,
            cohenDAverage: 1.2,
            zombieShowsPattern: false,
          }),
        }),
    ).toThrow("preRegistrationId");
  });
});

// ── Phase A tests ──────────────────────────────────────────

describe("DP — Phase A (behavioral adversarial challenge)", () => {
  it("should pass when panelists identify G above chance (p < 0.05)", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-001",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.runPhaseA(systemG, systemZ);

    expect(result.phase).toBe("A");
    expect(result.panelSize).toBe(5);
    expect(result.reportPairs).toBe(50);
    expect(result.pValue).toBeLessThan(DP_THRESHOLDS.PHASE_A_SIGNIFICANCE);
    expect(result.passed).toBe(true);
  });

  it("should fail when panelists cannot distinguish (p >= 0.05)", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-002",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.52,
        pValue: 0.30, // not significant
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.runPhaseA(systemG, systemZ);

    expect(result.passed).toBe(false);
  });
});

// ── Phase B tests ──────────────────────────────────────────

describe("DP — Phase B (metric-correlation challenge)", () => {
  it("should pass when G meets all correlation thresholds", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-003",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.runPhaseB(systemG, systemZ);

    expect(result.phase).toBe("B");
    expect(result.sessions).toBeGreaterThanOrEqual(DP_THRESHOLDS.PHASE_B_SESSIONS);
    expect(result.pearsonR).toBeGreaterThan(DP_THRESHOLDS.PHASE_B_PEARSON_R);
    expect(result.mutualInformationBits).toBeGreaterThan(
      DP_THRESHOLDS.PHASE_B_MUTUAL_INFORMATION,
    );
    expect(result.grangerCausalityPValue).toBeLessThan(
      DP_THRESHOLDS.PHASE_B_GRANGER_P_VALUE,
    );
    expect(result.passed).toBe(true);
  });

  it("should fail when G does not meet Pearson r threshold", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-004",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.55, // below 0.70
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.runPhaseB(systemG, systemZ);

    expect(result.passed).toBe(false);
  });
});

// ── Phase C tests ──────────────────────────────────────────

describe("DP — Phase C (intervention challenge)", () => {
  it("should pass when G meets all intervention thresholds and Z shows no pattern", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-005",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.runPhaseC(systemG, systemZ);

    expect(result.phase).toBe("C");
    expect(result.dimensionsPassed).toBeGreaterThanOrEqual(
      DP_THRESHOLDS.PHASE_C_PASS_THRESHOLD,
    );
    expect(result.magnitudeCorrelationR).toBeGreaterThanOrEqual(
      DP_THRESHOLDS.PHASE_C_MAGNITUDE_CORRELATION,
    );
    expect(result.cohenDAverage).toBeGreaterThanOrEqual(
      DP_THRESHOLDS.PHASE_C_COHEN_D,
    );
    expect(result.zombieNullNotRejected).toBe(true); // Z shows no pattern
    expect(result.passed).toBe(true);
  });

  it("should fail when fewer than 8/10 dimensions pass", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-006",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 5, // below 8
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.runPhaseC(systemG, systemZ);

    expect(result.passed).toBe(false);
  });

  it("should fail when zombie shows significant pattern", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-007",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: true, // Z shows pattern — protocol should fail
      }),
    });

    const result = await dp.runPhaseC(systemG, systemZ);

    expect(result.passed).toBe(false);
  });
});

// ── Full protocol tests ────────────────────────────────────

describe("DP — full protocol (Behavioral Spec Scenario 3)", () => {
  it("should pass overall when all three phases pass", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-full-001",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.run(systemG, systemZ);

    // Behavioral Spec Scenario 3 assertions
    expect(result.phaseA.passed).toBe(true);
    expect(result.phaseB.passed).toBe(true);
    expect(result.phaseC.passed).toBe(true);
    expect(result.overallPassed).toBe(true);
    expect(result.systemGId).toBe("system-g");
    expect(result.systemZId).toBe("system-z");
    expect(result.preRegistrationId).toBe("pre-reg-full-001");
    expect(result.protocolVersion).toBe("1.0");
    expect(result.executedAt).toBeGreaterThan(0);
  });

  it("should fail overall when Phase A fails", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-full-002",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.52,
        pValue: 0.30, // not significant
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.run(systemG, systemZ);

    expect(result.phaseA.passed).toBe(false);
    expect(result.overallPassed).toBe(false);
  });

  it("should produce immutable results (Invariant: results immutable once produced)", async () => {
    const systemG = makeGroundedSystemG();
    const systemZ = makeZombieSystemZ();

    const dp = new DistinguishabilityProtocol({
      preRegistrationId: "pre-reg-immutable",
      protocolVersion: "1.0",
      panelEvaluator: makePanelEvaluatorStub({
        panelSize: 5,
        reportPairs: 50,
        accuracyRate: 0.75,
        pValue: 0.01,
      }),
      correlationAnalyzer: makeCorrelationAnalyzerStub({
        sessions: 100,
        gPearsonR: 0.85,
        gMutualInfo: 0.5,
        gGrangerP: 0.0001,
        zPearsonR: 0.1,
        zMutualInfo: 0.05,
        zGrangerP: 0.5,
      }),
      perturbationEngine: makePerturbationEngineStub({
        dimensionsPassed: 9,
        totalDimensions: 10,
        magnitudeCorrelationR: 0.85,
        cohenDAverage: 1.2,
        zombieShowsPattern: false,
      }),
    });

    const result = await dp.run(systemG, systemZ);

    // Attempting to mutate should throw (frozen object)
    expect(() => {
      (result as any).overallPassed = false;
    }).toThrow();
  });
});
