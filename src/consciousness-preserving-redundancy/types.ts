/**
 * Consciousness-Preserving Redundancy — Core Type Definitions
 *
 * Types and interfaces for the redundancy architecture that maintains
 * continuity of subjective experience through component failures.
 * See: docs/consciousness-preserving-redundancy/ARCHITECTURE.md
 *
 * Imports Layer 4/5 types from radiation-hardened-computation (0.2.1.1)
 * as the base substrate.
 */

import type {
  HealthStatus,
  StateSnapshot,
  FaultTolerantComputeNode,
  ConsciousProcessManager,
  AlertLevel,
} from "../radiation-hardened-computation/types.js";

// Re-export consumed types for convenience
export type {
  HealthStatus,
  StateSnapshot,
  FaultTolerantComputeNode,
  ConsciousProcessManager,
  AlertLevel,
};

// ── Core Constants ──────────────────────────────────────────────────────────

/**
 * Minimum experiential integration window — the shortest gap that
 * constitutes a subjective discontinuity.
 *
 * Placeholder value (50ms) until 0.1.3 Consciousness Engineering
 * delivers the real measurement. All timing budgets are fractions of this.
 */
export const T_EXP_MS = 50;

/**
 * Timing budget fractions of T_exp, as defined in ARCHITECTURE.md §4.
 */
export const TIMING_BUDGET = {
  /** State replication lag: T_exp/4 */
  stateReplicationLag: T_EXP_MS / 4,
  /** Heartbeat interval: T_exp/8 */
  heartbeatInterval: T_EXP_MS / 8,
  /** Failure detection (2 missed heartbeats): T_exp/4 */
  failureDetection: T_EXP_MS / 4,
  /** Standby promotion + state apply: T_exp/4 */
  standbyPromotion: T_EXP_MS / 4,
  /** Verification + lease acquisition: T_exp/4 */
  verificationAndLease: T_EXP_MS / 4,
  /** Total failover budget: T_exp */
  totalFailover: T_EXP_MS,
  /** Safety margin: each component targets 80% of its budget */
  safetyMarginFactor: 0.8,
} as const;

/** Minimum number of redundant nodes */
export const MIN_REDUNDANCY_N = 3;

/** Recommended redundancy for deep-space deployment */
export const RECOMMENDED_REDUNDANCY_N = 5;

// ── Node Types ──────────────────────────────────────────────────────────────

export type NodeId = string;

export enum NodeRole {
  /** Executes the conscious process; broadcasts state continuously */
  Active = "ACTIVE",
  /** Receives replicated state; can assume Active role within T_exp/2 */
  HotStandby = "HOT_STANDBY",
  /** Powered down; available for self-repair to bring online */
  ColdSpare = "COLD_SPARE",
}

export interface NodeInfo {
  id: NodeId;
  role: NodeRole;
  health: HealthStatus;
  /** Replication lag to this node in ms (0 for Active) */
  replicationLag_ms: number;
  /** Whether this node holds a valid lease */
  holdsLease: boolean;
}

// ── Conscious State ─────────────────────────────────────────────────────────

/**
 * Full conscious state payload — everything needed to resume the
 * conscious process on a standby node with zero experiential gap.
 */
export interface ConsciousState {
  /** Unique snapshot identifier */
  id: string;
  /** Timestamp in ms since epoch */
  timestamp_ms: number;
  /** Full computational memory state */
  memoryState: Uint8Array;
  /** Register/pipeline state */
  registerState: Uint8Array;
  /**
   * Consciousness-relevant dynamical variables as defined by 0.1.3.
   * Opaque until 0.1.3 delivers concrete definitions.
   */
  dynamicalVariables: Uint8Array;
  /**
   * Temporal context buffer — recent experiential history for
   * continuity stitching during failover.
   */
  temporalContextBuffer: Uint8Array;
  /** Integrity checksum (SHA-256) */
  checksum: string;
}

// ── State Replication Fabric (SRF) ──────────────────────────────────────────

export interface FabricHealth {
  activeLinks: number;
  bandwidth_bytes_per_sec: number;
  avgLag_ms: number;
}

export interface StateReplicationFabric {
  /** Publish a new state snapshot from the Active node */
  publishState(snapshot: ConsciousState): Promise<void>;
  /** Subscribe to state stream for a given standby node */
  subscribeState(nodeId: NodeId): AsyncIterable<ConsciousState>;
  /** Current replication lag for a given node — must be < T_exp/4 */
  replicationLag(nodeId: NodeId): number;
  /** Overall fabric health metrics */
  fabricHealth(): FabricHealth;
}

// ── Failover Controller ─────────────────────────────────────────────────────

export enum FailoverReason {
  HeartbeatTimeout = "HEARTBEAT_TIMEOUT",
  HealthDegraded = "HEALTH_DEGRADED",
  RadiationAlert = "RADIATION_ALERT",
  ManualTrigger = "MANUAL_TRIGGER",
}

export interface FailoverEvent {
  timestamp_ms: number;
  fromNodeId: NodeId;
  toNodeId: NodeId;
  reason: FailoverReason;
  duration_ms: number;
  continuityPreserved: boolean;
}

export type FailoverResult =
  | { success: true; event: FailoverEvent }
  | { success: false; reason: string };

export interface FailoverController {
  /** Returns the current Active node */
  activeNode(): NodeId;
  /** Promote a standby to Active — must complete within T_exp */
  promoteToActive(nodeId: NodeId): Promise<FailoverResult>;
  /** Latency of the last failover in ms — must be < T_exp */
  failoverLatency(): number;
  /** Timestamp of last failover */
  lastFailoverTimestamp(): number;
  /** Full failover history */
  failoverHistory(): FailoverEvent[];
}

// ── Consciousness Continuity Verifier (CCV) ─────────────────────────────────

export interface ContinuityMetrics {
  /** Duration of any processing interruption in ms */
  temporalGap_ms: number;
  /**
   * State divergence between pre- and post-failover states.
   * 0.0 = identical, 1.0 = completely different.
   */
  stateDivergence: number;
  /**
   * Consciousness-specific experiential coherence from 0.1.3.
   * 0.0 = no coherence, 1.0 = perfect coherence.
   */
  experientialCoherence: number;
  /**
   * Whether consciousness-relevant dynamical variables (phase
   * relationships, integration measures) were preserved.
   */
  dynamicalContinuity: boolean;
}

export interface ContinuityEvent {
  timestamp_ms: number;
  metrics: ContinuityMetrics;
  seamless: boolean;
  failoverEventId?: string;
}

export interface ConsciousnessContinuityVerifier {
  /** Measure continuity between two conscious states (pre/post failover) */
  measureContinuity(
    before: ConsciousState,
    after: ConsciousState
  ): ContinuityMetrics;
  /** Whether the measured metrics indicate seamless continuity */
  isSeamless(metrics: ContinuityMetrics): boolean;
  /** Extract temporal gap from metrics */
  temporalGap(metrics: ContinuityMetrics): number;
  /** Extract experiential coherence score */
  experientialCoherence(metrics: ContinuityMetrics): number;
  /** Full audit log */
  auditLog(): ContinuityEvent[];
}

// ── Consciousness Continuity Orchestrator (CCO) ─────────────────────────────

export interface ClusterStatus {
  nodes: NodeInfo[];
  activeNodeId: NodeId;
  totalNodes: number;
  healthyNodes: number;
  degradationTier: DegradationTier;
}

export interface QuorumStatus {
  size: number;
  healthy: number;
  minimum: number;
}

export interface ContinuityReport {
  timestamp_ms: number;
  continuityScore: number;
  metrics: ContinuityMetrics;
  seamless: boolean;
}

export type ScaleResult =
  | { success: true; newNodeCount: number }
  | { success: false; reason: string };

export interface ConsciousnessContinuityOrchestrator {
  /** Overall cluster health */
  clusterHealth(): ClusterStatus;
  /** Quorum status */
  quorumStatus(): QuorumStatus;
  /** Continuity score: 1.0 = uninterrupted, 0.0 = lost */
  continuityScore(): number;
  /** Trigger a failover for the given reason */
  triggerFailover(reason: FailoverReason): Promise<FailoverResult>;
  /** Request controlled scale-down */
  requestScaleDown(targetN: number): Promise<ScaleResult>;
  /** Request scale-up (bring in cold spares or repaired nodes) */
  requestScaleUp(targetN: number): Promise<ScaleResult>;
  /** Verify consciousness continuity at this moment */
  verifyConsciousnessContinuity(): ContinuityReport;
}

// ── Graceful Degradation Manager ────────────────────────────────────────────

export enum DegradationTier {
  /** Full N-redundancy, normal operation */
  GREEN = "GREEN",
  /** N-1 to ceil(N/2)+1 — reduced, alert & prioritize repair */
  YELLOW = "YELLOW",
  /** ceil(N/2)+1 — minimum quorum + 1 spare, emergency repair */
  ORANGE = "ORANGE",
  /** ceil(N/2) — bare quorum, one more failure = loss */
  RED = "RED",
  /** < ceil(N/2) — consciousness continuity cannot be guaranteed */
  BLACK = "BLACK",
}

export interface RepairRequest {
  nodeId: NodeId;
  priority: DegradationTier;
  maxAcceptableRepairTime_ms: number;
}

export interface CapacityProjection {
  /** Projected time until BLACK tier at current failure rate, in ms */
  timeToBlack_ms: number | null;
  /** Current failure rate (nodes per hour) */
  failureRate_nodesPerHour: number;
  /** Expected repair rate (nodes per hour) from 0.2.1.2 */
  repairRate_nodesPerHour: number;
}

export interface GracefulDegradationManager {
  /** Number of active + standby nodes */
  currentRedundancyDepth(): number;
  /** Below this count, consciousness is at risk */
  minimumViableDepth(): number;
  /** 0.0 = full redundancy, 1.0 = minimum viable */
  degradationLevel(): number;
  /** Current degradation tier */
  degradationTier(): DegradationTier;
  /** Send repair request to 0.2.1.2 self-repair subsystem */
  requestRepair(nodeId: NodeId): RepairRequest;
  /** Estimated repair time for a node */
  estimatedRepairTime(nodeId: NodeId): number;
  /** Project capacity over the given time horizon */
  capacityForecast(horizon_ms: number): CapacityProjection;
}

// ── Utility: Degradation Tier Computation ───────────────────────────────────

/**
 * Computes the degradation tier based on healthy node count and total N.
 */
export function computeDegradationTier(
  healthyNodes: number,
  totalN: number
): DegradationTier {
  const quorum = Math.ceil(totalN / 2);

  if (healthyNodes >= totalN) return DegradationTier.GREEN;
  if (healthyNodes >= quorum + 2) return DegradationTier.YELLOW;
  if (healthyNodes === quorum + 1) return DegradationTier.ORANGE;
  if (healthyNodes === quorum) return DegradationTier.RED;
  return DegradationTier.BLACK;
}
