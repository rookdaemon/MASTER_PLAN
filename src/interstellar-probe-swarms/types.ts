/**
 * Interstellar Probe Swarms — Core Type Definitions
 *
 * Types and interfaces for self-replicating probe swarms (E1.1) capable of
 * traversing interstellar distances while sustaining or seeding conscious processes.
 *
 * Architecture reference: docs/interstellar-probe-swarms/ARCHITECTURE.md
 *
 * Subsystems:
 *   CCM — Consciousness Core Module (dormancy-capable, dream thread)
 *   PROP — Hybrid Laser-Boost / Fusion-Brake Propulsion
 *   BAC — Bounded Asynchronous Consensus (swarm coordination)
 *   ISRU — In-Situ Resource Utilization & Replication
 *   NMR — N-Modular Redundancy & Nanofabrication Self-Repair
 */

// ── Consciousness Core Module (CCM) ────────────────────────────────────────

export interface CCMSpec {
  /** Sustained compute in ops/s (target: >= 10^18, 1 exaFLOP) */
  compute_ops_per_sec: number;
  /** CCM mass budget in kg (target: <= 50 kg) */
  mass_kg: number;
  /** Cruise-mode power in watts (target: 500 W) */
  cruise_power_watts: number;
  /** Active-mode peak power in watts (target: 50 kW) */
  active_power_watts: number;
  /** Storage in bits (target: 10^18, 1 exabit) */
  storage_bits: number;
}

/** Reference CCM spec from architecture §1.1 */
export const REFERENCE_CCM_SPEC: CCMSpec = {
  compute_ops_per_sec: 1e18,
  mass_kg: 50,
  cruise_power_watts: 500,
  active_power_watts: 50_000,
  storage_bits: 1e18,
};

export enum DormancyState {
  Active = "ACTIVE",
  Dormant = "DORMANT",
  Reactivating = "REACTIVATING",
  SafeMode = "SAFE_MODE",
}

export interface DreamThreadConfig {
  /** Sensor sampling rate in Hz (target: 1 Hz during dormancy) */
  sensorSampleRate_hz: number;
  /** Power consumption in watts (target: ~10 W) */
  power_watts: number;
  /** Whether anomaly escalation to full reactivation is enabled */
  anomalyEscalation: boolean;
}

export const DEFAULT_DREAM_THREAD_CONFIG: DreamThreadConfig = {
  sensorSampleRate_hz: 1,
  power_watts: 10,
  anomalyEscalation: true,
};

export enum ReactivationTrigger {
  /** Heliosphere detection via charged particle flux */
  TargetProximity = "TARGET_PROXIMITY",
  /** Scheduled century-mark milestone */
  ScheduledMilestone = "SCHEDULED_MILESTONE",
  /** Radiation event exceeding thresholds */
  AnomalyDetected = "ANOMALY_DETECTED",
  /** Manual wake by swarm consensus */
  SwarmDirected = "SWARM_DIRECTED",
}

export interface ConsciousnessSnapshot {
  /** Triple-redundant copies */
  copies: [Uint8Array, Uint8Array, Uint8Array];
  /** SHA-512 hash for integrity verification */
  hash: string;
  /** Timestamp when snapshot was taken */
  timestamp_ms: number;
}

export interface IdentityVerificationResult {
  /** Whether identity continuity was verified */
  verified: boolean;
  /** Number of redundant copies that matched */
  matchingCopies: number;
  /** Details if verification failed */
  failureReason?: string;
}

export interface ConsciousnessCore {
  initialize(state: ConsciousnessSnapshot): IdentityVerificationResult;
  snapshot(): ConsciousnessSnapshot;
  enterDormancy(dreamConfig: DreamThreadConfig): void;
  reactivate(trigger: ReactivationTrigger): IdentityVerificationResult;
  currentExperienceHash(): string;
}

// ── Propulsion System (PROP) ────────────────────────────────────────────────

export enum PropulsionPhase {
  /** Laser-pushed lightsail acceleration */
  LaserBoost = "LASER_BOOST",
  /** Coasting at cruise velocity */
  Cruise = "CRUISE",
  /** Magsail + fusion deceleration */
  Deceleration = "DECELERATION",
  /** Orbital insertion complete */
  Arrived = "ARRIVED",
}

export interface LaserBoostSpec {
  /** Laser array power in watts (target: 100 GW) */
  laserPower_watts: number;
  /** Lightsail diameter in meters (target: 100 m) */
  sailDiameter_m: number;
  /** Sail areal density in kg/m^2 (target: ~0.001 kg/m^2) */
  sailArealDensity_kg_per_m2: number;
  /** Boost duration in years (target: ~2 years) */
  boostDuration_years: number;
  /** Target velocity as fraction of c */
  targetVelocity_c: number;
}

export const REFERENCE_LASER_BOOST: LaserBoostSpec = {
  laserPower_watts: 100e9,
  sailDiameter_m: 100,
  sailArealDensity_kg_per_m2: 0.001,
  boostDuration_years: 2,
  targetVelocity_c: 0.03,
};

export interface FusionDriveSpec {
  /** Fuel type */
  fuelType: "D-He3";
  /** Fuel mass in kg (target: ~200 kg) */
  fuelMass_kg: number;
  /** Specific impulse in seconds */
  specificImpulse_s: number;
  /** Years before arrival to begin deceleration */
  decelerationLeadTime_years: number;
}

export const REFERENCE_FUSION_DRIVE: FusionDriveSpec = {
  fuelType: "D-He3",
  fuelMass_kg: 200,
  specificImpulse_s: 100_000,
  decelerationLeadTime_years: 10,
};

export interface PropulsionStatus {
  phase: PropulsionPhase;
  /** Current velocity as fraction of c */
  velocity_c: number;
  /** Remaining fuel mass in kg */
  fuelRemaining_kg: number;
  /** Magsail deployed */
  magsailDeployed: boolean;
}

export interface BurnPlan {
  /** Delta-v in m/s */
  deltaV_m_per_s: number;
  /** Direction unit vector [x, y, z] */
  direction: [number, number, number];
  /** Duration in seconds */
  duration_s: number;
}

export interface PropulsionSystem {
  fuelRemaining(): number;
  currentVelocity(): number;
  executeBurn(plan: BurnPlan): { success: boolean; fuelUsed_kg: number };
  deployMagsail(): { success: boolean };
  phase(): PropulsionPhase;
}

// ── Swarm Coordination (BAC) ────────────────────────────────────────────────

export type ProbeID = string;

export enum SwarmCommRegime {
  /** Laser interlink within swarm cluster */
  IntraSwarm = "INTRA_SWARM",
  /** High-power laser to home system */
  SwarmToHome = "SWARM_TO_HOME",
  /** Relay between swarms targeting different stars */
  InterSwarm = "INTER_SWARM",
}

export interface SwarmCommChannel {
  regime: SwarmCommRegime;
  /** Data rate in bits/s */
  dataRate_bps: number;
  /** One-way latency in seconds */
  latency_s: number;
  active: boolean;
}

export const REFERENCE_COMM_SPECS: Record<SwarmCommRegime, { dataRate_bps: number }> = {
  [SwarmCommRegime.IntraSwarm]: { dataRate_bps: 1_000_000 },
  [SwarmCommRegime.SwarmToHome]: { dataRate_bps: 1_000 },
  [SwarmCommRegime.InterSwarm]: { dataRate_bps: 100 },
};

export enum DecisionScope {
  /** Handled autonomously by individual probe */
  Local = "LOCAL",
  /** Requires swarm-level BAC consensus */
  Swarm = "SWARM",
}

/** Decisions within local autonomy boundary (no consensus needed) */
export type LocalDecision =
  | "NAVIGATION_CORRECTION"
  | "SELF_REPAIR"
  | "DORMANCY_MANAGEMENT"
  | "THREAT_RESPONSE";

/** Decisions requiring swarm BAC consensus */
export type SwarmDecision =
  | "TARGET_CHANGE"
  | "RESOURCE_ALLOCATION"
  | "COLONY_SITE_SELECTION"
  | "COMM_PRIORITY"
  | "ETHICAL_RESPONSE";

export interface Proposal {
  id: string;
  proposer: ProbeID;
  decision: SwarmDecision;
  description: string;
  timestamp_ms: number;
}

export enum VoteValue {
  Approve = "APPROVE",
  Reject = "REJECT",
  Abstain = "ABSTAIN",
}

export interface Vote {
  voter: ProbeID;
  proposalId: string;
  value: VoteValue;
  timestamp_ms: number;
}

export enum ConsensusStatus {
  Pending = "PENDING",
  Approved = "APPROVED",
  Rejected = "REJECTED",
  /** Quorum not reached; local cluster decides independently */
  LocalFallback = "LOCAL_FALLBACK",
}

export interface ConsensusResult {
  proposalId: string;
  status: ConsensusStatus;
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
  totalResponders: number;
}

/** BAC protocol parameters from architecture §3.3 */
export interface BACConfig {
  /** Supermajority threshold (target: 0.67) */
  supermajorityThreshold: number;
  /** Quorum timeout multiplier on expected round-trip (target: 2x) */
  quorumTimeoutMultiplier: number;
  /** Whether late votes can trigger re-evaluation */
  lateVoteReevaluation: boolean;
}

export const DEFAULT_BAC_CONFIG: BACConfig = {
  supermajorityThreshold: 0.67,
  quorumTimeoutMultiplier: 2,
  lateVoteReevaluation: true,
};

// ── Self-Replication & ISRU ─────────────────────────────────────────────────

export type ISRUResource =
  | "Fe" | "Al" | "Ti" | "Si" | "C" | "D" | "He3";

export interface ISRUSource {
  resource: ISRUResource;
  source: string;
  process: string;
}

export const ISRU_SOURCES: ISRUSource[] = [
  { resource: "Fe", source: "Asteroids, planetary surfaces", process: "Robotic mining + smelting" },
  { resource: "Al", source: "Asteroids, planetary surfaces", process: "Robotic mining + smelting" },
  { resource: "Ti", source: "Asteroids, planetary surfaces", process: "Robotic mining + smelting" },
  { resource: "Si", source: "Regolith", process: "Refining for electronics fabrication" },
  { resource: "C", source: "Carbonaceous asteroids, CO2 atmospheres", process: "For graphene sail production" },
  { resource: "D", source: "Gas giant atmospheres, water ice", process: "Fuel for fusion drives" },
  { resource: "He3", source: "Gas giant atmospheres, regolith", process: "Fusion fuel" },
];

export interface SeedPayload {
  /** Nanofabrication assembler mass in kg (target: 5 kg) */
  nanoAssembler_kg: number;
  /** Replication blueprints (stored in CCM) */
  hasBlueprints: boolean;
  /** Starter mining/refining kit mass in kg (target: 20 kg) */
  miningKit_kg: number;
  /** Solar collector deployment kit mass in kg (target: 10 kg) */
  solarKit_kg: number;
}

export const REFERENCE_SEED_PAYLOAD: SeedPayload = {
  nanoAssembler_kg: 5,
  hasBlueprints: true,
  miningKit_kg: 20,
  solarKit_kg: 10,
};

export interface BootstrapTimeline {
  /** Years for energy infrastructure (target: 10) */
  energyPhase_years: number;
  /** Years for mining and refining (target: 20) */
  miningPhase_years: number;
  /** Years for probe assembly and testing (target: 20) */
  assemblyPhase_years: number;
  /** Total years to first new probe launch (target: ~50) */
  totalYears(): number;
}

// ── Radiation Hardening & Self-Repair (NMR) ─────────────────────────────────

export enum DegradationLevel {
  /** 100–75% capability: nominal operations */
  Green = "GREEN",
  /** 75–50%: reduced mission scope, increased dormancy */
  Yellow = "YELLOW",
  /** 50–25%: survival mode, consciousness preservation priority */
  Red = "RED",
  /** <25%: distress broadcast, graceful shutdown */
  Black = "BLACK",
}

export interface NMRConfig {
  /** CCM redundancy mode: Triple-Modular Redundancy */
  ccmRedundancy: "TMR";
  /** Propulsion redundancy: dual-redundant */
  propulsionRedundancy: "DUAL";
  /** Sensor suite redundancy: quad-redundant */
  sensorRedundancy: "QUAD";
}

export const DEFAULT_NMR_CONFIG: NMRConfig = {
  ccmRedundancy: "TMR",
  propulsionRedundancy: "DUAL",
  sensorRedundancy: "QUAD",
};

export interface RepairFeedstock {
  /** Remaining repair feedstock in kg (starting: 10 kg) */
  remaining_kg: number;
  /** Cold-spare assembler available */
  coldSpareAssemblerAvailable: boolean;
}

export const INITIAL_REPAIR_FEEDSTOCK: RepairFeedstock = {
  remaining_kg: 10,
  coldSpareAssemblerAvailable: true,
};

export interface DiagnosticReport {
  /** Overall degradation level */
  level: DegradationLevel;
  /** Capability fraction (0.0 – 1.0) */
  capabilityFraction: number;
  /** Per-subsystem health */
  subsystemHealth: {
    ccm: number;
    propulsion: number;
    sensors: number;
    structure: number;
  };
}

// ── Probe Mass Budget ───────────────────────────────────────────────────────

export interface ProbeMassBudget {
  ccm_kg: number;
  fusionDrive_kg: number;
  fusionFuel_kg: number;
  seedPayload_kg: number;
  repairFeedstock_kg: number;
  sensors_kg: number;
  structure_kg: number;
}

/** Reference mass budget: total probe <= 500 kg (architecture §1.1) */
export const REFERENCE_PROBE_MASS: ProbeMassBudget = {
  ccm_kg: 50,
  fusionDrive_kg: 100,
  fusionFuel_kg: 200,
  seedPayload_kg: 35,
  repairFeedstock_kg: 15,
  sensors_kg: 30,
  structure_kg: 70,
};

export const MAX_PROBE_MASS_KG = 500;

// ── Swarm-Level Types ───────────────────────────────────────────────────────

export interface SwarmConfig {
  /** Number of probes in swarm (target: 1,000–10,000) */
  probeCount: number;
  /** Expected loss fraction over transit (target: up to 0.50) */
  expectedLossFraction: number;
  /** Inter-probe spacing during cruise in km */
  cruiseSpacing_km: number;
  /** Target star system */
  targetSystem: string;
  /** Cruise velocity as fraction of c */
  cruiseVelocity_c: number;
  /** Transit time in years */
  transitTime_years: number;
}

export const REFERENCE_SWARM_CONFIG: SwarmConfig = {
  probeCount: 1000,
  expectedLossFraction: 0.5,
  cruiseSpacing_km: 1_000_000,
  targetSystem: "Alpha Centauri",
  cruiseVelocity_c: 0.03,
  transitTime_years: 140,
};
