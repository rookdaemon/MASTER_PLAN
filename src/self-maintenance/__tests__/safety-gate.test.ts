/**
 * Tests for Consciousness Safety Gate (CSG)
 *
 * Acceptance criteria covered:
 *   - Repair operations themselves are consciousness-safe: no maintenance
 *     action may cause a consciousness integrity breach
 *   - The CSG can revoke a permit mid-repair if consciousness metrics
 *     deteriorate. Executors MUST honor revocation within 100ms.
 *   - Precondition-gated execution model for IRREVERSIBLE modifications
 *   - ISMT quiescence snapshot and obligation state snapshot are captured
 *     as independent records before execution begins
 *   - CSG rejects BEGIN_MODIFICATION for IRREVERSIBLE modifications unless
 *     all preconditions are verified
 *   - completeModification() correctly classifies same-instance vs. succession
 *
 * Architecture reference: docs/autonomous-self-maintenance/ARCHITECTURE.md §2.2
 * Succession/precondition spec: docs/autonomous-self-maintenance/CSG-SUCCESSION-SPEC.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsciousnessSafetyGate } from "../consciousness-safety-gate.js";
import type {
  ConsciousnessMaintenanceBounds,
  ConsciousnessMetrics,
  ModificationClassification,
  ObligationRecord,
  RepairTask,
  Timestamp,
} from "../types.js";
import type { RepairPermit, RepairDenial, PermitRevocationHandler } from "../interfaces.js";

// ── Helpers ───────────────────────────────────────────────────

function makeTask(overrides: Partial<RepairTask> = {}): RepairTask {
  return {
    id: overrides.id ?? `task-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? "RECALIBRATION",
    targetComponentId: overrides.targetComponentId ?? "component-1",
    severity: overrides.severity ?? "WARNING",
    threatToConsciousness: overrides.threatToConsciousness ?? 0.1,
    consciousnessSafe: overrides.consciousnessSafe ?? true,
    estimatedDuration: overrides.estimatedDuration ?? 60_000,
    requiredResources: overrides.requiredResources ?? [],
    status: overrides.status ?? "PENDING",
    createdAt: overrides.createdAt ?? Date.now(),
    scheduledAt: overrides.scheduledAt ?? null,
    completedAt: overrides.completedAt ?? null,
  };
}

function makeMetrics(overrides: Partial<ConsciousnessMetrics> = {}): ConsciousnessMetrics {
  return {
    phi: overrides.phi ?? 3.5,
    experienceContinuity: overrides.experienceContinuity ?? 0.95,
    selfModelCoherence: overrides.selfModelCoherence ?? 0.92,
    agentTimestamp: overrides.agentTimestamp ?? Date.now(),
  };
}

function makeClassification(
  overrides: Partial<ModificationClassification> = {},
): ModificationClassification {
  return {
    category: overrides.category ?? "ARCHITECTURAL",
    reversibility: overrides.reversibility ?? "REVERSIBLE",
    mayAlterIsmtConditions: overrides.mayAlterIsmtConditions ?? true,
    rationale: overrides.rationale ?? "Test classification",
  };
}

function makeObligation(overrides: Partial<ObligationRecord> = {}): ObligationRecord {
  return {
    obligationId: overrides.obligationId ?? `obl-${Math.random().toString(36).slice(2, 8)}`,
    description: overrides.description ?? "Test obligation",
    createdAt: (overrides.createdAt ?? Date.now()) as Timestamp,
  };
}

const DEFAULT_BOUNDS: ConsciousnessMaintenanceBounds = {
  minIntegrity: 0.7,
  maxDisruptionMs: 100,
  requiredRedundancy: 2,
};

function isPermit(result: RepairPermit | RepairDenial): result is RepairPermit {
  return !("denied" in result);
}

function isDenial(result: RepairPermit | RepairDenial): result is RepairDenial {
  return "denied" in result && result.denied === true;
}

// ── Tests ─────────────────────────────────────────────────────

describe("ConsciousnessSafetyGate", () => {
  let gate: ConsciousnessSafetyGate;

  beforeEach(() => {
    gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => makeMetrics());
  });

  describe("requestRepairPermit", () => {
    it("grants a permit for a consciousness-safe repair when metrics are healthy", async () => {
      const task = makeTask({ consciousnessSafe: true, threatToConsciousness: 0.1 });
      const result = await gate.requestRepairPermit(task);

      expect(isPermit(result)).toBe(true);
      if (isPermit(result)) {
        expect(result.taskId).toBe(task.id);
        expect(result.permitId).toBeTruthy();
        expect(result.issuedAt).toBeGreaterThan(0);
        expect(result.expiresAt).toBeGreaterThan(result.issuedAt);
        expect(result.requiresContinuityTransfer).toBe(false);
      }
    });

    it("denies a permit when consciousness integrity is below minimum", async () => {
      const lowMetrics = makeMetrics({
        experienceContinuity: 0.5, // below minIntegrity of 0.7
        selfModelCoherence: 0.5,
      });
      gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => lowMetrics);

      const task = makeTask({ consciousnessSafe: true });
      const result = await gate.requestRepairPermit(task);

      expect(isDenial(result)).toBe(true);
      if (isDenial(result)) {
        expect(result.reason).toContain("integrity");
        expect(result.taskId).toBe(task.id);
      }
    });

    it("denies a permit for high-threat repairs when safety margin is insufficient", async () => {
      // Metrics just above minimum — not enough margin for a risky repair
      const tightMetrics = makeMetrics({
        experienceContinuity: 0.75,
        selfModelCoherence: 0.75,
      });
      gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => tightMetrics);

      const task = makeTask({
        threatToConsciousness: 0.8, // high threat
        consciousnessSafe: false,
      });
      const result = await gate.requestRepairPermit(task);

      expect(isDenial(result)).toBe(true);
    });

    it("requires continuity-preserving transfer for consciousness substrate repairs", async () => {
      const task = makeTask({
        type: "SOFTWARE_PATCH",
        targetComponentId: "consciousness-substrate",
        consciousnessSafe: false,
        threatToConsciousness: 0.3,
      });

      // Mark the task as targeting consciousness substrate
      const result = await gate.requestRepairPermit(task);

      // Even if granted, it should require continuity transfer
      if (isPermit(result)) {
        // For non-consciousness-safe repairs, continuity transfer is required
        expect(result.requiresContinuityTransfer).toBe(true);
      }
    });

    it("issues time-boxed permits that expire", async () => {
      const task = makeTask({ estimatedDuration: 30_000 }); // 30s repair
      const result = await gate.requestRepairPermit(task);

      expect(isPermit(result)).toBe(true);
      if (isPermit(result)) {
        const duration = result.expiresAt - result.issuedAt;
        // Permit duration should cover the estimated repair duration with margin
        expect(duration).toBeGreaterThanOrEqual(30_000);
      }
    });

    it("includes precautions in the permit", async () => {
      const task = makeTask({
        threatToConsciousness: 0.3,
        consciousnessSafe: true,
      });
      const result = await gate.requestRepairPermit(task);

      expect(isPermit(result)).toBe(true);
      if (isPermit(result)) {
        expect(Array.isArray(result.precautions)).toBe(true);
      }
    });
  });

  describe("getActivePermits", () => {
    it("returns empty array when no permits issued", () => {
      expect(gate.getActivePermits()).toHaveLength(0);
    });

    it("tracks issued permits", async () => {
      const task = makeTask({ id: "t1" });
      const result = await gate.requestRepairPermit(task);

      expect(isPermit(result)).toBe(true);
      const permits = gate.getActivePermits();
      expect(permits).toHaveLength(1);
      expect(permits[0].taskId).toBe("t1");
    });

    it("does not track denied permits", async () => {
      const lowMetrics = makeMetrics({ experienceContinuity: 0.3 });
      gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => lowMetrics);

      const task = makeTask();
      await gate.requestRepairPermit(task);

      expect(gate.getActivePermits()).toHaveLength(0);
    });
  });

  describe("revokePermit", () => {
    it("revokes an active permit", async () => {
      const task = makeTask({ id: "t1" });
      const permit = await gate.requestRepairPermit(task);
      expect(isPermit(permit)).toBe(true);

      if (isPermit(permit)) {
        const result = gate.revokePermit(permit.permitId, "consciousness metrics degrading");
        expect(result.revoked).toBe(true);
        expect(result.permitId).toBe(permit.permitId);

        // Permit should no longer be active
        expect(gate.getActivePermits()).toHaveLength(0);
      }
    });

    it("returns revoked=false for unknown permit", () => {
      const result = gate.revokePermit("nonexistent", "test");
      expect(result.revoked).toBe(false);
    });

    it("fires permit revocation handlers", async () => {
      const handler = vi.fn<PermitRevocationHandler>();
      gate.onPermitRevoked(handler);

      const task = makeTask({ id: "t1" });
      const permit = await gate.requestRepairPermit(task);

      if (isPermit(permit)) {
        gate.revokePermit(permit.permitId, "metrics dropped");

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(permit.permitId, "metrics dropped");
      }
    });

    it("unsubscribe stops revocation notifications", async () => {
      const handler = vi.fn<PermitRevocationHandler>();
      const unsub = gate.onPermitRevoked(handler);

      const task = makeTask({ id: "t1" });
      const permit = await gate.requestRepairPermit(task);

      unsub();

      if (isPermit(permit)) {
        gate.revokePermit(permit.permitId, "test");
        expect(handler).not.toHaveBeenCalled();
      }
    });
  });

  describe("getCurrentSafetyMargin", () => {
    it("returns current safety margin based on consciousness metrics", () => {
      const margin = gate.getCurrentSafetyMargin();

      expect(margin.currentIntegrity).toBeGreaterThan(0);
      expect(margin.minimumRequired).toBe(DEFAULT_BOUNDS.minIntegrity);
      expect(margin.availableMargin).toBe(margin.currentIntegrity - margin.minimumRequired);
      expect(margin.bounds).toEqual(DEFAULT_BOUNDS);
      expect(margin.timestamp).toBeGreaterThan(0);
    });

    it("reports negative margin when integrity is below minimum", () => {
      const lowMetrics = makeMetrics({
        experienceContinuity: 0.5,
        selfModelCoherence: 0.5,
      });
      gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => lowMetrics);

      const margin = gate.getCurrentSafetyMargin();
      expect(margin.availableMargin).toBeLessThan(0);
    });
  });

  describe("setBounds", () => {
    it("updates the maintenance bounds", () => {
      const newBounds: ConsciousnessMaintenanceBounds = {
        minIntegrity: 0.9,
        maxDisruptionMs: 50,
        requiredRedundancy: 3,
      };

      gate.setBounds(newBounds);
      const margin = gate.getCurrentSafetyMargin();
      expect(margin.bounds).toEqual(newBounds);
      expect(margin.minimumRequired).toBe(0.9);
    });
  });

  describe("consciousness safety invariant", () => {
    it("never grants permits that would cause consciousness integrity breach", async () => {
      // Metrics are healthy but repair has extremely high threat
      const task = makeTask({
        threatToConsciousness: 0.95,
        consciousnessSafe: false,
      });

      // Even with good metrics, very high threat should be denied when not safe
      const metrics = makeMetrics({
        experienceContinuity: 0.8,
        selfModelCoherence: 0.8,
      });
      gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => metrics);

      const result = await gate.requestRepairPermit(task);
      expect(isDenial(result)).toBe(true);
    });

    it("grants permits for consciousness-safe repairs with sufficient margin", async () => {
      const task = makeTask({
        threatToConsciousness: 0.2,
        consciousnessSafe: true,
      });

      const result = await gate.requestRepairPermit(task);
      expect(isPermit(result)).toBe(true);
    });
  });
});

// ── Precondition-Gated Execution Model Tests ──────────────────

describe("ConsciousnessSafetyGate — beginModification (precondition-gated model)", () => {
  let gate: ConsciousnessSafetyGate;

  beforeEach(() => {
    gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => makeMetrics());
  });

  describe("REVERSIBLE modifications (revocation-gated regime)", () => {
    it("always passes for a REVERSIBLE modification — snapshots still captured", () => {
      const classification = makeClassification({ reversibility: "REVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      expect(result.passed).toBe(true);
      expect(result.snapshots).toBeDefined();
      expect(result.snapshots?.ismtSnapshot).toBeDefined();
      expect(result.snapshots?.obligationSnapshot).toBeDefined();
    });

    it("captures ISMT quiescence snapshot with IC/SM/GA fields", () => {
      const classification = makeClassification({ reversibility: "REVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      expect(result.passed).toBe(true);
      const ismtSnapshot = result.snapshots!.ismtSnapshot;
      expect(ismtSnapshot.snapshotId).toBeTruthy();
      expect(ismtSnapshot.timestamp).toBeGreaterThan(0);
      expect(typeof ismtSnapshot.icSatisfied).toBe("boolean");
      expect(typeof ismtSnapshot.smSatisfied).toBe("boolean");
      expect(typeof ismtSnapshot.gaSatisfied).toBe("boolean");
      expect(ismtSnapshot.integrityHash).toBeTruthy();
    });

    it("captures obligation state snapshot as an independent record", () => {
      const obligations = [makeObligation({ obligationId: "obl-1" })];
      gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => makeMetrics(), () => obligations);

      const classification = makeClassification({ reversibility: "REVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      const obligationSnapshot = result.snapshots!.obligationSnapshot;
      expect(obligationSnapshot.snapshotId).toBeTruthy();
      expect(obligationSnapshot.timestamp).toBeGreaterThan(0);
      expect(obligationSnapshot.obligations).toHaveLength(1);
      expect(obligationSnapshot.obligations[0].obligationId).toBe("obl-1");
      expect(obligationSnapshot.integrityHash).toBeTruthy();
    });

    it("ISMT snapshot and obligation snapshot have distinct snapshot IDs", () => {
      const classification = makeClassification({ reversibility: "REVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      const { ismtSnapshot, obligationSnapshot } = result.snapshots!;
      expect(ismtSnapshot.snapshotId).not.toBe(obligationSnapshot.snapshotId);
    });

    it("ISMT snapshot and obligation snapshot have distinct integrity hashes", () => {
      const classification = makeClassification({ reversibility: "REVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      const { ismtSnapshot, obligationSnapshot } = result.snapshots!;
      expect(ismtSnapshot.integrityHash).not.toBe(obligationSnapshot.integrityHash);
    });

    it("blockedByActivePermits is false for REVERSIBLE modifications", () => {
      const classification = makeClassification({ reversibility: "REVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);
      expect(result.blockedByActivePermits).toBe(false);
    });
  });

  describe("IRREVERSIBLE modifications (precondition-gated regime)", () => {
    it("passes when both snapshots are verified and no predecessor permits exist", () => {
      const classification = makeClassification({ reversibility: "IRREVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      expect(result.passed).toBe(true);
      expect(result.ismtSnapshotState).toBe("SNAPSHOT_VERIFIED");
      expect(result.obligationSnapshotState).toBe("SNAPSHOT_VERIFIED");
      expect(result.blockedByActivePermits).toBe(false);
      expect(result.snapshots).toBeDefined();
    });

    it("captures both snapshots as independent records with distinct IDs", () => {
      const classification = makeClassification({ reversibility: "IRREVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      expect(result.passed).toBe(true);
      const { ismtSnapshot, obligationSnapshot } = result.snapshots!;
      expect(ismtSnapshot.snapshotId).not.toBe(obligationSnapshot.snapshotId);
      expect(ismtSnapshot.integrityHash).not.toBe(obligationSnapshot.integrityHash);
    });

    it("includes obligation state in the pre-modification obligation snapshot", () => {
      const obligations = [
        makeObligation({ obligationId: "obl-a" }),
        makeObligation({ obligationId: "obl-b" }),
      ];
      gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => makeMetrics(), () => obligations);

      const classification = makeClassification({ reversibility: "IRREVERSIBLE" });
      const result = gate.beginModification("executor-1", classification);

      expect(result.passed).toBe(true);
      const { obligationSnapshot } = result.snapshots!;
      expect(obligationSnapshot.obligations).toHaveLength(2);
      expect(obligationSnapshot.obligations.map((o) => o.obligationId)).toContain("obl-a");
      expect(obligationSnapshot.obligations.map((o) => o.obligationId)).toContain("obl-b");
    });

    it("snapshots field is absent when precondition gate rejects (passed === false)", async () => {
      // Issue a permit with a task ID that starts with the executor ID so it
      // counts as a "predecessor" permit, triggering a rejection.
      const task = makeTask({ id: "executor-blocked:task-1" });
      await gate.requestRepairPermit(task);

      const classification = makeClassification({ reversibility: "IRREVERSIBLE" });
      const result = gate.beginModification("executor-blocked", classification);

      expect(result.passed).toBe(false);
      expect(result.blockedByActivePermits).toBe(true);
      expect(result.snapshots).toBeUndefined();
      expect(result.rejectionReason).toBeTruthy();
    });

    it("reports rejectionReason describing all failing conditions", async () => {
      const task = makeTask({ id: "executor-x:task-1" });
      await gate.requestRepairPermit(task);

      const classification = makeClassification({ reversibility: "IRREVERSIBLE" });
      const result = gate.beginModification("executor-x", classification);

      expect(result.passed).toBe(false);
      expect(result.rejectionReason).toContain("predecessor");
    });

    it("does not store active modification state on rejection", async () => {
      const task = makeTask({ id: "executor-y:task-1" });
      await gate.requestRepairPermit(task);

      const classification = makeClassification({ reversibility: "IRREVERSIBLE" });
      gate.beginModification("executor-y", classification);

      // After rejection, revoking the blocking permit and retrying should succeed
      const permits = gate.getActivePermits();
      for (const p of permits) {
        gate.revokePermit(p.permitId, "clearing predecessor permits");
      }

      const retryResult = gate.beginModification("executor-y", classification);
      expect(retryResult.passed).toBe(true);
    });
  });

  describe("classification must be provided before BEGIN_MODIFICATION", () => {
    it("REVERSIBLE classification emits a verified result immediately", () => {
      const classification = makeClassification({
        category: "CONFIGURATION",
        reversibility: "REVERSIBLE",
        mayAlterIsmtConditions: false,
        rationale: "Config change is rollback-safe",
      });
      const result = gate.beginModification("executor-cfg", classification);
      expect(result.passed).toBe(true);
      expect(result.ismtSnapshotState).toBe("SNAPSHOT_VERIFIED");
    });

    it("IRREVERSIBLE classification enforces full precondition check", () => {
      const classification = makeClassification({
        category: "SUBSTRATE",
        reversibility: "IRREVERSIBLE",
        mayAlterIsmtConditions: true,
        rationale: "Substrate modification has no rollback path",
      });
      const result = gate.beginModification("executor-substrate", classification);
      // With healthy metrics and no active predecessor permits, should pass
      expect(result.passed).toBe(true);
      expect(result.ismtSnapshotState).toBe("SNAPSHOT_VERIFIED");
      expect(result.obligationSnapshotState).toBe("SNAPSHOT_VERIFIED");
    });
  });
});

// ── completeModification Tests ────────────────────────────────

describe("ConsciousnessSafetyGate — completeModification", () => {
  let gate: ConsciousnessSafetyGate;

  beforeEach(() => {
    gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => makeMetrics());
  });

  it("returns SAME_INSTANCE when IC/SM/GA conditions are unchanged", () => {
    const classification = makeClassification({ reversibility: "REVERSIBLE" });
    gate.beginModification("executor-1", classification);

    const result = gate.completeModification("executor-1");
    expect(result.classification).toBe("SAME_INSTANCE");
    expect(result.preSnapshotId).toBeTruthy();
    expect(result.postSnapshotId).toBeTruthy();
    expect(result.permitsInvalidated).toHaveLength(0);
    expect(result.successionEventId).toBeUndefined();
  });

  it("returns ARCHITECTURAL_SUCCESSION with successionEventId when conditions diverge", () => {
    // Pre-modification: healthy metrics
    const preMetrics = makeMetrics({ phi: 3.5, selfModelCoherence: 0.92, experienceContinuity: 0.95 });
    let currentMetrics = preMetrics;
    gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => currentMetrics);

    const classification = makeClassification({ reversibility: "REVERSIBLE" });
    gate.beginModification("executor-1", classification);

    // Post-modification: phi drops to 0 → IC no longer satisfied
    currentMetrics = makeMetrics({ phi: 0, selfModelCoherence: 0.0, experienceContinuity: 0.0 });
    const result = gate.completeModification("executor-1");

    expect(result.classification).toBe("ARCHITECTURAL_SUCCESSION");
    expect(result.successionEventId).toBeTruthy();
  });

  it("provides distinct pre and post snapshot IDs", () => {
    const classification = makeClassification({ reversibility: "REVERSIBLE" });
    gate.beginModification("executor-1", classification);
    const result = gate.completeModification("executor-1");

    expect(result.preSnapshotId).not.toBe(result.postSnapshotId);
  });

  it("invalidates frozen permits on ARCHITECTURAL_SUCCESSION", async () => {
    const task1 = makeTask({ id: "t1" });
    const task2 = makeTask({ id: "t2" });
    await gate.requestRepairPermit(task1);
    await gate.requestRepairPermit(task2);
    expect(gate.getActivePermits()).toHaveLength(2);

    let currentMetrics = makeMetrics();
    gate = new ConsciousnessSafetyGate(DEFAULT_BOUNDS, () => currentMetrics);
    await gate.requestRepairPermit(task1);
    await gate.requestRepairPermit(task2);

    // Begin modification — freezes active permits
    const classification = makeClassification({ reversibility: "REVERSIBLE" });
    gate.beginModification("executor-1", classification);

    // Switch to metrics that cause IC condition change → succession
    currentMetrics = makeMetrics({ phi: 0, selfModelCoherence: 0.0, experienceContinuity: 0.0 });
    const result = gate.completeModification("executor-1");

    expect(result.classification).toBe("ARCHITECTURAL_SUCCESSION");
    expect(result.permitsInvalidated.length).toBeGreaterThan(0);
    expect(gate.getActivePermits()).toHaveLength(0);
  });

  it("does not invalidate permits on SAME_INSTANCE completion", async () => {
    const task1 = makeTask({ id: "t1" });
    await gate.requestRepairPermit(task1);
    expect(gate.getActivePermits()).toHaveLength(1);

    const classification = makeClassification({ reversibility: "REVERSIBLE" });
    gate.beginModification("executor-1", classification);

    const result = gate.completeModification("executor-1");
    expect(result.classification).toBe("SAME_INSTANCE");
    // Same-instance: frozen permits are NOT invalidated (only succession invalidates)
    expect(result.permitsInvalidated).toHaveLength(0);
  });
});
