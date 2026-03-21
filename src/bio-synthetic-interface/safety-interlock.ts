/**
 * Bio-Synthetic Interface — Safety Interlock
 *
 * Hardware-enforced safety layer implementing:
 * - Charge density limiting (cannot be overridden by software)
 * - Seizure pattern detection (sustained high-frequency synchronous firing)
 * - Stimulation suspension logic (immediate suspension, delayed resumption)
 *
 * Design Decision D2: Hardware-enforced safety with software supervision.
 * All timestamps are injected as parameters for testability (per CLAUDE.md).
 */

import {
  CHARGE_DENSITY_LIMIT,
  type StimulationCommand,
} from "./types.js";

// ──────────────────────────────────────────────────────────────────────────────
// Constants from Behavioral Spec
// ──────────────────────────────────────────────────────────────────────────────

/** Seizure detection: firing rate must exceed baseline by this many σ. */
export const SEIZURE_DETECTION_SIGMA_THRESHOLD = 2;

/** Seizure detection: percentage of channels that must be elevated. */
export const SEIZURE_CHANNEL_PERCENTAGE_THRESHOLD = 30;

/** Seizure subsidence: stimulation remains suspended for this duration (μs) after pattern subsides. */
export const SEIZURE_SUBSIDENCE_DURATION_US = 5_000_000;

// ──────────────────────────────────────────────────────────────────────────────
// Interfaces
// ──────────────────────────────────────────────────────────────────────────────

/** Seizure event data for logging and post-hoc analysis. */
export interface SeizureEvent {
  readonly timestampUs: number;
  readonly elevatedChannelCount: number;
  readonly totalChannelCount: number;
  readonly elevatedPercentage: number;
  readonly channelDetails: ReadonlyMap<
    string,
    { firingRateHz: number; baselineMeanHz: number; baselineSigmaHz: number }
  >;
}

/** Injectable logger for safety events (per CLAUDE.md: wrap environment interactions). */
export interface SafetyEventLogger {
  logSeizureDetected(event: SeizureEvent): void;
  logStimulationSuspended(timestampUs: number): void;
  logStimulationResumed(timestampUs: number): void;
  logChargeDensityViolation(command: StimulationCommand): void;
}

/** Configurable safety parameters (per CLAUDE.md: modularity and configurability). */
export interface SafetyInterlockConfig {
  readonly chargeDensityLimit: number;
  readonly seizureSigmaThreshold: number;
  readonly seizureChannelPercentageThreshold: number;
  readonly seizureSubsidenceDurationUs: number;
  readonly totalChannelCount: number;
}

/** Default configuration using Threshold Registry and Behavioral Spec values. */
export const DEFAULT_SAFETY_INTERLOCK_CONFIG: SafetyInterlockConfig = {
  chargeDensityLimit: CHARGE_DENSITY_LIMIT,
  seizureSigmaThreshold: SEIZURE_DETECTION_SIGMA_THRESHOLD,
  seizureChannelPercentageThreshold: SEIZURE_CHANNEL_PERCENTAGE_THRESHOLD,
  seizureSubsidenceDurationUs: SEIZURE_SUBSIDENCE_DURATION_US,
  totalChannelCount: 0,
};

// ──────────────────────────────────────────────────────────────────────────────
// Running statistics tracker for a single channel
// ──────────────────────────────────────────────────────────────────────────────

/** Welford's online algorithm for computing running mean and variance. */
class ChannelStats {
  private _count = 0;
  private _mean = 0;
  private _m2 = 0;
  private _latest = 0;

  update(value: number): void {
    this._count++;
    const delta = value - this._mean;
    this._mean += delta / this._count;
    const delta2 = value - this._mean;
    this._m2 += delta * delta2;
    this._latest = value;
  }

  get mean(): number {
    return this._mean;
  }

  get variance(): number {
    return this._count < 2 ? 0 : this._m2 / (this._count - 1);
  }

  get sigma(): number {
    return Math.sqrt(this.variance);
  }

  get latest(): number {
    return this._latest;
  }

  get count(): number {
    return this._count;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Safety Interlock
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Hardware-enforced safety interlock for the bio-synthetic interface.
 *
 * Responsibilities:
 * 1. Charge density limiting — rejects commands exceeding the Shannon limit
 * 2. Seizure pattern detection — monitors channel firing rates for synchronous elevation
 * 3. Stimulation suspension — suspends all stimulation on seizure detection
 * 4. Resumption logic — resumes only after seizure subsides for configured duration
 */
export class SafetyInterlock {
  private readonly config: SafetyInterlockConfig;
  private readonly logger: SafetyEventLogger;
  private readonly channelStats: Map<string, ChannelStats> = new Map();

  private _seizureDetected = false;
  private _stimulationSuspended = false;
  private _seizureSubsidedAtUs: number | null = null;

  constructor(config: SafetyInterlockConfig, logger: SafetyEventLogger) {
    this.config = config;
    this.logger = logger;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Charge density limiting
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Validate that a stimulation command does not exceed hardware safety limits.
   * Contract invariant: hardware limits cannot be exceeded regardless of command content.
   * Contract invariant: stimulation is always charge-balanced.
   */
  validateChargeDensity(command: StimulationCommand): boolean {
    if (!command.chargeBalanced) {
      this.logger.logChargeDensityViolation(command);
      return false;
    }

    if (command.chargePerPhaseMuCPerCm2 > this.config.chargeDensityLimit) {
      this.logger.logChargeDensityViolation(command);
      return false;
    }

    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Channel activity tracking
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Update firing rate observation for a channel.
   * Timestamps are passed as parameters (per CLAUDE.md).
   */
  updateChannelActivity(
    channelId: string,
    firingRateHz: number,
    _timestampUs: number
  ): void {
    let stats = this.channelStats.get(channelId);
    if (!stats) {
      stats = new ChannelStats();
      this.channelStats.set(channelId, stats);
    }
    stats.update(firingRateHz);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Seizure detection
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Evaluate whether current channel activity constitutes a seizure pattern.
   *
   * Behavioral Spec: seizure-like activity = sustained high-frequency synchronous
   * firing > 2σ above baseline across ≥30% of channels.
   *
   * Returns true if seizure condition is met.
   */
  evaluateSeizureCondition(timestampUs: number): boolean {
    const totalChannels =
      this.config.totalChannelCount > 0
        ? this.config.totalChannelCount
        : this.channelStats.size;

    if (totalChannels === 0) return false;

    let elevatedCount = 0;
    const channelDetails = new Map<
      string,
      { firingRateHz: number; baselineMeanHz: number; baselineSigmaHz: number }
    >();

    for (const [channelId, stats] of this.channelStats) {
      if (stats.count < 2) continue;

      const deviation = stats.latest - stats.mean;
      const sigma = stats.sigma;

      // Channel is elevated if latest rate > mean + threshold * σ
      // and sigma > 0 (avoid division by zero edge case)
      if (sigma > 0 && deviation > this.config.seizureSigmaThreshold * sigma) {
        elevatedCount++;
        channelDetails.set(channelId, {
          firingRateHz: stats.latest,
          baselineMeanHz: stats.mean,
          baselineSigmaHz: sigma,
        });
      }
    }

    const elevatedPercentage = (elevatedCount / totalChannels) * 100;
    const isSeizure =
      elevatedPercentage >= this.config.seizureChannelPercentageThreshold;

    if (isSeizure) {
      this._seizureDetected = true;
      this._seizureSubsidedAtUs = null; // Reset subsidence timer

      if (!this._stimulationSuspended) {
        this._stimulationSuspended = true;
        this.logger.logStimulationSuspended(timestampUs);
      }

      const event: SeizureEvent = {
        timestampUs,
        elevatedChannelCount: elevatedCount,
        totalChannelCount: totalChannels,
        elevatedPercentage,
        channelDetails,
      };
      this.logger.logSeizureDetected(event);
    } else if (this._stimulationSuspended) {
      // Seizure pattern has subsided — start or continue subsidence timer
      if (this._seizureSubsidedAtUs === null) {
        this._seizureSubsidedAtUs = timestampUs;
      }

      // Check if subsidence duration has elapsed
      const subsidenceDuration = timestampUs - this._seizureSubsidedAtUs;
      if (subsidenceDuration >= this.config.seizureSubsidenceDurationUs) {
        this._stimulationSuspended = false;
        this._seizureDetected = false;
        this._seizureSubsidedAtUs = null;
        this.logger.logStimulationResumed(timestampUs);
      }
    }

    return isSeizure;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stimulation gating
  // ──────────────────────────────────────────────────────────────────────────

  /** Check if stimulation is currently suspended due to seizure detection. */
  isStimulationSuspended(): boolean {
    return this._stimulationSuspended;
  }

  /**
   * Combined safety check: is this command safe to execute right now?
   * Checks both charge density limits AND seizure suspension state.
   */
  canStimulate(command: StimulationCommand, _timestampUs: number): boolean {
    if (this._stimulationSuspended) return false;
    return this.validateChargeDensity(command);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Health reporting
  // ──────────────────────────────────────────────────────────────────────────

  /** Get current seizure/suspension status for InterfaceHealthReport. */
  getSeizureStatus(): { detected: boolean; suspended: boolean } {
    return {
      detected: this._seizureDetected,
      suspended: this._stimulationSuspended,
    };
  }
}
