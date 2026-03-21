/**
 * Radiation-Aware Runtime — Implementation
 *
 * Layer 3 of the radiation-hardened computation architecture.
 * Monitors ambient radiation flux, classifies alert levels, and orchestrates
 * safe mode entry/exit with hold-off timing.
 *
 * See: plan/0.2.1.1.2-radiation-aware-runtime.md (Contracts, Decisions, Behavioral Spec)
 */

import {
  AlertLevel,
  type Clock,
  type FluxMeasurement,
  type FluxSource,
  type RadiationAwareRuntime,
  type RuntimeConfig,
  type SafeModeListener,
} from "./types.js";

// ── Threshold Registry Constants ────────────────────────────────────────────
// Named constants from the Threshold Registry — no unregistered magic numbers.

/** Default elevated flux threshold: 100 particles/cm²/s */
const DEFAULT_ELEVATED_THRESHOLD = 100;
/** Default storm flux threshold: 10⁵ particles/cm²/s */
const DEFAULT_STORM_THRESHOLD = 100_000;
/** Default nominal scrub rate: 1 scan/second */
const DEFAULT_NOMINAL_SCRUB_RATE = 1;
/** Default burst scrub multiplier: 10× */
const DEFAULT_BURST_SCRUB_MULTIPLIER = 10;
/** Default monitor interval: 1000 ms */
const DEFAULT_MONITOR_INTERVAL_MS = 1000;
/** Default hold-off duration: 300000 ms (5 minutes) */
const DEFAULT_HOLD_OFF_DURATION_MS = 300_000;
/** Default safe mode entry timeout: 5000 ms */
const DEFAULT_SAFE_MODE_ENTRY_TIMEOUT_MS = 5000;

export class RadiationAwareRuntimeImpl implements RadiationAwareRuntime {
  private readonly _fluxSource: FluxSource;
  private readonly _config: RuntimeConfig;
  private readonly _clock: Clock;

  private _alertLevel: AlertLevel = AlertLevel.Nominal;
  private _safeMode: boolean = false;
  private _lastFlux: FluxMeasurement | null = null;

  private _entryListeners: SafeModeListener[] = [];
  private _exitListeners: SafeModeListener[] = [];

  /** Timestamp (from Clock) when hold-off period began, or null if not in hold-off */
  private _holdOffStart: number | null = null;

  constructor(fluxSource: FluxSource, config: RuntimeConfig, clock: Clock) {
    // ── Constructor Precondition Guards ────────────────────────────────
    if (!fluxSource) {
      throw new Error("fluxSource must be provided (non-null)");
    }
    if (!clock) {
      throw new Error("clock must be provided (non-null)");
    }
    if (config.elevatedThreshold_particlesPerCm2PerSec <= 0) {
      throw new Error("elevatedThreshold must be > 0");
    }
    if (config.stormThreshold_particlesPerCm2PerSec <= 0) {
      throw new Error("stormThreshold must be > 0");
    }
    if (config.elevatedThreshold_particlesPerCm2PerSec >= config.stormThreshold_particlesPerCm2PerSec) {
      throw new Error("elevatedThreshold must be < stormThreshold");
    }
    if (config.monitorInterval_ms <= 0) {
      throw new Error("monitorInterval_ms must be > 0");
    }
    if (config.holdOffDuration_ms <= 0) {
      throw new Error("holdOffDuration_ms must be > 0");
    }
    if (config.nominalScrubRate <= 0) {
      throw new Error("nominalScrubRate must be > 0");
    }
    if (config.burstScrubMultiplier < 1) {
      throw new Error("burstScrubMultiplier must be >= 1");
    }

    this._fluxSource = fluxSource;
    this._config = config;
    this._clock = clock;
  }

  // ── Query Methods (Postconditions) ──────────────────────────────────────

  alertLevel(): AlertLevel {
    return this._alertLevel;
  }

  scrubRate(): number {
    if (this._safeMode) {
      return this._config.nominalScrubRate * this._config.burstScrubMultiplier;
    }
    return this._config.nominalScrubRate;
  }

  isInSafeMode(): boolean {
    return this._safeMode;
  }

  currentFlux(): FluxMeasurement {
    if (this._lastFlux === null) {
      // Before first evaluation, return zero-flux measurement
      return { particlesPerCm2PerSec: 0, particleType: "proton" as any, energy_MeV: 1 };
    }
    return this._lastFlux;
  }

  // ── Listener Registration ───────────────────────────────────────────────

  onSafeModeEntry(listener: SafeModeListener): void {
    this._entryListeners.push(listener);
  }

  onSafeModeExit(listener: SafeModeListener): void {
    this._exitListeners.push(listener);
  }

  // ── Core Evaluation ─────────────────────────────────────────────────────

  evaluateFlux(): void {
    const measurement = this._fluxSource.readFlux();
    this._lastFlux = measurement;
    const flux = measurement.particlesPerCm2PerSec;
    const now = this._clock.now();

    // Classify raw alert level from flux thresholds
    const rawLevel = this._classifyFlux(flux);

    const previousLevel = this._alertLevel;

    // ── State transition logic ──────────────────────────────────────────
    // Decision: Emergency direct NOMINAL → STORM is allowed (escalation).
    // Decision: STORM → NOMINAL is forbidden (must de-escalate through ELEVATED with hold-off).

    if (previousLevel === AlertLevel.Storm) {
      // De-escalation from STORM
      if (rawLevel === AlertLevel.Storm) {
        // Still in STORM — reset any hold-off
        this._holdOffStart = null;
        // Stay in STORM, safe mode remains active
      } else {
        // Flux dropped below storm threshold → transition to ELEVATED
        // (STORM → NOMINAL forbidden; always go through ELEVATED)
        this._alertLevel = AlertLevel.Elevated;
        if (this._holdOffStart === null) {
          this._holdOffStart = now;
        }
        // Safe mode remains active during hold-off
      }
    } else if (previousLevel === AlertLevel.Elevated && this._safeMode) {
      // We're in ELEVATED during hold-off (de-escalating from STORM)
      if (rawLevel === AlertLevel.Storm) {
        // Flux spiked back up — return to STORM, reset hold-off
        this._alertLevel = AlertLevel.Storm;
        this._holdOffStart = null;
        // Safe mode remains active, no listeners invoked (never exited)
      } else {
        // Still below storm threshold during hold-off
        // Check if hold-off has expired
        if (this._holdOffStart !== null && (now - this._holdOffStart) >= this._config.holdOffDuration_ms) {
          // Hold-off complete — exit safe mode, transition to actual level
          this._alertLevel = rawLevel; // NOMINAL or ELEVATED based on current flux
          this._invokeExitListeners();
          this._safeMode = false;
          this._holdOffStart = null;
        } else {
          // Hold-off still running — stay in ELEVATED with safe mode active
          this._alertLevel = AlertLevel.Elevated;
        }
      }
    } else {
      // Normal operation (not in safe mode, not de-escalating)
      this._alertLevel = rawLevel;

      // If transitioning to STORM, enter safe mode
      if (rawLevel === AlertLevel.Storm && previousLevel !== AlertLevel.Storm) {
        this._invokeEntryListeners();
        this._safeMode = true;
      }
    }
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /** Classify flux into alert level based on threshold registry values */
  private _classifyFlux(flux: number): AlertLevel {
    if (flux >= this._config.stormThreshold_particlesPerCm2PerSec) {
      return AlertLevel.Storm;
    }
    if (flux >= this._config.elevatedThreshold_particlesPerCm2PerSec) {
      return AlertLevel.Elevated;
    }
    return AlertLevel.Nominal;
  }

  /** Invoke entry listeners in registration order */
  private _invokeEntryListeners(): void {
    for (const listener of this._entryListeners) {
      listener();
    }
  }

  /** Invoke exit listeners in reverse registration order */
  private _invokeExitListeners(): void {
    for (let i = this._exitListeners.length - 1; i >= 0; i--) {
      this._exitListeners[i]();
    }
  }
}
