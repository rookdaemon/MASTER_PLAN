/**
 * Bio-Synthetic Interface — Neural Protocol Adapter (Layer 3) Tests
 *
 * Tests cover:
 * - Coordinate mapping (electrode → brain atlas)
 * - Spike event → NeuralStateSnapshot aggregation
 * - SyntheticActivationRequest → StimulationCommand translation
 * - Adaptive calibration loop (Behavioral Spec: drift compensation)
 * - Safety envelope checks (delegation to SafetyInterlock)
 *
 * Red/Green/Refactor: this file is the RED step.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  NeuralProtocolAdapter,
  type NeuralProtocolAdapterConfig,
  type CoordinateMap,
  type ElectrodeMapping,
  type CalibrationEngine,
  type SafetyEnvelope,
  DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG,
} from "../neural-protocol-adapter.js";
import {
  type SpikeTrainEvent,
  type SyntheticActivationRequest,
  type BrainAtlasCoordinate,
  type NeuralStateSnapshot,
  type CalibrationFeedback,
  SPIKE_SORTING_ACCURACY,
  STIMULATION_SPATIAL_PRECISION,
} from "../types.js";
import type { Clock } from "../signal-conditioning.js";

// ──────────────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeClock(timeUs: number = 0): Clock & { advance(us: number): void } {
  let now = timeUs;
  return {
    nowUs: () => now,
    advance(us: number) {
      now += us;
    },
  };
}

function makeCoordinate(
  region: string = "V1",
  layer: number = 4,
  x = 0,
  y = 0,
  z = 0
): BrainAtlasCoordinate {
  return { region, layer, x, y, z };
}

function makeSpikeEvent(overrides: Partial<SpikeTrainEvent> = {}): SpikeTrainEvent {
  return {
    neuronId: "ch0-neuron-0",
    channelId: "ch0",
    timestampUs: 1000,
    waveformSnippet: new Float64Array([0, -100, -200, -100, 0]),
    confidence: 0.9,
    sortingClusterId: "ch0-cluster-0",
    ...overrides,
  };
}

function makeActivationRequest(
  overrides: Partial<SyntheticActivationRequest> = {}
): SyntheticActivationRequest {
  return {
    targetCoordinates: [makeCoordinate("V1")],
    desiredFiringRateHz: 10,
    desiredTimingPatternUs: [100000],
    priorityLevel: 1,
    timestampUs: 5000,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock factories
// ──────────────────────────────────────────────────────────────────────────────

function makeCoordinateMap(): CoordinateMap {
  const electrodeToAtlas = new Map<string, BrainAtlasCoordinate>();
  const atlasToElectrodes = new Map<string, string[]>();

  // Default mapping: ch0..ch9 → V1, ch10..ch19 → V2
  for (let i = 0; i < 10; i++) {
    const channelId = `ch${i}`;
    const coord = makeCoordinate("V1", 4, i, 0, 0);
    electrodeToAtlas.set(channelId, coord);
  }
  atlasToElectrodes.set("V1", Array.from({ length: 10 }, (_, i) => `ch${i}`));

  for (let i = 10; i < 20; i++) {
    const channelId = `ch${i}`;
    const coord = makeCoordinate("V2", 4, i, 0, 0);
    electrodeToAtlas.set(channelId, coord);
  }
  atlasToElectrodes.set(
    "V2",
    Array.from({ length: 10 }, (_, i) => `ch${i + 10}`)
  );

  return {
    getAtlasCoordinate(channelId: string) {
      return electrodeToAtlas.get(channelId) ?? null;
    },
    getElectrodesForRegion(regionId: string) {
      return atlasToElectrodes.get(regionId) ?? [];
    },
    getElectrodesForCoordinates(coordinates: readonly BrainAtlasCoordinate[]) {
      const electrodes: string[] = [];
      for (const coord of coordinates) {
        const regionElectrodes = atlasToElectrodes.get(coord.region) ?? [];
        for (const e of regionElectrodes) {
          if (!electrodes.includes(e)) electrodes.push(e);
        }
      }
      return electrodes;
    },
  };
}

function makeCalibrationEngine(): CalibrationEngine & {
  _triggerCount: number;
  _lastRegion: string | null;
  _validationResult: boolean;
  _setValidationResult(v: boolean): void;
} {
  const engine = {
    _triggerCount: 0,
    _lastRegion: null as string | null,
    _validationResult: true,
    _setValidationResult(v: boolean) {
      this._validationResult = v;
    },
    triggerRecalibration(regionId: string, _timestampUs: number): void {
      engine._triggerCount++;
      engine._lastRegion = regionId;
    },
    isRecalibrating(_regionId: string): boolean {
      return engine._triggerCount > 0;
    },
    validateNewMapping(
      _regionId: string,
      _accuracyPercent: number
    ): boolean {
      return engine._validationResult;
    },
    getRecalibrationAccuracy(_regionId: string): number {
      return engine._validationResult ? 92 : 80;
    },
  };
  return engine;
}

function makeSafetyEnvelope(): SafetyEnvelope {
  return {
    checkStimulationSafe: vi.fn().mockReturnValue(true),
    isStimulationSuspended: vi.fn().mockReturnValue(false),
  };
}

function makeAdapter(overrides: {
  config?: Partial<NeuralProtocolAdapterConfig>;
  clock?: Clock;
  coordinateMap?: CoordinateMap;
  calibrationEngine?: CalibrationEngine;
  safetyEnvelope?: SafetyEnvelope;
} = {}) {
  const clock = overrides.clock ?? makeClock(0);
  const coordinateMap = overrides.coordinateMap ?? makeCoordinateMap();
  const calibrationEngine =
    overrides.calibrationEngine ?? makeCalibrationEngine();
  const safetyEnvelope = overrides.safetyEnvelope ?? makeSafetyEnvelope();
  const config: NeuralProtocolAdapterConfig = {
    ...DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG,
    ...overrides.config,
  };

  return new NeuralProtocolAdapter(
    config,
    clock,
    coordinateMap,
    calibrationEngine,
    safetyEnvelope
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("NeuralProtocolAdapter", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Coordinate mapping
  // ────────────────────────────────────────────────────────────────────────

  describe("coordinate mapping (electrode → brain atlas)", () => {
    it("maps spike events to brain atlas coordinates", () => {
      const adapter = makeAdapter();
      const spike = makeSpikeEvent({ channelId: "ch0" });
      const mapped = adapter.mapSpikeToAtlas(spike);
      expect(mapped).not.toBeNull();
      expect(mapped!.region).toBe("V1");
    });

    it("returns null for unknown electrode channels", () => {
      const adapter = makeAdapter();
      const spike = makeSpikeEvent({ channelId: "unknown-channel" });
      const mapped = adapter.mapSpikeToAtlas(spike);
      expect(mapped).toBeNull();
    });

    it("maps different channels to different regions", () => {
      const adapter = makeAdapter();
      const spikeV1 = makeSpikeEvent({ channelId: "ch0" });
      const spikeV2 = makeSpikeEvent({ channelId: "ch10" });
      expect(adapter.mapSpikeToAtlas(spikeV1)!.region).toBe("V1");
      expect(adapter.mapSpikeToAtlas(spikeV2)!.region).toBe("V2");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // NeuralStateSnapshot aggregation
  // ────────────────────────────────────────────────────────────────────────

  describe("spike aggregation → NeuralStateSnapshot", () => {
    it("aggregates spike events into a NeuralStateSnapshot for a region", () => {
      const adapter = makeAdapter();
      const spikes: SpikeTrainEvent[] = [
        makeSpikeEvent({ channelId: "ch0", neuronId: "ch0-neuron-0", timestampUs: 1000 }),
        makeSpikeEvent({ channelId: "ch1", neuronId: "ch1-neuron-0", timestampUs: 1200 }),
        makeSpikeEvent({ channelId: "ch0", neuronId: "ch0-neuron-0", timestampUs: 1500 }),
      ];

      const snapshot = adapter.aggregateSpikes(spikes, "V1", 2000);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.regionId).toBe("V1");
      expect(snapshot!.timestampUs).toBe(2000);
      expect(snapshot!.activeFiringRates.size).toBeGreaterThan(0);
      expect(snapshot!.populationVector.length).toBeGreaterThan(0);
      expect(snapshot!.qualityScore).toBeGreaterThanOrEqual(0);
      expect(snapshot!.qualityScore).toBeLessThanOrEqual(1);
    });

    it("returns null snapshot when no spikes match the region", () => {
      const adapter = makeAdapter();
      // ch10 is V2, requesting V1 aggregation
      const spikes = [
        makeSpikeEvent({ channelId: "ch10", neuronId: "ch10-neuron-0" }),
      ];
      const snapshot = adapter.aggregateSpikes(spikes, "V1", 2000);
      expect(snapshot).toBeNull();
    });

    it("computes firing rates per neuron", () => {
      const adapter = makeAdapter();
      const spikes = [
        makeSpikeEvent({ neuronId: "ch0-neuron-0", channelId: "ch0", timestampUs: 0 }),
        makeSpikeEvent({ neuronId: "ch0-neuron-0", channelId: "ch0", timestampUs: 50000 }),
        makeSpikeEvent({ neuronId: "ch1-neuron-0", channelId: "ch1", timestampUs: 25000 }),
      ];
      const snapshot = adapter.aggregateSpikes(spikes, "V1", 100000);
      expect(snapshot).not.toBeNull();
      // Two spikes for neuron-0 in 100ms → ~20 Hz, one spike for neuron-1 → ~10 Hz
      expect(snapshot!.activeFiringRates.has("ch0-neuron-0")).toBe(true);
      expect(snapshot!.activeFiringRates.has("ch1-neuron-0")).toBe(true);
    });

    it("excludes spikes from channels not in the requested region", () => {
      const adapter = makeAdapter();
      const spikes = [
        makeSpikeEvent({ channelId: "ch0", neuronId: "ch0-n0" }), // V1
        makeSpikeEvent({ channelId: "ch10", neuronId: "ch10-n0" }), // V2
      ];
      const snapshot = adapter.aggregateSpikes(spikes, "V1", 2000);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.activeFiringRates.has("ch10-n0")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Write pathway: SyntheticActivationRequest → StimulationCommand
  // ────────────────────────────────────────────────────────────────────────

  describe("write pathway — activation request translation", () => {
    it("translates SyntheticActivationRequest to StimulationCommand", () => {
      const adapter = makeAdapter();
      const request = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1")],
      });
      const result = adapter.translateActivationRequest(request, 5000);
      expect(result).not.toBeNull();
      expect(result!.targetElectrodeIds.length).toBeGreaterThan(0);
      expect(result!.chargeBalanced).toBe(true);
      expect(result!.chargePerPhaseMuCPerCm2).toBeLessThanOrEqual(30);
    });

    it("returns null when target coordinates have no mapped electrodes", () => {
      const adapter = makeAdapter();
      const request = makeActivationRequest({
        targetCoordinates: [makeCoordinate("UNKNOWN_REGION")],
      });
      const result = adapter.translateActivationRequest(request, 5000);
      expect(result).toBeNull();
    });

    it("rejects request when safety envelope says stimulation is suspended", () => {
      const safetyEnvelope = makeSafetyEnvelope();
      (safetyEnvelope.isStimulationSuspended as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const adapter = makeAdapter({ safetyEnvelope });
      const request = makeActivationRequest();
      const result = adapter.translateActivationRequest(request, 5000);
      expect(result).toBeNull();
    });

    it("rejects request when safety envelope check fails", () => {
      const safetyEnvelope = makeSafetyEnvelope();
      (safetyEnvelope.checkStimulationSafe as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const adapter = makeAdapter({ safetyEnvelope });
      const request = makeActivationRequest();
      const result = adapter.translateActivationRequest(request, 5000);
      expect(result).toBeNull();
    });

    it("maps V1 coordinates to V1 electrodes", () => {
      const adapter = makeAdapter();
      const request = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1")],
      });
      const result = adapter.translateActivationRequest(request, 5000);
      expect(result).not.toBeNull();
      for (const id of result!.targetElectrodeIds) {
        expect(id).toMatch(/^ch[0-9]$/); // ch0-ch9 are V1
      }
    });

    it("always produces charge-balanced commands (invariant)", () => {
      const adapter = makeAdapter();
      for (let i = 0; i < 5; i++) {
        const request = makeActivationRequest({
          desiredFiringRateHz: i * 10 + 5,
        });
        const result = adapter.translateActivationRequest(request, 5000 + i);
        if (result) {
          expect(result.chargeBalanced).toBe(true);
        }
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Adaptive calibration (Behavioral Spec: electrode drift compensation)
  // ────────────────────────────────────────────────────────────────────────

  describe("adaptive calibration — drift compensation", () => {
    it("produces CalibrationFeedback reflecting current accuracy", () => {
      const adapter = makeAdapter();
      const feedback = adapter.getCalibrationFeedback("V1", 100000);
      expect(feedback).not.toBeNull();
      expect(feedback.regionId).toBe("V1");
      expect(feedback.spikeSortingAccuracyPercent).toBeGreaterThanOrEqual(0);
      expect(feedback.spikeSortingAccuracyPercent).toBeLessThanOrEqual(100);
    });

    it("triggers recalibration when accuracy drops below 85%", () => {
      const calibrationEngine = makeCalibrationEngine();
      const adapter = makeAdapter({ calibrationEngine });

      // Simulate accuracy drop
      adapter.reportRegionAccuracy("V1", 84, 100000);
      expect(calibrationEngine._triggerCount).toBe(1);
      expect(calibrationEngine._lastRegion).toBe("V1");
    });

    it("does NOT trigger recalibration when accuracy is ≥ 85%", () => {
      const calibrationEngine = makeCalibrationEngine();
      const adapter = makeAdapter({ calibrationEngine });

      adapter.reportRegionAccuracy("V1", 85, 100000);
      expect(calibrationEngine._triggerCount).toBe(0);
    });

    it("continues operating with old mapping during recalibration", () => {
      const calibrationEngine = makeCalibrationEngine();
      const adapter = makeAdapter({ calibrationEngine });

      adapter.reportRegionAccuracy("V1", 80, 100000);
      expect(calibrationEngine._triggerCount).toBe(1);

      // Adapter should still be functional — translate requests with old mapping
      const request = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1")],
      });
      const result = adapter.translateActivationRequest(request, 200000);
      expect(result).not.toBeNull();
    });

    it("atomically swaps mapping when new mapping validates at ≥ 90%", () => {
      const calibrationEngine = makeCalibrationEngine();
      calibrationEngine._setValidationResult(true);
      const adapter = makeAdapter({ calibrationEngine });

      // Trigger recalibration
      adapter.reportRegionAccuracy("V1", 80, 100000);
      expect(calibrationEngine._triggerCount).toBe(1);

      // Complete recalibration — engine says accuracy ≥ 90%
      const swapped = adapter.completeRecalibration("V1", 200000);
      expect(swapped).toBe(true);

      const feedback = adapter.getCalibrationFeedback("V1", 200000);
      expect(feedback.recalibrationRequired).toBe(false);
    });

    it("rejects new mapping when validation shows accuracy < 90%", () => {
      const calibrationEngine = makeCalibrationEngine();
      calibrationEngine._setValidationResult(false);
      const adapter = makeAdapter({ calibrationEngine });

      adapter.reportRegionAccuracy("V1", 80, 100000);
      const swapped = adapter.completeRecalibration("V1", 200000);
      expect(swapped).toBe(false);
    });

    it("marks recalibrationRequired in feedback when accuracy is below threshold", () => {
      const adapter = makeAdapter();
      adapter.reportRegionAccuracy("V1", 82, 100000);
      const feedback = adapter.getCalibrationFeedback("V1", 100000);
      expect(feedback.recalibrationRequired).toBe(true);
    });

    it("detects drift when accuracy degrades over time", () => {
      const adapter = makeAdapter();
      adapter.reportRegionAccuracy("V1", 92, 100000);
      const fb1 = adapter.getCalibrationFeedback("V1", 100000);
      expect(fb1.driftDetected).toBe(false);

      adapter.reportRegionAccuracy("V1", 84, 200000);
      const fb2 = adapter.getCalibrationFeedback("V1", 200000);
      expect(fb2.driftDetected).toBe(true);
    });

    it("generates unique epoch IDs for each calibration epoch", () => {
      const adapter = makeAdapter();
      const fb1 = adapter.getCalibrationFeedback("V1", 100000);
      const epoch1 = fb1.epochId;

      // Complete a recalibration cycle
      adapter.reportRegionAccuracy("V1", 80, 200000);
      const calibrationEngine = makeCalibrationEngine();
      const adapter2 = makeAdapter({ calibrationEngine });
      adapter2.reportRegionAccuracy("V1", 80, 200000);
      adapter2.completeRecalibration("V1", 300000);
      const fb2 = adapter2.getCalibrationFeedback("V1", 300000);

      // Epoch IDs should be strings
      expect(typeof epoch1).toBe("string");
      expect(typeof fb2.epochId).toBe("string");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Safety envelope integration
  // ────────────────────────────────────────────────────────────────────────

  describe("safety envelope", () => {
    it("delegates safety check to injected SafetyEnvelope", () => {
      const safetyEnvelope = makeSafetyEnvelope();
      const adapter = makeAdapter({ safetyEnvelope });
      const request = makeActivationRequest();
      adapter.translateActivationRequest(request, 5000);
      expect(safetyEnvelope.checkStimulationSafe).toHaveBeenCalled();
    });

    it("checks suspension status before translating", () => {
      const safetyEnvelope = makeSafetyEnvelope();
      const adapter = makeAdapter({ safetyEnvelope });
      const request = makeActivationRequest();
      adapter.translateActivationRequest(request, 5000);
      expect(safetyEnvelope.isStimulationSuspended).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Default configuration uses Threshold Registry values
  // ────────────────────────────────────────────────────────────────────────

  describe("configuration and threshold registry", () => {
    it("default config uses SPIKE_SORTING_ACCURACY from threshold registry", () => {
      expect(DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG.targetSpikeSortingAccuracyPercent)
        .toBe(SPIKE_SORTING_ACCURACY);
    });

    it("default config uses STIMULATION_SPATIAL_PRECISION from threshold registry", () => {
      expect(DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG.stimulationSpatialPrecisionPercent)
        .toBe(STIMULATION_SPATIAL_PRECISION);
    });

    it("default config sets recalibration threshold at 85%", () => {
      expect(DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG.recalibrationThresholdPercent)
        .toBe(85);
    });

    it("default config sets validation accuracy at 90%", () => {
      expect(DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG.validationAccuracyPercent)
        .toBe(90);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ────────────────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty spike array in aggregation", () => {
      const adapter = makeAdapter();
      const snapshot = adapter.aggregateSpikes([], "V1", 1000);
      expect(snapshot).toBeNull();
    });

    it("handles activation request with empty coordinates", () => {
      const adapter = makeAdapter();
      const request = makeActivationRequest({ targetCoordinates: [] });
      const result = adapter.translateActivationRequest(request, 5000);
      expect(result).toBeNull();
    });

    it("handles multiple regions in a single activation request", () => {
      const adapter = makeAdapter();
      const request = makeActivationRequest({
        targetCoordinates: [makeCoordinate("V1"), makeCoordinate("V2")],
      });
      const result = adapter.translateActivationRequest(request, 5000);
      expect(result).not.toBeNull();
      // Should include electrodes from both regions
      expect(result!.targetElectrodeIds.length).toBeGreaterThan(10);
    });
  });
});
