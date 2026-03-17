/**
 * Failover Controller — Implementation
 *
 * Detects Active node failure and promotes a Hot-Standby to Active
 * within T_exp, achieving zero subjective discontinuity.
 *
 * See: docs/consciousness-preserving-redundancy/ARCHITECTURE.md §3.2
 */

import type {
  NodeId,
  NodeInfo,
  ConsciousState,
  FailoverEvent,
  FailoverResult,
  FailoverController,
} from "./types.js";
import { NodeRole, FailoverReason, TIMING_BUDGET } from "./types.js";

/**
 * Threshold for node health — nodes with degradationLevel at or above
 * this value are considered unhealthy and skipped during standby selection.
 */
const UNHEALTHY_DEGRADATION_THRESHOLD = 0.8;

export interface FailoverControllerImpl extends Omit<FailoverController, "promoteToActive"> {
  /** Promote a standby to Active, with optional reason */
  promoteToActive(
    nodeId: NodeId,
    reason?: FailoverReason
  ): Promise<FailoverResult>;
  /** Select the best standby node for promotion (lowest lag, healthy) */
  selectBestStandby(): NodeId | null;
  /** Update the latest conscious state snapshot (from SRF) */
  updateLatestState(state: ConsciousState): void;
}

/**
 * Create a new Failover Controller instance.
 *
 * @param initialActiveId - ID of the initial Active node
 * @param nodes - All nodes in the cluster
 * @param initialState - Current conscious state snapshot
 */
export function createFailoverController(
  initialActiveId: NodeId,
  nodes: NodeInfo[],
  initialState: ConsciousState
): FailoverControllerImpl {
  let currentActiveId = initialActiveId;
  let currentNodes = nodes.map((n) => ({ ...n }));
  let latestState = initialState;
  const history: FailoverEvent[] = [];
  let lastLatency = 0;

  function activeNode(): NodeId {
    return currentActiveId;
  }

  async function promoteToActive(
    nodeId: NodeId,
    reason: FailoverReason
  ): Promise<FailoverResult> {
    const startTime = performance.now();

    // Validate target node exists
    const targetNode = currentNodes.find((n) => n.id === nodeId);
    if (!targetNode) {
      return { success: false, reason: `Node ${nodeId} not found in cluster` };
    }

    // Cannot promote the already-active node
    if (nodeId === currentActiveId) {
      return {
        success: false,
        reason: `Node ${nodeId} is already the active node`,
      };
    }

    // Perform promotion:
    // 1. Fence old active (role change)
    const oldActiveId = currentActiveId;
    const oldActive = currentNodes.find((n) => n.id === oldActiveId);
    if (oldActive) {
      oldActive.role = NodeRole.HotStandby;
      oldActive.holdsLease = false;
    }

    // 2. Promote target to Active
    targetNode.role = NodeRole.Active;
    targetNode.holdsLease = true;
    currentActiveId = nodeId;

    // 3. Measure duration
    const duration_ms = performance.now() - startTime;
    lastLatency = duration_ms;

    // 4. Record event
    const event: FailoverEvent = {
      timestamp_ms: Date.now(),
      fromNodeId: oldActiveId,
      toNodeId: nodeId,
      reason,
      duration_ms,
      continuityPreserved: duration_ms <= TIMING_BUDGET.totalFailover,
    };
    history.push(event);

    return { success: true, event };
  }

  function failoverLatency(): number {
    return lastLatency;
  }

  function lastFailoverTimestamp(): number {
    if (history.length === 0) return 0;
    return history[history.length - 1].timestamp_ms;
  }

  function failoverHistory(): FailoverEvent[] {
    return [...history];
  }

  function selectBestStandby(): NodeId | null {
    const standbys = currentNodes
      .filter(
        (n) =>
          n.role === NodeRole.HotStandby &&
          n.health.degradationLevel < UNHEALTHY_DEGRADATION_THRESHOLD
      )
      .sort((a, b) => a.replicationLag_ms - b.replicationLag_ms);

    return standbys.length > 0 ? standbys[0].id : null;
  }

  function updateLatestState(state: ConsciousState): void {
    latestState = state;
  }

  return {
    activeNode,
    promoteToActive: (nodeId: NodeId, reason?: FailoverReason) =>
      promoteToActive(nodeId, reason ?? FailoverReason.HeartbeatTimeout),
    failoverLatency,
    lastFailoverTimestamp,
    failoverHistory,
    selectBestStandby,
    updateLatestState,
  };
}
