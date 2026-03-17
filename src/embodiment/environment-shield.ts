/**
 * Environment Shield Module (0.3.1.2.1)
 *
 * Physical and electromagnetic protection for the Consciousness Enclosure
 * per ARCHITECTURE.md §1.3. Monitors and reports shielding integrity across
 * EMI, vibration, thermal, and radiation threat vectors.
 *
 * Target attenuation:
 * - Self-generated EMI: ≥ 60 dB at motor drive frequencies
 * - External EMI: ≥ 40 dB across 10 kHz – 10 GHz
 * - Vibration: ≤ 0.01g RMS at substrate
 * - Impact: ≤ 5g peak at substrate for 50g chassis impact
 * - Thermal: ±0.5°C substrate stability
 */

import type { IEnvironmentShield } from "./interfaces.js";
import type {
  EMIMeasurement,
  ShieldHealth,
  ThermalStatus,
  ThreatType,
  VibrationMeasurement,
} from "./types.js";

export interface EnvironmentShieldConfig {
  /** Nominal substrate temperature in °C */
  nominalTemperatureCelsius: number;
  /** Temperature tolerance in °C (±) */
  temperatureToleranceCelsius: number;
  /** Maximum safe vibration at substrate in g RMS */
  maxVibrationRmsG: number;
  /** EMI safe threshold in dB */
  emiSafeThresholdDb: number;
}

const DEFAULT_CONFIG: EnvironmentShieldConfig = {
  nominalTemperatureCelsius: 25.0,
  temperatureToleranceCelsius: 0.5,
  maxVibrationRmsG: 0.01,
  emiSafeThresholdDb: 0.0, // 0 dB = at threshold
};

export class EnvironmentShield implements IEnvironmentShield {
  private readonly config: EnvironmentShieldConfig;

  private currentEmi: EMIMeasurement;
  private currentVibration: VibrationMeasurement;
  private substrateTemp: number;
  private enclosureTemp: number;
  private coolingActive: boolean;
  private faradayCageIntact: boolean;
  private dampingActive: boolean;
  private thermalBarrierIntact: boolean;
  private breaches: Set<ThreatType>;

  constructor(config: Partial<EnvironmentShieldConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const now = Date.now();

    // Initialize to nominal (safe) values
    this.currentEmi = {
      levelDb: -20, // well below threshold
      frequencyRangeHz: [10_000, 10_000_000_000],
      timestamp: now,
    };

    this.currentVibration = {
      rmsG: 0.002, // well below 0.01g limit
      peakG: 0.005,
      timestamp: now,
    };

    this.substrateTemp = this.config.nominalTemperatureCelsius;
    this.enclosureTemp = this.config.nominalTemperatureCelsius + 1.0;
    this.coolingActive = true;
    this.faradayCageIntact = true;
    this.dampingActive = true;
    this.thermalBarrierIntact = true;
    this.breaches = new Set();
  }

  getEMILevel(): EMIMeasurement {
    return { ...this.currentEmi, timestamp: Date.now() };
  }

  getVibrationAtSubstrate(): VibrationMeasurement {
    return { ...this.currentVibration, timestamp: Date.now() };
  }

  getThermalStatus(): ThermalStatus {
    const deviation = Math.abs(
      this.substrateTemp - this.config.nominalTemperatureCelsius,
    );
    const withinTolerance =
      deviation <= this.config.temperatureToleranceCelsius;

    return {
      substrateTemp: { celsius: this.substrateTemp, timestamp: Date.now() },
      enclosureTemp: { celsius: this.enclosureTemp, timestamp: Date.now() },
      coolingActive: this.coolingActive,
      withinTolerance,
    };
  }

  getShieldIntegrity(): ShieldHealth {
    const intactCount = [
      this.faradayCageIntact,
      this.dampingActive,
      this.thermalBarrierIntact,
    ].filter(Boolean).length;

    return {
      overallIntegrity: intactCount / 3,
      breaches: [...this.breaches],
      faradayCageIntact: this.faradayCageIntact,
      dampingActive: this.dampingActive,
      thermalBarrierIntact: this.thermalBarrierIntact,
    };
  }

  reportBreach(type: ThreatType): void {
    this.breaches.add(type);

    switch (type) {
      case "emi":
        this.faradayCageIntact = false;
        this.currentEmi = {
          ...this.currentEmi,
          levelDb: 10, // above threshold
          timestamp: Date.now(),
        };
        break;
      case "vibration":
      case "impact":
        this.dampingActive = false;
        this.currentVibration = {
          rmsG: 0.05, // above 0.01g limit
          peakG: 8.0, // above 5g peak limit
          timestamp: Date.now(),
        };
        break;
      case "thermal":
        this.thermalBarrierIntact = false;
        this.substrateTemp =
          this.config.nominalTemperatureCelsius +
          this.config.temperatureToleranceCelsius * 3; // well outside tolerance
        break;
      case "radiation":
        // Radiation breach doesn't directly affect other shielding layers
        // but is recorded
        break;
    }
  }

  // ── Test / simulation helpers ──────────────────────────────

  /** Simulate an EMI level change (for testing / hardware driver integration) */
  setEMILevel(levelDb: number): void {
    this.currentEmi = {
      ...this.currentEmi,
      levelDb,
      timestamp: Date.now(),
    };
  }

  /** Simulate a vibration level change */
  setVibrationLevel(rmsG: number, peakG: number): void {
    this.currentVibration = {
      rmsG,
      peakG,
      timestamp: Date.now(),
    };
  }

  /** Simulate a substrate temperature change */
  setSubstrateTemperature(celsius: number): void {
    this.substrateTemp = celsius;
  }

  /** Clear all breaches (e.g., after repair) */
  clearBreaches(): void {
    this.breaches.clear();
    this.faradayCageIntact = true;
    this.dampingActive = true;
    this.thermalBarrierIntact = true;

    // Reset to nominal values
    const now = Date.now();
    this.currentEmi = { ...this.currentEmi, levelDb: -20, timestamp: now };
    this.currentVibration = {
      rmsG: 0.002,
      peakG: 0.005,
      timestamp: now,
    };
    this.substrateTemp = this.config.nominalTemperatureCelsius;
  }
}
