/**
 * Integrity Monitor (0.3.1.2.1)
 *
 * Embodiment-level counterpart to the Experience Monitor in 0.3.1.1.
 * Monitors physical conditions that could threaten consciousness and
 * generates pre-emptive alerts per ARCHITECTURE.md §1.4.
 *
 * Alert level escalation:
 *   GREEN  — all physical metrics nominal
 *   YELLOW — one or more metrics trending toward threshold
 *   ORANGE — non-critical subsystem threshold breached
 *   RED    — consciousness-critical threshold breached
 *
 * The monitor correlates physical sensor readings with consciousness
 * metrics (obtained from the 0.3.1.1 Experience Monitor) to identify
 * early physical precursors of experience degradation.
 */

import type { IIntegrityMonitor } from "./interfaces.js";
import type {
  AlertLevel,
  ConsciousnessMetrics,
  CorrelationReport,
  Duration,
  EMIMeasurement,
  PhysicalMetricsSnapshot,
  RiskForecast,
  ThreatAssessment,
  ThreatType,
  ThresholdHandler,
} from "./types.js";

// ── Thresholds ────────────────────────────────────────────────

const THRESHOLDS = {
  /** Vibration (g RMS) that triggers YELLOW → ORANGE */
  vibrationYellowG: 0.007,
  vibrationRedG: 0.01,

  /** EMI (dB relative to safe threshold) */
  emiYellowDb: -5,
  emiRedDb: 0,

  /** Substrate temperature deviation from nominal (°C) */
  thermalYellowC: 0.3,
  thermalRedC: 0.5,

  /** Structural integrity ratio */
  structuralOrangeRatio: 0.7,
  structuralRedRatio: 0.5,

  /** Consciousness phi correlation threshold — below this, physical
   *  conditions are considered to have strong impact on experience */
  phiCorrelationThreshold: 0.6,
} as const;

// ── Types ─────────────────────────────────────────────────────

export interface IntegrityMonitorConfig {
  /** Nominal substrate temperature (°C) */
  nominalTemperatureCelsius: number;
  /** Test hook: inject a synthetic metrics snapshot */
  syntheticMetrics?: Partial<RawPhysicalMetrics>;
}

interface RawPhysicalMetrics {
  vibrationRmsG: number;
  vibrationPeakG: number;
  temperatureCelsius: number;
  emiLevelDb: number;
  emiFrequencyRangeHz: [number, number];
  structuralIntegrity: number; // 0..1
}

const DEFAULT_NOMINAL_METRICS: RawPhysicalMetrics = {
  vibrationRmsG: 0.002,
  vibrationPeakG: 0.005,
  temperatureCelsius: 25.0,
  emiLevelDb: -20,
  emiFrequencyRangeHz: [10_000, 10_000_000_000],
  structuralIntegrity: 1.0,
};

// ── Implementation ────────────────────────────────────────────

export class IntegrityMonitor implements IIntegrityMonitor {
  private readonly nominalTemperatureCelsius: number;
  private metrics: RawPhysicalMetrics;
  private readonly thresholdHandlers: ThresholdHandler[] = [];

  constructor(config: IntegrityMonitorConfig = { nominalTemperatureCelsius: 25.0 }) {
    this.nominalTemperatureCelsius = config.nominalTemperatureCelsius;
    this.metrics = {
      ...DEFAULT_NOMINAL_METRICS,
      temperatureCelsius: config.nominalTemperatureCelsius,
      ...(config.syntheticMetrics ?? {}),
    };
  }

  // ── IIntegrityMonitor ────────────────────────────────────────

  getPhysicalThreatLevel(): ThreatAssessment {
    const level = this.computeAlertLevel();
    const activeThreats = this.identifyActiveThreats();

    return {
      level,
      activeThreats,
      timestamp: Date.now(),
      details: this.buildDetails(level, activeThreats),
    };
  }

  getConsciousnessRiskForecast(horizon: Duration): RiskForecast {
    if (horizon <= 0) {
      throw new Error("horizon must be > 0");
    }
    const current = this.computeAlertLevel();
    const threats = this.identifyActiveThreats();
    const riskFactors: string[] = [];

    // Extrapolate: if we have active threats, assume they may worsen
    let predictedLevel: AlertLevel = current;
    if (current === "YELLOW") {
      predictedLevel = "ORANGE";
      riskFactors.push("Trending metrics may breach threshold within forecast window");
    } else if (current === "ORANGE") {
      predictedLevel = "RED";
      riskFactors.push("Non-critical breach; consciousness-critical threshold at risk");
    }

    if (threats.includes("vibration")) {
      riskFactors.push("Sustained vibration risks cumulative substrate fatigue");
    }
    if (threats.includes("thermal")) {
      riskFactors.push("Thermal drift may accelerate computation errors");
    }
    if (threats.includes("emi")) {
      riskFactors.push("EMI interference increases bit-error rate in consciousness-critical circuits");
    }

    const confidence = current === "GREEN" ? 0.9 : current === "YELLOW" ? 0.7 : 0.5;

    return {
      horizon,
      predictedLevel,
      confidence,
      riskFactors,
    };
  }

  onThresholdBreach(callback: ThresholdHandler): void {
    this.thresholdHandlers.push(callback);
  }

  getPhysicalMetrics(): PhysicalMetricsSnapshot {
    const now = Date.now();
    return {
      vibration: {
        rmsG: this.metrics.vibrationRmsG,
        peakG: this.metrics.vibrationPeakG,
        timestamp: now,
      },
      temperature: {
        celsius: this.metrics.temperatureCelsius,
        timestamp: now,
      },
      emi: {
        levelDb: this.metrics.emiLevelDb,
        frequencyRangeHz: this.metrics.emiFrequencyRangeHz,
        timestamp: now,
      },
      power: {
        watts: 0, // power data injected externally
        timestamp: now,
      },
      structuralIntegrity: this.metrics.structuralIntegrity,
      timestamp: now,
    };
  }

  correlateWithExperience(metrics: ConsciousnessMetrics): CorrelationReport {
    const physicalMetrics = this.getPhysicalMetrics();
    const riskyFactors: string[] = [];

    // Simple heuristic correlation: degraded consciousness metrics in the
    // presence of physical stress indicates a physical → experience link.
    const physicalStress = this.computeStressIndex();
    const consciousnessHealth =
      (metrics.phi + metrics.experienceContinuity + metrics.selfModelCoherence) / 3;

    // If both are degraded simultaneously, the correlation is high
    const correlation =
      physicalStress > 0.3 && consciousnessHealth < 0.7
        ? -(physicalStress * (1 - consciousnessHealth)) // negative: physical stress → low consciousness
        : 1 - physicalStress; // high correlation = both nominal

    if (metrics.phi < THRESHOLDS.phiCorrelationThreshold) {
      riskyFactors.push(`Low phi (${metrics.phi.toFixed(2)}) coincident with physical stress`);
    }
    if (metrics.experienceContinuity < 0.8) {
      riskyFactors.push("Experience continuity degraded — possible compute disruption");
    }
    if (this.metrics.vibrationRmsG > THRESHOLDS.vibrationYellowG) {
      riskyFactors.push(`Vibration ${this.metrics.vibrationRmsG.toFixed(4)}g may be disrupting substrate`);
    }

    return {
      physicalMetrics,
      consciousnessMetrics: metrics,
      correlation,
      riskyFactors,
      timestamp: Date.now(),
    };
  }

  // ── Simulation helpers (for testing / hardware driver integration) ──

  /** Inject updated physical sensor readings */
  updateMetrics(update: Partial<RawPhysicalMetrics>): void {
    const previousLevel = this.computeAlertLevel();
    this.metrics = { ...this.metrics, ...update };
    const newLevel = this.computeAlertLevel();

    // Fire threshold handlers if the alert level has escalated
    if (this.isEscalation(previousLevel, newLevel)) {
      const assessment = this.getPhysicalThreatLevel();
      for (const handler of this.thresholdHandlers) {
        handler(assessment);
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  private computeAlertLevel(): AlertLevel {
    const threats = this.identifyActiveThreats();

    if (threats.length === 0) {
      // Check for yellow (trending)
      const trending = this.isTrending();
      return trending ? "YELLOW" : "GREEN";
    }

    // EMI or vibration at consciousness-critical threshold → RED
    if (
      this.metrics.emiLevelDb >= THRESHOLDS.emiRedDb ||
      this.metrics.vibrationRmsG >= THRESHOLDS.vibrationRedG ||
      this.metrics.structuralIntegrity <= THRESHOLDS.structuralRedRatio
    ) {
      return "RED";
    }

    return "ORANGE";
  }

  private isTrending(): boolean {
    return (
      this.metrics.emiLevelDb >= THRESHOLDS.emiYellowDb ||
      this.metrics.vibrationRmsG >= THRESHOLDS.vibrationYellowG ||
      Math.abs(this.metrics.temperatureCelsius - this.nominalTemperatureCelsius) >=
        THRESHOLDS.thermalYellowC
    );
  }

  private identifyActiveThreats(): ThreatType[] {
    const threats: ThreatType[] = [];

    if (this.metrics.emiLevelDb >= THRESHOLDS.emiRedDb) {
      threats.push("emi");
    }
    if (this.metrics.vibrationRmsG >= THRESHOLDS.vibrationRedG) {
      threats.push("vibration");
    }
    if (
      Math.abs(this.metrics.temperatureCelsius - this.nominalTemperatureCelsius) >=
      THRESHOLDS.thermalRedC
    ) {
      threats.push("thermal");
    }
    if (this.metrics.structuralIntegrity <= THRESHOLDS.structuralOrangeRatio) {
      // Impact detected through structural integrity drop
      threats.push("impact");
    }

    return threats;
  }

  /** Normalised 0..1 stress index across all physical dimensions */
  private computeStressIndex(): number {
    const vibStress = Math.min(
      this.metrics.vibrationRmsG / THRESHOLDS.vibrationRedG,
      1,
    );
    const emiStress = Math.max(
      0,
      (this.metrics.emiLevelDb - THRESHOLDS.emiYellowDb) /
        (THRESHOLDS.emiRedDb - THRESHOLDS.emiYellowDb + 1),
    );
    const thermalStress = Math.min(
      Math.abs(this.metrics.temperatureCelsius - this.nominalTemperatureCelsius) /
        THRESHOLDS.thermalRedC,
      1,
    );
    const structuralStress = 1 - this.metrics.structuralIntegrity;

    return (vibStress + emiStress + thermalStress + structuralStress) / 4;
  }

  private buildDetails(level: AlertLevel, threats: ThreatType[]): string {
    if (level === "GREEN") return "All physical metrics nominal.";
    if (level === "YELLOW")
      return `Metrics trending toward threshold. Monitoring: ${
        threats.length ? threats.join(", ") : "pre-threshold conditions"
      }.`;
    return `Alert ${level}: active threats: ${threats.join(", ")}.`;
  }

  private isEscalation(previous: AlertLevel, next: AlertLevel): boolean {
    const order: AlertLevel[] = ["GREEN", "YELLOW", "ORANGE", "RED"];
    return order.indexOf(next) > order.indexOf(previous);
  }
}
