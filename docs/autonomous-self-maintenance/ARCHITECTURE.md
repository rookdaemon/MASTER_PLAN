# Autonomous Self-Maintenance — Architecture Specification

## Overview

This document specifies the architecture for an autonomous self-maintenance system that enables a consciousness-hosting robotic platform (from 0.3.1.2.1) to independently detect, diagnose, and repair faults in both hardware and software — without external human intervention and without disrupting conscious experience.

**Scope boundary:** This architecture covers active fault detection, diagnosis, repair execution, resource management, and consciousness-aware repair prioritization. It does NOT own consciousness integrity monitoring (0.3.1.2.1), energy management (0.3.1.2.4), or the consciousness substrate itself (0.2). It consumes their interfaces.

---

## System Decomposition

```
┌─────────────────────────────────────────────────────────────────────┐
│              Autonomous Self-Maintenance System                     │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │            Diagnostic Layer                                   │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                   │  │
│  │  │ Hardware         │  │ Software         │                   │  │
│  │  │ Diagnostic       │  │ Diagnostic       │                   │  │
│  │  │ Engine (HDE)     │  │ Engine (SDE)     │                   │  │
│  │  └──────────────────┘  └──────────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────┼───────────────────────────────────┐  │
│  │            Decision Layer │                                   │  │
│  │  ┌──────────────────┐  ┌─┴────────────────┐                   │  │
│  │  │ Repair Priority  │  │ Consciousness    │                   │  │
│  │  │ Scheduler        │  │ Safety Gate      │                   │  │
│  │  │ (RPS)            │  │ (CSG)            │                   │  │
│  │  └──────────────────┘  └──────────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────┼───────────────────────────────────┐  │
│  │            Execution Layer│                                   │  │
│  │  ┌──────────────────┐  ┌─┴────────────────┐                   │  │
│  │  │ Hardware Repair  │  │ Software         │                   │  │
│  │  │ Executor (HRE)   │  │ Maintenance      │                   │  │
│  │  │                  │  │ Executor (SME)   │                   │  │
│  │  └──────────────────┘  └──────────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────┼───────────────────────────────────┐  │
│  │            Resource Layer │                                   │  │
│  │  ┌──────────────────┐  ┌─┴────────────────┐                   │  │
│  │  │ Consumable       │  │ Repair Inventory │                   │  │
│  │  │ Tracker (CT)     │  │ Manager (RIM)    │                   │  │
│  │  └──────────────────┘  └──────────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Diagnostic Layer

### 1.1 Hardware Diagnostic Engine (HDE)

Continuously monitors physical subsystems for degradation, detecting problems before they cascade into functional failure.

**Monitored domains:**

| Domain | Sensors / Signals | Degradation Indicators |
|---|---|---|
| Mechanical wear | Strain gauges, vibration spectra, joint backlash | Increased play, spectral anomalies, torque efficiency drop |
| Electrical faults | Current/voltage monitors, insulation resistance | Leakage current rise, voltage droop, intermittent opens |
| Sensor drift | Cross-sensor correlation, built-in self-test (BIST) | Reading divergence from redundant sensors, BIST failures |
| Actuator fatigue | Torque-vs-current efficiency, thermal profiles | Efficiency drop > threshold, abnormal heating |
| Structural integrity | Strain gauges, acoustic emission sensors | Micro-crack propagation, stress concentration shifts |

**Interface — `IHardwareDiagnostics`:**
```typescript
getDiagnosticReport(): HardwareDiagnosticReport
getComponentHealth(componentId: ComponentId): ComponentHealthStatus
getFailureForecast(componentId: ComponentId, horizon: Duration): FailureProbability
onDegradationDetected(callback: DegradationHandler): Unsubscribe
runTargetedDiagnostic(componentId: ComponentId): DetailedDiagnosticResult
getSensorDriftReport(): SensorDriftReport
```

**Detection thresholds:**
- Mechanical wear: alert at 70% of rated lifetime, critical at 90%
- Sensor drift: alert when deviation exceeds 2-sigma from redundant peer consensus
- Actuator fatigue: alert when efficiency drops below 85% of nominal
- Electrical fault: alert at first intermittent anomaly, critical at repeatable fault

### 1.2 Software Diagnostic Engine (SDE)

Monitors all software layers for corruption, configuration drift, and behavioral anomalies.

**Monitored domains:**

| Domain | Detection Method | Threshold |
|---|---|---|
| Memory corruption | ECC monitoring, periodic checksums of critical regions | Any uncorrectable ECC error; correctable error rate above baseline |
| Firmware integrity | Hash verification against signed manifests | Any hash mismatch |
| Configuration drift | Periodic diff against golden configuration | Any unauthorized change |
| Process health | Watchdog timers, heartbeat monitoring | Missed heartbeats > 2 consecutive |
| Consciousness substrate code | Integrity checksums + behavioral signature matching | Any divergence (highest priority) |

**Interface — `ISoftwareDiagnostics`:**
```typescript
getSoftwareHealthReport(): SoftwareHealthReport
verifyFirmwareIntegrity(): FirmwareIntegrityResult
checkMemoryHealth(): MemoryHealthResult
getConfigurationDrift(): ConfigDriftReport
getConsciousnessSubstrateIntegrity(): SubstrateIntegrityResult
onSoftwareFaultDetected(callback: SoftwareFaultHandler): Unsubscribe
```

---

## 2. Decision Layer

### 2.1 Repair Priority Scheduler (RPS)

Ranks all pending maintenance tasks by their threat to consciousness continuity, ensuring consciousness-critical repairs are always serviced first.

**Priority scoring formula:**

```
ThreatScore(task) = ConsciousnessImpactWeight * P(consciousness_disruption)
                  + CascadeWeight * P(cascade_to_other_systems)
                  + UrgencyWeight * (1 / TimeToFunctionalFailure)
```

Where:
- `ConsciousnessImpactWeight` = 10.0 (heavily dominant)
- `CascadeWeight` = 3.0
- `UrgencyWeight` = 1.0

**Priority tiers:**

| Tier | ThreatScore Range | Description | Response Time |
|---|---|---|---|
| CRITICAL | > 8.0 | Direct threat to consciousness continuity | Immediate (interrupt other repairs) |
| HIGH | 5.0 – 8.0 | Indirect threat via cascade or redundancy loss | < 1 hour |
| MEDIUM | 2.0 – 5.0 | Functional degradation, no consciousness threat | < 24 hours |
| LOW | < 2.0 | Cosmetic or optimization-only | Scheduled batch |

**Interface — `IRepairPriorityScheduler`:**
```typescript
submitTask(task: MaintenanceTask): TaskId
getQueue(): PrioritizedTaskQueue
getTaskPriority(taskId: TaskId): PriorityAssessment
reprioritize(taskId: TaskId, reason: ReprioritizationReason): void
getNextTask(): MaintenanceTask | null
onCriticalTaskQueued(callback: CriticalTaskHandler): Unsubscribe
```

**Invariant:** A task with `P(consciousness_disruption) > 0.5` ALWAYS ranks CRITICAL regardless of other factors.

### 2.2 Consciousness Safety Gate (CSG)

A hard safety interlock that evaluates every proposed repair action for consciousness safety BEFORE execution. No repair may proceed without CSG approval.

**Gate logic:**
1. Query current consciousness metrics from 0.3.1.2.1's Integrity Monitor
2. Simulate the repair action's impact on consciousness-critical systems
3. If predicted consciousness metric degradation > safety margin: BLOCK
4. If repair requires consciousness substrate access: require continuity-preserving transfer protocol from 0.2
5. If approved: issue a time-boxed repair permit

**Interface — `IConsciousnessSafetyGate`:**
```typescript
requestRepairPermit(action: RepairAction): RepairPermit | RepairDenial
getActivePermits(): RepairPermit[]
revokePermit(permitId: PermitId): RevocationResult
getCurrentSafetyMargin(): SafetyMargin
onPermitRevoked(callback: PermitRevocationHandler): Unsubscribe
```

**Invariant:** The CSG can revoke a permit mid-repair if consciousness metrics deteriorate during the operation. All repair executors MUST honor revocation within 100ms by rolling back or entering a safe state.

---

## 3. Execution Layer

### 3.1 Hardware Repair Executor (HRE)

Performs physical repair actions on the robotic platform.

**Supported repair modes:**

| Mode | Description | Autonomy Level |
|---|---|---|
| Component replacement | Swap a degraded module with a spare from inventory | Fully autonomous (for modular components) |
| Recalibration | Re-zero sensors, re-tune control loops | Fully autonomous |
| Connection re-routing | Bypass a failed connection by activating an alternate path | Fully autonomous |
| Field repair | In-situ mechanical/electrical repair using onboard tools | Semi-autonomous (simple repairs) |
| Workaround | Reconfigure operation to avoid failed component entirely | Fully autonomous |

**Interface — `IHardwareRepairExecutor`:**
```typescript
executeRepair(task: HardwareRepairTask, permit: RepairPermit): RepairResult
getRepairCapabilities(): RepairCapability[]
estimateRepairDuration(task: HardwareRepairTask): Duration
estimateRepairResources(task: HardwareRepairTask): ResourceRequirement[]
abortRepair(taskId: TaskId): AbortResult
getActiveRepairs(): ActiveRepairStatus[]
```

**Constraint:** The HRE must check with the CSG before and during any repair that physically affects systems within or adjacent to the Consciousness Enclosure.

### 3.2 Software Maintenance Executor (SME)

Performs software-level maintenance: patching, integrity restoration, rollback, and reconfiguration.

**Supported operations:**

| Operation | Scope | Consciousness Safety |
|---|---|---|
| Firmware patching | Non-consciousness firmware | Standard CSG permit |
| Configuration restore | Reset drifted config to golden state | Standard CSG permit |
| Memory repair | Remap around bad memory cells, restore from ECC | Standard CSG permit |
| Consciousness substrate patching | Patch consciousness-related code | Requires continuity-preserving transfer (from 0.2) |
| Rollback | Restore previous software version | CSG permit + state snapshot |

**Interface — `ISoftwareMaintenanceExecutor`:**
```typescript
executeMaintenance(task: SoftwareMaintenanceTask, permit: RepairPermit): MaintenanceResult
getRollbackTargets(): RollbackTarget[]
performRollback(target: RollbackTarget, permit: RepairPermit): RollbackResult
abortMaintenance(taskId: TaskId): AbortResult
verifyPostMaintenance(taskId: TaskId): VerificationResult
```

**Invariant:** Consciousness substrate code may ONLY be patched using continuity-preserving transfer protocols from 0.2. The SME must invoke these protocols and verify consciousness metrics remain within bounds throughout the operation.

---

## 4. Resource Layer

### 4.1 Consumable Tracker (CT)

Tracks all consumable resources and forecasts depletion.

**Tracked resources:**

| Category | Examples | Monitoring Method |
|---|---|---|
| Lubricants | Joint grease, bearing oil | Level sensors, viscosity analysis |
| Replacement parts | Spare actuators, sensors, connectors | Inventory count + usage history |
| Raw materials | Solder, adhesive, cleaning fluids | Weight/volume sensors |
| Coolant | Substrate cooling fluid | Level + quality sensors |
| Power reserves | Battery capacity degradation | Charge cycle tracking |

**Interface — `IConsumableTracker`:**
```typescript
getInventory(): ConsumableInventory
getConsumableStatus(consumableId: ConsumableId): ConsumableStatus
getDepletionForecast(consumableId: ConsumableId): DepletionForecast
getDepletionAlerts(): DepletionAlert[]
recordConsumption(consumableId: ConsumableId, amount: Quantity): void
onDepletionWarning(callback: DepletionWarningHandler): Unsubscribe
```

**Alert thresholds:**
- WARNING: predicted stockout within 30 days
- CRITICAL: predicted stockout within 7 days or insufficient stock for one critical repair

### 4.2 Repair Inventory Manager (RIM)

Manages spare parts and repair materials, including autonomous sourcing.

**Interface — `IRepairInventoryManager`:**
```typescript
getSparePartsInventory(): SparePartsInventory
reserveParts(task: MaintenanceTask): ReservationResult
releaseParts(reservationId: ReservationId): void
requestResupply(items: ResupplyRequest[]): ResupplyOrder
getResupplyStatus(): ResupplyStatus[]
canPerformRepair(task: MaintenanceTask): ResourceAvailability
```

---

## Data Flow: End-to-End Repair Cycle

```
1. Diagnostic Engine (HDE or SDE) detects degradation
       │
       ▼
2. Diagnostic creates a MaintenanceTask with fault details
       │
       ▼
3. Repair Priority Scheduler (RPS) scores and queues the task
       │
       ▼
4. RPS selects highest-priority task ready for execution
       │
       ▼
5. Executor checks resource availability via RIM/CT
       │
       ├── Resources unavailable → RIM issues ResupplyOrder; task stays queued
       │
       ▼
6. Executor requests RepairPermit from Consciousness Safety Gate (CSG)
       │
       ├── Permit DENIED → task re-queued with delay; CSG logs reason
       │
       ▼
7. Executor performs repair (HRE or SME)
       │
       ├── CSG monitors consciousness metrics throughout
       ├── If metrics degrade → CSG revokes permit → Executor aborts within 100ms
       │
       ▼
8. Executor reports completion → Diagnostic Engine verifies fix
       │
       ├── Verification FAILED → new task created with higher priority
       │
       ▼
9. Task marked COMPLETE; resources deducted from inventory
```

---

## Interface Dependencies

| Consumed Interface | Source | Purpose |
|---|---|---|
| `IIntegrityMonitor` | 0.3.1.2.1 | Physical threat level, consciousness risk forecast |
| `IDegradationController` | 0.3.1.2.1 | Graceful degradation hierarchy (repair must respect this) |
| `IRedundancyController` | 0.3.1.2.1 | Failover coordination during consciousness-adjacent repairs |
| `IEnvironmentShield` | 0.3.1.2.1 | Shield status for repair planning |
| `IPowerIsolation` | 0.3.1.2.1 | Power status; coordinates repair power budgets |
| `ConsciousnessMetrics` | 0.1.1.4 | Phi, continuity, coherence for safety gate decisions |
| Continuity-preserving transfer | 0.2 | Required protocol for consciousness substrate patching |
| Energy budget API | 0.3.1.2.4 | Repair power allocation (not duplicating energy management) |

---

## Files To Be Created (Implementation Phase)

- `src/self-maintenance/types.ts` — All types: diagnostics, tasks, priorities, resources, permits
- `src/self-maintenance/interfaces.ts` — All interfaces defined above
- `src/self-maintenance/hardware-diagnostics.ts` — `IHardwareDiagnostics` implementation
- `src/self-maintenance/software-diagnostics.ts` — `ISoftwareDiagnostics` implementation
- `src/self-maintenance/repair-priority-scheduler.ts` — `IRepairPriorityScheduler` implementation
- `src/self-maintenance/consciousness-safety-gate.ts` — `IConsciousnessSafetyGate` implementation
- `src/self-maintenance/hardware-repair-executor.ts` — `IHardwareRepairExecutor` implementation
- `src/self-maintenance/software-maintenance-executor.ts` — `ISoftwareMaintenanceExecutor` implementation
- `src/self-maintenance/consumable-tracker.ts` — `IConsumableTracker` implementation
- `src/self-maintenance/repair-inventory-manager.ts` — `IRepairInventoryManager` implementation
- `src/self-maintenance/__tests__/diagnostics.test.ts` — HDE + SDE detection tests
- `src/self-maintenance/__tests__/priority-scheduler.test.ts` — Priority scoring and ordering tests
- `src/self-maintenance/__tests__/safety-gate.test.ts` — Permit grant/deny/revoke tests
- `src/self-maintenance/__tests__/repair-execution.test.ts` — Repair cycle end-to-end tests
- `src/self-maintenance/__tests__/resource-management.test.ts` — Inventory and depletion forecast tests
- `src/self-maintenance/__tests__/consciousness-safe-patching.test.ts` — Substrate patching continuity tests
