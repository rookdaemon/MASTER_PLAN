import { describe, it, expect } from "vitest";
import {
  createDefaultCCMSpec,
  validateCCMSpec,
  createDefaultProbeMass,
  computeTotalProbeMass,
  validateProbeMass,
  createDefaultSeedPayload,
  computeSeedPayloadMass,
  validateSeedPayload,
  computeBootstrapYears,
  defaultBootstrapYears,
  validateLaserBoost,
  validateFusionDrive,
  computeTransitTime,
  classifyDecision,
  evaluateConsensus,
  assessDegradation,
  createDiagnosticReport,
  canRepair,
  consumeFeedstock,
  estimateSurvivingProbes,
  validateSwarmConfig,
} from "./swarm.js";
import {
  type CCMSpec,
  type Vote,
  type RepairFeedstock,
  REFERENCE_CCM_SPEC,
  REFERENCE_PROBE_MASS,
  REFERENCE_LASER_BOOST,
  REFERENCE_FUSION_DRIVE,
  REFERENCE_SWARM_CONFIG,
  MAX_PROBE_MASS_KG,
  DEFAULT_BAC_CONFIG,
  DegradationLevel,
  VoteValue,
  ConsensusStatus,
  DecisionScope,
} from "./types.js";

// ── CCM Spec ────────────────────────────────────────────────────────────────

describe("createDefaultCCMSpec", () => {
  it("returns reference spec meeting all architecture requirements", () => {
    const spec = createDefaultCCMSpec();
    expect(spec.compute_ops_per_sec).toBeGreaterThanOrEqual(1e18);
    expect(spec.mass_kg).toBeLessThanOrEqual(50);
    expect(spec.cruise_power_watts).toBeLessThanOrEqual(500);
    expect(spec.active_power_watts).toBeLessThanOrEqual(50_000);
    expect(spec.storage_bits).toBeGreaterThanOrEqual(1e18);
  });
});

describe("validateCCMSpec", () => {
  it("passes for valid spec", () => {
    const result = validateCCMSpec(createDefaultCCMSpec());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("fails for insufficient compute", () => {
    const spec: CCMSpec = { ...REFERENCE_CCM_SPEC, compute_ops_per_sec: 1e15 };
    const result = validateCCMSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("fails for excessive mass", () => {
    const spec: CCMSpec = { ...REFERENCE_CCM_SPEC, mass_kg: 100 };
    expect(validateCCMSpec(spec).valid).toBe(false);
  });

  it("fails for excessive cruise power", () => {
    const spec: CCMSpec = { ...REFERENCE_CCM_SPEC, cruise_power_watts: 1000 };
    expect(validateCCMSpec(spec).valid).toBe(false);
  });

  it("fails for excessive active power", () => {
    const spec: CCMSpec = { ...REFERENCE_CCM_SPEC, active_power_watts: 100_000 };
    expect(validateCCMSpec(spec).valid).toBe(false);
  });

  it("fails for insufficient storage", () => {
    const spec: CCMSpec = { ...REFERENCE_CCM_SPEC, storage_bits: 1e15 };
    expect(validateCCMSpec(spec).valid).toBe(false);
  });
});

// ── Probe Mass Budget ───────────────────────────────────────────────────────

describe("computeTotalProbeMass", () => {
  it("sums all subsystem masses for reference budget", () => {
    const total = computeTotalProbeMass(REFERENCE_PROBE_MASS);
    expect(total).toBe(500);
  });
});

describe("validateProbeMass", () => {
  it("passes for reference budget at exactly 500 kg", () => {
    expect(validateProbeMass(REFERENCE_PROBE_MASS)).toEqual({ valid: true, errors: [] });
  });

  it("fails when exceeding 500 kg", () => {
    const overweight = { ...REFERENCE_PROBE_MASS, structure_kg: 200 };
    const result = validateProbeMass(overweight);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("exceeds maximum");
  });
});

// ── Seed Payload ────────────────────────────────────────────────────────────

describe("computeSeedPayloadMass", () => {
  it("sums assembler + mining + solar kits", () => {
    const payload = createDefaultSeedPayload();
    expect(computeSeedPayloadMass(payload)).toBe(35); // 5 + 20 + 10
  });
});

describe("validateSeedPayload", () => {
  it("passes for complete payload", () => {
    expect(validateSeedPayload(createDefaultSeedPayload())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("fails when blueprints missing", () => {
    const payload = { ...createDefaultSeedPayload(), hasBlueprints: false };
    expect(validateSeedPayload(payload).valid).toBe(false);
  });

  it("fails when assembler missing", () => {
    const payload = { ...createDefaultSeedPayload(), nanoAssembler_kg: 0 };
    expect(validateSeedPayload(payload).valid).toBe(false);
  });
});

// ── Bootstrap Timeline ──────────────────────────────────────────────────────

describe("computeBootstrapYears", () => {
  it("sums all three phases", () => {
    expect(computeBootstrapYears(10, 20, 20)).toBe(50);
  });
});

describe("defaultBootstrapYears", () => {
  it("returns ~50 years per architecture spec", () => {
    expect(defaultBootstrapYears()).toBe(50);
  });
});

// ── Propulsion ──────────────────────────────────────────────────────────────

describe("validateLaserBoost", () => {
  it("passes for reference laser boost spec", () => {
    expect(validateLaserBoost(REFERENCE_LASER_BOOST)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("fails when target velocity too low", () => {
    const slow = { ...REFERENCE_LASER_BOOST, targetVelocity_c: 0.005 };
    expect(validateLaserBoost(slow).valid).toBe(false);
  });
});

describe("validateFusionDrive", () => {
  it("passes for reference fusion drive", () => {
    expect(validateFusionDrive(REFERENCE_FUSION_DRIVE)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("fails with zero fuel", () => {
    const noFuel = { ...REFERENCE_FUSION_DRIVE, fuelMass_kg: 0 };
    expect(validateFusionDrive(noFuel).valid).toBe(false);
  });
});

describe("computeTransitTime", () => {
  it("computes ~140 years for Alpha Centauri at 0.03c", () => {
    const years = computeTransitTime(4.37, 0.03);
    expect(years).toBeCloseTo(145.67, 0);
  });

  it("returns Infinity for zero velocity", () => {
    expect(computeTransitTime(4.37, 0)).toBe(Infinity);
  });

  it("sub-500-year transit for nearest stars at >= 0.01c", () => {
    expect(computeTransitTime(4.37, 0.01)).toBeLessThan(500);
  });
});

// ── BAC Consensus ───────────────────────────────────────────────────────────

describe("classifyDecision", () => {
  it("classifies navigation correction as local", () => {
    expect(classifyDecision("NAVIGATION_CORRECTION")).toBe(DecisionScope.Local);
  });

  it("classifies self-repair as local", () => {
    expect(classifyDecision("SELF_REPAIR")).toBe(DecisionScope.Local);
  });

  it("classifies target change as swarm-level", () => {
    expect(classifyDecision("TARGET_CHANGE")).toBe(DecisionScope.Swarm);
  });

  it("classifies ethical response as swarm-level", () => {
    expect(classifyDecision("ETHICAL_RESPONSE")).toBe(DecisionScope.Swarm);
  });
});

describe("evaluateConsensus", () => {
  const makeVote = (id: number, value: VoteValue): Vote => ({
    voter: `probe-${id}`,
    proposalId: "p1",
    value,
    timestamp_ms: Date.now(),
  });

  it("approves with supermajority of voters", () => {
    const votes: Vote[] = [
      ...Array.from({ length: 70 }, (_, i) => makeVote(i, VoteValue.Approve)),
      ...Array.from({ length: 30 }, (_, i) => makeVote(70 + i, VoteValue.Reject)),
    ];
    const result = evaluateConsensus("p1", votes, 100);
    expect(result.status).toBe(ConsensusStatus.Approved);
    expect(result.approveCount).toBe(70);
    expect(result.rejectCount).toBe(30);
  });

  it("rejects when approval below supermajority", () => {
    const votes: Vote[] = [
      ...Array.from({ length: 60 }, (_, i) => makeVote(i, VoteValue.Approve)),
      ...Array.from({ length: 40 }, (_, i) => makeVote(60 + i, VoteValue.Reject)),
    ];
    const result = evaluateConsensus("p1", votes, 100);
    expect(result.status).toBe(ConsensusStatus.Rejected);
  });

  it("falls back to local when quorum not reached", () => {
    const votes: Vote[] = Array.from({ length: 10 }, (_, i) =>
      makeVote(i, VoteValue.Approve)
    );
    const result = evaluateConsensus("p1", votes, 100);
    expect(result.status).toBe(ConsensusStatus.LocalFallback);
  });

  it("excludes abstentions from supermajority calculation", () => {
    const votes: Vote[] = [
      ...Array.from({ length: 35 }, (_, i) => makeVote(i, VoteValue.Approve)),
      ...Array.from({ length: 15 }, (_, i) => makeVote(35 + i, VoteValue.Reject)),
      ...Array.from({ length: 50 }, (_, i) => makeVote(50 + i, VoteValue.Abstain)),
    ];
    // 35/(35+15) = 0.70 >= 0.67 supermajority
    const result = evaluateConsensus("p1", votes, 100);
    expect(result.status).toBe(ConsensusStatus.Approved);
    expect(result.abstainCount).toBe(50);
  });

  it("falls back when all votes are abstentions", () => {
    const votes: Vote[] = Array.from({ length: 80 }, (_, i) =>
      makeVote(i, VoteValue.Abstain)
    );
    const result = evaluateConsensus("p1", votes, 100);
    expect(result.status).toBe(ConsensusStatus.LocalFallback);
  });
});

// ── Degradation ─────────────────────────────────────────────────────────────

describe("assessDegradation", () => {
  it("Green at 100% capability", () => {
    expect(assessDegradation(1.0)).toBe(DegradationLevel.Green);
  });

  it("Green at 75% capability", () => {
    expect(assessDegradation(0.75)).toBe(DegradationLevel.Green);
  });

  it("Yellow at 74% capability", () => {
    expect(assessDegradation(0.74)).toBe(DegradationLevel.Yellow);
  });

  it("Red at 49% capability", () => {
    expect(assessDegradation(0.49)).toBe(DegradationLevel.Red);
  });

  it("Black below 25% capability", () => {
    expect(assessDegradation(0.24)).toBe(DegradationLevel.Black);
  });
});

describe("createDiagnosticReport", () => {
  it("weights CCM most heavily in capability calculation", () => {
    // CCM failed, everything else perfect
    const report = createDiagnosticReport({
      ccm: 0.0,
      propulsion: 1.0,
      sensors: 1.0,
      structure: 1.0,
    });
    // 0*0.4 + 1*0.25 + 1*0.2 + 1*0.15 = 0.60
    expect(report.capabilityFraction).toBeCloseTo(0.60);
    expect(report.level).toBe(DegradationLevel.Yellow);
  });

  it("returns Green for all-nominal health", () => {
    const report = createDiagnosticReport({
      ccm: 1.0,
      propulsion: 1.0,
      sensors: 1.0,
      structure: 1.0,
    });
    expect(report.capabilityFraction).toBeCloseTo(1.0);
    expect(report.level).toBe(DegradationLevel.Green);
  });
});

// ── Repair Feedstock ────────────────────────────────────────────────────────

describe("canRepair", () => {
  it("allows repair within feedstock budget", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: true };
    expect(canRepair(0.5, feedstock)).toBe(true);
  });

  it("rejects repair exceeding feedstock", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 0.3, coldSpareAssemblerAvailable: true };
    expect(canRepair(0.5, feedstock)).toBe(false);
  });
});

describe("consumeFeedstock", () => {
  it("reduces remaining feedstock by mass used", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: true };
    const result = consumeFeedstock(3, feedstock);
    expect(result.remaining_kg).toBe(7);
    expect(result.coldSpareAssemblerAvailable).toBe(true);
  });

  it("throws when insufficient feedstock", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 1, coldSpareAssemblerAvailable: true };
    expect(() => consumeFeedstock(5, feedstock)).toThrow("Insufficient feedstock");
  });
});

// ── Swarm Configuration ─────────────────────────────────────────────────────

describe("estimateSurvivingProbes", () => {
  it("estimates 50% survival for reference config", () => {
    expect(estimateSurvivingProbes(REFERENCE_SWARM_CONFIG)).toBe(500);
  });
});

describe("validateSwarmConfig", () => {
  it("passes for reference config", () => {
    expect(validateSwarmConfig(REFERENCE_SWARM_CONFIG)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("fails when swarm too small", () => {
    const small = { ...REFERENCE_SWARM_CONFIG, probeCount: 100 };
    expect(validateSwarmConfig(small).valid).toBe(false);
  });

  it("fails when swarm too large", () => {
    const large = { ...REFERENCE_SWARM_CONFIG, probeCount: 50_000 };
    expect(validateSwarmConfig(large).valid).toBe(false);
  });

  it("fails when cruise velocity too slow", () => {
    const slow = { ...REFERENCE_SWARM_CONFIG, cruiseVelocity_c: 0.005 };
    expect(validateSwarmConfig(slow).valid).toBe(false);
  });
});
