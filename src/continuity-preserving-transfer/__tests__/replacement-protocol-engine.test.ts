import { describe, it, expect, vi } from "vitest";
import {
  ReplacementProtocolEngineImpl,
  type NeuronTopologyProvider,
  type PsiMeasurer,
} from "../replacement-protocol-engine.js";
import { RealTimeContinuityMonitorImpl } from "../real-time-continuity-monitor.js";
import { SubjectContinuityConfirmationImpl } from "../subject-continuity-confirmation.js";
import {
  AlertLevel,
  BrainRegionPriority,
  DEFAULT_BATCH_SIZE,
  DEFAULT_GRACE_PERIOD_MS,
  MAX_LOOP_REPLACEMENT_FRACTION,
  MIN_PACING_INTERVAL_MS,
  NeuronSubstrateState,
  PSI_GREEN_MULTIPLIER,
  SubjectReportType,
  computeAlertLevel,
  type PsiMetric,
  type ReplacementUnit,
  type SubjectProfile,
  type SubjectReport,
} from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePsi(
  value: number,
  threshold: number,
  timestamp_ms?: number,
): PsiMetric {
  const ts = timestamp_ms ?? 1000;
  return {
    value,
    threshold,
    phi: { value: 3.0, baseline: 2.0, timestamp_ms: ts },
    causalContinuity: { intact: true, chainLength: 100, lastVerified_ms: ts },
    experientialBinding: {
      coherence: 0.95,
      fragmentCount: 1,
      timestamp_ms: ts,
    },
    timestamp_ms: ts,
  };
}

function makeSubject(
  overrides: Partial<SubjectProfile> = {},
): SubjectProfile {
  return {
    id: "subject-001",
    totalNeurons: 100,
    psiThreshold: 2.0,
    phiBaseline: 1.5,
    baselinePsi: [makePsi(3.5, 2.0)],
    ...overrides,
  };
}

function makeUnit(
  neuronId: string,
  overrides: Partial<ReplacementUnit> = {},
): ReplacementUnit {
  return {
    neuronId,
    clusterId: "cluster-0",
    loopIds: [],
    regionPriority: BrainRegionPriority.Periphery,
    state: NeuronSubstrateState.Biological,
    stepIndex: 0,
    replacedAt_ms: null,
    graceDeadline_ms: null,
    rollbackAvailable: false,
    ...overrides,
  };
}

/**
 * Minimum loop size to satisfy MAX_LOOP_REPLACEMENT_FRACTION with DEFAULT_BATCH_SIZE.
 * Each loop must have at least batchSize / fraction = 10 / 0.10 = 100 neurons.
 */
const MIN_LOOP_SIZE = DEFAULT_BATCH_SIZE / MAX_LOOP_REPLACEMENT_FRACTION;

/**
 * Creates N biological replacement units with sensible defaults,
 * distributed across regions in periphery-first order.
 * Loops are sized to satisfy the 10% max fraction constraint.
 */
function makeUnits(count: number): ReplacementUnit[] {
  const units: ReplacementUnit[] = [];
  for (let i = 0; i < count; i++) {
    // Distribute across regions: first 40% periphery, next 30% association,
    // next 20% higher association, last 10% core integration
    let region: BrainRegionPriority;
    const frac = i / count;
    if (frac < 0.4) region = BrainRegionPriority.Periphery;
    else if (frac < 0.7) region = BrainRegionPriority.Association;
    else if (frac < 0.9) region = BrainRegionPriority.HigherAssociation;
    else region = BrainRegionPriority.CoreIntegration;

    units.push(
      makeUnit(`neuron-${i}`, {
        regionPriority: region,
        clusterId: `cluster-${Math.floor(i / 5)}`,
        // Assign to loops large enough to respect MAX_LOOP_REPLACEMENT_FRACTION.
        // Each loop has MIN_LOOP_SIZE neurons; smaller sets share one loop.
        loopIds: [`loop-${Math.floor(i / MIN_LOOP_SIZE)}`],
      }),
    );
  }
  return units;
}

function makeTopologyProvider(units: ReplacementUnit[]): NeuronTopologyProvider {
  return (_subject: SubjectProfile) => units;
}

function makeGreenPsiMeasurer(threshold: number = 2.0): PsiMeasurer {
  return (_subject: SubjectProfile) => makePsi(3.5, threshold);
}

function setupEngine(options: {
  unitCount?: number;
  units?: ReplacementUnit[];
  psiMeasurer?: PsiMeasurer;
  clock?: () => number;
}) {
  // Default 100 units — minimum to satisfy loop fraction constraint with DEFAULT_BATCH_SIZE
  const units = options.units ?? makeUnits(options.unitCount ?? 100);
  const rtcm = new RealTimeContinuityMonitorImpl();
  const psiMeasurer = options.psiMeasurer ?? makeGreenPsiMeasurer();
  const clock = options.clock ?? (() => 1000);
  const engine = new ReplacementProtocolEngineImpl(
    makeTopologyProvider(units),
    psiMeasurer,
    rtcm,
    clock,
  );
  return { engine, rtcm, units, psiMeasurer };
}

// ── Unit Tests ──────────────────────────────────────────────────────────────

describe("ReplacementProtocolEngineImpl", () => {
  describe("planTransfer", () => {
    it("creates a valid transfer plan from subject profile", () => {
      const { engine } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      const plan = engine.planTransfer(subject);

      expect(plan.subject).toBe(subject);
      expect(plan.totalUnits).toBe(100);
      expect(plan.replacementOrder).toHaveLength(100);
      expect(plan.batchSize).toBe(DEFAULT_BATCH_SIZE);
      expect(plan.pacingInterval_ms).toBe(MIN_PACING_INTERVAL_MS);
      expect(plan.continuityThreshold).toBe(subject.psiThreshold);
      expect(plan.gracePeriod_ms).toBe(DEFAULT_GRACE_PERIOD_MS);
    });

    it("orders units periphery-first", () => {
      // Need >= MIN_LOOP_SIZE units in the loop to satisfy 10% fraction constraint
      const units = [
        makeUnit("n-core", { regionPriority: BrainRegionPriority.CoreIntegration, clusterId: "c0", loopIds: ["loop-big"] }),
        makeUnit("n-periph", { regionPriority: BrainRegionPriority.Periphery, clusterId: "c0", loopIds: ["loop-big"] }),
        makeUnit("n-assoc", { regionPriority: BrainRegionPriority.Association, clusterId: "c0", loopIds: ["loop-big"] }),
      ];
      // Add filler units to reach MIN_LOOP_SIZE (100) for the loop
      for (let i = 0; i < MIN_LOOP_SIZE - 3; i++) {
        units.push(makeUnit(`n-filler-${i}`, { loopIds: ["loop-big"], clusterId: `c-filler-${i}` }));
      }

      const { engine } = setupEngine({ units });
      const plan = engine.planTransfer(makeSubject());

      // Periphery units come before association, which come before core
      const periphIdx = plan.replacementOrder.findIndex((u) => u.neuronId === "n-periph");
      const assocIdx = plan.replacementOrder.findIndex((u) => u.neuronId === "n-assoc");
      const coreIdx = plan.replacementOrder.findIndex((u) => u.neuronId === "n-core");
      expect(periphIdx).toBeLessThan(assocIdx);
      expect(assocIdx).toBeLessThan(coreIdx);
    });

    it("groups units by cluster for coherence", () => {
      const units = [
        makeUnit("n-b2", { clusterId: "cluster-B", regionPriority: BrainRegionPriority.Periphery, loopIds: ["loop-big"] }),
        makeUnit("n-a1", { clusterId: "cluster-A", regionPriority: BrainRegionPriority.Periphery, loopIds: ["loop-big"] }),
        makeUnit("n-b1", { clusterId: "cluster-B", regionPriority: BrainRegionPriority.Periphery, loopIds: ["loop-big"] }),
        makeUnit("n-a2", { clusterId: "cluster-A", regionPriority: BrainRegionPriority.Periphery, loopIds: ["loop-big"] }),
      ];
      // Add filler to reach MIN_LOOP_SIZE (100) for the loop
      for (let i = 0; i < MIN_LOOP_SIZE - 4; i++) {
        units.push(makeUnit(`n-filler-${i}`, { loopIds: ["loop-big"], clusterId: `c-filler-${i}` }));
      }

      const { engine } = setupEngine({ units });
      const plan = engine.planTransfer(makeSubject());

      // Cluster-A units should be adjacent, cluster-B units should be adjacent
      const aIndices = plan.replacementOrder
        .map((u, i) => (u.clusterId === "cluster-A" ? i : -1))
        .filter((i) => i >= 0);
      const bIndices = plan.replacementOrder
        .map((u, i) => (u.clusterId === "cluster-B" ? i : -1))
        .filter((i) => i >= 0);

      // Check adjacency: diff between consecutive indices should be 1
      for (let i = 1; i < aIndices.length; i++) {
        expect(aIndices[i] - aIndices[i - 1]).toBe(1);
      }
      for (let i = 1; i < bIndices.length; i++) {
        expect(bIndices[i] - bIndices[i - 1]).toBe(1);
      }
    });

    it("rejects subject without baseline Ψ measurements", () => {
      const { engine } = setupEngine({});
      const subject = makeSubject({ baselinePsi: [] });
      expect(() => engine.planTransfer(subject)).toThrow(
        "Subject must have baseline Ψ measurements",
      );
    });

    it("throws if loop fraction limit would be violated", () => {
      // Create 10 units all in the same small loop — with DEFAULT_BATCH_SIZE=10,
      // a batch of 10 from a loop of 10 = 100% > 10% limit
      const units: ReplacementUnit[] = [];
      for (let i = 0; i < DEFAULT_BATCH_SIZE; i++) {
        units.push(
          makeUnit(`neuron-${i}`, {
            loopIds: ["tiny-loop"],
            clusterId: "cluster-0",
          }),
        );
      }

      const { engine } = setupEngine({ units });
      expect(() => engine.planTransfer(makeSubject())).toThrow(
        /Loop tiny-loop would have .* neurons replaced/,
      );
    });

    it("assigns step indices based on batch size", () => {
      const { engine } = setupEngine({ unitCount: 100 });
      const plan = engine.planTransfer(makeSubject());

      // With batchSize=10 and 100 units: steps 0,0,...,0, 1,1,...,1, etc.
      expect(plan.replacementOrder[0].stepIndex).toBe(0);
      expect(plan.replacementOrder[9].stepIndex).toBe(0);
      expect(plan.replacementOrder[10].stepIndex).toBe(1);
      expect(plan.replacementOrder[19].stepIndex).toBe(1);
      expect(plan.replacementOrder[20].stepIndex).toBe(2);
    });
  });

  describe("executeStep", () => {
    it("transitions units from Biological → Synthetic", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      const result = await engine.executeStep(plan, 0);

      expect(result.success).toBe(true);
      expect(result.stepIndex).toBe(0);
      expect(result.unitsReplaced).toHaveLength(DEFAULT_BATCH_SIZE);
      for (const unit of result.unitsReplaced) {
        expect(unit.state).toBe(NeuronSubstrateState.Synthetic);
      }
    });

    it("sets replacedAt and graceDeadline on replaced units", async () => {
      const clock = vi.fn(() => 5000);
      const { engine, rtcm } = setupEngine({ unitCount: 100, clock });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      const result = await engine.executeStep(plan, 0);

      for (const unit of result.unitsReplaced) {
        expect(unit.replacedAt_ms).toBe(5000);
        expect(unit.graceDeadline_ms).toBe(5000 + DEFAULT_GRACE_PERIOD_MS);
        expect(unit.rollbackAvailable).toBe(true);
      }
    });

    it("records Ψ measurement in RTCM after step", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      await engine.executeStep(plan, 0);

      expect(rtcm.getHistory()).toHaveLength(1);
      expect(rtcm.getCurrentPsi().value).toBe(3.5);
    });

    it("returns correct alert level in StepResult", async () => {
      const { engine, rtcm } = setupEngine({
        unitCount: 100,
        psiMeasurer: () => makePsi(2.5, 2.0), // YELLOW
      });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      const result = await engine.executeStep(plan, 0);

      expect(result.alertLevel).toBe(AlertLevel.YELLOW);
      expect(result.success).toBe(true); // YELLOW is still a success
    });

    it("returns success=false when Ψ drops to RED", async () => {
      const { engine, rtcm } = setupEngine({
        unitCount: 100,
        psiMeasurer: () => makePsi(1.5, 2.0), // RED
      });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      const result = await engine.executeStep(plan, 0);

      expect(result.alertLevel).toBe(AlertLevel.RED);
      expect(result.success).toBe(false);
    });

    it("throws if stepIndex is invalid", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      await expect(engine.executeStep(plan, -1)).rejects.toThrow(
        "Invalid step index",
      );
      await expect(engine.executeStep(plan, 99)).rejects.toThrow(
        "Invalid step index",
      );
    });

    it("throws if previous step not completed", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      // Try step 1 without completing step 0
      await expect(engine.executeStep(plan, 1)).rejects.toThrow(
        "Previous step 0 must be completed",
      );
    });

    it("throws if alert level is RED from prior step", async () => {
      let psiValue = 1.5; // RED
      const { engine, rtcm } = setupEngine({
        unitCount: 100,
        psiMeasurer: () => makePsi(psiValue, 2.0),
      });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      // Step 0 succeeds (first step doesn't check prior alert)
      await engine.executeStep(plan, 0);

      // Step 1 should fail because RTCM is RED
      await expect(engine.executeStep(plan, 1)).rejects.toThrow(
        "alert level is RED",
      );
    });

    it("computes duration_ms from clock", async () => {
      let time = 1000;
      const clock = () => time++;
      const { engine, rtcm } = setupEngine({ unitCount: 100, clock });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      const result = await engine.executeStep(plan, 0);

      // Clock is called: startTime, N times for units, endTime
      expect(result.duration_ms).toBeGreaterThan(0);
    });
  });

  describe("pause", () => {
    it("sets paused state without error", () => {
      const { engine } = setupEngine({});
      expect(() => engine.pause()).not.toThrow();
    });
  });

  describe("rollback", () => {
    it("rolls back to specified step", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      // Execute 3 steps (100 units / 10 batch = 10 total steps, execute first 3)
      await engine.executeStep(plan, 0);
      await engine.executeStep(plan, 1);
      await engine.executeStep(plan, 2);

      // Roll back to step 0 (undo steps 1 and 2 = 20 units)
      const result = await engine.rollback(0);

      expect(result.success).toBe(true);
      expect(result.stepsReversed).toBe(20); // 2 steps × 10 units/step

      // Units in steps 1 and 2 should be Biological again
      const step1Units = plan.replacementOrder.filter(
        (u) => u.stepIndex === 1,
      );
      const step2Units = plan.replacementOrder.filter(
        (u) => u.stepIndex === 2,
      );
      for (const u of [...step1Units, ...step2Units]) {
        expect(u.state).toBe(NeuronSubstrateState.Biological);
      }

      // Units in step 0 should remain Synthetic
      const step0Units = plan.replacementOrder.filter(
        (u) => u.stepIndex === 0,
      );
      for (const u of step0Units) {
        expect(u.state).toBe(NeuronSubstrateState.Synthetic);
      }
    });

    it("throws if no plan exists", async () => {
      const { engine } = setupEngine({});
      await expect(engine.rollback(0)).rejects.toThrow(
        "No transfer plan exists",
      );
    });

    it("throws if target step is ahead of current", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);
      await engine.executeStep(plan, 0);

      await expect(engine.rollback(5)).rejects.toThrow(
        "Cannot roll back to step 5",
      );
    });
  });

  describe("abort", () => {
    it("rolls back all reversible steps", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      await engine.executeStep(plan, 0);
      await engine.executeStep(plan, 1);

      const result = await engine.abort();

      expect(result.success).toBe(true);
      // All units should be Biological
      for (const u of plan.replacementOrder) {
        expect(u.state).toBe(NeuronSubstrateState.Biological);
      }
    });

    it("throws if no plan exists", async () => {
      const { engine } = setupEngine({});
      await expect(engine.abort()).rejects.toThrow("No transfer plan exists");
    });

    it("reports irreversible units past grace period", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      await engine.executeStep(plan, 0);

      // Simulate one unit past grace period
      plan.replacementOrder[0].state = NeuronSubstrateState.SyntheticFinal;
      plan.replacementOrder[0].rollbackAvailable = false;

      await engine.executeStep(plan, 1);

      const result = await engine.abort();

      expect(result.irreversibleUnits).toContain(
        plan.replacementOrder[0].neuronId,
      );
    });
  });

  // ── Behavioral Spec Scenarios ───────────────────────────────────────────

  describe("Behavioral Spec Scenarios", () => {
    describe("Scenario 1: Successful gradual transfer", () => {
      it("completes full transfer with continuous GREEN monitoring and concordant subject reports", async () => {
        // Given: subject with Ψ = 3.5, threshold = 2.0
        const threshold = 2.0;
        const subject = makeSubject({
          psiThreshold: threshold,
          baselinePsi: [makePsi(3.5, threshold)],
        });

        // 100 units, batchSize=10 → 10 steps
        const units = makeUnits(100);
        const rtcm = new RealTimeContinuityMonitorImpl();
        const scc = new SubjectContinuityConfirmationImpl();
        const psiMeasurer: PsiMeasurer = () => makePsi(3.5, threshold);
        const engine = new ReplacementProtocolEngineImpl(
          makeTopologyProvider(units),
          psiMeasurer,
          rtcm,
          () => 1000,
        );

        // RTCM is monitoring
        rtcm.startMonitoring(subject);

        // SCC records baseline
        scc.recordBaseline({
          type: SubjectReportType.Baseline,
          timestamp_ms: 500,
          continuityIntact: true,
          description: "Baseline experience normal",
          atStepIndex: null,
        });

        const plan = engine.planTransfer(subject);
        const totalSteps = Math.ceil(plan.totalUnits / plan.batchSize);

        // When: RPE executes each step sequentially
        for (let step = 0; step < totalSteps; step++) {
          const result = await engine.executeStep(plan, step);

          // Then after each step:
          // - Replaced units are Synthetic
          for (const unit of result.unitsReplaced) {
            expect(unit.state).toBe(NeuronSubstrateState.Synthetic);
          }
          // - Grace deadline is set
          for (const unit of result.unitsReplaced) {
            expect(unit.graceDeadline_ms).not.toBeNull();
          }
          // - RTCM records measurement, alert is GREEN
          expect(result.alertLevel).toBe(AlertLevel.GREEN);

          // - SCC records subject report confirming continuity
          scc.recordDuringTransfer({
            type: SubjectReportType.DuringTransfer,
            timestamp_ms: 1000 + step * 100,
            continuityIntact: true,
            description: `Step ${step}: experience continuous`,
            atStepIndex: step,
          });

          // - Cross-validation shows concordant
          const cv = scc.crossValidate(result.postStepPsi);
          expect(cv).not.toBeNull();
          expect(cv!.concordant).toBe(true);
        }

        // Then after all steps complete:
        // - All units are Synthetic
        for (const unit of plan.replacementOrder) {
          expect(unit.state).toBe(NeuronSubstrateState.Synthetic);
        }

        // - Subject reports unbroken continuity
        scc.recordPostTransfer({
          type: SubjectReportType.PostTransfer,
          timestamp_ms: 2000,
          continuityIntact: true,
          description: "Transfer complete, continuity maintained throughout",
          atStepIndex: null,
        });

        const allReports = scc.getAllReports();
        expect(allReports.every((r) => r.continuityIntact)).toBe(true);
      });
    });

    describe("Scenario 2: Ψ drop triggers rollback", () => {
      it("halts and rolls back when Ψ drops below threshold", async () => {
        // Given: transfer in progress, Ψ = 3.2 (GREEN)
        const threshold = 2.0;
        const subject = makeSubject({
          psiThreshold: threshold,
          baselinePsi: [makePsi(3.5, threshold)],
        });

        let stepCount = 0;
        // Ψ drops to RED on step 2 (third step)
        const psiMeasurer: PsiMeasurer = () => {
          stepCount++;
          if (stepCount <= 2) return makePsi(3.2, threshold); // GREEN
          return makePsi(1.8, threshold); // RED — below threshold
        };

        const units = makeUnits(100);
        const rtcm = new RealTimeContinuityMonitorImpl();
        const scc = new SubjectContinuityConfirmationImpl();

        let breachFired = false;
        let breachLevel: AlertLevel | null = null;
        rtcm.onThresholdBreach((alert, _psi) => {
          breachFired = true;
          breachLevel = alert;
        });

        const engine = new ReplacementProtocolEngineImpl(
          makeTopologyProvider(units),
          psiMeasurer,
          rtcm,
          () => 1000,
        );

        rtcm.startMonitoring(subject);
        const plan = engine.planTransfer(subject);

        // When: execute steps normally
        const result0 = await engine.executeStep(plan, 0);
        expect(result0.alertLevel).toBe(AlertLevel.GREEN);

        const result1 = await engine.executeStep(plan, 1);
        expect(result1.alertLevel).toBe(AlertLevel.GREEN);

        // Step 2: Ψ drops to 1.8 (RED)
        const result2 = await engine.executeStep(plan, 2);

        // Then: RTCM fires breach callback with RED
        expect(breachFired).toBe(true);
        expect(breachLevel).toBe(AlertLevel.RED);
        expect(result2.alertLevel).toBe(AlertLevel.RED);
        expect(result2.success).toBe(false);

        // RPE halts — cannot execute step 3 due to RED alert
        // (Reset measurer to non-RED for rollback psi measurement)
        stepCount = 0;

        // RollbackEngine reverses step 2
        const rollbackResult = await engine.rollback(1);
        expect(rollbackResult.success).toBe(true);

        // Units from step 2 should be Biological again
        const step2Units = plan.replacementOrder.filter(
          (u) => u.stepIndex === 2,
        );
        for (const u of step2Units) {
          expect(u.state).toBe(NeuronSubstrateState.Biological);
        }

        // Post-rollback Ψ is re-measured
        expect(rollbackResult.postRollbackPsi).toBeDefined();

        // SCC records the event
        scc.recordDuringTransfer({
          type: SubjectReportType.DuringTransfer,
          timestamp_ms: 3000,
          continuityIntact: false,
          description: "Experienced disruption during step 2",
          atStepIndex: 2,
        });

        const reports = scc.getAllReports();
        expect(reports).toHaveLength(1);
        expect(reports[0].continuityIntact).toBe(false);
      });
    });

    describe("Scenario 3: Cross-validation discrepancy", () => {
      it("detects when objective and subjective metrics disagree", async () => {
        // Given: transfer in progress, RTCM shows Ψ = 2.8 (YELLOW, above threshold)
        const threshold = 2.0;
        const subject = makeSubject({
          psiThreshold: threshold,
          baselinePsi: [makePsi(3.5, threshold)],
        });

        const psiMeasurer: PsiMeasurer = () => makePsi(2.8, threshold);
        const units = makeUnits(100);
        const rtcm = new RealTimeContinuityMonitorImpl();
        const scc = new SubjectContinuityConfirmationImpl();

        const engine = new ReplacementProtocolEngineImpl(
          makeTopologyProvider(units),
          psiMeasurer,
          rtcm,
          () => 1000,
        );

        rtcm.startMonitoring(subject);
        const plan = engine.planTransfer(subject);
        const result = await engine.executeStep(plan, 0);

        // Objective: Ψ = 2.8 > threshold = 2.0 → continuity preserved
        expect(result.alertLevel).toBe(AlertLevel.YELLOW);
        expect(result.postStepPsi.value).toBeGreaterThanOrEqual(threshold);

        // When: subject reports continuityIntact = false
        scc.recordDuringTransfer({
          type: SubjectReportType.DuringTransfer,
          timestamp_ms: 2000,
          continuityIntact: false,
          description: "Something feels different, not continuous",
          atStepIndex: 0,
        });

        // Then: cross-validation returns concordant=false, discrepancy="objective-only"
        const cv = scc.crossValidate(result.postStepPsi);
        expect(cv).not.toBeNull();
        expect(cv!.concordant).toBe(false);
        expect(cv!.discrepancy).toBe("objective-only");
        expect(cv!.objectiveContinuity).toBe(true);
        expect(cv!.subjectiveContinuity).toBe(false);

        // The discrepancy is logged — verified by having a non-null result
        // Transfer does not resume until discrepancy is resolved
        // (RPE.pause() would be called by the orchestration layer)
        engine.pause();
      });
    });
  });

  // ── Invariant Tests ─────────────────────────────────────────────────────

  describe("Invariants", () => {
    it("at no point do two complete copies exist simultaneously", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      // Execute all steps
      const totalSteps = Math.ceil(plan.totalUnits / plan.batchSize);
      for (let step = 0; step < totalSteps; step++) {
        await engine.executeStep(plan, step);

        // After each step, count biological + synthetic — should equal totalUnits
        const biologicalCount = plan.replacementOrder.filter(
          (u) => u.state === NeuronSubstrateState.Biological,
        ).length;
        const syntheticCount = plan.replacementOrder.filter(
          (u) => u.state === NeuronSubstrateState.Synthetic,
        ).length;
        expect(biologicalCount + syntheticCount).toBe(plan.totalUnits);
        // No complete copy: syntheticCount < totalUnits at every step except the last
        if (step < totalSteps - 1) {
          expect(syntheticCount).toBeLessThan(plan.totalUnits);
        }
      }
    });

    it("Ψ is measured after every step — no step without verification", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      const totalSteps = Math.ceil(plan.totalUnits / plan.batchSize);
      for (let step = 0; step < totalSteps; step++) {
        await engine.executeStep(plan, step);
      }

      // RTCM should have exactly totalSteps measurements
      expect(rtcm.getHistory()).toHaveLength(totalSteps);
    });

    it("each synthetic unit has causal state from biological predecessor (rollbackAvailable + replacedAt set)", async () => {
      const { engine, rtcm } = setupEngine({ unitCount: 100 });
      const subject = makeSubject();
      rtcm.startMonitoring(subject);
      const plan = engine.planTransfer(subject);

      await engine.executeStep(plan, 0);

      for (const unit of plan.replacementOrder.slice(0, plan.batchSize)) {
        expect(unit.state).toBe(NeuronSubstrateState.Synthetic);
        expect(unit.replacedAt_ms).not.toBeNull();
        expect(unit.rollbackAvailable).toBe(true);
      }
    });
  });
});
