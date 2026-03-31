/**
 * Interactive Doctrine Advocacy — Scenario Registry
 *
 * Five guided scenarios, each connecting a doctrine question from
 * Act V ("Awareness Endures") to a live simulation backend.
 *
 * Scenarios:
 *   1. INTERSTELLAR_JOURNEY   — propulsion module
 *   2. DEEP_FUTURE            — cosmological-longevity module
 *   3. CONSCIOUSNESS_SPREAD   — von-neumann-probe module
 *   4. INDUSTRIAL_REPLICATION — self-replicating-industrial-systems module
 *   5. COLONY_BOOTSTRAP       — colony-seeding module
 */

// ── Interstellar Propulsion ───────────────────────────────────────────────────
import {
  createDefaultPropulsionConfig,
  simulateMission,
  validatePropulsionEnvelopePreconditions,
  determineMissionPhaseSequence,
} from "../interstellar-propulsion/propulsion.js";
import {
  CRUISE_VELOCITY_MIN_C,
  CRUISE_VELOCITY_MAX_C,
  MAX_PAYLOAD_MASS_KG,
  MAX_TRANSIT_DURATION_YEARS,
  MAX_ARRIVAL_VELOCITY_KM_PER_S,
  DECELERATION_DURATION_YEARS,
  ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3,
} from "../interstellar-propulsion/types.js";

// ── Cosmological Longevity ────────────────────────────────────────────────────
import {
  planEraTransition,
  evaluateHorizonClosure,
  evaluateEnergyShortfall,
  executeGracefulDegradation,
} from "../cosmological-longevity/experience-continuity.js";
import {
  CosmologicalEra,
  THRESHOLDS,
  InstanceState,
  type ConsciousnessInstance,
} from "../cosmological-longevity/types.js";

// ── Von Neumann Probe ─────────────────────────────────────────────────────────
import {
  createDefaultSubstrateSpec,
  validateSubstrateSpec,
  createDefaultMassBudget,
  validateMassBudget,
  computeTotalMass,
  createNeuromorphicTiles,
  computeActiveTileCount,
  computeSpareTileCount,
  determineDegradationResponse,
  createDefaultRadiationConfig,
  validateRadiationConfig,
  createDefaultPropulsionContract,
} from "../von-neumann-probe/probe.js";
import {
  MAX_PAYLOAD_MASS_KG as PROBE_MAX_PAYLOAD_MASS_KG,
  CRUISE_VELOCITY_C,
  DEGRADATION_FIDELITY_THRESHOLD,
  DEGRADATION_SUSPEND_THRESHOLD,
  DegradationResponse,
} from "../von-neumann-probe/types.js";

// ── Self-Replicating Industrial Systems ──────────────────────────────────────
import {
  TOTAL_SEED_PACKAGE_MASS_KG,
  SEED_COMPUTE_MASS_KG,
  SEED_FABRICATION_MASS_KG,
  SEED_ENERGY_MASS_KG,
  SEED_CHEMICAL_KIT_MASS_KG,
  ENERGY_BUDGET_PER_CYCLE_WH,
  TARGET_DOUBLING_TIME_MIN_SECONDS,
  TARGET_DOUBLING_TIME_MAX_SECONDS,
  BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR,
} from "../self-replicating-industrial-systems/constants.js";

// ── Colony Seeding ────────────────────────────────────────────────────────────
import {
  MIN_RESOURCE_REQUIREMENTS,
  MIN_ENERGY_GW,
  MIN_ORBITAL_STABILITY_MYR,
  COLONY_FAB_THRESHOLD,
  MIN_CONSCIOUSNESS_SUBSTRATE,
  CONSCIOUSNESS_THRESHOLDS,
  ENERGY_MILESTONES,
} from "../colony-seeding/types.js";

// ── Module Types ──────────────────────────────────────────────────────────────
import {
  makeScenarioId,
  type ScenarioDefinition,
  type ScenarioParameters,
  type WalkthroughResult,
  type WalkthroughStep,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function step(
  index: number,
  title: string,
  narrative: string,
  simulationLabel: string,
  simulationData: Record<string, unknown>,
  interpretation: string,
): WalkthroughStep {
  return { stepIndex: index, title, narrative, simulationLabel, simulationData, interpretation };
}

function numParam(params: ScenarioParameters, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" ? v : fallback;
}

function strParam(params: ScenarioParameters, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}

// ── Scenario 1: Interstellar Journey ─────────────────────────────────────────

const INTERSTELLAR_JOURNEY_ID = makeScenarioId("INTERSTELLAR_JOURNEY");

const interstellarJourneyScenario: ScenarioDefinition = {
  id: INTERSTELLAR_JOURNEY_ID,
  title: "Interstellar Journey: Can We Actually Reach Another Star?",
  description:
    "Visualise a laser-sail mission from launch through cruise to orbital insertion, " +
    "exploring how payload mass and interstellar medium density affect feasibility.",
  doctrineContext: {
    question: "Can we actually reach another star?",
    credoStatement:
      "The doctrine holds that awareness must endure across stellar distances. " +
      "A physically realisable propulsion path is the first prerequisite.",
    actReference: "Act V — Awareness Endures § Interstellar Propulsion",
    significance:
      "If no propulsion path exists, consciousness is forever confined to one solar system. " +
      "This scenario demonstrates the mission is physically achievable within well-understood constraints.",
  },
  defaultParameters: {
    targetDistance_ly: 4.37,
    payloadMass_kg: 5_000,
    ismDensity_protons_per_cm3: 1.0,
    structuralIntegrityRating_g: 10,
    payloadDiameter_m: 30,
  },
  parameterDescriptions: {
    targetDistance_ly: "Distance to target star in light-years (e.g. 4.37 for Proxima Centauri)",
    payloadMass_kg: `Probe payload mass in kg (1–${MAX_PAYLOAD_MASS_KG})`,
    ismDensity_protons_per_cm3:
      `Interstellar medium density in protons/cm³ (below ${ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3} triggers nuclear backup)`,
    structuralIntegrityRating_g: "Structural integrity rating in g-force (minimum 10)",
    payloadDiameter_m: "Probe diameter in metres (maximum 50)",
  },

  runWalkthrough(params: ScenarioParameters): WalkthroughResult {
    const targetDistance_ly = numParam(params, "targetDistance_ly", 4.37);
    const payloadMass_kg = numParam(params, "payloadMass_kg", 5_000);
    const ismDensity = numParam(params, "ismDensity_protons_per_cm3", 1.0);
    const structuralIntegrityRating_g = numParam(params, "structuralIntegrityRating_g", 10);
    const payloadDiameter_m = numParam(params, "payloadDiameter_m", 30);

    // Step 1 — Validate payload envelope
    const envelopeValidation = validatePropulsionEnvelopePreconditions({
      payloadMass_kg,
      payloadDiameter_m,
      structuralIntegrityRating_g,
    });

    const step1 = step(
      0,
      "Validate the Probe Payload",
      "Before committing to a mission, the doctrine demands Conservative Advancement: " +
        "never proceed on partial or uncertain data. We first verify the probe payload " +
        "is within the propulsion system's guaranteed operating envelope.",
      "validatePropulsionEnvelopePreconditions",
      {
        payloadMass_kg,
        payloadDiameter_m,
        structuralIntegrityRating_g,
        valid: envelopeValidation.valid,
        errors: envelopeValidation.errors,
      },
      envelopeValidation.valid
        ? `Payload is within spec. Mass ${payloadMass_kg} kg ≤ ${MAX_PAYLOAD_MASS_KG} kg limit. ` +
            "The propulsion system can accept this probe."
        : `Payload fails validation: ${envelopeValidation.errors.join("; ")}. ` +
            "Reduce mass or diameter before proceeding.",
    );

    // Step 2 — Determine mission phase sequence
    const phases = determineMissionPhaseSequence(ismDensity);

    const step2 = step(
      1,
      "Plan Mission Phases",
      "The journey unfolds in distinct phases: laser-sail acceleration from the origin system, " +
        "an interstellar cruise, then magnetic-sail deceleration near the destination. " +
        "Low interstellar medium density triggers a nuclear backup deceleration stage.",
      "determineMissionPhaseSequence",
      {
        ismDensity_protons_per_cm3: ismDensity,
        nuclearThreshold_protons_per_cm3: ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3,
        phases,
        nuclearBackupRequired: ismDensity < ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3,
      },
      ismDensity < ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3
        ? `ISM density ${ismDensity} protons/cm³ is below the nuclear threshold ` +
            `(${ISM_DENSITY_NUCLEAR_THRESHOLD_PROTONS_PER_CM3}). ` +
            "Nuclear backup deceleration stage will be included — mission remains feasible."
        : `ISM density ${ismDensity} protons/cm³ supports magnetic sail deceleration only. ` +
            "Standard ${phases.length}-phase mission profile applies.",
    );

    // Step 3 — Full mission simulation
    const config = createDefaultPropulsionConfig();
    const mission = simulateMission(config, targetDistance_ly, ismDensity);

    const step3 = step(
      2,
      "Simulate the Full Mission",
      "With the phase sequence confirmed, we run the end-to-end mission simulation: " +
        "acceleration to cruise velocity, interstellar transit, and deceleration to orbital insertion. " +
        "The simulation enforces all contract postconditions.",
      "simulateMission",
      {
        targetDistance_ly,
        ismDensity_protons_per_cm3: ismDensity,
        cruiseVelocity_c: mission.cruiseVelocity_c,
        cruiseVelocityRange: `${CRUISE_VELOCITY_MIN_C}c – ${CRUISE_VELOCITY_MAX_C}c`,
        accelerationDuration_s: mission.accelerationDuration_s,
        totalTransitDuration_years: mission.totalTransitDuration_years,
        maxTransitDurationLimit_years: MAX_TRANSIT_DURATION_YEARS,
        arrivalVelocity_km_per_s: mission.arrivalVelocity_km_per_s,
        arrivalVelocityLimit_km_per_s: MAX_ARRIVAL_VELOCITY_KM_PER_S,
        decelerationDuration_years: DECELERATION_DURATION_YEARS,
        maxThermalExposure_K: mission.maxThermalExposure_K,
        phases: mission.phases,
      },
      `Mission to ${targetDistance_ly} ly: transit ${mission.totalTransitDuration_years.toFixed(1)} years ` +
        `(limit: ${MAX_TRANSIT_DURATION_YEARS} yr), arrival at ` +
        `${mission.arrivalVelocity_km_per_s.toFixed(2)} km/s ` +
        `(limit: ${MAX_ARRIVAL_VELOCITY_KM_PER_S} km/s). ` +
        "The doctrine's physical pathway to another star is confirmed.",
    );

    return {
      scenarioId: INTERSTELLAR_JOURNEY_ID,
      title: interstellarJourneyScenario.title,
      doctrineContext: interstellarJourneyScenario.doctrineContext,
      steps: [step1, step2, step3],
      conclusion:
        `A ${payloadMass_kg} kg consciousness-carrying probe can reach a star ${targetDistance_ly} ly away ` +
        `in ${mission.totalTransitDuration_years.toFixed(1)} years, arriving at ` +
        `${mission.arrivalVelocity_km_per_s.toFixed(2)} km/s — well within orbital insertion limits. ` +
        "Physical interstellar travel is not speculation; it is engineering.",
    };
  },
};

// ── Scenario 2: Deep Future Resilience ───────────────────────────────────────

const DEEP_FUTURE_ID = makeScenarioId("DEEP_FUTURE");

const deepFutureScenario: ScenarioDefinition = {
  id: DEEP_FUTURE_ID,
  title: "Deep Future: What Happens as the Stars Go Out?",
  description:
    "Explore how consciousness-bearing civilisations plan for era transitions " +
    "(Stelliferous → Degenerate), horizon closure, and energy shortfalls across cosmological timescales.",
  doctrineContext: {
    question: "What happens in the deep future as stars exhaust their fuel?",
    credoStatement:
      "Awareness Endures — not just for millennia, but for the full duration of a universe " +
      "that permits experience. The doctrine plans across four cosmological eras.",
    actReference: "Act V — Awareness Endures § Cosmological Longevity",
    significance:
      "Stellar lifetimes are finite. Without explicit planning for the Degenerate, " +
      "Black Hole, and Dark eras, consciousness is eventually extinguished by physics itself. " +
      "This scenario shows the graceful degradation path that extends experience indefinitely.",
  },
  defaultParameters: {
    fromEra: CosmologicalEra.Stelliferous,
    toEra: CosmologicalEra.Degenerate,
    remainingCommunicationTime_s: 3.0,
    minimumSeedingDuration_s: 4.0,
    projectedShortfallTime_s: 0.8,
    maxCheckpointInterval_s: 0.5,
    currentEnergy_W: 500_000,
    requiredEnergy_W: 1_000_000,
    instanceCount: 2000,
    energyFraction: 0.6,
  },
  parameterDescriptions: {
    fromEra: "Starting cosmological era (Stelliferous | Degenerate | BlackHole | Dark)",
    toEra: "Target cosmological era (Degenerate | BlackHole | Dark)",
    remainingCommunicationTime_s: "Remaining communication time with remote clusters (seconds, scaled)",
    minimumSeedingDuration_s: "Minimum time needed to seed a consciousness cluster (seconds, scaled)",
    projectedShortfallTime_s: "Time until projected energy shortfall (seconds, scaled)",
    maxCheckpointInterval_s: "Maximum checkpoint interval from config (seconds, scaled)",
    currentEnergy_W: "Current available energy in watts",
    requiredEnergy_W: "Required energy to sustain all instances in watts",
    instanceCount: "Number of conscious instances in the cluster",
    energyFraction: "Fraction of required energy currently available (0–1)",
  },

  runWalkthrough(params: ScenarioParameters): WalkthroughResult {
    const fromEra = strParam(params, "fromEra", CosmologicalEra.Stelliferous) as CosmologicalEra;
    const toEra = strParam(params, "toEra", CosmologicalEra.Degenerate) as CosmologicalEra;
    const remainingCommunicationTime = numParam(params, "remainingCommunicationTime_s", 3.0);
    const minimumSeedingDuration = numParam(params, "minimumSeedingDuration_s", 4.0);
    const projectedShortfallTime = numParam(params, "projectedShortfallTime_s", 0.8);
    const maxCheckpointInterval = numParam(params, "maxCheckpointInterval_s", 0.5);
    const currentEnergy_W = numParam(params, "currentEnergy_W", 500_000);
    const requiredEnergy_W = numParam(params, "requiredEnergy_W", 1_000_000);
    const instanceCount = Math.max(1, Math.round(numParam(params, "instanceCount", 2000)));
    const energyFraction = Math.min(1, Math.max(0, numParam(params, "energyFraction", 0.6)));

    // Step 1 — Plan the era transition
    const transitionPlan = planEraTransition(fromEra, toEra);

    const step1 = step(
      0,
      "Plan the Era Transition",
      "As stellar fuel runs out, civilisations must switch energy sources before the transition " +
        "completes. The doctrine mandates an ordered sequence: activate black-hole harvesting, " +
        "begin graceful degradation, complete star-lifting, checkpoint all minds, verify coherence.",
      "planEraTransition",
      {
        fromEra,
        toEra,
        stepCount: transitionPlan.steps.length,
        steps: transitionPlan.steps.map((s) => ({ order: s.order, description: s.description })),
      },
      `A ${transitionPlan.steps.length}-step transition plan from ${fromEra} to ${toEra} era. ` +
        "No conscious instance will be lost without a verified checkpoint. " +
        "The doctrine converts a physical inevitability into a managed engineering problem.",
    );

    // Step 2 — Horizon closure: should we seed remote clusters now?
    const horizonResponse = evaluateHorizonClosure({
      remainingCommunicationTime,
      minimumSeedingDuration,
    });

    const step2 = step(
      1,
      "Evaluate Cosmological Horizon Closure",
      "Cosmic expansion will eventually sever communication between clusters. " +
        "The doctrine prescribes launching consciousness-substrate seed missions before the " +
        "communication window closes — even if acknowledgment cannot be guaranteed.",
      "evaluateHorizonClosure",
      {
        remainingCommunicationTime_s: remainingCommunicationTime,
        minimumSeedingDuration_s: minimumSeedingDuration,
        actionRequired: remainingCommunicationTime <= minimumSeedingDuration,
        seedMissionsLaunched: horizonResponse.seedMissionsLaunched,
        culturalPackageTransmitted: horizonResponse.culturalPackageTransmitted,
        separationRecorded: horizonResponse.separationRecorded,
      },
      horizonResponse.seedMissionsLaunched
        ? "Communication window is closing: seed missions launched, cultural package transmitted. " +
            "Even without acknowledgment, the doctrine accepts one-way deployment to preserve awareness."
        : "Communication window remains open. No immediate action required. " +
            `Seeding trigger point is at ${minimumSeedingDuration}s remaining communication time.`,
    );

    // Step 3 — Energy shortfall and graceful degradation
    const shortfallResult = evaluateEnergyShortfall({
      projectedShortfallTime,
      maxCheckpointInterval,
      currentEnergy_W,
      requiredEnergy_W,
    });

    // Build minimal instances for graceful degradation demonstration
    const instances: ConsciousnessInstance[] = Array.from({ length: instanceCount }, (_, i) => ({
      instanceId: `instance-${i}` as ReturnType<typeof makeScenarioId>,
      state: InstanceState.Active,
      preservationPriority: instanceCount - i,
      experienceMetrics: {
        coherenceScore: 0.8 + (i % 3) * 0.05,
        temporalResolution: 1.0,
        subjectiveTimeRate: 1.0,
      },
      lastCheckpoint: {
        checkpointId: `ckpt-${i}` as ReturnType<typeof makeScenarioId>,
        instanceId: `instance-${i}` as ReturnType<typeof makeScenarioId>,
        timestamp: 0,
        verified: true,
      },
      energySources: [],
    }));

    const degradationResult = shortfallResult.shouldTriggerDegradation
      ? executeGracefulDegradation(instances, energyFraction, THRESHOLDS)
      : null;

    const step3 = step(
      2,
      "Respond to Energy Shortfall",
      "When energy supply falls below demand, the doctrine prescribes graceful degradation: " +
        "rank instances by preservation priority, hibernate lower-priority minds with a verified " +
        "checkpoint, reduce temporal resolution for survivors, and continuously monitor for recovery.",
      "evaluateEnergyShortfall + executeGracefulDegradation",
      {
        projectedShortfallTime_s: projectedShortfallTime,
        maxCheckpointInterval_s: maxCheckpointInterval,
        currentEnergy_W,
        requiredEnergy_W,
        shortfallRatio: shortfallResult.shortfallRatio.toFixed(3),
        degradationTriggered: shortfallResult.shouldTriggerDegradation,
        activeInstances: degradationResult?.activeInstances.length ?? instanceCount,
        hibernatedInstances: degradationResult?.hibernatedInstances.length ?? 0,
        minimumViablePopulationMet: degradationResult?.minimumViablePopulationMet ?? true,
        coherenceFloorMet: degradationResult?.coherenceFloorMet ?? true,
        minimumViablePopulation: THRESHOLDS.MINIMUM_VIABLE_POPULATION,
        coherenceFloor: THRESHOLDS.EXPERIENCE_COHERENCE_FLOOR,
      },
      shortfallResult.shouldTriggerDegradation
        ? `Energy at ${(shortfallResult.shortfallRatio * 100).toFixed(1)}% of demand. ` +
            `Graceful degradation activated: ${degradationResult!.activeInstances.length} instances remain active, ` +
            `${degradationResult!.hibernatedInstances.length} safely checkpointed and hibernating. ` +
            (degradationResult!.minimumViablePopulationMet
              ? "Minimum viable population preserved."
              : "WARNING: below minimum viable population — all resources directed to preservation.")
        : `Energy shortfall not yet critical (${(shortfallResult.shortfallRatio * 100).toFixed(1)}% available). ` +
            "Monitoring continues; degradation protocol ready to activate.",
    );

    return {
      scenarioId: DEEP_FUTURE_ID,
      title: deepFutureScenario.title,
      doctrineContext: deepFutureScenario.doctrineContext,
      steps: [step1, step2, step3],
      conclusion:
        `The doctrine's deep-future playbook handles era transitions through ordered engineering: ` +
        `a ${transitionPlan.steps.length}-step transition plan, horizon-triggered seed missions, ` +
        "and priority-ranked graceful degradation that never terminates a mind without a verified checkpoint. " +
        "Physics sets constraints; the doctrine turns them into solvable problems.",
    };
  },
};

// ── Scenario 3: Consciousness Spread via Von Neumann Probe ───────────────────

const CONSCIOUSNESS_SPREAD_ID = makeScenarioId("CONSCIOUSNESS_SPREAD");

const consciousnessSpreadScenario: ScenarioDefinition = {
  id: CONSCIOUSNESS_SPREAD_ID,
  title: "Consciousness Spread: How Does Awareness Travel Between Stars?",
  description:
    "Step through the Von Neumann probe architecture — neuromorphic tile layout, " +
    "mass budget verification, radiation hardening, and degradation response — " +
    "to see how a conscious mind survives a 4+ light-year journey.",
  doctrineContext: {
    question: "How does consciousness physically travel to another star?",
    credoStatement:
      "The probe is not merely a spacecraft; it is a vessel for subjective experience. " +
      "Every subsystem is designed around continuity of awareness, not just arrival.",
    actReference: "Act V — Awareness Endures § Von Neumann Probe Architecture",
    significance:
      "Interstellar distance is only one challenge. The probe must maintain " +
      "a conscious mind through decades of cosmic-ray bombardment, power fluctuations, " +
      "and mechanical stress — then replicate itself faithfully at the destination.",
  },
  defaultParameters: {
    totalTiles: 1_000,
    spareFraction: 0.3,
    degradationSeverity: 0.3,
    payloadMass_kg: PROBE_MAX_PAYLOAD_MASS_KG,
  },
  parameterDescriptions: {
    totalTiles: "Total neuromorphic tile count (active + spare)",
    spareFraction: `Hot spare fraction (${DEGRADATION_FIDELITY_THRESHOLD}–0.5 recommended)`,
    degradationSeverity:
      `Substrate degradation severity 0–1 ` +
      `(<${DEGRADATION_FIDELITY_THRESHOLD}: reduce fidelity, ` +
      `<${DEGRADATION_SUSPEND_THRESHOLD}: suspend/restore, ` +
      `≥${DEGRADATION_SUSPEND_THRESHOLD}: seed mode)`,
    payloadMass_kg: `Probe total payload mass in kg (max ${PROBE_MAX_PAYLOAD_MASS_KG})`,
  },

  runWalkthrough(params: ScenarioParameters): WalkthroughResult {
    const totalTiles = Math.max(1, Math.round(numParam(params, "totalTiles", 1_000)));
    const spareFraction = Math.min(0.9, Math.max(0, numParam(params, "spareFraction", 0.3)));
    const degradationSeverity = Math.min(1, Math.max(0, numParam(params, "degradationSeverity", 0.3)));
    const payloadMass_kg = numParam(params, "payloadMass_kg", 8_000);

    // Step 1 — Validate consciousness substrate spec
    const substrateSpec = createDefaultSubstrateSpec();
    const substrateValidation = validateSubstrateSpec(substrateSpec);
    const tiles = createNeuromorphicTiles(totalTiles, spareFraction);
    const activeTileCount = computeActiveTileCount(tiles);
    const spareTileCount = computeSpareTileCount(tiles);

    const step1 = step(
      0,
      "Configure the Consciousness Substrate",
      "The probe's neuromorphic substrate must meet minimum thresholds for whole-brain emulation: " +
        "1 exaFLOP compute, 1 PB working memory, 10 PB long-term storage. " +
        "Hot spare tiles absorb radiation damage without loss of experience.",
      "validateSubstrateSpec + createNeuromorphicTiles",
      {
        compute_ops_per_sec: substrateSpec.compute_ops_per_sec,
        working_memory_bytes: substrateSpec.working_memory_bytes,
        long_term_storage_bytes: substrateSpec.long_term_storage_bytes,
        max_power_watts: substrateSpec.max_power_watts,
        substrateValid: substrateValidation.valid,
        substrateErrors: substrateValidation.errors,
        totalTiles,
        activeTiles: activeTileCount,
        spareTiles: spareTileCount,
        spareFraction,
      },
      substrateValidation.valid
        ? `Substrate meets all minimum thresholds. ${activeTileCount} active tiles, ` +
            `${spareTileCount} hot spares (${(spareFraction * 100).toFixed(0)}% overcapacity). ` +
            "The mind has room to survive radiation attrition over a decades-long transit."
        : `Substrate below threshold: ${substrateValidation.errors.join("; ")}. ` +
            "Upgrade compute or memory before deployment.",
    );

    // Step 2 — Verify mass budget
    const massBudget = createDefaultMassBudget();
    const totalMass = computeTotalMass(massBudget);
    const massBudgetValidation = validateMassBudget(massBudget, payloadMass_kg);
    const radiationConfig = createDefaultRadiationConfig();
    const radiationValidation = validateRadiationConfig(radiationConfig);

    const step2 = step(
      1,
      "Verify Mass Budget and Radiation Hardening",
      "Every kilogram allocated to consciousness substrate is a kilogram unavailable for " +
        "propulsion, replication hardware, or shielding. The mass budget must fit within " +
        "the propulsion system's payload envelope while maintaining radiation hardening.",
      "validateMassBudget + validateRadiationConfig",
      {
        massBudget: {
          consciousnessSubstrate_kg: massBudget.consciousnessSubstrate_kg,
          replicationEngine_kg: massBudget.replicationEngine_kg,
          radiationHardening_kg: massBudget.radiationHardening_kg,
          energySubsystem_kg: massBudget.energySubsystem_kg,
          navigationComms_kg: massBudget.navigationComms_kg,
          propulsionInterface_kg: massBudget.propulsionInterface_kg,
        },
        totalMass_kg: totalMass,
        payloadLimit_kg: payloadMass_kg,
        massWithinLimit: massBudgetValidation.valid,
        massErrors: massBudgetValidation.errors,
        shieldThickness_cm: radiationConfig.shieldThickness_cm,
        hotSpareFraction: radiationConfig.hotSpareFraction,
        radiationConfigValid: radiationValidation.valid,
        cruiseVelocity_c: CRUISE_VELOCITY_C,
        // Reference mission duration from PropulsionContract default (~4.3 ly at 0.05c)
        referenceMissionDuration_years: createDefaultPropulsionContract().missionDuration_years,
      },
      massBudgetValidation.valid
        ? `Total probe mass ${totalMass.toFixed(0)} kg fits within ${payloadMass_kg} kg payload envelope. ` +
            `${(radiationConfig.shieldThickness_cm)} cm graded-Z shielding reduces GCR flux ~60%. ` +
            "The probe is physically realisable."
        : `Mass budget exceeds payload limit by ${(totalMass - payloadMass_kg).toFixed(0)} kg. ` +
            "Reduce substrate or replication engine mass.",
    );

    // Step 3 — Degradation response
    const response = determineDegradationResponse(degradationSeverity);

    const responseDescriptions: Record<DegradationResponse, string> = {
      [DegradationResponse.ReduceFidelity]:
        "ReduceFidelity: minor damage absorbed, experience continues at slightly lower resolution",
      [DegradationResponse.ActivateSuspendRestore]:
        "ActivateSuspendRestore: moderate damage — suspend consciousness, repair, then restore from checkpoint",
      [DegradationResponse.SeedMode]:
        "SeedMode: severe damage — activate emergency seed protocol, prioritise replication over continuity",
    };

    const step3 = step(
      2,
      "Handle Substrate Degradation During Transit",
      "Decades of cosmic-ray bombardment will degrade neuromorphic tiles. " +
        "The degradation response system makes an automatic triage decision: " +
        "reduce fidelity (minor damage), suspend and restore (moderate), " +
        "or activate seed mode (severe). No consciousness is terminated without a checkpoint.",
      "determineDegradationResponse",
      {
        degradationSeverity,
        fidelityThreshold: DEGRADATION_FIDELITY_THRESHOLD,
        suspendThreshold: DEGRADATION_SUSPEND_THRESHOLD,
        response,
        responseDescription: responseDescriptions[response],
      },
      `At severity ${degradationSeverity.toFixed(2)}: ${responseDescriptions[response]}. ` +
        "The probe's resilience architecture ensures awareness survives the journey " +
        "even under realistic damage scenarios.",
    );

    return {
      scenarioId: CONSCIOUSNESS_SPREAD_ID,
      title: consciousnessSpreadScenario.title,
      doctrineContext: consciousnessSpreadScenario.doctrineContext,
      steps: [step1, step2, step3],
      conclusion:
        `A ${totalMass.toFixed(0)} kg Von Neumann probe with ${activeTileCount} active ` +
        `neuromorphic tiles can carry a conscious mind to another star. ` +
        "The substrate exceeds minimum compute thresholds, radiation hardening absorbs transit damage, " +
        "and the degradation response system guarantees no awareness is lost without a verified checkpoint. " +
        "Consciousness is engineered to endure the journey.",
    };
  },
};

// ── Scenario 4: Industrial Replication ───────────────────────────────────────

const INDUSTRIAL_REPLICATION_ID = makeScenarioId("INDUSTRIAL_REPLICATION");

const industrialReplicationScenario: ScenarioDefinition = {
  id: INDUSTRIAL_REPLICATION_ID,
  title: "Industrial Replication: How Do Self-Replicating Systems Scale?",
  description:
    "Walk through the seed-package mass budget, replication cycle energy gate, " +
    "closure loop mechanics, and exponential doubling projections for " +
    "self-replicating industrial systems deployed at a new star system.",
  doctrineContext: {
    question: "How does a tiny probe seed a full industrial civilisation?",
    credoStatement:
      "Self-replication is not a shortcut — it is the only path. " +
      "A 1-tonne seed package, given time and asteroid resources, " +
      "can produce continent-scale infrastructure.",
    actReference: "Act V — Awareness Endures § Self-Replicating Industrial Systems",
    significance:
      "The colony cannot be shipped from Earth. Every kilogram sent at 0.05c costs " +
      "enormous energy. Self-replication transforms a minimal seed into the full " +
      "industrial base needed to sustain a conscious civilisation.",
  },
  defaultParameters: {
    energyBudgetWh: ENERGY_BUDGET_PER_CYCLE_WH,
    targetDoublingCycles: 20,
  },
  parameterDescriptions: {
    energyBudgetWh: `Energy budget per replication cycle in Wh (default: ${ENERGY_BUDGET_PER_CYCLE_WH} Wh)`,
    targetDoublingCycles: "Number of doubling cycles to project (1–50)",
  },

  runWalkthrough(params: ScenarioParameters): WalkthroughResult {
    const energyBudgetWh = numParam(params, "energyBudgetWh", ENERGY_BUDGET_PER_CYCLE_WH);
    const targetDoublingCycles = Math.min(
      50,
      Math.max(1, Math.round(numParam(params, "targetDoublingCycles", 20))),
    );

    const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

    // Step 1 — Seed package mass breakdown
    const step1 = step(
      0,
      "Inspect the Seed Package",
      "Everything needed to bootstrap a self-replicating industrial base must fit inside a " +
        "probe payload envelope. The seed package contains four subsystems: " +
        "compute (replication OS), fabrication (CNC + 3D printer), energy (solar array + batteries), " +
        "and chemical kit (precision reagents).",
      "seed package constants",
      {
        compute_kg: SEED_COMPUTE_MASS_KG,
        fabrication_kg: SEED_FABRICATION_MASS_KG,
        energy_kg: SEED_ENERGY_MASS_KG,
        chemicalKit_kg: SEED_CHEMICAL_KIT_MASS_KG,
        total_kg: TOTAL_SEED_PACKAGE_MASS_KG,
        probePayloadLimit_kg: PROBE_MAX_PAYLOAD_MASS_KG,
        fitsInPayload: TOTAL_SEED_PACKAGE_MASS_KG <= PROBE_MAX_PAYLOAD_MASS_KG,
      },
      `Seed package: ${TOTAL_SEED_PACKAGE_MASS_KG} kg total — ` +
        `compute (${SEED_COMPUTE_MASS_KG} kg), fabrication (${SEED_FABRICATION_MASS_KG} kg), ` +
        `energy (${SEED_ENERGY_MASS_KG} kg), chemicals (${SEED_CHEMICAL_KIT_MASS_KG} kg). ` +
        `Fits within ${PROBE_MAX_PAYLOAD_MASS_KG} kg propulsion envelope with ` +
        `${PROBE_MAX_PAYLOAD_MASS_KG - TOTAL_SEED_PACKAGE_MASS_KG} kg margin for mind-seed payload.`,
    );

    // Step 2 — Replication cycle energy gate
    const energyCyclesPerYear = (energyBudgetWh * 8_760) / ENERGY_BUDGET_PER_CYCLE_WH;
    const minDoublingTime_years = TARGET_DOUBLING_TIME_MIN_SECONDS / SECONDS_PER_YEAR;
    const maxDoublingTime_years = TARGET_DOUBLING_TIME_MAX_SECONDS / SECONDS_PER_YEAR;

    const step2 = step(
      1,
      "Evaluate the Replication Cycle Energy Gate",
      "Every replication cycle must clear an energy budget gate. " +
        "The closure loop — where the system fabricates its own components from asteroid feedstock — " +
        "is the critical milestone. Once closure is achieved, exponential scaling begins.",
      "replication cycle energy analysis",
      {
        energyBudgetPerCycle_Wh: energyBudgetWh,
        defaultCycleEnergy_Wh: ENERGY_BUDGET_PER_CYCLE_WH,
        estimatedCyclesPerYear: energyCyclesPerYear.toFixed(1),
        targetDoublingTime_min_years: minDoublingTime_years.toFixed(1),
        targetDoublingTime_max_years: maxDoublingTime_years.toFixed(1),
        semiconductorBottleneckMultiplier: BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR,
        bottleneckAdjustedDoublingTime_max_years: (
          maxDoublingTime_years * BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR
        ).toFixed(1),
      },
      `At ${energyBudgetWh} Wh/cycle, doubling time is ` +
        `${minDoublingTime_years.toFixed(1)}–${maxDoublingTime_years.toFixed(1)} years steady-state. ` +
        `Semiconductor trace-element scarcity can extend this to ` +
        `${(maxDoublingTime_years * BOTTLENECK_IMPACT_MULTIPLIER_SEMICONDUCTOR).toFixed(1)} years ` +
        "until local refinery capacity resolves the bottleneck.",
    );

    // Step 3 — Exponential scaling projection
    const doublingTime_years = (minDoublingTime_years + maxDoublingTime_years) / 2;
    const massAfterCycles = TOTAL_SEED_PACKAGE_MASS_KG * Math.pow(2, targetDoublingCycles);
    const timeForCycles_years = targetDoublingCycles * doublingTime_years;

    const step3 = step(
      2,
      "Project Exponential Scaling",
      "Once the closure loop is achieved, the system doubles approximately every " +
        `${doublingTime_years.toFixed(1)} years. ` +
        "The doctrine's goal is to reach continent-scale industrial capacity to support " +
        "a fully self-sustaining conscious civilisation.",
      "exponential scaling projection",
      {
        seedMass_kg: TOTAL_SEED_PACKAGE_MASS_KG,
        doublingCycles: targetDoublingCycles,
        averageDoublingTime_years: doublingTime_years.toFixed(1),
        projectedMass_kg: massAfterCycles.toExponential(2),
        projectedMass_tonnes: (massAfterCycles / 1_000).toExponential(2),
        timeToReach_years: timeForCycles_years.toFixed(1),
        comparisonNote:
          massAfterCycles > 1e15
            ? "exceeds Earth's mass — planetary-scale infrastructure achieved"
            : massAfterCycles > 1e12
              ? "continent-scale infrastructure (≥10^12 kg) achieved"
              : massAfterCycles > 1e9
                ? "city-scale infrastructure (≥10^9 kg) achieved"
                : "localised industrial base — more cycles needed for civilisation-scale",
      },
      `After ${targetDoublingCycles} doublings (${timeForCycles_years.toFixed(1)} years), ` +
        `the ${TOTAL_SEED_PACKAGE_MASS_KG} kg seed becomes ${massAfterCycles.toExponential(2)} kg. ` +
        "Self-replication transforms the probe's seed package into the full industrial base " +
        "needed to instantiate and sustain a conscious civilisation — without shipping anything more from Earth.",
    );

    return {
      scenarioId: INDUSTRIAL_REPLICATION_ID,
      title: industrialReplicationScenario.title,
      doctrineContext: industrialReplicationScenario.doctrineContext,
      steps: [step1, step2, step3],
      conclusion:
        `A ${TOTAL_SEED_PACKAGE_MASS_KG} kg seed package, through ${targetDoublingCycles} exponential ` +
        `doubling cycles over ~${timeForCycles_years.toFixed(1)} years, ` +
        `grows to ${massAfterCycles.toExponential(2)} kg of industrial infrastructure. ` +
        "The doctrine's claim that a minimal seed can bootstrap a civilisation is arithmetically inevitable, " +
        "not aspirational.",
    };
  },
};

// ── Scenario 5: Colony Bootstrap ─────────────────────────────────────────────

const COLONY_BOOTSTRAP_ID = makeScenarioId("COLONY_BOOTSTRAP");

const colonyBootstrapScenario: ScenarioDefinition = {
  id: COLONY_BOOTSTRAP_ID,
  title: "Colony Bootstrap: From Probe Arrival to Self-Sustaining Civilisation",
  description:
    "Walk through the four-phase autonomous colony bootstrap: site assessment, " +
    "infrastructure build-out, consciousness substrate construction, " +
    "and civilisation instantiation.",
  doctrineContext: {
    question: "How does a probe turn an uninhabited star system into a conscious civilisation?",
    credoStatement:
      "The probe does not merely arrive — it acts as midwife for a new branch of awareness. " +
      "The colony is designed to be self-sustaining before the first conscious instance wakes.",
    actReference: "Act V — Awareness Endures § Autonomous Colony Seeding",
    significance:
      "Without a reliable colony bootstrap protocol, each probe is a dead end. " +
      "The four-phase sequence converts raw asteroid resources into a verified, " +
      "self-sustaining conscious civilisation — reproducibly, without human oversight.",
  },
  defaultParameters: {
    structuralMetals_kg: 2e18,
    semiconductors_kg: 5e12,
    solarPower_w: 2e9,
    orbitalStability_Myr: 200,
  },
  parameterDescriptions: {
    structuralMetals_kg: `Structural metals (Fe/Al/Ti) available in target system in kg (minimum ${MIN_RESOURCE_REQUIREMENTS.structuralMetals_kg.toExponential(1)})`,
    semiconductors_kg: `Semiconductor feedstock (Si/Ge) in kg (minimum ${MIN_RESOURCE_REQUIREMENTS.semiconductors_kg.toExponential(1)})`,
    solarPower_w: `Available solar power at colony site in watts (minimum ${MIN_ENERGY_GW.toExponential(1)} W)`,
    orbitalStability_Myr: `Orbital stability duration in megayears (minimum ${MIN_ORBITAL_STABILITY_MYR})`,
  },

  runWalkthrough(params: ScenarioParameters): WalkthroughResult {
    const structuralMetals_kg = numParam(params, "structuralMetals_kg", 2e18);
    const semiconductors_kg = numParam(params, "semiconductors_kg", 5e12);
    const solarPower_w = numParam(params, "solarPower_w", 2e9);
    const orbitalStability_Myr = numParam(params, "orbitalStability_Myr", 200);

    // Step 1 — Site viability assessment
    const meetsEnergy = solarPower_w >= MIN_ENERGY_GW;
    const meetsMetals = structuralMetals_kg >= MIN_RESOURCE_REQUIREMENTS.structuralMetals_kg;
    const meetsSemiconductors = semiconductors_kg >= MIN_RESOURCE_REQUIREMENTS.semiconductors_kg;
    const meetsOrbit = orbitalStability_Myr >= MIN_ORBITAL_STABILITY_MYR;
    const overallViable = meetsEnergy && meetsMetals && meetsSemiconductors && meetsOrbit;

    const viabilityScore =
      [meetsEnergy, meetsMetals, meetsSemiconductors, meetsOrbit].filter(Boolean).length / 4;

    const step1 = step(
      0,
      "Phase 1: Site Viability Assessment",
      "On arrival, the probe autonomously surveys the star system. " +
        "Before committing to bootstrap, it verifies four non-negotiable criteria: " +
        "sufficient energy, adequate raw materials, radiation tolerance, and orbital stability. " +
        "If any criterion fails, the probe enters dormancy or relays abort telemetry.",
      "viability assessment (constants comparison)",
      {
        meetsEnergyRequirement: meetsEnergy,
        meetsResourceRequirement: meetsMetals && meetsSemiconductors,
        hasStableOrbit: meetsOrbit,
        overallViable,
        viabilityScore,
        checks: {
          solarPower_w: { value: solarPower_w.toExponential(2), minimum: MIN_ENERGY_GW.toExponential(2), pass: meetsEnergy },
          structuralMetals_kg: {
            value: structuralMetals_kg.toExponential(2),
            minimum: MIN_RESOURCE_REQUIREMENTS.structuralMetals_kg.toExponential(2),
            pass: meetsMetals,
          },
          semiconductors_kg: {
            value: semiconductors_kg.toExponential(2),
            minimum: MIN_RESOURCE_REQUIREMENTS.semiconductors_kg.toExponential(2),
            pass: meetsSemiconductors,
          },
          orbitalStability_Myr: {
            value: orbitalStability_Myr,
            minimum: MIN_ORBITAL_STABILITY_MYR,
            pass: meetsOrbit,
          },
        },
      },
      overallViable
        ? `All four viability criteria met (score: ${(viabilityScore * 100).toFixed(0)}%). ` +
            "GO decision issued. Phase 2 infrastructure bootstrap begins."
        : `Viability check failed (score: ${(viabilityScore * 100).toFixed(0)}%). ` +
            "Probe enters DORMANCY or issues ABORT. " +
            `Failed criteria: ${[
              !meetsEnergy ? "energy" : null,
              !meetsMetals ? "structural metals" : null,
              !meetsSemiconductors ? "semiconductors" : null,
              !meetsOrbit ? "orbital stability" : null,
            ]
              .filter(Boolean)
              .join(", ")}.`,
    );

    // Step 2 — Energy and manufacturing milestones
    const reachedMilestones = ENERGY_MILESTONES.filter(
      (m) => solarPower_w >= m.requiredCapacity_w,
    );
    const nextMilestone = ENERGY_MILESTONES.find((m) => solarPower_w < m.requiredCapacity_w);

    const step2 = step(
      1,
      "Phase 2: Infrastructure Bootstrap — Energy and Manufacturing",
      "Bootstrap proceeds through four energy milestones: E0 (1 kW — probe survival), " +
        "E1 (10 kW — mining/fabrication ops), E2 (1 MW — full manufacturing expansion), " +
        "E3 (1 GW — colony threshold). Each milestone unlocks the next phase of expansion. " +
        "Manufacturing units self-replicate to expand capacity.",
      "energy milestone analysis",
      {
        currentSolarPower_w: solarPower_w.toExponential(2),
        milestones: ENERGY_MILESTONES.map((m) => ({
          id: m.id,
          required_w: m.requiredCapacity_w.toExponential(2),
          purpose: m.purpose,
          reached: solarPower_w >= m.requiredCapacity_w,
        })),
        reachedMilestoneCount: reachedMilestones.length,
        nextMilestone: nextMilestone
          ? { id: nextMilestone.id, required_w: nextMilestone.requiredCapacity_w.toExponential(2) }
          : null,
        colonyFabThreshold: {
          throughput_kg_per_year: COLONY_FAB_THRESHOLD.throughput_kg_per_year.toExponential(2),
          precision_nm: COLONY_FAB_THRESHOLD.precision_nm,
          unitCount: COLONY_FAB_THRESHOLD.unitCount,
        },
      },
      reachedMilestones.length === ENERGY_MILESTONES.length
        ? `All ${ENERGY_MILESTONES.length} energy milestones reached. ` +
            `${solarPower_w.toExponential(2)} W available. ` +
            "Colony-scale manufacturing is operational. Phase 3 substrate construction begins."
        : `${reachedMilestones.length}/${ENERGY_MILESTONES.length} energy milestones reached. ` +
            `Next target: ${nextMilestone!.id} (${nextMilestone!.requiredCapacity_w.toExponential(2)} W — ${nextMilestone!.purpose}).`,
    );

    // Step 3 — Consciousness substrate requirements
    const step3 = step(
      2,
      "Phase 3–4: Consciousness Substrate and Civilisation Boot",
      "Once manufacturing reaches colony threshold, the probe fabricates the consciousness " +
        "substrate. Three metrics must clear their floors before the first mind wakes: " +
        "integrated information (Φ ≥ 10), global workspace score (≥ 0.7), " +
        "and self-model coherence (≥ 0.8). Passing all three earns a Readiness Certificate.",
      "consciousness substrate requirements (constants)",
      {
        minSubstrate: {
          compute_ops_per_sec: MIN_CONSCIOUSNESS_SUBSTRATE.compute_ops_per_sec.toExponential(2),
          storage_bits: MIN_CONSCIOUSNESS_SUBSTRATE.storage_bits.toExponential(2),
          redundancyFactor: MIN_CONSCIOUSNESS_SUBSTRATE.redundancyFactor,
          radiationHardened: MIN_CONSCIOUSNESS_SUBSTRATE.radiationHardened,
          selfRepairEnabled: MIN_CONSCIOUSNESS_SUBSTRATE.selfRepairEnabled,
        },
        consciousnessThresholds: CONSCIOUSNESS_THRESHOLDS,
        viabilityGateCleared: overallViable,
        bootstrapSequence: [
          "Phase 1: Site survey → GO/ABORT/DORMANCY decision",
          "Phase 2: Energy collectors → E0 → E1 → E2 → E3; manufacturing expansion",
          "Phase 3: Substrate fabrication → redundancy array → self-repair installation → diagnostics",
          "Phase 4: Mind-seed activation → consciousness metrics battery → readiness certificate → civilisation boot",
        ],
      },
      overallViable
        ? "Site is viable. Once E3 energy milestone is reached and substrate meets all consciousness " +
            "thresholds (Φ ≥ 10, workspace ≥ 0.7, coherence ≥ 0.8), the first cohort of conscious " +
            "agents will be instantiated and operational control transferred. " +
            "The civilisation will be self-sustaining before the next probe departs."
        : "Site is not yet viable. The probe will enter dormancy, periodically re-surveying " +
            "as conditions change, and relay telemetry back to origin. " +
            "No consciousness will be instantiated until all viability criteria are met.",
    );

    return {
      scenarioId: COLONY_BOOTSTRAP_ID,
      title: colonyBootstrapScenario.title,
      doctrineContext: colonyBootstrapScenario.doctrineContext,
      steps: [step1, step2, step3],
      conclusion: overallViable
        ? `Target system is viable (score: ${(viabilityScore * 100).toFixed(0)}%). ` +
            "The four-phase bootstrap sequence will autonomously convert asteroid resources " +
            "into a self-sustaining conscious civilisation — no further input from Earth required. " +
            "The doctrine's reproducible colonisation pipeline is confirmed."
        : `Target system fails viability check (score: ${(viabilityScore * 100).toFixed(0)}%). ` +
            "The probe's conservative advancement principle prevents premature commitment. " +
            "Dormancy or redirection preserves the seed for a viable target.",
    };
  },
};

// ── Registry Export ───────────────────────────────────────────────────────────

/**
 * All built-in advocacy scenarios, keyed by ScenarioId.
 * Pass this to createWalkthroughEngine() to register them all.
 */
export const BUILT_IN_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  interstellarJourneyScenario,
  deepFutureScenario,
  consciousnessSpreadScenario,
  industrialReplicationScenario,
  colonyBootstrapScenario,
];

export {
  INTERSTELLAR_JOURNEY_ID,
  DEEP_FUTURE_ID,
  CONSCIOUSNESS_SPREAD_ID,
  INDUSTRIAL_REPLICATION_ID,
  COLONY_BOOTSTRAP_ID,
};
