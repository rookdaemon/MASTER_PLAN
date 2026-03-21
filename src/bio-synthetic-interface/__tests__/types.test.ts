import { describe, it, expect } from "vitest";
import {
  // Threshold constants
  ELECTRODE_DENSITY,
  AMPLIFIER_INPUT_NOISE,
  ADC_SAMPLING_RATE,
  ADC_RESOLUTION,
  READ_PATHWAY_LATENCY,
  WRITE_PATHWAY_LATENCY,
  ROUND_TRIP_LATENCY,
  CHARGE_DENSITY_LIMIT,
  SPIKE_DETECTION_TPR,
  SPIKE_DETECTION_FPR,
  SPIKE_SORTING_ACCURACY,
  STIMULATION_SPATIAL_PRECISION,
  BIOCOMPATIBILITY_DURATION,
  SIGNAL_DEGRADATION_THRESHOLD,
  CORTICAL_COLUMN_BANDWIDTH,
  // Guard functions
  validateRawNeuralSignal,
  validateSpikeTrainEvent,
  validateStimulationCommand,
  validateNeuralStateSnapshot,
  validateSyntheticActivationRequest,
  validateInterfaceHealthReport,
  validateCalibrationFeedback,
  validateBandwidthAllocation,
  // Types (compile-time only, but we verify structure via guards)
  type RawNeuralSignal,
  type SpikeTrainEvent,
  type StimulationCommand,
  type NeuralStateSnapshot,
  type SyntheticActivationRequest,
  type InterfaceHealthReport,
  type CalibrationFeedback,
  type BandwidthAllocation,
  type ElectrodeChannel,
  type BrainAtlasCoordinate,
} from "../types.js";

describe("Bio-Synthetic Interface — Types & Threshold Constants", () => {
  describe("Threshold Registry constants", () => {
    it("ELECTRODE_DENSITY is 10,000 electrodes/mm²", () => {
      expect(ELECTRODE_DENSITY).toBe(10_000);
    });

    it("AMPLIFIER_INPUT_NOISE is 5 μV_rms", () => {
      expect(AMPLIFIER_INPUT_NOISE).toBe(5);
    });

    it("ADC_SAMPLING_RATE is 30 kHz/channel", () => {
      expect(ADC_SAMPLING_RATE).toBe(30);
    });

    it("ADC_RESOLUTION is 12 bits", () => {
      expect(ADC_RESOLUTION).toBe(12);
    });

    it("READ_PATHWAY_LATENCY is 100 μs", () => {
      expect(READ_PATHWAY_LATENCY).toBe(100);
    });

    it("WRITE_PATHWAY_LATENCY is 200 μs", () => {
      expect(WRITE_PATHWAY_LATENCY).toBe(200);
    });

    it("ROUND_TRIP_LATENCY is 500 μs", () => {
      expect(ROUND_TRIP_LATENCY).toBe(500);
    });

    it("read + write latency fits within round-trip budget", () => {
      expect(READ_PATHWAY_LATENCY + WRITE_PATHWAY_LATENCY).toBeLessThanOrEqual(
        ROUND_TRIP_LATENCY
      );
    });

    it("CHARGE_DENSITY_LIMIT is 30 μC/cm²/phase", () => {
      expect(CHARGE_DENSITY_LIMIT).toBe(30);
    });

    it("SPIKE_DETECTION_TPR is 95%", () => {
      expect(SPIKE_DETECTION_TPR).toBe(95);
    });

    it("SPIKE_DETECTION_FPR is 5%", () => {
      expect(SPIKE_DETECTION_FPR).toBe(5);
    });

    it("SPIKE_SORTING_ACCURACY is 90%", () => {
      expect(SPIKE_SORTING_ACCURACY).toBe(90);
    });

    it("STIMULATION_SPATIAL_PRECISION is 90%", () => {
      expect(STIMULATION_SPATIAL_PRECISION).toBe(90);
    });

    it("BIOCOMPATIBILITY_DURATION is 5 years", () => {
      expect(BIOCOMPATIBILITY_DURATION).toBe(5);
    });

    it("SIGNAL_DEGRADATION_THRESHOLD is 20%", () => {
      expect(SIGNAL_DEGRADATION_THRESHOLD).toBe(20);
    });

    it("CORTICAL_COLUMN_BANDWIDTH is 200 Kbps", () => {
      expect(CORTICAL_COLUMN_BANDWIDTH).toBe(200);
    });
  });

  describe("RawNeuralSignal guard", () => {
    const validSignal: RawNeuralSignal = {
      channelId: "ch-001",
      electrodeArrayId: "array-A",
      voltageSamples: new Float64Array([0.1, -0.2, 0.3]),
      samplingRateKHz: 30,
      timestampUs: 1000,
      impedanceOhms: 500_000,
      channelFailed: false,
    };

    it("accepts a valid RawNeuralSignal", () => {
      expect(validateRawNeuralSignal(validSignal)).toBe(true);
    });

    it("rejects signal with sampling rate below minimum (20 kHz)", () => {
      expect(
        validateRawNeuralSignal({ ...validSignal, samplingRateKHz: 15 })
      ).toBe(false);
    });

    it("rejects signal from a failed channel", () => {
      expect(
        validateRawNeuralSignal({ ...validSignal, channelFailed: true })
      ).toBe(false);
    });

    it("rejects signal with empty voltage samples", () => {
      expect(
        validateRawNeuralSignal({
          ...validSignal,
          voltageSamples: new Float64Array([]),
        })
      ).toBe(false);
    });
  });

  describe("SpikeTrainEvent guard", () => {
    const validSpike: SpikeTrainEvent = {
      neuronId: "neuron-42",
      channelId: "ch-001",
      timestampUs: 1500,
      waveformSnippet: new Float64Array(Array(60).fill(0.1)), // 2ms @ 30kHz = 60 samples
      confidence: 0.95,
      sortingClusterId: "cluster-3",
    };

    it("accepts a valid SpikeTrainEvent", () => {
      expect(validateSpikeTrainEvent(validSpike)).toBe(true);
    });

    it("rejects spike with confidence below 0", () => {
      expect(
        validateSpikeTrainEvent({ ...validSpike, confidence: -0.1 })
      ).toBe(false);
    });

    it("rejects spike with confidence above 1", () => {
      expect(
        validateSpikeTrainEvent({ ...validSpike, confidence: 1.1 })
      ).toBe(false);
    });

    it("rejects spike with empty waveform snippet", () => {
      expect(
        validateSpikeTrainEvent({
          ...validSpike,
          waveformSnippet: new Float64Array([]),
        })
      ).toBe(false);
    });
  });

  describe("StimulationCommand guard", () => {
    const validCommand: StimulationCommand = {
      targetCoordinates: [
        { region: "V1", layer: 4, x: 0.5, y: 0.3, z: 0.1 },
      ],
      targetElectrodeIds: ["ch-001", "ch-002"],
      pulsePhaseDurationUs: 200,
      pulseAmplitudeUA: 50,
      chargePerPhaseMuCPerCm2: 25,
      interPulseIntervalUs: 500,
      pulseCount: 10,
      chargeBalanced: true,
      timestampUs: 2000,
    };

    it("accepts a valid StimulationCommand", () => {
      expect(validateStimulationCommand(validCommand)).toBe(true);
    });

    it("rejects command exceeding charge density limit (30 μC/cm²/phase)", () => {
      expect(
        validateStimulationCommand({
          ...validCommand,
          chargePerPhaseMuCPerCm2: 35,
        })
      ).toBe(false);
    });

    it("rejects non-charge-balanced command", () => {
      expect(
        validateStimulationCommand({ ...validCommand, chargeBalanced: false })
      ).toBe(false);
    });

    it("rejects command with no target electrodes", () => {
      expect(
        validateStimulationCommand({
          ...validCommand,
          targetElectrodeIds: [],
        })
      ).toBe(false);
    });
  });

  describe("NeuralStateSnapshot guard", () => {
    const validSnapshot: NeuralStateSnapshot = {
      timestampUs: 3000,
      regionId: "V1",
      activeFiringRates: new Map([["neuron-1", 10.5]]),
      populationVector: new Float64Array([0.1, 0.2]),
      qualityScore: 0.92,
    };

    it("accepts a valid NeuralStateSnapshot", () => {
      expect(validateNeuralStateSnapshot(validSnapshot)).toBe(true);
    });

    it("rejects snapshot with quality score out of range", () => {
      expect(
        validateNeuralStateSnapshot({ ...validSnapshot, qualityScore: 1.5 })
      ).toBe(false);
    });

    it("rejects snapshot with empty population vector", () => {
      expect(
        validateNeuralStateSnapshot({
          ...validSnapshot,
          populationVector: new Float64Array([]),
        })
      ).toBe(false);
    });
  });

  describe("SyntheticActivationRequest guard", () => {
    const validRequest: SyntheticActivationRequest = {
      targetCoordinates: [
        { region: "V1", layer: 4, x: 0.5, y: 0.3, z: 0.1 },
      ],
      desiredFiringRateHz: 20,
      desiredTimingPatternUs: [1000, 1050, 1100],
      priorityLevel: 5,
      timestampUs: 4000,
    };

    it("accepts a valid SyntheticActivationRequest", () => {
      expect(validateSyntheticActivationRequest(validRequest)).toBe(true);
    });

    it("rejects request with negative firing rate", () => {
      expect(
        validateSyntheticActivationRequest({
          ...validRequest,
          desiredFiringRateHz: -5,
        })
      ).toBe(false);
    });

    it("rejects request with empty target coordinates", () => {
      expect(
        validateSyntheticActivationRequest({
          ...validRequest,
          targetCoordinates: [],
        })
      ).toBe(false);
    });
  });

  describe("InterfaceHealthReport guard", () => {
    const validReport: InterfaceHealthReport = {
      arrayId: "array-A",
      timestampUs: 5000,
      activeChannelCount: 9500,
      totalChannelCount: 10000,
      averageImpedanceOhms: 500_000,
      signalDegradationPercent: 5,
      seizureDetected: false,
      stimulationSuspended: false,
      overallStatus: "healthy",
    };

    it("accepts a valid InterfaceHealthReport", () => {
      expect(validateInterfaceHealthReport(validReport)).toBe(true);
    });

    it("rejects report with degradation exceeding 100%", () => {
      expect(
        validateInterfaceHealthReport({
          ...validReport,
          signalDegradationPercent: 110,
        })
      ).toBe(false);
    });

    it("rejects report with more active channels than total", () => {
      expect(
        validateInterfaceHealthReport({
          ...validReport,
          activeChannelCount: 11000,
        })
      ).toBe(false);
    });

    it("rejects report with negative degradation", () => {
      expect(
        validateInterfaceHealthReport({
          ...validReport,
          signalDegradationPercent: -5,
        })
      ).toBe(false);
    });
  });

  describe("CalibrationFeedback guard", () => {
    const validFeedback: CalibrationFeedback = {
      regionId: "V1",
      timestampUs: 6000,
      spikeSortingAccuracyPercent: 92,
      driftDetected: false,
      recalibrationRequired: false,
      epochId: "epoch-001",
    };

    it("accepts a valid CalibrationFeedback", () => {
      expect(validateCalibrationFeedback(validFeedback)).toBe(true);
    });

    it("rejects feedback with accuracy above 100%", () => {
      expect(
        validateCalibrationFeedback({
          ...validFeedback,
          spikeSortingAccuracyPercent: 105,
        })
      ).toBe(false);
    });

    it("rejects feedback with negative accuracy", () => {
      expect(
        validateCalibrationFeedback({
          ...validFeedback,
          spikeSortingAccuracyPercent: -10,
        })
      ).toBe(false);
    });
  });

  describe("BandwidthAllocation guard", () => {
    const validAllocation: BandwidthAllocation = {
      regionId: "V1",
      allocatedKbps: 250,
      minimumGuaranteedKbps: 50,
      currentUsageKbps: 180,
      timestampUs: 7000,
    };

    it("accepts a valid BandwidthAllocation", () => {
      expect(validateBandwidthAllocation(validAllocation)).toBe(true);
    });

    it("rejects allocation below minimum guaranteed", () => {
      expect(
        validateBandwidthAllocation({
          ...validAllocation,
          allocatedKbps: 30,
          minimumGuaranteedKbps: 50,
        })
      ).toBe(false);
    });

    it("rejects allocation with negative bandwidth", () => {
      expect(
        validateBandwidthAllocation({ ...validAllocation, allocatedKbps: -10 })
      ).toBe(false);
    });

    it("rejects allocation where usage exceeds allocation", () => {
      expect(
        validateBandwidthAllocation({
          ...validAllocation,
          currentUsageKbps: 300,
          allocatedKbps: 250,
        })
      ).toBe(false);
    });
  });
});
