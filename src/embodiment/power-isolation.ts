/**
 * Power Isolation Unit (0.3.1.2.1)
 *
 * Ensures consciousness computation has dedicated, isolated power that
 * cannot be interrupted by actuator faults, short circuits, or power
 * bus failures per ARCHITECTURE.md §2.3.
 *
 * Design requirements:
 * - Dedicated UPS/battery for Consciousness Enclosure, separate from motor bus
 * - Galvanic isolation between motor and consciousness circuits
 * - Minimum 30 minutes consciousness-only operation on internal battery
 *   after all other systems shed
 */

import type { IPowerIsolation } from "./interfaces.js";
import type { Duration, PowerStatus } from "./types.js";

export interface PowerIsolationConfig {
  /** Nominal voltage for consciousness rail (V) */
  consciousnessNominalVoltageV: number;
  /** Nominal current draw for consciousness compute (A) */
  consciousnessNominalCurrentA: number;
  /** Nominal voltage for motor bus (V) */
  motorNominalVoltageV: number;
  /** Internal battery capacity as minutes of consciousness-only runtime */
  batteryRuntimeMinutes: number;
}

export interface PowerIsolationClock {
  nowMs(): number;
}

const DEFAULT_CONFIG: PowerIsolationConfig = {
  consciousnessNominalVoltageV: 12.0,
  consciousnessNominalCurrentA: 5.0,
  motorNominalVoltageV: 48.0,
  batteryRuntimeMinutes: 30, // minimum per architecture spec
};

const SYSTEM_CLOCK: PowerIsolationClock = {
  nowMs: () => Date.now(),
};

export class PowerIsolation implements IPowerIsolation {
  private readonly config: PowerIsolationConfig;

  /** Whether the consciousness rail is currently galvanically isolated from shared bus */
  private consciousnessIsolated: boolean;
  /** Whether the consciousness rail is online */
  private consciousnessOnline: boolean;
  /** Consciousness battery charge percent (0–100) */
  private batteryPercent: number;
  /** Whether the motor bus is online */
  private motorOnline: boolean;
  /** Simulated motor current (A) */
  private motorCurrentA: number;
  /** Timestamp when isolation was last engaged (for battery drain simulation) */
  private isolationStartMs: number | null;

  constructor(
    config: Partial<PowerIsolationConfig> = {},
    private readonly clock: PowerIsolationClock = SYSTEM_CLOCK,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start in a fully connected, fully charged nominal state
    this.consciousnessIsolated = false;
    this.consciousnessOnline = true;
    this.batteryPercent = 100;
    this.motorOnline = true;
    this.motorCurrentA = 12.0; // nominal motor draw
    this.isolationStartMs = null;
  }

  // ── IPowerIsolation ────────────────────────────────────────────

  getConsciousnessPowerStatus(): PowerStatus {
    return {
      online: this.consciousnessOnline,
      voltageV: this.consciousnessOnline
        ? this.config.consciousnessNominalVoltageV
        : 0,
      currentA: this.consciousnessOnline
        ? this.config.consciousnessNominalCurrentA
        : 0,
      batteryPercent: this.currentBatteryPercent(),
      isolated: this.consciousnessIsolated,
    };
  }

  getMotorPowerStatus(): PowerStatus {
    return {
      online: this.motorOnline,
      voltageV: this.motorOnline ? this.config.motorNominalVoltageV : 0,
      currentA: this.motorOnline ? this.motorCurrentA : 0,
      batteryPercent: null, // motor bus is not battery-backed
      isolated: this.consciousnessIsolated, // isolated from consciousness rail when PIU active
    };
  }

  /**
   * Returns the estimated remaining runtime on internal battery in milliseconds.
   * Assumes battery drains linearly from full to 0 over `batteryRuntimeMinutes`.
   */
  getBackupRemaining(): Duration {
    const pct = this.currentBatteryPercent();
    if (pct === null) return 0;
    const totalMs = this.config.batteryRuntimeMinutes * 60 * 1000;
    return Math.round((pct / 100) * totalMs);
  }

  /**
   * Galvanically disconnect the consciousness rail from the shared power bus,
   * switching to internal UPS battery. Protects against motor fault propagation.
   */
  isolateConsciousnessPower(): void {
    if (!this.consciousnessIsolated) {
      this.consciousnessIsolated = true;
      this.isolationStartMs = this.clock.nowMs();
    }
  }

  /**
   * Reconnect the consciousness rail to the shared power bus and stop
   * drawing from internal battery. Only safe when shared bus is stable.
   */
  reconnect(): void {
    if (this.consciousnessIsolated) {
      // Accumulate battery drain before reconnecting
      this.batteryPercent = this.currentBatteryPercent() ?? 100;
      this.consciousnessIsolated = false;
      this.isolationStartMs = null;
    }
  }

  // ── Test / simulation helpers ──────────────────────────────────

  /** Simulate motor bus failure (e.g., short circuit) */
  simulateMotorBusFault(): void {
    this.motorOnline = false;
    this.motorCurrentA = 0;
  }

  /** Restore motor bus to nominal state */
  restoreMotorBus(): void {
    this.motorOnline = true;
    this.motorCurrentA = 12.0;
  }

  /** Directly set battery charge level (for test setup) */
  setBatteryPercent(percent: number): void {
    this.batteryPercent = Math.max(0, Math.min(100, percent));
    // Reset isolation start to prevent double-draining
    if (this.consciousnessIsolated) {
      this.isolationStartMs = this.clock.nowMs();
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Compute current battery percent, accounting for elapsed drain time
   * if the unit is currently running on battery.
   */
  private currentBatteryPercent(): number {
    if (!this.consciousnessIsolated || this.isolationStartMs === null) {
      return this.batteryPercent;
    }

    const elapsedMs = this.clock.nowMs() - this.isolationStartMs;
    const totalMs = this.config.batteryRuntimeMinutes * 60 * 1000;
    const drainedPercent = (elapsedMs / totalMs) * 100;
    return Math.max(0, this.batteryPercent - drainedPercent);
  }
}
