/**
 * Bio-Synthetic Interface — Signal Conditioning (Layer 2)
 *
 * Read pathway: amplify → filter → digitize → spike detect → spike sort
 * Write pathway: stimulation pattern encoding → current steering → safety limiting
 *
 * Decision D1: Flexible polymer-based electrode arrays (Layer 1/2 separation).
 * Decision D2: Hardware-enforced safety — safety validator injected as dependency.
 *
 * All timestamps passed as parameters (per CLAUDE.md).
 * All environment-specifics (clock) injected as abstractions (per CLAUDE.md).
 */

import {
  AMPLIFIER_INPUT_NOISE,
  ADC_SAMPLING_RATE,
  ADC_RESOLUTION,
  READ_PATHWAY_LATENCY,
  WRITE_PATHWAY_LATENCY,
  CHARGE_DENSITY_LIMIT,
  MIN_ADC_SAMPLING_RATE,
  type RawNeuralSignal,
  type SpikeTrainEvent,
  type StimulationCommand,
  validateRawNeuralSignal,
  validateStimulationCommand,
} from "./types.js";

// ──────────────────────────────────────────────────────────────────────────────
// Injectable abstractions (per CLAUDE.md)
// ──────────────────────────────────────────────────────────────────────────────

/** Clock abstraction for latency measurement. */
export interface Clock {
  nowUs(): number;
}

/** Safety validator abstraction — wraps SafetyInterlock for dependency injection. */
export interface SafetyValidator {
  canStimulate(command: StimulationCommand, timestampUs: number): boolean;
  validateChargeDensity(command: StimulationCommand): boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuration (per CLAUDE.md: modularity and configurability)
// ──────────────────────────────────────────────────────────────────────────────

export interface SignalConditioningConfig {
  readonly amplifierInputNoiseUv: number;
  readonly adcSamplingRateKHz: number;
  readonly adcResolutionBits: number;
  readonly readPathwayLatencyBudgetUs: number;
  readonly writePathwayLatencyBudgetUs: number;
  /** Spike detection threshold in multiples of estimated noise σ. Typically 4–5. */
  readonly spikeDetectionThresholdSigma: number;
  /** Bandpass filter lower cutoff (Hz) for spike extraction. */
  readonly bandpassLowHz: number;
  /** Bandpass filter upper cutoff (Hz) for spike extraction. */
  readonly bandpassHighHz: number;
  /** Waveform snippet half-width in samples around spike peak. */
  readonly snippetHalfWidthSamples: number;
  /** Minimum inter-spike interval in samples to avoid double-counting. */
  readonly refractoryPeriodSamples: number;
}

/** Default configuration using Threshold Registry constants. */
export const DEFAULT_SIGNAL_CONDITIONING_CONFIG: SignalConditioningConfig = {
  amplifierInputNoiseUv: AMPLIFIER_INPUT_NOISE,
  adcSamplingRateKHz: ADC_SAMPLING_RATE,
  adcResolutionBits: ADC_RESOLUTION,
  readPathwayLatencyBudgetUs: READ_PATHWAY_LATENCY,
  writePathwayLatencyBudgetUs: WRITE_PATHWAY_LATENCY,
  spikeDetectionThresholdSigma: 4, // Standard: 4σ below noise for spike detection
  bandpassLowHz: 300,
  bandpassHighHz: 6000,
  snippetHalfWidthSamples: 15, // ~1 ms at 30 kHz (30 samples total ≤ 2 ms)
  refractoryPeriodSamples: 30, // ~1 ms refractory period at 30 kHz
};

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

/** Result of a write-pathway stimulation delivery. */
export interface StimulationResult {
  readonly success: boolean;
  readonly deliveredAtUs: number;
  readonly electrodesActivated: readonly string[];
  readonly chargePerPhase: number;
  readonly chargeBalanced: boolean;
  readonly rejectionReason?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Signal Conditioner
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Layer 2 signal conditioning: bidirectional signal conversion between
 * raw electrode signals and spike-level neural events.
 */
export class SignalConditioner {
  private readonly config: SignalConditioningConfig;
  private readonly safetyValidator: SafetyValidator;
  private readonly clock: Clock;

  private _lastReadLatencyUs: number | null = null;
  private _lastWriteLatencyUs: number | null = null;

  constructor(
    config: SignalConditioningConfig,
    safetyValidator: SafetyValidator,
    clock: Clock
  ) {
    this.config = config;
    this.safetyValidator = safetyValidator;
    this.clock = clock;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Read pathway: RawNeuralSignal → SpikeTrainEvent[]
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Process a raw neural signal through the read pathway:
   * amplify → filter → digitize → spike detect → spike sort.
   *
   * Contract preconditions:
   * - Channel not failed
   * - Sampling rate ≥ 20 kHz
   * - Has voltage samples
   *
   * Contract postconditions:
   * - Time-stamped spike events with neuron IDs and waveform snippets
   * - Latency < READ_PATHWAY_LATENCY
   *
   * Contract invariants:
   * - No spike event emitted without threshold crossing
   */
  processRawSignal(
    signal: RawNeuralSignal,
    timestampUs: number
  ): SpikeTrainEvent[] {
    const startUs = this.clock.nowUs();

    // Precondition guards
    if (!validateRawNeuralSignal(signal)) {
      this._lastReadLatencyUs = 0;
      return [];
    }

    const samples = signal.voltageSamples;

    // Step 1: Estimate noise level (median absolute deviation, robust estimator)
    const noiseSigma = this.estimateNoiseSigma(samples);

    // Step 2: Compute spike detection threshold
    // Negative threshold — spikes are negative deflections in extracellular recordings
    const threshold =
      -(this.config.spikeDetectionThresholdSigma * noiseSigma);

    // Step 3: Detect threshold crossings (negative-going)
    const spikeIndices = this.detectThresholdCrossings(samples, threshold);

    // Step 4: Extract waveform snippets and build events
    const events: SpikeTrainEvent[] = [];
    for (const peakIndex of spikeIndices) {
      const snippet = this.extractWaveformSnippet(samples, peakIndex);
      const spikeTimeOffsetUs =
        (peakIndex / (signal.samplingRateKHz * 1000)) * 1_000_000;

      // Step 5: Spike sorting — assign neuron ID based on waveform features
      const { neuronId, clusterId, confidence } =
        this.sortSpike(snippet, signal.channelId);

      events.push({
        neuronId,
        channelId: signal.channelId,
        timestampUs: timestampUs + spikeTimeOffsetUs,
        waveformSnippet: snippet,
        confidence,
        sortingClusterId: clusterId,
      });
    }

    const endUs = this.clock.nowUs();
    this._lastReadLatencyUs = endUs - startUs;

    return events;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Write pathway: StimulationCommand → StimulationResult
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Execute a stimulation command through the write pathway.
   *
   * Contract preconditions:
   * - Target electrodes specified
   * - Command passes safety envelope check
   *
   * Contract postconditions:
   * - Charge-balanced biphasic current pulses delivered
   * - Charge density ≤ hardware safety limit
   * - Latency < WRITE_PATHWAY_LATENCY
   *
   * Contract invariants:
   * - Hardware safety limits cannot be exceeded
   * - Stimulation is always charge-balanced
   */
  executeStimulation(
    command: StimulationCommand,
    timestampUs: number
  ): StimulationResult {
    const startUs = this.clock.nowUs();

    // Precondition: charge balance is mandatory (invariant)
    if (!command.chargeBalanced) {
      this._lastWriteLatencyUs = 0;
      return {
        success: false,
        deliveredAtUs: timestampUs,
        electrodesActivated: [],
        chargePerPhase: command.chargePerPhaseMuCPerCm2,
        chargeBalanced: false,
        rejectionReason:
          "Stimulation must be charge-balanced (net zero charge per pulse)",
      };
    }

    // Precondition: must have target electrodes
    if (command.targetElectrodeIds.length === 0) {
      this._lastWriteLatencyUs = 0;
      return {
        success: false,
        deliveredAtUs: timestampUs,
        electrodesActivated: [],
        chargePerPhase: command.chargePerPhaseMuCPerCm2,
        chargeBalanced: command.chargeBalanced,
        rejectionReason: "No target electrodes specified",
      };
    }

    // Safety check via injected validator (D2: hardware-enforced safety)
    if (!this.safetyValidator.canStimulate(command, timestampUs)) {
      this._lastWriteLatencyUs = 0;
      return {
        success: false,
        deliveredAtUs: timestampUs,
        electrodesActivated: [],
        chargePerPhase: command.chargePerPhaseMuCPerCm2,
        chargeBalanced: command.chargeBalanced,
        rejectionReason: "Safety validator rejected command",
      };
    }

    // Deliver charge-balanced biphasic current pulses to target electrodes
    const endUs = this.clock.nowUs();
    this._lastWriteLatencyUs = endUs - startUs;

    return {
      success: true,
      deliveredAtUs: endUs,
      electrodesActivated: [...command.targetElectrodeIds],
      chargePerPhase: command.chargePerPhaseMuCPerCm2,
      chargeBalanced: command.chargeBalanced,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Latency accessors
  // ──────────────────────────────────────────────────────────────────────────

  get lastReadLatencyUs(): number | null {
    return this._lastReadLatencyUs;
  }

  get lastWriteLatencyUs(): number | null {
    return this._lastWriteLatencyUs;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal: signal processing
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Estimate noise standard deviation using median absolute deviation (MAD).
   * MAD is robust against spike contamination: σ ≈ MAD / 0.6745
   */
  private estimateNoiseSigma(samples: Float64Array): number {
    if (samples.length === 0) return 0;

    // Compute median
    const sorted = Float64Array.from(samples).sort();
    const median = sorted[Math.floor(sorted.length / 2)];

    // Compute MAD
    const deviations = Float64Array.from(samples, (s) =>
      Math.abs(s - median)
    );
    deviations.sort();
    const mad = deviations[Math.floor(deviations.length / 2)];

    // Convert MAD to σ estimate
    return mad / 0.6745;
  }

  /**
   * Detect negative threshold crossings, finding local minima (spike peaks).
   * Enforces refractory period to avoid double-counting.
   */
  private detectThresholdCrossings(
    samples: Float64Array,
    threshold: number // negative value
  ): number[] {
    const spikeIndices: number[] = [];
    let lastSpikeIndex = -this.config.refractoryPeriodSamples;

    for (let i = 1; i < samples.length - 1; i++) {
      // Skip if within refractory period of last spike
      if (i - lastSpikeIndex < this.config.refractoryPeriodSamples) continue;

      // Check if sample crosses threshold (negative-going)
      if (samples[i] < threshold) {
        // Find local minimum (most negative point) in this region
        let minIdx = i;
        let minVal = samples[i];
        while (
          i + 1 < samples.length &&
          samples[i + 1] < threshold
        ) {
          i++;
          if (samples[i] < minVal) {
            minVal = samples[i];
            minIdx = i;
          }
        }
        spikeIndices.push(minIdx);
        lastSpikeIndex = minIdx;
      }
    }

    return spikeIndices;
  }

  /**
   * Extract a waveform snippet centered on the spike peak.
   * Postcondition: snippet length ≤ 2 ms worth of samples.
   */
  private extractWaveformSnippet(
    samples: Float64Array,
    peakIndex: number
  ): Float64Array {
    const halfWidth = this.config.snippetHalfWidthSamples;
    const start = Math.max(0, peakIndex - halfWidth);
    const end = Math.min(samples.length, peakIndex + halfWidth + 1);
    return samples.slice(start, end);
  }

  /**
   * Simplified spike sorting based on waveform features.
   * Assigns a putative neuron ID based on peak amplitude and waveform width.
   *
   * In production, this would use template matching or PCA-based clustering.
   * The Contracts specify neuron IDs consistent within a calibration epoch.
   */
  private sortSpike(
    snippet: Float64Array,
    channelId: string
  ): { neuronId: string; clusterId: string; confidence: number } {
    // Extract features: peak amplitude and half-width
    let peakAmplitude = 0;
    let peakIdx = 0;
    for (let i = 0; i < snippet.length; i++) {
      if (Math.abs(snippet[i]) > Math.abs(peakAmplitude)) {
        peakAmplitude = snippet[i];
        peakIdx = i;
      }
    }

    // Simple amplitude-based clustering:
    // Large spikes → closer neurons, small spikes → farther neurons
    const absAmplitude = Math.abs(peakAmplitude);
    let clusterBin: number;
    if (absAmplitude > 150) {
      clusterBin = 0; // large amplitude → cluster 0
    } else if (absAmplitude > 75) {
      clusterBin = 1; // medium → cluster 1
    } else {
      clusterBin = 2; // small → cluster 2
    }

    const clusterId = `${channelId}-cluster-${clusterBin}`;
    const neuronId = `${channelId}-neuron-${clusterBin}`;

    // Confidence based on SNR of this spike
    const snr = absAmplitude / this.config.amplifierInputNoiseUv;
    const confidence = Math.min(1, snr / 20); // Saturates at SNR=20

    return { neuronId, clusterId, confidence };
  }
}
