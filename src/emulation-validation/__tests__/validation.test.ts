/**
 * Emulation Validation — Tests
 *
 * Tests for the three-layer validation protocol defined in
 * docs/emulation-validation/ARCHITECTURE.md
 *
 * Card 0.2.2.1.4: Emulation Validation
 */
import { describe, it, expect } from "vitest";
import {
  evaluateLayer1,
  evaluateDomainResult,
  evaluateNeuralMetric,
  computeDivergenceIndex,
  assessTemporalDrift,
  evaluateLayer2,
  evaluateLayer3,
  determineVerdict,
  shouldRunLayer2,
  shouldRunLayer3A,
  shouldRunLayer3B,
} from "../validation.js";
import type {
  DomainResult,
  MetricResult,
  NeuralMetric,
  ConsciousnessAssessment,
  FirstPersonResult,
} from "../types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePassingConsciousness(): ConsciousnessAssessment {
  return {
    phi: { value: 3.5, biologicalRange: [2.0, 5.0], passed: true },
    pci: { value: 0.45, threshold: 0.31, passed: true },
    globalWorkspace: { present: true, details: "Ignition dynamics confirmed" },
    recurrentProcessing: { present: true, details: "Recurrent loops confirmed" },
    allPassed: true,
  };
}

function makeFailingConsciousness(): ConsciousnessAssessment {
  return {
    phi: { value: 0.5, biologicalRange: [2.0, 5.0], passed: false },
    pci: { value: 0.15, threshold: 0.31, passed: false },
    globalWorkspace: { present: false, details: "No ignition" },
    recurrentProcessing: { present: false, details: "No recurrent loops" },
    allPassed: false,
  };
}

function makePassingFirstPerson(): FirstPersonResult {
  return {
    probeResults: [
      { stimulusId: "s1", semanticSimilarity: 0.90, expertRating: "same-quality" },
      { stimulusId: "s2", semanticSimilarity: 0.85, expertRating: "same-quality" },
    ],
    meanSemanticSimilarity: 0.875,
    expertSameQualityRate: 1.0,
    phase1Passed: true,
    dialogueResult: { originalRating: 5, emulationRating: 5, moderatorNotes: "Strong mutual recognition" },
    phase2Passed: true,
    divergences: [],
    hasFundamentalAbsence: false,
    phase3Passed: true,
    overallPassed: true,
  };
}

// ── Layer 1: Behavioral Equivalence ─────────────────────────────────────────

describe("evaluateDomainResult", () => {
  it("passes episodic-memory when accuracy ≥ 0.95", () => {
    const result = evaluateDomainResult("episodic-memory", 0.96);
    expect(result.passed).toBe(true);
  });

  it("fails episodic-memory when accuracy < 0.95", () => {
    const result = evaluateDomainResult("episodic-memory", 0.90);
    expect(result.passed).toBe(false);
  });

  it("passes personality when within test-retest band (score ≤ 1.0 SD)", () => {
    const result = evaluateDomainResult("personality", 0.8);
    expect(result.passed).toBe(true);
  });

  it("fails personality when exceeding test-retest band", () => {
    const result = evaluateDomainResult("personality", 1.5);
    expect(result.passed).toBe(false);
  });

  it("passes social-interaction when likert mean ≥ 4.0", () => {
    const result = evaluateDomainResult("social-interaction", 4.2);
    expect(result.passed).toBe(true);
  });

  it("fails social-interaction when likert mean < 4.0", () => {
    const result = evaluateDomainResult("social-interaction", 3.5);
    expect(result.passed).toBe(false);
  });

  it("passes novel-stimuli when indistinguishability ≤ 0.60", () => {
    // Score = judge accuracy at distinguishing; ≤ 0.60 means they can't tell
    const result = evaluateDomainResult("novel-stimuli", 0.55);
    expect(result.passed).toBe(true);
  });

  it("fails novel-stimuli when judges can distinguish at > 0.60", () => {
    const result = evaluateDomainResult("novel-stimuli", 0.75);
    expect(result.passed).toBe(false);
  });
});

describe("evaluateLayer1", () => {
  it("returns PASS when all domains pass", () => {
    const domains: DomainResult[] = [
      { domain: "episodic-memory", passed: true, score: 0.97, threshold: 0.95, details: "" },
      { domain: "personality", passed: true, score: 0.5, threshold: 1.0, details: "" },
      { domain: "cognitive-benchmarks", passed: true, score: 0.8, threshold: 1.0, details: "" },
    ];
    const result = evaluateLayer1(domains);
    expect(result.status).toBe("PASS");
    expect(result.failedDomainCount).toBe(0);
  });

  it("returns PARTIAL when 1-2 domains fail", () => {
    const domains: DomainResult[] = [
      { domain: "episodic-memory", passed: true, score: 0.97, threshold: 0.95, details: "" },
      { domain: "personality", passed: false, score: 1.5, threshold: 1.0, details: "" },
      { domain: "cognitive-benchmarks", passed: true, score: 0.8, threshold: 1.0, details: "" },
    ];
    const result = evaluateLayer1(domains);
    expect(result.status).toBe("PARTIAL");
    expect(result.failedDomainCount).toBe(1);
  });

  it("returns FAIL when ≥ 3 domains fail", () => {
    const domains: DomainResult[] = [
      { domain: "episodic-memory", passed: false, score: 0.80, threshold: 0.95, details: "" },
      { domain: "personality", passed: false, score: 2.0, threshold: 1.0, details: "" },
      { domain: "cognitive-benchmarks", passed: false, score: 2.5, threshold: 1.0, details: "" },
      { domain: "social-interaction", passed: true, score: 4.5, threshold: 4.0, details: "" },
    ];
    const result = evaluateLayer1(domains);
    expect(result.status).toBe("FAIL");
    expect(result.failedDomainCount).toBe(3);
  });

  it("computes overall score as mean of domain scores", () => {
    const domains: DomainResult[] = [
      { domain: "episodic-memory", passed: true, score: 0.80, threshold: 0.95, details: "" },
      { domain: "personality", passed: true, score: 0.60, threshold: 1.0, details: "" },
    ];
    const result = evaluateLayer1(domains);
    expect(result.overallScore).toBeCloseTo(0.70, 2);
  });

  it("returns 0 overall score for empty domains", () => {
    const result = evaluateLayer1([]);
    expect(result.overallScore).toBe(0);
    expect(result.status).toBe("PASS");
  });
});

// ── Layer 2: Neural-Dynamic Equivalence ─────────────────────────────────────

describe("evaluateNeuralMetric", () => {
  it("passes firing-rate-correlation when r ≥ 0.90", () => {
    const result = evaluateNeuralMetric("firing-rate-correlation", 0.95);
    expect(result.passed).toBe(true);
  });

  it("fails firing-rate-correlation when r < 0.90", () => {
    const result = evaluateNeuralMetric("firing-rate-correlation", 0.85);
    expect(result.passed).toBe(false);
  });

  it("passes oscillatory-power-spectrum when KL ≤ 0.1", () => {
    const result = evaluateNeuralMetric("oscillatory-power-spectrum", 0.08);
    expect(result.passed).toBe(true);
  });

  it("fails oscillatory-power-spectrum when KL > 0.1", () => {
    const result = evaluateNeuralMetric("oscillatory-power-spectrum", 0.15);
    expect(result.passed).toBe(false);
  });

  it("passes attractor-stability when cosine similarity ≥ 0.85", () => {
    const result = evaluateNeuralMetric("attractor-stability", 0.90);
    expect(result.passed).toBe(true);
  });

  it("passes temporal-dynamics when lag error ≤ 5ms", () => {
    const result = evaluateNeuralMetric("temporal-dynamics", 3.0);
    expect(result.passed).toBe(true);
  });

  it("fails temporal-dynamics when lag error > 5ms", () => {
    const result = evaluateNeuralMetric("temporal-dynamics", 7.0);
    expect(result.passed).toBe(false);
  });
});

describe("computeDivergenceIndex", () => {
  it("returns 0 when all metrics are within tolerance", () => {
    const metrics: MetricResult[] = [
      { metric: "firing-rate-correlation", passed: true, value: 0.95, tolerance: 0.90, details: "" },
      { metric: "attractor-stability", passed: true, value: 0.90, tolerance: 0.85, details: "" },
    ];
    const weights = new Map<NeuralMetric, number>([
      ["firing-rate-correlation", 1.0],
      ["attractor-stability", 1.0],
    ]);
    const di = computeDivergenceIndex(metrics, weights, 1.0);
    expect(di.value).toBe(0);
  });

  it("returns positive value when metrics exceed tolerance", () => {
    const metrics: MetricResult[] = [
      { metric: "firing-rate-correlation", passed: false, value: 0.80, tolerance: 0.90, details: "" },
    ];
    const weights = new Map<NeuralMetric, number>([["firing-rate-correlation", 1.0]]);
    const di = computeDivergenceIndex(metrics, weights, 1.0);
    expect(di.value).toBeGreaterThan(0);
  });

  it("weights contributions by metric weight", () => {
    const metrics: MetricResult[] = [
      { metric: "firing-rate-correlation", passed: false, value: 0.80, tolerance: 0.90, details: "" },
    ];
    const w1 = new Map<NeuralMetric, number>([["firing-rate-correlation", 1.0]]);
    const w2 = new Map<NeuralMetric, number>([["firing-rate-correlation", 2.0]]);
    const di1 = computeDivergenceIndex(metrics, w1, 1.0);
    const di2 = computeDivergenceIndex(metrics, w2, 1.0);
    expect(di2.value).toBeCloseTo(di1.value * 2, 5);
  });
});

describe("assessTemporalDrift", () => {
  it("returns acceptable for stable (flat) divergence", () => {
    const samples = [
      { timeHours: 1, divergenceValue: 0.1 },
      { timeHours: 24, divergenceValue: 0.1 },
      { timeHours: 168, divergenceValue: 0.1 },
    ];
    const result = assessTemporalDrift(samples, 1.0);
    expect(result.acceptable).toBe(true);
    expect(result.driftRate).toBeCloseTo(0, 5);
  });

  it("returns unacceptable for rapidly drifting divergence", () => {
    const samples = [
      { timeHours: 1, divergenceValue: 0.1 },
      { timeHours: 24, divergenceValue: 0.5 },
      { timeHours: 168, divergenceValue: 3.0 },
    ];
    const result = assessTemporalDrift(samples, 1.0);
    expect(result.acceptable).toBe(false);
    expect(result.driftRate).toBeGreaterThan(0);
    expect(result.projectedExceedanceHours).not.toBeNull();
  });

  it("returns acceptable for negative drift (improving)", () => {
    const samples = [
      { timeHours: 1, divergenceValue: 0.5 },
      { timeHours: 24, divergenceValue: 0.3 },
      { timeHours: 168, divergenceValue: 0.1 },
    ];
    const result = assessTemporalDrift(samples, 1.0);
    expect(result.acceptable).toBe(true);
    expect(result.driftRate).toBeLessThan(0);
  });

  it("handles single sample gracefully", () => {
    const result = assessTemporalDrift([{ timeHours: 1, divergenceValue: 0.1 }], 1.0);
    expect(result.acceptable).toBe(true);
    expect(result.driftRate).toBe(0);
  });
});

describe("evaluateLayer2", () => {
  it("returns PASS when all metrics pass and divergence within threshold", () => {
    const metrics: MetricResult[] = [
      { metric: "firing-rate-correlation", passed: true, value: 0.95, tolerance: 0.90, details: "" },
      { metric: "attractor-stability", passed: true, value: 0.90, tolerance: 0.85, details: "" },
    ];
    const di = { value: 0.05, threshold: 1.0, contributions: new Map() };
    const result = evaluateLayer2(metrics, di, null);
    expect(result.status).toBe("PASS");
  });

  it("returns FAIL when all metrics fail", () => {
    const metrics: MetricResult[] = [
      { metric: "firing-rate-correlation", passed: false, value: 0.50, tolerance: 0.90, details: "" },
      { metric: "attractor-stability", passed: false, value: 0.30, tolerance: 0.85, details: "" },
    ];
    const di = { value: 2.0, threshold: 1.0, contributions: new Map() };
    const result = evaluateLayer2(metrics, di, null);
    expect(result.status).toBe("FAIL");
  });

  it("returns FAIL when temporal drift is unacceptable", () => {
    const metrics: MetricResult[] = [
      { metric: "firing-rate-correlation", passed: true, value: 0.95, tolerance: 0.90, details: "" },
    ];
    const di = { value: 0.05, threshold: 1.0, contributions: new Map() };
    const drift = { driftRate: 0.1, projectedExceedanceHours: 100, acceptable: false };
    const result = evaluateLayer2(metrics, di, drift);
    expect(result.status).toBe("FAIL");
  });
});

// ── Layer 3: Experiential Equivalence ───────────────────────────────────────

describe("evaluateLayer3", () => {
  it("returns PASS when consciousness confirmed and first-person passes", () => {
    const result = evaluateLayer3(makePassingConsciousness(), makePassingFirstPerson());
    expect(result.status).toBe("PASS");
  });

  it("returns FAIL when consciousness metrics fail (zombie detection)", () => {
    const result = evaluateLayer3(makeFailingConsciousness(), makePassingFirstPerson());
    expect(result.status).toBe("FAIL");
    expect(result.failureFlags).toContain("false-positive-zombie");
  });

  it("returns PROVISIONAL when original is unavailable", () => {
    const result = evaluateLayer3(makePassingConsciousness(), null);
    expect(result.status).toBe("PROVISIONAL");
  });

  it("returns FAIL when fundamental absence reported", () => {
    const fp = makePassingFirstPerson();
    fp.hasFundamentalAbsence = true;
    fp.divergences = [{
      reportedBy: "emulation",
      description: "No emotional experience",
      classification: "genuine-divergence",
      fundamentalAbsence: true,
    }];
    const result = evaluateLayer3(makePassingConsciousness(), fp);
    expect(result.status).toBe("FAIL");
    expect(result.failureFlags).toContain("false-positive-zombie");
  });
});

// ── Validation Sequencing ───────────────────────────────────────────────────

describe("shouldRunLayer2", () => {
  it("allows Layer 2 when Layer 1 passes", () => {
    expect(shouldRunLayer2({
      status: "PASS", domainResults: new Map(), overallScore: 0.95, failedDomainCount: 0,
    })).toBe(true);
  });

  it("allows Layer 2 when Layer 1 is partial with ≤ 2 failures", () => {
    expect(shouldRunLayer2({
      status: "PARTIAL", domainResults: new Map(), overallScore: 0.8, failedDomainCount: 2,
    })).toBe(true);
  });

  it("blocks Layer 2 when Layer 1 fails", () => {
    expect(shouldRunLayer2({
      status: "FAIL", domainResults: new Map(), overallScore: 0.4, failedDomainCount: 3,
    })).toBe(false);
  });
});

describe("shouldRunLayer3A", () => {
  it("allows Layer 3A when Layer 2 passes", () => {
    const l2 = { status: "PASS" as const, metricResults: new Map(), divergenceIndex: { value: 0, threshold: 1, contributions: new Map() }, temporalDrift: null };
    expect(shouldRunLayer3A(l2)).toBe(true);
  });

  it("blocks Layer 3A when Layer 2 fails", () => {
    const l2 = { status: "FAIL" as const, metricResults: new Map(), divergenceIndex: { value: 2, threshold: 1, contributions: new Map() }, temporalDrift: null };
    expect(shouldRunLayer3A(l2)).toBe(false);
  });
});

describe("shouldRunLayer3B", () => {
  it("allows Layer 3B when consciousness confirmed", () => {
    expect(shouldRunLayer3B(makePassingConsciousness())).toBe(true);
  });

  it("blocks Layer 3B when consciousness not confirmed", () => {
    expect(shouldRunLayer3B(makeFailingConsciousness())).toBe(false);
  });
});

// ── Overall Verdict ─────────────────────────────────────────────────────────

describe("determineVerdict", () => {
  const passingL1 = { status: "PASS" as const, domainResults: new Map(), overallScore: 0.95, failedDomainCount: 0 };
  const passingL2 = { status: "PASS" as const, metricResults: new Map(), divergenceIndex: { value: 0.05, threshold: 1.0, contributions: new Map() }, temporalDrift: null };
  const passingL3 = { status: "PASS" as const, consciousnessMetrics: makePassingConsciousness(), firstPersonVerification: makePassingFirstPerson(), failureFlags: [] as any };

  it("returns VALIDATED when all layers pass", () => {
    const { verdict } = determineVerdict(passingL1, passingL2, passingL3);
    expect(verdict).toBe("VALIDATED");
  });

  it("returns FAILED when Layer 1 fails", () => {
    const failL1 = { ...passingL1, status: "FAIL" as const, failedDomainCount: 3 };
    const { verdict } = determineVerdict(failL1, passingL2, passingL3);
    expect(verdict).toBe("FAILED");
  });

  it("returns FAILED when Layer 2 fails", () => {
    const failL2 = { ...passingL2, status: "FAIL" as const };
    const { verdict } = determineVerdict(passingL1, failL2, passingL3);
    expect(verdict).toBe("FAILED");
  });

  it("returns FAILED when Layer 3 fails", () => {
    const failL3 = { ...passingL3, status: "FAIL" as const, failureFlags: ["false-positive-zombie" as const] };
    const { verdict } = determineVerdict(passingL1, passingL2, failL3);
    expect(verdict).toBe("FAILED");
  });

  it("returns PROVISIONALLY_VALIDATED when Layer 3 is provisional", () => {
    const provisionalL3 = { ...passingL3, status: "PROVISIONAL" as const, firstPersonVerification: null };
    const { verdict, recommendations } = determineVerdict(passingL1, passingL2, provisionalL3);
    expect(verdict).toBe("PROVISIONALLY_VALIDATED");
    expect(recommendations.some(r => r.includes("First-person"))).toBe(true);
  });

  it("identifies temporal drift failure mode", () => {
    const driftL2 = {
      ...passingL2,
      status: "FAIL" as const,
      temporalDrift: { driftRate: 0.1, projectedExceedanceHours: 100, acceptable: false },
    };
    const { failureModes, recommendations } = determineVerdict(passingL1, driftL2, passingL3);
    expect(failureModes).toContain("temporal-drift");
    expect(recommendations.some(r => r.includes("0.2.2.1.3"))).toBe(true);
  });

  it("identifies false-negative substrate offset", () => {
    const partialL1 = { ...passingL1, status: "PARTIAL" as const, failedDomainCount: 1 };
    const failL3 = { ...passingL3, status: "FAIL" as const, failureFlags: [] as any };
    const { failureModes } = determineVerdict(partialL1, passingL2, failL3);
    expect(failureModes).toContain("false-negative-substrate-offset");
  });
});
