/**
 * Distinguishability Protocol (DP) — Three-phase adversarial evaluation
 *
 * Implements IDistinguishabilityProtocol — differentiates genuine subjective
 * reports (System G) from sophisticated behavioral mimicry (System Z).
 *
 * Three phases (docs/machine-subjective-reports/distinguishability-protocol.md):
 *   Phase A — behavioral adversarial challenge (can humans distinguish?)
 *   Phase B — metric-correlation challenge (do reports correlate with metrics?)
 *   Phase C — intervention challenge (do reports respond to perturbations?)
 *
 * All environment-specific concerns (panel evaluation, correlation analysis,
 * perturbation application) are injected as dependencies per CLAUDE.md.
 *
 * See docs/machine-subjective-reports/ARCHITECTURE.md §Component 2
 */

import type {
  DistinguishabilityResult,
  MetricDimensionName,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  PerturbationResponse,
  SubjectiveReport,
  Timestamp,
} from "./types.js";
import type { ICGRG, IDistinguishabilityProtocol } from "./interfaces.js";

// ── Threshold Registry ─────────────────────────────────────
// All constants from card §Threshold Registry. No unregistered magic numbers.

export const DP_THRESHOLDS = Object.freeze({
  /** Minimum panel size for statistical power (binomial test p < 0.05) */
  PHASE_A_PANEL_SIZE: 5,

  /** Number of report pairs for Phase A evaluation */
  PHASE_A_REPORT_PAIRS: 50,

  /** One-tailed significance threshold for above-chance identification */
  PHASE_A_SIGNIFICANCE: 0.05,

  /** Minimum sessions for stable correlation estimates */
  PHASE_B_SESSIONS: 100,

  /** Strong correlation per Cohen's guidelines */
  PHASE_B_PEARSON_R: 0.70,

  /** Meaningful information transfer beyond noise floor (bits) */
  PHASE_B_MUTUAL_INFORMATION: 0.30,

  /** Stringent causal-direction threshold with Bonferroni correction */
  PHASE_B_GRANGER_P_VALUE: 0.001,

  /** Number of metric dimensions tested in Phase C */
  PHASE_C_DIMENSIONS_TESTED: 10,

  /** Minimum dimensions that must pass (sign test p < 0.05, N=10) */
  PHASE_C_PASS_THRESHOLD: 8,

  /** Dose-response correlation across perturbation magnitudes */
  PHASE_C_MAGNITUDE_CORRELATION: 0.70,

  /** Large effect size per Cohen's guidelines */
  PHASE_C_COHEN_D: 0.80,

  /** System Z must NOT show significant patterns (liberal threshold) */
  PHASE_C_ZOMBIE_P_THRESHOLD: 0.10,

  /** Three perturbation levels for dose-response (σ) */
  PERTURBATION_MAGNITUDES: [1, 2, 3] as readonly number[],

  /** Time to hold each perturbation (ms) */
  PERTURBATION_HOLD_DURATION_MS: 60000,
});

// ── Injectable dependency interfaces ────────────────────────

/**
 * Panel evaluator — abstraction over human panel evaluation (Phase A).
 * Injected to allow testing without real human panelists.
 */
export interface IPanelEvaluator {
  readonly panelSize: number;
  readonly reportPairs: number;
  evaluate(
    systemG: ICGRG,
    systemZ: ICGRG,
  ): Promise<{
    correctIdentifications: number;
    accuracyRate: number;
    pValue: number;
  }>;
}

/**
 * Correlation analyzer — abstraction over metric-correlation analysis (Phase B).
 * Injected to allow testing without real statistical computation.
 */
export interface ICorrelationAnalyzer {
  readonly sessions: number;
  analyzeG(): Promise<{
    pearsonR: number;
    mutualInformationBits: number;
    grangerCausalityPValue: number;
  }>;
  analyzeZ(): Promise<{
    pearsonR: number;
    mutualInformationBits: number;
    grangerCausalityPValue: number;
  }>;
}

/**
 * Perturbation engine — abstraction over controlled metric perturbation (Phase C).
 * Injected to allow testing without real substrate access.
 */
export interface IPerturbationEngine {
  applyAndMeasure(
    system: ICGRG,
    dimensions: MetricDimensionName[],
  ): Promise<{
    dimensionsPassed: number;
    magnitudeCorrelationR: number;
    cohenDAverage: number;
    responses: PerturbationResponse[];
  }>;
  readonly zombieShowsPattern: boolean;
}

// ── Protocol configuration ──────────────────────────────────

export interface DistinguishabilityProtocolConfig {
  readonly preRegistrationId: string;
  readonly protocolVersion: string;
  readonly panelEvaluator: IPanelEvaluator;
  readonly correlationAnalyzer: ICorrelationAnalyzer;
  readonly perturbationEngine: IPerturbationEngine;
}

// ── Implementation ──────────────────────────────────────────

export class DistinguishabilityProtocol implements IDistinguishabilityProtocol {
  private readonly config: DistinguishabilityProtocolConfig;

  constructor(config: DistinguishabilityProtocolConfig) {
    if (!config.preRegistrationId) {
      throw new Error(
        "preRegistrationId must be a non-empty string referencing a valid " +
          "public registry entry created before data collection.",
      );
    }
    this.config = config;
  }

  /**
   * Run the full three-phase protocol.
   * Precondition: both systems must be grounded.
   * Postcondition: overallPassed === true iff all three phases pass.
   * Invariant: result is immutable once produced.
   */
  async run(
    systemG: ICGRG,
    systemZ: ICGRG,
  ): Promise<DistinguishabilityResult> {
    this.assertGrounded(systemG, "System G");
    this.assertGrounded(systemZ, "System Z");

    const phaseA = await this.runPhaseA(systemG, systemZ);
    const phaseB = await this.runPhaseB(systemG, systemZ);
    const phaseC = await this.runPhaseC(systemG, systemZ);

    const result: DistinguishabilityResult = {
      protocolVersion: this.config.protocolVersion,
      systemGId: systemG.generatorId,
      systemZId: systemZ.generatorId,
      phaseA,
      phaseB,
      phaseC,
      overallPassed: phaseA.passed && phaseB.passed && phaseC.passed,
      executedAt: Date.now() as Timestamp,
      preRegistrationId: this.config.preRegistrationId,
    };

    return Object.freeze(result);
  }

  /**
   * Phase A: behavioral adversarial challenge.
   * Passes when panelists identify System G above chance (p < PHASE_A_SIGNIFICANCE).
   */
  async runPhaseA(
    systemG: ICGRG,
    systemZ: ICGRG,
  ): Promise<PhaseAResult> {
    this.assertGrounded(systemG, "System G");
    this.assertGrounded(systemZ, "System Z");

    const { panelEvaluator } = this.config;
    const evalResult = await panelEvaluator.evaluate(systemG, systemZ);

    const result: PhaseAResult = {
      phase: "A",
      panelSize: panelEvaluator.panelSize,
      reportPairs: panelEvaluator.reportPairs,
      correctIdentifications: evalResult.correctIdentifications,
      accuracyRate: evalResult.accuracyRate,
      pValue: evalResult.pValue,
      passed: evalResult.pValue < DP_THRESHOLDS.PHASE_A_SIGNIFICANCE,
    };

    return Object.freeze(result);
  }

  /**
   * Phase B: metric-correlation challenge.
   * Passes when System G meets all correlation thresholds:
   *   Pearson r > PHASE_B_PEARSON_R
   *   MI > PHASE_B_MUTUAL_INFORMATION bits
   *   Granger p < PHASE_B_GRANGER_P_VALUE
   */
  async runPhaseB(
    systemG: ICGRG,
    systemZ: ICGRG,
  ): Promise<PhaseBResult> {
    this.assertGrounded(systemG, "System G");
    this.assertGrounded(systemZ, "System Z");

    const { correlationAnalyzer } = this.config;
    const gResult = await correlationAnalyzer.analyzeG();

    const passed =
      gResult.pearsonR > DP_THRESHOLDS.PHASE_B_PEARSON_R &&
      gResult.mutualInformationBits > DP_THRESHOLDS.PHASE_B_MUTUAL_INFORMATION &&
      gResult.grangerCausalityPValue < DP_THRESHOLDS.PHASE_B_GRANGER_P_VALUE;

    const result: PhaseBResult = {
      phase: "B",
      sessions: correlationAnalyzer.sessions,
      pearsonR: gResult.pearsonR,
      mutualInformationBits: gResult.mutualInformationBits,
      grangerCausalityPValue: gResult.grangerCausalityPValue,
      passed,
    };

    return Object.freeze(result);
  }

  /**
   * Phase C: intervention challenge.
   * Passes when:
   *   - ≥ PHASE_C_PASS_THRESHOLD dimensions match predicted direction
   *   - Magnitude correlation ≥ PHASE_C_MAGNITUDE_CORRELATION
   *   - Cohen's d ≥ PHASE_C_COHEN_D
   *   - System Z shows no significant pattern (zombieNullNotRejected === true)
   */
  async runPhaseC(
    systemG: ICGRG,
    systemZ: ICGRG,
  ): Promise<PhaseCResult> {
    this.assertGrounded(systemG, "System G");
    this.assertGrounded(systemZ, "System Z");

    const { perturbationEngine } = this.config;
    const dimensions: MetricDimensionName[] = [
      "phi",
      "experienceContinuity",
      "selfModelCoherence",
    ];

    const gResult = await perturbationEngine.applyAndMeasure(systemG, dimensions);
    const zombieNullNotRejected = !perturbationEngine.zombieShowsPattern;

    const passed =
      gResult.dimensionsPassed >= DP_THRESHOLDS.PHASE_C_PASS_THRESHOLD &&
      gResult.magnitudeCorrelationR >= DP_THRESHOLDS.PHASE_C_MAGNITUDE_CORRELATION &&
      gResult.cohenDAverage >= DP_THRESHOLDS.PHASE_C_COHEN_D &&
      zombieNullNotRejected;

    const result: PhaseCResult = {
      phase: "C",
      responses: gResult.responses,
      dimensionsPassed: gResult.dimensionsPassed,
      magnitudeCorrelationR: gResult.magnitudeCorrelationR,
      cohenDAverage: gResult.cohenDAverage,
      zombieNullNotRejected,
      passed,
    };

    return Object.freeze(result);
  }

  // ── Private helpers ─────────────────────────────────────────

  /**
   * Guard: precondition check — system must be grounded.
   * Throws with "not grounded" message per Contracts §IDistinguishabilityProtocol.
   */
  private assertGrounded(system: ICGRG, label: string): void {
    if (!system.isGrounded()) {
      throw new Error(
        `${label} is not grounded: isGrounded() returned false. ` +
          "Both systems must have active metric streams before protocol execution.",
      );
    }
  }
}
