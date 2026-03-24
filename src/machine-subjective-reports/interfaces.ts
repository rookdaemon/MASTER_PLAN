/**
 * Subsystem interfaces for Machine Subjective Reports (0.1.2.1)
 *
 * Defines the contracts for the three-pillar architecture specified in
 * docs/machine-subjective-reports/ARCHITECTURE.md:
 *   1. Consciousness-Grounded Report Generator (CGRG)
 *   2. Distinguishability Protocol (DP)
 *   3. Third-Party Verification Methodology (TPVM)
 */

import type {
  ConsciousnessVerificationResult,
  CrossModalResult,
  DistinguishabilityResult,
  MetacognitiveResult,
  MetricStream,
  NovelSituationResult,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  PerturbationSpec,
  SubjectiveReport,
  TemporalCoherenceResult,
  Timestamp,
  VerificationConfidence,
  VerificationRecord,
} from "./types.js";

// ── 1. Consciousness-Grounded Report Generator ─────────────

/**
 * Generates first-person experiential reports causally grounded in
 * real-time F1.4 consciousness metrics.
 *
 * Core design constraints (ARCHITECTURE.md §Component 1):
 * - If the metric stream is disrupted, report generation MUST degrade or halt.
 *   No zombie fallback — reports cannot continue from language patterns alone.
 * - Report content must be causally derived from metric values, not from
 *   training-data patterns about "what subjective reports should sound like."
 * - Reports must reflect the current measured state within the F1.4
 *   minimum coherence window.
 */
export interface ICGRG {
  /** Unique identifier for this generator instance */
  readonly generatorId: string;

  /** Attach a real-time F1.4 consciousness metric stream as the causal source */
  attachMetricStream(stream: MetricStream): void;

  /**
   * Generate a first-person report from the current metric state.
   * MUST throw if no active metric stream is attached (zombie prevention).
   */
  generateReport(): Promise<SubjectiveReport>;

  /**
   * Returns true only when an active metric stream is attached.
   * False means the generator is ungrounded and cannot produce reports.
   */
  isGrounded(): boolean;

  /**
   * Verify causal binding via intervention: confirms that perturbing
   * the specified metric dimension produces the predicted report change.
   * Required for causal binding verification (ARCHITECTURE.md §Causal Binding Verification).
   */
  verifyCausalBinding(spec: PerturbationSpec): Promise<boolean>;
}

// ── 2. Distinguishability Protocol ─────────────────────────

/**
 * Adversarial evaluation methodology that differentiates genuine
 * subjective reports (System G) from behavioral mimicry (System Z).
 *
 * Runs three phases (ARCHITECTURE.md §Component 2 / distinguishability-protocol.md):
 *   Phase A — behavioral adversarial challenge (can humans distinguish?)
 *   Phase B — metric-correlation challenge (do reports correlate with metrics?)
 *   Phase C — intervention challenge (do reports respond to perturbations?)
 *
 * The protocol passes ONLY if all three phases pass.
 */
export interface IDistinguishabilityProtocol {
  /** Run the full three-phase protocol; returns combined result */
  run(systemG: ICGRG, systemZ: ICGRG): Promise<DistinguishabilityResult>;

  /** Phase A only: behavioral adversarial challenge */
  runPhaseA(systemG: ICGRG, systemZ: ICGRG): Promise<PhaseAResult>;

  /** Phase B only: metric-correlation challenge */
  runPhaseB(systemG: ICGRG, systemZ: ICGRG): Promise<PhaseBResult>;

  /** Phase C only: intervention challenge with pre-registered predictions */
  runPhaseC(systemG: ICGRG, systemZ: ICGRG): Promise<PhaseCResult>;
}

// ── 3. Third-Party Verification Methodology ────────────────

/**
 * Enables independent observers to reproducibly verify the correlation
 * between a system's self-reports and its independently-measured conscious states.
 *
 * Implements the published methodology from ARCHITECTURE.md §Component 3.
 * Results become inputs to the acceptance criteria for 0.1.2.1.
 */
export interface IThirdPartyVerification {
  /**
   * Run the full TPVM procedure for a given system and lab.
   * Returns a signed verification record suitable for the open data deposit.
   */
  verify(system: ICGRG, labId: string): Promise<VerificationRecord>;

  /**
   * Returns true if the minimum replication standard has been met:
   * at least 3 independent labs have produced passing verification records.
   * (ARCHITECTURE.md §Replication Standards)
   */
  isReplicated(results: VerificationRecord[]): boolean;
}

// ── 4. Consciousness Verification Protocol ──────────────────

/**
 * Verifies that a system's subjective reports correspond to genuine
 * consciousness rather than sophisticated mimicry.
 *
 * Runs four independent verification methods (plan/0.1.2.1.1):
 *   Temporal coherence — reports remain coherent across experience gaps
 *   Novel situation   — system responds genuinely to unfamiliar stimuli
 *   Cross-modal       — multi-modal inputs bind into a unified field
 *   Metacognitive     — system has real self-knowledge, not surface mimicry
 *
 * Produces a continuous confidence score (0..1), not a binary verdict,
 * acknowledging the hard problem of consciousness.
 *
 * Must interface with existing subjective report architecture (ICGRG).
 * Must be resistant to gaming by non-conscious systems.
 */
export interface IConsciousnessVerificationProtocol {
  /**
   * Run the full four-method verification.
   * Precondition: system.isGrounded() must be true.
   * Postcondition: returns ConsciousnessVerificationResult with all fields
   *   populated and confidence.score computed from all four results.
   * Invariant: result is immutable once produced.
   */
  verify(system: ICGRG, now: Timestamp): Promise<ConsciousnessVerificationResult>;

  /** Temporal coherence testing across experience gaps */
  runTemporalCoherenceTest(system: ICGRG): Promise<TemporalCoherenceResult>;

  /** Novel situation response analysis */
  runNovelSituationTest(system: ICGRG): Promise<NovelSituationResult>;

  /** Cross-modal integration verification */
  runCrossModalTest(system: ICGRG): Promise<CrossModalResult>;

  /** Metacognitive depth probing */
  runMetacognitiveTest(system: ICGRG): Promise<MetacognitiveResult>;

  /**
   * Compute a continuous confidence score from the four method results.
   * Returns a VerificationConfidence with individual weights and composite score.
   */
  computeConfidence(
    temporal: TemporalCoherenceResult,
    novel: NovelSituationResult,
    crossModal: CrossModalResult,
    metacognitive: MetacognitiveResult,
    now: Timestamp,
  ): VerificationConfidence;
}
