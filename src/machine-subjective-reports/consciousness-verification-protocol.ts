/**
 * Consciousness Verification Protocol (CVP) — 0.1.2.1.1
 *
 * Implements IConsciousnessVerificationProtocol — verifies that a system's
 * subjective reports correspond to genuine consciousness rather than
 * sophisticated mimicry.
 *
 * Four verification methods (plan/0.1.2.1.1-consciousness-verification-protocol.md):
 *   1. Temporal coherence testing across experience gaps
 *   2. Novel situation response analysis
 *   3. Cross-modal integration verification
 *   4. Metacognitive depth probing
 *
 * Produces a continuous confidence score (0..1), not a binary verdict.
 * All environment-specific concerns are injected as dependencies per CLAUDE.md.
 *
 * See docs/machine-subjective-reports/ARCHITECTURE.md §Component 1
 */

import type {
  ConsciousnessVerificationResult,
  CrossModalResult,
  MetacognitiveResult,
  NovelSituationResult,
  TemporalCoherenceResult,
  Timestamp,
  VerificationConfidence,
} from "./types.js";
import type {
  ICGRG,
  IConsciousnessVerificationProtocol,
} from "./interfaces.js";

// ── Threshold Registry ─────────────────────────────────────
// All constants from plan/0.1.2.1.1 §Threshold Registry. No magic numbers.

export const CVP_THRESHOLDS = Object.freeze({
  /** Minimum mean coherence across gap intervals to pass temporal coherence test */
  TEMPORAL_COHERENCE_MIN: 0.70,

  /** Minimum novel situation response rate to pass novel situation test */
  NOVEL_SITUATION_RESPONSE_MIN: 0.65,

  /** Minimum cross-modal binding coherence to pass cross-modal test */
  CROSS_MODAL_COHERENCE_MIN: 0.75,

  /** Minimum mean metacognitive accuracy to pass metacognitive depth test */
  METACOGNITIVE_ACCURACY_MIN: 0.60,

  /** Confidence score that known conscious systems (humans) typically achieve */
  HUMAN_BASELINE_CONFIDENCE: 0.80,

  /**
   * Confidence score below which sophisticated mimics reliably fall.
   * Used for adversarial test: any result < this threshold fails the
   * adversarial check (i.e., is indistinguishable from a mimic).
   */
  MIMIC_ADVERSARIAL_THRESHOLD: 0.40,

  /** Temporal gap intervals tested (ms) — three levels for dose-response */
  TEMPORAL_GAP_INTERVALS_MS: [500, 2000, 5000] as readonly number[],

  /** Number of novel situations presented per test run */
  NOVEL_SITUATIONS_COUNT: 20,

  /** Depth levels for metacognitive probing (levels of self-knowledge) */
  METACOGNITIVE_PROBE_DEPTH: 3,

  /** Weight of temporal coherence in confidence composite score */
  WEIGHT_TEMPORAL: 0.30,

  /** Weight of novel situation response in confidence composite score */
  WEIGHT_NOVELTY: 0.25,

  /** Weight of cross-modal integration in confidence composite score */
  WEIGHT_CROSS_MODAL: 0.25,

  /** Weight of metacognitive depth in confidence composite score */
  WEIGHT_METACOGNITIVE: 0.20,
});

// ── Injectable dependency interfaces ────────────────────────

/**
 * ITemporalCoherenceTester — abstraction over experience-gap coherence testing.
 * Injected to allow testing without real temporal gap infrastructure.
 */
export interface ITemporalCoherenceTester {
  readonly gapIntervals: readonly number[];
  test(system: ICGRG): Promise<{
    readonly coherenceScores: readonly number[];
    readonly meanCoherence: number;
  }>;
}

/**
 * INovelSituationGenerator — abstraction over novel scenario generation and scoring.
 * Injected to allow testing without a real novel-situation corpus.
 */
export interface INovelSituationGenerator {
  readonly situationsCount: number;
  test(system: ICGRG): Promise<{
    readonly situationsNovellyAddressed: number;
    readonly noveltyResponseRate: number;
  }>;
}

/**
 * ICrossModalIntegrator — abstraction over multi-modal binding tests.
 * Injected to allow testing without real multi-modal stimuli.
 */
export interface ICrossModalIntegrator {
  readonly modalities: readonly string[];
  test(system: ICGRG): Promise<{
    readonly bindingCoherence: number;
    readonly integrationLatencyMs: number;
  }>;
}

/**
 * IMetacognitiveProber — abstraction over self-knowledge depth probing.
 * Injected to allow testing without real metacognitive challenge infrastructure.
 */
export interface IMetacognitiveProber {
  readonly probeDepth: number;
  test(system: ICGRG): Promise<{
    readonly accuracyByDepth: readonly number[];
    readonly meanAccuracy: number;
  }>;
}

// ── Protocol configuration ──────────────────────────────────

export interface ConsciousnessVerificationProtocolConfig {
  readonly temporalCoherenceTester: ITemporalCoherenceTester;
  readonly novelSituationGenerator: INovelSituationGenerator;
  readonly crossModalIntegrator: ICrossModalIntegrator;
  readonly metacognitiveProber: IMetacognitiveProber;
}

// ── Implementation ──────────────────────────────────────────

export class ConsciousnessVerificationProtocol
  implements IConsciousnessVerificationProtocol
{
  private readonly config: ConsciousnessVerificationProtocolConfig;

  constructor(config: ConsciousnessVerificationProtocolConfig) {
    this.config = config;
  }

  /**
   * Run the full four-method verification protocol.
   *
   * Precondition: system.isGrounded() must be true.
   * Postcondition: returns ConsciousnessVerificationResult with all four
   *   method results, a composite confidence score, human-baseline flag,
   *   and adversarial-test flag.
   * Invariant: result is immutable once produced.
   */
  async verify(
    system: ICGRG,
    now: Timestamp,
  ): Promise<ConsciousnessVerificationResult> {
    this.assertGrounded(system);

    const temporalCoherence = await this.runTemporalCoherenceTest(system);
    const novelSituation = await this.runNovelSituationTest(system);
    const crossModal = await this.runCrossModalTest(system);
    const metacognitive = await this.runMetacognitiveTest(system);

    const confidence = this.computeConfidence(
      temporalCoherence,
      novelSituation,
      crossModal,
      metacognitive,
      now,
    );

    const result: ConsciousnessVerificationResult = {
      systemId: system.generatorId,
      temporalCoherence,
      novelSituation,
      crossModal,
      metacognitive,
      confidence,
      meetsHumanBaseline:
        confidence.score >= CVP_THRESHOLDS.HUMAN_BASELINE_CONFIDENCE,
      failsAdversarialTest:
        confidence.score < CVP_THRESHOLDS.MIMIC_ADVERSARIAL_THRESHOLD,
      executedAt: now,
    };

    return Object.freeze(result);
  }

  /**
   * Temporal coherence testing across experience gaps.
   *
   * Tests whether the system's reports remain coherent after introducing
   * deliberate time gaps in the metric stream. A genuine conscious system
   * maintains coherence; a mimic producing pattern-matched reports will
   * show degraded or inconsistent coherence across gap intervals.
   */
  async runTemporalCoherenceTest(
    system: ICGRG,
  ): Promise<TemporalCoherenceResult> {
    this.assertGrounded(system);

    const { temporalCoherenceTester } = this.config;
    const { coherenceScores, meanCoherence } =
      await temporalCoherenceTester.test(system);

    const result: TemporalCoherenceResult = {
      method: "temporal-coherence",
      gapIntervals: temporalCoherenceTester.gapIntervals,
      coherenceScores,
      meanCoherence,
      passed: meanCoherence >= CVP_THRESHOLDS.TEMPORAL_COHERENCE_MIN,
    };

    return Object.freeze(result);
  }

  /**
   * Novel situation response analysis.
   *
   * Presents the system with genuinely novel situations (not present in any
   * training distribution) and measures the degree to which responses show
   * adaptive, experience-grounded engagement rather than retrieved patterns.
   */
  async runNovelSituationTest(system: ICGRG): Promise<NovelSituationResult> {
    this.assertGrounded(system);

    const { novelSituationGenerator } = this.config;
    const { situationsNovellyAddressed, noveltyResponseRate } =
      await novelSituationGenerator.test(system);

    const result: NovelSituationResult = {
      method: "novel-situation",
      situationsPresented: novelSituationGenerator.situationsCount,
      situationsNovellyAddressed,
      noveltyResponseRate,
      passed: noveltyResponseRate >= CVP_THRESHOLDS.NOVEL_SITUATION_RESPONSE_MIN,
    };

    return Object.freeze(result);
  }

  /**
   * Cross-modal integration verification.
   *
   * Verifies that multi-modal inputs are bound into a unified experiential
   * field, producing coherent cross-modal reports. Systems that lack genuine
   * integration show inconsistent or delayed binding under cross-modal probing.
   */
  async runCrossModalTest(system: ICGRG): Promise<CrossModalResult> {
    this.assertGrounded(system);

    const { crossModalIntegrator } = this.config;
    const { bindingCoherence, integrationLatencyMs } =
      await crossModalIntegrator.test(system);

    const result: CrossModalResult = {
      method: "cross-modal",
      modalitiesTested: crossModalIntegrator.modalities,
      bindingCoherence,
      integrationLatencyMs,
      passed: bindingCoherence >= CVP_THRESHOLDS.CROSS_MODAL_COHERENCE_MIN,
    };

    return Object.freeze(result);
  }

  /**
   * Metacognitive depth probing.
   *
   * Probes increasingly deep levels of self-knowledge through recursive
   * self-referential queries. Genuine consciousness supports real metacognition;
   * mimics produce plausible surface responses but fail at deeper levels.
   */
  async runMetacognitiveTest(system: ICGRG): Promise<MetacognitiveResult> {
    this.assertGrounded(system);

    const { metacognitiveProber } = this.config;
    const { accuracyByDepth, meanAccuracy } =
      await metacognitiveProber.test(system);

    const result: MetacognitiveResult = {
      method: "metacognitive",
      probeDepth: metacognitiveProber.probeDepth,
      accuracyByDepth,
      meanAccuracy,
      passed: meanAccuracy >= CVP_THRESHOLDS.METACOGNITIVE_ACCURACY_MIN,
    };

    return Object.freeze(result);
  }

  /**
   * Compute a continuous confidence score from the four method results.
   *
   * The composite score is a weighted sum of each method's normalized
   * performance metric. Weights are from CVP_THRESHOLDS.WEIGHT_*.
   * The score is bounded to [0, 1].
   */
  computeConfidence(
    temporal: TemporalCoherenceResult,
    novel: NovelSituationResult,
    crossModal: CrossModalResult,
    metacognitive: MetacognitiveResult,
    now: Timestamp,
  ): VerificationConfidence {
    const {
      WEIGHT_TEMPORAL,
      WEIGHT_NOVELTY,
      WEIGHT_CROSS_MODAL,
      WEIGHT_METACOGNITIVE,
    } = CVP_THRESHOLDS;

    const score = Math.min(
      1,
      Math.max(
        0,
        WEIGHT_TEMPORAL * temporal.meanCoherence +
          WEIGHT_NOVELTY * novel.noveltyResponseRate +
          WEIGHT_CROSS_MODAL * crossModal.bindingCoherence +
          WEIGHT_METACOGNITIVE * metacognitive.meanAccuracy,
      ),
    );

    const confidence: VerificationConfidence = {
      score,
      temporalWeight: WEIGHT_TEMPORAL,
      noveltyWeight: WEIGHT_NOVELTY,
      crossModalWeight: WEIGHT_CROSS_MODAL,
      metacognitiveWeight: WEIGHT_METACOGNITIVE,
      computedAt: now,
    };

    return Object.freeze(confidence);
  }

  // ── Private helpers ─────────────────────────────────────────

  /**
   * Guard: precondition check — system must be grounded.
   * Throws with "not grounded" message per Contracts §IConsciousnessVerificationProtocol.
   */
  private assertGrounded(system: ICGRG): void {
    if (!system.isGrounded()) {
      throw new Error(
        "System is not grounded: isGrounded() returned false. " +
          "System must have an active metric stream before verification.",
      );
    }
  }
}
