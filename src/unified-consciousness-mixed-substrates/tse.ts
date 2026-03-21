/**
 * Temporal Synchronization Engine (TSE)
 *
 * Manages real-time alignment between synthetic computation cycles and
 * biological neural oscillations. Implements biology-first timing (D1):
 * the synthetic substrate continuously tracks biological neural oscillations
 * and synchronizes its computation cycles to match. Biology sets the pace;
 * synthetic side absorbs jitter via adaptive buffering.
 *
 * Three sub-components:
 *   - OscillationTracker: monitors biological oscillations for phase & frequency
 *   - SyncController: adjusts synthetic timing to maintain phase alignment
 *   - AdaptiveBuffer: absorbs jitter without exceeding capacity
 *
 * See: docs/unified-consciousness-mixed-substrates/ARCHITECTURE.md §2
 */

import {
  SyncMode,
  OverflowPolicy,
  Severity,
  RecoveryActionType,
  type OscillationTracker,
  type SyncController,
  type AdaptiveBuffer,
  type NeuralPopulation,
  type SyncPulse,
  type FragmentationAlert,
  type FrequencyBand,
  type CorrectionMode,
  type InterpolationMode,
  type MetricType,
} from "./types.js";

// ── TSE Configuration ────────────────────────────────────────────────────────

export interface TSEConfig {
  targetBands: FrequencyBand[];
  syncMode: SyncMode;
  bufferCapacityMs: number;
  overflowPolicy: OverflowPolicy;
  maxDriftMs: number;
  correctionStrategy: CorrectionMode;
  source: NeuralPopulation;
  targetPhaseOffset: number;
  interpolationMode: InterpolationMode;
}

// ── Valid sync modes for precondition check ───────────────────────────────────

const VALID_SYNC_MODES = new Set<string>([
  SyncMode.PhaseLocked,
  SyncMode.AdaptiveBuffer,
  SyncMode.FreeRunning,
]);

// ── Temporal Synchronization Engine ──────────────────────────────────────────

export class TemporalSynchronizationEngine {
  private _tracker: OscillationTracker;
  private _controller: SyncController;
  private _buffer: AdaptiveBuffer;
  private _config: TSEConfig;
  private _hasOscillationData = false;
  private _lastOscillationTimestampMs: number | null = null;
  private _alertCallbacks: Array<(alert: FragmentationAlert) => void> = [];

  constructor(config: TSEConfig) {
    // ── Precondition: at least one target band ──
    if (config.targetBands.length === 0) {
      throw new Error("TSE requires at least one target frequency band");
    }

    // ── Precondition: valid sync mode ──
    if (!VALID_SYNC_MODES.has(config.syncMode)) {
      throw new Error(`Invalid sync mode: ${config.syncMode}`);
    }

    this._config = config;

    this._tracker = {
      targetBands: [...config.targetBands],
      phaseEstimate: 0,
      frequencyEstimateHz: 0,
      confidence: 0,
      source: { ...config.source },
    };

    this._controller = {
      mode: config.syncMode,
      targetPhaseOffset: config.targetPhaseOffset,
      maxDriftMs: config.maxDriftMs,
      correctionStrategy: config.correctionStrategy,
    };

    this._buffer = {
      capacityMs: config.bufferCapacityMs,
      currentFillMs: 0,
      interpolationMode: config.interpolationMode,
      overflowPolicy: config.overflowPolicy,
    };
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** Returns a snapshot of the current oscillation tracker state. */
  getTracker(): OscillationTracker {
    return { ...this._tracker, source: { ...this._tracker.source } };
  }

  /** Returns a snapshot of the current sync controller state. */
  getSyncController(): SyncController {
    return { ...this._controller };
  }

  /** Returns a snapshot of the current adaptive buffer state. */
  getBuffer(): AdaptiveBuffer {
    return { ...this._buffer };
  }

  // ── Oscillation Tracking ───────────────────────────────────────────────────

  /**
   * Update the tracker with a new biological oscillation observation.
   * This is read-only with respect to biology — it only records what
   * biology is doing, never sends commands back.
   *
   * @param phase - Current phase angle (radians, 0–2π)
   * @param frequencyHz - Instantaneous frequency estimate (Hz)
   * @param timestampMs - Timestamp of the observation (injectable)
   */
  updateOscillation(phase: number, frequencyHz: number, timestampMs: number): void {
    this._tracker.phaseEstimate = phase;
    this._tracker.frequencyEstimateHz = frequencyHz;
    this._lastOscillationTimestampMs = timestampMs;
    this._hasOscillationData = true;

    // Build confidence incrementally (capped at 1.0)
    const increment = 0.3;
    this._tracker.confidence = Math.min(1.0, this._tracker.confidence + increment);
  }

  /**
   * Directly set the tracker confidence (for simulation/testing).
   */
  setTrackerConfidence(confidence: number): void {
    this._tracker.confidence = Math.max(0, Math.min(1.0, confidence));
  }

  /**
   * Evaluate current tracker confidence and degrade sync mode if needed.
   *
   * Invariant: confidence < 0.5 triggers a mode fallback from
   * PHASE_LOCKED to ADAPTIVE_BUFFER or FREE_RUNNING.
   */
  evaluateConfidence(): void {
    if (this._tracker.confidence < 0.5) {
      if (this._controller.mode === SyncMode.PhaseLocked) {
        this._controller.mode = SyncMode.AdaptiveBuffer;
      }
    }
  }

  // ── Sync Pulse Emission ────────────────────────────────────────────────────

  /**
   * Emit a SyncPulse based on the current tracked oscillation state.
   * Returns null if no oscillation data has been received yet.
   *
   * @param nowMs - Current timestamp (injectable for testability)
   */
  emitSyncPulse(nowMs: number): SyncPulse | null {
    if (!this._hasOscillationData) {
      return null;
    }

    return {
      sourceRegionId: this._tracker.source.regionId,
      phase: this._tracker.phaseEstimate,
      frequencyHz: this._tracker.frequencyEstimateHz,
      timestampMs: nowMs,
    };
  }

  // ── Adaptive Buffer ────────────────────────────────────────────────────────

  /**
   * Buffer incoming data. Returns true if accepted within capacity.
   * On overflow, applies the configured overflow policy.
   *
   * @param durationMs - Duration of data to buffer (ms)
   * @param timestampMs - Timestamp of the data arrival (injectable)
   * @returns true if data was accepted, false if overflow occurred
   */
  bufferData(durationMs: number, timestampMs: number): boolean {
    const newFill = this._buffer.currentFillMs + durationMs;

    if (newFill <= this._buffer.capacityMs) {
      this._buffer.currentFillMs = newFill;
      return true;
    }

    // Overflow — apply policy
    switch (this._buffer.overflowPolicy) {
      case OverflowPolicy.SignalFragmentation:
        // Accept the data (buffer overflows) and signal fragmentation
        this._buffer.currentFillMs = newFill;
        this._signalBufferOverflow(timestampMs);
        return true;

      case OverflowPolicy.DropOldest:
        // Drop oldest data to make room for new data
        this._buffer.currentFillMs = Math.min(durationMs, this._buffer.capacityMs);
        return true;

      case OverflowPolicy.Compress:
        // Compress existing data to fit new data
        this._buffer.currentFillMs = Math.min(newFill * 0.8, this._buffer.capacityMs);
        return true;

      default:
        this._buffer.currentFillMs = newFill;
        return true;
    }
  }

  /**
   * Drain data from the buffer. Does not drain below zero.
   *
   * @param durationMs - Amount of data to drain (ms)
   */
  drainBuffer(durationMs: number): void {
    this._buffer.currentFillMs = Math.max(0, this._buffer.currentFillMs - durationMs);
  }

  // ── Phase Drift Tracking ───────────────────────────────────────────────────

  /**
   * Compute the phase drift between synthetic timing and biological timing.
   *
   * @param syntheticTimestampMs - Current synthetic timestamp (injectable)
   * @returns Phase drift in milliseconds
   */
  getPhaseDriftMs(syntheticTimestampMs: number): number {
    if (this._lastOscillationTimestampMs === null) {
      return 0;
    }
    return syntheticTimestampMs - this._lastOscillationTimestampMs;
  }

  // ── Alert Registration ─────────────────────────────────────────────────────

  /**
   * Register a callback to receive FragmentationAlerts from buffer overflow
   * or other TSE-detected fragmentation conditions.
   */
  onFragmentationAlert(callback: (alert: FragmentationAlert) => void): void {
    this._alertCallbacks.push(callback);
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Signal a buffer overflow as a fragmentation event.
   * Degrades sync mode and emits a FragmentationAlert.
   */
  private _signalBufferOverflow(timestampMs: number): void {
    // Degrade sync mode
    if (this._controller.mode === SyncMode.PhaseLocked) {
      this._controller.mode = SyncMode.AdaptiveBuffer;
    } else if (this._controller.mode === SyncMode.AdaptiveBuffer) {
      this._controller.mode = SyncMode.FreeRunning;
    }

    const alert: FragmentationAlert = {
      severity: Severity.Warning,
      metricSnapshot: {
        metricType: "BINDING_COHERENCE" as unknown as MetricType,
        value: 0,
        timestampMs,
        confidenceInterval: [0, 0],
        substrateCoverage: {
          biologicalRegions: [this._tracker.source.regionId],
          syntheticNodes: [],
          coverageFraction: 0,
        },
      },
      affectedChannels: [],
      recommendedAction: RecoveryActionType.Resync,
      timestampMs,
    };

    for (const callback of this._alertCallbacks) {
      callback(alert);
    }
  }
}
