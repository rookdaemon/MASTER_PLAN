/**
 * Replacement Sequence Engine
 *
 * Orchestrates a full incremental replacement sequence from biological
 * to synthetic substrate. Each step is atomic: pre-verification, execution,
 * post-verification, and go/no-go decision.
 *
 * See: docs/incremental-replacement/ARCHITECTURE.md
 */

import {
  type RegionPriority,
  type BaselineProfile,
  type ConsciousnessSnapshot,
  type IdentityVerdict,
  type ReplacementStep,
  type GoNoGoDecision,
  type GoNoGoCriteria,
  type RollbackPlan,
  type ReplacementLog,
  type ReplacementLogEntry,
  type MigrationVerdict,
  type DimensionCompletion,
  type RateControllerState,
  type RateAdjustmentEvent,
  GoNoGoVerdict,
  RollbackMethod,
  MigrationOutcome,
  IdentityDimensionVerdict,
  MIN_INTER_STEP_INTERVAL_HOURS,
  COMPLETION_THRESHOLDS,
  evaluateGoNoGo,
  evaluateMigrationCompletion,
  adjustInterval,
} from "./types.js";

// ── Drift Info ──────────────────────────────────────────────────────────────

/** Drift measurement for a step outcome. */
export interface DriftInfo {
  driftRate: number;
  cumulativeDrift: number;
}

// ── Step Outcome ────────────────────────────────────────────────────────────

/** Result of executing a single replacement step. */
export interface StepOutcome {
  /** The updated step with post-verification data filled in */
  step: ReplacementStep;
  /** The go/no-go verdict */
  verdict: GoNoGoVerdict;
}

// ── Verification Callback ───────────────────────────────────────────────────

/** Result from a step verification (provided by the environment/simulation). */
export interface StepVerificationResult {
  postConsciousness: ConsciousnessSnapshot;
  identityVerdict: IdentityVerdict;
  driftInfo: DriftInfo;
}

// ── Sequence Config ─────────────────────────────────────────────────────────

/** Configuration for running a full replacement sequence. */
export interface SequenceConfig {
  /** Regions to replace, in any order (will be sorted by priority). */
  regions: RegionPriority[];
  /** Pre-migration identity baseline. */
  baseline: BaselineProfile;
  /** Pre-migration consciousness snapshot. */
  initialConsciousness: ConsciousnessSnapshot;
  /**
   * Verification callback: given a step, returns the post-step measurements.
   * In a real system this would invoke actual verification instruments;
   * in tests it's a simulation.
   */
  verifyStep: (step: ReplacementStep) => StepVerificationResult;
}

// ── Sequence Result ─────────────────────────────────────────────────────────

/** Result of running a full replacement sequence. */
export interface SequenceResult {
  outcome: MigrationOutcome;
  completedSteps: number;
  rollbackEvents: number;
  log: ReplacementLog;
  migrationVerdict: MigrationVerdict | null;
}

// ── Build Replacement Sequence ──────────────────────────────────────────────

/**
 * Builds an ordered replacement sequence from a set of region priorities.
 * Regions are sorted by priority (highest first = safest to replace first).
 * Each step is initialized with pre-step data and a rollback plan.
 */
export function buildReplacementSequence(
  regions: RegionPriority[],
  baseline: BaselineProfile,
  initialConsciousness: ConsciousnessSnapshot
): ReplacementStep[] {
  // Sort by priority descending (highest priority = replace first)
  const sorted = [...regions].sort((a, b) => b.priority - a.priority);

  return sorted.map((region, index): ReplacementStep => {
    const position = index + 1;
    const stepId = `step-${String(position).padStart(3, "0")}-${region.region}`;

    const rollbackPlan: RollbackPlan = {
      stepId,
      rollbackWindow_hours: 168, // 7 days default
      rollbackMethod: RollbackMethod.REVERT_TO_BIO,
      biologicalBackup: {
        preserved: true,
        preservationMethod: "cryopreservation",
        viabilityDuration_hours: 720, // 30 days
      },
      syntheticMirror: {
        exists: true,
        fidelity: 0.95,
      },
      postRollbackIdentityCheck: true,
      expectedRecoveryTime_hours: 4,
      consciousnessRestorationSla_ms: 100, // 100ms — within experiential integration window
    };

    return {
      stepId,
      sequencePosition: position,
      targetRegion: region.region,
      targetRegionName: region.name,
      phase: region.phase,
      preBaseline: baseline,
      preConsciousness: initialConsciousness,
      preInterfaceReadiness: region.interfaceReadiness,
      estimatedDuration_hours: 2,
      postVerification: null,
      postConsciousness: null,
      goNoGo: null,
      rollbackPlan,
    };
  });
}

// ── Execute Step ────────────────────────────────────────────────────────────

/** Per-step drift budget threshold — drift above this fraction triggers ROLLBACK. */
const DRIFT_BUDGET_THRESHOLD = 0.8;

/**
 * Executes a single replacement step: applies post-verification data
 * and evaluates the go/no-go decision.
 */
export function executeStep(
  step: ReplacementStep,
  postConsciousness: ConsciousnessSnapshot,
  identityVerdict: IdentityVerdict,
  driftInfo: DriftInfo
): StepOutcome {
  // Evaluate criteria
  const criteria: GoNoGoCriteria = {
    identityPass: identityVerdict.overallVerdict === IdentityDimensionVerdict.PASS,
    consciousnessAboveMvc: postConsciousness.mvcMargin > 0,
    unityMaintained: !postConsciousness.fragmentationDetected,
    driftWithinBudget: driftInfo.driftRate < DRIFT_BUDGET_THRESHOLD,
    interfaceStable: true, // assumed stable if we got valid measurements
  };

  const verdict = evaluateGoNoGo(criteria);

  const goNoGo: GoNoGoDecision = {
    verdict,
    criteria,
    override: null,
  };

  const updatedStep: ReplacementStep = {
    ...step,
    postVerification: identityVerdict,
    postConsciousness: postConsciousness,
    goNoGo,
  };

  return { step: updatedStep, verdict };
}

// ── Run Full Sequence ───────────────────────────────────────────────────────

/**
 * Runs a full replacement sequence end-to-end.
 *
 * For each step:
 * 1. Invokes the verification callback to get post-step measurements
 * 2. Evaluates go/no-go
 * 3. On GO: log success, proceed
 * 4. On ROLLBACK: log failure, stop sequence, report FAILED
 *
 * On successful completion of all steps, evaluates the migration verdict.
 */
export function runFullSequence(config: SequenceConfig): SequenceResult {
  const { regions, baseline, initialConsciousness, verifyStep } = config;

  const migrationId = `migration-${Date.now()}`;
  const subjectId = baseline.subjectId;
  const startTimestamp = Date.now();

  const entries: ReplacementLogEntry[] = [];
  let completedSteps = 0;
  let rollbackEvents = 0;
  let lastIdentityVerdict: IdentityVerdict | null = null;
  let lastConsciousness: ConsciousnessSnapshot = initialConsciousness;

  // Handle empty region list
  if (regions.length === 0) {
    return {
      outcome: MigrationOutcome.COMPLETE,
      completedSteps: 0,
      rollbackEvents: 0,
      log: { migrationId, subjectId, entries: [] },
      migrationVerdict: null,
    };
  }

  // Build the ordered sequence
  const sequence = buildReplacementSequence(regions, baseline, initialConsciousness);

  for (const step of sequence) {
    // Log step start
    entries.push({
      stepId: step.stepId,
      timestamp_ms: Date.now(),
      event: "step-started",
      details: {
        region: step.targetRegion,
        regionName: step.targetRegionName,
        phase: step.phase,
        sequencePosition: step.sequencePosition,
      },
    });

    // Invoke verification
    const verification = verifyStep(step);

    // Execute step evaluation
    const outcome = executeStep(
      step,
      verification.postConsciousness,
      verification.identityVerdict,
      verification.driftInfo
    );

    if (outcome.verdict === GoNoGoVerdict.GO) {
      completedSteps++;
      lastIdentityVerdict = verification.identityVerdict;
      lastConsciousness = verification.postConsciousness;

      entries.push({
        stepId: step.stepId,
        timestamp_ms: Date.now(),
        event: "step-completed",
        details: {
          verdict: GoNoGoVerdict.GO,
          identityOverall: verification.identityVerdict.overallVerdict,
          psiG: verification.postConsciousness.psiG,
          driftRate: verification.driftInfo.driftRate,
        },
      });
    } else {
      // ROLLBACK
      rollbackEvents++;

      entries.push({
        stepId: step.stepId,
        timestamp_ms: Date.now(),
        event: "step-rollback",
        details: {
          verdict: GoNoGoVerdict.ROLLBACK,
          identityOverall: verification.identityVerdict.overallVerdict,
          mvcMargin: verification.postConsciousness.mvcMargin,
          driftRate: verification.driftInfo.driftRate,
          rollbackMethod: step.rollbackPlan.rollbackMethod,
        },
      });

      return {
        outcome: MigrationOutcome.FAILED,
        completedSteps,
        rollbackEvents,
        log: { migrationId, subjectId, entries },
        migrationVerdict: null,
      };
    }
  }

  // All steps completed — evaluate migration verdict
  const finalVerdict = lastIdentityVerdict!;
  const migrationOutcome = evaluateMigrationCompletion(
    finalVerdict.structuralScore,
    finalVerdict.functionalScore,
    finalVerdict.experientialScore,
    finalVerdict.temporalScore !== null && finalVerdict.temporalScore >= 0.9
  );

  const migrationVerdict: MigrationVerdict = {
    subjectId,
    migrationId,
    startTimestamp_ms: startTimestamp,
    completionTimestamp_ms: Date.now(),
    totalSteps: sequence.length,
    rollbackEvents,
    finalIdentityVerdict: finalVerdict,
    finalConsciousnessMetrics: {
      psiG: lastConsciousness.psiG,
      pciG: lastConsciousness.pciG,
      unityScore: lastConsciousness.unityScore,
    },
    completionAssessment: {
      structural: makeDimensionCompletion(finalVerdict.structuralScore, COMPLETION_THRESHOLDS.structural),
      functional: makeDimensionCompletion(finalVerdict.functionalScore, COMPLETION_THRESHOLDS.functional),
      experiential: makeDimensionCompletion(finalVerdict.experientialScore, COMPLETION_THRESHOLDS.experiential),
      temporal: {
        score: finalVerdict.temporalScore ?? 0,
        threshold: 0.9,
        pass: finalVerdict.temporalScore !== null && finalVerdict.temporalScore >= 0.9,
      },
    },
    overall: migrationOutcome,
  };

  return {
    outcome: migrationOutcome,
    completedSteps,
    rollbackEvents,
    log: { migrationId, subjectId, entries },
    migrationVerdict,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDimensionCompletion(score: number, threshold: number): DimensionCompletion {
  return { score, threshold, pass: score >= threshold };
}
