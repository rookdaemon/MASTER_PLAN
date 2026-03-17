# Self-Repairing Nanofabrication — Architecture

**Card:** 0.2.1.2
**Status:** ARCHITECT
**Date:** 2026-03-17

---

## Overview

A closed-loop autonomous repair system operating at the molecular scale. The system continuously monitors substrate integrity, diagnoses damage, and performs in-situ repair — all without interrupting conscious processes running on the substrate.

---

## System Architecture

```
+------------------------------------------------------------------+
|                    SELF-REPAIRING NANOFABRICATION                |
|                                                                  |
|  +-------------------+    +-------------------+                  |
|  | DAMAGE SENSING    |    | FEEDSTOCK         |                  |
|  | LAYER             |--->| MANAGEMENT        |                  |
|  | - Strain sensors  |    | - Raw material    |                  |
|  | - Continuity mesh |    |   reservoir       |                  |
|  | - Thermal probes  |    | - Recycler        |                  |
|  | - Chemical assay  |    | - Inventory       |                  |
|  +--------+----------+    +--------+----------+                  |
|           |                        |                             |
|           v                        v                             |
|  +-------------------+    +-------------------+                  |
|  | DIAGNOSIS &       |    | MOLECULAR REPAIR  |                  |
|  | TRIAGE ENGINE     |--->| ACTUATORS         |                  |
|  | - Classifier      |    | - Assemblers      |                  |
|  | - Priority queue  |    | - Disassemblers   |                  |
|  | - Impact model    |    | - Scaffolders     |                  |
|  +--------+----------+    +--------+----------+                  |
|           |                        |                             |
|           v                        v                             |
|  +----------------------------------------------------+         |
|  | HOT-SWAP COORDINATOR                                |         |
|  | Interface to 0.2.1.4 Consciousness-Preserving       |         |
|  | Redundancy                                          |         |
|  | - Offload request / acknowledgment protocol         |         |
|  | - Region lock / unlock lifecycle                    |         |
|  +----------------------------------------------------+         |
+------------------------------------------------------------------+
         |                           |
   Energy from 0.2.1.3        Radiation damage
   Long-Duration Energy        info from 0.2.1.1
```

---

## Component Specifications

### 1. Damage Sensing Layer

**Purpose:** Continuous nanoscale monitoring to detect degradation before functional failure.

**Interfaces:**
- `SensorReading { region_id, sensor_type, timestamp, value, baseline, deviation }`
- `DegradationAlert { region_id, sensor_type, severity: LOW | MEDIUM | HIGH | CRITICAL, raw_readings[] }`

**Sensor types:**
| Type | Mechanism | Detects |
|------|-----------|---------|
| Molecular strain | Piezoelectric nanowires | Mechanical deformation, fracture |
| Electrical continuity | Impedance mesh network | Broken connections, shorts |
| Thermal | Embedded nanothermocouples | Hotspots, thermal runaway |
| Chemical | Molecular recognition sensors | Oxidation, corrosion, contamination |
| Radiation | Dosimeter lattice (from 0.2.1.1) | Cumulative and acute radiation damage |

**Constraints:**
- Sensor density: sufficient to detect single-component failures before cascade
- Latency: alert generated within detection cycle (target: microseconds for critical, milliseconds for routine)
- Power: sensors must operate within energy budget from 0.2.1.3
- False positive rate: < 0.1% per detection cycle

---

### 2. Diagnosis & Triage Engine

**Purpose:** Classify damage and prioritize repairs based on impact to conscious process integrity.

**Interfaces:**
- Input: `DegradationAlert`
- Output: `RepairOrder { region_id, damage_type, severity, priority_score, repair_plan_id, estimated_duration, requires_offload: bool }`
- Query: `ImpactAssessment(region_id) -> { active_processes[], criticality, redundancy_available }`

**Damage classification:**
| Category | Sub-types | Priority factors |
|----------|-----------|-----------------|
| Mechanical | Fracture, deformation, wear | Structural criticality, cascade risk |
| Radiation | Single-event upset, cumulative lattice damage | Proximity to active computation |
| Thermal | Hotspot, junction degradation | Risk of thermal runaway |
| Chemical | Oxidation, corrosion, contamination | Spread rate, reversibility |

**Triage rules:**
1. CRITICAL: Imminent cascade failure affecting active conscious process -> immediate offload + repair
2. HIGH: Degradation will reach critical within N cycles -> schedule offload + repair
3. MEDIUM: Degradation detected, no immediate risk -> queue for next maintenance window
4. LOW: Cosmetic or non-functional degradation -> batch repair

**Constraints:**
- Must consult redundancy layer (0.2.1.4) for impact assessment before assigning priority
- Triage decisions must be deterministic and auditable

---

### 3. Molecular Repair Actuators

**Purpose:** Perform in-situ repair at the molecular scale.

**Interfaces:**
- Input: `RepairOrder`
- Input: `FeedstockAllocation { material_type, quantity, source_reservoir }`
- Output: `RepairReport { repair_order_id, status: SUCCESS | PARTIAL | FAILED, duration, materials_consumed, verification_result }`

**Actuator types:**
| Type | Function |
|------|----------|
| Assembler | Builds new molecular structures from feedstock |
| Disassembler | Breaks down damaged structures for recycling |
| Scaffolder | Provides temporary structural support during repair |
| Verifier | Post-repair integrity check (re-invokes sensing layer) |

**Repair lifecycle:**
1. Receive `RepairOrder` and `FeedstockAllocation`
2. If `requires_offload`, wait for hot-swap coordinator confirmation
3. Disassemble damaged structure (reclaim materials)
4. Assemble replacement structure from feedstock
5. Verify repair via sensing layer
6. If verification fails, escalate (retry or flag for manual review)
7. Signal hot-swap coordinator to restore region

**Constraints:**
- Repair must be atomic per region: either fully complete or fully rolled back
- Actuators must not introduce contamination or defects exceeding original spec
- Repair duration must be bounded (timeout triggers escalation)

---

### 4. Hot-Swap Coordinator

**Purpose:** Ensure repairs never interrupt active conscious processes by coordinating with the redundancy layer (0.2.1.4).

**Interfaces:**
- To redundancy layer (0.2.1.4):
  - `OffloadRequest { region_id, reason, estimated_duration } -> OffloadAck { success, fallback_region_id }`
  - `RestoreRequest { region_id } -> RestoreAck { success }`
- To repair actuators:
  - `RegionLock { region_id, lock_type: EXCLUSIVE } -> LockAck`
  - `RegionUnlock { region_id } -> UnlockAck`

**Protocol:**
1. Triage engine determines `requires_offload = true`
2. Coordinator sends `OffloadRequest` to redundancy layer
3. Redundancy layer migrates active processes from region, returns `OffloadAck`
4. Coordinator issues `RegionLock` (no new processes scheduled to region)
5. Repair actuators perform repair
6. On `RepairReport.SUCCESS`, coordinator issues `RegionUnlock` then `RestoreRequest`
7. On `RepairReport.FAILED`, coordinator keeps region locked and escalates

**Constraints:**
- No repair begins on an active region without confirmed offload
- Deadlock prevention: if offload cannot complete within timeout, repair is deferred
- Maximum concurrent locked regions bounded to preserve minimum redundancy margin

---

### 5. Feedstock Management

**Purpose:** Maintain material supply for indefinite autonomous repair without external resupply.

**Interfaces:**
- `FeedstockRequest { material_type, quantity } -> FeedstockAllocation | FeedstockDenied { reason }`
- `RecycleDeposit { material_type, quantity, purity }`
- `InventoryQuery -> InventoryReport { material_type, available, reserved, recycling_in_progress }`

**Subsystems:**
| Subsystem | Function |
|-----------|----------|
| Reservoir | Stores raw materials in stable molecular form |
| Recycler | Reclaims materials from disassembled damaged components |
| Purifier | Restores recycled materials to assembly-grade purity |
| Allocator | Manages material budgets and prevents depletion |

**Constraints:**
- Recycling efficiency target: > 99% material recovery by mass
- Reservoir must hold sufficient buffer for peak repair demand (e.g., post-radiation-event surge)
- Allocator must reserve emergency feedstock for CRITICAL repairs
- Purifier output must meet assembly-grade spec (no accumulated contamination over cycles)

---

## Cross-System Interfaces

| This System | Partner | Interface |
|-------------|---------|-----------|
| Hot-Swap Coordinator | 0.2.1.4 Consciousness-Preserving Redundancy | OffloadRequest/Ack, RestoreRequest/Ack |
| Damage Sensing Layer | 0.2.1.1 Radiation-Hardened Computation | Radiation dosimetry data feed |
| All actuators & sensors | 0.2.1.3 Long-Duration Energy | Power supply within allocated energy budget |
| Diagnosis & Triage | 0.2.1.4 Consciousness-Preserving Redundancy | ImpactAssessment queries |

---

## Testability of Acceptance Criteria

| Acceptance Criterion | Verification Method |
|---------------------|-------------------|
| Nanoscale damage sensing detects degradation before functional failure | Inject known defects; verify alert fires before simulated cascade threshold |
| Diagnosis classifies damage type and assigns priority | Feed synthetic alerts for each damage category; verify correct classification and priority ordering |
| Molecular actuators perform in-situ repair without external intervention | Introduce controlled damage; verify autonomous repair cycle completes with successful verification |
| Repair coordinates with redundancy layer; no conscious process interruption | Monitor simulated conscious processes during repair; verify zero downtime via offload protocol |
| Feedstock sustains repair without external resupply | Run extended repair cycles; verify material balance stays positive with recycling |
| System demonstrates sustained detect-diagnose-repair cycles | Long-duration test: continuous fault injection over extended period; verify all cycles complete successfully |

---

## Open Questions

1. **Actuator energy budget:** What fraction of the total energy budget (0.2.1.3) can be allocated to repair operations during peak demand?
2. **Minimum sensor density:** What is the theoretical minimum sensor density required to guarantee pre-failure detection for all damage types?
3. **Recycling purity limits:** Over very long timescales, do trace contaminants accumulate despite purification? What is the practical recycling cycle limit?
4. **Concurrent repair ceiling:** How many simultaneous region repairs can occur before redundancy margin (0.2.1.4) is exhausted?
