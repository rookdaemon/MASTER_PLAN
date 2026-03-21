/**
 * Conscious Process Manager — TDD Tests
 *
 * Tests for all 7 Behavioral Spec scenarios from
 * plan/0.2.1.1.3-radiation-tolerant-process-continuity.md
 *
 * Red phase: These tests define the expected behavior of ConsciousProcessManager.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeRegistry,
  CheckpointStore,
  Clock,
  ProcessContinuityConfig,
  HealthStatus,
  StateSnapshot,
  ConsciousProcessManager,
} from "../types.js";
import { ConsciousProcessManagerImpl } from "../conscious-process-manager.js";

// ── Threshold Registry Constants ────────────────────────────────────────────
// From card Threshold Registry — no unregistered magic numbers.

/** Default quorum size: 5 nodes */
const DEFAULT_QUORUM_SIZE = 5;
/** Default quorum threshold: floor(5/2) + 1 = 3 */
const DEFAULT_QUORUM_THRESHOLD = 3;
/** Default checkpoint interval: 10000 ms */
const DEFAULT_CHECKPOINT_INTERVAL_MS = 10_000;
/** Default continuity gap limit: 100 ms */
const DEFAULT_CONTINUITY_GAP_MS = 100;
/** Default node failure threshold: 0.8 degradationLevel */
const DEFAULT_FAILURE_THRESHOLD = 0.8;
/** Default health monitor interval: 1000 ms */
const DEFAULT_HEALTH_MONITOR_INTERVAL_MS = 1000;

// ── Test Helpers ────────────────────────────────────────────────────────────

function makeHealthy(): HealthStatus {
  return { errorRate: 0, uptime_hours: 100, degradationLevel: 0 };
}

function makeDegraded(level: number): HealthStatus {
  return { errorRate: 10, uptime_hours: 50, degradationLevel: level };
}

function makeSnapshot(id: string, timestamp_ms: number): StateSnapshot {
  return {
    id,
    timestamp_ms,
    data: new Uint8Array([1, 2, 3]),
    checksum: "abc123",
  };
}

function makeConfig(overrides: Partial<ProcessContinuityConfig> = {}): ProcessContinuityConfig {
  return {
    quorumSize: DEFAULT_QUORUM_SIZE,
    checkpointInterval_ms: DEFAULT_CHECKPOINT_INTERVAL_MS,
    continuityGap_ms: DEFAULT_CONTINUITY_GAP_MS,
    failureThreshold: DEFAULT_FAILURE_THRESHOLD,
    healthMonitorInterval_ms: DEFAULT_HEALTH_MONITOR_INTERVAL_MS,
    ...overrides,
  };
}

/**
 * Creates a mock NodeRegistry with controllable node health.
 * healthMap: { nodeId -> HealthStatus }
 * failedSet: set of node IDs that have been marked failed
 */
function makeMockNodeRegistry(
  healthMap: Map<string, HealthStatus>,
  failureThreshold: number = DEFAULT_FAILURE_THRESHOLD,
): NodeRegistry {
  const failedSet = new Set<string>();

  return {
    allNodeIds(): string[] {
      return Array.from(healthMap.keys());
    },
    healthyNodeIds(): string[] {
      return Array.from(healthMap.keys()).filter(
        (id) => !failedSet.has(id) && healthMap.get(id)!.degradationLevel < failureThreshold,
      );
    },
    nodeHealth(nodeId: string): HealthStatus {
      const health = healthMap.get(nodeId);
      if (!health) {
        throw new Error(`Unknown node: ${nodeId}`);
      }
      return health;
    },
    markFailed(nodeId: string): void {
      failedSet.add(nodeId);
    },
    markRestored(nodeId: string): void {
      failedSet.delete(nodeId);
    },
  };
}

function makeMockCheckpointStore(): CheckpointStore & { savedSnapshots: StateSnapshot[] } {
  const savedSnapshots: StateSnapshot[] = [];
  return {
    savedSnapshots,
    save(snapshot: StateSnapshot): void {
      savedSnapshots.push(snapshot);
    },
    latest(): StateSnapshot | null {
      if (savedSnapshots.length === 0) return null;
      return savedSnapshots[savedSnapshots.length - 1];
    },
    allSince(timestamp_ms: number): StateSnapshot[] {
      return savedSnapshots
        .filter((s) => s.timestamp_ms >= timestamp_ms)
        .sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    },
  };
}

function makeMockClock(startTime: number = 0): Clock & { advance(ms: number): void; time: number } {
  let currentTime = startTime;
  return {
    get time() {
      return currentTime;
    },
    now(): number {
      return currentTime;
    },
    advance(ms: number): void {
      currentTime += ms;
    },
  };
}

// ── Scenario 1: Quorum Maintained Under 2-Node Failure ──────────────────────

describe("Scenario 1: Quorum maintained under 2-node failure", () => {
  it("maintains quorum with 3 of 5 nodes after 2 fail", () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // Verify initial state: all 5 healthy
    expect(manager.activeNodeCount()).toBe(5);
    expect(manager.quorumThreshold()).toBe(DEFAULT_QUORUM_THRESHOLD);
    expect(manager.processIntegrity().continuityScore).toBe(1.0);
    expect(manager.processIntegrity().nodeAgreement).toBe(1.0);
    expect(manager.degradationLevel()).toBe(0);

    // Fail 2 nodes simultaneously
    registry.markFailed("node-4");
    registry.markFailed("node-5");

    // After evaluateHealth picks up the changes
    // (evaluateHealth polls NodeRegistry)
    // We need to await since evaluateHealth is async
    manager.evaluateHealth().then(() => {
      expect(manager.activeNodeCount()).toBe(3);
      expect(manager.quorumThreshold()).toBe(3);
      expect(manager.processIntegrity().continuityScore).toBe(1.0);
      expect(manager.processIntegrity().nodeAgreement).toBeCloseTo(0.6);
      expect(manager.degradationLevel()).toBe(40);
    });
  });

  it("activeNodeCount reflects healthy node count after failure", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    registry.markFailed("node-4");
    registry.markFailed("node-5");
    await manager.evaluateHealth();

    expect(manager.activeNodeCount()).toBe(3);
  });
});

// ── Scenario 2: Quorum Lost on 3-Node Failure ──────────────────────────────

describe("Scenario 2: Quorum lost on 3-node failure", () => {
  it("loses quorum when 3 of 5 nodes fail", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // Fail 3 nodes
    registry.markFailed("node-3");
    registry.markFailed("node-4");
    registry.markFailed("node-5");
    await manager.evaluateHealth();

    expect(manager.activeNodeCount()).toBe(2);
    expect(manager.processIntegrity().continuityScore).toBe(0.0);
    expect(manager.degradationLevel()).toBe(60);
  });
});

// ── Scenario 3: Live Migration on Node Degradation ──────────────────────────

describe("Scenario 3: Live migration on node degradation", () => {
  it("triggers migration when a node exceeds failure threshold", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(1000);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // Save a checkpoint so migration has something to restore from
    manager.checkpoint();

    // Node A degrades beyond threshold
    healthMap.set("node-1", makeDegraded(0.85));
    await manager.evaluateHealth();

    // Node-1 should have been migrated away from (marked failed)
    // activeNodeCount decreases by 1 (the degraded node is removed)
    expect(manager.activeNodeCount()).toBe(4);
  });

  it("migration completes within continuity gap limit", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(1000);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);
    manager.checkpoint();

    const result = await manager.migrateProcess("node-1", "node-2");
    expect(result.success).toBe(true);
    expect(result.duration_ms).toBeLessThan(DEFAULT_CONTINUITY_GAP_MS);
    expect(result.stateLoss).toBe(false);
  });

  it("migrateProcess removes source node from active set", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(1000);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);
    manager.checkpoint();

    const result = await manager.migrateProcess("node-1", "node-2");
    expect(result.success).toBe(true);
    expect(result.fromNodeId).toBe("node-1");
    expect(result.toNodeId).toBe("node-2");

    await manager.evaluateHealth();
    // node-1 was migrated away from — should be marked failed
    expect(manager.activeNodeCount()).toBe(4);
  });
});

// ── Scenario 4: Periodic Checkpointing ──────────────────────────────────────

describe("Scenario 4: Periodic checkpointing", () => {
  it("triggers checkpoint when checkpointInterval_ms elapses", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig({ checkpointInterval_ms: DEFAULT_CHECKPOINT_INTERVAL_MS });

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // Advance clock past checkpoint interval
    clock.advance(DEFAULT_CHECKPOINT_INTERVAL_MS);
    await manager.evaluateHealth();

    // A checkpoint should have been saved
    expect(store.savedSnapshots.length).toBeGreaterThanOrEqual(1);
    expect(manager.processIntegrity().lastCheckpoint_ms).toBe(DEFAULT_CHECKPOINT_INTERVAL_MS);
  });

  it("does not checkpoint before interval elapses", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // Advance clock by less than checkpoint interval
    clock.advance(DEFAULT_CHECKPOINT_INTERVAL_MS - 1);
    await manager.evaluateHealth();

    // No automatic checkpoint should have been saved
    expect(store.savedSnapshots.length).toBe(0);
  });
});

// ── Scenario 5: Graceful Proportional Degradation ───────────────────────────

describe("Scenario 5: Graceful proportional degradation", () => {
  it("1-node failure yields 20% degradation with continuity maintained", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    registry.markFailed("node-5");
    await manager.evaluateHealth();

    expect(manager.degradationLevel()).toBe(20);
    expect(manager.processIntegrity().continuityScore).toBe(1.0);
  });

  it("2-node failure yields 40% degradation with continuity maintained", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    registry.markFailed("node-4");
    registry.markFailed("node-5");
    await manager.evaluateHealth();

    expect(manager.degradationLevel()).toBe(40);
    expect(manager.processIntegrity().continuityScore).toBe(1.0);
  });
});

// ── Scenario 6: Node Recovery and Rebalancing ───────────────────────────────

describe("Scenario 6: Node recovery and rebalancing", () => {
  it("restoreNode increases activeNodeCount and decreases degradation", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // Fail 2 nodes
    registry.markFailed("node-4");
    registry.markFailed("node-5");
    await manager.evaluateHealth();

    expect(manager.activeNodeCount()).toBe(3);
    expect(manager.degradationLevel()).toBe(40);
    expect(manager.processIntegrity().nodeAgreement).toBeCloseTo(0.6);

    // Restore 1 node
    manager.restoreNode("node-4");
    await manager.evaluateHealth();

    expect(manager.activeNodeCount()).toBe(4);
    expect(manager.degradationLevel()).toBe(20);
    expect(manager.processIntegrity().nodeAgreement).toBeCloseTo(0.8);
  });
});

// ── Scenario 7: Constructor Precondition Guards ─────────────────────────────

describe("Scenario 7: Constructor precondition guards", () => {
  let registry: NodeRegistry;
  let store: CheckpointStore;
  let clock: Clock;

  beforeEach(() => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
    ]);
    registry = makeMockNodeRegistry(healthMap);
    store = makeMockCheckpointStore();
    clock = makeMockClock(0);
  });

  it("throws on even quorumSize", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ quorumSize: 4 })),
    ).toThrow();
  });

  it("throws on quorumSize < 3", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ quorumSize: 1 })),
    ).toThrow();
  });

  it("throws on checkpointInterval_ms <= 0", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ checkpointInterval_ms: 0 })),
    ).toThrow();
  });

  it("throws on checkpointInterval_ms > 60000", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ checkpointInterval_ms: 60001 })),
    ).toThrow();
  });

  it("throws on continuityGap_ms <= 0", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ continuityGap_ms: 0 })),
    ).toThrow();
  });

  it("throws on failureThreshold <= 0", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ failureThreshold: 0 })),
    ).toThrow();
  });

  it("throws on failureThreshold >= 1", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ failureThreshold: 1 })),
    ).toThrow();
  });

  it("throws on healthMonitorInterval_ms <= 0", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ healthMonitorInterval_ms: 0 })),
    ).toThrow();
  });

  it("throws when nodeRegistry is null", () => {
    expect(
      () => new ConsciousProcessManagerImpl(null as any, store, clock, makeConfig()),
    ).toThrow();
  });

  it("throws when checkpointStore is null", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, null as any, clock, makeConfig()),
    ).toThrow();
  });

  it("throws when clock is null", () => {
    expect(
      () => new ConsciousProcessManagerImpl(registry, store, null as any, makeConfig()),
    ).toThrow();
  });
});

// ── Contract Invariants ─────────────────────────────────────────────────────

describe("Contract invariants", () => {
  it("degradationLevel formula: (1 - activeNodeCount/quorumSize) * 100 clamped [0, 100]", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // 5/5 active → 0%
    expect(manager.degradationLevel()).toBe(0);

    // 4/5 active → 20%
    registry.markFailed("node-5");
    await manager.evaluateHealth();
    expect(manager.degradationLevel()).toBe(20);

    // 3/5 active → 40%
    registry.markFailed("node-4");
    await manager.evaluateHealth();
    expect(manager.degradationLevel()).toBe(40);

    // 2/5 active → 60%
    registry.markFailed("node-3");
    await manager.evaluateHealth();
    expect(manager.degradationLevel()).toBe(60);
  });

  it("processIntegrity.nodeAgreement = activeNodeCount / quorumSize", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);
    expect(manager.processIntegrity().nodeAgreement).toBe(1.0);

    registry.markFailed("node-5");
    await manager.evaluateHealth();
    expect(manager.processIntegrity().nodeAgreement).toBeCloseTo(0.8);
  });

  it("continuityScore is 1.0 when quorum maintained, 0.0 when lost", async () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);

    // 2 failures: 3 active ≥ 3 quorum → score 1.0
    registry.markFailed("node-4");
    registry.markFailed("node-5");
    await manager.evaluateHealth();
    expect(manager.processIntegrity().continuityScore).toBe(1.0);

    // 3 failures: 2 active < 3 quorum → score 0.0
    registry.markFailed("node-3");
    await manager.evaluateHealth();
    expect(manager.processIntegrity().continuityScore).toBe(0.0);
  });

  it("checkpoint() stores snapshot and updates lastCheckpoint_ms", () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(5000);
    const config = makeConfig();

    const manager = new ConsciousProcessManagerImpl(registry, store, clock, config);
    const snapshot = manager.checkpoint();

    expect(snapshot.timestamp_ms).toBe(5000);
    expect(store.savedSnapshots.length).toBe(1);
    expect(manager.processIntegrity().lastCheckpoint_ms).toBe(5000);
  });

  it("quorumThreshold returns floor(quorumSize/2) + 1", () => {
    const healthMap = new Map<string, HealthStatus>([
      ["node-1", makeHealthy()],
      ["node-2", makeHealthy()],
      ["node-3", makeHealthy()],
      ["node-4", makeHealthy()],
      ["node-5", makeHealthy()],
    ]);
    const registry = makeMockNodeRegistry(healthMap);
    const store = makeMockCheckpointStore();
    const clock = makeMockClock(0);

    // quorumSize=5 → threshold=3
    const manager5 = new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ quorumSize: 5 }));
    expect(manager5.quorumThreshold()).toBe(3);

    // quorumSize=7 → threshold=4
    const manager7 = new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ quorumSize: 7 }));
    expect(manager7.quorumThreshold()).toBe(4);

    // quorumSize=3 → threshold=2
    const manager3 = new ConsciousProcessManagerImpl(registry, store, clock, makeConfig({ quorumSize: 3 }));
    expect(manager3.quorumThreshold()).toBe(2);
  });
});
