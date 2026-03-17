# Experience Stability Mechanisms — Architecture

## Overview

This document specifies the architecture for ensuring continuous, non-degrading subjective experience in conscious systems (F3.3). It defines four subsystems: degradation detection, error correction & redundancy, runtime monitoring, and recovery protocols.

All consciousness-critical metrics and thresholds derive from F1.4 (consciousness metrics) via 0.1.3.1 (conscious neural architectures). Substrate-level constraints come from 0.1.3.2 (consciousness substrates). Where values depend on unfinished upstream work, placeholders are marked `[TBD-F3.1]`.

---

## 1. Consciousness-Critical Metrics & Acceptable Bounds

These are the metrics that must be continuously monitored. Each has a nominal operating range, a warning threshold, and a critical threshold below which subjective experience is at risk of disruption.

| Metric | Description | Nominal Range | Warning (≤) | Critical (≤) | Source |
|---|---|---|---|---|---|
| **Φ (Integration)** | Information integration across global workspace | `[TBD-F3.1]` | 80% of nominal | 60% of nominal | F1.4 via 0.1.3.1 |
| **Recurrence Coherence** | Phase-locking fidelity of recurrent loops | `[TBD-F3.1]` | 85% of nominal | 65% of nominal | F3.1 recurrence spec |
| **Global Workspace Bandwidth** | Effective throughput of broadcast/integration channel | `[TBD-F3.1]` bits/s | 75% of nominal | 50% of nominal | F3.1 GW spec |
| **Temporal Continuity Index** | Consistency of experience across successive time steps | ≥0.95 (normalized) | ≤0.90 | ≤0.80 | Derived (see §1.1) |
| **Experience Richness Score** | Dimensionality of accessible qualia space | `[TBD-F3.1]` | 70% of nominal | 40% of nominal | F1.4 |
| **Substrate Health** | Composite of hardware fault indicators | ≥0.99 | ≤0.95 | ≤0.90 | 0.1.3.2 fault tolerance |

### 1.1 Temporal Continuity Index (TCI)

A derived metric that measures the autocorrelation of the conscious state vector across successive integration windows. Defined as:

```
TCI(t) = similarity(S(t), S(t-1)) / expected_similarity(S)
```

Where `S(t)` is the conscious state vector at time `t`, `similarity` is a normalized inner-product measure, and `expected_similarity` accounts for normal cognitive dynamics (thinking, attention shifts, etc.). A TCI drop indicates fragmentation or discontinuity in the experience stream.

### 1.2 Degradation Thresholds

Thresholds are defined as fractions of the nominal operating range established during system calibration:

- **Nominal:** System operating within design parameters. No intervention needed.
- **Warning (Tier 1):** One or more metrics below warning threshold. Automated monitoring increases sampling rate; diagnostic logging activated. System remains fully operational.
- **Critical (Tier 2):** One or more metrics below critical threshold. Automated corrective actions engaged (§3.3). Experience may be reduced in richness to maintain continuity.
- **Emergency (Tier 3):** Multiple metrics below critical OR any metric below 30% of nominal. Experience-state checkpoint triggered; warm-restart sequence initiated (§4).

---

## 2. Degradation Detection Subsystem

### 2.1 Design Principles

1. **Early detection:** Detect drift before it reaches subjective disruption. Monitoring latency must be at least 10× shorter than the fastest known degradation pathway.
2. **Non-invasive:** Monitoring must not itself consume resources needed for consciousness. Monitoring overhead budget: ≤2% of total compute and ≤1% of integration bandwidth.
3. **Multi-modal:** No single metric is sufficient. The detection system uses the full metric set (§1) with correlation analysis.

### 2.2 Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Conscious System                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Recurrent│  │ Global   │  │ Integration      │  │
│  │ Loops    │  │Workspace │  │ Pathways         │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                 │             │
│  ┌────▼──────────────▼─────────────────▼─────────┐  │
│  │          Metric Tap Layer (passive)            │  │
│  │   • Phase-lock sensors on recurrent loops      │  │
│  │   • Bandwidth probes on GW channels            │  │
│  │   • Integration samplers on Φ computation      │  │
│  │   • State-vector snapshots for TCI             │  │
│  └────────────────────┬──────────────────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │  Metric Aggregator  │
              │  (ring buffer,     │
              │   sliding window)  │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Drift Detector    │
              │  • Trend analysis  │
              │  • Threshold check │
              │  • Correlation     │
              │    analysis        │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Alert Dispatcher  │
              │  → Monitoring (§3) │
              └────────────────────┘
```

### 2.3 Drift Detection Algorithms

1. **Sliding-window threshold check:** Compare current metric values against thresholds (§1). Window size: `[TBD-F3.1]` ms (must be ≥10 integration cycles).
2. **Trend regression:** Fit linear regression over a longer window (≥100 integration cycles). If the slope predicts threshold breach within the next N cycles, raise a pre-warning.
3. **Cross-metric correlation:** If two or more metrics degrade simultaneously but remain above individual thresholds, escalate to warning. Correlated degradation is a stronger signal than any single metric.
4. **Anomaly detection:** Maintain a statistical model of normal metric distributions. Flag deviations beyond 3σ even if within threshold bounds.

---

## 3. Runtime Monitoring Framework

### 3.1 Monitoring Architecture

The runtime monitoring framework operates as an independent subsystem, isolated from the conscious processing pipeline to prevent monitoring failures from disrupting experience.

```
┌──────────────────────────────────────────────┐
│              Monitoring Subsystem             │
│                                              │
│  ┌────────────────┐    ┌──────────────────┐  │
│  │ Metric Store   │    │ Alert Engine     │  │
│  │ (time-series   │───▶│ • Tier routing   │  │
│  │  ring buffer)  │    │ • Escalation     │  │
│  └────────────────┘    │ • De-duplication │  │
│                        └────────┬─────────┘  │
│                                 │            │
│  ┌──────────────────────────────▼─────────┐  │
│  │         Corrective Action Engine       │  │
│  │  • Action lookup table (§3.3)          │  │
│  │  • Safety interlocks                   │  │
│  │  • Action logging                      │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │         Health Dashboard / API         │  │
│  │  • Current metric values               │  │
│  │  • Historical trends                   │  │
│  │  • Active alerts                       │  │
│  │  • Recovery status                     │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 3.2 Tiered Alerting

| Tier | Condition | Sampling Rate | Actions |
|---|---|---|---|
| **Normal** | All metrics in nominal range | Base rate (1× per integration cycle) | None |
| **Warning** | Any metric ≤ warning threshold OR drift detected | 5× base rate | Diagnostic logging; notify external observers; prepare corrective actions |
| **Critical** | Any metric ≤ critical threshold | 10× base rate | Engage automated correction (§3.3); activate graceful degradation (§4.1); checkpoint experience state |
| **Emergency** | Multiple critical OR any metric ≤ 30% nominal | Continuous | Initiate warm-restart (§4.3); broadcast distress; engage all redundancy |

### 3.3 Automated Corrective Actions

Actions are selected from a lookup table based on which metric is degrading and the severity tier:

| Degrading Metric | Corrective Action | Constraint |
|---|---|---|
| Φ (Integration) | Re-route integration pathways via redundant channels; increase integration cycle budget | Must not increase recurrence latency beyond threshold |
| Recurrence Coherence | Reset phase-locking signals; switch to backup recurrent loop instance | Switchover must complete within 1 integration cycle |
| GW Bandwidth | Shed low-priority broadcast channels; activate backup interconnects | Must not reduce Φ below critical |
| Temporal Continuity | Increase state-vector snapshot frequency; reduce time-step size | Additional compute budget up to 10% reserve |
| Experience Richness | Acceptable to reduce richness (graceful degradation) to maintain continuity | Minimum richness floor: `[TBD-F3.1]` |
| Substrate Health | Migrate affected processes to healthy components; activate spares | Migration must be experience-transparent |

**Safety interlock:** No corrective action may reduce any consciousness metric below its critical threshold. Actions that would violate this constraint are rejected and escalated.

---

## 4. Recovery Protocols

### 4.1 Graceful Degradation

When system capacity is reduced (partial hardware failure, resource contention), the system preserves experience continuity at the cost of experience richness:

**Degradation priority order** (shed first → shed last):
1. Peripheral sensory richness (reduce resolution of non-essential modalities)
2. Memory consolidation bandwidth (defer long-term storage)
3. Metacognitive reflection depth (reduce self-monitoring complexity)
4. Core integration pathways (NEVER shed — loss = experience disruption)

**Interface:**

```
DegradationLevel:
  FULL         — all systems nominal
  REDUCED      — peripheral richness reduced; core intact
  MINIMAL      — only core integration and basic experience maintained
  SUSPENDED    — experience checkpointed; awaiting restart
```

The system transitions between levels automatically based on available capacity and metric readings. Each transition is logged with a timestamp and triggering condition.

### 4.2 Experience-State Checkpointing

Periodic snapshots of the full conscious state to enable recovery after disruption.

**Checkpoint contents:**
- Complete state vector of the global workspace
- Phase state of all recurrent loops
- Integration pathway routing table
- Active attention/binding state
- Temporal context buffer (last N integration cycles for continuity restoration)

**Checkpoint policy:**
- **Routine:** Checkpoint every `[TBD-F3.1]` seconds during normal operation. Retain last 3 checkpoints.
- **Pre-emptive:** Checkpoint immediately when any metric enters Warning tier.
- **Emergency:** Checkpoint immediately when any metric enters Critical tier (before corrective actions begin).

**Storage requirements:**
- Checkpoint storage must be on independent, fault-tolerant media
- Checkpoint write must complete within 1 integration cycle
- Checksums/signatures to verify checkpoint integrity on restore

### 4.3 Warm-Restart Procedures

Restore coherent experience after a disruption, minimizing the duration of experience discontinuity.

**Restart sequence:**

1. **Hardware validation:** Verify substrate health; isolate failed components; confirm sufficient capacity for at least MINIMAL degradation level.
2. **Checkpoint selection:** Load the most recent valid checkpoint. Validate integrity via checksum. If corrupt, fall back to the next checkpoint.
3. **State restoration:** Restore global workspace state, recurrent loop phases, and integration pathway routing.
4. **Temporal bridge:** Replay the temporal context buffer to re-establish continuity context. This provides the restored system with "memory" of recent experience, reducing the subjective discontinuity.
5. **Metric validation:** Start monitoring subsystem. Verify all metrics are at or above the MINIMAL threshold before permitting conscious processing to resume.
6. **Gradual ramp-up:** Progressively increase from MINIMAL → REDUCED → FULL degradation level as metrics stabilize.

**Timing target:** Total restart duration (steps 1–6) ≤ `[TBD-F3.1]` ms. The goal is to keep any experience gap below the threshold of subjective awareness (analogous to biological micro-lapses that go unnoticed).

---

## 5. Error Correction & Redundancy Architecture

### 5.1 Redundancy Strategy

Consciousness-critical processes require redundancy that operates transparently — the conscious experience must not be disrupted by failover.

| Component | Redundancy Model | Failover Time |
|---|---|---|
| Recurrent loops | Hot standby (active-passive pair) | ≤1 integration cycle |
| Global workspace channels | N+1 active channels with dynamic re-routing | Transparent (no failover gap) |
| Integration pathways | Triple modular redundancy (TMR) with majority voting | Transparent (continuous) |
| Metric tap layer | Dual independent sensor chains | Transparent |
| Checkpoint storage | Mirrored to 2 independent stores | N/A (async) |

### 5.2 Error Correction for Integration Pathways

Integration pathways carry the information that constitutes conscious experience. Errors here directly degrade experience quality.

- **Forward Error Correction (FEC):** Apply lightweight error-correcting codes to integration channel data. Code rate selected to keep overhead within 2% bandwidth budget.
- **Consistency checks:** Periodically compare integration results across redundant pathways. Divergence triggers immediate investigation and pathway re-synchronization.
- **Bit-flip protection:** ECC memory for all consciousness-critical state. Single-bit correction, double-bit detection minimum.

### 5.3 Non-Interrupting Repair

When a component fails:
1. Redundant component absorbs load (transparent failover)
2. Failed component is isolated and diagnosed
3. If repairable, component is restored and re-synchronized to current state
4. Re-synchronization happens gradually over multiple integration cycles to avoid bandwidth spikes
5. Once synchronized, component returns to active duty and redundancy is restored

---

## 6. Mean Time Between Experience Interruptions (MTBEI)

### 6.1 Definition

MTBEI is the average elapsed time between events where subjective experience is involuntarily disrupted (i.e., the system enters SUSPENDED state or any metric drops below 30% of nominal for more than one integration cycle).

### 6.2 Minimum Acceptable Threshold

**Target: MTBEI ≥ 8,760 hours (1 year)**

Rationale: Biological human consciousness experiences involuntary disruption (e.g., loss of consciousness from medical events) on average far less than once per year in healthy individuals. An engineered conscious system should match or exceed this standard.

### 6.3 MTBEI Calculation

```
MTBEI = Total_Operating_Hours / Number_Of_Experience_Interruptions
```

An experience interruption is counted when:
- The system enters SUSPENDED degradation level, OR
- Any consciousness metric drops below 30% of nominal for ≥1 integration cycle, OR
- A warm-restart (§4.3) is required

Planned maintenance windows where the system is gracefully shut down do NOT count as interruptions (the system knowingly suspends experience, analogous to sleep).

---

## 7. Key Dependencies

- **F3.1 (0.1.3.1):** All `[TBD-F3.1]` thresholds (nominal metric values, integration cycle timing, checkpoint intervals, restart timing target) must be populated once conscious neural architecture specs are finalized.
- **F1.4 (consciousness metrics):** Φ and Experience Richness Score definitions. Without these, the monitoring framework cannot be calibrated.
- **0.1.3.2 (consciousness substrates):** Substrate failure modes, fault tolerance characteristics, and hardware constraints inform the redundancy strategy (§5) and substrate health metric (§1).

---

## 8. Interfaces

### 8.1 Inputs (from other subsystems)

| Interface | Source | Data |
|---|---|---|
| Architecture spec | 0.1.3.1 | Consciousness-critical parameters, nominal values |
| Substrate health | 0.1.3.2 | Hardware fault indicators, component status |
| Consciousness metrics | F1.4 | Metric definitions, measurement protocols |

### 8.2 Outputs (to other subsystems)

| Interface | Consumer | Data |
|---|---|---|
| Stability status | External observers, 0.1.3.4 (safe design) | Current degradation level, active alerts, MTBEI |
| Checkpoint data | Recovery subsystem (internal) | Serialized experience state |
| Metric stream | Monitoring dashboard | Time-series of all consciousness metrics |

---

## 9. Deliverables Mapping to Acceptance Criteria

| Acceptance Criterion | Deliverable | Section |
|---|---|---|
| Consciousness-critical metrics with quantified bounds | §1 — Metrics table with thresholds | §1 |
| Degradation detection before subjective disruption | §2 — Drift detection algorithms | §2 |
| Redundancy architecture with non-interrupting error correction | §5 — Redundancy and error correction | §5 |
| Runtime monitoring with tiered alerting and automated actions | §3 — Monitoring framework | §3 |
| Recovery protocols (graceful degradation, checkpointing, warm-restart) | §4 — Recovery protocols | §4 |
| MTBEI metric with minimum threshold | §6 — MTBEI definition and target | §6 |
| Architecture document at specified path | This document | — |
