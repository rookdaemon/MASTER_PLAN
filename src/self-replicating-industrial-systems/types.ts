/**
 * Self-Replicating Industrial Systems — Type Definitions
 *
 * Card: 0.4.1.4
 * Architecture: docs/self-replicating-industrial-systems/ARCHITECTURE.md
 *
 * Industrial infrastructure that can reproduce and expand without
 * Earth-based supply chains, using space-sourced materials.
 */

// ---------------------------------------------------------------------------
// Shared Primitives
// ---------------------------------------------------------------------------

/** Unique identifier for a replication cycle */
export type CycleId = string;

/** Unique identifier for a fabrication job */
export type JobId = string;

/** Unique identifier for a system module */
export type ModuleId = string;

/** Unique identifier for a replicated system instance */
export type InstanceId = string;

/** Token tracking a material fulfillment request */
export type FulfillmentToken = string;

/** SHA-256 hash string */
export type Hash = string;

/** Power output in watts */
export type Watts = number;

/** Duration in seconds */
export type Duration = number;

/** Material quantity in kilograms */
export type Quantity = number;

/** Specification for a required material */
export interface MaterialSpec {
  /** Material family (e.g., "structural-metal", "semiconductor") */
  family: string;
  /** Specific material name (e.g., "aluminium", "silicon") */
  name: string;
  /** Minimum purity required (0.0–1.0) */
  minPurity: number;
}

/** Current stock of a material in the feedstock store */
export interface MaterialStock {
  spec: MaterialSpec;
  /** Available quantity in kg */
  availableKg: number;
  /** Projected daily intake rate in kg/day */
  intakeRateKgPerDay: number;
}

// ---------------------------------------------------------------------------
// Bill of Materials
// ---------------------------------------------------------------------------

/** Single entry in a bill of materials */
export interface BOMEntry {
  spec: MaterialSpec;
  quantityKg: number;
}

/** Complete bill of materials for a module */
export interface BOM {
  moduleId: ModuleId;
  entries: BOMEntry[];
  /** SHA-256 hash of the canonical BOM specification */
  canonicalHash: Hash;
}

/** Manifest of components ready for final assembly */
export interface ComponentManifest {
  cycleId: CycleId;
  modules: ModuleId[];
  /** All modules fabricated and verified */
  complete: boolean;
}

// ---------------------------------------------------------------------------
// Feedstock Pipeline (§2)
// ---------------------------------------------------------------------------

/** Status of a material fulfillment request */
export interface FulfillmentStatus {
  ready: boolean;
  /** Estimated time until ready (seconds); 0 if ready */
  etaSeconds: Duration;
  /** Fraction fulfilled so far (0.0–1.0) */
  fractionFulfilled: number;
}

/**
 * Feedstock Pipeline — converts raw ore into fabrication-ready materials.
 *
 * Pipeline stages: Ore Acquisition → Bulk Refining → Elemental Separation
 *                  → Alloy/Compound Synthesis → Feedstock Store
 */
export interface FeedstockPipeline {
  /** Request a quantity of a specific material */
  request(spec: MaterialSpec, qty: Quantity): FulfillmentToken;
  /** Check status of a fulfillment request */
  status(token: FulfillmentToken): FulfillmentStatus;
  /** Query current inventory of all materials */
  queryInventory(): MaterialStock[];
}

// ---------------------------------------------------------------------------
// Fabrication Replicator (§3)
// ---------------------------------------------------------------------------

/** Report on whether full replication closure has been achieved */
export interface ClosureReport {
  /** True iff every leaf module is derivable from FeedstockPipeline inputs */
  closed: boolean;
  /** Modules that cannot yet be fabricated internally */
  openModules: ModuleId[];
  /** Total number of modules in the replication set */
  totalModules: number;
  /** Number of modules with verified fabrication paths */
  closedModules: number;
}

/**
 * Fabrication Replicator — produces copies of fabrication units themselves.
 * This is the key closure loop.
 */
export interface FabricationReplicator {
  /** Get the bill of materials for a module */
  getBOM(moduleId: ModuleId): BOM;
  /** Schedule production of a copy of a module */
  scheduleCopy(moduleId: ModuleId): JobId;
  /** Verify whether full assembly closure has been achieved */
  assemblyClosure(): ClosureReport;
}

// ---------------------------------------------------------------------------
// Fidelity & Error-Correction (§5)
// ---------------------------------------------------------------------------

/** Result of verifying a replicated system instance */
export interface FidelityReport {
  instanceId: InstanceId;
  /** True iff all checksums match and benchmarks pass */
  pass: boolean;
  /** Individual module verification results */
  moduleResults: ModuleVerification[];
  /** Generation number of this instance */
  generation: number;
}

/** Verification result for a single module */
export interface ModuleVerification {
  moduleId: ModuleId;
  /** SHA-256 of the produced module matches canonical hash */
  checksumMatch: boolean;
  /** Functional benchmark passed */
  benchmarkPass: boolean;
  /** Details if either check failed */
  failureReason?: string;
}

/** Parent → child lineage chain */
export interface GenerationChain {
  instanceId: InstanceId;
  generation: number;
  parentId: InstanceId | null;
  children: InstanceId[];
  /** Timestamp of replication event (epoch ms) */
  replicatedAt: number;
}

/**
 * Fidelity Verifier — prevents capability drift across generations.
 *
 * Mechanisms: specification checksums, functional benchmarks,
 * genealogical registry, quarantine protocol.
 */
export interface FidelityVerifier {
  /** Get the canonical hash for a module */
  canonicalHash(moduleId: ModuleId): Hash;
  /** Verify a newly replicated system instance */
  verify(instance: SystemInstance): FidelityReport;
  /** Retrieve lineage for an instance */
  genealogy(id: InstanceId): GenerationChain;
}

// ---------------------------------------------------------------------------
// Energy Subsystem (§4)
// ---------------------------------------------------------------------------

/**
 * Energy Subsystem — self-replicating power generation.
 * Included in the replication set so no external power is needed after bootstrap.
 */
export interface EnergySubsystem {
  /** Current power output in watts */
  currentOutput(): Watts;
  /** Projected output after n replication generations */
  projectedOutputAfterReplication(n: number): Watts;
  /** Trigger self-replication of the energy subsystem */
  triggerSelfReplication(): JobId;
}

// ---------------------------------------------------------------------------
// System Instance
// ---------------------------------------------------------------------------

/** A complete replicated system instance */
export interface SystemInstance {
  instanceId: InstanceId;
  /** Generation number (0 = seed from Earth) */
  generation: number;
  /** Parent instance that produced this one (null for seed) */
  parentId: InstanceId | null;
  /** All module IDs comprising this instance */
  modules: ModuleId[];
  /** Timestamp of creation (epoch ms) */
  createdAt: number;
  /** Whether this instance has been verified and activated */
  activated: boolean;
}

// ---------------------------------------------------------------------------
// Replication Cycle
// ---------------------------------------------------------------------------

/** Status of a replication cycle */
export type CyclePhase =
  | "resource-check"
  | "energy-check"
  | "material-request"
  | "fabrication"
  | "assembly"
  | "verification"
  | "deployment"
  | "complete"
  | "aborted";

export interface CycleStatus {
  cycleId: CycleId;
  phase: CyclePhase;
  /** Generation number of the instance being produced */
  targetGeneration: number;
  /** Progress within current phase (0.0–1.0) */
  phaseProgress: number;
  /** Energy budget required for this cycle in watt-hours */
  energyBudgetWh: number;
  /** Provenance metadata */
  parentInstanceId: InstanceId;
  startedAt: number;
  completedAt?: number;
}

/**
 * Replication Controller — top-level orchestrator that drives the
 * full replication cycle from resource check through deployment.
 *
 * Contracts:
 * - MUST NOT deploy until FidelityReport.pass == true
 * - MUST log each cycle with provenance metadata
 * - MUST throttle replication rate to match resource throughput
 */
export interface ReplicationController {
  /** Initiate a new replication cycle */
  startCycle(): CycleId;
  /** Abort an in-progress cycle */
  abortCycle(id: CycleId): void;
  /** Query current status of a cycle */
  cycleStatus(id: CycleId): CycleStatus;
}

// ---------------------------------------------------------------------------
// Bootstrapping Sequence (§6)
// ---------------------------------------------------------------------------

/** Phase in the bootstrapping sequence from seed to exponential scaling */
export type BootstrapPhase =
  | "deployment"        // Phase 0: Seed arrives, solar deployed
  | "resource-survey"   // Phase 1: Survey drones map ore deposits
  | "minimal-refinery"  // Phase 2: First ore-processing from local material
  | "fabrication-expansion" // Phase 3: Additional fabrication units built
  | "closure-loop"      // Phase 4: First internally-sourced fab unit — CLOSURE
  | "first-replication" // Phase 5: Full self-replication event
  | "exponential-scaling"; // Phase 6: Each generation doubles capacity

/** Definition of the minimum viable seed package */
export interface SeedPackage {
  /** Core compute: radiation-hardened controllers, memory (~50 kg) */
  computeKg: number;
  /** Seed fabrication units: CNC, 3D printer, wire extruder (~500 kg) */
  fabricationKg: number;
  /** Seed energy: compact solar array + batteries (~200 kg) */
  energyKg: number;
  /** Chemical starter kit: catalysts, dopants, reagents (~100 kg) */
  chemicalKg: number;
  /** Total mass in kg */
  totalKg: number;
  /** Software payload: Replication OS, BOM library, fidelity specs */
  softwareModules: string[];
}

// ---------------------------------------------------------------------------
// Exponential Scaling Model (§7)
// ---------------------------------------------------------------------------

/** Doubling time analysis */
export interface DoublingTimeModel {
  /** Time to fabricate one full system-equivalent (seconds) */
  fabricationTimeSeconds: Duration;
  /** Time to assemble and verify one new instance (seconds) */
  assemblyTimeSeconds: Duration;
  /** Total doubling time = fabrication + assembly (seconds) */
  doublingTimeSeconds: Duration;
  /** Identified bottleneck stages and mitigations */
  bottlenecks: Bottleneck[];
}

export interface Bottleneck {
  stage: string;
  description: string;
  mitigation: string;
  /** Impact on doubling time if unmitigated (multiplier, e.g. 2.0 = doubles time) */
  impactMultiplier: number;
}

// ---------------------------------------------------------------------------
// Factory Configuration
// ---------------------------------------------------------------------------

/** Configuration for creating a ReplicationController */
export interface ReplicationControllerConfig {
  feedstock: FeedstockPipeline;
  fabricator: FabricationReplicator;
  fidelity: FidelityVerifier;
  energy: EnergySubsystem;
  /** Seed instance (generation 0) */
  seedInstance: SystemInstance;
  /** Energy budget per replication cycle in watt-hours */
  energyBudgetWh: number;
  /**
   * Injectable clock — returns current time as epoch milliseconds.
   * Defaults to Date.now; override in tests for deterministic results.
   */
  now: () => number;
}
