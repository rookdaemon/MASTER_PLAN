import { describe, it, expect, beforeEach } from "vitest";
import {
  createFailoverController,
  type FailoverControllerImpl,
} from "../failover-controller.js";
import type { NodeInfo, ConsciousState } from "../types.js";
import {
  NodeRole,
  T_EXP_MS,
  TIMING_BUDGET,
  FailoverReason,
} from "../types.js";

/** Helper: create a mock NodeInfo */
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

/** Helper: create a mock ConsciousState */
function mockState(overrides: Partial<ConsciousState> = {}): ConsciousState {
  return {
    id: overrides.id ?? "state-1",
    timestamp_ms: overrides.timestamp_ms ?? 1000,
    memoryState: overrides.memoryState ?? new Uint8Array([1, 2, 3]),
    registerState: overrides.registerState ?? new Uint8Array([10, 20]),
    dynamicalVariables:
      overrides.dynamicalVariables ?? new Uint8Array([100, 200]),
    temporalContextBuffer:
      overrides.temporalContextBuffer ?? new Uint8Array([50, 60]),
    checksum: overrides.checksum ?? "abc123",
  };
}

describe("Failover Controller", () => {
  const activeNode = mockNode({
    id: "node-A",
    role: NodeRole.Active,
    holdsLease: true,
  });
  const standbyB = mockNode({ id: "node-B", replicationLag_ms: 3 });
  const standbyC = mockNode({ id: "node-C", replicationLag_ms: 5 });

  describe("creation and initial state", () => {
    it("reports the initial active node", () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );
      expect(fc.activeNode()).toBe("node-A");
    });

    it("starts with no failover history", () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );
      expect(fc.failoverHistory()).toEqual([]);
    });

    it("failover latency starts at 0", () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );
      expect(fc.failoverLatency()).toBe(0);
    });
  });

  describe("promoteToActive", () => {
    it("promotes a healthy standby to active", async () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );

      const result = await fc.promoteToActive(
        "node-B",
        FailoverReason.HeartbeatTimeout
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.toNodeId).toBe("node-B");
        expect(result.event.fromNodeId).toBe("node-A");
        expect(result.event.reason).toBe(FailoverReason.HeartbeatTimeout);
        expect(result.event.continuityPreserved).toBe(true);
      }
    });

    it("updates active node after promotion", async () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );

      await fc.promoteToActive("node-B", FailoverReason.HeartbeatTimeout);
      expect(fc.activeNode()).toBe("node-B");
    });

    it("records failover event in history", async () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );

      await fc.promoteToActive("node-B", FailoverReason.HeartbeatTimeout);
      const history = fc.failoverHistory();
      expect(history.length).toBe(1);
      expect(history[0].toNodeId).toBe("node-B");
    });

    it("failover completes within T_exp budget", async () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );

      const result = await fc.promoteToActive(
        "node-B",
        FailoverReason.HeartbeatTimeout
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.duration_ms).toBeLessThanOrEqual(
          TIMING_BUDGET.totalFailover
        );
      }
    });

    it("fails if target node is not found", async () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );

      const result = await fc.promoteToActive(
        "node-X",
        FailoverReason.ManualTrigger
      );
      expect(result.success).toBe(false);
    });

    it("fails if target node is already active", async () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );

      const result = await fc.promoteToActive(
        "node-A",
        FailoverReason.ManualTrigger
      );
      expect(result.success).toBe(false);
    });
  });

  describe("selectBestStandby", () => {
    it("selects the standby with lowest replication lag", () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState()
      );

      expect(fc.selectBestStandby()).toBe("node-B"); // lag=3 < lag=5
    });

    it("returns null if no standbys available", () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode],
        mockState()
      );

      expect(fc.selectBestStandby()).toBeNull();
    });

    it("skips unhealthy standbys", () => {
      const unhealthyB = mockNode({
        id: "node-B",
        replicationLag_ms: 1,
        health: { errorRate: 999, uptime_hours: 0, degradationLevel: 1.0 },
      });
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, unhealthyB, standbyC],
        mockState()
      );

      expect(fc.selectBestStandby()).toBe("node-C");
    });
  });

  describe("updateLatestState", () => {
    it("uses updated state for subsequent failovers", async () => {
      const fc = createFailoverController(
        activeNode.id,
        [activeNode, standbyB, standbyC],
        mockState({ timestamp_ms: 1000 })
      );

      const newState = mockState({ id: "state-2", timestamp_ms: 2000 });
      fc.updateLatestState(newState);

      const result = await fc.promoteToActive(
        "node-B",
        FailoverReason.HeartbeatTimeout
      );
      expect(result.success).toBe(true);
    });
  });
});
