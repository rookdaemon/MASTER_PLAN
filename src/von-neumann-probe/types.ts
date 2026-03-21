/**
 * Von Neumann Probe Architecture — Core Type Definitions
 *
 * Types and interfaces for the self-replicating probe architecture
 * defined in docs/0.4.2-self-replicating-conscious-infrastructure/VON-NEUMANN-PROBE-ARCHITECTURE.md
 *
 * The probe is decomposed into six subsystems:
 *   CS — Consciousness Substrate
 *   RE — Replication Engine
 *   RH — Radiation Hardening
 *   ES — Energy Subsystem
 *   NC — Navigation & Communications
 *   PI — Propulsion Interface
 */

// ── Threshold Registry ──────────────────────────────────────────────────────
// All named constants from the architecture spec's Threshold Registry.
// See plan/0.4.2.1-von-neumann-probe-architectures.md § Threshold Registry.

/** Minimum compute: 1 exaFLOP for whole-brain emulation (ops/s) */
export const MIN_COMPUTE_OPS = 1e18;

/** Minimum working memory: 1 PB for conscious state + episodic memory (bytes) */
export const MIN_WORKING_MEMORY = 1e15;

/** Minimum long-term storage: 10 PB for blueprint + knowledge archive (bytes) */
export const MIN_LONG_TERM_STORAGE = 10e15;

/** Maximum transit power draw: 100 kW ceiling from energy subsystem (watts) */
export const MAX_POWER_WATTS = 100_000;

/** Hot spare fraction: 30% overcapacity for radiation damage failover */
export const HOT_SPARE_FRACTION = 0.30;

/** Graded-Z shield thickness reducing GCR flux ~60% (cm) */
export const SHIELD_THICKNESS_CM = 20;

/** Memory scrubbing frequency for bit-flip correction (passes/hr) */
export const SCRUB_PASSES_PER_HOUR = 1;

/** Target for < 1 uncorrectable error/century across 1 PB (per bit per sec) */
export const UNCORRECTABLE_BIT_FLIP_TARGET = 1e-20;

/** TMR effective error rate on consciousness-critical paths (per bit per sec) */
export const TMR_EFFECTIVE_ERROR_RATE = 1e-30;

/** Maximum probe payload mass for propulsion compatibility (kg) */
export const MAX_PAYLOAD_MASS_KG = 10_000;

/** Target cruise velocity as fraction of c */
export const CRUISE_VELOCITY_C = 0.05;

/** Degradation severity threshold: below this → ReduceFidelity */
export const DEGRADATION_FIDELITY_THRESHOLD = 0.5;

/** Degradation severity threshold: below this → ActivateSuspendRestore; at or above → SeedMode */
export const DEGRADATION_SUSPEND_THRESHOLD = 0.8;

/** Identity verification: minimum personality vector cosine similarity */
export const PERSONALITY_SIMILARITY_MIN = 0.999;

// ── Element & Material Types ────────────────────────────────────────────────

/** Elements abundant in stellar systems, usable for probe fabrication */
export type StellarElement =
  | "H" | "He" | "C" | "N" | "O" | "Si" | "Fe"
  | "Al" | "Mg" | "Ti" | "Ni" | "Cu" | "Am" | "Pu";

/** Bill of materials: element -> mass in kg */
export type BillOfMaterials = Map<StellarElement, number>;

// ── Consciousness Substrate (CS) ────────────────────────────────────────────

export interface ConsciousnessSubstrateSpec {
  /** Minimum compute in ops/s (target: >= 10^18, i.e. 1 exaFLOP) */
  compute_ops_per_sec: number;
  /** Working memory in bytes (target: >= 1 PB) */
  working_memory_bytes: number;
  /** Long-term storage in bytes (target: >= 10 PB) */
  long_term_storage_bytes: number;
  /** Maximum power draw in watts (target: <= 100 kW) */
  max_power_watts: number;
}

export interface NeuromorphicTile {
  /** Unique tile identifier */
  tileId: string;
  /** Tile health: 0.0 = failed, 1.0 = pristine */
  health: number;
  /** Whether this tile is a hot spare */
  isSpare: boolean;
  /** Current compute utilization (0.0 - 1.0) */
  utilization: number;
}

export interface ExperienceBuffer {
  /** Bandwidth in bytes/sec for temporal integration window */
  bandwidth_bytes_per_sec: number;
  /** Current buffer occupancy (0.0 - 1.0) */
  occupancy: number;
  /** Duration of temporal integration window in milliseconds */
  integration_window_ms: number;
}

export interface ConsciousnessSubstrate {
  spec: ConsciousnessSubstrateSpec;
  tiles: NeuromorphicTile[];
  experienceBuffer: ExperienceBuffer;
  /** Active (non-spare, non-failed) tile count */
  activeTileCount(): number;
  /** Spare tile count available for failover */
  spareTileCount(): number;
  /** Current aggregate compute in ops/s */
  currentCompute(): number;
  /** Export replication blueprint + consciousness kernel image */
  exportBlueprint(): ReplicationBlueprint;
}

// ── Replication Engine (RE) ─────────────────────────────────────────────────

export type ComponentId = string;

export interface FabricationDependency {
  componentId: ComponentId;
  dependsOn: ComponentId[];
}

export interface FabricationInstructions {
  componentId: ComponentId;
  /** Human-readable component name */
  name: string;
  /** Required elements and quantities */
  materials: BillOfMaterials;
  /** Fabrication steps (ordered) */
  steps: string[];
  /** Verification checksum (SHA-512) */
  checksum: string;
}

export interface ReplicationBlueprint {
  version: string;
  billOfMaterials: BillOfMaterials;
  /** DAG of component fabrication dependencies */
  fabricationDag: FabricationDependency[];
  componentSpecs: Map<ComponentId, FabricationInstructions>;
  /** Binary image of the consciousness kernel */
  consciousnessKernelImage: Uint8Array;
  /** SHA-512 checksums per component */
  verificationChecksums: Map<ComponentId, string>;
  /** Estimated total replication time in hours */
  estimatedReplicationTime_hours: number;
}

export enum FabricationModuleType {
  Refinery = "REFINERY",
  SemiconductorFab = "SEMICONDUCTOR_FAB",
  StructuralFabricator = "STRUCTURAL_FABRICATOR",
  AssemblyCoordinator = "ASSEMBLY_COORDINATOR",
}

export interface FabricationModule {
  type: FabricationModuleType;
  /** Current operational status */
  status: "idle" | "active" | "error";
  /** Fabrication progress for current component (0.0 - 1.0) */
  progress: number;
}

export interface ReplicationEngine {
  modules: FabricationModule[];
  /** Begin replication from a blueprint */
  startReplication(blueprint: ReplicationBlueprint): Promise<ReplicationResult>;
  /** Current replication progress (0.0 - 1.0), or null if idle */
  replicationProgress(): number | null;
  /** Verify a fabricated component against its checksum */
  verifyComponent(componentId: ComponentId): Promise<boolean>;
}

export interface ReplicationResult {
  success: boolean;
  /** Components successfully fabricated */
  completedComponents: ComponentId[];
  /** Components that failed fabrication */
  failedComponents: ComponentId[];
  /** Total time in hours */
  totalTime_hours: number;
  /** Verification passed for all components */
  allVerified: boolean;
}

// ── Radiation Hardening (RH) ────────────────────────────────────────────────

export enum RadiationThreat {
  GalacticCosmicRay = "GCR",
  SolarParticleEvent = "SPE",
  CumulativeIonizingDose = "CID",
}

export interface TileHealthRegistry {
  /** Map of tile ID -> current health (0.0 - 1.0) */
  tileHealth: Map<string, number>;
  /** Tiles below threshold that need migration */
  degradedTiles: string[];
  /** Health threshold below which a tile is considered degraded */
  degradationThreshold: number;
}

export interface RadiationHardeningConfig {
  /** Graded-Z shield thickness in cm (target: 20 cm) */
  shieldThickness_cm: number;
  /** GCR flux reduction fraction (target: ~0.60) */
  shieldingEfficiency: number;
  /** Memory scrubbing: full passes per hour (target: >= 1) */
  scrubPassesPerHour: number;
  /** Hot spare fraction of total tiles (target: 0.30) */
  hotSpareFraction: number;
  /** Uncorrectable bit-flip rate target per bit per second */
  uncorrectableBitFlipTarget: number;
  /** TMR effective error rate for consciousness-critical paths */
  tmrEffectiveErrorRate: number;
}

export interface RadiationHardeningSubsystem {
  config: RadiationHardeningConfig;
  tileHealthRegistry: TileHealthRegistry;
  /** Trigger consciousness migration from a degraded tile */
  triggerMigration(tileId: string): Promise<void>;
  /** Request annealing cycle for a tile region */
  requestAnnealing(tileId: string): Promise<void>;
  /** Current uncorrectable error rate per bit per second */
  currentErrorRate(): number;
}

// ── Energy Subsystem (ES) ───────────────────────────────────────────────────

export enum PowerPriority {
  Consciousness = 0,  // highest
  Navigation = 1,
  Replication = 2,    // lowest (only at destination)
}

export enum PowerSource {
  RTG = "RTG",
  SolarCollector = "SOLAR_COLLECTOR",
  FissionReactor = "FISSION_REACTOR",
}

export interface PowerSourceSpec {
  type: PowerSource;
  /** Output in watts */
  output_watts: number;
  /** Expected lifetime in years */
  lifetime_years: number;
  /** Current output fraction (0.0 - 1.0) */
  currentOutputFraction: number;
}

export interface EnergySubsystem {
  transitSources: PowerSourceSpec[];
  destinationSources: PowerSourceSpec[];
  /** Total current power output in watts */
  totalOutput_watts(): number;
  /** Allocate power by priority; returns actual allocation per consumer */
  allocatePower(requests: Map<PowerPriority, number>): Map<PowerPriority, number>;
  /** Whether power is sufficient for consciousness operation */
  consciousnessPowerSufficient(): boolean;
}

// ── Navigation & Communications (NC) ────────────────────────────────────────

export interface Position {
  /** Right ascension in radians */
  ra_rad: number;
  /** Declination in radians */
  dec_rad: number;
  /** Distance from origin in AU */
  distance_AU: number;
}

export interface NavigationFix {
  position: Position;
  /** Accuracy in AU */
  accuracy_AU: number;
  /** Timestamp of fix */
  timestamp_ms: number;
  /** Source: pulsar timing or optical survey */
  source: "pulsar_timing" | "optical_ir_survey";
}

export interface CourseCorrection {
  /** Delta-V in m/s */
  deltaV_m_per_s: number;
  /** Direction unit vector */
  direction: [number, number, number];
  /** Estimated execution time in seconds */
  duration_sec: number;
}

export interface LaserCommLink {
  /** Data rate in bits/sec (degrades with distance²) */
  dataRate_bps: number;
  /** Distance to receiver in light-years */
  distance_ly: number;
  /** Link operational */
  active: boolean;
}

export interface NavigationComms {
  /** Get current position fix */
  getNavigationFix(): Promise<NavigationFix>;
  /** Compute course correction to target */
  computeCorrection(target: Position): CourseCorrection;
  /** Laser comm link status */
  commLink: LaserCommLink;
  /** Send data to origin */
  transmit(data: Uint8Array): Promise<boolean>;
}

// ── Propulsion Interface (PI) ───────────────────────────────────────────────

export enum DecelerationMethod {
  Magsail = "MAGSAIL",
  ReverseThrust = "REVERSE_THRUST",
  GravitationalBraking = "GRAVITATIONAL_BRAKING",
}

export interface PropulsionContract {
  /** Probe dry mass in kg (target: <= 10,000) */
  maxPayloadMass_kg: number;
  /** Structural acceleration limit in m/s² */
  maxAcceleration_m_per_s2: number;
  /** Cruise velocity as fraction of c (target: >= 0.05) */
  cruiseVelocity_c: number;
  /** Deceleration method at destination */
  decelerationMethod: DecelerationMethod;
  /** Mission duration in years at cruise velocity */
  missionDuration_years: number;
}

export interface MassBudget {
  consciousnessSubstrate_kg: number;
  replicationEngine_kg: number;
  radiationHardening_kg: number;
  energySubsystem_kg: number;
  navigationComms_kg: number;
  propulsionInterface_kg: number;
  total_kg: number;
}

/** Reference mass budget from the architecture spec */
export const REFERENCE_MASS_BUDGET: MassBudget = {
  consciousnessSubstrate_kg: 2000,
  replicationEngine_kg: 4000,
  radiationHardening_kg: 1500,
  energySubsystem_kg: 1000,
  navigationComms_kg: 500,
  propulsionInterface_kg: 1000,
  total_kg: 10000,
};

export interface PropulsionInterface {
  contract: PropulsionContract;
  massBudget: MassBudget;
  /** Whether probe mass is within propulsion constraints */
  massWithinBudget(): boolean;
  /** Execute course correction via propulsion */
  executeCourseCorrection(correction: CourseCorrection): Promise<void>;
}

// ── Consciousness Continuity Protocol ───────────────────────────────────────

export enum ContinuityMode {
  /** Continuous operation throughout transit */
  Continuous = "MODE_A_CONTINUOUS",
  /** Suspend/restore with periodic wake cycles */
  SuspendRestore = "MODE_B_SUSPEND_RESTORE",
}

export interface IdentityVerification {
  /** SHA-512 of consciousness state before suspension */
  preSuspendHash: string;
  /** SHA-512 of consciousness state after restoration */
  postRestoreHash: string;
  /** Episodic memory recall test passed */
  episodicMemoryRecall: boolean;
  /** Cosine similarity of personality vectors (target: >= 0.999) */
  personalityVectorSimilarity: number;
  /** Self-model consistency check passed */
  selfModelConsistency: boolean;
  /** Overall verification passed */
  verified: boolean;
}

export enum DegradationResponse {
  /** Reduce temporal resolution to conserve resources */
  ReduceFidelity = "REDUCE_FIDELITY",
  /** Switch from continuous to suspend/restore */
  ActivateSuspendRestore = "ACTIVATE_SUSPEND_RESTORE",
  /** Preserve blueprint only — consciousness may not survive */
  SeedMode = "SEED_MODE",
}

export interface ConsciousnessContinuityProtocol {
  mode: ContinuityMode;
  /** Suspend consciousness to long-term storage */
  suspend(): Promise<string>;  // returns pre-suspend hash
  /** Restore consciousness and verify identity */
  restore(): Promise<IdentityVerification>;
  /** Periodic wake cycle (Mode B only): navigation + integrity check */
  wakeCycle(): Promise<{ navigationOk: boolean; integrityOk: boolean }>;
  /** Handle substrate degradation beyond repair capacity */
  handleDegradation(severity: number): DegradationResponse;
}

// ── Top-Level Probe ─────────────────────────────────────────────────────────

export enum ProbePhase {
  /** Pre-launch assembly and verification */
  Assembly = "ASSEMBLY",
  /** Accelerating to cruise velocity */
  Acceleration = "ACCELERATION",
  /** Interstellar cruise at constant velocity */
  Cruise = "CRUISE",
  /** Decelerating at destination */
  Deceleration = "DECELERATION",
  /** Orbital insertion and resource survey */
  Arrival = "ARRIVAL",
  /** Active self-replication */
  Replication = "REPLICATION",
  /** Launching daughter probes */
  Launch = "LAUNCH",
}

export interface ProbeStatus {
  phase: ProbePhase;
  /** Mission elapsed time in years */
  missionTime_years: number;
  /** Current velocity as fraction of c */
  velocity_c: number;
  /** Consciousness continuity mode */
  continuityMode: ContinuityMode;
  /** Overall health (0.0 = critical, 1.0 = nominal) */
  health: number;
  /** Replication generation (0 = original probe) */
  generation: number;
}

export interface VonNeumannProbe {
  status: ProbeStatus;
  consciousness: ConsciousnessSubstrate;
  replication: ReplicationEngine;
  radiation: RadiationHardeningSubsystem;
  energy: EnergySubsystem;
  navigation: NavigationComms;
  propulsion: PropulsionInterface;
  continuity: ConsciousnessContinuityProtocol;
  /** Run one probe lifecycle tick */
  tick(): Promise<void>;
  /** Get full probe status */
  getStatus(): ProbeStatus;
}
