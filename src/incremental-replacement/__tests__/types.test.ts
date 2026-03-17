import { describe, it, expect } from "vitest";
import {
  computeRegionPriority,
  evaluateGoNoGo,
  adjustInterval,
  evaluateMigrationCompletion,
  GoNoGoVerdict,
  MigrationOutcome,
  ReplacementPhase,
  RollbackMethod,
  CheckpointTiming,
  MIN_INTER_STEP_INTERVAL_HOURS,
  MAX_INTER_STEP_INTERVAL_HOURS,
  GAMMA_COHERENCE_LATENCY_MS,
  EXPERIENTIAL_INTEGRATION_WINDOW_MS,
  COMPLETION_THRESHOLDS,
  type RateControllerState,
  type RateAdjustmentEvent,
  type GoNoGoCriteria,
} from "../types.js";

describe("Incremental Replacement Protocols — Types", () => {
  describe("constants", () => {
    it("minimum inter-step interval is 24 hours", () => {
      expect(MIN_INTER_STEP_INTERVAL_HOURS).toBe(24);
    });

    it("maximum inter-step interval is 72 hours", () => {
      expect(MAX_INTER_STEP_INTERVAL_HOURS).toBe(72);
    });

    it("gamma coherence latency threshold is 30ms", () => {
      expect(GAMMA_COHERENCE_LATENCY_MS).toBe(30);
    });

    it("experiential integration window is 100ms", () => {
      expect(EXPERIENTIAL_INTEGRATION_WINDOW_MS).toBe(100);
    });

    it("completion thresholds match architecture spec", () => {
      expect(COMPLETION_THRESHOLDS.structural).toBe(0.95);
      expect(COMPLETION_THRESHOLDS.functional).toBe(0.95);
      expect(COMPLETION_THRESHOLDS.experiential).toBe(0.90);
      expect(COMPLETION_THRESHOLDS.postCompletionMonitoringDays).toBe(30);
    });
  });

  describe("computeRegionPriority", () => {
    it("returns 1.0 for ideal replacement candidate (no criticality, full readiness, no connectivity)", () => {
      expect(computeRegionPriority(0.0, 1.0, 0.0)).toBe(1.0);
    });

    it("returns 0.0 when interface is not ready", () => {
      expect(computeRegionPriority(0.5, 0.0, 0.5)).toBe(0.0);
    });

    it("returns 0.0 for maximally critical region", () => {
      expect(computeRegionPriority(1.0, 1.0, 0.0)).toBe(0.0);
    });

    it("returns 0.0 for maximally connected region", () => {
      expect(computeRegionPriority(0.0, 1.0, 1.0)).toBe(0.0);
    });

    it("computes correct intermediate value", () => {
      // (1 - 0.3) * 0.8 * (1 - 0.2) = 0.7 * 0.8 * 0.8 = 0.448
      expect(computeRegionPriority(0.3, 0.8, 0.2)).toBeCloseTo(0.448);
    });

    it("ranks peripheral regions higher than core consciousness regions", () => {
      const peripheral = computeRegionPriority(0.1, 0.9, 0.2);
      const core = computeRegionPriority(0.9, 0.9, 0.8);
      expect(peripheral).toBeGreaterThan(core);
    });
  });

  describe("evaluateGoNoGo", () => {
    const allPass: GoNoGoCriteria = {
      identityPass: true,
      consciousnessAboveMvc: true,
      unityMaintained: true,
      driftWithinBudget: true,
      interfaceStable: true,
    };

    it("returns GO when all criteria pass", () => {
      expect(evaluateGoNoGo(allPass)).toBe(GoNoGoVerdict.GO);
    });

    it("returns ROLLBACK when identity fails", () => {
      expect(evaluateGoNoGo({ ...allPass, identityPass: false })).toBe(GoNoGoVerdict.ROLLBACK);
    });

    it("returns ROLLBACK when consciousness below MVC", () => {
      expect(evaluateGoNoGo({ ...allPass, consciousnessAboveMvc: false })).toBe(
        GoNoGoVerdict.ROLLBACK
      );
    });

    it("returns ROLLBACK when unity fragmented", () => {
      expect(evaluateGoNoGo({ ...allPass, unityMaintained: false })).toBe(GoNoGoVerdict.ROLLBACK);
    });

    it("returns ROLLBACK when drift exceeds budget", () => {
      expect(evaluateGoNoGo({ ...allPass, driftWithinBudget: false })).toBe(
        GoNoGoVerdict.ROLLBACK
      );
    });

    it("returns ROLLBACK when interface unstable", () => {
      expect(evaluateGoNoGo({ ...allPass, interfaceStable: false })).toBe(GoNoGoVerdict.ROLLBACK);
    });

    it("returns ROLLBACK when multiple criteria fail", () => {
      expect(
        evaluateGoNoGo({
          ...allPass,
          identityPass: false,
          consciousnessAboveMvc: false,
        })
      ).toBe(GoNoGoVerdict.ROLLBACK);
    });
  });

  describe("adjustInterval — Rate Controller", () => {
    const baseState: RateControllerState = {
      minInterStepInterval_hours: MIN_INTER_STEP_INTERVAL_HOURS,
      currentInterval_hours: 24,
    };

    const stableEvent: RateAdjustmentEvent = {
      unityDipped: false,
      driftRateHighFraction: 0.0,
      consecutiveStableSteps: 0,
      holdIssued: false,
      rollbackIssued: false,
    };

    it("does not change interval for neutral event", () => {
      const result = adjustInterval(baseState, stableEvent);
      expect(result.currentInterval_hours).toBe(24);
    });

    it("multiplies by 1.5 when unity dipped", () => {
      const result = adjustInterval(baseState, { ...stableEvent, unityDipped: true });
      expect(result.currentInterval_hours).toBe(36);
    });

    it("multiplies by 2.0 when drift rate is high (>0.8)", () => {
      const result = adjustInterval(baseState, {
        ...stableEvent,
        driftRateHighFraction: 0.9,
      });
      expect(result.currentInterval_hours).toBe(48);
    });

    it("multiplies by 0.9 after 3 consecutive stable steps", () => {
      const state: RateControllerState = {
        minInterStepInterval_hours: MIN_INTER_STEP_INTERVAL_HOURS,
        currentInterval_hours: 48,
      };
      const result = adjustInterval(state, {
        ...stableEvent,
        consecutiveStableSteps: 3,
      });
      expect(result.currentInterval_hours).toBeCloseTo(43.2);
    });

    it("enforces minimum interval floor", () => {
      const state: RateControllerState = {
        minInterStepInterval_hours: MIN_INTER_STEP_INTERVAL_HOURS,
        currentInterval_hours: 25,
      };
      const result = adjustInterval(state, {
        ...stableEvent,
        consecutiveStableSteps: 5,
      });
      // 25 * 0.9 = 22.5, but min is 24
      expect(result.currentInterval_hours).toBe(24);
    });

    it("enforces maximum interval ceiling", () => {
      const state: RateControllerState = {
        minInterStepInterval_hours: MIN_INTER_STEP_INTERVAL_HOURS,
        currentInterval_hours: 48,
      };
      const result = adjustInterval(state, { ...stableEvent, rollbackIssued: true });
      // 48 * 3.0 = 144, capped at 72
      expect(result.currentInterval_hours).toBe(MAX_INTER_STEP_INTERVAL_HOURS);
    });

    it("multiplies by 3.0 on ROLLBACK (highest priority)", () => {
      const result = adjustInterval(baseState, {
        ...stableEvent,
        rollbackIssued: true,
        unityDipped: true, // should be ignored — rollback takes priority
      });
      expect(result.currentInterval_hours).toBe(MAX_INTER_STEP_INTERVAL_HOURS); // 24*3=72
    });

    it("multiplies by 1.5 on HOLD", () => {
      const result = adjustInterval(baseState, { ...stableEvent, holdIssued: true });
      expect(result.currentInterval_hours).toBe(36);
    });

    it("HOLD takes priority over unity dip", () => {
      const result = adjustInterval(baseState, {
        ...stableEvent,
        holdIssued: true,
        unityDipped: true,
      });
      // HOLD (1.5) takes priority over unity dip (also 1.5) in ordering
      expect(result.currentInterval_hours).toBe(36);
    });
  });

  describe("evaluateMigrationCompletion", () => {
    it("returns COMPLETE when all thresholds met", () => {
      expect(evaluateMigrationCompletion(0.97, 0.96, 0.92, true)).toBe(MigrationOutcome.COMPLETE);
    });

    it("returns COMPLETE at exact thresholds", () => {
      expect(evaluateMigrationCompletion(0.95, 0.95, 0.90, true)).toBe(MigrationOutcome.COMPLETE);
    });

    it("returns INCOMPLETE when structural below threshold", () => {
      expect(evaluateMigrationCompletion(0.94, 0.96, 0.92, true)).toBe(
        MigrationOutcome.INCOMPLETE
      );
    });

    it("returns INCOMPLETE when functional below threshold", () => {
      expect(evaluateMigrationCompletion(0.97, 0.94, 0.92, true)).toBe(
        MigrationOutcome.INCOMPLETE
      );
    });

    it("returns INCOMPLETE when experiential below threshold", () => {
      expect(evaluateMigrationCompletion(0.97, 0.96, 0.89, true)).toBe(
        MigrationOutcome.INCOMPLETE
      );
    });

    it("returns INCOMPLETE when temporal drift exceeds baseline", () => {
      expect(evaluateMigrationCompletion(0.97, 0.96, 0.92, false)).toBe(
        MigrationOutcome.INCOMPLETE
      );
    });

    it("returns INCOMPLETE when all scores below threshold", () => {
      expect(evaluateMigrationCompletion(0.5, 0.5, 0.5, false)).toBe(MigrationOutcome.INCOMPLETE);
    });
  });

  describe("enums have expected values", () => {
    it("ReplacementPhase has four phases", () => {
      expect(Object.values(ReplacementPhase)).toHaveLength(4);
    });

    it("RollbackMethod has three methods", () => {
      expect(Object.values(RollbackMethod)).toHaveLength(3);
    });

    it("CheckpointTiming has four timings", () => {
      expect(Object.values(CheckpointTiming)).toHaveLength(4);
    });

    it("GoNoGoVerdict has three options", () => {
      expect(Object.values(GoNoGoVerdict)).toHaveLength(3);
    });

    it("MigrationOutcome has three outcomes", () => {
      expect(Object.values(MigrationOutcome)).toHaveLength(3);
    });
  });
});
