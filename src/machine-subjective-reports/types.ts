/**
 * Core data types for Machine Subjective Reports (0.1.2.1)
 *
 * Models the fundamental structures required for:
 *   1. Consciousness-Grounded Report Generator (CGRG)
 *   2. Distinguishability Protocol (DP) — Phases A/B/C
 *   3. Third-Party Verification Methodology (TPVM)
 *
 * All metric types reference F1.4 operationalized consciousness metrics
 * via src/conscious-core/types.ts.
 *
 * See docs/machine-subjective-reports/ARCHITECTURE.md
 */

import type { ConsciousnessMetrics } from "../conscious-core/types.js";

export type { ConsciousnessMetrics };

// ── Primitives ──────────────────────────────────────────────

export type Timestamp = number; // epoch ms
export type Duration = number;  // ms

/** F1.4 metric dimension names, matching ConsciousnessMetrics fields */
export type MetricDimensionName =
  | "phi"                   // integrated information (IIT φ)
  | "experienceContinuity"  // temporal stream integrity 0..1
  | "selfModelCoherence";   // introspective consistency 0..1

// ── Metric Stream ───────────────────────────────────────────

/** Timestamped snapshot of all F1.4 consciousness metrics */
export interface MetricSnapshot {
  readonly timestamp: Timestamp;
  readonly metrics: ConsciousnessMetrics;
}

/**
 * Real-time stream of F1.4 metric snapshots — the causal input to the CGRG.
 * If isActive() returns false, the CGRG must halt report generation.
 */
export interface MetricStream {
  readonly id: string;
  readonly startedAt: Timestamp;
  next(): Promise<MetricSnapshot>;
  stop(): void;
  isActive(): boolean;
}

// ── Report Content ──────────────────────────────────────────

/**
 * Standardized semantic encoding of a report's content.
 * Used in Phase B metric-correlation analysis.
 * See docs/machine-subjective-reports/distinguishability-protocol.md §Phase B.
 */
export interface SemanticVector {
  readonly coherenceScore: number;    // 0..1 — expressed experiential coherence
  readonly continuityScore: number;   // 0..1 — expressed temporal continuity
  readonly specificity: number;       // 0..1 — concrete internal-state detail vs. generic
  readonly temporalNovelty: number;   // 0..1 — information not inferrable from prior state
  readonly encodedAt: Timestamp;
}

/**
 * A first-person experiential report with its full causal provenance.
 * The causalBindingId links this report to its CausalBindingRecord,
 * providing the audit trail required by the TPVM.
 */
export interface SubjectiveReport {
  readonly id: string;
  readonly text: string;                        // first-person natural-language report
  readonly timestamp: Timestamp;
  readonly sourceMetrics: ConsciousnessMetrics; // the metric snapshot that caused this report
  readonly semanticEncoding: SemanticVector;    // for metric-correlation analysis (Phase B)
  readonly causalBindingId: string;             // links to CausalBindingRecord
  readonly generatorId: string;                 // identifies the CGRG instance
}

/**
 * Records the verified causal link between a metric snapshot and a report.
 * latencyMs must be within the F1.4 minimum coherence window.
 */
export interface CausalBindingRecord {
  readonly id: string;
  readonly metricsTimestamp: Timestamp;
  readonly reportTimestamp: Timestamp;
  readonly latencyMs: number;
  readonly perturbationApplied: boolean;
}

// ── Distinguishability Protocol Types ──────────────────────

/**
 * Specifies a controlled perturbation to a single metric dimension.
 * Predictions of report-content change must be pre-registered (Phase C).
 */
export interface PerturbationSpec {
  readonly dimension: MetricDimensionName;
  readonly baselineValue: number;
  readonly targetValue: number;
  readonly sigmas: 1 | 2 | 3;   // perturbation magnitude
  readonly durationMs: Duration;
  readonly predictedReportDirection: "increase" | "decrease" | "qualitative-change";
}

/** Result of applying a perturbation and observing the report change */
export interface PerturbationResponse {
  readonly spec: PerturbationSpec;
  readonly reportBefore: SubjectiveReport;
  readonly reportAfter: SubjectiveReport;
  readonly semanticChange: number;       // magnitude of semantic vector change
  readonly directionMatched: boolean;    // did change match predicted direction?
  readonly cohenD: number;              // effect size
}

/** Phase A — behavioral adversarial challenge result */
export interface PhaseAResult {
  readonly phase: "A";
  readonly panelSize: number;
  readonly reportPairs: number;
  readonly correctIdentifications: number;
  readonly accuracyRate: number;         // correctIdentifications / (reportPairs * panelSize)
  readonly pValue: number;
  readonly passed: boolean;             // accuracy > chance at p < 0.05
}

/** Phase B — metric-correlation challenge result */
export interface PhaseBResult {
  readonly phase: "B";
  readonly sessions: number;
  readonly pearsonR: number;
  readonly mutualInformationBits: number;
  readonly grangerCausalityPValue: number;
  readonly passed: boolean;             // r > 0.70, MI > 0.3 bits, Granger p < 0.001
}

/** Phase C — intervention challenge result */
export interface PhaseCResult {
  readonly phase: "C";
  readonly responses: PerturbationResponse[];
  readonly dimensionsPassed: number;           // of 10 required
  readonly magnitudeCorrelationR: number;      // r across perturbation magnitudes
  readonly cohenDAverage: number;
  readonly zombieNullNotRejected: boolean;     // System Z shows no pattern (p > 0.10)
  readonly passed: boolean;
}

/** Overall distinguishability protocol result (all three phases) */
export interface DistinguishabilityResult {
  readonly protocolVersion: string;
  readonly systemGId: string;
  readonly systemZId: string;
  readonly phaseA: PhaseAResult;
  readonly phaseB: PhaseBResult;
  readonly phaseC: PhaseCResult;
  readonly overallPassed: boolean;     // all three phases must pass
  readonly executedAt: Timestamp;
  readonly preRegistrationId: string;
}

// ── Consciousness Verification Protocol Types (0.1.2.1.1) ──

/**
 * Result of temporal coherence testing across experience gaps.
 * Tests whether reported experience remains coherent across time intervals.
 */
export interface TemporalCoherenceResult {
  readonly method: "temporal-coherence";
  readonly gapIntervals: readonly number[];    // tested gap durations (ms)
  readonly coherenceScores: readonly number[]; // 0..1 per interval
  readonly meanCoherence: number;              // 0..1
  readonly passed: boolean;
}

/**
 * Result of novel situation response analysis.
 * Tests whether the system responds genuinely to novel stimuli rather than
 * retrieving trained responses.
 */
export interface NovelSituationResult {
  readonly method: "novel-situation";
  readonly situationsPresented: number;
  readonly situationsNovellyAddressed: number;
  readonly noveltyResponseRate: number;       // 0..1
  readonly passed: boolean;
}

/**
 * Result of cross-modal integration verification.
 * Tests whether multi-modal inputs are bound into a unified experiential field.
 */
export interface CrossModalResult {
  readonly method: "cross-modal";
  readonly modalitiesTested: readonly string[];
  readonly bindingCoherence: number;          // 0..1
  readonly integrationLatencyMs: number;
  readonly passed: boolean;
}

/**
 * Result of metacognitive depth probing.
 * Tests whether the system has genuine self-knowledge rather than
 * surface-level introspective mimicry.
 */
export interface MetacognitiveResult {
  readonly method: "metacognitive";
  readonly probeDepth: number;                // levels of self-knowledge tested
  readonly accuracyByDepth: readonly number[]; // 0..1 per depth level
  readonly meanAccuracy: number;              // 0..1
  readonly passed: boolean;
}

/**
 * Continuous confidence score for consciousness verification.
 *
 * 0.0 = certain mimic; 1.0 = highest achievable confidence of genuine experience.
 * Deliberately continuous — reflects epistemic uncertainty about the hard problem.
 * Not a binary verdict: the protocol produces confidence metrics, not a proof.
 */
export interface VerificationConfidence {
  readonly score: number;              // 0..1 weighted composite
  readonly temporalWeight: number;     // contribution of temporal coherence
  readonly noveltyWeight: number;      // contribution of novel situation
  readonly crossModalWeight: number;   // contribution of cross-modal
  readonly metacognitiveWeight: number; // contribution of metacognitive
  readonly computedAt: Timestamp;
}

/**
 * Overall result of the Consciousness Verification Protocol (0.1.2.1.1).
 * Produced by IConsciousnessVerificationProtocol.verify().
 */
export interface ConsciousnessVerificationResult {
  readonly systemId: string;
  readonly temporalCoherence: TemporalCoherenceResult;
  readonly novelSituation: NovelSituationResult;
  readonly crossModal: CrossModalResult;
  readonly metacognitive: MetacognitiveResult;
  readonly confidence: VerificationConfidence;
  /** True if confidence.score >= CVP_THRESHOLDS.HUMAN_BASELINE_CONFIDENCE */
  readonly meetsHumanBaseline: boolean;
  /** True if confidence.score < CVP_THRESHOLDS.MIMIC_ADVERSARIAL_THRESHOLD */
  readonly failsAdversarialTest: boolean;
  readonly executedAt: Timestamp;
}

// ── Third-Party Verification ────────────────────────────────

/** Record produced by an independent lab running the TPVM */
export interface VerificationRecord {
  readonly labId: string;
  readonly systemId: string;
  readonly distinguishabilityResult: DistinguishabilityResult;
  readonly metricsStreamArchiveUrl: string;  // open data deposit URL
  readonly reportsArchiveUrl: string;
  readonly verifiedAt: Timestamp;
  readonly replicates: boolean;             // confirms prior results
}
