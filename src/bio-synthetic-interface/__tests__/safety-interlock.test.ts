import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SafetyInterlock,
  SafetyInterlockConfig,
  SafetyEventLogger,
  SeizureEvent,
  DEFAULT_SAFETY_INTERLOCK_CONFIG,
  SEIZURE_DETECTION_SIGMA_THRESHOLD,
  SEIZURE_CHANNEL_PERCENTAGE_THRESHOLD,
  SEIZURE_SUBSIDENCE_DURATION_US,
} from "../safety-interlock.js";
import {
  CHARGE_DENSITY_LIMIT,
  type StimulationCommand,
} from "../types.js";

function makeCommand(
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

function createMockLogger(): SafetyEventLogger {
  return {
    logSeizureDetected: vi.fn(),
    logStimulationSuspended: vi.fn(),
    logStimulationResumed: vi.fn(),
    logChargeDensityViolation: vi.fn(),
  };
}

describe("Bio-Synthetic Interface — Safety Interlock", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Threshold Registry constants
  // ──────────────────────────────────────────────────────────────────────────
  describe("Threshold constants from Behavioral Spec", () => {
    it("SEIZURE_DETECTION_SIGMA_THRESHOLD is 2 standard deviations", () => {
      expect(SEIZURE_DETECTION_SIGMA_THRESHOLD).toBe(2);
    });

    it("SEIZURE_CHANNEL_PERCENTAGE_THRESHOLD is 30%", () => {
      expect(SEIZURE_CHANNEL_PERCENTAGE_THRESHOLD).toBe(30);
    });

    it("SEIZURE_SUBSIDENCE_DURATION_US is 5 seconds (5,000,000 μs)", () => {
      expect(SEIZURE_SUBSIDENCE_DURATION_US).toBe(5_000_000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Charge density limiting
  // ──────────────────────────────────────────────────────────────────────────
  describe("Charge density limiting", () => {
    let interlock: SafetyInterlock;
    let logger: SafetyEventLogger;

    beforeEach(() => {
      logger = createMockLogger();
      interlock = new SafetyInterlock(DEFAULT_SAFETY_INTERLOCK_CONFIG, logger);
    });

    it("accepts a command within charge density limit", () => {
      const cmd = makeCommand({ chargePerPhaseMuCPerCm2: 25 });
      expect(interlock.validateChargeDensity(cmd)).toBe(true);
    });

    it("accepts a command exactly at charge density limit", () => {
      const cmd = makeCommand({
        chargePerPhaseMuCPerCm2: CHARGE_DENSITY_LIMIT,
      });
      expect(interlock.validateChargeDensity(cmd)).toBe(true);
    });

    it("rejects a command exceeding charge density limit", () => {
      const cmd = makeCommand({ chargePerPhaseMuCPerCm2: 35 });
      expect(interlock.validateChargeDensity(cmd)).toBe(false);
    });

    it("logs a charge density violation on rejection", () => {
      const cmd = makeCommand({ chargePerPhaseMuCPerCm2: 35 });
      interlock.validateChargeDensity(cmd);
      expect(logger.logChargeDensityViolation).toHaveBeenCalledWith(cmd);
    });

    it("does not log on acceptance", () => {
      const cmd = makeCommand({ chargePerPhaseMuCPerCm2: 25 });
      interlock.validateChargeDensity(cmd);
      expect(logger.logChargeDensityViolation).not.toHaveBeenCalled();
    });

    it("rejects non-charge-balanced commands", () => {
      const cmd = makeCommand({ chargeBalanced: false });
      expect(interlock.validateChargeDensity(cmd)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Seizure detection
  // ──────────────────────────────────────────────────────────────────────────
  describe("Seizure pattern detection", () => {
    let interlock: SafetyInterlock;
    let logger: SafetyEventLogger;
    const totalChannels = 100;

    beforeEach(() => {
      logger = createMockLogger();
      interlock = new SafetyInterlock(
        { ...DEFAULT_SAFETY_INTERLOCK_CONFIG, totalChannelCount: totalChannels },
        logger
      );
    });

    it("does not detect seizure when all channels are at baseline", () => {
      // Establish baseline: all channels firing at ~10 Hz
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10, t * 1_000_000);
        }
      }
      expect(interlock.evaluateSeizureCondition(10_000_000)).toBe(false);
    });

    it("detects seizure when >2σ above baseline across ≥30% of channels", () => {
      // Establish baseline: all channels firing at ~10 Hz with low variance
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }

      const timestampUs = 11_000_000;
      // 35 channels (35% ≥ 30%) spike to very high firing rate (well above 2σ)
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, timestampUs);
      }
      // Remaining channels normal
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, timestampUs);
      }

      expect(interlock.evaluateSeizureCondition(timestampUs)).toBe(true);
    });

    it("does not detect seizure when <30% of channels are elevated", () => {
      // Establish baseline
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }

      const timestampUs = 11_000_000;
      // Only 25 channels (25% < 30%) spike high
      for (let ch = 0; ch < 25; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, timestampUs);
      }
      for (let ch = 25; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, timestampUs);
      }

      expect(interlock.evaluateSeizureCondition(timestampUs)).toBe(false);
    });

    it("does not detect seizure when elevation is <2σ above baseline", () => {
      // Establish baseline with variance: mean ~10, σ ≈ 0.5
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }

      const timestampUs = 11_000_000;
      // All channels only slightly elevated (within 2σ)
      for (let ch = 0; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 11, timestampUs);
      }

      expect(interlock.evaluateSeizureCondition(timestampUs)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Stimulation suspension logic
  // ──────────────────────────────────────────────────────────────────────────
  describe("Stimulation suspension", () => {
    let interlock: SafetyInterlock;
    let logger: SafetyEventLogger;
    const totalChannels = 100;

    beforeEach(() => {
      logger = createMockLogger();
      interlock = new SafetyInterlock(
        { ...DEFAULT_SAFETY_INTERLOCK_CONFIG, totalChannelCount: totalChannels },
        logger
      );
    });

    it("suspends stimulation when seizure is detected", () => {
      // Establish baseline
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }

      expect(interlock.isStimulationSuspended()).toBe(false);

      // Trigger seizure
      const seizureTime = 11_000_000;
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, seizureTime);
      }
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, seizureTime);
      }
      interlock.evaluateSeizureCondition(seizureTime);

      expect(interlock.isStimulationSuspended()).toBe(true);
    });

    it("logs seizure detection event", () => {
      // Establish baseline
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }

      const seizureTime = 11_000_000;
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, seizureTime);
      }
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, seizureTime);
      }
      interlock.evaluateSeizureCondition(seizureTime);

      expect(logger.logSeizureDetected).toHaveBeenCalledTimes(1);
      expect(logger.logStimulationSuspended).toHaveBeenCalledWith(seizureTime);
    });

    it("rejects stimulation commands while suspended", () => {
      // Establish baseline + trigger seizure
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }
      const seizureTime = 11_000_000;
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, seizureTime);
      }
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, seizureTime);
      }
      interlock.evaluateSeizureCondition(seizureTime);

      const cmd = makeCommand({ chargePerPhaseMuCPerCm2: 25 });
      expect(interlock.canStimulate(cmd, seizureTime + 1_000_000)).toBe(false);
    });

    it("resumes stimulation after seizure subsides for ≥5 seconds", () => {
      // Establish baseline + trigger seizure
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }
      const seizureTime = 11_000_000;
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, seizureTime);
      }
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, seizureTime);
      }
      interlock.evaluateSeizureCondition(seizureTime);

      expect(interlock.isStimulationSuspended()).toBe(true);

      // Channels return to normal
      const normalTime = seizureTime + 1_000_000;
      for (let ch = 0; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, normalTime);
      }
      interlock.evaluateSeizureCondition(normalTime);

      // Still suspended — only 1 second since subsidence
      expect(interlock.isStimulationSuspended()).toBe(true);

      // 5 seconds after subsidence
      const resumeTime = normalTime + SEIZURE_SUBSIDENCE_DURATION_US;
      for (let ch = 0; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, resumeTime);
      }
      interlock.evaluateSeizureCondition(resumeTime);

      expect(interlock.isStimulationSuspended()).toBe(false);
      expect(logger.logStimulationResumed).toHaveBeenCalledWith(resumeTime);
    });

    it("does NOT resume if seizure reoccurs during subsidence period", () => {
      // Establish baseline + trigger seizure
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }
      const seizureTime = 11_000_000;
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, seizureTime);
      }
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, seizureTime);
      }
      interlock.evaluateSeizureCondition(seizureTime);

      // Channels normalize briefly
      const normalTime = seizureTime + 1_000_000;
      for (let ch = 0; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, normalTime);
      }
      interlock.evaluateSeizureCondition(normalTime);

      // Seizure reoccurs at 3 seconds — resets subsidence timer
      const reseizureTime = normalTime + 2_000_000;
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, reseizureTime);
      }
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, reseizureTime);
      }
      interlock.evaluateSeizureCondition(reseizureTime);

      // Even after 5 seconds from FIRST subsidence, still suspended
      // because subsidence timer was reset
      const afterFirstNormal = normalTime + SEIZURE_SUBSIDENCE_DURATION_US;
      for (let ch = 0; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, afterFirstNormal);
      }
      interlock.evaluateSeizureCondition(afterFirstNormal);

      expect(interlock.isStimulationSuspended()).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Health report integration
  // ──────────────────────────────────────────────────────────────────────────
  describe("Health report generation", () => {
    let interlock: SafetyInterlock;
    let logger: SafetyEventLogger;
    const totalChannels = 100;

    beforeEach(() => {
      logger = createMockLogger();
      interlock = new SafetyInterlock(
        { ...DEFAULT_SAFETY_INTERLOCK_CONFIG, totalChannelCount: totalChannels },
        logger
      );
    });

    it("reports no seizure when operating normally", () => {
      const status = interlock.getSeizureStatus();
      expect(status.detected).toBe(false);
      expect(status.suspended).toBe(false);
    });

    it("reports seizure detected and stimulation suspended during seizure", () => {
      // Establish baseline + trigger seizure
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }
      const seizureTime = 11_000_000;
      for (let ch = 0; ch < 35; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, seizureTime);
      }
      for (let ch = 35; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, seizureTime);
      }
      interlock.evaluateSeizureCondition(seizureTime);

      const status = interlock.getSeizureStatus();
      expect(status.detected).toBe(true);
      expect(status.suspended).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Configurability
  // ──────────────────────────────────────────────────────────────────────────
  describe("Configurability", () => {
    it("uses custom charge density limit from config", () => {
      const logger = createMockLogger();
      const interlock = new SafetyInterlock(
        { ...DEFAULT_SAFETY_INTERLOCK_CONFIG, chargeDensityLimit: 20 },
        logger
      );
      const cmd = makeCommand({ chargePerPhaseMuCPerCm2: 25 });
      expect(interlock.validateChargeDensity(cmd)).toBe(false);
    });

    it("uses custom seizure thresholds from config", () => {
      const logger = createMockLogger();
      const totalChannels = 100;
      // More sensitive: 1σ threshold, 20% channel threshold
      const interlock = new SafetyInterlock(
        {
          ...DEFAULT_SAFETY_INTERLOCK_CONFIG,
          totalChannelCount: totalChannels,
          seizureSigmaThreshold: 1,
          seizureChannelPercentageThreshold: 20,
        },
        logger
      );

      // Establish baseline at ~10Hz
      for (let t = 0; t < 10; t++) {
        for (let ch = 0; ch < totalChannels; ch++) {
          interlock.updateChannelActivity(`ch-${ch}`, 10 + (t % 2), t * 1_000_000);
        }
      }

      // Only 25 channels elevated (25% ≥ custom 20%)
      const ts = 11_000_000;
      for (let ch = 0; ch < 25; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 200, ts);
      }
      for (let ch = 25; ch < totalChannels; ch++) {
        interlock.updateChannelActivity(`ch-${ch}`, 10, ts);
      }

      // Would NOT be detected with default 30% threshold but IS with custom 20%
      expect(interlock.evaluateSeizureCondition(ts)).toBe(true);
    });
  });
});
