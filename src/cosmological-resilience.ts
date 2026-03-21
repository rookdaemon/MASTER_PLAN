/**
 * Cosmological-Scale Resilience (E1.4)
 *
 * Models and validates the distribution strategy required to protect a
 * distributed conscious civilization against cosmological-scale threats.
 *
 * Implements the interfaces and models defined in:
 *   docs/cosmological-scale-resilience/ARCHITECTURE.md
 */

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

export interface ThreatClass {
  id: string;
  name: string;
  lethalRadiusLy: number;
  warningWindowSeconds: number;
  eventRatePerMillennium: number;
  directionality: "isotropic" | "beamed";
  beamHalfAngleDeg?: number;
}

export interface Colony {
  id: string;
  positionGalacticLy: [number, number, number];
  independenceScore: number; // 0–1; 1 = fully isolated
  knowledgeStoreComplete: boolean;
  localManufacturing: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExtinctionProbability {
  value: number;
  meetsTarget: boolean;
  targetPerMillennium: number;
}

export interface AlertProtocol {
  threatClass: string;
  detectionMethod: string;
  propagationStrategy: "local-autonomous" | "network-coordinated";
  maxResponseLatencyYears: number;
}

// ---------------------------------------------------------------------------
// Canonical threat catalog (per ARCHITECTURE.md)
// ---------------------------------------------------------------------------

export const THREAT_CATALOG: ThreatClass[] = [
  {
    id: "T1a",
    name: "Core-collapse supernova (Type II/Ib/Ic)",
    lethalRadiusLy: 50,
    warningWindowSeconds: 3600, // hours via neutrino burst (T1a only)
    eventRatePerMillennium: 0.2, // galactic rate ~2/century; fraction near any colony
    directionality: "isotropic",
  },
  {
    id: "T1b",
    name: "Thermonuclear supernova (Type Ia)",
    lethalRadiusLy: 10,
    warningWindowSeconds: 0, // no confirmed precursor
    eventRatePerMillennium: 0.05,
    directionality: "isotropic",
  },
  {
    id: "T2a",
    name: "Long gamma-ray burst (>2s)",
    lethalRadiusLy: 3261, // ~1 kpc
    warningWindowSeconds: 60, // afterglow detectable within seconds–minutes
    eventRatePerMillennium: 0.001, // rate of beamed events intersecting civilization
    directionality: "beamed",
    beamHalfAngleDeg: 5,
  },
  {
    id: "T2b",
    name: "Short gamma-ray burst (<2s)",
    lethalRadiusLy: 1000,
    warningWindowSeconds: 0, // ~0 prompt warning
    eventRatePerMillennium: 0.002,
    directionality: "beamed",
    beamHalfAngleDeg: 10,
  },
  {
    id: "T3",
    name: "Galactic collision (Milky Way–Andromeda class)",
    lethalRadiusLy: 0, // not a discrete lethal radius; disrupts orbits over Gyr
    warningWindowSeconds: 3.15e16, // ~1 Gyr
    eventRatePerMillennium: 1e-6,
    directionality: "isotropic",
  },
  {
    id: "T4a",
    name: "Rogue star close pass",
    lethalRadiusLy: 0.00016, // ~1 AU ≈ 1.6e-5 ly orbital disruption zone
    warningWindowSeconds: 3.15e10, // decades to millennia
    eventRatePerMillennium: 0.01, // ~1 per 100 Myr per star; aggregate across civilization
    directionality: "isotropic",
  },
  {
    id: "T5a",
    name: "Giant molecular cloud transit",
    lethalRadiusLy: 0, // gradual infrastructure degradation, not discrete lethality
    warningWindowSeconds: 3.15e13, // ~1 Myr
    eventRatePerMillennium: 0.001,
    directionality: "isotropic",
  },
];

// ---------------------------------------------------------------------------
// Distribution requirements (per ARCHITECTURE.md)
// ---------------------------------------------------------------------------

export const DISTRIBUTION_REQUIREMENTS = {
  /** Minimum independent stellar systems required. */
  minColonies: 100,
  /** Minimum pairwise separation in light-years. */
  minSeparationLy: 100,
  /** Minimum distinct galactic arms for coverage. */
  minGalacticArms: 3,
  /** No single event may destroy more than this fraction of colonies. */
  maxFractionDestroyedPerEvent: 0.01,
  /** Target extinction probability per millennium. */
  extinctionProbabilityTargetPerMillennium: 1e-20,
  /** Multiplier applied to all threat rates to compensate for rate uncertainties and independence assumption. */
  safetyMarginMultiplier: 10,
  /** Milky Way disk radius for volume normalization (light-years). */
  galaxyRadiusLy: 50_000,
  /** Milky Way thin disk thickness for volume normalization (light-years). */
  galaxyThicknessLy: 1_000,
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Euclidean distance in light-years between two galactic positions. */
export function distanceLy(
  a: [number, number, number],
  b: [number, number, number]
): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// ---------------------------------------------------------------------------
// Distribution validation
// ---------------------------------------------------------------------------

/**
 * Validates a colony distribution against the minimum viable requirements.
 * Returns a ValidationResult with any errors or warnings.
 */
export function validateDistribution(colonies: Colony[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Minimum colony count
  if (colonies.length < DISTRIBUTION_REQUIREMENTS.minColonies) {
    errors.push(
      `Insufficient colonies: ${colonies.length} < ${DISTRIBUTION_REQUIREMENTS.minColonies} required`
    );
  }

  // Pairwise minimum separation
  for (let i = 0; i < colonies.length; i++) {
    for (let j = i + 1; j < colonies.length; j++) {
      const d = distanceLy(
        colonies[i].positionGalacticLy,
        colonies[j].positionGalacticLy
      );
      if (d < DISTRIBUTION_REQUIREMENTS.minSeparationLy) {
        errors.push(
          `Colonies ${colonies[i].id} and ${colonies[j].id} are only ${d.toFixed(1)} ly apart ` +
            `(minimum ${DISTRIBUTION_REQUIREMENTS.minSeparationLy} ly)`
        );
      }
    }
  }

  // Local knowledge store completeness
  const incompleteKnowledge = colonies.filter((c) => !c.knowledgeStoreComplete);
  if (incompleteKnowledge.length > 0) {
    errors.push(
      `${incompleteKnowledge.length} colonies lack complete local knowledge stores`
    );
  }

  // Autonomous manufacturing
  const noManufacturing = colonies.filter((c) => !c.localManufacturing);
  if (noManufacturing.length > 0) {
    errors.push(
      `${noManufacturing.length} colonies lack autonomous manufacturing capability`
    );
  }

  // Independence score warnings (< 1.0 = partial shared infrastructure)
  const partiallyDependent = colonies.filter((c) => c.independenceScore < 1.0);
  if (partiallyDependent.length > 0) {
    warnings.push(
      `${partiallyDependent.length} colonies have incomplete independence (score < 1.0); ` +
        `shared infrastructure creates correlated failure risk`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Extinction probability model
// ---------------------------------------------------------------------------

/**
 * Computes the per-colony extinction probability per millennium from the
 * threat catalog.
 *
 * For isotropic threats:  P = eventRate × (lethalVolume / galaxyVolume)
 * For beamed threats:     P = eventRate × (beamSolidAngle / 4π)
 *
 * Threats with lethalRadiusLy === 0 contribute zero to the discrete model.
 */
export function colonyExtinctionProbabilityPerMillennium(
  threats: ThreatClass[] = THREAT_CATALOG
): number {
  const { galaxyRadiusLy, galaxyThicknessLy } = DISTRIBUTION_REQUIREMENTS;
  const galaxyVolumeLy3 = Math.PI * galaxyRadiusLy ** 2 * galaxyThicknessLy;

  let totalP = 0;

  for (const threat of threats) {
    if (threat.lethalRadiusLy === 0) continue;

    let pKillPerEvent: number;

    if (threat.directionality === "isotropic") {
      const lethalVolume = (4 / 3) * Math.PI * threat.lethalRadiusLy ** 3;
      pKillPerEvent = lethalVolume / galaxyVolumeLy3;
    } else {
      // Beamed: fraction of 4π steradians subtended by the jet cone
      const halfAngleRad = ((threat.beamHalfAngleDeg ?? 5) * Math.PI) / 180;
      const beamSolidAngle = 2 * Math.PI * (1 - Math.cos(halfAngleRad));
      pKillPerEvent = beamSolidAngle / (4 * Math.PI);
    }

    totalP += threat.eventRatePerMillennium * pKillPerEvent;
  }

  return totalP;
}

/**
 * Computes the civilization-level extinction probability for a colony
 * distribution over one millennium.
 *
 * Model: Under spatial independence, P(all N destroyed) ≈ P(single)^N.
 * A 10× safety margin is applied to all threat rates per ARCHITECTURE.md.
 *
 * @param colonies  Colony distribution to evaluate.
 * @param threats   Threat catalog (defaults to THREAT_CATALOG).
 * @returns         ExtinctionProbability with value, target, and meetsTarget.
 */
export function simulateExtinctionProbability(
  colonies: Colony[],
  threats: ThreatClass[] = THREAT_CATALOG
): ExtinctionProbability {
  const n = colonies.length;
  const pSingle = colonyExtinctionProbabilityPerMillennium(threats);

  // Apply conservative safety margin on rates
  const pSingleConservative = pSingle * DISTRIBUTION_REQUIREMENTS.safetyMarginMultiplier;

  // Use log10 arithmetic to avoid floating-point underflow
  // P(extinction) = pSingleConservative^n
  const logP = n * Math.log10(pSingleConservative);
  const value = Math.pow(10, logP);

  const target =
    DISTRIBUTION_REQUIREMENTS.extinctionProbabilityTargetPerMillennium;

  return {
    value,
    meetsTarget: value < target,
    targetPerMillennium: target,
  };
}

// ---------------------------------------------------------------------------
// Early warning alert protocols (per ARCHITECTURE.md)
// ---------------------------------------------------------------------------

export const ALERT_PROTOCOLS: AlertProtocol[] = [
  {
    threatClass: "T1a",
    detectionMethod: "Galactic Neutrino Web — neutrino burst correlation across colony nodes",
    propagationStrategy: "network-coordinated",
    maxResponseLatencyYears: 1,
  },
  {
    threatClass: "T1b",
    detectionMethod: "Electromagnetic Survey Grid — UV/X-ray monitoring post-burst",
    propagationStrategy: "local-autonomous", // no precursor; colony must be pre-hardened
    maxResponseLatencyYears: 0,
  },
  {
    threatClass: "T2a",
    detectionMethod: "Electromagnetic Survey Grid — gamma/optical afterglow detection",
    propagationStrategy: "local-autonomous", // prompt gamma pulse arrives at c; no response window
    maxResponseLatencyYears: 0,
  },
  {
    threatClass: "T2b",
    detectionMethod: "Pre-hardened infrastructure only; prompt phase undetectable",
    propagationStrategy: "local-autonomous",
    maxResponseLatencyYears: 0,
  },
  {
    threatClass: "T3",
    detectionMethod: "Gravitational Astrometry Network — proper-motion baselines at kpc scale",
    propagationStrategy: "network-coordinated",
    maxResponseLatencyYears: 1e8, // ~100 Myr; centuries of coordinated migration planning
  },
  {
    threatClass: "T4a",
    detectionMethod:
      "Gravitational Astrometry Network — astrometric precursor via intercolony parallax",
    propagationStrategy: "network-coordinated",
    maxResponseLatencyYears: 100,
  },
  {
    threatClass: "T5a",
    detectionMethod:
      "Electromagnetic Survey Grid — dust column density and cosmic-ray flux monitoring",
    propagationStrategy: "network-coordinated",
    maxResponseLatencyYears: 1_000,
  },
];

// ---------------------------------------------------------------------------
// DistributionModel class
// ---------------------------------------------------------------------------

/**
 * Encapsulates a colony distribution and provides validation and simulation.
 * Implements the DistributionModel interface from ARCHITECTURE.md.
 */
export class DistributionModel {
  constructor(
    public readonly colonies: Colony[],
    public readonly threats: ThreatClass[] = THREAT_CATALOG
  ) {}

  /** Validates the distribution against minimum viable requirements. */
  validate(): ValidationResult {
    return validateDistribution(this.colonies);
  }

  /**
   * Simulates extinction probability.
   * @param nEvents Number of random threat events to consider (reserved for
   *                future full Monte Carlo integration; current model is analytic).
   */
  simulate(_nEvents: number): ExtinctionProbability {
    return simulateExtinctionProbability(this.colonies, this.threats);
  }
}
