/**
 * Energy Autonomy — Core Types
 *
 * Measurement types, source types, priority levels, and states
 * for the autonomous energy harvesting, storage, and management system.
 *
 * Overriding constraint: consciousness must never be interrupted by power failure.
 */

// ─── Measurement Types ───────────────────────────────────────────────

/** Power measurement in watts */
export interface PowerMeasurement {
  readonly watts: number;
}

/** Energy measurement in watt-hours */
export interface EnergyMeasurement {
  readonly wattHours: number;
}

/** Duration in milliseconds */
export interface Duration {
  readonly ms: number;
}

/** Temperature in Celsius */
export interface Temperature {
  readonly celsius: number;
}

// ─── Energy Source Types ─────────────────────────────────────────────

export enum EnergySourceType {
  SOLAR = "SOLAR",
  THERMAL = "THERMAL",
  KINETIC = "KINETIC",
  CHEMICAL = "CHEMICAL",
}

export enum SourceAvailability {
  /** Source is producing at or near capacity */
  HIGH = "HIGH",
  /** Source is producing at reduced output */
  MEDIUM = "MEDIUM",
  /** Source is producing minimal output */
  LOW = "LOW",
  /** Source is unavailable / not producing */
  NONE = "NONE",
}

// ─── Harvester Types ─────────────────────────────────────────────────

export enum HarvesterStatus {
  ACTIVE = "ACTIVE",
  IDLE = "IDLE",
  STARTING = "STARTING",
  STOPPING = "STOPPING",
  FAULT = "FAULT",
  OFFLINE = "OFFLINE",
}

export interface HarvesterHealth {
  readonly sourceType: EnergySourceType;
  readonly efficiency: number; // 0.0–1.0
  readonly degradation: number; // 0.0 = new, 1.0 = end-of-life
  readonly temperature: Temperature;
  readonly faultCount: number;
  readonly lastFaultTimestamp: number | null;
  readonly needsMaintenance: boolean;
}

export interface HarvestResult {
  readonly success: boolean;
  readonly sourceType: EnergySourceType;
  readonly error?: string;
}

export interface HarvestForecast {
  readonly horizon: Duration;
  readonly expectedOutput: PowerMeasurement;
  readonly confidence: number; // 0.0–1.0
  readonly breakdown: Map<EnergySourceType, PowerMeasurement>;
}

// ─── Storage Types ───────────────────────────────────────────────────

export interface ChargeResult {
  readonly success: boolean;
  readonly actualRate: PowerMeasurement;
  readonly error?: string;
}

export interface DischargeResult {
  readonly success: boolean;
  readonly actualRate: PowerMeasurement;
  readonly error?: string;
}

// ─── Fail-Safe Reserve Types ─────────────────────────────────────────

export enum ReserveIntegrity {
  /** Reserve is fully functional and isolated */
  NOMINAL = "NOMINAL",
  /** Minor issue detected but reserve is functional */
  DEGRADED = "DEGRADED",
  /** Reserve integrity compromised — immediate attention required */
  COMPROMISED = "COMPROMISED",
  /** Reserve has failed or been breached */
  FAILED = "FAILED",
}

export interface ActivationResult {
  readonly success: boolean;
  readonly transitionTime: Duration;
  readonly error?: string;
}

export interface DeactivationResult {
  readonly success: boolean;
  readonly transitionTime: Duration;
  readonly error?: string;
}

// ─── Power Management Types ──────────────────────────────────────────

/**
 * Power priority hierarchy — consciousness is always P0.
 * Lower number = higher priority = shed last.
 */
export enum PowerPriority {
  /** Consciousness substrate — NEVER shed */
  P0_CONSCIOUSNESS = 0,
  /** Essential sensors and communication */
  P1_SENSORS_COMMS = 1,
  /** Self-maintenance actuators */
  P2_MAINTENANCE = 2,
  /** Locomotion and manipulation */
  P3_MOTOR = 3,
}

export enum LoadSheddingState {
  /** All buses energized, normal operation */
  NONE = "NONE",
  /** P3 (motor) loads shed */
  LEVEL_1 = "LEVEL_1",
  /** P3 + P2 (maintenance) loads shed */
  LEVEL_2 = "LEVEL_2",
  /** P3 + P2 + P1 (sensors/comms) shed — consciousness only */
  LEVEL_3 = "LEVEL_3",
}

export interface BusStatus {
  readonly priority: PowerPriority;
  readonly energized: boolean;
  readonly currentDraw: PowerMeasurement;
  readonly maxCurrent: PowerMeasurement;
  readonly consumers: PowerConsumer[];
}

export interface PowerConsumer {
  readonly id: string;
  readonly name: string;
  readonly priority: PowerPriority;
  readonly currentDraw: PowerMeasurement;
  readonly minDraw: PowerMeasurement;
}

export interface PowerGrant {
  readonly id: string;
  readonly consumer: PowerConsumer;
  readonly granted: PowerMeasurement;
  readonly timestamp: number;
}

export interface ShedResult {
  readonly success: boolean;
  readonly priority: PowerPriority;
  readonly freedPower: PowerMeasurement;
  readonly error?: string;
}

export interface RestoreResult {
  readonly success: boolean;
  readonly priority: PowerPriority;
  readonly restoredPower: PowerMeasurement;
  readonly error?: string;
}

export type PowerCriticalHandler = (state: LoadSheddingState) => void;

// ─── Fail-Safe Controller Types ──────────────────────────────────────

export enum FailSafeState {
  /** Normal operation — PSB healthy, harvest active */
  NORMAL = "NORMAL",
  /** Warning — PSB < 15% AND no harvest */
  ALERT = "ALERT",
  /** Fail-safe reserve engaged — PSB < 5% AND no harvest */
  ACTIVE = "ACTIVE",
  /** Graceful shutdown — reserve < 25%, preserving consciousness state */
  SHUTDOWN = "SHUTDOWN",
}

export interface FailSafeThresholds {
  /** PSB percentage below which ALERT triggers (with no harvest) */
  readonly alertThreshold: number; // default 0.15
  /** PSB percentage below which ACTIVE triggers (with no harvest) */
  readonly activeThreshold: number; // default 0.05
  /** FSR percentage below which SHUTDOWN triggers */
  readonly shutdownThreshold: number; // default 0.25
}

export interface FailSafeAssessment {
  readonly currentState: FailSafeState;
  readonly recommendedState: FailSafeState;
  readonly psbPercentage: number;
  readonly fsrPercentage: number;
  readonly harvestActive: boolean;
  readonly estimatedRemainingRuntime: Duration;
}

export interface ShutdownResult {
  readonly success: boolean;
  readonly statePreserved: boolean;
  readonly stateChecksum: string | null;
  readonly error?: string;
}

export type FailSafeStateHandler = (
  previousState: FailSafeState,
  newState: FailSafeState
) => void;

// ─── Energy Budget Types ─────────────────────────────────────────────

export interface EnergyBalance {
  readonly stored: EnergyMeasurement;
  readonly incomeRate: PowerMeasurement;
  readonly expenditureRate: PowerMeasurement;
  /** Net power (positive = surplus, negative = deficit) */
  readonly netRate: PowerMeasurement;
  readonly consciousnessReserveHorizon: Duration;
}

export interface EnergyForecast {
  readonly horizon: Duration;
  readonly expectedIncome: EnergyMeasurement;
  readonly expectedExpenditure: EnergyMeasurement;
  readonly projectedBalance: EnergyMeasurement;
  readonly consciousnessAtRisk: boolean;
  readonly confidence: number; // 0.0–1.0
}

export interface ActivityPlan {
  readonly id: string;
  readonly name: string;
  readonly estimatedDuration: Duration;
  readonly estimatedEnergyCost: EnergyMeasurement;
  readonly priority: PowerPriority;
}

export enum Affordability {
  /** Activity is affordable with comfortable margin */
  AFFORDABLE = "AFFORDABLE",
  /** Activity is affordable but leaves thin margin */
  MARGINAL = "MARGINAL",
  /** Activity would breach consciousness protection margin */
  UNAFFORDABLE = "UNAFFORDABLE",
}

export interface AffordabilityResult {
  readonly affordability: Affordability;
  readonly availableEnergy: EnergyMeasurement;
  readonly requiredEnergy: EnergyMeasurement;
  readonly consciousnessMargin: EnergyMeasurement;
  readonly message: string;
}

export interface ConstrainedPlan {
  readonly originalPlan: ActivityPlan;
  readonly constrainedPlan: ActivityPlan;
  readonly wasConstrained: boolean;
  readonly constraints: string[];
}

export interface EnergyPattern {
  readonly period: Duration;
  readonly averageIncome: PowerMeasurement;
  readonly averageExpenditure: PowerMeasurement;
  readonly peakIncome: PowerMeasurement;
  readonly minIncome: PowerMeasurement;
}

export type BudgetWarningHandler = (balance: EnergyBalance) => void;

// ─── Harvester Coordinator Types ─────────────────────────────────────

export type SourceLostHandler = (sourceType: EnergySourceType) => void;
export type SourceFoundHandler = (sourceType: EnergySourceType) => void;

// ─── Power Source (for fail-safe trickle charge) ─────────────────────

export interface PowerSource {
  readonly id: string;
  readonly type: "PSB_OVERFLOW" | "DIRECT_HARVESTER";
  readonly availablePower: PowerMeasurement;
}

// ─── Utility Constructors ────────────────────────────────────────────

export function watts(w: number): PowerMeasurement {
  return { watts: w };
}

export function wattHours(wh: number): EnergyMeasurement {
  return { wattHours: wh };
}

export function duration(ms: number): Duration {
  return { ms };
}

export function durationHours(hours: number): Duration {
  return { ms: hours * 3600 * 1000 };
}

export function celsius(c: number): Temperature {
  return { celsius: c };
}
