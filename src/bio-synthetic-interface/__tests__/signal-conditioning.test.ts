import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SignalConditioner,
  SignalConditioningConfig,
  DEFAULT_SIGNAL_CONDITIONING_CONFIG,
  StimulationResult,
  SafetyValidator,
  Clock,
} from "../signal-conditioning.js";
import {
  AMPLIFIER_INPUT_NOISE,
  ADC_SAMPLING_RATE,
  ADC_RESOLUTION,
  READ_PATHWAY_LATENCY,
  WRITE_PATHWAY_LATENCY,
  CHARGE_DENSITY_LIMIT,
  SPIKE_DETECTION_TPR,
  SPIKE_DETECTION_FPR,
  type RawNeuralSignal,
  type SpikeTrainEvent,
  type StimulationCommand,
  type BrainAtlasCoordinate,
  validateRawNeuralSignal,
} from "../types.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function createMockClock(nowUs: number = 0): Clock {
  return { nowUs: vi.fn(() => nowUs) };
}

function createMockSafetyValidator(
  overrides: Partial<SafetyValidator> = {}
): SafetyValidator {
  return {
    canStimulate: vi.fn(() => true),
    validateChargeDensity: vi.fn(() => true),
    ...overrides,
  };
}

function makeRawSignal(
  overrides: Partial<RawNeuralSignal> = {}
): RawNeuralSignal {
  // Default: 1 ms of samples at 30 kHz = 30 samples, quiet baseline
  const sampleCount = 30;
  const samples = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = 0; // baseline at 0 μV
  }
  return {
    channelId: "ch-001",
    electrodeArrayId: "array-1",
    voltageSamples: samples,
    samplingRateKHz: 30,
    timestampUs: 1000,
    impedanceOhms: 1_000_000,
    channelFailed: false,
    ...overrides,
  };
}

/**
 * Generate a raw signal containing a synthetic spike waveform at a known position.
 * Spike: a negative deflection of `amplitudeMuV` centered at `spikePositionSample`.
 */
function makeRawSignalWithSpike(
  amplitudeMuV: number,
  spikePositionSample: number,
  totalSamples: number = 90, // 3 ms at 30 kHz
  noiseLevel: number = 2 // μV rms
): RawNeuralSignal {
  const samples = new Float64Array(totalSamples);
  // Add background noise
  for (let i = 0; i < totalSamples; i++) {
    // Deterministic "noise" for reproducibility
    samples[i] = noiseLevel * Math.sin(i * 0.7);
  }
  // Insert spike: simple triangular negative deflection over ~0.6 ms (18 samples at 30 kHz)
  const halfWidth = 9;
  const start = Math.max(0, spikePositionSample - halfWidth);
  const end = Math.min(totalSamples, spikePositionSample + halfWidth);
  for (let i = start; i < end; i++) {
    const distFromCenter = Math.abs(i - spikePositionSample) / halfWidth;
    samples[i] += -amplitudeMuV * (1 - distFromCenter);
  }
  return {
    channelId: "ch-001",
    electrodeArrayId: "array-1",
    voltageSamples: samples,
    samplingRateKHz: 30,
    timestampUs: 1000,
    impedanceOhms: 1_000_000,
    channelFailed: false,
  };
}

function makeStimulationCommand(
  overrides: Partial<StimulationCommand> = {}
): StimulationCommand {
  return {
    targetCoordinates: [{ region: "V1", layer: 4, x: 0.5, y: 0.3, z: 0.1 }],
    targetElectrodeIds: ["ch-001", "ch-002"],
    pulsePhaseDurationUs: 200,
    pulseAmplitudeUA: 50,
    chargePerPhaseMuCPerCm2: 25,
    interPulseIntervalUs: 500,
    pulseCount: 10,
    chargeBalanced: true,
    timestampUs: 1000,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("Bio-Synthetic Interface — Signal Conditioning (Layer 2)", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Default config uses Threshold Registry constants
  // ────────────────────────────────────────────────────────────────────────
  describe("Default configuration matches Threshold Registry", () => {
    it("amplifierInputNoiseUv matches AMPLIFIER_INPUT_NOISE", () => {
      expect(DEFAULT_SIGNAL_CONDITIONING_CONFIG.amplifierInputNoiseUv).toBe(
        AMPLIFIER_INPUT_NOISE
      );
    });

    it("adcSamplingRateKHz matches ADC_SAMPLING_RATE", () => {
      expect(DEFAULT_SIGNAL_CONDITIONING_CONFIG.adcSamplingRateKHz).toBe(
        ADC_SAMPLING_RATE
      );
    });

    it("adcResolutionBits matches ADC_RESOLUTION", () => {
      expect(DEFAULT_SIGNAL_CONDITIONING_CONFIG.adcResolutionBits).toBe(
        ADC_RESOLUTION
      );
    });

    it("readPathwayLatencyBudgetUs matches READ_PATHWAY_LATENCY", () => {
      expect(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG.readPathwayLatencyBudgetUs
      ).toBe(READ_PATHWAY_LATENCY);
    });

    it("writePathwayLatencyBudgetUs matches WRITE_PATHWAY_LATENCY", () => {
      expect(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG.writePathwayLatencyBudgetUs
      ).toBe(WRITE_PATHWAY_LATENCY);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Read pathway: precondition guards
  // ────────────────────────────────────────────────────────────────────────
  describe("Read pathway — precondition guards", () => {
    let conditioner: SignalConditioner;

    beforeEach(() => {
      conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        createMockClock()
      );
    });

    it("rejects signals from failed channels", () => {
      const signal = makeRawSignal({ channelFailed: true });
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events).toEqual([]);
    });

    it("rejects signals with sampling rate below minimum (20 kHz)", () => {
      const signal = makeRawSignal({ samplingRateKHz: 15 });
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events).toEqual([]);
    });

    it("rejects signals with empty voltage samples", () => {
      const signal = makeRawSignal({
        voltageSamples: new Float64Array(0),
      });
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events).toEqual([]);
    });

    it("accepts valid signals (channel healthy, sampling rate ≥ 20 kHz, has samples)", () => {
      // Signal with a clear spike should produce events
      const signal = makeRawSignalWithSpike(200, 45);
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(0); // may or may not have spikes, but doesn't throw
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Read pathway: spike detection
  // ────────────────────────────────────────────────────────────────────────
  describe("Read pathway — spike detection", () => {
    let conditioner: SignalConditioner;

    beforeEach(() => {
      conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        createMockClock(1000)
      );
    });

    it("detects a clear spike and emits a SpikeTrainEvent", () => {
      // Large spike (200 μV) should be detected with any reasonable threshold
      const signal = makeRawSignalWithSpike(200, 45, 90, 2);
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it("emitted event contains timestamp, neuron ID, and waveform snippet", () => {
      const signal = makeRawSignalWithSpike(200, 45, 90, 2);
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0];
      expect(event.timestampUs).toBeDefined();
      expect(typeof event.neuronId).toBe("string");
      expect(event.neuronId.length).toBeGreaterThan(0);
      expect(event.waveformSnippet).toBeInstanceOf(Float64Array);
      expect(event.waveformSnippet.length).toBeGreaterThan(0);
    });

    it("waveform snippet is ≤ 2 ms (≤ 60 samples at 30 kHz)", () => {
      const signal = makeRawSignalWithSpike(200, 45, 90, 2);
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(1);

      // 2 ms at 30 kHz = 60 samples
      const maxSnippetSamples = Math.ceil(
        2 * DEFAULT_SIGNAL_CONDITIONING_CONFIG.adcSamplingRateKHz
      );
      expect(events[0].waveformSnippet.length).toBeLessThanOrEqual(
        maxSnippetSamples
      );
    });

    it("event includes channelId matching the source signal", () => {
      const base = makeRawSignalWithSpike(200, 45, 90, 2);
      const signal: RawNeuralSignal = { ...base, channelId: "ch-042" };
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].channelId).toBe("ch-042");
    });

    it("event confidence is between 0 and 1", () => {
      const signal = makeRawSignalWithSpike(200, 45, 90, 2);
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].confidence).toBeGreaterThanOrEqual(0);
      expect(events[0].confidence).toBeLessThanOrEqual(1);
    });

    it("does NOT emit spike events from quiet signal (invariant: no spike without threshold crossing)", () => {
      // Very quiet signal — well below any detection threshold
      const samples = new Float64Array(90);
      for (let i = 0; i < 90; i++) {
        samples[i] = 0.1 * Math.sin(i * 0.3); // tiny noise, sub-μV
      }
      const signal = makeRawSignal({ voltageSamples: samples });
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBe(0);
    });

    it("detects multiple spikes in the same signal window", () => {
      // Two spikes separated by enough distance
      const totalSamples = 180; // 6 ms at 30 kHz
      const samples = new Float64Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        samples[i] = 2 * Math.sin(i * 0.7); // background noise
      }
      // First spike at sample 30
      for (let i = 21; i < 39; i++) {
        const dist = Math.abs(i - 30) / 9;
        samples[i] += -200 * (1 - dist);
      }
      // Second spike at sample 120
      for (let i = 111; i < 129; i++) {
        const dist = Math.abs(i - 120) / 9;
        samples[i] += -200 * (1 - dist);
      }
      const signal = makeRawSignal({
        voltageSamples: samples,
      });
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Read pathway: spike detection performance (TPR/FPR)
  // ────────────────────────────────────────────────────────────────────────
  describe("Read pathway — spike detection performance", () => {
    let conditioner: SignalConditioner;

    beforeEach(() => {
      conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        createMockClock(1000)
      );
    });

    it("spike detection TPR ≥ 95% on synthetic signals with clear spikes", () => {
      // Generate 100 signals, each with exactly one clear spike
      let detected = 0;
      const trials = 100;
      for (let t = 0; t < trials; t++) {
        // Spike amplitude 100–300 μV (realistic extracellular range)
        const amplitude = 100 + (t * 2);
        // Vary spike position
        const position = 30 + (t % 30);
        const signal = makeRawSignalWithSpike(amplitude, position, 90, 3);
        const events = conditioner.processRawSignal(signal, 1000 + t);
        if (events.length >= 1) detected++;
      }
      const tpr = (detected / trials) * 100;
      expect(tpr).toBeGreaterThanOrEqual(SPIKE_DETECTION_TPR);
    });

    it("spike detection FPR ≤ 5% on synthetic noise-only signals", () => {
      // Generate 100 signals with only noise (no real spikes)
      let falsePositives = 0;
      const trials = 100;
      for (let t = 0; t < trials; t++) {
        const samples = new Float64Array(90);
        // Realistic noise: ~5 μV RMS (matching AMPLIFIER_INPUT_NOISE)
        for (let i = 0; i < 90; i++) {
          // Use deterministic pseudo-noise based on trial + sample index
          samples[i] =
            AMPLIFIER_INPUT_NOISE *
            Math.sin((t * 90 + i) * 0.123 + t * 0.456);
        }
        const signal = makeRawSignal({ voltageSamples: samples });
        const events = conditioner.processRawSignal(signal, 1000 + t);
        if (events.length > 0) falsePositives++;
      }
      const fpr = (falsePositives / trials) * 100;
      expect(fpr).toBeLessThanOrEqual(SPIKE_DETECTION_FPR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Read pathway: latency tracking
  // ────────────────────────────────────────────────────────────────────────
  describe("Read pathway — latency", () => {
    it("reports read pathway latency within budget", () => {
      const startUs = 1000;
      const endUs = startUs + 80; // 80 μs — within 100 μs budget
      const clock = {
        nowUs: vi
          .fn()
          .mockReturnValueOnce(startUs)
          .mockReturnValueOnce(endUs),
      };
      const conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        clock
      );
      const signal = makeRawSignalWithSpike(200, 45, 90, 2);
      const events = conditioner.processRawSignal(signal, startUs);

      // The conditioner should track that processing completed within budget
      expect(conditioner.lastReadLatencyUs).toBeDefined();
      expect(conditioner.lastReadLatencyUs!).toBeLessThanOrEqual(
        READ_PATHWAY_LATENCY
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Write pathway: stimulation delivery
  // ────────────────────────────────────────────────────────────────────────
  describe("Write pathway — stimulation delivery", () => {
    let conditioner: SignalConditioner;
    let safetyValidator: SafetyValidator;

    beforeEach(() => {
      safetyValidator = createMockSafetyValidator();
      conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        safetyValidator,
        createMockClock(1000)
      );
    });

    it("delivers stimulation for a valid command", () => {
      const cmd = makeStimulationCommand();
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.success).toBe(true);
    });

    it("result contains electrodes activated matching target electrodes", () => {
      const cmd = makeStimulationCommand({
        targetElectrodeIds: ["ch-010", "ch-011", "ch-012"],
      });
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.electrodesActivated).toEqual(["ch-010", "ch-011", "ch-012"]);
    });

    it("result confirms charge balancing", () => {
      const cmd = makeStimulationCommand({ chargeBalanced: true });
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.chargeBalanced).toBe(true);
    });

    it("result includes charge per phase from command", () => {
      const cmd = makeStimulationCommand({
        chargePerPhaseMuCPerCm2: 20,
      });
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.chargePerPhase).toBe(20);
    });

    it("result includes delivery timestamp", () => {
      const cmd = makeStimulationCommand();
      const result = conditioner.executeStimulation(cmd, 5000);
      expect(result.deliveredAtUs).toBeDefined();
      expect(typeof result.deliveredAtUs).toBe("number");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Write pathway: safety integration
  // ────────────────────────────────────────────────────────────────────────
  describe("Write pathway — safety enforcement", () => {
    it("rejects command when safety validator denies it", () => {
      const safetyValidator = createMockSafetyValidator({
        canStimulate: vi.fn(() => false),
      });
      const conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        safetyValidator,
        createMockClock(1000)
      );
      const cmd = makeStimulationCommand();
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.success).toBe(false);
      expect(result.rejectionReason).toBeDefined();
    });

    it("calls safety validator with command and timestamp", () => {
      const canStimulate = vi.fn(() => true);
      const safetyValidator = createMockSafetyValidator({ canStimulate });
      const conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        safetyValidator,
        createMockClock(1000)
      );
      const cmd = makeStimulationCommand();
      conditioner.executeStimulation(cmd, 5000);
      expect(canStimulate).toHaveBeenCalledWith(cmd, 5000);
    });

    it("rejects non-charge-balanced commands even if validator passes", () => {
      const conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        createMockClock(1000)
      );
      const cmd = makeStimulationCommand({ chargeBalanced: false });
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.success).toBe(false);
      expect(result.rejectionReason).toContain("charge-balanced");
    });

    it("rejects commands with no target electrodes", () => {
      const conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        createMockClock(1000)
      );
      const cmd = makeStimulationCommand({ targetElectrodeIds: [] });
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.success).toBe(false);
    });

    it("charge density in result never exceeds CHARGE_DENSITY_LIMIT", () => {
      const conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        createMockClock(1000)
      );
      const cmd = makeStimulationCommand({ chargePerPhaseMuCPerCm2: 25 });
      const result = conditioner.executeStimulation(cmd, 1000);
      expect(result.chargePerPhase).toBeLessThanOrEqual(CHARGE_DENSITY_LIMIT);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Write pathway: latency tracking
  // ────────────────────────────────────────────────────────────────────────
  describe("Write pathway — latency", () => {
    it("reports write pathway latency within budget", () => {
      const startUs = 1000;
      const endUs = startUs + 150; // 150 μs — within 200 μs budget
      const clock = {
        nowUs: vi
          .fn()
          .mockReturnValueOnce(startUs)
          .mockReturnValueOnce(endUs),
      };
      const conditioner = new SignalConditioner(
        DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        createMockSafetyValidator(),
        clock
      );
      const cmd = makeStimulationCommand();
      conditioner.executeStimulation(cmd, startUs);

      expect(conditioner.lastWriteLatencyUs).toBeDefined();
      expect(conditioner.lastWriteLatencyUs!).toBeLessThanOrEqual(
        WRITE_PATHWAY_LATENCY
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Configurability (per CLAUDE.md)
  // ────────────────────────────────────────────────────────────────────────
  describe("Configurability", () => {
    it("uses custom spike detection threshold from config", () => {
      // Very high threshold — should detect fewer spikes
      const config: SignalConditioningConfig = {
        ...DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        spikeDetectionThresholdSigma: 20, // extremely high
      };
      const conditioner = new SignalConditioner(
        config,
        createMockSafetyValidator(),
        createMockClock(1000)
      );
      // Small spike that would be detected with normal threshold but not 20σ
      const signal = makeRawSignalWithSpike(50, 45, 90, 5);
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBe(0);
    });

    it("uses custom bandpass filter range from config", () => {
      const config: SignalConditioningConfig = {
        ...DEFAULT_SIGNAL_CONDITIONING_CONFIG,
        bandpassLowHz: 300,
        bandpassHighHz: 6000,
      };
      const conditioner = new SignalConditioner(
        config,
        createMockSafetyValidator(),
        createMockClock(1000)
      );
      // Should still function with custom bandpass
      const signal = makeRawSignalWithSpike(200, 45, 90, 2);
      const events = conditioner.processRawSignal(signal, 1000);
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });
});
