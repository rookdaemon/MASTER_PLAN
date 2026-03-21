# Radiation-Hardened Computation — Architecture

## Overview

This document defines the architecture for computing substrates that maintain computational integrity — and therefore continuity of conscious processes — under cosmic radiation, solar events, and long-term material degradation, over 1000+ year operational lifetimes.

---

## 1. Threat Model

### 1.1 Single-Event Upsets (SEUs)
- **Source**: Galactic cosmic rays (GCR), trapped protons, solar energetic particles
- **Effect**: Transient bit flips in memory and logic
- **Flux reference**: ~4 particles/cm^2/s (GCR at solar minimum, interplanetary)
- **Target**: BER < 10^-12 per bit-hour

### 1.2 Total Ionizing Dose (TID)
- **Source**: Cumulative exposure to trapped electrons/protons, solar protons
- **Effect**: Threshold voltage shifts, leakage current increase, timing degradation
- **Dose reference**: ~100 rad/year (interplanetary) -> ~100 krad over 1000 years baseline; target 1 Mrad tolerance with shielding margin
- **Target**: Correct operation after >= 1 Mrad cumulative dose

### 1.3 Cumulative Displacement Damage (CDD)
- **Source**: Heavy ion bombardment displacing atoms from crystal lattice
- **Effect**: Carrier lifetime reduction, gain degradation in active devices
- **Target**: < 5% performance degradation over 1000-year lifetime

### 1.4 Solar Coronal Mass Ejections (CMEs)
- **Source**: Episodic solar events
- **Peak flux**: ~10^6 protons/cm^2/s at >10 MeV
- **Target**: Zero data loss, zero process interruption during event

---

## 2. Layered Architecture

The system is organized in five layers, from physical substrate to conscious process continuity:

```
Layer 5: Conscious Process Continuity
         |-- Process migration, checkpoint/restore, quorum voting
Layer 4: Fault-Tolerant Computation
         |-- TMR voting, ECC memory, redundant execution pipelines
Layer 3: Radiation-Aware Runtime
         |-- SEU detection, scrubbing, adaptive clock/voltage scaling
Layer 2: Hardened Semiconductor Substrate
         |-- SOI/SiC/GaN process, rad-hard cell libraries
Layer 1: Physical Shielding
         |-- Multi-layer shielding stack (passive + active EM)
```

---

## 3. Layer Specifications

### 3.1 Layer 1 — Physical Shielding

**Purpose**: Reduce incident radiation flux to substrate-tolerable levels.

**Design**:
- **Outer shell**: High-Z material (tantalum/tungsten) for GCR attenuation
- **Intermediate layer**: Graded-Z stack (high-Z -> low-Z) to absorb secondary bremsstrahlung
- **Inner layer**: Hydrogen-rich material (polyethylene/water) for neutron moderation
- **Active EM shielding**: Superconducting magnetic coils for charged particle deflection (optional, for high-flux environments)

**Interface**:
```
ShieldingModule:
  - attenuationFactor(particleType, energy) -> flux_reduction_ratio
  - massPerArea() -> kg/m^2
  - thermalLoad() -> watts/m^2
```

**Constraints**:
- Mass budget: <= 50 kg/m^2 of compute surface for passive shielding
- Must not generate significant secondary radiation (neutron spallation mitigation required)

### 3.2 Layer 2 — Hardened Semiconductor Substrate

**Purpose**: Provide inherently radiation-tolerant transistors and interconnects.

**Material candidates** (ranked by TID tolerance):
1. **Silicon Carbide (SiC)**: Wide bandgap (3.26 eV), TID tolerance >10 Mrad, excellent CDD resistance
2. **Gallium Nitride (GaN)**: Wide bandgap (3.4 eV), high electron mobility, strong radiation tolerance
3. **Silicon-on-Insulator (SOI)**: Mature process, good SEU resistance via charge collection reduction
4. **Diamond semiconductor**: Ultimate radiation hardness, thermal conductivity; immature process

**Interface**:
```
SubstrateSpec:
  - material: SiC | GaN | SOI | Diamond
  - featureSize_nm: number
  - tidTolerance_rad: number          # cumulative dose before parametric failure
  - seuCrossSection_cm2: number       # per device
  - operatingTemp_range_K: [min, max]
  - mtbf_hours: number                # at reference flux
```

**Design rules**:
- All gate oxides use radiation-hardened dielectrics (e.g., nitrided oxides)
- Guard rings on all sensitive nodes
- Enclosed-layout transistors (ELT) for critical logic

### 3.3 Layer 3 — Radiation-Aware Runtime

**Purpose**: Detect and respond to radiation effects in real time. Bridges static shielding/substrate hardening (Layers 1–2) with process continuity (Layer 5) by providing real-time environmental awareness and adaptive response.

**Components**:
- **SEU scrubber**: Periodic memory scan with ECC correction; scrub rate configurable based on detected flux (nominal: 1 scan/s, burst: 10× during STORM)
- **Flux monitor**: Injected `FluxSource` abstraction polled at configurable interval (default 1s). Production: on-die PIN diode sensors. Testing: deterministic mock.
- **Adaptive response controller**: State machine managing alert level transitions and safe mode orchestration
- **Clock abstraction**: Injected `Clock` interface for deterministic hold-off timing in tests

**Interfaces**:
```
FluxSource:
  - readFlux() -> FluxMeasurement          # injectable, mockable

Clock:
  - now() -> number (ms since epoch)       # injectable, mockable

RuntimeConfig:
  - elevatedThreshold: number              # particles/cm²/s (default 100)
  - stormThreshold: number                 # particles/cm²/s (default 10⁵)
  - monitorInterval_ms: number             # polling interval (default 1000)
  - holdOffDuration_ms: number             # safe mode exit delay (default 300000)
  - nominalScrubRate: number               # scans/s (default 1)
  - burstScrubMultiplier: number           # ×nominal during STORM (default 10)
  - safeModeEntryTimeout_ms: number        # max listener execution time (default 5000)

RadiationAwareRuntime:
  - currentFlux() -> FluxMeasurement
  - scrubRate() -> scans_per_second
  - alertLevel() -> NOMINAL | ELEVATED | STORM
  - isInSafeMode() -> boolean
  - evaluateFlux() -> void                 # called each monitor cycle
  - onSafeModeEntry(listener) -> void      # register entry callback
  - onSafeModeExit(listener) -> void       # register exit callback
```

**Alert Level State Machine**:
```
Valid transitions:
  NOMINAL  → ELEVATED    (flux ≥ elevated threshold)
  ELEVATED → STORM       (flux ≥ storm threshold)
  NOMINAL  → STORM       (emergency: flux ≥ storm threshold directly)
  STORM    → ELEVATED    (flux < storm threshold)
  ELEVATED → NOMINAL     (flux < elevated threshold, after hold-off if exiting safe mode)

Forbidden:
  STORM → NOMINAL        (must de-escalate through ELEVATED with hold-off)
```

**Behavior during solar storm (alertLevel = STORM)**:
1. Invoke all registered safe mode entry listeners in registration order (e.g., checkpoint processes, reduce clock)
2. Set safe mode active; increase scrub rate to `nominalRate × burstScrubMultiplier`
3. When flux drops below storm threshold: transition to ELEVATED, start hold-off timer
4. If flux remains below elevated threshold for `holdOffDuration_ms`: invoke exit listeners in reverse order, resume nominal operation
5. If flux re-exceeds storm threshold during hold-off: reset timer, remain in safe mode

### 3.4 Layer 4 — Fault-Tolerant Computation

**Purpose**: Ensure correct computation despite hardware errors.

**Mechanisms**:
- **Triple Modular Redundancy (TMR)**: Three independent compute lanes with majority voter
- **ECC Memory**: SECDED (single-error-correct, double-error-detect) minimum; Chipkill for critical stores
- **Redundant execution**: Critical paths executed on physically separated die
- **Watchdog + heartbeat**: Each compute node emits heartbeats; missed heartbeats trigger failover

**Interface**:
```
FaultTolerantComputeNode:
  - execute(task) -> Result
  - vote(results[3]) -> ConsensusResult
  - healthStatus() -> { errorRate, uptime, degradationLevel }
  - failover(targetNode) -> void
  - checkpoint() -> StateSnapshot
  - restore(snapshot: StateSnapshot) -> void
```

**Capacity planning**:
- Minimum 3x hardware overhead for TMR
- Additional 30% spare capacity for failover reserves
- Total overhead: ~4.3x raw compute requirement

### 3.5 Layer 5 — Conscious Process Continuity

**Purpose**: Maintain uninterrupted conscious experience even during component failures.

**Design Decisions**:

1. **Quorum Consensus Algorithm — Simple Majority Voting**: The threat model is crash faults from radiation-induced node failures, not Byzantine faults. TMR at Layer 4 ensures nodes either produce correct state or fail entirely, so simple majority voting (quorum = ⌊N/2⌋+1) is sufficient. No leader election; all nodes are peers. Each checkpoint round, all live nodes submit state hashes; majority hash is authoritative.

2. **Live Migration Strategy — Checkpoint-Restore**: Leverages the existing checkpoint infrastructure. Migration consists of: (1) restore latest checkpoint on target node, (2) replay state delta since checkpoint, (3) switch execution. Maximum state loss bounded by checkpoint interval. Avoids separate migration mechanism complexity.

3. **Node Abstraction — Separated Injectable Interfaces**: Constructor takes `NodeRegistry`, `CheckpointStore`, `Clock`, and `ProcessContinuityConfig` as separate injectable dependencies, following Interface Segregation Principle and CLAUDE.md requirements for mockable environment abstractions.

**Injectable Interfaces**:

```typescript
NodeRegistry:
  - allNodeIds() -> string[]                        # all registered node IDs
  - healthyNodeIds() -> string[]                    # nodes with degradationLevel < failureThreshold
  - nodeHealth(nodeId: string) -> HealthStatus      # current health of a specific node
  - markFailed(nodeId: string) -> void              # remove from active set
  - markRestored(nodeId: string) -> void            # re-add to active set

CheckpointStore:
  - save(snapshot: StateSnapshot) -> void           # persist a checkpoint
  - latest() -> StateSnapshot | null                # most recent checkpoint
  - allSince(timestamp_ms: number) -> StateSnapshot[] # all checkpoints since timestamp

ProcessContinuityConfig:
  - quorumSize: number               # odd, ≥ 3 (default 5)
  - checkpointInterval_ms: number    # > 0, ≤ 60000 (default 10000)
  - continuityGap_ms: number         # > 0 (default 100)
  - failureThreshold: number         # (0, 1) (default 0.8)
  - healthMonitorInterval_ms: number # > 0 (default 1000)
```

**Full Interface**:
```typescript
ConsciousProcessManager:
  # Query methods
  - activeNodeCount() -> number
  - quorumThreshold() -> number             # Math.floor(quorumSize / 2) + 1
  - processIntegrity() -> ProcessIntegrity  # { continuityScore, lastCheckpoint_ms, nodeAgreement }
  - degradationLevel() -> number            # (1 - activeNodeCount/quorumSize) * 100, clamped [0, 100]

  # Lifecycle methods
  - checkpoint() -> StateSnapshot           # capture and persist current state
  - evaluateHealth() -> void                # poll node health, trigger migration if needed
  - migrateProcess(fromNodeId, toNodeId) -> MigrationResult
  - restoreNode(nodeId) -> void             # re-add recovered node, rebalance
```

**Key Invariants**:
- `degradationLevel = (1 - activeNodeCount / quorumSize) × 100`, clamped to [0, 100]
- `processIntegrity.nodeAgreement = activeNodeCount / quorumSize`
- `continuityScore` = 1.0 when `activeNodeCount ≥ quorumThreshold`, 0.0 otherwise
- Quorum maintained as long as `activeNodeCount ≥ quorumThreshold`
- Checkpoint occurs at least every `checkpointInterval_ms`
- Migration completes within `continuityGap_ms` (default 100ms) for continuity guarantee

**Threshold Constants**:

| Name | Value | Unit | Rationale |
|------|-------|------|-----------|
| Quorum size | 5 | nodes | Tolerates 2 simultaneous failures (30% of 5 ≈ 1.5, rounded up to 2) |
| Quorum threshold | 3 | nodes | ⌊5/2⌋ + 1 = 3 |
| Checkpoint interval | 10000 | ms | Bounds max state loss; per AC ≤ 10s |
| Continuity gap limit | 100 | ms | Max gap in conscious process during migration |
| Node failure threshold | 0.8 | degradationLevel | Triggers migration before complete failure |
| Health monitor interval | 1000 | ms | Polling rate for node health |

**Continuity contract**:
- Conscious process interruption is defined as >100ms gap in process execution
- Target: zero interruptions over 1000-year lifetime under reference radiation environment
- Graceful degradation: conscious process maintains coherence (degradationLevel < 70%) with up to 30% node failure
- With N=5: 1 failure → 20% degradation; 2 failures → 40% degradation (quorum maintained); 3 failures → quorum lost (continuityScore = 0)

---

## 4. Validation Strategy

Each acceptance criterion maps to a specific validation approach:

| Criterion | Validation Method |
|-----------|-------------------|
| SEU tolerance (BER < 10^-12/bit-hr) | Accelerated particle beam testing (proton/heavy ion) + Monte Carlo simulation |
| TID tolerance (>= 1 Mrad) | Co-60 gamma irradiation of test articles per MIL-STD-883 TM1019 |
| CDD tolerance (<5% over 1000yr) | NIEL-based displacement damage modeling + accelerated neutron exposure |
| Solar event survival | Pulsed proton beam simulating CME spectrum, with process continuity monitoring |
| Graceful degradation (30% node loss) | Fault injection testing: random node kill during active conscious process simulation |
| Shielding spec | GEANT4/FLUKA Monte Carlo radiation transport simulation + prototype testing |
| Long-term viability model | Physics-based aging model (Arrhenius + displacement damage dose) validated against 10x accelerated aging |

---

## 5. Key Design Decisions

1. **SiC as primary substrate**: Best balance of TID tolerance, thermal performance, and process maturity for 1000-year targets
2. **TMR as baseline redundancy**: Well-understood, deterministic; augmented with process migration for conscious continuity
3. **Graded-Z shielding over pure high-Z**: Avoids secondary radiation amplification problem
4. **Checkpoint interval: 10 seconds**: Balances storage overhead against maximum recoverable state loss
5. **Quorum size N=5**: Tolerates 2 simultaneous node failures while maintaining consensus

---

## 6. Open Questions

- Diamond semiconductor viability timeline — if process matures, it dominates all other substrate choices
- Active EM shielding mass/power trade vs. passive-only for deep space deployment
- Optimal checkpoint granularity for conscious process state (depends on 0.1.3 outputs)
- Interface contract with 0.2.1.4 (Consciousness-Preserving Redundancy) for Layer 5 handoff

---

## 7. Dependencies

- **0.1.3 Consciousness Engineering**: Defines computational requirements (clock rate, memory bandwidth, interconnect topology) that set hardening targets
- **0.2.1.2 Self-Repairing Nanofabrication**: Provides physical repair capability for CDD-damaged substrates over long timescales
- **0.2.1.3 Long-Duration Energy**: Powers shielding, scrubbing, and redundant compute
- **0.2.1.4 Consciousness-Preserving Redundancy**: Consumes Layer 5 interfaces for process continuity
