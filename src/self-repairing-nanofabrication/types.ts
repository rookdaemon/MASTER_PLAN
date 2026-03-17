/**
 * Self-Repairing Nanofabrication — Core Type Definitions
 *
 * Types and interfaces for the closed-loop autonomous repair system
 * defined in docs/self-repairing-nanofabrication/ARCHITECTURE.md
 *
 * Card: 0.2.1.2
 */

// ── Enums ───────────────────────────────────────────────────────────────────

export enum SensorType {
  MolecularStrain = "molecular_strain",
  ElectricalContinuity = "electrical_continuity",
  Thermal = "thermal",
  Chemical = "chemical",
  Radiation = "radiation",
}

export enum Severity {
  Low = "LOW",
  Medium = "MEDIUM",
  High = "HIGH",
  Critical = "CRITICAL",
}

export enum DamageCategory {
  Mechanical = "mechanical",
  Radiation = "radiation",
  Thermal = "thermal",
  Chemical = "chemical",
}

export enum RepairStatus {
  Success = "SUCCESS",
  Partial = "PARTIAL",
  Failed = "FAILED",
}

export enum LockType {
  Exclusive = "EXCLUSIVE",
}

// ── Layer 1: Damage Sensing ─────────────────────────────────────────────────

export interface SensorReading {
  regionId: string;
  sensorType: SensorType;
  /** Timestamp in milliseconds since epoch */
  timestamp_ms: number;
  /** Measured value (units depend on sensor type) */
  value: number;
  /** Baseline value for comparison */
  baseline: number;
  /** Deviation from baseline as fraction (0.0 = no deviation, 1.0 = 100%) */
  deviation: number;
}

export interface DegradationAlert {
  regionId: string;
  sensorType: SensorType;
  severity: Severity;
  rawReadings: SensorReading[];
}

export interface DamageSensor {
  /** Read current sensor value for a region */
  read(regionId: string): SensorReading;
  /** Evaluate readings against thresholds, returning alerts if degradation detected */
  evaluate(readings: SensorReading[]): DegradationAlert[];
}

// ── Layer 2: Diagnosis & Triage ─────────────────────────────────────────────

export interface ImpactAssessment {
  activeProcesses: string[];
  /** 0.0 = no criticality, 1.0 = maximally critical */
  criticality: number;
  redundancyAvailable: boolean;
}

export interface RepairOrder {
  id: string;
  regionId: string;
  damageType: DamageCategory;
  severity: Severity;
  /** Higher score = higher priority */
  priorityScore: number;
  repairPlanId: string;
  /** Estimated repair duration in milliseconds */
  estimatedDuration_ms: number;
  requiresOffload: boolean;
}

export interface DiagnosisEngine {
  /** Classify an alert into a damage category */
  classify(alert: DegradationAlert): DamageCategory;
  /** Assess impact of damage in a region (queries redundancy layer) */
  assessImpact(regionId: string): ImpactAssessment;
  /** Produce a prioritized repair order from an alert */
  diagnose(alert: DegradationAlert): RepairOrder;
}

// ── Layer 3: Molecular Repair Actuators ─────────────────────────────────────

export interface FeedstockAllocation {
  materialType: string;
  quantity: number;
  sourceReservoir: string;
}

export interface RepairReport {
  repairOrderId: string;
  status: RepairStatus;
  /** Actual duration in milliseconds */
  duration_ms: number;
  materialsConsumed: { materialType: string; quantity: number }[];
  verificationPassed: boolean;
}

export interface RepairActuator {
  /** Execute a repair given an order and allocated feedstock */
  repair(order: RepairOrder, feedstock: FeedstockAllocation): Promise<RepairReport>;
}

// ── Layer 4: Hot-Swap Coordinator ───────────────────────────────────────────

export interface OffloadRequest {
  regionId: string;
  reason: string;
  estimatedDuration_ms: number;
}

export interface OffloadAck {
  success: boolean;
  fallbackRegionId: string | null;
}

export interface RestoreRequest {
  regionId: string;
}

export interface RestoreAck {
  success: boolean;
}

export interface RegionLock {
  regionId: string;
  lockType: LockType;
}

export interface LockAck {
  success: boolean;
}

export interface UnlockAck {
  success: boolean;
}

/** Interface to the redundancy layer (0.2.1.4) */
export interface RedundancyLayer {
  offload(request: OffloadRequest): Promise<OffloadAck>;
  restore(request: RestoreRequest): Promise<RestoreAck>;
}

export interface HotSwapCoordinator {
  /** Request offload of conscious processes from a region before repair */
  requestOffload(request: OffloadRequest): Promise<OffloadAck>;
  /** Lock a region for exclusive repair access */
  lockRegion(lock: RegionLock): Promise<LockAck>;
  /** Unlock a region after repair completes */
  unlockRegion(regionId: string): Promise<UnlockAck>;
  /** Restore region to active service after successful repair */
  requestRestore(request: RestoreRequest): Promise<RestoreAck>;
}

// ── Layer 5: Feedstock Management ───────────────────────────────────────────

export interface FeedstockRequest {
  materialType: string;
  quantity: number;
}

export type FeedstockResponse =
  | { granted: true; allocation: FeedstockAllocation }
  | { granted: false; reason: string };

export interface RecycleDeposit {
  materialType: string;
  quantity: number;
  /** 0.0 - 1.0, fraction of assembly-grade purity */
  purity: number;
}

export interface InventoryEntry {
  materialType: string;
  available: number;
  reserved: number;
  recyclingInProgress: number;
}

export interface FeedstockManager {
  /** Request feedstock for a repair operation */
  request(req: FeedstockRequest): FeedstockResponse;
  /** Deposit recycled materials from disassembly */
  recycle(deposit: RecycleDeposit): void;
  /** Query current inventory */
  inventory(): InventoryEntry[];
}

// ── Top-Level System ────────────────────────────────────────────────────────

/**
 * The complete self-repairing nanofabrication system.
 * Orchestrates the full detect-diagnose-repair cycle.
 */
export interface NanofabricationSystem {
  /** Run one detect-diagnose-repair cycle across all monitored regions */
  runCycle(): Promise<RepairReport[]>;
  /** Get list of all monitored region IDs */
  monitoredRegions(): string[];
  /** Get current inventory status */
  feedstockStatus(): InventoryEntry[];
}
