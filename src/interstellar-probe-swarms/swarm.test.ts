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
  initializeCCM,
  createSnapshot,
  enterCCMDormancy,
  reactivateCCM,
  countMatchingCopies,
  createPropulsionStatus,
  computeFuelConsumed,
  executeBurn,
  deployMagsail,
  advancePhase,
  activateColdSpare,
} from "./swarm.js";
import {
  type CCMSpec,
  type Vote,
  type RepairFeedstock,
  type ConsciousnessSnapshot,
  type BurnPlan,
  REFERENCE_CCM_SPEC,
  REFERENCE_PROBE_MASS,
  REFERENCE_LASER_BOOST,
  REFERENCE_FUSION_DRIVE,
  REFERENCE_SWARM_CONFIG,
  MAX_PROBE_MASS_KG,
  DEFAULT_BAC_CONFIG,
  DEFAULT_DREAM_THREAD_CONFIG,
  DegradationLevel,
  DormancyState,
  ReactivationTrigger,
  PropulsionPhase,
  VoteValue,
  ConsensusStatus,
  DecisionScope,
} from "./types.js";

// ── Helper: valid SHA-512 hash for tests ─────────────────────────────────────
const VALID_SHA512 = "a".repeat(128);

function makeSnapshot(
  data: Uint8Array = new Uint8Array([1, 2, 3]),
  hash: string = VALID_SHA512,
  timestamp_ms: number = 1000
): ConsciousnessSnapshot {
  return createSnapshot(data, hash, timestamp_ms);
}

function makeCorruptedSnapshot(): ConsciousnessSnapshot {
  const snap = makeSnapshot();
  // Corrupt copy 1 and copy 2 so all three differ
  snap.copies[1] = new Uint8Array([4, 5, 6]);
  snap.copies[2] = new Uint8Array([7, 8, 9]);
  return snap;
}

// ── Consciousness Core Module (CCM) ─────────────────────────────────────────

describe("countMatchingCopies", () => {
  it("returns 3 when all copies are identical", () => {
    const d = new Uint8Array([1, 2, 3]);
    expect(countMatchingCopies([d, new Uint8Array(d), new Uint8Array(d)])).toBe(3);
  });

  it("returns 2 when two copies match and one differs", () => {
    const d = new Uint8Array([1, 2, 3]);
    const bad = new Uint8Array([9, 9, 9]);
    expect(countMatchingCopies([d, new Uint8Array(d), bad])).toBe(2);
    expect(countMatchingCopies([d, bad, new Uint8Array(d)])).toBe(2);
    expect(countMatchingCopies([bad, d, new Uint8Array(d)])).toBe(2);
  });

  it("returns 0 when all copies differ", () => {
    expect(
      countMatchingCopies([
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3]),
      ])
    ).toBe(0);
  });
});

describe("initializeCCM", () => {
  it("returns verified=true with matchingCopies=3 for valid identical snapshot", () => {
    const result = initializeCCM(makeSnapshot());
    expect(result.verified).toBe(true);
    expect(result.matchingCopies).toBe(3);
    expect(result.failureReason).toBeUndefined();
  });

  it("returns verified=true with matchingCopies=2 when one copy corrupted", () => {
    const snap = makeSnapshot();
    snap.copies[2] = new Uint8Array([99, 99, 99]);
    const result = initializeCCM(snap);
    expect(result.verified).toBe(true);
    expect(result.matchingCopies).toBe(2);
  });

  it("returns verified=false when all copies differ", () => {
    const result = initializeCCM(makeCorruptedSnapshot());
    expect(result.verified).toBe(false);
    expect(result.matchingCopies).toBe(0);
    expect(result.failureReason).toBeDefined();
  });

  it("throws if copies array has wrong length", () => {
    const snap = makeSnapshot();
    (snap as any).copies = [new Uint8Array([1])];
    expect(() => initializeCCM(snap)).toThrow("exactly 3 copies");
  });

  it("throws if any copy is empty", () => {
    const snap = makeSnapshot();
    snap.copies[1] = new Uint8Array(0);
    expect(() => initializeCCM(snap)).toThrow("copy 1 is empty");
  });

  it("throws for invalid SHA-512 hash", () => {
    const snap: ConsciousnessSnapshot = {
      copies: [new Uint8Array([1]), new Uint8Array([1]), new Uint8Array([1])],
      hash: "not-a-hash",
      timestamp_ms: 0,
    };
    expect(() => initializeCCM(snap)).toThrow("invalid SHA-512");
  });
});

describe("createSnapshot", () => {
  it("returns 3 identical copies and preserves hash", () => {
    const data = new Uint8Array([10, 20, 30]);
    const snap = createSnapshot(data, VALID_SHA512, 42);
    expect(snap.copies).toHaveLength(3);
    expect(snap.copies[0]).toEqual(snap.copies[1]);
    expect(snap.copies[1]).toEqual(snap.copies[2]);
    expect(snap.hash).toBe(VALID_SHA512);
    expect(snap.timestamp_ms).toBe(42);
  });

  it("copies are independent (not references)", () => {
    const data = new Uint8Array([1, 2, 3]);
    const snap = createSnapshot(data, VALID_SHA512, 0);
    snap.copies[0][0] = 255;
    expect(snap.copies[1][0]).toBe(1); // unaffected
  });

  it("throws for empty data", () => {
    expect(() => createSnapshot(new Uint8Array(0), VALID_SHA512, 0)).toThrow("empty");
  });
});

// ── Behavioral Spec: Dormancy/Reactivation Cycle ────────────────────────────

describe("enterCCMDormancy", () => {
  it("transitions Active → Dormant with valid config", () => {
    const result = enterCCMDormancy(DormancyState.Active, DEFAULT_DREAM_THREAD_CONFIG);
    expect(result).toBe(DormancyState.Dormant);
  });

  it("throws when not in Active state", () => {
    expect(() =>
      enterCCMDormancy(DormancyState.Dormant, DEFAULT_DREAM_THREAD_CONFIG)
    ).toThrow("must be Active");
    expect(() =>
      enterCCMDormancy(DormancyState.SafeMode, DEFAULT_DREAM_THREAD_CONFIG)
    ).toThrow("must be Active");
  });

  it("throws when sensor sample rate <= 0", () => {
    expect(() =>
      enterCCMDormancy(DormancyState.Active, {
        ...DEFAULT_DREAM_THREAD_CONFIG,
        sensorSampleRate_hz: 0,
      })
    ).toThrow("sensor sample rate must be > 0");
  });
});

describe("reactivateCCM", () => {
  it("transitions Dormant → Active when ≥2 copies match", () => {
    const snap = makeSnapshot();
    const result = reactivateCCM(
      DormancyState.Dormant,
      ReactivationTrigger.TargetProximity,
      snap
    );
    expect(result.state).toBe(DormancyState.Active);
    expect(result.verification.verified).toBe(true);
    expect(result.verification.matchingCopies).toBe(3);
  });

  it("transitions Dormant → SafeMode when <2 copies match", () => {
    const snap = makeCorruptedSnapshot();
    const result = reactivateCCM(
      DormancyState.Dormant,
      ReactivationTrigger.AnomalyDetected,
      snap
    );
    expect(result.state).toBe(DormancyState.SafeMode);
    expect(result.verification.verified).toBe(false);
  });

  it("handles all valid reactivation triggers", () => {
    for (const trigger of Object.values(ReactivationTrigger)) {
      const snap = makeSnapshot();
      const result = reactivateCCM(DormancyState.Dormant, trigger, snap);
      expect(result.state).toBe(DormancyState.Active);
    }
  });

  it("throws when not in Dormant state", () => {
    expect(() =>
      reactivateCCM(DormancyState.Active, ReactivationTrigger.TargetProximity, makeSnapshot())
    ).toThrow("must be Dormant");
  });
});

describe("Behavioral Spec: full dormancy/reactivation cycle", () => {
  it("Active → Dormant → Active round-trip preserves identity", () => {
    // Given: probe in Active state with valid snapshot
    const snap = makeSnapshot();
    const initResult = initializeCCM(snap);
    expect(initResult.verified).toBe(true);

    // When: enter dormancy with dream thread at 1 Hz
    const dormantState = enterCCMDormancy(DormancyState.Active, DEFAULT_DREAM_THREAD_CONFIG);
    expect(dormantState).toBe(DormancyState.Dormant);

    // When: reactivate on target proximity
    const reactivation = reactivateCCM(
      dormantState,
      ReactivationTrigger.TargetProximity,
      snap
    );

    // Then: resumes Active with identity verified
    expect(reactivation.state).toBe(DormancyState.Active);
    expect(reactivation.verification.verified).toBe(true);
    expect(reactivation.verification.matchingCopies).toBe(3);
  });

  it("enters SafeMode when 2 of 3 copies corrupted during dormancy", () => {
    // Given: dormant probe
    const dormantState = enterCCMDormancy(DormancyState.Active, DEFAULT_DREAM_THREAD_CONFIG);

    // When: watchdog detects corruption in 2 of 3 copies, triggering anomaly reactivation
    const corruptedSnap = makeSnapshot();
    corruptedSnap.copies[1] = new Uint8Array([0xff, 0xff]);
    corruptedSnap.copies[2] = new Uint8Array([0xee, 0xee]);
    const result = reactivateCCM(
      dormantState,
      ReactivationTrigger.AnomalyDetected,
      corruptedSnap
    );

    // Then: enters SafeMode
    expect(result.state).toBe(DormancyState.SafeMode);
    expect(result.verification.verified).toBe(false);
    expect(result.verification.failureReason).toBeDefined();
  });
});

// ── CCM State Invariants ────────────────────────────────────────────────────

describe("CCM state invariants", () => {
  it("state is always one of Active, Dormant, Reactivating, SafeMode", () => {
    const validStates = new Set(Object.values(DormancyState));
    // enterCCMDormancy always returns a valid state
    expect(validStates.has(enterCCMDormancy(DormancyState.Active, DEFAULT_DREAM_THREAD_CONFIG))).toBe(true);
    // reactivateCCM always returns a valid state
    const result = reactivateCCM(DormancyState.Dormant, ReactivationTrigger.TargetProximity, makeSnapshot());
    expect(validStates.has(result.state)).toBe(true);
  });
});

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

  // Contract precondition guards
  it("throws when totalSwarmSize <= 0", () => {
    expect(() => evaluateConsensus("p1", [], 0)).toThrow("totalSwarmSize must be > 0");
    expect(() => evaluateConsensus("p1", [], -1)).toThrow("totalSwarmSize must be > 0");
  });

  it("throws when supermajorityThreshold outside (0.5, 1.0]", () => {
    expect(() =>
      evaluateConsensus("p1", [], 10, { ...DEFAULT_BAC_CONFIG, supermajorityThreshold: 0.5 })
    ).toThrow("supermajorityThreshold must be in (0.5, 1.0]");
    expect(() =>
      evaluateConsensus("p1", [], 10, { ...DEFAULT_BAC_CONFIG, supermajorityThreshold: 1.1 })
    ).toThrow("supermajorityThreshold must be in (0.5, 1.0]");
  });

  it("throws when vote proposalId does not match", () => {
    const badVote: Vote = { voter: "p1", proposalId: "other", value: VoteValue.Approve, timestamp_ms: 0 };
    expect(() => evaluateConsensus("p1", [badVote], 10)).toThrow("does not match");
  });

  // Contract invariant: approveCount + rejectCount + abstainCount = totalResponders
  it("vote tallies sum to totalResponders", () => {
    const votes: Vote[] = [
      ...Array.from({ length: 40 }, (_, i) => makeVote(i, VoteValue.Approve)),
      ...Array.from({ length: 20 }, (_, i) => makeVote(40 + i, VoteValue.Reject)),
      ...Array.from({ length: 15 }, (_, i) => makeVote(60 + i, VoteValue.Abstain)),
    ];
    const result = evaluateConsensus("p1", votes, 100);
    expect(result.approveCount + result.rejectCount + result.abstainCount).toBe(result.totalResponders);
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

  it("returns true for zero-mass check", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 5, coldSpareAssemblerAvailable: true };
    expect(canRepair(0, feedstock)).toBe(true);
  });

  it("throws for negative mass", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 5, coldSpareAssemblerAvailable: true };
    expect(() => canRepair(-1, feedstock)).toThrow("must be >= 0");
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

  it("throws for zero or negative mass", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: true };
    expect(() => consumeFeedstock(0, feedstock)).toThrow("must be > 0");
    expect(() => consumeFeedstock(-1, feedstock)).toThrow("must be > 0");
  });

  // Contract invariant: remaining_kg >= 0 always
  it("remaining_kg never goes negative after valid consumption", () => {
    let feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: true };
    feedstock = consumeFeedstock(3, feedstock);
    expect(feedstock.remaining_kg).toBeGreaterThanOrEqual(0);
    feedstock = consumeFeedstock(7, feedstock);
    expect(feedstock.remaining_kg).toBeGreaterThanOrEqual(0);
    expect(feedstock.remaining_kg).toBe(0);
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

// ── Propulsion System ────────────────────────────────────────────────────────

describe("createPropulsionStatus", () => {
  it("creates default status with LaserBoost phase", () => {
    const status = createPropulsionStatus();
    expect(status.phase).toBe(PropulsionPhase.LaserBoost);
    expect(status.velocity_c).toBe(0);
    expect(status.fuelRemaining_kg).toBe(200);
    expect(status.magsailDeployed).toBe(false);
  });

  it("accepts custom parameters", () => {
    const status = createPropulsionStatus(PropulsionPhase.Cruise, 0.03, 150, false);
    expect(status.phase).toBe(PropulsionPhase.Cruise);
    expect(status.velocity_c).toBe(0.03);
    expect(status.fuelRemaining_kg).toBe(150);
  });
});

describe("computeFuelConsumed", () => {
  it("returns positive fuel consumption for positive delta-v", () => {
    const fuel = computeFuelConsumed(1000, 200);
    expect(fuel).toBeGreaterThan(0);
    expect(fuel).toBeLessThan(200);
  });

  it("consumes more fuel for larger delta-v", () => {
    const small = computeFuelConsumed(1000, 200);
    const large = computeFuelConsumed(10000, 200);
    expect(large).toBeGreaterThan(small);
  });
});

describe("executeBurn", () => {
  const validPlan: BurnPlan = {
    deltaV_m_per_s: 1000,
    direction: [1, 0, 0],
    duration_s: 3600,
  };

  it("returns updated status with increased velocity and decreased fuel", () => {
    const status = createPropulsionStatus(PropulsionPhase.Deceleration, 0.03, 200);
    const result = executeBurn(status, validPlan);

    expect(result.fuelUsed_kg).toBeGreaterThan(0);
    expect(result.status.velocity_c).toBeGreaterThan(0.03);
    expect(result.status.fuelRemaining_kg).toBeLessThan(200);
    // Postcondition: fuel remaining decremented by fuelUsed
    expect(result.status.fuelRemaining_kg).toBeCloseTo(200 - result.fuelUsed_kg);
  });

  // Contract invariant: fuelRemaining >= 0 always
  it("fuel remaining is never negative after burn", () => {
    const status = createPropulsionStatus(PropulsionPhase.Deceleration, 0.03, 200);
    const result = executeBurn(status, validPlan);
    expect(result.status.fuelRemaining_kg).toBeGreaterThanOrEqual(0);
  });

  // Contract precondition guards
  it("throws when deltaV <= 0", () => {
    const status = createPropulsionStatus();
    expect(() =>
      executeBurn(status, { ...validPlan, deltaV_m_per_s: 0 })
    ).toThrow("deltaV_m_per_s > 0");
    expect(() =>
      executeBurn(status, { ...validPlan, deltaV_m_per_s: -100 })
    ).toThrow("deltaV_m_per_s > 0");
  });

  it("throws when direction is not a unit vector", () => {
    const status = createPropulsionStatus();
    expect(() =>
      executeBurn(status, { ...validPlan, direction: [2, 0, 0] })
    ).toThrow("unit vector");
    expect(() =>
      executeBurn(status, { ...validPlan, direction: [0, 0, 0] })
    ).toThrow("unit vector");
  });

  it("throws when fuel insufficient", () => {
    const status = createPropulsionStatus(PropulsionPhase.Deceleration, 0.03, 0.001);
    expect(() =>
      executeBurn(status, { ...validPlan, deltaV_m_per_s: 1_000_000 })
    ).toThrow("Insufficient fuel");
  });

  it("accepts diagonal unit vectors", () => {
    const status = createPropulsionStatus(PropulsionPhase.Deceleration, 0.03, 200);
    const inv3 = 1 / Math.sqrt(3);
    const result = executeBurn(status, {
      ...validPlan,
      direction: [inv3, inv3, inv3],
    });
    expect(result.fuelUsed_kg).toBeGreaterThan(0);
  });
});

describe("deployMagsail", () => {
  it("sets magsailDeployed to true in Deceleration phase", () => {
    const status = createPropulsionStatus(PropulsionPhase.Deceleration, 0.03, 200, false);
    const result = deployMagsail(status);
    expect(result.magsailDeployed).toBe(true);
  });

  // Contract postcondition: irreversible
  it("deployment is irreversible — throws on second deployment", () => {
    const status = createPropulsionStatus(PropulsionPhase.Deceleration, 0.03, 200, false);
    const deployed = deployMagsail(status);
    expect(() => deployMagsail(deployed)).toThrow("already deployed");
  });

  // Contract precondition guards
  it("throws when not in Deceleration phase", () => {
    expect(() =>
      deployMagsail(createPropulsionStatus(PropulsionPhase.LaserBoost))
    ).toThrow("requires Deceleration phase");
    expect(() =>
      deployMagsail(createPropulsionStatus(PropulsionPhase.Cruise))
    ).toThrow("requires Deceleration phase");
    expect(() =>
      deployMagsail(createPropulsionStatus(PropulsionPhase.Arrived))
    ).toThrow("requires Deceleration phase");
  });
});

describe("advancePhase", () => {
  it("advances LaserBoost → Cruise", () => {
    const status = createPropulsionStatus(PropulsionPhase.LaserBoost);
    const result = advancePhase(status, PropulsionPhase.Cruise);
    expect(result.phase).toBe(PropulsionPhase.Cruise);
  });

  it("advances Cruise → Deceleration", () => {
    const status = createPropulsionStatus(PropulsionPhase.Cruise, 0.03);
    const result = advancePhase(status, PropulsionPhase.Deceleration);
    expect(result.phase).toBe(PropulsionPhase.Deceleration);
  });

  it("advances Deceleration → Arrived", () => {
    const status = createPropulsionStatus(PropulsionPhase.Deceleration, 0.001, 10);
    const result = advancePhase(status, PropulsionPhase.Arrived);
    expect(result.phase).toBe(PropulsionPhase.Arrived);
  });

  // Contract invariant: monotonic phase transitions
  it("throws on backward transition", () => {
    const status = createPropulsionStatus(PropulsionPhase.Cruise, 0.03);
    expect(() => advancePhase(status, PropulsionPhase.LaserBoost)).toThrow("monotonic");
  });

  it("throws on same-phase transition", () => {
    const status = createPropulsionStatus(PropulsionPhase.Cruise, 0.03);
    expect(() => advancePhase(status, PropulsionPhase.Cruise)).toThrow("monotonic");
  });

  it("throws on skipping phases", () => {
    const status = createPropulsionStatus(PropulsionPhase.LaserBoost);
    expect(() => advancePhase(status, PropulsionPhase.Deceleration)).toThrow("skip phases");
  });
});

// Contract invariant: full phase lifecycle is monotonic
describe("Propulsion phase lifecycle invariant", () => {
  it("supports full monotonic phase sequence LaserBoost → Cruise → Deceleration → Arrived", () => {
    let status = createPropulsionStatus(PropulsionPhase.LaserBoost, 0, 200);
    status = advancePhase(status, PropulsionPhase.Cruise);
    expect(status.phase).toBe(PropulsionPhase.Cruise);
    status = advancePhase(status, PropulsionPhase.Deceleration);
    expect(status.phase).toBe(PropulsionPhase.Deceleration);
    status = advancePhase(status, PropulsionPhase.Arrived);
    expect(status.phase).toBe(PropulsionPhase.Arrived);
  });
});

// ── Cold-Spare Assembler Activation ──────────────────────────────────────────

describe("activateColdSpare", () => {
  it("transitions coldSpareAssemblerAvailable from true to false", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: true };
    const result = activateColdSpare(feedstock);
    expect(result.coldSpareAssemblerAvailable).toBe(false);
    expect(result.remaining_kg).toBe(10); // feedstock unchanged
  });

  // Contract invariant: one-time irreversible transition
  it("throws on second activation (irreversible)", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: true };
    const activated = activateColdSpare(feedstock);
    expect(() => activateColdSpare(activated)).toThrow("unavailable");
  });

  it("throws when cold spare already unavailable", () => {
    const feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: false };
    expect(() => activateColdSpare(feedstock)).toThrow("can no longer self-repair");
  });
});

// ── Behavioral Spec: Self-Repair Flow (cold spare) ───────────────────────────

describe("Behavioral Spec: cold-spare assembler activation", () => {
  it("activates cold spare when primary fails, then cannot repair further if cold spare also fails", () => {
    // Given: primary assembler has failed, cold spare available
    let feedstock: RepairFeedstock = { remaining_kg: 10, coldSpareAssemblerAvailable: true };

    // When: activate cold spare
    feedstock = activateColdSpare(feedstock);

    // Then: cold spare activated (irreversible)
    expect(feedstock.coldSpareAssemblerAvailable).toBe(false);

    // And: repair still possible with remaining feedstock
    expect(canRepair(5, feedstock)).toBe(true);

    // But: cannot activate cold spare again
    expect(() => activateColdSpare(feedstock)).toThrow("can no longer self-repair");
  });
});
