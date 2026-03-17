import { describe, it, expect } from "vitest";
import {
  buildReplacementSequence,
  executeStep,
  runFullSequence,
  type SequenceConfig,
  type StepOutcome,
} from "../sequence.js";
import {
  ReplacementPhase,
  GoNoGoVerdict,
  MigrationOutcome,
  type RegionPriority,
  type ConsciousnessSnapshot,
  type BaselineProfile,
  type IdentityVerdict,
  IdentityDimensionVerdict,
  MIN_INTER_STEP_INTERVAL_HOURS,
} from "../types.js";

// ── Test Fixtures ───────────────────────────────────────────────────────────

function makeBaseline(subjectId = "subject-001"): BaselineProfile {
  return {
    subjectId,
    captureTimestamp_ms: Date.now(),
    testRetestReliability: 0.95,
    measurementOccasions: 3,
  };
}

function makeConsciousnessSnapshot(
  overrides: Partial<ConsciousnessSnapshot> = {}
): ConsciousnessSnapshot {
  return {
    timestamp_ms: Date.now(),
    psiG: 3.5,
    pciG: 0.65,
    unityScore: 0.95,
    mvcMargin: 1.2,
    fragmentationDetected: false,
    ...overrides,
  };
}

function makePassingIdentityVerdict(subjectId = "subject-001"): IdentityVerdict {
  return {
    subjectId,
    timestamp_ms: Date.now(),
    structuralScore: 0.97,
    functionalScore: 0.96,
    experientialScore: 0.93,
    temporalScore: 0.95,
    structuralVerdict: IdentityDimensionVerdict.PASS,
    functionalVerdict: IdentityDimensionVerdict.PASS,
    experientialVerdict: IdentityDimensionVerdict.PASS,
    temporalVerdict: IdentityDimensionVerdict.PASS,
    overallVerdict: IdentityDimensionVerdict.PASS,
    confidence: 0.98,
  };
}

function makeFailingIdentityVerdict(subjectId = "subject-001"): IdentityVerdict {
  return {
    subjectId,
    timestamp_ms: Date.now(),
    structuralScore: 0.70,
    functionalScore: 0.65,
    experientialScore: 0.50,
    temporalScore: 0.60,
    structuralVerdict: IdentityDimensionVerdict.FAIL,
    functionalVerdict: IdentityDimensionVerdict.FAIL,
    experientialVerdict: IdentityDimensionVerdict.FAIL,
    temporalVerdict: IdentityDimensionVerdict.FAIL,
    overallVerdict: IdentityDimensionVerdict.FAIL,
    confidence: 0.95,
  };
}

function makeRegions(): RegionPriority[] {
  return [
    {
      region: "V1",
      name: "Primary Visual Cortex",
      phase: ReplacementPhase.PHASE_1_PERIPHERAL,
      criticalityScore: 0.1,
      interfaceReadiness: 0.95,
      connectivityDensity: 0.2,
      priority: 0.684,
    },
    {
      region: "A1",
      name: "Primary Auditory Cortex",
      phase: ReplacementPhase.PHASE_1_PERIPHERAL,
      criticalityScore: 0.15,
      interfaceReadiness: 0.90,
      connectivityDensity: 0.25,
      priority: 0.57375,
    },
    {
      region: "HPC",
      name: "Hippocampus",
      phase: ReplacementPhase.PHASE_3_HIGH_CRITICALITY,
      criticalityScore: 0.8,
      interfaceReadiness: 0.85,
      connectivityDensity: 0.7,
      priority: 0.051,
    },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Replacement Sequence Engine", () => {
  describe("buildReplacementSequence", () => {
    it("sorts regions by priority (highest first) and assigns sequence positions", () => {
      const regions = makeRegions();
      const baseline = makeBaseline();
      const snapshot = makeConsciousnessSnapshot();

      const sequence = buildReplacementSequence(regions, baseline, snapshot);

      expect(sequence).toHaveLength(3);
      // V1 has highest priority (0.684), then A1 (0.57375), then HPC (0.051)
      expect(sequence[0].targetRegion).toBe("V1");
      expect(sequence[0].sequencePosition).toBe(1);
      expect(sequence[1].targetRegion).toBe("A1");
      expect(sequence[1].sequencePosition).toBe(2);
      expect(sequence[2].targetRegion).toBe("HPC");
      expect(sequence[2].sequencePosition).toBe(3);
    });

    it("assigns step IDs with sequence position", () => {
      const regions = makeRegions();
      const sequence = buildReplacementSequence(
        regions,
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      expect(sequence[0].stepId).toContain("001");
      expect(sequence[1].stepId).toContain("002");
      expect(sequence[2].stepId).toContain("003");
    });

    it("populates pre-step baseline and consciousness on each step", () => {
      const baseline = makeBaseline();
      const snapshot = makeConsciousnessSnapshot();
      const regions = makeRegions();

      const sequence = buildReplacementSequence(regions, baseline, snapshot);

      for (const step of sequence) {
        expect(step.preBaseline.subjectId).toBe(baseline.subjectId);
        expect(step.preConsciousness.psiG).toBe(snapshot.psiG);
        expect(step.preInterfaceReadiness).toBeGreaterThan(0);
      }
    });

    it("creates a rollback plan for each step", () => {
      const sequence = buildReplacementSequence(
        makeRegions(),
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      for (const step of sequence) {
        expect(step.rollbackPlan).toBeDefined();
        expect(step.rollbackPlan.stepId).toBe(step.stepId);
        expect(step.rollbackPlan.postRollbackIdentityCheck).toBe(true);
      }
    });

    it("post-verification and goNoGo are initially null", () => {
      const sequence = buildReplacementSequence(
        makeRegions(),
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      for (const step of sequence) {
        expect(step.postVerification).toBeNull();
        expect(step.postConsciousness).toBeNull();
        expect(step.goNoGo).toBeNull();
      }
    });
  });

  describe("executeStep", () => {
    it("returns GO outcome when verification passes", () => {
      const regions = makeRegions();
      const sequence = buildReplacementSequence(
        regions,
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      const outcome = executeStep(
        sequence[0],
        makeConsciousnessSnapshot(),
        makePassingIdentityVerdict(),
        { driftRate: 0.1, cumulativeDrift: 0.05 }
      );

      expect(outcome.verdict).toBe(GoNoGoVerdict.GO);
      expect(outcome.step.postVerification).not.toBeNull();
      expect(outcome.step.postConsciousness).not.toBeNull();
      expect(outcome.step.goNoGo).not.toBeNull();
      expect(outcome.step.goNoGo!.verdict).toBe(GoNoGoVerdict.GO);
    });

    it("returns ROLLBACK outcome when identity verification fails", () => {
      const sequence = buildReplacementSequence(
        makeRegions(),
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      const outcome = executeStep(
        sequence[0],
        makeConsciousnessSnapshot(),
        makeFailingIdentityVerdict(),
        { driftRate: 0.1, cumulativeDrift: 0.05 }
      );

      expect(outcome.verdict).toBe(GoNoGoVerdict.ROLLBACK);
    });

    it("returns ROLLBACK when consciousness drops below MVC", () => {
      const sequence = buildReplacementSequence(
        makeRegions(),
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      const lowConsciousness = makeConsciousnessSnapshot({ mvcMargin: -0.5 });

      const outcome = executeStep(
        sequence[0],
        lowConsciousness,
        makePassingIdentityVerdict(),
        { driftRate: 0.1, cumulativeDrift: 0.05 }
      );

      expect(outcome.verdict).toBe(GoNoGoVerdict.ROLLBACK);
    });

    it("returns ROLLBACK when fragmentation detected", () => {
      const sequence = buildReplacementSequence(
        makeRegions(),
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      const fragmented = makeConsciousnessSnapshot({ fragmentationDetected: true });

      const outcome = executeStep(
        sequence[0],
        fragmented,
        makePassingIdentityVerdict(),
        { driftRate: 0.1, cumulativeDrift: 0.05 }
      );

      expect(outcome.verdict).toBe(GoNoGoVerdict.ROLLBACK);
    });

    it("returns ROLLBACK when drift exceeds budget", () => {
      const sequence = buildReplacementSequence(
        makeRegions(),
        makeBaseline(),
        makeConsciousnessSnapshot()
      );

      const outcome = executeStep(
        sequence[0],
        makeConsciousnessSnapshot(),
        makePassingIdentityVerdict(),
        { driftRate: 0.95, cumulativeDrift: 0.9 }
      );

      expect(outcome.verdict).toBe(GoNoGoVerdict.ROLLBACK);
    });
  });

  describe("runFullSequence", () => {
    it("completes a full replacement sequence with all passing verifications", () => {
      const config: SequenceConfig = {
        regions: makeRegions(),
        baseline: makeBaseline(),
        initialConsciousness: makeConsciousnessSnapshot(),
        /** Simulate verification: always passes */
        verifyStep: () => ({
          postConsciousness: makeConsciousnessSnapshot(),
          identityVerdict: makePassingIdentityVerdict(),
          driftInfo: { driftRate: 0.05, cumulativeDrift: 0.02 },
        }),
      };

      const result = runFullSequence(config);

      expect(result.outcome).toBe(MigrationOutcome.COMPLETE);
      expect(result.completedSteps).toBe(3);
      expect(result.rollbackEvents).toBe(0);
      expect(result.log.entries.length).toBeGreaterThan(0);
    });

    it("stops and reports FAILED when a step requires rollback", () => {
      let callCount = 0;
      const config: SequenceConfig = {
        regions: makeRegions(),
        baseline: makeBaseline(),
        initialConsciousness: makeConsciousnessSnapshot(),
        verifyStep: () => {
          callCount++;
          if (callCount === 2) {
            // Second step fails
            return {
              postConsciousness: makeConsciousnessSnapshot({ mvcMargin: -0.5 }),
              identityVerdict: makeFailingIdentityVerdict(),
              driftInfo: { driftRate: 0.95, cumulativeDrift: 0.9 },
            };
          }
          return {
            postConsciousness: makeConsciousnessSnapshot(),
            identityVerdict: makePassingIdentityVerdict(),
            driftInfo: { driftRate: 0.05, cumulativeDrift: 0.02 },
          };
        },
      };

      const result = runFullSequence(config);

      expect(result.outcome).toBe(MigrationOutcome.FAILED);
      expect(result.completedSteps).toBe(1);
      expect(result.rollbackEvents).toBe(1);
    });

    it("produces a replacement log with entries for each step", () => {
      const config: SequenceConfig = {
        regions: makeRegions(),
        baseline: makeBaseline(),
        initialConsciousness: makeConsciousnessSnapshot(),
        verifyStep: () => ({
          postConsciousness: makeConsciousnessSnapshot(),
          identityVerdict: makePassingIdentityVerdict(),
          driftInfo: { driftRate: 0.05, cumulativeDrift: 0.02 },
        }),
      };

      const result = runFullSequence(config);

      // Each step should produce at least a "step-started" and "step-completed" entry
      expect(result.log.entries.length).toBeGreaterThanOrEqual(6);
    });

    it("reports migration verdict with final identity scores", () => {
      const config: SequenceConfig = {
        regions: makeRegions(),
        baseline: makeBaseline(),
        initialConsciousness: makeConsciousnessSnapshot(),
        verifyStep: () => ({
          postConsciousness: makeConsciousnessSnapshot(),
          identityVerdict: makePassingIdentityVerdict(),
          driftInfo: { driftRate: 0.05, cumulativeDrift: 0.02 },
        }),
      };

      const result = runFullSequence(config);

      expect(result.migrationVerdict).toBeDefined();
      expect(result.migrationVerdict!.overall).toBe(MigrationOutcome.COMPLETE);
      expect(result.migrationVerdict!.completionAssessment.structural.pass).toBe(true);
      expect(result.migrationVerdict!.completionAssessment.functional.pass).toBe(true);
      expect(result.migrationVerdict!.completionAssessment.experiential.pass).toBe(true);
      expect(result.migrationVerdict!.completionAssessment.temporal.pass).toBe(true);
    });

    it("handles empty region list gracefully", () => {
      const config: SequenceConfig = {
        regions: [],
        baseline: makeBaseline(),
        initialConsciousness: makeConsciousnessSnapshot(),
        verifyStep: () => ({
          postConsciousness: makeConsciousnessSnapshot(),
          identityVerdict: makePassingIdentityVerdict(),
          driftInfo: { driftRate: 0, cumulativeDrift: 0 },
        }),
      };

      const result = runFullSequence(config);

      expect(result.outcome).toBe(MigrationOutcome.COMPLETE);
      expect(result.completedSteps).toBe(0);
    });
  });
});
