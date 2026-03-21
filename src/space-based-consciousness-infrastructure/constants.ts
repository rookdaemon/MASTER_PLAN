/**
 * Space-Based Consciousness Infrastructure — Threshold Registry
 *
 * All constants from the Threshold Registry in card 0.4.1.1.
 * Each value has a name, value, unit, valid range, rationale, and sensitivity
 * as specified in the architecture. No magic numbers in implementation code —
 * all numeric thresholds are referenced from this file.
 */

// ── Platform Tier Identifiers ────────────────────────────────────────────────

export enum PlatformTier {
  /** LEO Research Platform (400–2,000 km) */
  A = "A",
  /** GEO / Cislunar Permanent Station (36,000 km or L4/L5) */
  B = "B",
  /** Deep-Space Autonomous Node (asteroid belt, outer planets, interstellar precursor) */
  C = "C",
}

// ── Radiation MTBF Thresholds (hours) ────────────────────────────────────────

/** MTBF ≥ 10⁵ h — Research-grade; 5-yr mission with EDAC-only */
export const MTBF_TIER_A_HOURS = 1e5;

/** MTBF ≥ 5 × 10⁵ h — 25-yr persistent hosting with TMR */
export const MTBF_TIER_B_HOURS = 5e5;

/** MTBF ≥ 10⁶ h — 100-yr autonomous operation with TMR + self-repair */
export const MTBF_TIER_C_HOURS = 1e6;

// ── Thermal Thresholds ───────────────────────────────────────────────────────

/** Substrate temperature tolerance: ±5 °C from setpoint */
export const THERMAL_SETPOINT_TOLERANCE_C = 5;

/** Nominal thermal setpoint: 25 °C (configurable 20–30 °C) */
export const THERMAL_SETPOINT_C = 25;

/** Minimum configurable setpoint (°C) */
export const THERMAL_SETPOINT_MIN_C = 20;

/** Maximum configurable setpoint (°C) */
export const THERMAL_SETPOINT_MAX_C = 30;

// ── Power Thresholds ─────────────────────────────────────────────────────────

/** Power uptime: 99.9 % continuous delivery */
export const POWER_UPTIME_PERCENT = 99.9;

/** Fission reactor BOL power: 25 kWe (Tier C) */
export const FISSION_REACTOR_BOL_POWER_KWE = 25;

/** Minimum power to avoid brownout (kWe) — no margin below this */
export const FISSION_REACTOR_MIN_VIABLE_KWE = 14;

// ── Communication Sync Lag Thresholds ────────────────────────────────────────

/** Sync lag — Tight class: ≤ 100 ms (intra-station, unified consciousness) */
export const SYNC_LAG_TIGHT_MS = 100;

/** Sync lag — Loose class: ≤ 10 s (inter-platform, federated consciousness) */
export const SYNC_LAG_LOOSE_S = 10;

/** Sync lag — Eventual class: ≤ 48 h (deep-space DTN, autonomous operation) */
export const SYNC_LAG_EVENTUAL_HOURS = 48;

// ── Radiation Hardening Operational Thresholds ───────────────────────────────

/** Memory scrub interval: ≤ 100 ms (full address-space scrub) */
export const MEMORY_SCRUB_INTERVAL_MS = 100;

/** TMR voter latency: ≤ 1 clock cycle */
export const TMR_VOTER_LATENCY_CYCLES = 1;

// ── Tier C Closed-Loop Material Thresholds ───────────────────────────────────

/** Asteroid extraction rate: 100.5 kg/yr */
export const TIER_C_ASTEROID_EXTRACTION_RATE_KG_YR = 100.5;

/** Recycling efficiency: 62 % overall */
export const TIER_C_RECYCLING_EFFICIENCY_PERCENT = 62;

/** Net material consumption after recycling: 38.5 kg/yr */
export const TIER_C_NET_CONSUMPTION_KG_YR = 38.5;

/** Surplus feedstock margin: 62 kg/yr */
export const TIER_C_SURPLUS_MARGIN_KG_YR = 62;

// ── Communication Protocol Thresholds ────────────────────────────────────────

/** Bundle lifetime — Eventual class: 96 h (2× lag class max) */
export const BUNDLE_LIFETIME_EVENTUAL_HOURS = 96;

/** Bundle lifetime — Tight/Loose class: 30 s */
export const BUNDLE_LIFETIME_TIGHT_LOOSE_S = 30;

// ── Thermal Control Thresholds ───────────────────────────────────────────────

/** VCHP conductance range: 10:1 ratio (full open to near-closed) */
export const VCHP_CONDUCTANCE_RANGE_RATIO = 10;

/** Number of VCHPs per Tier C node: 24 (8 per substrate module, triple-redundant) */
export const VCHP_PIPE_COUNT = 24;

/** VCHPs per substrate module */
export const VCHP_PIPES_PER_MODULE = 8;

/** Single VCHP failure temperature transient: ≤ 1.2 °C */
export const VCHP_SINGLE_FAILURE_TRANSIENT_C = 1.2;

// ── Tier B Eclipse Parameters ────────────────────────────────────────────────

/** Max GEO equinox eclipse duration: 72 min */
export const TIER_B_MAX_ECLIPSE_DURATION_MIN = 72;

/** Tier B battery capacity: 50 kWh */
export const TIER_B_BATTERY_CAPACITY_KWH = 50;

/** Tier B RTG backup power: 2 kW */
export const TIER_B_RTG_BACKUP_KW = 2;

/** Tier B critical load during eclipse: 52 kW (consciousness + thermal) */
export const TIER_B_CRITICAL_LOAD_KW = 52;

/** Tier B consciousness substrate clock throttle during eclipse: 85 % */
export const TIER_B_ECLIPSE_THROTTLE_PERCENT = 85;

// ── Self-Repair Thresholds (Tier C) ──────────────────────────────────────────

/** Module hot-swap time limit: ≤ 4 h */
export const TIER_C_HOT_SWAP_MAX_HOURS = 4;

/** Module replacement cadence: 1 per 5–10 years (TID degradation driven) */
export const TIER_C_REPLACEMENT_CADENCE_YEARS_MIN = 5;
export const TIER_C_REPLACEMENT_CADENCE_YEARS_MAX = 10;

/** TMR minimum operating modules: 2 of 3 */
export const TMR_MIN_OPERATING_MODULES = 2;
export const TMR_TOTAL_MODULES = 3;

// ── Reconciliation Window Thresholds ─────────────────────────────────────────

/** Eventual class reconciliation window: 1,000,000 hash entries */
export const RECONCILIATION_WINDOW_EVENTUAL_ENTRIES = 1_000_000;

/** Loose class reconciliation window: 10,000 hash entries */
export const RECONCILIATION_WINDOW_LOOSE_ENTRIES = 10_000;

/** Tight class reconciliation window: 1,000 hash entries */
export const RECONCILIATION_WINDOW_TIGHT_ENTRIES = 1_000;

// ── Design Lifetimes ─────────────────────────────────────────────────────────

/** Tier A design lifetime: 5 years */
export const TIER_A_DESIGN_LIFETIME_YEARS = 5;

/** Tier B design lifetime: 25 years */
export const TIER_B_DESIGN_LIFETIME_YEARS = 25;

/** Tier C design lifetime: 100 years */
export const TIER_C_DESIGN_LIFETIME_YEARS = 100;

// ── MLI Degradation ──────────────────────────────────────────────────────────

/** MLI degradation rate from micrometeorites: ≤ 0.5 %/yr */
export const MLI_DEGRADATION_RATE_PERCENT_YR = 0.5;

// ── Sync Lag Class Enumeration ───────────────────────────────────────────────

export enum SyncLagClass {
  /** ≤ 100 ms — unified consciousness across co-located racks */
  Tight = "TIGHT",
  /** ≤ 10 s — federated consciousness across nearby platforms */
  Loose = "LOOSE",
  /** ≤ 48 h — deep-space DTN, autonomous with periodic reconciliation */
  Eventual = "EVENTUAL",
}

// ── Radiation Hardening Strategy (per Decision 2) ────────────────────────────

export enum RadiationHardeningStrategy {
  /** EDAC-only — Tier A (research-grade, 5-yr life) */
  EDAC = "EDAC",
  /** TMR + EDAC + scrubbing — Tier B/C (25–100-yr, harsher environments) */
  TMR = "TMR",
}

/**
 * Maps platform tier to its radiation hardening strategy (Decision 2).
 * Tier A: EDAC-only. Tier B/C: TMR + EDAC + scrubbing.
 */
export const TIER_HARDENING_STRATEGY: Record<PlatformTier, RadiationHardeningStrategy> = {
  [PlatformTier.A]: RadiationHardeningStrategy.EDAC,
  [PlatformTier.B]: RadiationHardeningStrategy.TMR,
  [PlatformTier.C]: RadiationHardeningStrategy.TMR,
};

/**
 * Maps platform tier to its MTBF target in hours (Threshold Registry).
 */
export const TIER_MTBF_HOURS: Record<PlatformTier, number> = {
  [PlatformTier.A]: MTBF_TIER_A_HOURS,
  [PlatformTier.B]: MTBF_TIER_B_HOURS,
  [PlatformTier.C]: MTBF_TIER_C_HOURS,
};

// ── Power Source (per Decision 1) ────────────────────────────────────────────

export enum TierCPowerSource {
  /** Multi-Mission RTG Stack — for low-power precursor probes */
  RTG = "RTG",
  /** Compact Fission Reactor (Kilopower-class) — for nodes requiring >5 kWe */
  Fission = "FISSION",
}

/** Tier C power source threshold: fission required above 5 kWe */
export const TIER_C_FISSION_THRESHOLD_KWE = 5;

// ── Communication Protocol (per Decision 3) ──────────────────────────────────

export enum CommunicationProtocol {
  /** DTN Bundle Protocol (RFC 9171) + Consciousness Coherence Layer */
  DTN_CCL = "DTN_CCL",
}

// ── Thermal Architecture (per Decision 4) ────────────────────────────────────

export enum TierCThermalStrategy {
  /** Variable-conductance heat pipes + MLI + variable radiators */
  VCHP_MLI = "VCHP_MLI",
}
