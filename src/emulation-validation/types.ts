/**
 * Emulation Validation — Core Type Definitions
 *
 * Types and interfaces for the three-layer emulation validation protocol
 * defined in docs/emulation-validation/ARCHITECTURE.md
 *
 * Implements card 0.2.2.1.4: verifying that a brain emulation produces
 * equivalent cognitive function and subjective experience to the
 * biological original.
 */

// ── Enums & Constants ───────────────────────────────────────────────────────

export type LayerStatus = "PASS" | "FAIL" | "PARTIAL" | "PROVISIONAL";

export type OverallVerdict =
  | "VALIDATED"
  | "PROVISIONALLY_VALIDATED"
  | "FAILED"
  | "INCONCLUSIVE";

export type FailureClassification =
  | "false-positive-zombie"
  | "false-negative-substrate-offset"
  | "degraded-fidelity"
  | "temporal-drift";

// ── Layer 1: Behavioral Equivalence ─────────────────────────────────────────

export type TestDomain =
  | "episodic-memory"
  | "semantic-memory"
  | "personality"
  | "cognitive-benchmarks"
  | "novel-stimuli"
  | "social-interaction"
  | "motor-procedural";

export interface DomainResult {
  domain: TestDomain;
  passed: boolean;
  score: number;
  threshold: number;
  details: string;
}

/** Thresholds from ARCHITECTURE.md Layer 1 table */
export const BEHAVIORAL_THRESHOLDS: Record<TestDomain, { metric: string; threshold: number }> = {
  "episodic-memory": { metric: "accuracy", threshold: 0.95 },
  "semantic-memory": { metric: "within-SD", threshold: 1.0 },
  "personality": { metric: "within-test-retest-band", threshold: 1.0 },
  "cognitive-benchmarks": { metric: "within-SD", threshold: 1.0 },
  "novel-stimuli": { metric: "indistinguishability-rate", threshold: 0.60 },
  "social-interaction": { metric: "likert-mean", threshold: 4.0 },
  "motor-procedural": { metric: "within-SD", threshold: 1.0 },
};

export interface Layer1Result {
  status: LayerStatus;
  domainResults: Map<TestDomain, DomainResult>;
  overallScore: number; // 0.0 - 1.0
  failedDomainCount: number;
}

// ── Layer 2: Neural-Dynamic Equivalence ─────────────────────────────────────

export type NeuralMetric =
  | "firing-rate-correlation"
  | "oscillatory-power-spectrum"
  | "functional-connectivity"
  | "temporal-dynamics"
  | "information-flow"
  | "attractor-stability";

export interface MetricResult {
  metric: NeuralMetric;
  passed: boolean;
  value: number;
  tolerance: number;
  details: string;
}

/** Tolerances from ARCHITECTURE.md Layer 2 table */
export const NEURAL_METRIC_TOLERANCES: Record<NeuralMetric, { unit: string; tolerance: number }> = {
  "firing-rate-correlation": { unit: "pearson-r", tolerance: 0.90 },
  "oscillatory-power-spectrum": { unit: "kl-divergence-nats", tolerance: 0.1 },
  "functional-connectivity": { unit: "frobenius-norm-pct", tolerance: 0.10 },
  "temporal-dynamics": { unit: "peak-lag-error-ms", tolerance: 5.0 },
  "information-flow": { unit: "pct-of-reference", tolerance: 0.20 },
  "attractor-stability": { unit: "cosine-similarity", tolerance: 0.85 },
};

export interface DivergenceIndex {
  /** Weighted sum of normalized divergences */
  value: number;
  /** Maximum allowable divergence */
  threshold: number;
  /** Per-metric weighted contributions */
  contributions: Map<NeuralMetric, number>;
}

export interface TemporalDriftAssessment {
  /** Slope of D(t) regression (divergence units per simulated hour) */
  driftRate: number;
  /** Projected time to exceed D_max (in simulated hours), null if slope ≤ 0 */
  projectedExceedanceHours: number | null;
  /** Whether drift is within acceptable bounds (10+ year horizon) */
  acceptable: boolean;
}

export interface Layer2Result {
  status: LayerStatus;
  metricResults: Map<NeuralMetric, MetricResult>;
  divergenceIndex: DivergenceIndex;
  temporalDrift: TemporalDriftAssessment | null;
}

// ── Layer 3: Experiential Equivalence ───────────────────────────────────────

export interface ConsciousnessAssessment {
  /** Integrated Information (Φ) within biological range */
  phi: { value: number; biologicalRange: [number, number]; passed: boolean };
  /** Perturbational Complexity Index above threshold */
  pci: { value: number; threshold: number; passed: boolean };
  /** Global Workspace ignition signatures present */
  globalWorkspace: { present: boolean; details: string };
  /** Recurrent processing markers confirmed */
  recurrentProcessing: { present: boolean; details: string };
  /** All metrics independently indicate consciousness */
  allPassed: boolean;
}

export interface FirstPersonProbeResult {
  stimulusId: string;
  semanticSimilarity: number;
  expertRating: "same-quality" | "different-quality" | "uncertain";
}

export interface FirstPersonDialogueResult {
  originalRating: number; // 1-5 Likert
  emulationRating: number; // 1-5 Likert
  moderatorNotes: string;
}

export interface DivergenceAcknowledgment {
  reportedBy: "original" | "emulation" | "both";
  description: string;
  classification: "substrate-artifact" | "genuine-divergence";
  /** If true, this is a fundamental absence that triggers Layer 3 failure */
  fundamentalAbsence: boolean;
}

export interface FirstPersonResult {
  /** Phase 1: Private experience probes */
  probeResults: FirstPersonProbeResult[];
  meanSemanticSimilarity: number;
  expertSameQualityRate: number;
  phase1Passed: boolean;

  /** Phase 2: Structured experiential dialogue */
  dialogueResult: FirstPersonDialogueResult;
  phase2Passed: boolean;

  /** Phase 3: Divergence acknowledgment */
  divergences: DivergenceAcknowledgment[];
  hasFundamentalAbsence: boolean;
  phase3Passed: boolean;

  /** Overall first-person verification */
  overallPassed: boolean;
}

export interface Layer3Result {
  status: LayerStatus; // "PASS" | "FAIL" | "PROVISIONAL"
  consciousnessMetrics: ConsciousnessAssessment;
  firstPersonVerification: FirstPersonResult | null; // null if original unavailable
  failureFlags: FailureClassification[];
}

// ── Overall Validation Result ───────────────────────────────────────────────

export interface ValidationResult {
  emulationId: string;
  biologicalSourceId: string;
  timestamp: Date;

  layer1: Layer1Result;
  layer2: Layer2Result;
  layer3: Layer3Result;

  overallVerdict: OverallVerdict;
  failureModes: FailureClassification[];
  recommendations: string[];
}

// ── Emulation Observer Interface ────────────────────────────────────────────
// Required API from Neural Simulation (0.2.2.1.3)

export interface Duration {
  value: number;
  unit: "ms" | "s" | "min" | "hr";
}

export interface FiringRateTimeSeries {
  regionId: string;
  timestamps: Float64Array;
  rates: Float64Array;
}

export interface PowerSpectrum {
  regionId: string;
  /** Canonical frequency bands */
  bands: Map<string, { power: number; frequency_range_hz: [number, number] }>;
}

export interface ConnectivityMatrix {
  regionIds: string[];
  /** Symmetric matrix as flat array, row-major */
  values: Float64Array;
  size: number;
}

export interface PerturbationProfile {
  type: "TMS-equivalent" | "electrical" | "optogenetic";
  intensity: number;
  duration: Duration;
}

export interface PerturbationResponse {
  complexity: number; // PCI value
  spreadPattern: Map<string, number>;
  latency_ms: number;
}

export type ResponseType = "verbal" | "motor" | "physiological" | "neural-state";

export interface StimulusProfile {
  id: string;
  modality: "visual" | "auditory" | "somatosensory" | "olfactory" | "gustatory" | "multimodal";
  description: string;
  parameters: Record<string, unknown>;
}

export interface StimulusAck {
  stimulusId: string;
  deliveredAt: Date;
  acknowledged: boolean;
}

export interface EmulationResponse {
  stimulusId: string;
  responseType: ResponseType;
  data: unknown;
  latency_ms: number;
}

/** Interface that the neural simulation (0.2.2.1.3) must expose for validation */
export interface EmulationObserver {
  getRegionFiringRates(regionId: string, timeWindow: Duration): FiringRateTimeSeries;
  getOscillatorySpectrum(regionId: string, timeWindow: Duration): PowerSpectrum;
  getFunctionalConnectivity(timeWindow: Duration): ConnectivityMatrix;
  getTransferEntropy(sourceRegion: string, targetRegion: string, timeWindow: Duration): number;

  applyPerturbation(target: string, stimulus: PerturbationProfile): PerturbationResponse;

  presentStimulus(stimulus: StimulusProfile): StimulusAck;
  getEmulationResponse(responseType: ResponseType): EmulationResponse;
}
