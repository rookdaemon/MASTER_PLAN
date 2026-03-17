/**
 * Damage Sensing Layer — Implementation
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Continuous nanoscale monitoring to detect degradation before functional failure.
 */

import {
  SensorType,
  Severity,
  type SensorReading,
  type DegradationAlert,
  type DamageSensor,
} from "./types.js";

// ── Configuration ───────────────────────────────────────────────────────────

export interface SeverityThresholds {
  /** Deviation fraction at which LOW alert is raised */
  low: number;
  /** Deviation fraction at which MEDIUM alert is raised */
  medium: number;
  /** Deviation fraction at which HIGH alert is raised */
  high: number;
  /** Deviation fraction at which CRITICAL alert is raised */
  critical: number;
}

export interface DamageSensorConfig {
  regions: string[];
  sensorType: SensorType;
  thresholds?: SeverityThresholds;
}

const DEFAULT_THRESHOLDS: SeverityThresholds = {
  low: 0.1,
  medium: 0.3,
  high: 0.6,
  critical: 0.9,
};

// ── Severity classification ─────────────────────────────────────────────────

const SEVERITY_ORDER: Severity[] = [
  Severity.Low,
  Severity.Medium,
  Severity.High,
  Severity.Critical,
];

function classifySeverity(
  deviation: number,
  thresholds: SeverityThresholds
): Severity | null {
  if (deviation >= thresholds.critical) return Severity.Critical;
  if (deviation >= thresholds.high) return Severity.High;
  if (deviation >= thresholds.medium) return Severity.Medium;
  if (deviation >= thresholds.low) return Severity.Low;
  return null;
}

function maxSeverity(a: Severity, b: Severity): Severity {
  const ai = SEVERITY_ORDER.indexOf(a);
  const bi = SEVERITY_ORDER.indexOf(b);
  return ai >= bi ? a : b;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createDamageSensor(config: DamageSensorConfig): DamageSensor {
  const regionSet = new Set(config.regions);
  const thresholds = config.thresholds ?? DEFAULT_THRESHOLDS;
  const sensorType = config.sensorType;

  return {
    read(regionId: string): SensorReading {
      if (!regionSet.has(regionId)) {
        throw new Error(
          `Unknown region: ${regionId}. Known regions: ${config.regions.join(", ")}`
        );
      }

      // Baseline reading — no degradation detected.
      // In a real system this would query hardware sensors.
      return {
        regionId,
        sensorType,
        timestamp_ms: Date.now(),
        value: 1.0,
        baseline: 1.0,
        deviation: 0.0,
      };
    },

    evaluate(readings: SensorReading[]): DegradationAlert[] {
      // Group readings by region
      const byRegion = new Map<string, SensorReading[]>();
      for (const r of readings) {
        let group = byRegion.get(r.regionId);
        if (!group) {
          group = [];
          byRegion.set(r.regionId, group);
        }
        group.push(r);
      }

      const alerts: DegradationAlert[] = [];

      for (const [regionId, regionReadings] of byRegion) {
        // Find the highest severity across all readings in this region
        let worstSeverity: Severity | null = null;

        for (const reading of regionReadings) {
          const sev = classifySeverity(reading.deviation, thresholds);
          if (sev !== null) {
            worstSeverity =
              worstSeverity === null ? sev : maxSeverity(worstSeverity, sev);
          }
        }

        // Only emit an alert if at least one reading crossed a threshold
        if (worstSeverity !== null) {
          alerts.push({
            regionId,
            sensorType,
            severity: worstSeverity,
            rawReadings: regionReadings,
          });
        }
      }

      return alerts;
    },
  };
}
