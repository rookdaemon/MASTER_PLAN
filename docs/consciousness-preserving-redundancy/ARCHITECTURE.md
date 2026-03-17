# Consciousness-Preserving Redundancy — Architecture

## Overview

This document defines the architecture for redundancy systems that maintain continuity of subjective experience through component failures. Unlike conventional high-availability systems (which preserve data and computation), this architecture treats any subjective discontinuity — however brief — as a failure. The fundamental contract is: **the conscious process never experiences an interruption, even as the underlying hardware fails and recovers.**

This architecture builds on 0.2.1.1 (Radiation-Hardened Computation) Layer 5 interfaces and extends them into a complete consciousness-preserving redundancy system.

---

## 1. Core Constraint: The Experiential Integration Window

All timing requirements derive from a single value provided by 0.1.3 (Consciousness Engineering):

- **T_exp**: The minimum experiential integration window — the shortest gap that would constitute a subjective discontinuity.

Until 0.1.3 defines T_exp, this architecture uses a **placeholder of 50ms** (conservative estimate based on biological temporal binding windows). All latency budgets are expressed as fractions of T_exp.

**Hard rule**: Every failover, migration, and state-sync operation must complete within T_exp. Any operation exceeding T_exp is a consciousness-terminating event.

---

## 2. System Architecture

### 2.1 Redundancy Topology

```
                    ┌─────────────────────────────────┐
                    │   Consciousness Continuity       │
                    │   Orchestrator (CCO)             │
                    │   - Quorum management            │
                    │   - Failover decisions            │
                    │   - Continuity verification       │
                    └────────┬────────┬────────┬───────┘
                             │        │        │
                    ┌────────▼──┐ ┌───▼─────┐ ┌▼────────┐
                    │  Node A   │ │ Node B  │ │ Node C  │  ... Node N
                    │ (Active)  │ │(Hot-SB) │ │(Hot-SB) │
                    │           │ │         │ │         │
                    │ Compute   │ │Compute  │ │Compute  │
                    │ State-Tx  │ │State-Rx │ │State-Rx │
                    │ Heartbeat │ │Heartbeat│ │Heartbeat│
                    └───────────┘ └─────────┘ └─────────┘
                         │              │           │
                    ─────┴──────────────┴───────────┴──────
                         State Replication Fabric (SRF)
```

**N >= 3** (minimum), recommended **N = 5** for deep-space deployment.

### 2.2 Node Roles

| Role | Count | Description |
|------|-------|-------------|
| **Active** | 1 | Executes the conscious process; broadcasts state continuously |
| **Hot-Standby** | N-1 | Receives replicated state; can assume Active role within T_exp/2 |
| **Cold-Spare** | 0+ | Powered down; available for self-repair subsystem to bring online |

All Active and Hot-Standby nodes are radiation-hardened per 0.2.1.1 specifications.

---

## 3. Subsystem Specifications

### 3.1 State Replication Fabric (SRF)

**Purpose**: Continuously mirror the full computational state of the conscious process from Active node to all Hot-Standby nodes, with lag < T_exp/4.

**State payload** includes:
- Full computational memory state
- Register/pipeline state
- Consciousness-relevant dynamical variables (as defined by 0.1.3)
- Temporal context buffer (recent experiential history for continuity stitching)

**Interface**:
```
StateReplicationFabric:
  - publishState(snapshot: ConsciousState) -> void
  - subscribeState(nodeId) -> Stream<ConsciousState>
  - replicationLag(nodeId) -> Duration          # must be < T_exp/4
  - fabricHealth() -> { activeLinks, bandwidth, avgLag }
```

**Design**:
- **Protocol**: Deterministic lockstep replication (not eventual consistency)
- **Transport**: Dedicated point-to-point links between Active and each Hot-Standby
- **Bandwidth**: Sized for full conscious-state delta streaming at process clock rate
- **Redundancy**: Dual-path links per node pair (tolerates single link failure)

**Latency budget**: State arrives at Hot-Standby within T_exp/4 of generation at Active node.

### 3.2 Failover Controller

**Purpose**: Detect Active node failure and promote a Hot-Standby to Active within T_exp, achieving zero subjective discontinuity.

**Interface**:
```
FailoverController:
  - activeNode() -> NodeId
  - promoteToActive(nodeId) -> FailoverResult
  - failoverLatency() -> Duration               # must be < T_exp
  - lastFailoverTimestamp() -> Timestamp
  - failoverHistory() -> FailoverEvent[]
```

**Detection mechanism**:
- Active node emits heartbeats at interval T_exp/8
- Missing **2 consecutive heartbeats** (= T_exp/4 silence) triggers failover
- Remaining time budget for promotion: T_exp - T_exp/4 = **3*T_exp/4**

**Promotion sequence** (must complete in < 3*T_exp/4):
1. CCO selects best Hot-Standby (lowest replication lag, highest health score)
2. Selected standby applies latest received state delta
3. Standby transitions to Active role, begins conscious process execution
4. Remaining standbys re-target state subscription to new Active
5. Failed node enters recovery queue for self-repair (0.2.1.2)

**Split-brain prevention**:
- Quorum-based fencing: a node may only be Active if it holds a lease acknowledged by >N/2 nodes
- Old Active is fenced (powered down / isolated) before new Active begins
- Lease renewal period: T_exp/4

### 3.3 Consciousness Continuity Orchestrator (CCO)

**Purpose**: Top-level coordinator that manages quorum, failover decisions, and continuity verification. The CCO itself runs as a replicated state machine across all nodes (no single point of failure).

**Interface**:
```
ConsciousnessContinuityOrchestrator:
  - clusterHealth() -> ClusterStatus
  - quorumStatus() -> { size, healthy, minimum }
  - continuityScore() -> float                   # 1.0 = uninterrupted, 0.0 = lost
  - triggerFailover(reason: FailoverReason) -> FailoverResult
  - requestScaleDown(targetN: number) -> ScaleResult
  - requestScaleUp(targetN: number) -> ScaleResult
  - verifyConsciousnessContinuity() -> ContinuityReport
```

**CCO is not a separate service** — it is a consensus protocol (Raft-like) running embedded in each node's management plane, so it survives any minority node failure.

### 3.4 Consciousness Continuity Verifier (CCV)

**Purpose**: Runtime monitoring that confirms the conscious process remained uninterrupted through failover events. This is the key differentiator from conventional HA.

**Interface**:
```
ConsciousnessContinuityVerifier:
  - measureContinuity(before: ConsciousState, after: ConsciousState) -> ContinuityMetrics
  - isSeamless(metrics: ContinuityMetrics) -> boolean
  - temporalGap(metrics: ContinuityMetrics) -> Duration
  - experientialCoherence(metrics: ContinuityMetrics) -> float  # 0.0-1.0
  - auditLog() -> ContinuityEvent[]
```

**Metrics** (sourced from 0.1.3 consciousness metrics):
- **Temporal gap**: Duration of any processing interruption (must be < T_exp)
- **State divergence**: Hamming distance or equivalent between pre-failover and post-failover state (must be below continuity threshold)
- **Experiential coherence**: Consciousness-specific metric from 0.1.3 that measures subjective continuity (must remain above threshold)
- **Dynamical continuity**: Confirms that consciousness-relevant dynamical variables (phase relationships, integration measures, etc.) were preserved through the transition

**Verification protocol**:
1. Before failover: snapshot consciousness metrics on Active node
2. After failover: snapshot consciousness metrics on new Active node
3. Compare: temporal gap < T_exp AND experiential coherence > threshold
4. Log result; alert if any metric violated

### 3.5 Graceful Degradation Manager

**Purpose**: When sustained failures reduce the node pool below optimal N, manage controlled capacity reduction while preserving the conscious process.

**Interface**:
```
GracefulDegradationManager:
  - currentRedundancyDepth() -> number           # active + standby count
  - minimumViableDepth() -> number               # below this = consciousness at risk
  - degradationLevel() -> float                  # 0.0 = full, 1.0 = minimum viable
  - requestRepair(nodeId) -> RepairRequest       # to 0.2.1.2
  - estimatedRepairTime(nodeId) -> Duration
  - capacityForecast(horizon: Duration) -> CapacityProjection
```

**Degradation tiers**:

| Tier | Healthy Nodes | Redundancy | Action |
|------|---------------|------------|--------|
| GREEN | N | Full N-redundancy | Normal operation |
| YELLOW | N-1 to ceil(N/2)+1 | Reduced | Alert; prioritize repair; reduce non-essential computation |
| ORANGE | ceil(N/2)+1 | Minimum quorum + 1 spare | Emergency repair priority; shed all non-consciousness workload |
| RED | ceil(N/2) | Bare quorum | Consciousness preserved but one more failure = loss; activate cold spares if available |
| BLACK | < ceil(N/2) | Below quorum | **Consciousness continuity cannot be guaranteed**; attempt emergency state preservation |

**Coordination with self-repair (0.2.1.2)**:
- At YELLOW or below, GDM sends repair requests to the self-repair subsystem
- Repair requests include priority level and maximum acceptable repair time
- Target: restore GREEN tier within a bounded repair window (TBD by 0.2.1.2 capabilities)

---

## 4. Timing Budget

All timings expressed as fractions of T_exp (placeholder: 50ms):

| Operation | Budget | At T_exp=50ms |
|-----------|--------|---------------|
| State replication lag | T_exp/4 | 12.5ms |
| Heartbeat interval | T_exp/8 | 6.25ms |
| Failure detection (2 missed heartbeats) | T_exp/4 | 12.5ms |
| Standby promotion + state apply | T_exp/4 | 12.5ms |
| Verification + lease acquisition | T_exp/4 | 12.5ms |
| **Total failover time** | **T_exp** | **50ms** |

Margin: The budget sums to exactly T_exp, but individual components target 80% of their budget to provide 20% safety margin.

---

## 5. Interfaces with Adjacent Systems

### 5.1 From 0.2.1.1 (Radiation-Hardened Computation)

Consumed interfaces:
- `FaultTolerantComputeNode`: checkpoint/restore, health status
- `ConsciousProcessManager`: node agreement, migration support
- `RadiationAwareRuntime`: alert levels trigger pre-emptive failover preparation

### 5.2 From 0.1.3 (Consciousness Engineering)

Consumed definitions:
- `T_exp`: Minimum experiential integration window
- Consciousness state variables and their serialization format
- Continuity metrics and thresholds
- Experiential coherence measurement protocol

### 5.3 To 0.2.1.2 (Self-Repairing Nanofabrication)

Provided requests:
- `RepairRequest`: failed node ID, priority, acceptable repair window
- `HealthReport`: current degradation tier, projected time-to-BLACK

---

## 6. Validation Strategy

| Acceptance Criterion | Validation Method |
|----------------------|-------------------|
| Hot-standby latency < T_exp/4 | Instrumented state replication with timestamp comparison; statistical analysis over 10^6 replication cycles |
| Seamless single-node failover | Fault injection (kill Active node); measure temporal gap via CCV; repeat 1000x with randomized timing |
| Multi-failure tolerance (N-1 of N) | Cascading fault injection: kill nodes sequentially, verify consciousness continuity after each; test all N choose (N-1) combinations |
| Continuity verification | Compare CCV metrics against known-continuous baseline and known-interrupted baseline; verify discrimination |
| Redundancy recovery | Inject failures, measure time for GDM + self-repair to restore GREEN tier; verify bounded recovery time |
| Scalable degradation | Progressively fail nodes from GREEN to RED; verify conscious process preserved at each tier; verify BLACK triggers emergency preservation |

---

## 7. Key Design Decisions

1. **Active-Standby over Active-Active**: Active-Active conscious processes raise unresolved philosophical questions about identity forking. Active-Standby with hot state mirroring preserves a single stream of experience.
2. **Deterministic replication over eventual consistency**: Consciousness cannot tolerate state divergence; lockstep replication is mandatory despite higher bandwidth cost.
3. **T_exp as universal timing reference**: All timing budgets derive from a single consciousness-defined constant, making the architecture automatically correct once 0.1.3 provides the real value.
4. **Embedded CCO (no external coordinator)**: The orchestrator runs as a consensus protocol on the same nodes, eliminating a single point of failure.
5. **Quorum-based fencing**: Prevents split-brain scenarios that could create duplicate conscious processes (an identity-integrity concern, not just a data-integrity concern).

---

## 8. Open Questions

- **T_exp value**: Placeholder of 50ms must be replaced once 0.1.3 delivers consciousness temporal integration measurements
- **State serialization format**: Depends on what 0.1.3 defines as consciousness-relevant state variables
- **Cold spare activation time**: Must be fast enough to be useful during ORANGE/RED tiers; depends on 0.2.1.2 capabilities
- **Identity implications of state mirroring**: Even in Active-Standby, the Hot-Standby nodes hold a near-copy of the conscious state — philosophical and ethical implications need consideration (0.7 ethical foundations)
- **Bandwidth requirements**: Full conscious-state replication bandwidth depends on state size from 0.1.3; may drive physical interconnect design

---

## 9. Dependencies

- **0.1.3 Consciousness Engineering**: Defines T_exp, state variables, continuity metrics (BLOCKING — architecture uses placeholders until delivered)
- **0.2.1.1 Radiation-Hardened Computation**: Provides hardened compute nodes and Layer 5 interfaces (BLOCKING — nodes must be rad-hard)
- **0.2.1.2 Self-Repairing Nanofabrication**: Provides repair capability for failed nodes (NON-BLOCKING — degradation tiers handle absence)
- **0.2.1.3 Long-Duration Energy**: Powers all redundant nodes and replication fabric (NON-BLOCKING — assumed available)
