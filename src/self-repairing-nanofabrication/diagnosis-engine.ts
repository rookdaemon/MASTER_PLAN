/**
 * Diagnosis & Triage Engine — Implementation
 *
 * Card: 0.2.1.2 Self-Repairing Nanofabrication
 * Classifies damage type and severity, prioritizes repairs based on
 * impact to conscious process integrity.
 */

import {
  SensorType,
  Severity,
  DamageCategory,
  type DegradationAlert,
  type ImpactAssessment,
  type RepairOrder,
  type DiagnosisEngine,
} from "./types.js";

// ── Configuration ───────────────────────────────────────────────────────────

export interface DiagnosisEngineConfig {
  /** Delegate to query the redundancy layer (0.2.1.4) for impact assessment */
  assessImpact: (regionId: string) => ImpactAssessment;
}

// ── Sensor-to-damage mapping ────────────────────────────────────────────────

const SENSOR_TO_DAMAGE: Record<SensorType, DamageCategory> = {
  [SensorType.MolecularStrain]: DamageCategory.Mechanical,
  [SensorType.ElectricalContinuity]: DamageCategory.Mechanical,
  [SensorType.Thermal]: DamageCategory.Thermal,
  [SensorType.Chemical]: DamageCategory.Chemical,
  [SensorType.Radiation]: DamageCategory.Radiation,
};

// ── Severity scoring ────────────────────────────────────────────────────────

const SEVERITY_SCORE: Record<Severity, number> = {
  [Severity.Low]: 1,
  [Severity.Medium]: 2,
  [Severity.High]: 3,
  [Severity.Critical]: 4,
};

// ── Estimated repair durations (ms) by severity ─────────────────────────────

const ESTIMATED_DURATION_MS: Record<Severity, number> = {
  [Severity.Low]: 1000,
  [Severity.Medium]: 5000,
  [Severity.High]: 15000,
  [Severity.Critical]: 30000,
};

// ── ID generation ───────────────────────────────────────────────────────────

let nextOrderId = 1;

function generateOrderId(): string {
  return `repair-${nextOrderId++}`;
}

function generateRepairPlanId(damageType: DamageCategory, severity: Severity): string {
  return `plan-${damageType}-${severity}`.toLowerCase();
}

// ── Offload decision ────────────────────────────────────────────────────────

/**
 * Determines whether a repair requires offloading conscious processes.
 * Per ARCHITECTURE.md triage rules:
 * - CRITICAL/HIGH: always requires offload
 * - MEDIUM/LOW: requires offload if redundancy is not available
 */
function requiresOffload(
  severity: Severity,
  impact: ImpactAssessment
): boolean {
  if (severity === Severity.Critical || severity === Severity.High) {
    return true;
  }
  if (!impact.redundancyAvailable) {
    return true;
  }
  return false;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createDiagnosisEngine(
  config: DiagnosisEngineConfig
): DiagnosisEngine {
  return {
    classify(alert: DegradationAlert): DamageCategory {
      return SENSOR_TO_DAMAGE[alert.sensorType];
    },

    assessImpact(regionId: string): ImpactAssessment {
      return config.assessImpact(regionId);
    },

    diagnose(alert: DegradationAlert): RepairOrder {
      const damageType = SENSOR_TO_DAMAGE[alert.sensorType];
      const impact = config.assessImpact(alert.regionId);
      const severityScore = SEVERITY_SCORE[alert.severity];

      // Priority = severity weight * (1 + criticality)
      // This ensures both severity and criticality contribute to ordering.
      const priorityScore = severityScore * (1 + impact.criticality);

      return {
        id: generateOrderId(),
        regionId: alert.regionId,
        damageType,
        severity: alert.severity,
        priorityScore,
        repairPlanId: generateRepairPlanId(damageType, alert.severity),
        estimatedDuration_ms: ESTIMATED_DURATION_MS[alert.severity],
        requiresOffload: requiresOffload(alert.severity, impact),
      };
    },
  };
}
