/**
 * Stellar Resource Extraction — Core Type Definitions
 *
 * Types and interfaces for the autonomous stellar resource extraction
 * pipeline defined in docs/stellar-resource-extraction/ARCHITECTURE.md
 *
 * Four subsystems:
 *   SEH — Stellar Energy Harvesting
 *   PM  — Prospecting and Mining
 *   MPR — Material Processing and Refining
 *   AOA — Autonomous Operation and Adaptation
 */

// ── Stellar Classification ──────────────────────────────────────────────────

/** Spectral classes supported by the extraction system (F through M) */
export type SpectralClass = "F" | "G" | "K" | "M";

export interface StellarCharacterization {
  /** Spectral class of host star */
  spectralClass: SpectralClass;
  /** Sub-type within class (0–9) */
  subType: number;
  /** Luminosity relative to Sol (L☉) */
  luminosity_solar: number;
  /** Effective temperature in Kelvin */
  temperature_K: number;
  /** Stellar variability index (0.0 = stable, 1.0 = highly variable) */
  variabilityIndex: number;
}

// ── Material Types ──────────────────────────────────────────────────────────

export enum MaterialClass {
  StructuralMetals = "STRUCTURAL_METALS",
  Semiconductors = "SEMICONDUCTORS",
  ThermalManagement = "THERMAL_MANAGEMENT",
  Volatiles = "VOLATILES",
  RareElements = "RARE_ELEMENTS",
  RefractoryMaterials = "REFRACTORY_MATERIALS",
}

/** All material classes required for probe fabrication */
export const ALL_MATERIAL_CLASSES: MaterialClass[] = Object.values(MaterialClass);

export interface MaterialRequirement {
  materialClass: MaterialClass;
  /** Required mass in kg */
  mass_kg: number;
  /** Required purity (0.0–1.0; semiconductor-grade Si ≈ 0.999999) */
  purityRequired: number;
}

/** Feedstock specification: what the probe blueprint demands */
export type FeedstockSpec = MaterialRequirement[];

// ── Stellar Energy Harvesting (SEH) ─────────────────────────────────────────

export interface CollectorUnit {
  /** Unique collector ID */
  collectorId: string;
  /** Power output in watts */
  output_watts: number;
  /** Operational health (0.0–1.0) */
  health: number;
  /** Whether fabricated from local materials (vs. seed package) */
  locallyFabricated: boolean;
}

export interface EnergyBudget {
  /** Total watts available from all collectors */
  totalOutput_watts: number;
  /** Allocation to mining operations */
  miningAllocation_watts: number;
  /** Allocation to refining operations */
  refiningAllocation_watts: number;
  /** Allocation to fabrication */
  fabricationAllocation_watts: number;
  /** Allocation to computation */
  computationAllocation_watts: number;
  /** Reserve margin fraction (target: ≥ 0.20) */
  reserveMarginFraction: number;
}

export interface CollectorBlueprint {
  /** Materials needed to fabricate one collector unit */
  materialsPerUnit: Map<MaterialClass, number>;
  /** Power output per unit in watts */
  outputPerUnit_watts: number;
  /** Fabrication time per unit in hours */
  fabricationTime_hours: number;
}

// ── Prospecting and Mining (PM) ─────────────────────────────────────────────

export interface CelestialBody {
  /** Body identifier */
  bodyId: string;
  /** Body type */
  bodyType: "asteroid" | "moon" | "planetesimal" | "ring_material" | "captured_object";
  /** Estimated mass in kg */
  mass_kg: number;
  /** Surface gravity in m/s² */
  surfaceGravity_m_per_s2: number;
  /** Orbital distance from star in AU */
  orbitalDistance_AU: number;
}

export interface CompositionAssay {
  /** Body this assay describes */
  bodyId: string;
  /** Material class → estimated fraction by mass (0.0–1.0) */
  composition: Map<MaterialClass, number>;
  /** Confidence in assay (0.0–1.0) */
  confidence: number;
  /** Method used */
  method: "spectroscopic" | "xrf" | "mass_spectrometry" | "core_sample";
}

export interface ResourceSurveyResult {
  /** Ranked bodies by extraction priority */
  rankedBodies: CelestialBody[];
  /** Composition assays per body */
  assays: Map<string, CompositionAssay>;
  /** Whether any body provides all required material classes */
  allClassesCoverable: boolean;
}

export interface MiningPlan {
  /** Target body */
  bodyId: string;
  /** Material classes to extract */
  targetMaterials: MaterialClass[];
  /** Estimated extraction rate in kg/day */
  extractionRate_kg_per_day: number;
  /** Equipment units required */
  equipmentUnits: number;
  /** Estimated timeline in days */
  timeline_days: number;
}

export interface RawMaterialManifest {
  /** Extracted material entries */
  entries: RawMaterialEntry[];
  /** Total mass extracted in kg */
  totalMass_kg: number;
}

export interface RawMaterialEntry {
  materialClass: MaterialClass;
  /** Mass in kg */
  mass_kg: number;
  /** Source body */
  sourceBodyId: string;
  /** Estimated purity before refining (0.0–1.0) */
  rawPurity: number;
}

// ── Material Processing and Refining (MPR) ──────────────────────────────────

export enum RefiningProcess {
  MagneticSeparation = "MAGNETIC_SEPARATION",
  ElectrostaticSeparation = "ELECTROSTATIC_SEPARATION",
  SolarFurnaceReduction = "SOLAR_FURNACE_REDUCTION",
  ElectricArcReduction = "ELECTRIC_ARC_REDUCTION",
  CarbothermicReduction = "CARBOTHERMIC_REDUCTION",
  CzochralskiGrowth = "CZOCHRALSKI_GROWTH",
  Electrolysis = "ELECTROLYSIS",
  ChemicalVaporDeposition = "CVD",
}

export interface RefiningRecipe {
  /** Target material class */
  materialClass: MaterialClass;
  /** Ordered process steps */
  processes: RefiningProcess[];
  /** Output purity achievable (0.0–1.0) */
  outputPurity: number;
  /** Energy required per kg of output in watt-hours */
  energyPerKg_Wh: number;
  /** Mass yield fraction (output / input) */
  yieldFraction: number;
}

export interface FeedstockInventory {
  /** Refined material entries */
  entries: FeedstockEntry[];
  /** Completion fraction per material class (0.0–1.0 of required) */
  completionByClass: Map<MaterialClass, number>;
}

export interface FeedstockEntry {
  materialClass: MaterialClass;
  /** Refined mass in kg */
  mass_kg: number;
  /** Achieved purity (0.0–1.0) */
  purity: number;
  /** Whether purity meets specification */
  meetsSpec: boolean;
}

// ── Autonomous Operation and Adaptation (AOA) ───────────────────────────────

export enum BootstrapPhase {
  Arrival = "ARRIVAL",
  SeedEnergy = "SEED_ENERGY",
  SeedMining = "SEED_MINING",
  FirstExpansion = "FIRST_EXPANSION",
  FullScaleOperations = "FULL_SCALE_OPS",
  ReplicationReady = "REPLICATION_READY",
}

export interface SystemState {
  /** Current bootstrap phase */
  phase: BootstrapPhase;
  /** Mission elapsed time in years */
  missionTime_years: number;
  /** Stellar characterization */
  star: StellarCharacterization;
  /** Number of active collector units */
  activeCollectors: number;
  /** Number of active mining units */
  activeMiningUnits: number;
  /** Current energy budget */
  energyBudget: EnergyBudget;
  /** Current feedstock inventory */
  feedstockInventory: FeedstockInventory;
  /** Replication readiness (0.0–1.0) */
  replicationReadiness: number;
}

export interface AdaptationLogEntry {
  /** Timestamp in mission years */
  timestamp_years: number;
  /** What was adapted */
  category: "refining_recipe" | "mining_plan" | "energy_allocation" | "process_parameter";
  /** Description of adaptation */
  description: string;
  /** Whether validated on small batch first */
  validated: boolean;
}

export interface ReplicationReadinessSignal {
  /** Whether all feedstock classes meet spec */
  ready: boolean;
  /** Per-class readiness */
  classCoverage: Map<MaterialClass, boolean>;
  /** Total feedstock mass available in kg */
  totalFeedstockMass_kg: number;
  /** Timestamp in mission years */
  timestamp_years: number;
}

// ── Architecture Constants ──────────────────────────────────────────────────

/** Target full-scale power output in watts (10^15 W) */
export const TARGET_FULL_SCALE_POWER_WATTS = 1e15;

/** Seed phase initial power in watts (10^9 W) */
export const SEED_PHASE_POWER_WATTS = 1e9;

/** Maximum years from arrival to replication-ready feedstock */
export const MAX_REPLICATION_TIMELINE_YEARS = 50;

/** Target years for replication-ready feedstock */
export const TARGET_REPLICATION_TIMELINE_YEARS = 20;

/** Minimum reserve margin for energy budget */
export const MIN_RESERVE_MARGIN = 0.20;

/** Semiconductor-grade purity target */
export const SEMICONDUCTOR_PURITY = 0.999999;

/** Seed package max fraction of final infrastructure mass */
export const MAX_SEED_FRACTION = 0.05;

/** Fraction of usable energy budget allocated to mining operations */
export const MINING_ALLOCATION_FRACTION = 0.35;

/** Fraction of usable energy budget allocated to refining operations */
export const REFINING_ALLOCATION_FRACTION = 0.40;

/** Fraction of usable energy budget allocated to fabrication */
export const FABRICATION_ALLOCATION_FRACTION = 0.175;

/** Fraction of usable energy budget allocated to computation */
export const COMPUTATION_ALLOCATION_FRACTION = 0.075;

/** Minimum material fraction to count a class as "present" in a body */
export const BODY_SCORE_ABUNDANCE_THRESHOLD = 0.001;
