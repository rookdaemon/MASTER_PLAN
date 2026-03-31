/**
 * Space Mission Feasibility Simulator — Unified Type Definitions
 *
 * Provides a single, cohesive input/output surface that bridges the four
 * standalone modules:
 *   - energy/
 *   - colony-seeding/
 *   - interstellar-propulsion/
 *   - radiation-hardened-computation/
 *
 * The simulator accepts a MissionProfile and returns a FeasibilityReport.
 */

// ── Mission Input ─────────────────────────────────────────────────────────────

/**
 * ISM (interstellar medium) density along the transit trajectory.
 * Governs whether magnetic-sail deceleration is sufficient or nuclear backup
 * is required (threshold: 0.01 protons/cm³).
 */
export interface IsmConditions {
  /** Protons per cm³ along the planned trajectory */
  density_protons_per_cm3: number;
}

/**
 * Physical properties of the probe payload that must fit within the
 * propulsion system's envelope constraints.
 */
export interface ProbeSpec {
  /** Total payload mass in kg (≤ 10,000 kg) */
  mass_kg: number;
  /** Payload diameter in m (≤ 50 m) */
  diameter_m: number;
  /** Structural integrity rating in g (≥ 10 g) */
  structuralIntegrityRating_g: number;
}

/**
 * Parameters that configure the laser-sail propulsion system.
 */
export interface PropulsionParameters {
  /** Sail diameter in metres (100–500 m) */
  sailDiameter_m: number;
  /** Laser array total power in watts (10 GW – 100 GW) */
  laserArrayPower_W: number;
  /** Target cruise velocity as a fraction of c (0.05–0.10) */
  targetCruiseVelocity_c: number;
  /** Magnetic sail loop diameter in km (50–200 km) */
  magsailLoopDiameter_km: number;
}

/**
 * Characteristics of the target star system used by the colony-seeding
 * viability assessment.
 */
export interface DestinationSystem {
  /** Distance from origin in light-years */
  distance_ly: number;
  /** Available solar power at the planned colony orbit in watts */
  solarPower_w: number;
  /** Whether sustained ≥ 1 GW solar equivalent is achievable at that orbit */
  meetsMinimumEnergyThreshold: boolean;
  /** Structural metal (Fe, Al, Ti) mass in kg available at destination */
  structuralMetals_kg: number;
  /** Semiconductor feedstock (Si, Ge) mass in kg available at destination */
  semiconductors_kg: number;
  /** Particle flux at colony site in particles/cm²/s */
  particleFlux_per_cm2_s: number;
  /** Whether flux is within radiation-hardened substrate tolerance */
  withinHardenedTolerance: boolean;
  /** Projected orbital stability in Myr */
  orbitalStability_Myr: number;
  /**
   * Elements available for in-situ propulsion replication.
   * Required set for full replication: Si, Al, Y, Ba, Cu, O, H.
   */
  availableElements: string[];
}

/**
 * Energy infrastructure configuration for the origin system (determines
 * whether the origin has enough generation capacity to power the laser array).
 */
export interface OriginEnergyConfig {
  /** Total power available to the laser array in watts */
  availableLaserPower_W: number;
  /** Whether fail-safe reserves are maintained during launch */
  failSafeReservesActive: boolean;
}

/**
 * Radiation environment profile for the destination system.
 * Used by the radiation-hardened computation assessment.
 */
export interface RadiationEnvironment {
  /** Estimated annual dose in rad/year */
  annualDose_rad_per_year: number;
  /** Peak solar-event flux in particles/cm²/s */
  peakFlux_particles_per_cm2_s: number;
}

/**
 * Complete mission profile — the top-level input to the simulator.
 */
export interface MissionProfile {
  /** Human-readable mission name, e.g. "Alpha Centauri Seeding Run 1" */
  name: string;
  probe: ProbeSpec;
  propulsion: PropulsionParameters;
  destination: DestinationSystem;
  originEnergy: OriginEnergyConfig;
  ismConditions: IsmConditions;
  radiation: RadiationEnvironment;
}

// ── Feasibility Results ───────────────────────────────────────────────────────

/** Overall feasibility verdict */
export enum FeasibilityVerdict {
  /** All subsystems nominal — mission is feasible */
  FEASIBLE = "FEASIBLE",
  /** One or more subsystems have warnings but no hard blockers */
  MARGINAL = "MARGINAL",
  /** One or more hard blockers prevent mission success */
  INFEASIBLE = "INFEASIBLE",
}

/**
 * Propulsion feasibility assessment, derived from the interstellar-propulsion
 * module's precondition validation and mission simulation.
 */
export interface PropulsionFeasibility {
  /** Whether the probe payload is within envelope constraints */
  envelopeValid: boolean;
  /** Validation errors for the envelope check (empty when valid) */
  envelopeErrors: string[];
  /** Simulated cruise velocity achieved as a fraction of c */
  achievedCruiseVelocity_c: number;
  /** Simulated total transit duration in years */
  transitDuration_years: number;
  /** Simulated max deceleration g-force */
  maxDecelerationG: number;
  /** Whether transit duration is within the 200-year maximum */
  transitWithinLimit: boolean;
  /** Whether nuclear backup deceleration is required (ISM too thin for magsail alone) */
  nuclearBackupRequired: boolean;
  /** Whether propulsion replication at destination is feasible with available elements */
  replicationFeasible: boolean;
}

/**
 * Colony seeding feasibility assessment, derived from the colony-seeding
 * module's viability decision engine.
 */
export interface ColonyFeasibility {
  /** Whether the destination meets the energy threshold (≥ 1 GW) */
  meetsEnergyRequirement: boolean;
  /** Whether resource inventory is sufficient for bootstrapping */
  meetsResourceRequirement: boolean;
  /** Whether the radiation environment is tolerable */
  withinRadiationTolerance: boolean;
  /** Whether a stable orbit exists for ≥ 100 Myr */
  hasStableOrbit: boolean;
  /** GO / ABORT / DORMANCY decision */
  decision: "GO" | "ABORT" | "DORMANCY";
  /** Viability score as a fraction (0–1; all four criteria = 1.0) */
  viabilityScore: number;
}

/**
 * Energy feasibility assessment, derived from the energy module's budget
 * and fail-safe controller logic.
 */
export interface EnergyFeasibility {
  /** Whether laser array power draw is within available origin energy budget */
  laserArrayAffordable: boolean;
  /** Whether fail-safe reserves are maintained during the launch window */
  failSafeReservesMaintained: boolean;
  /** Net power surplus (positive) or deficit (negative) at origin in watts */
  originPowerBalance_W: number;
}

/**
 * Radiation-hardened computation feasibility, derived from the
 * radiation-hardened-computation module's shielding and degradation models.
 */
export interface RadiationFeasibility {
  /** Estimated cumulative TID after the full transit in rad */
  estimatedTransitTID_rad: number;
  /** Whether the TID is within SiC substrate tolerance (10 Mrad) */
  withinSubstrateTolerance: boolean;
  /** Estimated performance fraction at arrival (1.0 = no degradation) */
  estimatedPerformanceFraction: number;
  /** Whether TMR voting is sufficient to maintain continuity under peak flux */
  tmrSufficient: boolean;
}

/**
 * The complete feasibility report returned by the simulator.
 */
export interface FeasibilityReport {
  /** Human-readable mission name from the input profile */
  missionName: string;
  /** Overall verdict */
  verdict: FeasibilityVerdict;
  /** List of human-readable blocking issues (empty when FEASIBLE) */
  blockers: string[];
  /** List of non-blocking warnings */
  warnings: string[];
  /** Per-module breakdowns */
  propulsion: PropulsionFeasibility;
  colony: ColonyFeasibility;
  energy: EnergyFeasibility;
  radiation: RadiationFeasibility;
}
