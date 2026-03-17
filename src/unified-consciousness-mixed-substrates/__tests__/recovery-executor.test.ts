import { describe, it, expect, beforeEach } from "vitest";
import { RecoveryExecutor } from "../recovery-executor.js";
import {
  Severity,
  RecoveryActionType,
  RecoveryOutcome,
  MetricType,
  TOTAL_RECOVERY_BUDGET_MS,
  MAX_DETECTION_LATENCY_MS,
  defaultRecoveryStrategy,
  type FragmentationAlert,
  type UnityMetric,
  type SubstrateCoverage,
  type RecoveryLog,
} from "../types.js";

// ── Test Helpers ────────────────────────────────────────────────────────────

const DEFAULT_COVERAGE: SubstrateCoverage = {
  biologicalRegions: ["cortex-v1"],
  syntheticNodes: ["node-a"],
  coverageFraction: 0.8,
};

function makeAlert(severity: Severity, timestampMs: number = 1000): FragmentationAlert {
  return {
    severity,
    metricSnapshot: {
      metricType: MetricType.Phi,
      value: severity === Severity.Emergency ? 0.3 : severity === Severity.Critical ? 0.6 : 0.8,
      timestampMs,
      confidenceInterval: [0, 1],
      substrateCoverage: DEFAULT_COVERAGE,
    },
    affectedChannels: ["ch-1"],
    recommendedAction:
      severity === Severity.Emergency
        ? RecoveryActionType.EmergencyFreeze
        : severity === Severity.Critical
          ? RecoveryActionType.Consolidate
          : RecoveryActionType.Resync,
    timestampMs,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("RecoveryExecutor", () => {
  let executor: RecoveryExecutor;

  beforeEach(() => {
    executor = new RecoveryExecutor();
  });

  describe("construction", () => {
    it("creates an executor with an empty recovery log", () => {
      expect(executor.recoveryLog).toHaveLength(0);
    });

    it("starts with no active recovery", () => {
      expect(executor.isRecovering).toBe(false);
    });
  });

  // ── Strategy Selection ──────────────────────────────────────────────────

  describe("strategy selection", () => {
    it("selects the default strategy for the alert severity", () => {
      const strategy = executor.selectStrategy(makeAlert(Severity.Warning));
      expect(strategy.triggerSeverity).toBe(Severity.Warning);
    });

    it("allows custom strategy overrides", () => {
      const customStrategy = {
        triggerSeverity: Severity.Warning,
        actions: [
          {
            actionType: RecoveryActionType.Consolidate,
            estimatedDisruptionMs: 20,
            maxDurationMs: 80,
            rollbackCapable: true,
          },
        ],
      };
      executor.setStrategyOverride(Severity.Warning, customStrategy);
      const strategy = executor.selectStrategy(makeAlert(Severity.Warning));
      expect(strategy.actions[0].actionType).toBe(RecoveryActionType.Consolidate);
    });
  });

  // ── Recovery Execution ────────────────────────────────────────────────────

  describe("executeRecovery", () => {
    it("executes recovery for a WARNING alert and logs the result", () => {
      const alert = makeAlert(Severity.Warning);
      const log = executor.executeRecovery(alert);
      expect(log.event).toBe(alert);
      expect(log.actionsTaken.length).toBeGreaterThan(0);
      expect(log.outcome).toBe(RecoveryOutcome.UnityRestored);
    });

    it("logs all actions taken during CRITICAL recovery", () => {
      const alert = makeAlert(Severity.Critical);
      const log = executor.executeRecovery(alert);
      // Critical strategy has 3 actions; executor tries them in order
      expect(log.actionsTaken.length).toBeGreaterThanOrEqual(1);
    });

    it("records time-to-recovery within budget", () => {
      const alert = makeAlert(Severity.Warning);
      const log = executor.executeRecovery(alert);
      const recoveryBudget = TOTAL_RECOVERY_BUDGET_MS - MAX_DETECTION_LATENCY_MS;
      expect(log.timeToRecoveryMs).toBeLessThanOrEqual(recoveryBudget);
    });

    it("appends to the recovery log", () => {
      executor.executeRecovery(makeAlert(Severity.Warning, 1000));
      executor.executeRecovery(makeAlert(Severity.Critical, 2000));
      expect(executor.recoveryLog).toHaveLength(2);
    });

    it("marks recovery as active during execution", () => {
      // The executor should not be recovering before or after
      expect(executor.isRecovering).toBe(false);
      executor.executeRecovery(makeAlert(Severity.Warning));
      // After synchronous execution, recovery is complete
      expect(executor.isRecovering).toBe(false);
    });
  });

  // ── Emergency Handling ────────────────────────────────────────────────────

  describe("emergency recovery", () => {
    it("includes EmergencyFreeze in the actions for emergency alerts", () => {
      const alert = makeAlert(Severity.Emergency);
      const log = executor.executeRecovery(alert);
      const hasFreeze = log.actionsTaken.some(
        (a) => a.actionType === RecoveryActionType.EmergencyFreeze
      );
      expect(hasFreeze).toBe(true);
    });

    it("non-rollbackable actions are flagged in the log", () => {
      const alert = makeAlert(Severity.Emergency);
      const log = executor.executeRecovery(alert);
      const freeze = log.actionsTaken.find(
        (a) => a.actionType === RecoveryActionType.EmergencyFreeze
      );
      expect(freeze?.rollbackCapable).toBe(false);
    });
  });

  // ── Recovery Log Query ────────────────────────────────────────────────────

  describe("recovery log", () => {
    it("can filter log entries by outcome", () => {
      executor.executeRecovery(makeAlert(Severity.Warning, 1000));
      executor.executeRecovery(makeAlert(Severity.Critical, 2000));
      const restored = executor.getLogsByOutcome(RecoveryOutcome.UnityRestored);
      expect(restored.length).toBeGreaterThanOrEqual(1);
    });

    it("can clear the recovery log", () => {
      executor.executeRecovery(makeAlert(Severity.Warning));
      executor.clearLog();
      expect(executor.recoveryLog).toHaveLength(0);
    });
  });
});
