/**
 * Conscious Process Manager — Implementation
 *
 * Layer 5: Radiation-Tolerant Process Continuity
 *
 * Maintains subjective experience continuity under node failures via
 * simple majority voting quorum consensus, checkpoint-restore migration,
 * and separated injectable abstractions (NodeRegistry, CheckpointStore, Clock).
 *
 * See: plan/0.2.1.1.3-radiation-tolerant-process-continuity.md
 */

import type {
  NodeRegistry,
  CheckpointStore,
  Clock,
  ProcessContinuityConfig,
  ConsciousProcessManager,
  ProcessIntegrity,
  MigrationResult,
  StateSnapshot,
} from "./types.js";

// ── Threshold Registry Constants ────────────────────────────────────────────
// From card Threshold Registry — no unregistered magic numbers.

/** Minimum quorum size allowed */
const MIN_QUORUM_SIZE = 3;
/** Maximum checkpoint interval in ms */
const MAX_CHECKPOINT_INTERVAL_MS = 60_000;
/** Maximum degradation level percentage */
const MAX_DEGRADATION_LEVEL = 100;
/** Minimum degradation level percentage */
const MIN_DEGRADATION_LEVEL = 0;

export class ConsciousProcessManagerImpl implements ConsciousProcessManager {
  private readonly nodeRegistry: NodeRegistry;
  private readonly checkpointStore: CheckpointStore;
  private readonly clock: Clock;
  private readonly config: ProcessContinuityConfig;
  private readonly _quorumThreshold: number;

  private _activeNodeCount: number;
  private _lastCheckpoint_ms: number;

  constructor(
    nodeRegistry: NodeRegistry,
    checkpointStore: CheckpointStore,
    clock: Clock,
    config: ProcessContinuityConfig,
  ) {
    // ── Constructor Precondition Guards ────────────────────────────────────
    if (!nodeRegistry) {
      throw new Error("nodeRegistry must be provided (non-null)");
    }
    if (!checkpointStore) {
      throw new Error("checkpointStore must be provided (non-null)");
    }
    if (!clock) {
      throw new Error("clock must be provided (non-null)");
    }
    if (config.quorumSize < MIN_QUORUM_SIZE) {
      throw new Error(`quorumSize must be >= ${MIN_QUORUM_SIZE}, got ${config.quorumSize}`);
    }
    if (config.quorumSize % 2 === 0) {
      throw new Error(`quorumSize must be odd, got ${config.quorumSize}`);
    }
    if (config.checkpointInterval_ms <= 0) {
      throw new Error(`checkpointInterval_ms must be > 0, got ${config.checkpointInterval_ms}`);
    }
    if (config.checkpointInterval_ms > MAX_CHECKPOINT_INTERVAL_MS) {
      throw new Error(
        `checkpointInterval_ms must be <= ${MAX_CHECKPOINT_INTERVAL_MS}, got ${config.checkpointInterval_ms}`,
      );
    }
    if (config.continuityGap_ms <= 0) {
      throw new Error(`continuityGap_ms must be > 0, got ${config.continuityGap_ms}`);
    }
    if (config.failureThreshold <= 0 || config.failureThreshold >= 1) {
      throw new Error(
        `failureThreshold must be in (0, 1), got ${config.failureThreshold}`,
      );
    }
    if (config.healthMonitorInterval_ms <= 0) {
      throw new Error(
        `healthMonitorInterval_ms must be > 0, got ${config.healthMonitorInterval_ms}`,
      );
    }

    this.nodeRegistry = nodeRegistry;
    this.checkpointStore = checkpointStore;
    this.clock = clock;
    this.config = config;

    // quorumThreshold = floor(quorumSize / 2) + 1
    this._quorumThreshold = Math.floor(config.quorumSize / 2) + 1;

    // Initialize active node count from registry
    this._activeNodeCount = nodeRegistry.healthyNodeIds().length;

    // No checkpoint yet
    this._lastCheckpoint_ms = 0;
  }

  activeNodeCount(): number {
    return this._activeNodeCount;
  }

  quorumThreshold(): number {
    return this._quorumThreshold;
  }

  degradationLevel(): number {
    const raw = (1 - this._activeNodeCount / this.config.quorumSize) * 100;
    return Math.min(MAX_DEGRADATION_LEVEL, Math.max(MIN_DEGRADATION_LEVEL, Math.round(raw)));
  }

  processIntegrity(): ProcessIntegrity {
    const nodeAgreement = this._activeNodeCount / this.config.quorumSize;
    const continuityScore = this._activeNodeCount >= this._quorumThreshold ? 1.0 : 0.0;

    return {
      continuityScore,
      lastCheckpoint_ms: this._lastCheckpoint_ms,
      nodeAgreement,
    };
  }

  checkpoint(): StateSnapshot {
    const now = this.clock.now();
    const snapshot: StateSnapshot = {
      id: `checkpoint-${now}`,
      timestamp_ms: now,
      data: new Uint8Array([]),
      checksum: `sha256-${now}`,
    };

    this.checkpointStore.save(snapshot);
    this._lastCheckpoint_ms = now;

    return snapshot;
  }

  async evaluateHealth(): Promise<void> {
    // Poll node registry for current healthy nodes
    const healthyNodes = this.nodeRegistry.healthyNodeIds();
    this._activeNodeCount = healthyNodes.length;

    // Check for nodes exceeding failure threshold — trigger migration
    for (const nodeId of healthyNodes) {
      const health = this.nodeRegistry.nodeHealth(nodeId);
      if (health.degradationLevel >= this.config.failureThreshold) {
        // Find a healthy target node (one that isn't degrading)
        const targetNode = healthyNodes.find((id) => {
          if (id === nodeId) return false;
          const targetHealth = this.nodeRegistry.nodeHealth(id);
          return targetHealth.degradationLevel < this.config.failureThreshold;
        });

        if (targetNode) {
          await this.migrateProcess(nodeId, targetNode);
        }
      }
    }

    // Re-poll after migrations
    this._activeNodeCount = this.nodeRegistry.healthyNodeIds().length;

    // Periodic checkpointing: if enough time has elapsed since last checkpoint
    const now = this.clock.now();
    if (now - this._lastCheckpoint_ms >= this.config.checkpointInterval_ms) {
      this.checkpoint();
    }
  }

  async migrateProcess(fromNodeId: string, toNodeId: string): Promise<MigrationResult> {
    const startTime = this.clock.now();

    // Checkpoint-restore migration: restore latest checkpoint on target
    const latestCheckpoint = this.checkpointStore.latest();

    if (latestCheckpoint) {
      // Restore checkpoint on target (simulated — the checkpoint data is available)
      // In production this would invoke FaultTolerantComputeNode.restore() on target
    }

    // Mark source node as failed
    this.nodeRegistry.markFailed(fromNodeId);

    const endTime = this.clock.now();
    const duration_ms = endTime - startTime;

    return {
      success: true,
      fromNodeId,
      toNodeId,
      duration_ms,
      stateLoss: latestCheckpoint === null,
    };
  }

  restoreNode(nodeId: string): void {
    this.nodeRegistry.markRestored(nodeId);
    // Immediately update active count to reflect restoration
    this._activeNodeCount = this.nodeRegistry.healthyNodeIds().length;
  }
}
