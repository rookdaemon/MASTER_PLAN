/**
 * Graceful Degradation — Biological Health Monitor
 *
 * Monitors biological substrate health via neural activity, metabolic,
 * vascular, and synaptic signals. Provides health scores, failure type
 * classification, trend-based decline projection, and alert levels.
 *
 * All environment time is injected via Clock (testable, no direct Date.now()).
 * All signal I/O is injected via BioSignalSource (testable, no hardware coupling).
 *
 * See: docs/graceful-degradation/ARCHITECTURE.md §3.1
 * Card: 0.2.2.4.3
 */

import {
  AlertLevel,
  BioFailureType,
  type ActivityMetrics,
  type BioHealthMonitor,
  type BrainRegion,
  type DeclineProjection,
  type HealthScore,
  type MetabolicMetrics,
  type PerfusionMetrics,
  type SynapticMetrics,
} from "./types.js";

// ── Threshold Registry constants ─────────────────────────────────────────────
// Values match Threshold Registry entries in card 0.2.2.4.3.

/** Minimum health for GREEN alert (TIER_GREEN_THRESHOLD) */
const TIER_GREEN_THRESHOLD = 0.80;
/** Minimum health for YELLOW alert (TIER_YELLOW_THRESHOLD) */
const TIER_YELLOW_THRESHOLD = 0.50;
/** Minimum health for ORANGE tier; used as critical projection target (TIER_ORANGE_THRESHOLD) */
const TIER_ORANGE_THRESHOLD = 0.25;

// ── Injectable Abstractions ───────────────────────────────────────────────────

/**
 * Abstracts time so callers can inject controllable clocks in tests.
 */
export interface Clock {
  /** Returns the current wall-clock time in milliseconds. */
  now(): number;
}

/**
 * Abstracts raw signal reading from biological substrate hardware.
 * Implementations may talk to the BSI (0.2.2.4.1) or return simulated data.
 * All returned metrics are normalized to [0.0, 1.0] where applicable.
 */
export interface BioSignalSource {
  getActivity(region: BrainRegion, timestamp_ms: number): ActivityMetrics;
  getMetabolic(region: BrainRegion, timestamp_ms: number): MetabolicMetrics;
  getVascular(region: BrainRegion, timestamp_ms: number): PerfusionMetrics;
  getSynaptic(region: BrainRegion, timestamp_ms: number): SynapticMetrics;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Configurable thresholds and window parameters for the BioHealthMonitor.
 * All values have documented defaults; override for specific substrates.
 */
export interface BioMonitorConfig {
  /**
   * LFP power (normalized 0–1) below which "dropout" is declared for SUDDEN
   * failure detection. Default 0.05 (near-zero = neural silence).
   */
  suddenLfpDropoutThreshold?: number;

  /**
   * Spike rate (Hz) below which "neural silence" is declared for SUDDEN
   * failure detection. Default 1.0 Hz (essentially silent cortex).
   */
  neuralSilenceHz?: number;

  /**
   * Slope (health per ms) at or below which GRADUAL failure is declared.
   * Default -1e-5 (~1% per second sustained decline).
   */
  gradualSlopeThreshold?: number;

  /**
   * Minimum samples in history required before a projection has non-zero
   * confidence. Default 3.
   */
  minSamplesForProjection?: number;

  /**
   * Maximum health history samples retained per region (oldest are dropped).
   * Default 200.
   */
  maxHistorySamples?: number;
}

const DEFAULT_CONFIG: Required<BioMonitorConfig> = {
  suddenLfpDropoutThreshold: 0.05,
  neuralSilenceHz: 1.0,
  gradualSlopeThreshold: -1e-5,
  minSamplesForProjection: 3,
  maxHistorySamples: 200,
};

// ── Internal types ────────────────────────────────────────────────────────────

interface HealthSample {
  readonly timestamp_ms: number;
  readonly health: HealthScore;
}

interface RegressionResult {
  readonly slope: number;
  readonly rSquared: number;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute the health score for a region from its four sub-metric groups.
 * Each group is averaged internally, then all four group scores are averaged.
 */
export function computeRegionHealthScore(
  activity: ActivityMetrics,
  metabolic: MetabolicMetrics,
  vascular: PerfusionMetrics,
  synaptic: SynapticMetrics,
): HealthScore {
  const neuralScore = activity.lfpPower; // already normalized
  const metabolicScore = (metabolic.oxygenSaturation + metabolic.glucoseLevel) / 2;
  const vascularScore = vascular.flowRate;
  const synapticScore = (synaptic.density + synaptic.transmissionFidelity) / 2;
  const raw = (neuralScore + metabolicScore + vascularScore + synapticScore) / 4;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Least-squares linear regression on a series of (timestamp_ms, health) points.
 * Returns slope (health change per ms) and R² goodness-of-fit (0–1).
 */
function computeLinearRegression(samples: HealthSample[]): RegressionResult {
  const n = samples.length;
  if (n < 2) return { slope: 0, rSquared: 0 };

  const meanX = samples.reduce((s, p) => s + p.timestamp_ms, 0) / n;
  const meanY = samples.reduce((s, p) => s + p.health, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of samples) {
    const dx = p.timestamp_ms - meanX;
    const dy = p.health - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  if (sxx === 0) return { slope: 0, rSquared: syy === 0 ? 1 : 0 };
  const slope = sxy / sxx;
  const rSquared = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);

  return { slope, rSquared };
}

// ── DefaultBioHealthMonitor ───────────────────────────────────────────────────

/**
 * Concrete implementation of BioHealthMonitor.
 *
 * Computes per-region health as the arithmetic mean of four normalized
 * sub-health scores (neural, metabolic, vascular, synaptic). Accumulates a
 * rolling history of health samples per region for trend analysis.
 *
 * Failure detection:
 * - SUDDEN: any region shows LFP dropout (lfpPower < suddenLfpDropoutThreshold)
 *   combined with neural silence (spikeRate < neuralSilenceHz).
 * - GRADUAL: any region's linear slope ≤ gradualSlopeThreshold over history.
 * - NONE: no failure signals detected.
 */
export class DefaultBioHealthMonitor implements BioHealthMonitor {
  private readonly registeredRegions: readonly BrainRegion[];
  private readonly signalSource: BioSignalSource;
  private readonly clock: Clock;
  private readonly config: Required<BioMonitorConfig>;
  private readonly healthHistory: Map<BrainRegion, HealthSample[]>;

  constructor(
    regions: BrainRegion[],
    signalSource: BioSignalSource,
    clock: Clock,
    config?: BioMonitorConfig,
  ) {
    this.registeredRegions = [...regions];
    this.signalSource = signalSource;
    this.clock = clock;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.healthHistory = new Map(regions.map((r) => [r, []]));
  }

  // ── BioHealthMonitor interface ──────────────────────────────────────────────

  neuralActivityLevel(region: BrainRegion): ActivityMetrics {
    return this.signalSource.getActivity(region, this.clock.now());
  }

  metabolicStatus(region: BrainRegion): MetabolicMetrics {
    return this.signalSource.getMetabolic(region, this.clock.now());
  }

  vascularFlow(region: BrainRegion): PerfusionMetrics {
    return this.signalSource.getVascular(region, this.clock.now());
  }

  synapticIntegrity(region: BrainRegion): SynapticMetrics {
    return this.signalSource.getSynaptic(region, this.clock.now());
  }

  /**
   * Compute and record the current health score for a brain region.
   * Updates internal history; call periodically to build trend data.
   */
  regionHealth(region: BrainRegion): HealthScore {
    const ts = this.clock.now();
    const activity = this.signalSource.getActivity(region, ts);
    const metabolic = this.signalSource.getMetabolic(region, ts);
    const vascular = this.signalSource.getVascular(region, ts);
    const synaptic = this.signalSource.getSynaptic(region, ts);

    const health = computeRegionHealthScore(activity, metabolic, vascular, synaptic);
    this.appendHistory(region, ts, health);
    return health;
  }

  /**
   * Returns the minimum (worst-case) health score across all registered
   * regions. Satisfies invariant: overallBioHealth() ≤ all regionHealth() scores.
   */
  overallBioHealth(): HealthScore {
    if (this.registeredRegions.length === 0) return 0.0;
    let worst = 1.0;
    for (const region of this.registeredRegions) {
      worst = Math.min(worst, this.regionHealth(region));
    }
    return worst;
  }

  /**
   * Classify the current failure signal pattern.
   * Checks for sudden LFP dropout first, then declining trend.
   */
  failureType(): BioFailureType {
    const ts = this.clock.now();

    // SUDDEN: any region shows LFP dropout + neural silence
    for (const region of this.registeredRegions) {
      const activity = this.signalSource.getActivity(region, ts);
      if (
        activity.lfpPower < this.config.suddenLfpDropoutThreshold &&
        activity.spikeRate < this.config.neuralSilenceHz
      ) {
        return BioFailureType.Sudden;
      }
    }

    // GRADUAL: any region has a sufficiently negative health trend in history
    for (const region of this.registeredRegions) {
      const history = this.healthHistory.get(region) ?? [];
      if (history.length >= this.config.minSamplesForProjection) {
        const { slope } = computeLinearRegression(history);
        if (slope <= this.config.gradualSlopeThreshold) {
          return BioFailureType.Gradual;
        }
      }
    }

    return BioFailureType.None;
  }

  /**
   * Project health decline over the given horizon.
   *
   * Uses the accumulated history of the worst-trending region to fit a linear
   * model and extrapolate forward. Takes a fresh current measurement first
   * (updates history as a side effect).
   *
   * @param horizon_ms - Projection lookahead in milliseconds
   */
  projectedDecline(horizon_ms: number): DeclineProjection {
    // Take a fresh measurement so currentHealth is up-to-date and in history
    const currentHealth = this.overallBioHealth();

    // Find the worst trend across all regions
    let worstSlope = 0;
    let worstRSquared = 0;
    let worstSampleCount = 0;

    for (const region of this.registeredRegions) {
      const history = this.healthHistory.get(region) ?? [];
      if (history.length >= 2) {
        const { slope, rSquared } = computeLinearRegression(history);
        if (slope < worstSlope) {
          worstSlope = slope;
          worstRSquared = rSquared;
          worstSampleCount = history.length;
        }
      }
    }

    const projectedHealth = Math.max(
      0,
      Math.min(1, currentHealth + worstSlope * horizon_ms),
    );

    // Time until health crosses into ORANGE tier (critical threshold)
    let timeToCritical_ms = -1;
    if (worstSlope < 0 && currentHealth > TIER_ORANGE_THRESHOLD) {
      timeToCritical_ms = (currentHealth - TIER_ORANGE_THRESHOLD) / -worstSlope;
    }

    // Confidence: grows with sample count, weighted by R²
    const confidence =
      worstSampleCount < 2
        ? 0
        : Math.min(worstSampleCount / this.config.minSamplesForProjection, 1.0) *
          worstRSquared;

    return {
      projectedHealth,
      timeToCritical_ms,
      confidence: Math.max(0, confidence),
    };
  }

  /**
   * Alert level derived monotonically from overallBioHealth():
   * ≥ 0.80 → NONE; 0.50–0.80 → WARNING; 0.25–0.50 → CRITICAL; < 0.25 → EMERGENCY
   */
  alertLevel(): AlertLevel {
    const health = this.overallBioHealth();
    if (health >= TIER_GREEN_THRESHOLD) return AlertLevel.None;
    if (health >= TIER_YELLOW_THRESHOLD) return AlertLevel.Warning;
    if (health >= TIER_ORANGE_THRESHOLD) return AlertLevel.Critical;
    return AlertLevel.Emergency;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private appendHistory(
    region: BrainRegion,
    timestamp_ms: number,
    health: HealthScore,
  ): void {
    const history = this.healthHistory.get(region);
    if (!history) return;
    history.push({ timestamp_ms, health });
    if (history.length > this.config.maxHistorySamples) {
      history.splice(0, history.length - this.config.maxHistorySamples);
    }
  }
}
