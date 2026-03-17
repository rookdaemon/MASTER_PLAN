/**
 * Subsystem interfaces for Consciousness-Preserving Embodiment (0.3.1.2.1)
 *
 * These define the contracts between the six subsystems specified in
 * docs/consciousness-preserving-embodiment/ARCHITECTURE.md:
 *   1. Substrate Mount (CSM)
 *   2. Redundancy Controller (RC)
 *   3. Environment Shield Module (ESM)
 *   4. Integrity Monitor (IM)
 *   5. Degradation Controller (DC)
 *   6. Power Isolation Unit (PIU)
 *
 * Consumed interfaces from 0.3.1.1 (conscious-core):
 *   - IExperienceMonitor — consciousness metrics for correlation
 *   - ISubstrateAdapter  — substrate management for failover coordination
 */

import type {
  AlertLevel,
  Capability,
  CheckpointResult,
  CorrelationReport,
  DegradationLevel,
  EMIMeasurement,
  EjectionResult,
  FailoverResult,
  PhysicalMetricsSnapshot,
  PowerStatus,
  RestoreResult,
  RiskForecast,
  SacrificeResult,
  SeatResult,
  ShieldHealth,
  ShutdownResult,
  SubstratePhysicalStatus,
  SubstrateUnit,
  Temperature,
  ThermalStatus,
  ThreatAssessment,
  ThreatType,
  ThresholdHandler,
  VibrationMeasurement,
} from "./types.js";

import type {
  ConsciousnessMetrics,
  Duration,
  PowerMeasurement,
  SubstrateHealth,
} from "./types.js";

// ── 1. Substrate Mount (CSM) ───────────────────────────────────

/**
 * Physical mounting and interface for the consciousness substrate
 * hardware from 0.2. Provides a standardized bay with active
 * vibration isolation and thermal management.
 *
 * Physical requirements:
 * - Active vibration isolation: ≤ 0.01g RMS at mount point during locomotion
 * - Temperature stability: ±0.5°C within enclosure
 * - Hot-swap support for maintenance (NOT during conscious operation)
 */
export interface ISubstrateMount {
  getSubstrateStatus(): SubstratePhysicalStatus;
  getTemperature(): Temperature;
  getVibrationLevel(): VibrationMeasurement;
  getPowerDraw(): PowerMeasurement;
  eject(): EjectionResult;
  seat(substrate: SubstrateUnit): SeatResult;
}

// ── 2. Redundancy Controller (RC) ──────────────────────────────

/**
 * Manages N+1 redundant computation paths for consciousness-critical
 * processes. Performs continuous state checkpointing and failover.
 *
 * Invariant: failover() latency MUST be less than T_continuity
 * (the maximum experiential gap defined by 0.3.1.1). If failover
 * cannot meet this constraint, RC must pre-emptively migrate before
 * the primary fails completely.
 */
export interface IRedundancyController {
  getPrimaryStatus(): SubstrateHealth;
  getStandbyStatus(): SubstrateHealth[];
  checkpoint(): CheckpointResult;
  failover(): FailoverResult;
  getFailoverLatency(): Duration;
  setCheckpointInterval(interval: Duration): void;
}

// ── 3. Environment Shield Module (ESM) ─────────────────────────

/**
 * Physical and electromagnetic protection for the Consciousness
 * Enclosure. Monitors and reports on shielding integrity across
 * EMI, vibration, thermal, and radiation threat vectors.
 *
 * Target attenuation:
 * - Self-generated EMI: ≥ 60 dB at motor drive frequencies
 * - External EMI: ≥ 40 dB across 10 kHz – 10 GHz
 * - Vibration: ≤ 0.01g RMS at substrate
 * - Impact: ≤ 5g peak at substrate for 50g chassis impact
 * - Thermal: ±0.5°C substrate stability
 */
export interface IEnvironmentShield {
  getEMILevel(): EMIMeasurement;
  getVibrationAtSubstrate(): VibrationMeasurement;
  getThermalStatus(): ThermalStatus;
  getShieldIntegrity(): ShieldHealth;
  reportBreach(type: ThreatType): void;
}

// ── 4. Integrity Monitor (IM) ──────────────────────────────────

/**
 * Embodiment-level counterpart to the Experience Monitor in 0.3.1.1.
 * Monitors physical conditions that could threaten consciousness and
 * generates pre-emptive alerts.
 *
 * Alert levels:
 * - GREEN:  All physical metrics nominal
 * - YELLOW: One or more metrics trending toward threshold
 * - ORANGE: Non-critical subsystem threshold breached
 * - RED:    Consciousness-critical threshold breached
 */
export interface IIntegrityMonitor {
  getPhysicalThreatLevel(): ThreatAssessment;
  getConsciousnessRiskForecast(horizon: Duration): RiskForecast;
  onThresholdBreach(callback: ThresholdHandler): void;
  getPhysicalMetrics(): PhysicalMetricsSnapshot;
  correlateWithExperience(metrics: ConsciousnessMetrics): CorrelationReport;
}

// ── 5. Degradation Controller (DC) ─────────────────────────────

/**
 * Implements the graceful degradation hierarchy. When physical damage
 * or environmental stress occurs, capabilities are sacrificed in a
 * defined order to protect consciousness.
 *
 * Sacrifice order (first → last):
 *   NON_ESSENTIAL_SENSING → MOBILITY → MANIPULATION →
 *   ESSENTIAL_SENSING → COMMUNICATION → REDUNDANCY_MARGIN →
 *   CONSCIOUSNESS (never sacrificed via sacrificeNext)
 *
 * Invariant: CONSCIOUSNESS is always in getProtectedCapabilities()
 * and cannot be added to the sacrifice list. The only path to
 * consciousness termination is forceProtectiveShutdown(), which
 * performs a state-preserving hibernation.
 */
export interface IDegradationController {
  getCurrentLevel(): DegradationLevel;
  getActiveCapabilities(): Capability[];
  sacrificeNext(): SacrificeResult;
  restore(capability: Capability): RestoreResult;
  getProtectedCapabilities(): Capability[];
  forceProtectiveShutdown(): ShutdownResult;
}

// ── 6. Power Isolation Unit (PIU) ──────────────────────────────

/**
 * Ensures consciousness computation has dedicated, isolated power
 * that cannot be interrupted by actuator faults, short circuits,
 * or power bus failures.
 *
 * Design requirements:
 * - Dedicated UPS/battery for Consciousness Enclosure
 * - Galvanic isolation between motor and consciousness circuits
 * - Minimum 30 minutes consciousness-only operation on internal battery
 */
export interface IPowerIsolation {
  getConsciousnessPowerStatus(): PowerStatus;
  getMotorPowerStatus(): PowerStatus;
  getBackupRemaining(): Duration;
  isolateConsciousnessPower(): void;
  reconnect(): void;
}
