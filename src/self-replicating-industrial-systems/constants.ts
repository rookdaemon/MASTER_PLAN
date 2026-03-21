/**
 * Self-Replicating Industrial Systems — Threshold Registry Constants
 *
 * Card: 0.4.1.4
 * Architecture: docs/self-replicating-industrial-systems/ARCHITECTURE.md
 * Threshold Registry: plan/0.4.1.4-self-replicating-industrial-systems.md
 *
 * All numeric constants for the self-replicating industrial system design
 * are centralised here. No magic numbers anywhere else in the module.
 */

// ---------------------------------------------------------------------------
// Seed Package Mass Constants (kg)
// ---------------------------------------------------------------------------

/** Radiation-hardened controllers + memory for replication OS (~50 kg) */
export const SEED_COMPUTE_MASS_KG = 50;

/** Miniaturised CNC, 3D printer, wire extruder — minimum versatile set (~500 kg) */
export const SEED_FABRICATION_MASS_KG = 500;

/** Compact solar array + batteries for bootstrap power (~200 kg) */
export const SEED_ENERGY_MASS_KG = 200;

/** Catalysts, dopants, precision reagents not available in asteroid regolith (~100 kg) */
export const SEED_CHEMICAL_KIT_MASS_KG = 100;

/**
 * Total seed package mass (~850 kg).
 * Sum of compute + fabrication + energy + chemical kit.
 * Must fit Earth launch constraints.
 */
export const TOTAL_SEED_PACKAGE_MASS_KG =
  SEED_COMPUTE_MASS_KG +
  SEED_FABRICATION_MASS_KG +
  SEED_ENERGY_MASS_KG +
  SEED_CHEMICAL_KIT_MASS_KG;

// ---------------------------------------------------------------------------
// Energy Constants
// ---------------------------------------------------------------------------

/**
 * Energy required to complete one full replication cycle (Wh).
 * Gates the replication rate; also used as default energyBudgetWh
 * in ReplicationControllerConfig.
 */
export const ENERGY_BUDGET_PER_CYCLE_WH = 10_000;

// ---------------------------------------------------------------------------
// Doubling Time Constants (seconds)
// ---------------------------------------------------------------------------

const SECONDS_PER_MONTH = 30 * 24 * 60 * 60; // 2_592_000

/**
 * Target minimum doubling time in seconds (6 months steady-state best case).
 * Driven by resource density; determined by fabrication + assembly time.
 */
export const TARGET_DOUBLING_TIME_MIN_SECONDS = 6 * SECONDS_PER_MONTH;

/**
 * Target maximum doubling time in seconds (18 months steady-state worst case).
 * Resource-scarce environment upper bound.
 */
export const TARGET_DOUBLING_TIME_MAX_SECONDS = 18 * SECONDS_PER_MONTH;

// ---------------------------------------------------------------------------
// Material Purity Constants
// ---------------------------------------------------------------------------

/**
 * Default minimum material purity threshold for structural metals (0.95).
 * Lower values allow faster processing; higher values improve durability.
 */
export const MIN_MATERIAL_PURITY = 0.95;

// ---------------------------------------------------------------------------
// Bottleneck Constants
// ---------------------------------------------------------------------------

/**
 * Impact multiplier for semiconductor fabrication bottleneck (2.0×).
 * Trace element scarcity doubles the cycle time if unmitigated.
 * Semiconductor fab is the critical path in the replication pipeline.
 */
export const BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR = 2.0;
