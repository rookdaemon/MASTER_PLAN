/**
 * Asteroid Resource Utilization — Threshold Registry Constants
 * Domain: 0.4.1.2
 *
 * All named constants from the Threshold Registry.
 * No magic numbers should appear in implementation code outside this file.
 */

/** Top-N asteroid candidates to select for missions. */
export const TOP_N_CANDIDATES = 10;

/** Margin (%) for selection quality vs. optimal; greedy is exact for independent candidates. */
export const SELECTION_OPTIMALITY_TOLERANCE = 0.05;

/** Minimum acceptable extraction rate vs. theoretical (80%). */
export const EXTRACTION_EFFICIENCY_THRESHOLD = 0.80;

/** Minimum continuous autonomous operation (days). */
export const AUTONOMY_PERIOD_MIN = 90;

/** Minimum daily extraction efficiency (random variation floor). */
export const DAILY_EFFICIENCY_RANGE_LOW = 0.85;

/** Maximum daily extraction efficiency. */
export const DAILY_EFFICIENCY_RANGE_HIGH = 1.00;

/** Daily equipment fault probability (2% per day). */
export const FAULT_PROBABILITY = 0.02;

/** Energy cost per kg of ore extracted (kWh/kg). */
export const ENERGY_PER_KG_EXTRACTION = 0.5;

/** Minimum metal product purity for downstream manufacturing. */
export const METAL_PURITY_MIN = 0.95;

/** Minimum water/LOX purity for life support and propulsion. */
export const VOLATILE_PURITY_MIN = 0.99;

/** Energy produced/consumed ratio must exceed this (20% surplus). */
export const ENERGY_SURPLUS_MIN = 1.2;

/** Maximum acceptable supply interruption to any consumer (days). */
export const SUPPLY_GAP_TOLERANCE = 30;

/** Default per-material storage capacity at depot (kg). */
export const DEPOT_CAPACITY_DEFAULT = 1_000_000;

/** Solar array power output (kW) for processing energy calculations. */
export const SOLAR_ARRAY_POWER = 150;

/** Energy produced per kg of hydrogen via fuel cell (kWh/kg), based on LHV. */
export const H2_ENERGY_DENSITY = 33.3;

/** Daily extraction as fraction of total resource mass. */
export const BASE_EXTRACTION_RATE_FRACTION = 0.001;

/** Volatile mass fraction above which ablation is preferred over mass-driver. */
export const VOLATILE_RATIO_THRESHOLD = 0.3;

/** Fraction of daily demand that must be dispensed to avoid a gap being recorded. */
export const DEMAND_MET_THRESHOLD = 0.99;
