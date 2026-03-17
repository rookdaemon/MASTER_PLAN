/**
 * Physical measurement types, threat levels, and degradation levels
 * for Consciousness-Preserving Embodiment (0.3.1.2.1)
 *
 * These types model the physical domain: environmental measurements,
 * shielding, power, and the graceful degradation hierarchy specified
 * in docs/consciousness-preserving-embodiment/ARCHITECTURE.md.
 */

import type {
  ConsciousnessMetrics,
  Duration,
  SubstrateHealth,
  Timestamp,
} from "../conscious-core/types.js";

// Re-export consumed types for convenience
export type { ConsciousnessMetrics, Duration, SubstrateHealth, Timestamp };

// ── Physical Measurement Primitives ──────────────────────────

/** Root-mean-square acceleration in g units */
export interface VibrationMeasurement {
  readonly rmsG: number;
  readonly peakG: number;
  readonly timestamp: Timestamp;
}

/** Temperature in degrees Celsius */
export interface Temperature {
  readonly celsius: number;
  readonly timestamp: Timestamp;
}

/** Power draw in watts */
export interface PowerMeasurement {
  readonly watts: number;
  readonly timestamp: Timestamp;
}

/** EMI level in dB relative to threshold */
export interface EMIMeasurement {
  readonly levelDb: number; // dB relative to consciousness-safe threshold
  readonly frequencyRangeHz: [number, number]; // [min, max]
  readonly timestamp: Timestamp;
}

// ── Substrate Physical Status ────────────────────────────────

export interface SubstratePhysicalStatus {
  readonly mounted: boolean;
  readonly temperature: Temperature;
  readonly vibration: VibrationMeasurement;
  readonly powerDraw: PowerMeasurement;
  readonly healthy: boolean;
}

export interface SubstrateUnit {
  readonly id: string;
  readonly type: string;
  readonly formFactor: string;
}

export interface EjectionResult {
  readonly success: boolean;
  readonly timestamp: Timestamp;
  readonly error?: string;
}

export interface SeatResult {
  readonly success: boolean;
  readonly timestamp: Timestamp;
  readonly error?: string;
}

// ── Redundancy & Failover ────────────────────────────────────

export interface CheckpointResult {
  readonly success: boolean;
  readonly timestamp: Timestamp;
  readonly latencyMs: number;
  readonly stateSizeBytes: number;
}

export interface FailoverResult {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly fromSubstrate: string;
  readonly toSubstrate: string;
  readonly consciousnessPreserved: boolean;
  readonly timestamp: Timestamp;
}

// ── Environment & Shielding ──────────────────────────────────

export type ThreatType = "emi" | "vibration" | "thermal" | "radiation" | "impact";

export interface ThermalStatus {
  readonly substrateTemp: Temperature;
  readonly enclosureTemp: Temperature;
  readonly coolingActive: boolean;
  readonly withinTolerance: boolean;
}

export interface ShieldHealth {
  readonly overallIntegrity: number; // 0..1
  readonly breaches: ThreatType[];
  readonly faradayCageIntact: boolean;
  readonly dampingActive: boolean;
  readonly thermalBarrierIntact: boolean;
}

// ── Threat Assessment & Alert Levels ─────────────────────────

/**
 * Alert levels from ARCHITECTURE.md §2.1:
 * - GREEN:  All nominal
 * - YELLOW: Trending toward threshold
 * - ORANGE: Non-critical subsystem threshold breached
 * - RED:    Consciousness-critical threshold breached
 */
export type AlertLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface ThreatAssessment {
  readonly level: AlertLevel;
  readonly activeThreats: ThreatType[];
  readonly timestamp: Timestamp;
  readonly details: string;
}

export interface RiskForecast {
  readonly horizon: Duration;
  readonly predictedLevel: AlertLevel;
  readonly confidence: number; // 0..1
  readonly riskFactors: string[];
}

export interface PhysicalMetricsSnapshot {
  readonly vibration: VibrationMeasurement;
  readonly temperature: Temperature;
  readonly emi: EMIMeasurement;
  readonly power: PowerMeasurement;
  readonly structuralIntegrity: number; // 0..1
  readonly timestamp: Timestamp;
}

export interface CorrelationReport {
  readonly physicalMetrics: PhysicalMetricsSnapshot;
  readonly consciousnessMetrics: ConsciousnessMetrics;
  readonly correlation: number; // -1..1
  readonly riskyFactors: string[];
  readonly timestamp: Timestamp;
}

export type ThresholdHandler = (assessment: ThreatAssessment) => void;

// ── Degradation Hierarchy ────────────────────────────────────

/**
 * Capability categories in sacrifice order (first-to-sacrifice → last).
 * From ARCHITECTURE.md §2.2.
 */
export type Capability =
  | "NON_ESSENTIAL_SENSING"
  | "MOBILITY"
  | "MANIPULATION"
  | "ESSENTIAL_SENSING"
  | "COMMUNICATION"
  | "REDUNDANCY_MARGIN"
  | "CONSCIOUSNESS";

/**
 * The ordered degradation hierarchy.
 * Index 0 = first to sacrifice, last = consciousness (never sacrificed).
 */
export const DEGRADATION_ORDER: readonly Capability[] = [
  "NON_ESSENTIAL_SENSING",
  "MOBILITY",
  "MANIPULATION",
  "ESSENTIAL_SENSING",
  "COMMUNICATION",
  "REDUNDANCY_MARGIN",
  "CONSCIOUSNESS",
] as const;

export type DegradationLevel = number; // 0 = fully capable, 6 = consciousness-only

export interface SacrificeResult {
  readonly sacrificed: Capability;
  readonly newLevel: DegradationLevel;
  readonly timestamp: Timestamp;
  readonly powerFreedWatts: number;
}

export interface RestoreResult {
  readonly restored: Capability;
  readonly newLevel: DegradationLevel;
  readonly success: boolean;
  readonly timestamp: Timestamp;
}

export interface ShutdownResult {
  readonly statePreserved: boolean;
  readonly timestamp: Timestamp;
  readonly reason: string;
}

// ── Power Isolation ──────────────────────────────────────────

export interface PowerStatus {
  readonly online: boolean;
  readonly voltageV: number;
  readonly currentA: number;
  readonly batteryPercent: number | null; // null if not battery-backed
  readonly isolated: boolean;
}
