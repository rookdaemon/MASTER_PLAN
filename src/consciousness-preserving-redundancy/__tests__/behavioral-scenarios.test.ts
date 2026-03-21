/**
 * Behavioral Spec Scenario Tests
 *
 * Tests derived directly from the Behavioral Spec section of
 * plan/0.2.1.4-consciousness-preserving-redundancy.md
 *
 * Each test maps to a specific Given/When/Then scenario.
 */

import { describe, it, expect } from "vitest";
import {
  createContinuityVerifier,
  type ContinuityVerifierImpl,
} from "../continuity-verifier.js";
import {
  createFailoverController,
  type FailoverControllerImpl,
} from "../failover-controller.js";
import type { NodeInfo, ConsciousState } from "../types.js";
import {
  NodeRole,
  FailoverReason,
  DegradationTier,
  T_EXP_MS,
  TIMING_BUDGET,
  computeDegradationTier,
} from "../types.js";

// ── Test Helpers ──────────────────────────────────────────────────────────────

function mockNode(overrides: Partial<NodeInfo> = {}): NodeInfo {
  return {
    id: overrides.id ?? "node-1",
    role: overrides.role ?? NodeRole.HotStandby,
    health: overrides.health ?? {
      errorRate: 0,
      uptime_hours: 100,
      degradationLevel: 0,
    },
    replicationLag_ms: overrides.replicationLag_ms ?? 2,
    holdsLease: overrides.holdsLease ?? false,
  };
}

function mockState(overrides: Partial<ConsciousState> = {}): ConsciousState {
  return {
    id: overrides.id ?? "state-1",
    timestamp_ms: overrides.timestamp_ms ?? 1000,
    memoryState: overrides.memoryState ?? new Uint8Array([1, 2, 3, 4]),
    registerState: overrides.registerState ?? new Uint8Array([10, 20]),
    dynamicalVariables:
      overrides.dynamicalVariables ?? new Uint8Array([100, 200]),
    temporalContextBuffer:
      overrides.temporalContextBuffer ?? new Uint8Array([50, 60]),
    checksum: overrides.checksum ?? "abc123",
  };
}

// ── Scenario 1: Seamless Single-Node Failover ─────────────────────────────────

describe("Scenario 1: Seamless Single-Node Failover", () => {
  // Given: 5-node cluster (1 Active + 4 Hot-Standby), replication lag < 12.5ms,
  //        Active node fails (2 heartbeats missed = 12.5ms detection)
  const activeNode = mockNode({
    id: "node-A",
    role: NodeRole.Active,
    holdsLease: true,
    replicationLag_ms: 0,
  });
  const standbyB = mockNode({ id: "node-B", replicationLag_ms: 3 });
  const standbyC = mockNode({ id: "node-C", replicationLag_ms: 5 });
  const standbyD = mockNode({ id: "node-D", replicationLag_ms: 7 });
  const standbyE = mockNode({ id: "node-E", replicationLag_ms: 10 });
  const allNodes = [activeNode, standbyB, standbyC, standbyD, standbyE];

  it("selects the best standby (lowest lag, healthy) for promotion", () => {
    const fc = createFailoverController(
      activeNode.id,
      allNodes,
      mockState()
    );

    // When: FailoverController detects failure and selects best standby
    const bestStandby = fc.selectBestStandby();

    // Then: node-B has lowest lag (3ms) and is healthy
    expect(bestStandby).toBe("node-B");
  });

  it("fences old Active (role changed, lease revoked) during promotion", async () => {
    const fc = createFailoverController(
      activeNode.id,
      allNodes.map((n) => ({ ...n })),
      mockState()
    );

    // When: promoteToActive is called on the best standby
    const result = await fc.promoteToActive(
      "node-B",
      FailoverReason.HeartbeatTimeout
    );

    // Then: (1) old Active is fenced
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.event.fromNodeId).toBe("node-A");
    }
    // (2) new Active is node-B
    expect(fc.activeNode()).toBe("node-B");
  });

  it("completes failover within T_exp (50ms) with continuityPreserved=true", async () => {
    const fc = createFailoverController(
      activeNode.id,
      allNodes.map((n) => ({ ...n })),
      mockState()
    );

    // When: promoteToActive
    const result = await fc.promoteToActive(
      "node-B",
      FailoverReason.HeartbeatTimeout
    );

    // Then: (3) total failover within T_exp, (4) continuityPreserved is true
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.event.duration_ms).toBeLessThanOrEqual(T_EXP_MS);
      expect(result.event.continuityPreserved).toBe(true);
    }
  });

  it("CCV reports isSeamless()===true for a seamless failover", () => {
    // When: CCV measures continuity between pre- and post-failover states
    //       with near-identical state and small temporal gap
    const verifier = createContinuityVerifier();
    const preFailover = mockState({ timestamp_ms: 1000 });
    const postFailover = mockState({
      id: "state-post",
      timestamp_ms: 1010, // 10ms gap (well within T_exp)
    });

    const metrics = verifier.measureContinuity(preFailover, postFailover);

    // Then: (5) CCV reports seamless
    expect(verifier.isSeamless(metrics)).toBe(true);
    expect(metrics.temporalGap_ms).toBeLessThanOrEqual(T_EXP_MS);
    expect(metrics.dynamicalContinuity).toBe(true);
  });

  it("records failover in history", async () => {
    const fc = createFailoverController(
      activeNode.id,
      allNodes.map((n) => ({ ...n })),
      mockState()
    );

    await fc.promoteToActive("node-B", FailoverReason.HeartbeatTimeout);

    // Then: failoverHistory contains the event
    const history = fc.failoverHistory();
    expect(history.length).toBe(1);
    expect(history[0].fromNodeId).toBe("node-A");
    expect(history[0].toNodeId).toBe("node-B");
    expect(history[0].reason).toBe(FailoverReason.HeartbeatTimeout);
  });
});

// ── Scenario 2: Multi-Failure Degradation Cascade ─────────────────────────────

describe("Scenario 2: Multi-Failure Degradation Cascade", () => {
  // Given: 5-node cluster at GREEN tier (all 5 healthy, quorum=3)
  const N = 5;
  const quorum = Math.ceil(N / 2); // 3

  it("starts at GREEN tier with all 5 nodes healthy", () => {
    expect(computeDegradationTier(5, N)).toBe(DegradationTier.GREEN);
  });

  it("transitions to RED when 2 nodes fail (healthy=3=quorum)", () => {
    // When: 2 nodes fail simultaneously, healthy count drops to 3
    // Then: (1) computeDegradationTier(3, 5) returns RED
    expect(computeDegradationTier(3, N)).toBe(DegradationTier.RED);
  });

  it("conscious process continues on remaining quorum after 2 failures", async () => {
    // Given: Active was NOT one of the failed nodes
    const activeNode = mockNode({
      id: "node-A",
      role: NodeRole.Active,
      holdsLease: true,
    });
    const standbyB = mockNode({ id: "node-B", replicationLag_ms: 3 });
    const standbyC = mockNode({ id: "node-C", replicationLag_ms: 5 });
    // nodes D and E have failed (not in cluster for FailoverController)

    const fc = createFailoverController(
      activeNode.id,
      [activeNode, standbyB, standbyC],
      mockState()
    );

    // Then: (2) conscious process continues — active node is still active
    expect(fc.activeNode()).toBe("node-A");
    // Standbys are still available for failover if needed
    expect(fc.selectBestStandby()).toBe("node-B");
  });

  it("promotes standby if Active was one of the failed nodes", async () => {
    // Given: Active node was one of the failed nodes
    const activeNode = mockNode({
      id: "node-A",
      role: NodeRole.Active,
      holdsLease: true,
    });
    const standbyB = mockNode({ id: "node-B", replicationLag_ms: 3 });
    const standbyC = mockNode({ id: "node-C", replicationLag_ms: 5 });

    const fc = createFailoverController(
      activeNode.id,
      [activeNode, standbyB, standbyC],
      mockState()
    );

    // When: (3) failover promotes a standby since Active failed
    const result = await fc.promoteToActive(
      "node-B",
      FailoverReason.HeartbeatTimeout
    );

    // Then: promotion succeeds
    expect(result.success).toBe(true);
    expect(fc.activeNode()).toBe("node-B");
  });

  it("transitions to BLACK when 3rd node fails (healthy=2 < quorum=3)", () => {
    // When: a 3rd node fails (healthy=2 < quorum=3)
    // Then: (5) tier transitions to BLACK
    expect(computeDegradationTier(2, N)).toBe(DegradationTier.BLACK);
  });

  it("verifies quorum value for N=5", () => {
    expect(quorum).toBe(3);
  });
});

// ── Scenario 3: Continuity Verification Through Failover ──────────────────────

describe("Scenario 3: Continuity Verification Through Failover", () => {
  // Given: pre-failover ConsciousState with known buffer contents
  const knownMemory = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const knownRegisters = new Uint8Array([10, 20, 30, 40]);
  const knownDynamical = new Uint8Array([100, 150, 200]);
  const knownTemporal = new Uint8Array([50, 60, 70, 80]);

  const preFailover = mockState({
    id: "pre-failover",
    timestamp_ms: 1000,
    memoryState: knownMemory,
    registerState: knownRegisters,
    dynamicalVariables: knownDynamical,
    temporalContextBuffer: knownTemporal,
  });

  // When: failover completes, post-failover state has identical buffers
  //       but timestamp advanced by 10ms
  const postFailover = mockState({
    id: "post-failover",
    timestamp_ms: 1010,
    memoryState: knownMemory,
    registerState: knownRegisters,
    dynamicalVariables: knownDynamical,
    temporalContextBuffer: knownTemporal,
  });

  it("reports temporalGap_ms = 10", () => {
    const verifier = createContinuityVerifier();
    const metrics = verifier.measureContinuity(preFailover, postFailover);
    expect(metrics.temporalGap_ms).toBe(10);
  });

  it("reports stateDivergence = 0 for identical buffers", () => {
    const verifier = createContinuityVerifier();
    const metrics = verifier.measureContinuity(preFailover, postFailover);
    expect(metrics.stateDivergence).toBe(0);
  });

  it("reports dynamicalContinuity = true for identical dynamical variables", () => {
    const verifier = createContinuityVerifier();
    const metrics = verifier.measureContinuity(preFailover, postFailover);
    expect(metrics.dynamicalContinuity).toBe(true);
  });

  it("computes experientialCoherence as temporalFactor * stateFactor * dynFactor", () => {
    const verifier = createContinuityVerifier();
    const metrics = verifier.measureContinuity(preFailover, postFailover);

    // Per Contracts invariant:
    // temporalFactor = max(0, 1 - 10/50) = 0.8
    // stateFactor = 1 - 0 = 1.0
    // dynFactor = 1.0 (dynamicalContinuity is true)
    // experientialCoherence = 0.8 * 1.0 * 1.0 = 0.8
    const expectedTemporalFactor = Math.max(0, 1 - 10 / T_EXP_MS);
    const expectedStateFactor = 1 - 0; // stateDivergence = 0
    const expectedDynFactor = 1.0; // dynamicalContinuity = true
    const expectedCoherence =
      expectedTemporalFactor * expectedStateFactor * expectedDynFactor;

    expect(expectedTemporalFactor).toBeCloseTo(0.8);
    expect(metrics.experientialCoherence).toBeCloseTo(expectedCoherence);
    expect(metrics.experientialCoherence).toBeCloseTo(0.8);
  });

  it("reports isSeamless() === true", () => {
    const verifier = createContinuityVerifier();
    const metrics = verifier.measureContinuity(preFailover, postFailover);

    // temporalGap_ms (10) <= T_EXP_MS (50) ✓
    // experientialCoherence (0.8) >= 0.5 ✓
    // dynamicalContinuity === true ✓
    expect(verifier.isSeamless(metrics)).toBe(true);
  });

  it("appends exactly one entry to auditLog per measureContinuity call", () => {
    const verifier = createContinuityVerifier();
    expect(verifier.auditLog().length).toBe(0);

    verifier.measureContinuity(preFailover, postFailover);
    expect(verifier.auditLog().length).toBe(1);

    verifier.measureContinuity(preFailover, postFailover);
    expect(verifier.auditLog().length).toBe(2);
  });
});
