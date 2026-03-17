/**
 * Radiation-Hardened Computation — Core Type Definitions
 *
 * Types and interfaces for the 5-layer radiation-hardened computing architecture
 * defined in docs/radiation-hardened-computation/ARCHITECTURE.md
 */

// ── Particle & Radiation Types ──────────────────────────────────────────────

export enum ParticleType {
  Proton = "proton",
  Electron = "electron",
  HeavyIon = "heavy_ion",
  Neutron = "neutron",
  Gamma = "gamma",
}

export interface FluxMeasurement {
  /** Particles per cm² per second */
  particlesPerCm2PerSec: number;
  /** Dominant particle type */
  particleType: ParticleType;
  /** Energy in MeV */
  energy_MeV: number;
}

// ── Alert Levels ────────────────────────────────────────────────────────────

export enum AlertLevel {
  Nominal = "NOMINAL",
  Elevated = "ELEVATED",
  Storm = "STORM",
}

// ── Layer 1: Shielding ──────────────────────────────────────────────────────

export interface ShieldingModule {
  /** Returns flux reduction ratio for a given particle type and energy */
  attenuationFactor(particleType: ParticleType, energy_MeV: number): number;
  /** Mass per unit area in kg/m² */
  massPerArea(): number;
  /** Thermal load in watts/m² */
  thermalLoad(): number;
}

export interface ShieldLayerSpec {
  material: string;
  thickness_cm: number;
  density_g_per_cm3: number;
  /** Radiation length in g/cm² — characterizes EM shower attenuation */
  radiationLength_g_per_cm2: number;
}

// ── Layer 2: Substrate ──────────────────────────────────────────────────────

export type SubstrateMaterial = "SiC" | "GaN" | "SOI" | "Diamond";

export interface SubstrateSpec {
  material: SubstrateMaterial;
  featureSize_nm: number;
  /** Cumulative dose before parametric failure, in rad */
  tidTolerance_rad: number;
  /** SEU cross-section per device, in cm² */
  seuCrossSection_cm2: number;
  /** Operating temperature range in Kelvin */
  operatingTempRange_K: [min: number, max: number];
  /** Mean time between failures at reference flux, in hours */
  mtbf_hours: number;
}

// ── Layer 3: Radiation-Aware Runtime ────────────────────────────────────────

export interface RadiationAwareRuntime {
  currentFlux(): FluxMeasurement;
  scrubRate(): number; // scans per second
  setScrubRate(rate: number): void;
  alertLevel(): AlertLevel;
  enterSafeMode(): void;
  exitSafeMode(): void;
}

// ── Layer 4: Fault-Tolerant Computation ─────────────────────────────────────

export interface HealthStatus {
  /** Errors per hour */
  errorRate: number;
  /** Uptime in hours */
  uptime_hours: number;
  /** 0.0 = pristine, 1.0 = failed */
  degradationLevel: number;
}

export interface StateSnapshot {
  /** Unique snapshot identifier */
  id: string;
  /** Timestamp in milliseconds since epoch */
  timestamp_ms: number;
  /** Serialized process state */
  data: Uint8Array;
  /** Integrity checksum (SHA-256) */
  checksum: string;
}

export type ConsensusResult<T> =
  | { agreed: true; value: T }
  | { agreed: false; values: T[] };

export interface FaultTolerantComputeNode<T = unknown> {
  execute(task: T): Promise<T>;
  vote(results: [T, T, T]): ConsensusResult<T>;
  healthStatus(): HealthStatus;
  failover(targetNodeId: string): Promise<void>;
  checkpoint(): Promise<StateSnapshot>;
  restore(snapshot: StateSnapshot): Promise<void>;
}

// ── Layer 5: Conscious Process Continuity ───────────────────────────────────

export interface ProcessIntegrity {
  /** 0.0 = no continuity, 1.0 = perfect continuity */
  continuityScore: number;
  /** Timestamp of last checkpoint */
  lastCheckpoint_ms: number;
  /** Fraction of nodes in agreement (0.0 - 1.0) */
  nodeAgreement: number;
}

export interface MigrationResult {
  success: boolean;
  fromNodeId: string;
  toNodeId: string;
  duration_ms: number;
  /** Whether any state was lost during migration */
  stateLoss: boolean;
}

export interface ConsciousProcessManager {
  activeNodeCount(): number;
  quorumThreshold(): number;
  migrateProcess(fromNodeId: string, toNodeId: string): Promise<MigrationResult>;
  processIntegrity(): ProcessIntegrity;
  /** 0% = full capacity, 100% = minimum viable */
  degradationLevel(): number;
}

// ── Degradation Model ───────────────────────────────────────────────────────

export interface DegradationModelResult {
  /** Years simulated */
  years: number;
  /** Performance as fraction of original (0.0 - 1.0) */
  performanceFraction: number;
  /** Cumulative TID received in rad */
  cumulativeTID_rad: number;
  /** Estimated displacement damage dose */
  displacementDamageDose: number;
}
