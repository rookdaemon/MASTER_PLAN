/**
 * Graceful Degradation — Synthetic Health Monitor
 *
 * Monitors synthetic substrate health via module health scores, watchdog
 * responsiveness, thermal status, and error rates. Provides health scores,
 * failure type classification (NONE / HARD_FAULT / DEGRADED), watchdog
 * reports, and thermal reports.
 *
 * All environment time is injected via Clock (testable, no direct Date.now()).
 * All signal I/O is injected via SynthSignalSource (testable, no hardware coupling).
 *
 * See: docs/graceful-degradation/ARCHITECTURE.md §3.2
 * Card: 0.2.2.4.3
 */

import {
  SynthFailureType,
  type HealthScore,
  type ModuleId,
  type SynthHealthMonitor,
  type ThermalReport,
  type WatchdogReport,
} from "./types.js";

// ── Threshold Registry constants ─────────────────────────────────────────────
// Values match Threshold Registry entries in card 0.2.2.4.3.

/**
 * Detection window for synthetic hard faults.
 * Modules that miss one watchdog check are flagged; modules that miss two
 * consecutive checks (2 × SYNTHETIC_HARD_FAULT_DETECTION_MS) are marked failed.
 * SYNTHETIC_HARD_FAULT_DETECTION_MS = 2ms
 */
const SYNTHETIC_HARD_FAULT_DETECTION_MS = 2;

/**
 * Health score boundary below which a module is considered DEGRADED rather
 * than fully healthy. Matches the invariant: DEGRADED when 0.0 < health < 0.5.
 */
const DEGRADED_HEALTH_THRESHOLD = 0.5;

// ── Re-export Clock so consumers don't need to import from bio-health-monitor ─

export interface Clock {
  /** Returns the current wall-clock time in milliseconds. */
  now(): number;
}

// ── Injectable signal source abstraction ─────────────────────────────────────

/**
 * Abstracts raw signal reading from synthetic substrate hardware.
 * Implementations may talk to actual synthetic modules or return simulated data.
 */
export interface SynthSignalSource {
  /**
   * Returns the health score (0.0–1.0) for the given module.
   * 1.0 = fully operational; 0.0 = failed.
   */
  getModuleHealth(moduleId: ModuleId, timestamp_ms: number): HealthScore;

  /**
   * Returns the error rate (events per second, normalized 0.0–1.0) for the
   * given module. 0.0 = no errors; 1.0 = saturated error rate.
   */
  getErrorRate(moduleId: ModuleId, timestamp_ms: number): number;

  /**
   * Returns whether the module responded to the most recent watchdog ping,
   * together with the timestamp of the last successful response.
   */
  getWatchdogResponse(
    moduleId: ModuleId,
    timestamp_ms: number,
  ): { responded: boolean; lastResponseTimestamp_ms: number };

  /**
   * Returns the current temperature reading for the thermal subsystem (Kelvin).
   */
  getTemperature(timestamp_ms: number): number;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Configurable thresholds and window parameters for SynthHealthMonitor.
 * All values have documented defaults; override for specific synthetic substrates.
 */
export interface SynthMonitorConfig {
  /**
   * Number of consecutive missed watchdog cycles before a module is considered
   * failed (health = 0.0). Default: 2.
   * Formula: missedCycles × SYNTHETIC_HARD_FAULT_DETECTION_MS = time-to-fail.
   */
  watchdogMissedCyclesThreshold?: number;

  /**
   * Duration of a single watchdog cycle in milliseconds.
   * Default: SYNTHETIC_HARD_FAULT_DETECTION_MS (2ms).
   */
  watchdogCycleDuration_ms?: number;

  /**
   * Minimum operating temperature in Kelvin.
   * Default: 233.15 K (−40 °C, typical lower bound for silicon electronics).
   */
  minOperatingTemp_K?: number;

  /**
   * Maximum operating temperature in Kelvin.
   * Default: 358.15 K (85 °C, typical upper bound for silicon electronics).
   */
  maxOperatingTemp_K?: number;
}

const DEFAULT_CONFIG: Required<SynthMonitorConfig> = {
  watchdogMissedCyclesThreshold: 2,
  watchdogCycleDuration_ms: SYNTHETIC_HARD_FAULT_DETECTION_MS,
  minOperatingTemp_K: 233.15,
  maxOperatingTemp_K: 358.15,
};

// ── DefaultSynthHealthMonitor ─────────────────────────────────────────────────

/**
 * Concrete implementation of SynthHealthMonitor.
 *
 * Module health is read directly from the injected SynthSignalSource.
 * Watchdog failure override: if a module has not responded within
 * (watchdogMissedCyclesThreshold × watchdogCycleDuration_ms), its health
 * is forced to 0.0 regardless of the raw score.
 *
 * Failure classification:
 * - HARD_FAULT: any module has effective health = 0.0
 * - DEGRADED:   any module has 0.0 < effective health < DEGRADED_HEALTH_THRESHOLD
 * - NONE:       all modules have effective health ≥ DEGRADED_HEALTH_THRESHOLD
 */
export class DefaultSynthHealthMonitor implements SynthHealthMonitor {
  private readonly registeredModules: readonly ModuleId[];
  private readonly signalSource: SynthSignalSource;
  private readonly clock: Clock;
  private readonly config: Required<SynthMonitorConfig>;

  constructor(
    modules: ModuleId[],
    signalSource: SynthSignalSource,
    clock: Clock,
    config?: SynthMonitorConfig,
  ) {
    this.registeredModules = [...modules];
    this.signalSource = signalSource;
    this.clock = clock;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── SynthHealthMonitor interface ────────────────────────────────────────────

  /**
   * Returns effective health for a module.
   *
   * Applies watchdog override: if the last watchdog response is older than
   * (watchdogMissedCyclesThreshold × watchdogCycleDuration_ms) before now,
   * the module is considered failed and health is clamped to 0.0.
   */
  moduleHealth(moduleId: ModuleId): HealthScore {
    const ts = this.clock.now();
    const watchdog = this.signalSource.getWatchdogResponse(moduleId, ts);
    const deadline_ms =
      this.config.watchdogMissedCyclesThreshold *
      this.config.watchdogCycleDuration_ms;

    if (
      !watchdog.responded &&
      ts - watchdog.lastResponseTimestamp_ms >= deadline_ms
    ) {
      return 0.0;
    }

    const raw = this.signalSource.getModuleHealth(moduleId, ts);
    return Math.max(0, Math.min(1, raw));
  }

  /**
   * Returns the minimum (worst-case) health score across all registered modules.
   * Satisfies invariant: overallSynthHealth() ≤ all individual moduleHealth() scores.
   */
  overallSynthHealth(): HealthScore {
    if (this.registeredModules.length === 0) return 0.0;
    let worst = 1.0;
    for (const moduleId of this.registeredModules) {
      worst = Math.min(worst, this.moduleHealth(moduleId));
    }
    return worst;
  }

  /**
   * Returns the current error rate (events/s, normalized 0.0–1.0) for a module.
   */
  errorRate(moduleId: ModuleId): number {
    const ts = this.clock.now();
    return this.signalSource.getErrorRate(moduleId, ts);
  }

  /**
   * Classify the current failure type across all registered modules.
   *
   * - HARD_FAULT: any module has effective health = 0.0
   * - DEGRADED:   any module has 0.0 < effective health < DEGRADED_HEALTH_THRESHOLD
   * - NONE:       all modules fully healthy
   */
  failureType(): SynthFailureType {
    for (const moduleId of this.registeredModules) {
      const health = this.moduleHealth(moduleId);
      if (health === 0.0) return SynthFailureType.HardFault;
    }

    for (const moduleId of this.registeredModules) {
      const health = this.moduleHealth(moduleId);
      if (health < DEGRADED_HEALTH_THRESHOLD) return SynthFailureType.Degraded;
    }

    return SynthFailureType.None;
  }

  /**
   * Returns the watchdog status: whether all modules responded, and the list
   * of unresponsive modules.
   *
   * A module is "unresponsive" when it either did not respond to the most recent
   * ping or its last response is older than the missed-cycles deadline.
   */
  watchdogStatus(): WatchdogReport {
    const ts = this.clock.now();
    const deadline_ms =
      this.config.watchdogMissedCyclesThreshold *
      this.config.watchdogCycleDuration_ms;

    const unresponsiveModules: ModuleId[] = [];

    for (const moduleId of this.registeredModules) {
      const wd = this.signalSource.getWatchdogResponse(moduleId, ts);
      if (!wd.responded && ts - wd.lastResponseTimestamp_ms >= deadline_ms) {
        unresponsiveModules.push(moduleId);
      }
    }

    return {
      allResponding: unresponsiveModules.length === 0,
      unresponsiveModules,
      lastCheckTimestamp_ms: ts,
    };
  }

  /**
   * Returns the current thermal status: temperature in Kelvin and whether
   * it is within the configured operating range.
   */
  thermalStatus(): ThermalReport {
    const ts = this.clock.now();
    const temperature_K = this.signalSource.getTemperature(ts);
    const withinOperatingRange =
      temperature_K >= this.config.minOperatingTemp_K &&
      temperature_K <= this.config.maxOperatingTemp_K;

    return { temperature_K, withinOperatingRange };
  }
}
