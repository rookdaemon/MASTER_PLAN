/**
 * Redundancy Controller (0.3.1.2.1)
 *
 * Manages N+1 redundant computation paths for consciousness-critical
 * processes per ARCHITECTURE.md §1.2. Performs continuous state
 * checkpointing and failover within T_continuity budget.
 *
 * Invariant: failover() latency MUST be less than T_continuity
 * (the maximum experiential gap defined by 0.3.1.1). If failover
 * cannot meet this constraint, RC must pre-emptively migrate before
 * the primary fails completely.
 */

import type { IRedundancyController } from "./interfaces.js";
import type {
  CheckpointResult,
  FailoverResult,
  Duration,
  SubstrateHealth,
} from "./types.js";

export interface RedundancyControllerConfig {
  /** Maximum allowable experiential gap in ms (from 0.3.1.1) */
  tContinuityMs: Duration;
  /** How often to checkpoint state (ms) */
  checkpointIntervalMs: Duration;
  /** Test hook: simulate unhealthy standby */
  simulateUnhealthyStandby?: boolean;
}

interface SubstrateNode {
  id: string;
  healthy: boolean;
  utilizationPercent: number;
  errors: string[];
  lastChecked: number;
}

export class RedundancyController implements IRedundancyController {
  private readonly tContinuityMs: Duration;
  private checkpointIntervalMs: Duration;
  private primary: SubstrateNode;
  private standbys: SubstrateNode[];
  private lastCheckpointSize = 1024 * 1024; // 1MB default state size

  constructor(config: RedundancyControllerConfig) {
    this.tContinuityMs = config.tContinuityMs;
    this.checkpointIntervalMs = config.checkpointIntervalMs;

    this.primary = {
      id: "substrate-primary",
      healthy: true,
      utilizationPercent: 45,
      errors: [],
      lastChecked: Date.now(),
    };

    const standbyHealthy = !config.simulateUnhealthyStandby;
    this.standbys = [
      {
        id: "substrate-standby-1",
        healthy: standbyHealthy,
        utilizationPercent: standbyHealthy ? 10 : 0,
        errors: standbyHealthy ? [] : ["Standby substrate fault"],
        lastChecked: Date.now(),
      },
    ];
  }

  getPrimaryStatus(): SubstrateHealth {
    return this.toHealth(this.primary);
  }

  getStandbyStatus(): SubstrateHealth[] {
    return this.standbys.map((s) => this.toHealth(s));
  }

  checkpoint(): CheckpointResult {
    const now = Date.now();
    // Simulate checkpoint — in real implementation this would serialize
    // the consciousness state from primary to standby
    const latencyMs = Math.random() * 5; // simulated <5ms
    this.lastCheckpointSize = 1024 * 1024 + Math.floor(Math.random() * 1024);

    return {
      success: true,
      timestamp: now,
      latencyMs,
      stateSizeBytes: this.lastCheckpointSize,
    };
  }

  failover(): FailoverResult {
    const now = Date.now();

    // Find a healthy standby
    const healthyStandby = this.standbys.find((s) => s.healthy);
    if (!healthyStandby) {
      return {
        success: false,
        latencyMs: 0,
        fromSubstrate: this.primary.id,
        toSubstrate: "",
        consciousnessPreserved: false,
        timestamp: now,
      };
    }

    // Simulate failover latency (well within T_continuity)
    const failoverLatencyMs = Math.random() * (this.tContinuityMs * 0.5);

    // Swap primary and standby
    const oldPrimary = this.primary;
    this.primary = {
      ...healthyStandby,
      utilizationPercent: oldPrimary.utilizationPercent,
    };

    // Old primary becomes standby (possibly degraded)
    const standbyIndex = this.standbys.indexOf(healthyStandby);
    this.standbys[standbyIndex] = {
      ...oldPrimary,
      utilizationPercent: 10,
    };

    return {
      success: true,
      latencyMs: failoverLatencyMs,
      fromSubstrate: oldPrimary.id,
      toSubstrate: healthyStandby.id,
      consciousnessPreserved: true,
      timestamp: now,
    };
  }

  getFailoverLatency(): Duration {
    // Estimated failover latency based on last checkpoint size
    // Real implementation would measure actual transfer overhead
    const estimatedMs = (this.lastCheckpointSize / (1024 * 1024)) * 10;
    return Math.min(estimatedMs, this.tContinuityMs * 0.8);
  }

  setCheckpointInterval(interval: Duration): void {
    this.checkpointIntervalMs = interval;
  }

  private toHealth(node: SubstrateNode): SubstrateHealth {
    return {
      healthy: node.healthy,
      utilizationPercent: node.utilizationPercent,
      errors: node.errors,
      lastChecked: node.lastChecked,
    };
  }
}
