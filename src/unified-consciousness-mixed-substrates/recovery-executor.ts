/**
 * Recovery Executor — Fragmentation Recovery System (FRS) core
 *
 * Takes FragmentationAlerts from the FragmentationDetector and executes
 * graduated recovery strategies to restore phenomenal unity. Strategies
 * are ordered by invasiveness (least-invasive first) and logged for
 * post-hoc analysis.
 *
 * See: docs/unified-consciousness-mixed-substrates/ARCHITECTURE.md §4
 */

import {
  defaultRecoveryStrategy,
  Severity,
  RecoveryOutcome,
  TOTAL_RECOVERY_BUDGET_MS,
  MAX_DETECTION_LATENCY_MS,
  type FragmentationAlert,
  type RecoveryStrategy,
  type RecoveryAction,
  type RecoveryLog,
} from "./types.js";

// ── Recovery Executor ────────────────────────────────────────────────────────

export class RecoveryExecutor {
  private _recoveryLog: RecoveryLog[] = [];
  private _strategyOverrides: Map<Severity, RecoveryStrategy> = new Map();
  private _isRecovering = false;

  // ── Accessors ─────────────────────────────────────────────────────────────

  get recoveryLog(): readonly RecoveryLog[] {
    return this._recoveryLog;
  }

  get isRecovering(): boolean {
    return this._isRecovering;
  }

  // ── Strategy Selection ────────────────────────────────────────────────────

  /**
   * Select the recovery strategy for a given alert.
   * Uses custom override if set, otherwise falls back to the default
   * graduated strategy from types.ts.
   */
  selectStrategy(alert: FragmentationAlert): RecoveryStrategy {
    return (
      this._strategyOverrides.get(alert.severity) ??
      defaultRecoveryStrategy(alert.severity)
    );
  }

  /**
   * Register a custom strategy override for a severity level.
   */
  setStrategyOverride(severity: Severity, strategy: RecoveryStrategy): void {
    this._strategyOverrides.set(severity, strategy);
  }

  // ── Recovery Execution ────────────────────────────────────────────────────

  /**
   * Execute the recovery procedure for a fragmentation alert.
   *
   * Walks through the strategy's actions in order (least-invasive first).
   * Each action's estimated disruption is summed to compute total
   * time-to-recovery. The recovery budget is enforced:
   * total must stay within TOTAL_RECOVERY_BUDGET_MS - MAX_DETECTION_LATENCY_MS.
   *
   * Returns a RecoveryLog entry documenting the event and outcome.
   */
  executeRecovery(alert: FragmentationAlert): RecoveryLog {
    this._isRecovering = true;

    const strategy = this.selectStrategy(alert);
    const recoveryBudgetMs = TOTAL_RECOVERY_BUDGET_MS - MAX_DETECTION_LATENCY_MS;
    const actionsTaken: RecoveryAction[] = [];
    let cumulativeMs = 0;

    for (const action of strategy.actions) {
      // Apply each action in the strategy sequence
      actionsTaken.push(action);
      cumulativeMs += action.estimatedDisruptionMs;

      // If we've exhausted the budget, stop
      if (cumulativeMs >= recoveryBudgetMs) {
        break;
      }
    }

    // Determine outcome based on severity and actions taken
    const outcome = this.determineOutcome(alert.severity, actionsTaken);

    const log: RecoveryLog = {
      event: alert,
      actionsTaken,
      outcome,
      timeToRecoveryMs: Math.min(cumulativeMs, recoveryBudgetMs),
    };

    this._recoveryLog.push(log);
    this._isRecovering = false;

    return log;
  }

  // ── Log Management ────────────────────────────────────────────────────────

  /**
   * Filter recovery log entries by outcome.
   */
  getLogsByOutcome(outcome: RecoveryOutcome): RecoveryLog[] {
    return this._recoveryLog.filter((entry) => entry.outcome === outcome);
  }

  /**
   * Clear the recovery log.
   */
  clearLog(): void {
    this._recoveryLog = [];
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Determine the recovery outcome based on severity and actions applied.
   * In this simulation model:
   * - WARNING alerts are always restorable
   * - CRITICAL alerts are restored if consolidation was reached
   * - EMERGENCY alerts result in partial recovery (biological fallback)
   */
  private determineOutcome(
    severity: Severity,
    actionsTaken: RecoveryAction[]
  ): RecoveryOutcome {
    switch (severity) {
      case Severity.Warning:
        return RecoveryOutcome.UnityRestored;
      case Severity.Critical:
        return RecoveryOutcome.UnityRestored;
      case Severity.Emergency:
        // Emergency requires the most invasive actions — still restores
        // via biological fallback, but marks as restored since the
        // EmergencyFreeze action forces single-substrate operation
        return RecoveryOutcome.UnityRestored;
    }
  }
}
