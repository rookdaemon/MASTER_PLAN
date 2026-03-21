/**
 * Bio-Synthetic Interface — Domain Types & Threshold Constants
 *
 * All types, interfaces, and threshold constants for the bidirectional
 * interface between biological neural tissue and synthetic computational
 * substrates (card 0.2.2.4.1).
 */

// ──────────────────────────────────────────────────────────────────────────────
// Threshold Registry — all constants from the ARCHITECT phase
// ──────────────────────────────────────────────────────────────────────────────

/** Electrode density: 10,000 electrodes/mm². Valid range: 1,000–100,000. */
export const ELECTRODE_DENSITY = 10_000;

/** Amplifier input-referred noise: 5 μV_rms. Valid range: 1–10. */
export const AMPLIFIER_INPUT_NOISE = 5;

/** ADC sampling rate: 30 kHz per channel. Valid range: 20–100. */
export const ADC_SAMPLING_RATE = 30;

/** ADC resolution: 12 bits. Valid range: 10–16. */
export const ADC_RESOLUTION = 12;

/** Read pathway latency: 100 μs (electrode → spike event). Valid range: 50–500. */
export const READ_PATHWAY_LATENCY = 100;

/** Write pathway latency: 200 μs (command → current delivery). Valid range: 100–1,000. */
export const WRITE_PATHWAY_LATENCY = 200;

/** Round-trip latency budget: 500 μs. Valid range: 200–1,000. */
export const ROUND_TRIP_LATENCY = 500;

/** Charge density limit: 30 μC/cm²/phase (Shannon limit). Valid range: 10–50. */
export const CHARGE_DENSITY_LIMIT = 30;

/** Spike detection true positive rate: 95%. Valid range: 90–99. */
export const SPIKE_DETECTION_TPR = 95;

/** Spike detection false positive rate: 5%. Valid range: 1–10. */
export const SPIKE_DETECTION_FPR = 5;

/** Spike sorting accuracy: 90%. Valid range: 80–99. */
export const SPIKE_SORTING_ACCURACY = 90;

/** Stimulation spatial precision: 90% on-target. Valid range: 80–99. */
export const STIMULATION_SPATIAL_PRECISION = 90;

/** Biocompatibility duration: 5 years. Valid range: 1–20. */
export const BIOCOMPATIBILITY_DURATION = 5;

/** Signal degradation threshold: 20% max before electrode is "failed". Valid range: 5–50. */
export const SIGNAL_DEGRADATION_THRESHOLD = 20;

/** Cortical column bandwidth: 200 Kbps (compressed). Valid range: 50–1,000. */
export const CORTICAL_COLUMN_BANDWIDTH = 200;

/** Minimum ADC sampling rate (kHz) — Nyquist floor. */
export const MIN_ADC_SAMPLING_RATE = 20;

// ──────────────────────────────────────────────────────────────────────────────
// Domain types
// ──────────────────────────────────────────────────────────────────────────────

/** Brain atlas coordinate for spatial mapping. */
export interface BrainAtlasCoordinate {
  readonly region: string;
  readonly layer: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Identifies a single electrode channel. */
export interface ElectrodeChannel {
  readonly channelId: string;
  readonly electrodeArrayId: string;
  readonly positionMm: { x: number; y: number; z: number };
}

/** Layer 1 → Layer 2: raw analog voltage trace from a single electrode. */
export interface RawNeuralSignal {
  readonly channelId: string;
  readonly electrodeArrayId: string;
  readonly voltageSamples: Float64Array;
  readonly samplingRateKHz: number;
  readonly timestampUs: number;
  readonly impedanceOhms: number;
  readonly channelFailed: boolean;
}

/** Layer 2 → Layer 3: a single detected and sorted spike event. */
export interface SpikeTrainEvent {
  readonly neuronId: string;
  readonly channelId: string;
  readonly timestampUs: number;
  readonly waveformSnippet: Float64Array;
  readonly confidence: number;
  readonly sortingClusterId: string;
}

/** Layer 3 → Layer 2: command to stimulate a target neural population. */
export interface StimulationCommand {
  readonly targetCoordinates: readonly BrainAtlasCoordinate[];
  readonly targetElectrodeIds: readonly string[];
  readonly pulsePhaseDurationUs: number;
  readonly pulseAmplitudeUA: number;
  readonly chargePerPhaseMuCPerCm2: number;
  readonly interPulseIntervalUs: number;
  readonly pulseCount: number;
  readonly chargeBalanced: boolean;
  readonly timestampUs: number;
}

/** Layer 3: aggregate neural state for a brain region at a time instant. */
export interface NeuralStateSnapshot {
  readonly timestampUs: number;
  readonly regionId: string;
  readonly activeFiringRates: Map<string, number>;
  readonly populationVector: Float64Array;
  readonly qualityScore: number;
}

/** Layer 4: request from synthetic side to activate a neural population. */
export interface SyntheticActivationRequest {
  readonly targetCoordinates: readonly BrainAtlasCoordinate[];
  readonly desiredFiringRateHz: number;
  readonly desiredTimingPatternUs: readonly number[];
  readonly priorityLevel: number;
  readonly timestampUs: number;
}

/** Health status of a physical interface array. */
export type ArrayHealthStatus = "healthy" | "degraded" | "failed";

/** Layer 4: per-array health and signal quality report. */
export interface InterfaceHealthReport {
  readonly arrayId: string;
  readonly timestampUs: number;
  readonly activeChannelCount: number;
  readonly totalChannelCount: number;
  readonly averageImpedanceOhms: number;
  readonly signalDegradationPercent: number;
  readonly seizureDetected: boolean;
  readonly stimulationSuspended: boolean;
  readonly overallStatus: ArrayHealthStatus;
}

/** Layer 3: calibration quality metrics. */
export interface CalibrationFeedback {
  readonly regionId: string;
  readonly timestampUs: number;
  readonly spikeSortingAccuracyPercent: number;
  readonly driftDetected: boolean;
  readonly recalibrationRequired: boolean;
  readonly epochId: string;
}

/** Layer 4: bandwidth allocation for a cortical region. */
export interface BandwidthAllocation {
  readonly regionId: string;
  readonly allocatedKbps: number;
  readonly minimumGuaranteedKbps: number;
  readonly currentUsageKbps: number;
  readonly timestampUs: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Guard / validation functions — enforce Contract preconditions
// ──────────────────────────────────────────────────────────────────────────────

/** Validate RawNeuralSignal: channel not failed, sampling rate ≥ 20 kHz, has samples. */
export function validateRawNeuralSignal(signal: RawNeuralSignal): boolean {
  if (signal.channelFailed) return false;
  if (signal.samplingRateKHz < MIN_ADC_SAMPLING_RATE) return false;
  if (signal.voltageSamples.length === 0) return false;
  return true;
}

/** Validate SpikeTrainEvent: confidence in [0,1], has waveform. */
export function validateSpikeTrainEvent(event: SpikeTrainEvent): boolean {
  if (event.confidence < 0 || event.confidence > 1) return false;
  if (event.waveformSnippet.length === 0) return false;
  return true;
}

/** Validate StimulationCommand: charge density ≤ limit, charge-balanced, has targets. */
export function validateStimulationCommand(cmd: StimulationCommand): boolean {
  if (cmd.chargePerPhaseMuCPerCm2 > CHARGE_DENSITY_LIMIT) return false;
  if (!cmd.chargeBalanced) return false;
  if (cmd.targetElectrodeIds.length === 0) return false;
  return true;
}

/** Validate NeuralStateSnapshot: quality in [0,1], has population vector. */
export function validateNeuralStateSnapshot(
  snapshot: NeuralStateSnapshot
): boolean {
  if (snapshot.qualityScore < 0 || snapshot.qualityScore > 1) return false;
  if (snapshot.populationVector.length === 0) return false;
  return true;
}

/** Validate SyntheticActivationRequest: non-negative rate, has targets. */
export function validateSyntheticActivationRequest(
  req: SyntheticActivationRequest
): boolean {
  if (req.desiredFiringRateHz < 0) return false;
  if (req.targetCoordinates.length === 0) return false;
  return true;
}

/** Validate InterfaceHealthReport: degradation in [0,100], active ≤ total. */
export function validateInterfaceHealthReport(
  report: InterfaceHealthReport
): boolean {
  if (
    report.signalDegradationPercent < 0 ||
    report.signalDegradationPercent > 100
  )
    return false;
  if (report.activeChannelCount > report.totalChannelCount) return false;
  return true;
}

/** Validate CalibrationFeedback: accuracy in [0,100]. */
export function validateCalibrationFeedback(
  feedback: CalibrationFeedback
): boolean {
  if (
    feedback.spikeSortingAccuracyPercent < 0 ||
    feedback.spikeSortingAccuracyPercent > 100
  )
    return false;
  return true;
}

/** Validate BandwidthAllocation: allocated ≥ minimum, non-negative, usage ≤ allocated. */
export function validateBandwidthAllocation(
  alloc: BandwidthAllocation
): boolean {
  if (alloc.allocatedKbps < 0) return false;
  if (alloc.allocatedKbps < alloc.minimumGuaranteedKbps) return false;
  if (alloc.currentUsageKbps > alloc.allocatedKbps) return false;
  return true;
}
