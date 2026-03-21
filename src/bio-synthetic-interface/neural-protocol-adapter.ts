/**
 * Bio-Synthetic Interface — Neural Protocol Adapter (Layer 3)
 *
 * Translates between electrode-level signals (Layer 2) and abstract neural
 * computation representation used by the synthetic substrate.
 *
 * Responsibilities:
 * - Coordinate mapping: electrode channels → brain atlas coordinates
 * - Spike aggregation: SpikeTrainEvent[] → NeuralStateSnapshot
 * - Write pathway: SyntheticActivationRequest → StimulationCommand
 * - Adaptive calibration loop (Decision D3: continuous closed-loop)
 * - Safety envelope check (Decision D2: hardware-enforced safety)
 *
 * All timestamps passed as parameters (per CLAUDE.md).
 * All environment-specifics injected as abstractions (per CLAUDE.md).
 */

import {
  SPIKE_SORTING_ACCURACY,
  STIMULATION_SPATIAL_PRECISION,
  CHARGE_DENSITY_LIMIT,
  type SpikeTrainEvent,
  type StimulationCommand,
  type NeuralStateSnapshot,
  type SyntheticActivationRequest,
  type CalibrationFeedback,
  type BrainAtlasCoordinate,
} from "./types.js";
import type { Clock } from "./signal-conditioning.js";

// ──────────────────────────────────────────────────────────────────────────────
// Injectable abstractions (per CLAUDE.md)
// ──────────────────────────────────────────────────────────────────────────────

/** Maps electrode channels to brain atlas coordinates and vice versa. */
export interface CoordinateMap {
  getAtlasCoordinate(channelId: string): BrainAtlasCoordinate | null;
  getElectrodesForRegion(regionId: string): string[];
  getElectrodesForCoordinates(
    coordinates: readonly BrainAtlasCoordinate[]
  ): string[];
}

/** Single electrode-to-brain-atlas mapping entry. */
export interface ElectrodeMapping {
  readonly channelId: string;
  readonly coordinate: BrainAtlasCoordinate;
}

/** Engine for running adaptive recalibration of electrode mappings. */
export interface CalibrationEngine {
  triggerRecalibration(regionId: string, timestampUs: number): void;
  isRecalibrating(regionId: string): boolean;
  validateNewMapping(regionId: string, accuracyPercent: number): boolean;
  getRecalibrationAccuracy(regionId: string): number;
}

/** Safety envelope abstraction — wraps SafetyInterlock for Layer 3 checks. */
export interface SafetyEnvelope {
  checkStimulationSafe(
    command: StimulationCommand,
    timestampUs: number
  ): boolean;
  isStimulationSuspended(): boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuration (per CLAUDE.md: modularity and configurability)
// ──────────────────────────────────────────────────────────────────────────────

export interface NeuralProtocolAdapterConfig {
  /** Target spike sorting accuracy (%). From Threshold Registry. */
  readonly targetSpikeSortingAccuracyPercent: number;
  /** Stimulation spatial precision target (%). From Threshold Registry. */
  readonly stimulationSpatialPrecisionPercent: number;
  /** Accuracy threshold below which recalibration is triggered (%). Behavioral Spec: 85%. */
  readonly recalibrationThresholdPercent: number;
  /** Minimum accuracy required to validate and swap in a new mapping (%). Behavioral Spec: 90%. */
  readonly validationAccuracyPercent: number;
  /** Default charge density for generated stimulation commands (μC/cm²/phase). */
  readonly defaultChargeDensityMuCPerCm2: number;
  /** Default pulse phase duration (μs). */
  readonly defaultPulsePhaseDurationUs: number;
  /** Default inter-pulse interval (μs). */
  readonly defaultInterPulseIntervalUs: number;
}

/** Default configuration using Threshold Registry constants. */
export const DEFAULT_NEURAL_PROTOCOL_ADAPTER_CONFIG: NeuralProtocolAdapterConfig =
  {
    targetSpikeSortingAccuracyPercent: SPIKE_SORTING_ACCURACY,
    stimulationSpatialPrecisionPercent: STIMULATION_SPATIAL_PRECISION,
    recalibrationThresholdPercent: 85,
    validationAccuracyPercent: 90,
    defaultChargeDensityMuCPerCm2: 20, // Conservative default, well under 30 limit
    defaultPulsePhaseDurationUs: 200,
    defaultInterPulseIntervalUs: 1000,
  };

// ──────────────────────────────────────────────────────────────────────────────
// Region tracking state
// ──────────────────────────────────────────────────────────────────────────────

interface RegionState {
  currentAccuracyPercent: number;
  previousAccuracyPercent: number | null;
  recalibrationRequired: boolean;
  driftDetected: boolean;
  epochId: string;
  epochCounter: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Neural Protocol Adapter
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Layer 3: Neural Protocol Adapter.
 *
 * Translates between electrode-level signals and the abstract neural
 * computation representation. Manages coordinate mapping, spike aggregation,
 * adaptive calibration, and safety envelope enforcement.
 */
export class NeuralProtocolAdapter {
  private readonly config: NeuralProtocolAdapterConfig;
  private readonly clock: Clock;
  private readonly coordinateMap: CoordinateMap;
  private readonly calibrationEngine: CalibrationEngine;
  private readonly safetyEnvelope: SafetyEnvelope;
  private readonly regionStates: Map<string, RegionState> = new Map();

  constructor(
    config: NeuralProtocolAdapterConfig,
    clock: Clock,
    coordinateMap: CoordinateMap,
    calibrationEngine: CalibrationEngine,
    safetyEnvelope: SafetyEnvelope
  ) {
    this.config = config;
    this.clock = clock;
    this.coordinateMap = coordinateMap;
    this.calibrationEngine = calibrationEngine;
    this.safetyEnvelope = safetyEnvelope;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Coordinate mapping
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Map a spike event's electrode channel to its brain atlas coordinate.
   * Returns null if the channel is not in the coordinate map.
   */
  mapSpikeToAtlas(spike: SpikeTrainEvent): BrainAtlasCoordinate | null {
    return this.coordinateMap.getAtlasCoordinate(spike.channelId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Spike aggregation → NeuralStateSnapshot
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Aggregate spike events into a NeuralStateSnapshot for a given region.
   *
   * Contract postcondition: NeuralStateSnapshot with firing rates and
   * population vector for the specified region.
   *
   * Returns null if no spikes match the region.
   */
  aggregateSpikes(
    spikes: readonly SpikeTrainEvent[],
    regionId: string,
    timestampUs: number
  ): NeuralStateSnapshot | null {
    if (spikes.length === 0) return null;

    // Filter spikes to those whose channel maps to the requested region
    const regionSpikes = spikes.filter((spike) => {
      const coord = this.coordinateMap.getAtlasCoordinate(spike.channelId);
      return coord !== null && coord.region === regionId;
    });

    if (regionSpikes.length === 0) return null;

    // Count spikes per neuron
    const neuronSpikeCounts = new Map<string, number>();
    for (const spike of regionSpikes) {
      const count = neuronSpikeCounts.get(spike.neuronId) ?? 0;
      neuronSpikeCounts.set(spike.neuronId, count + 1);
    }

    // Compute firing rates: spikes / time window
    // Use the span of timestamps as the window, or a minimum of 1 μs
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const spike of regionSpikes) {
      if (spike.timestampUs < minTs) minTs = spike.timestampUs;
      if (spike.timestampUs > maxTs) maxTs = spike.timestampUs;
    }
    const windowUs = Math.max(timestampUs - minTs, maxTs - minTs, 1);
    const windowSec = windowUs / 1_000_000;

    const activeFiringRates = new Map<string, number>();
    for (const [neuronId, count] of neuronSpikeCounts) {
      activeFiringRates.set(neuronId, count / windowSec);
    }

    // Build population vector from firing rates
    const neuronIds = Array.from(activeFiringRates.keys()).sort();
    const populationVector = new Float64Array(neuronIds.length);
    for (let i = 0; i < neuronIds.length; i++) {
      populationVector[i] = activeFiringRates.get(neuronIds[i])!;
    }

    // Quality score based on average confidence of contributing spikes
    const avgConfidence =
      regionSpikes.reduce((sum, s) => sum + s.confidence, 0) /
      regionSpikes.length;

    return {
      timestampUs,
      regionId,
      activeFiringRates,
      populationVector,
      qualityScore: Math.min(1, Math.max(0, avgConfidence)),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Write pathway: SyntheticActivationRequest → StimulationCommand
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Translate a SyntheticActivationRequest into a StimulationCommand.
   *
   * Contract preconditions:
   * - Target coordinates specified in brain atlas
   * - Command must pass safety envelope check
   *
   * Contract postconditions:
   * - Charge-balanced biphasic command targeting mapped electrodes
   * - Charge density ≤ CHARGE_DENSITY_LIMIT
   *
   * Contract invariants:
   * - Hardware safety limits cannot be exceeded
   * - Stimulation is always charge-balanced
   *
   * Returns null if request cannot be fulfilled (no electrodes, safety block).
   */
  translateActivationRequest(
    request: SyntheticActivationRequest,
    timestampUs: number
  ): StimulationCommand | null {
    // Precondition: must have target coordinates
    if (request.targetCoordinates.length === 0) return null;

    // Safety: check if stimulation is globally suspended
    if (this.safetyEnvelope.isStimulationSuspended()) return null;

    // Map brain atlas coordinates to electrode IDs
    const electrodeIds = this.coordinateMap.getElectrodesForCoordinates(
      request.targetCoordinates
    );
    if (electrodeIds.length === 0) return null;

    // Build charge-balanced stimulation command
    const command: StimulationCommand = {
      targetCoordinates: [...request.targetCoordinates],
      targetElectrodeIds: electrodeIds,
      pulsePhaseDurationUs: this.config.defaultPulsePhaseDurationUs,
      pulseAmplitudeUA: this.computeAmplitude(request.desiredFiringRateHz),
      chargePerPhaseMuCPerCm2: this.config.defaultChargeDensityMuCPerCm2,
      interPulseIntervalUs: this.config.defaultInterPulseIntervalUs,
      pulseCount: this.computePulseCount(
        request.desiredFiringRateHz,
        request.desiredTimingPatternUs
      ),
      chargeBalanced: true, // Invariant: always charge-balanced
      timestampUs,
    };

    // Safety envelope check
    if (!this.safetyEnvelope.checkStimulationSafe(command, timestampUs)) {
      return null;
    }

    return command;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Adaptive calibration
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Report observed spike sorting accuracy for a region.
   *
   * Behavioral Spec: When accuracy drops below 85%, trigger recalibration.
   * The read/write pathways continue with the previous mapping.
   */
  reportRegionAccuracy(
    regionId: string,
    accuracyPercent: number,
    timestampUs: number
  ): void {
    const state = this.getOrCreateRegionState(regionId);

    state.previousAccuracyPercent = state.currentAccuracyPercent;
    state.currentAccuracyPercent = accuracyPercent;

    // Detect drift: accuracy decreased from previous reading
    if (
      state.previousAccuracyPercent !== null &&
      accuracyPercent < state.previousAccuracyPercent &&
      accuracyPercent < this.config.targetSpikeSortingAccuracyPercent
    ) {
      state.driftDetected = true;
    }

    // Behavioral Spec: trigger recalibration when accuracy < 85%
    if (accuracyPercent < this.config.recalibrationThresholdPercent) {
      state.recalibrationRequired = true;
      this.calibrationEngine.triggerRecalibration(regionId, timestampUs);
    }
  }

  /**
   * Complete a pending recalibration for a region.
   *
   * Behavioral Spec: new mapping is atomically swapped in once validation
   * confirms accuracy ≥ 90%. Returns true if swap succeeded.
   */
  completeRecalibration(regionId: string, timestampUs: number): boolean {
    const state = this.getOrCreateRegionState(regionId);
    const newAccuracy =
      this.calibrationEngine.getRecalibrationAccuracy(regionId);

    if (
      this.calibrationEngine.validateNewMapping(regionId, newAccuracy) &&
      newAccuracy >= this.config.validationAccuracyPercent
    ) {
      // Atomic swap: update epoch and reset state
      state.epochCounter++;
      state.epochId = `${regionId}-epoch-${state.epochCounter}`;
      state.currentAccuracyPercent = newAccuracy;
      state.recalibrationRequired = false;
      state.driftDetected = false;
      return true;
    }

    return false;
  }

  /**
   * Get current calibration feedback for a region.
   */
  getCalibrationFeedback(
    regionId: string,
    timestampUs: number
  ): CalibrationFeedback {
    const state = this.getOrCreateRegionState(regionId);
    return {
      regionId,
      timestampUs,
      spikeSortingAccuracyPercent: state.currentAccuracyPercent,
      driftDetected: state.driftDetected,
      recalibrationRequired: state.recalibrationRequired,
      epochId: state.epochId,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  private getOrCreateRegionState(regionId: string): RegionState {
    let state = this.regionStates.get(regionId);
    if (!state) {
      state = {
        currentAccuracyPercent: this.config.targetSpikeSortingAccuracyPercent,
        previousAccuracyPercent: null,
        recalibrationRequired: false,
        driftDetected: false,
        epochId: `${regionId}-epoch-0`,
        epochCounter: 0,
      };
      this.regionStates.set(regionId, state);
    }
    return state;
  }

  /** Compute stimulation amplitude from desired firing rate. */
  private computeAmplitude(desiredFiringRateHz: number): number {
    // Linear relationship: higher firing rate → higher amplitude
    // Capped to stay within safe charge density
    return Math.min(desiredFiringRateHz * 10, 500);
  }

  /** Compute pulse count from desired firing rate and timing pattern. */
  private computePulseCount(
    desiredFiringRateHz: number,
    timingPatternUs: readonly number[]
  ): number {
    if (timingPatternUs.length > 0) {
      return timingPatternUs.length;
    }
    // Default: one pulse per desired spike
    return Math.max(1, Math.round(desiredFiringRateHz / 10));
  }
}
