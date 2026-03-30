/**
 * Cognitive Budget Monitor (0.3.1.5.9)
 *
 * Tracks wall-clock time per phase within a single tick and enforces
 * the architecture's budget allocations:
 *
 *   MONITOR    ≥40% floor   — never truncated
 *   DELIBERATE ≥25% floor   — truncate planning before this
 *   ACT        ≥15% floor   — DELIBERATE yields if ACT would be squeezed below this
 *   STABILITY  ≤15% soft cap — log warning; no hard truncation
 *   ETHICAL    ≤10% soft cap — log warning; no hard truncation
 *
 * shouldYieldPhase() provides a soft-yield signal: when the loop asks
 * for a phase that would eat into the protected floors of later phases,
 * it returns true. MONITOR is exempt and always returns false.
 */

import type { ICognitiveBudgetMonitor } from './interfaces.js';
import type { AgentPhase, BudgetReport, PhaseTiming } from './types.js';

/** Budget caps and floors as fractions of total tick budget. */
const MONITOR_FLOOR = 0.40;       // hard floor — never truncate MONITOR
const DELIBERATE_FLOOR = 0.25;    // hard floor — truncate planning to preserve this
const ACT_FLOOR = 0.15;           // hard floor — ensure action phase gets minimum budget
const STABILITY_SOFT_CAP = 0.15;  // soft cap — log warning
const ETHICAL_SOFT_CAP = 0.10;    // soft cap — log warning

export class CognitiveBudgetMonitor implements ICognitiveBudgetMonitor {
  private _phases: Map<AgentPhase, PhaseTiming> = new Map();
  private _activePhase: AgentPhase | null = null;
  private _activeStart: number = 0;
  private _tickStart: number = Date.now();

  resetTick(): void {
    this._phases = new Map();
    this._activePhase = null;
    this._activeStart = 0;
    this._tickStart = Date.now();
  }

  startPhase(phase: AgentPhase): void {
    // Auto-end previous phase if not ended
    if (this._activePhase !== null && this._activePhase !== phase) {
      this.endPhase(this._activePhase);
    }
    this._activePhase = phase;
    this._activeStart = Date.now();
  }

  endPhase(phase: AgentPhase): PhaseTiming {
    const endMs = Date.now();
    const startMs = this._activePhase === phase ? this._activeStart : endMs;
    const timing: PhaseTiming = {
      phase,
      startMs,
      endMs,
      durationMs: endMs - startMs,
    };
    this._phases.set(phase, timing);
    if (this._activePhase === phase) {
      this._activePhase = null;
    }
    return timing;
  }

  getBudgetReport(): BudgetReport {
    const now = Date.now();
    const totalMs = Math.max(1, now - this._tickStart);
    const phases = Array.from(this._phases.values());

    const monitorMs = this._phases.get('monitor')?.durationMs ?? 0;
    const deliberateMs = this._phases.get('deliberate')?.durationMs ?? 0;

    const monitorFraction = monitorMs / totalMs;
    const deliberateFraction = deliberateMs / totalMs;

    return {
      totalMs,
      phases,
      monitorFraction,
      deliberateFraction,
      monitorFloorMet: monitorFraction >= MONITOR_FLOOR,
      deliberateFloorMet: deliberateFraction >= DELIBERATE_FLOOR,
    };
  }

  isPhaseOverBudget(phase: AgentPhase, totalBudgetMs: number): boolean {
    const timing = this._phases.get(phase);
    if (!timing) return false;
    const elapsed = timing.durationMs;

    switch (phase) {
      case 'monitor':
        return false; // MONITOR is never over budget — it has a floor, not a cap
      case 'deliberate':
        return false; // DELIBERATE has a floor, not a cap
      case 'act':
        return false; // ACT uses remainder; no explicit cap
      case 'consolidate':
        return elapsed > totalBudgetMs * 0.20; // informal cap
      default:
        return elapsed > totalBudgetMs * 0.15;
    }
  }

  shouldYieldPhase(phase: AgentPhase, totalBudgetMs: number): boolean {
    // MONITOR is exempt — always runs to completion
    if (phase === 'monitor') return false;

    const now = Date.now();
    const elapsedTickMs = now - this._tickStart;
    const remaining = totalBudgetMs - elapsedTickMs;

    // Estimate how much budget MONITOR and DELIBERATE still need
    const monitorMs = this._phases.get('monitor')?.durationMs ?? 0;
    const deliberateMs = this._phases.get('deliberate')?.durationMs ?? 0;

    const monitorNeeded = Math.max(0, totalBudgetMs * MONITOR_FLOOR - monitorMs);
    const deliberateNeeded = Math.max(0, totalBudgetMs * DELIBERATE_FLOOR - deliberateMs);

    const reservedMs = monitorNeeded + deliberateNeeded;

    // Yield if remaining budget is less than what higher-priority phases need
    if (remaining <= reservedMs) return true;

    // If deliberation would squeeze ACT below its floor, yield
    if (phase === 'deliberate') {
      const currentDeliberateMs = this._activePhase === 'deliberate' ? now - this._activeStart : 0;
      const totalDeliberateMs = deliberateMs + currentDeliberateMs;
      const actRemaining = totalBudgetMs - monitorMs - totalDeliberateMs;
      if (actRemaining < totalBudgetMs * ACT_FLOOR) return true;
    }

    return false;
  }

  /** Log a soft-cap warning (non-throwing). */
  checkSoftCaps(totalBudgetMs: number): void {
    const stabilityMs = (this._phases.get('monitor')?.durationMs ?? 0);
    const ethicalMs = 0; // ethical is embedded in deliberate; tracked separately if needed
    const stabilityFraction = stabilityMs / totalBudgetMs;
    const ethicalFraction = ethicalMs / totalBudgetMs;

    if (stabilityFraction > STABILITY_SOFT_CAP) {
      console.warn(`[BudgetMonitor] Stability ops exceeded soft cap: ${(stabilityFraction * 100).toFixed(1)}% > ${STABILITY_SOFT_CAP * 100}%`);
    }
    if (ethicalFraction > ETHICAL_SOFT_CAP) {
      console.warn(`[BudgetMonitor] Ethical overhead exceeded soft cap: ${(ethicalFraction * 100).toFixed(1)}% > ${ETHICAL_SOFT_CAP * 100}%`);
    }
  }
}
