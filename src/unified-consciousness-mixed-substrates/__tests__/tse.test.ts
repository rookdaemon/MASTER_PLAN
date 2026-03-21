/**
 * Temporal Synchronization Engine (TSE) — Unit Tests
 *
 * Covers:
 *   - Contract: TSE preconditions, postconditions, and invariants
 *   - Behavioral Spec: "TSE adaptive buffer overflow signals fragmentation"
 *   - Decision D1: Biology-first timing (TSE never forces biological timing)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TemporalSynchronizationEngine, type TSEConfig } from "../tse.js";
import {
  FrequencyBand,
  SyncMode,
  CorrectionMode,
  InterpolationMode,
  OverflowPolicy,
  Severity,
  type NeuralPopulation,
  type SyncPulse,
  type FragmentationAlert,
} from "../types.js";

// ── Test Helpers ────────────────────────────────────────────────────────────

function makeSource(): NeuralPopulation {
  return {
    regionId: "cortex-v1",
    neuronCount: 10000,
    dominantFrequencyHz: 40,
  };
}

function makeConfig(overrides: Partial<TSEConfig> = {}): TSEConfig {
  return {
    targetBands: [FrequencyBand.Gamma],
    syncMode: SyncMode.PhaseLocked,
    bufferCapacityMs: 50,
    overflowPolicy: OverflowPolicy.SignalFragmentation,
    maxDriftMs: 5,
    correctionStrategy: CorrectionMode.Stretch,
    source: makeSource(),
    targetPhaseOffset: 0,
    interpolationMode: InterpolationMode.Linear,
    ...overrides,
  };
}

// ── Construction ────────────────────────────────────────────────────────────

describe("TemporalSynchronizationEngine", () => {
  let tse: TemporalSynchronizationEngine;

  beforeEach(() => {
    tse = new TemporalSynchronizationEngine(makeConfig());
  });

  describe("construction", () => {
    it("initializes with the configured target bands", () => {
      const tracker = tse.getTracker();
      expect(tracker.targetBands).toEqual([FrequencyBand.Gamma]);
    });

    it("initializes with the configured sync mode", () => {
      const controller = tse.getSyncController();
      expect(controller.mode).toBe(SyncMode.PhaseLocked);
    });

    it("initializes with an empty buffer", () => {
      const buffer = tse.getBuffer();
      expect(buffer.currentFillMs).toBe(0);
    });

    it("initializes with configured buffer capacity", () => {
      const buffer = tse.getBuffer();
      expect(buffer.capacityMs).toBe(50);
    });

    it("initializes tracker confidence at 0 (no data yet)", () => {
      const tracker = tse.getTracker();
      expect(tracker.confidence).toBe(0);
    });

    it("initializes with the configured source neural population", () => {
      const tracker = tse.getTracker();
      expect(tracker.source.regionId).toBe("cortex-v1");
    });
  });

  // ── Contract Precondition Guards ────────────────────────────────────────

  describe("precondition guards", () => {
    it("requires at least one target band", () => {
      expect(
        () => new TemporalSynchronizationEngine(makeConfig({ targetBands: [] }))
      ).toThrow(/band/i);
    });

    it("requires a valid sync mode", () => {
      // SyncMode must be one of the enum values; this tests constructor validation
      const config = makeConfig();
      config.syncMode = "INVALID" as SyncMode;
      expect(() => new TemporalSynchronizationEngine(config)).toThrow(
        /mode/i
      );
    });
  });

  // ── Postcondition: OscillationTracker provides phase & frequency ──────

  describe("oscillation tracking", () => {
    it("updates phase estimate from neural oscillation input", () => {
      tse.updateOscillation(Math.PI, 40, 1000);
      const tracker = tse.getTracker();
      expect(tracker.phaseEstimate).toBeCloseTo(Math.PI, 2);
    });

    it("updates frequency estimate from neural oscillation input", () => {
      tse.updateOscillation(0, 42, 1000);
      const tracker = tse.getTracker();
      expect(tracker.frequencyEstimateHz).toBeCloseTo(42, 1);
    });

    it("increases confidence after receiving oscillation data", () => {
      tse.updateOscillation(0, 40, 1000);
      const tracker = tse.getTracker();
      expect(tracker.confidence).toBeGreaterThan(0);
    });

    it("builds confidence with multiple consistent updates", () => {
      tse.updateOscillation(0, 40, 1000);
      const c1 = tse.getTracker().confidence;
      tse.updateOscillation(Math.PI, 40, 1012.5);
      const c2 = tse.getTracker().confidence;
      tse.updateOscillation(0, 40, 1025);
      const c3 = tse.getTracker().confidence;
      expect(c2).toBeGreaterThanOrEqual(c1);
      expect(c3).toBeGreaterThanOrEqual(c2);
    });
  });

  // ── Postcondition: SyncController emits SyncPulse at tracked frequency ──

  describe("sync pulse emission", () => {
    it("emits a SyncPulse based on the tracked oscillation", () => {
      tse.updateOscillation(0, 40, 1000);
      const pulse = tse.emitSyncPulse(1000);
      expect(pulse).not.toBeNull();
      expect(pulse!.frequencyHz).toBeCloseTo(40, 1);
      expect(pulse!.sourceRegionId).toBe("cortex-v1");
    });

    it("SyncPulse timestamp matches the provided nowMs", () => {
      tse.updateOscillation(0, 40, 1000);
      const pulse = tse.emitSyncPulse(1005);
      expect(pulse!.timestampMs).toBe(1005);
    });

    it("SyncPulse phase reflects current tracked phase", () => {
      tse.updateOscillation(1.5, 40, 1000);
      const pulse = tse.emitSyncPulse(1000);
      expect(pulse!.phase).toBeCloseTo(1.5, 2);
    });

    it("returns null if no oscillation data has been received", () => {
      const pulse = tse.emitSyncPulse(1000);
      expect(pulse).toBeNull();
    });
  });

  // ── Postcondition: AdaptiveBuffer absorbs jitter ──────────────────────

  describe("adaptive buffer", () => {
    it("accepts data within buffer capacity", () => {
      const accepted = tse.bufferData(10, 1000);
      expect(accepted).toBe(true);
      expect(tse.getBuffer().currentFillMs).toBe(10);
    });

    it("accumulates buffered data", () => {
      tse.bufferData(10, 1000);
      tse.bufferData(15, 1010);
      expect(tse.getBuffer().currentFillMs).toBe(25);
    });

    it("drains buffer when data is consumed", () => {
      tse.bufferData(20, 1000);
      tse.drainBuffer(10);
      expect(tse.getBuffer().currentFillMs).toBe(10);
    });

    it("does not drain below zero", () => {
      tse.bufferData(5, 1000);
      tse.drainBuffer(10);
      expect(tse.getBuffer().currentFillMs).toBe(0);
    });
  });

  // ── Postcondition: Phase drift within maxDriftMs ──────────────────────

  describe("phase drift tracking", () => {
    it("reports phase drift between synthetic and biological timing", () => {
      tse.updateOscillation(0, 40, 1000);
      const drift = tse.getPhaseDriftMs(1002); // 2ms synthetic offset
      expect(typeof drift).toBe("number");
    });

    it("drift stays within maxDriftMs under normal conditions", () => {
      tse.updateOscillation(0, 40, 1000);
      const drift = tse.getPhaseDriftMs(1001);
      const controller = tse.getSyncController();
      expect(Math.abs(drift)).toBeLessThanOrEqual(controller.maxDriftMs);
    });
  });

  // ── Invariant: Low confidence triggers mode fallback ──────────────────

  describe("confidence-based mode fallback", () => {
    it("degrades from PHASE_LOCKED to ADAPTIVE_BUFFER when confidence < 0.5", () => {
      // Feed noisy, inconsistent oscillation data to reduce confidence
      tse.updateOscillation(0, 40, 1000);
      tse.setTrackerConfidence(0.4); // simulate low confidence
      tse.evaluateConfidence();

      const controller = tse.getSyncController();
      expect(controller.mode).not.toBe(SyncMode.PhaseLocked);
      expect([SyncMode.AdaptiveBuffer, SyncMode.FreeRunning]).toContain(
        controller.mode
      );
    });

    it("maintains PHASE_LOCKED when confidence >= 0.5", () => {
      tse.updateOscillation(0, 40, 1000);
      tse.setTrackerConfidence(0.7);
      tse.evaluateConfidence();

      const controller = tse.getSyncController();
      expect(controller.mode).toBe(SyncMode.PhaseLocked);
    });
  });

  // ── Invariant: TSE never forces biological timing to change ───────────

  describe("biology-first timing invariant (D1)", () => {
    it("updateOscillation is read-only — does not return modification commands", () => {
      // The method signature accepts data FROM biology, never sends commands TO biology
      const result = tse.updateOscillation(0, 40, 1000);
      expect(result).toBeUndefined();
    });

    it("the source neural population is never modified by TSE operations", () => {
      const sourceBefore = { ...tse.getTracker().source };
      tse.updateOscillation(0, 40, 1000);
      tse.updateOscillation(Math.PI, 42, 1025);
      tse.emitSyncPulse(1025);
      const sourceAfter = tse.getTracker().source;
      expect(sourceAfter).toEqual(sourceBefore);
    });
  });

  // ── Behavioral Spec: TSE adaptive buffer overflow signals fragmentation ──

  describe("adaptive buffer overflow signals fragmentation", () => {
    let alertCallback: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      tse = new TemporalSynchronizationEngine(
        makeConfig({
          bufferCapacityMs: 20,
          overflowPolicy: OverflowPolicy.SignalFragmentation,
          syncMode: SyncMode.PhaseLocked,
        })
      );
      alertCallback = vi.fn();
      tse.onFragmentationAlert(alertCallback);
    });

    it("triggers a FragmentationAlert when buffer overflows with SIGNAL_FRAGMENTATION policy", () => {
      tse.bufferData(15, 1000);
      tse.bufferData(10, 1010); // 15 + 10 = 25 > capacity 20

      expect(alertCallback).toHaveBeenCalledTimes(1);
      const alert: FragmentationAlert = alertCallback.mock.calls[0][0];
      expect(alert).toBeDefined();
    });

    it("the overflow alert severity is at least WARNING", () => {
      tse.bufferData(15, 1000);
      tse.bufferData(10, 1010); // overflow

      const alert: FragmentationAlert = alertCallback.mock.calls[0][0];
      expect([Severity.Warning, Severity.Critical, Severity.Emergency]).toContain(
        alert.severity
      );
    });

    it("the SyncController mode degrades from PHASE_LOCKED on overflow", () => {
      expect(tse.getSyncController().mode).toBe(SyncMode.PhaseLocked);

      tse.bufferData(15, 1000);
      tse.bufferData(10, 1010); // overflow

      const controller = tse.getSyncController();
      expect(controller.mode).not.toBe(SyncMode.PhaseLocked);
      expect([SyncMode.AdaptiveBuffer, SyncMode.FreeRunning]).toContain(
        controller.mode
      );
    });

    it("does not trigger alert when buffer has space", () => {
      tse.bufferData(10, 1000); // 10 <= 20

      expect(alertCallback).not.toHaveBeenCalled();
    });

    it("does not trigger alert with DROP_OLDEST policy on overflow", () => {
      const dropTse = new TemporalSynchronizationEngine(
        makeConfig({
          bufferCapacityMs: 20,
          overflowPolicy: OverflowPolicy.DropOldest,
        })
      );
      const dropCallback = vi.fn();
      dropTse.onFragmentationAlert(dropCallback);

      dropTse.bufferData(15, 1000);
      dropTse.bufferData(10, 1010); // overflow but DROP_OLDEST

      expect(dropCallback).not.toHaveBeenCalled();
    });
  });

  // ── Invariant: Buffer overflow with SignalFragmentation → FragmentationAlert via UMI ──

  describe("overflow policy variants", () => {
    it("DROP_OLDEST policy drops oldest data on overflow", () => {
      const dropTse = new TemporalSynchronizationEngine(
        makeConfig({
          bufferCapacityMs: 20,
          overflowPolicy: OverflowPolicy.DropOldest,
        })
      );

      dropTse.bufferData(15, 1000);
      dropTse.bufferData(10, 1010); // overflow → drop oldest to make room

      // Buffer should not exceed capacity
      expect(dropTse.getBuffer().currentFillMs).toBeLessThanOrEqual(20);
    });

    it("COMPRESS policy compresses data on overflow", () => {
      const compressTse = new TemporalSynchronizationEngine(
        makeConfig({
          bufferCapacityMs: 20,
          overflowPolicy: OverflowPolicy.Compress,
        })
      );

      compressTse.bufferData(15, 1000);
      compressTse.bufferData(10, 1010); // overflow → compress

      // Buffer should not exceed capacity
      expect(compressTse.getBuffer().currentFillMs).toBeLessThanOrEqual(20);
    });
  });
});
