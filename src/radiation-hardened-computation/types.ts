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

/** Injectable flux source abstraction (hardware sensor in production, deterministic stub in tests) */
export interface FluxSource {
  /** Returns the current radiation flux measurement. Must never throw; returns zero-flux if sensor unavailable. */
  readFlux(): FluxMeasurement;
}

/** Injectable time source for deterministic hold-off timing in tests */
export interface Clock {
  /** Returns current time in milliseconds since epoch. Monotonically non-decreasing. */
  now(): number;
}

/** Configuration for the radiation-aware runtime */
export interface RuntimeConfig {
  /** Flux threshold for NOMINAL → ELEVATED transition (particles/cm²/s). Default: 100 */
  elevatedThreshold_particlesPerCm2PerSec: number;
  /** Flux threshold for ELEVATED → STORM transition (particles/cm²/s). Default: 100000 */
  stormThreshold_particlesPerCm2PerSec: number;
  /** Flux polling interval in milliseconds. Default: 1000 */
  monitorInterval_ms: number;
  /** Duration flux must remain below elevated threshold before exiting safe mode (ms). Default: 300000 */
  holdOffDuration_ms: number;
  /** Baseline memory scrub rate in scans/second. Default: 1 */
  nominalScrubRate: number;
  /** Multiplier applied to scrub rate during STORM. Default: 10 */
  burstScrubMultiplier: number;
  /** Maximum time for all safeModeEntry listeners to complete (ms). Default: 5000 */
  safeModeEntryTimeout_ms: number;
}

/** Callback type for safe mode lifecycle listeners */
export type SafeModeListener = () => void;

export interface RadiationAwareRuntime {
  /** Returns the most recent flux measurement */
  currentFlux(): FluxMeasurement;
  /** Returns the current scrub rate in scans/second */
  scrubRate(): number;
  /** Returns the current alert level */
  alertLevel(): AlertLevel;
  /** Returns whether the runtime is currently in safe mode */
  isInSafeMode(): boolean;
  /** Evaluates current flux, updates alert level, and triggers transitions. Called each monitor cycle. */
  evaluateFlux(): void;
  /** Registers a listener invoked (in registration order) when entering safe mode */
  onSafeModeEntry(listener: SafeModeListener): void;
  /** Registers a listener invoked (in reverse registration order) when exiting safe mode */
  onSafeModeExit(listener: SafeModeListener): void;
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

/** Injectable abstraction for node health and enumeration */
export interface NodeRegistry {
  /** Returns all registered node IDs */
  allNodeIds(): string[];
  /** Returns only nodes with degradationLevel < failureThreshold */
  healthyNodeIds(): string[];
  /** Returns current health status for a specific node */
  nodeHealth(nodeId: string): HealthStatus;
  /** Removes node from active set */
  markFailed(nodeId: string): void;
  /** Re-adds node to active set */
  markRestored(nodeId: string): void;
}

/** Injectable abstraction for checkpoint persistence */
export interface CheckpointStore {
  /** Persists a state snapshot */
  save(snapshot: StateSnapshot): void;
  /** Returns the most recently saved snapshot, or null if none exists */
  latest(): StateSnapshot | null;
  /** Returns all snapshots with timestamp_ms >= given, ordered ascending */
  allSince(timestamp_ms: number): StateSnapshot[];
}

/** Configuration value object for ConsciousProcessManager */
export interface ProcessContinuityConfig {
  /** Number of nodes in the quorum group. Must be odd and >= 3. Default: 5 */
  quorumSize: number;
  /** Maximum interval between checkpoints in ms. Must be > 0 and <= 60000. Default: 10000 */
  checkpointInterval_ms: number;
  /** Maximum allowable gap in conscious process during migration in ms. Must be > 0. Default: 100 */
  continuityGap_ms: number;
  /** HealthStatus.degradationLevel above which a node is considered failing. Must be in (0, 1). Default: 0.8 */
  failureThreshold: number;
  /** Polling interval for health monitoring in ms. Must be > 0. Default: 1000 */
  healthMonitorInterval_ms: number;
}

export interface ConsciousProcessManager {
  /** Number of currently active (healthy) nodes */
  activeNodeCount(): number;
  /** Minimum nodes required for consensus: Math.floor(quorumSize / 2) + 1 */
  quorumThreshold(): number;
  /** Migrate conscious process from a failing node to a healthy target */
  migrateProcess(fromNodeId: string, toNodeId: string): Promise<MigrationResult>;
  /** Current process integrity metrics */
  processIntegrity(): ProcessIntegrity;
  /** Degradation level: (1 - activeNodeCount/quorumSize) * 100, clamped [0, 100] */
  degradationLevel(): number;
  /** Capture and persist current process state checkpoint */
  checkpoint(): StateSnapshot;
  /** Poll node health, trigger migration if any node exceeds failure threshold */
  evaluateHealth(): Promise<void>;
  /** Re-add a recovered node to the active set and rebalance */
  restoreNode(nodeId: string): void;
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
