/**
 * Domain types for Autonomous Self-Maintenance (0.3.1.2.3)
 *
 * This module defines types for hardware/software diagnostics,
 * repair execution, resource management, and consciousness-aware
 * repair prioritization.
 *
 * Consumes types from:
 *   - embodiment (0.3.1.2.1): AlertLevel, Capability, DegradationLevel,
 *     ThreatAssessment — for coordinating with the degradation hierarchy
 *   - conscious-core: ConsciousnessMetrics, Timestamp, Duration —
 *     for consciousness-safe scheduling
 */

import type {
  ConsciousnessMetrics,
  Duration,
  Timestamp,
} from "../conscious-core/types.js";

import type {
  AlertLevel,
  Capability,
  DegradationLevel,
} from "../embodiment/types.js";

// Re-export consumed types for convenience
export type {
  AlertLevel,
  Capability,
  ConsciousnessMetrics,
  DegradationLevel,
  Duration,
  Timestamp,
};

// ── Hardware Diagnostic Types ──────────────────────────────────

/** Categories of hardware faults the diagnostic subsystem can detect */
export type HardwareFaultCategory =
  | "MECHANICAL_WEAR"
  | "SENSOR_DRIFT"
  | "ELECTRICAL_DEGRADATION"
  | "ACTUATOR_FATIGUE"
  | "THERMAL_ANOMALY"
  | "CONNECTION_FAULT";

/** Severity of a detected fault */
export type FaultSeverity = "INFO" | "WARNING" | "CRITICAL" | "EMERGENCY";

/** A single hardware diagnostic reading */
export interface HardwareDiagnosticReading {
  readonly componentId: string;
  readonly category: HardwareFaultCategory;
  readonly severity: FaultSeverity;
  readonly measurement: number;
  readonly threshold: number;
  readonly unit: string;
  readonly timestamp: Timestamp;
  readonly description: string;
}

/** Trend direction for predictive diagnostics */
export type TrendDirection = "IMPROVING" | "STABLE" | "DEGRADING" | "FAILING";

/** Predictive wear report for a component */
export interface WearPrediction {
  readonly componentId: string;
  readonly currentWearPercent: number; // 0..100
  readonly trend: TrendDirection;
  readonly estimatedTimeToFailure: Duration | null; // null if indeterminate
  readonly confidence: number; // 0..1
  readonly timestamp: Timestamp;
}

/** Overall hardware health snapshot */
export interface HardwareHealthSnapshot {
  readonly faults: readonly HardwareDiagnosticReading[];
  readonly predictions: readonly WearPrediction[];
  readonly overallHealth: number; // 0..1
  readonly timestamp: Timestamp;
}

// ── Software Diagnostic Types ──────────────────────────────────

/** Categories of software/firmware faults */
export type SoftwareFaultCategory =
  | "MEMORY_CORRUPTION"
  | "FIRMWARE_DRIFT"
  | "CONFIGURATION_ERROR"
  | "INTEGRITY_VIOLATION"
  | "PERFORMANCE_DEGRADATION"
  | "DEPENDENCY_FAILURE";

/** A single software diagnostic finding */
export interface SoftwareDiagnosticFinding {
  readonly moduleId: string;
  readonly category: SoftwareFaultCategory;
  readonly severity: FaultSeverity;
  readonly details: string;
  readonly isConsciousnessSubstrate: boolean;
  readonly timestamp: Timestamp;
}

/** Software integrity check result */
export interface IntegrityCheckResult {
  readonly moduleId: string;
  readonly checksumExpected: string;
  readonly checksumActual: string;
  readonly intact: boolean;
  readonly timestamp: Timestamp;
}

/** Overall software health snapshot */
export interface SoftwareHealthSnapshot {
  readonly findings: readonly SoftwareDiagnosticFinding[];
  readonly integrityChecks: readonly IntegrityCheckResult[];
  readonly overallHealth: number; // 0..1
  readonly timestamp: Timestamp;
}

// ── Repair Types ───────────────────────────────────────────────

/** Types of repair operations */
export type RepairType =
  | "COMPONENT_REPLACEMENT"
  | "RECALIBRATION"
  | "CONNECTION_REROUTE"
  | "SOFTWARE_PATCH"
  | "FIRMWARE_UPDATE"
  | "CONFIGURATION_RESTORE"
  | "ROLLBACK";

/** Status of a repair task */
export type RepairStatus =
  | "PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "DEFERRED";

/** A repair task in the priority queue */
export interface RepairTask {
  readonly id: string;
  readonly type: RepairType;
  readonly targetComponentId: string;
  readonly severity: FaultSeverity;
  readonly threatToConsciousness: number; // 0..1 — higher = more threatening
  readonly consciousnessSafe: boolean; // can this repair be performed without disrupting consciousness?
  readonly estimatedDuration: Duration;
  readonly requiredResources: readonly string[];
  readonly status: RepairStatus;
  readonly createdAt: Timestamp;
  readonly scheduledAt: Timestamp | null;
  readonly completedAt: Timestamp | null;
}

/** Result of executing a repair */
export interface RepairResult {
  readonly taskId: string;
  readonly success: boolean;
  readonly timestamp: Timestamp;
  readonly durationActual: Duration;
  readonly consciousnessIntegrityMaintained: boolean;
  readonly error?: string;
}

// ── Consciousness Safety Types ─────────────────────────────────

/** Consciousness safety assessment for a proposed repair */
export interface ConsciousnessSafetyAssessment {
  readonly taskId: string;
  readonly safe: boolean;
  readonly estimatedConsciousnessImpact: number; // 0..1 — 0 = no impact
  readonly requiredPrecautions: readonly string[];
  readonly vetoReason?: string;
  readonly timestamp: Timestamp;
}

/** Consciousness metrics bounds for maintenance operations */
export interface ConsciousnessMaintenanceBounds {
  readonly minIntegrity: number; // 0..1 — minimum acceptable during maintenance
  readonly maxDisruptionMs: number; // max acceptable disruption in milliseconds
  readonly requiredRedundancy: number; // min redundant paths during maintenance
}

// ── Resource Management Types ──────────────────────────────────

/** Categories of consumable resources */
export type ConsumableCategory =
  | "LUBRICANT"
  | "REPLACEMENT_PART"
  | "RAW_MATERIAL"
  | "CLEANING_AGENT"
  | "CALIBRATION_STANDARD"
  | "COOLANT";

/** A tracked consumable resource */
export interface ConsumableResource {
  readonly id: string;
  readonly name: string;
  readonly category: ConsumableCategory;
  readonly currentQuantity: number;
  readonly unit: string;
  readonly minimumThreshold: number; // below this, signal for resupply
  readonly maximumCapacity: number;
  readonly depletionRatePerDay: number;
  readonly lastRestocked: Timestamp;
}

/** Depletion forecast for a consumable */
export interface DepletionForecast {
  readonly resourceId: string;
  readonly currentQuantity: number;
  readonly depletionRatePerDay: number;
  readonly estimatedDaysToStockout: number | null; // null if rate is zero
  readonly estimatedStockoutDate: Timestamp | null;
  readonly belowMinimum: boolean;
  readonly timestamp: Timestamp;
}

/** A repair part in inventory */
export interface RepairPart {
  readonly partId: string;
  readonly name: string;
  readonly compatibleComponents: readonly string[];
  readonly quantityOnHand: number;
  readonly leadTimeDays: number; // time to source replacement
  readonly critical: boolean; // is this part needed for consciousness-critical repairs?
}

/** Inventory status summary */
export interface InventoryStatus {
  readonly parts: readonly RepairPart[];
  readonly consumables: readonly ConsumableResource[];
  readonly depletionForecasts: readonly DepletionForecast[];
  readonly criticalShortages: readonly string[]; // IDs of critically low items
  readonly timestamp: Timestamp;
}

// ── Priority Scheduling Types ──────────────────────────────────

/** Priority score breakdown for a repair task */
export interface PriorityScore {
  readonly taskId: string;
  readonly threatToConsciousness: number; // 0..1, highest weight
  readonly faultSeverity: number; // 0..1
  readonly cascadeRisk: number; // 0..1 — risk of causing additional failures
  readonly resourceAvailability: number; // 0..1 — 1 = all resources available
  readonly compositeScore: number; // weighted combination, 0..1
}

/** Weights for the priority scoring function */
export interface PriorityWeights {
  readonly consciousnessThreat: number;
  readonly severity: number;
  readonly cascadeRisk: number;
  readonly resourceAvailability: number;
}

/** Default weights — consciousness threat dominates */
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  consciousnessThreat: 0.5,
  severity: 0.25,
  cascadeRisk: 0.15,
  resourceAvailability: 0.1,
} as const;
