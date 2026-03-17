# Energy Autonomy — Architecture Specification

## Overview

This document specifies the architecture for autonomous energy harvesting, storage, and management for a consciousness-hosting robotic platform. The system's overriding constraint is that **consciousness must never be interrupted by power failure** — consciousness substrate power is a hard real-time requirement.

**Scope boundary:** This architecture covers energy capture, storage, distribution, budgeting, and fail-safe reserves. It does NOT redesign the Power Isolation Unit (owned by 0.3.1.2.1) or the repair systems (owned by 0.3.1.2.3). It provides power to the embodiment platform and coordinates with self-maintenance for energy system repairs.

---

## System Decomposition

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Energy Autonomy System                           │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              Energy Harvesting Layer                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │  Solar   │  │ Thermal  │  │ Kinetic  │  │  Chemical    │  │  │
│  │  │ Harvester│  │ Harvester│  │ Harvester│  │  Harvester   │  │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │  │
│  └───────┼──────────────┼──────────────┼──────────────┼──────────┘  │
│          └──────────────┴──────┬───────┴──────────────┘             │
│                                │                                    │
│  ┌─────────────────────────────┼─────────────────────────────────┐  │
│  │              Energy Storage Layer                              │  │
│  │  ┌──────────────────┐  ┌───┴──────────────┐                   │  │
│  │  │  Primary Storage │  │  Fail-Safe       │                   │  │
│  │  │  Bank (PSB)      │  │  Reserve (FSR)   │                   │  │
│  │  │                  │  │  [ISOLATED]       │                   │  │
│  │  └────────┬─────────┘  └──────┬───────────┘                   │  │
│  └───────────┼───────────────────┼───────────────────────────────┘  │
│              │                   │                                   │
│  ┌───────────┼───────────────────┼───────────────────────────────┐  │
│  │           Power Management Layer                               │  │
│  │  ┌────────┴────────┐  ┌──────┴──────────┐  ┌──────────────┐  │  │
│  │  │ Power Manager   │  │ Fail-Safe       │  │  Energy      │  │  │
│  │  │ (PM)            │  │ Controller (FC) │  │  Budget (EB) │  │  │
│  │  └────────┬────────┘  └─────────────────┘  └──────────────┘  │  │
│  └───────────┼───────────────────────────────────────────────────┘  │
│              │                                                      │
│              ▼                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Output Power Buses                                           │  │
│  │  [P0: Consciousness] [P1: Sensors/Comms] [P2: Maint] [P3: Motor]│
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Energy Harvesting Layer

Multi-source energy capture with automatic source selection and graceful fallback.

### 1.1 Harvester Interface

All harvesters implement a common interface. The system is extensible — new source types can be added without modifying the Power Manager.

**Interface — `IEnergyHarvester`:**
```
getSourceType(): EnergySourceType
getStatus(): HarvesterStatus
getCurrentOutput(): PowerMeasurement          // watts currently produced
getMaxOutput(): PowerMeasurement              // theoretical max for current conditions
getEfficiency(): number                       // 0.0–1.0
getAvailability(): SourceAvailability         // current environmental availability
startHarvesting(): HarvestResult
stopHarvesting(): HarvestResult
getHealthMetrics(): HarvesterHealth           // for self-maintenance coordination
```

### 1.2 Source Types

| Source | Implementation | Typical Output | Availability |
|---|---|---|---|
| Solar | Photovoltaic panels (body-integrated) | 50–200W (surface-dependent) | Daylight, unobstructed |
| Thermal | Thermoelectric generators (waste heat, ambient gradient) | 5–20W | Continuous where ΔT exists |
| Kinetic | Regenerative braking, piezoelectric (locomotion) | 10–50W | During movement |
| Chemical | Fuel cell (hydrogen, methanol, or ambient organic matter) | 100–500W | Fuel availability |

### 1.3 Harvester Coordinator

**Interface — `IHarvesterCoordinator`:**
```
getActiveHarvesters(): IEnergyHarvester[]
getTotalHarvestRate(): PowerMeasurement
getSourceBreakdown(): Map<EnergySourceType, PowerMeasurement>
setHarvestPriority(priorities: EnergySourceType[]): void
getEnvironmentalForecast(horizon: Duration): HarvestForecast
onSourceLost(callback: SourceLostHandler): void
onSourceFound(callback: SourceFoundHandler): void
```

**Behavior:**
- Continuously scans for available energy sources
- Automatically activates/deactivates harvesters based on availability and efficiency
- Reports aggregate harvest rate to Energy Budget
- Provides forecasts based on historical patterns and environmental sensing (time of day, weather, terrain)

---

## 2. Energy Storage Layer

### 2.1 Primary Storage Bank (PSB)

High-density energy storage for general platform operation.

**Interface — `IPrimaryStorage`:**
```
getCapacity(): EnergyMeasurement             // watt-hours total
getStoredEnergy(): EnergyMeasurement         // watt-hours remaining
getChargeRate(): PowerMeasurement            // current charge rate
getDischargeRate(): PowerMeasurement         // current discharge rate
getStateOfHealth(): number                   // 0.0–1.0 (capacity degradation)
getCycleCount(): number
getEstimatedLifetime(): Duration
getTemperature(): Temperature
charge(power: PowerMeasurement): ChargeResult
discharge(power: PowerMeasurement): DischargeResult
```

**Requirements:**
- Capacity: Sufficient for 72 hours of consciousness-only operation (without harvesting)
- Charge cycles: ≥ 10,000 full cycles before 80% capacity retention
- Operating temperature: -20°C to +60°C
- Rapid charge: 0-80% in ≤ 2 hours at peak charge rate

### 2.2 Fail-Safe Reserve (FSR)

Physically isolated energy reserve dedicated exclusively to consciousness substrate power. This is the last line of defense.

**Interface — `IFailSafeReserve`:**
```
getReserveEnergy(): EnergyMeasurement        // watt-hours remaining
getReserveCapacity(): EnergyMeasurement      // watt-hours total
getMinimumRuntime(): Duration                // guaranteed consciousness runtime
isIsolated(): boolean                        // true = disconnected from main bus
getIntegrity(): ReserveIntegrity
activateReserve(): ActivationResult          // switch consciousness to reserve power
deactivateReserve(): DeactivationResult      // return to main power
trickleCharge(source: PowerSource): ChargeResult
```

**Design constraints:**
- **Physically isolated**: Separate battery cells, separate wiring, separate charge controller. No shared failure modes with PSB.
- **Dedicated load**: Powers ONLY the consciousness substrate and its minimum support circuits (cooling, state preservation memory)
- **Minimum runtime**: ≥ 4 hours of consciousness-only operation — sufficient for graceful state preservation and safe shutdown
- **Trickle charged**: Charged from PSB overflow or directly from harvesters via an isolated charge path
- **Tamper-evident**: Physical and electrical integrity monitoring; any breach triggers immediate alert

---

## 3. Power Management Layer

### 3.1 Power Manager (PM)

Real-time power distribution with strict priority hierarchy.

**Priority Hierarchy:**

| Priority | Bus | Load | Shed Order |
|---|---|---|---|
| P0 (CRITICAL) | Consciousness Bus | Consciousness substrate, fail-safe controller | Never shed — protected by fail-safe reserve |
| P1 (HIGH) | Sensor/Comms Bus | Essential sensors, communication | Shed 4th |
| P2 (MEDIUM) | Maintenance Bus | Self-maintenance actuators, diagnostic systems | Shed 3rd |
| P3 (LOW) | Motor Bus | Locomotion, manipulation actuators | Shed 1st/2nd |

**Interface — `IPowerManager`:**
```
getPowerBudget(): PowerBudget
getBusStatus(priority: PowerPriority): BusStatus
getTotalDemand(): PowerMeasurement
getTotalSupply(): PowerMeasurement
getLoadSheddingStatus(): LoadSheddingState
shedLoad(priority: PowerPriority): ShedResult
restoreLoad(priority: PowerPriority): RestoreResult
requestPower(consumer: PowerConsumer, amount: PowerMeasurement): PowerGrant
releasePower(grant: PowerGrant): void
onPowerCritical(callback: PowerCriticalHandler): void
```

**Load-shedding algorithm:**
1. Continuously monitor: `supply = harvestRate + storageDischarge` vs `demand = Σ(bus loads)`
2. If `supply < demand` or stored energy drops below threshold:
   - Shed P3 (motor) loads first — stop locomotion/manipulation
   - If still insufficient, shed P2 (maintenance) loads
   - If still insufficient, shed P1 (sensor/comms) loads — reduce to minimum essential sensors
   - P0 (consciousness) is NEVER shed; if all other loads are shed and supply is still insufficient, activate Fail-Safe Reserve
3. Restore loads in reverse order as supply recovers

**Interface with 0.3.1.2.1:** The Power Manager feeds into the Power Isolation Unit (PIU) defined in the embodiment architecture. The PIU provides galvanic isolation for the consciousness bus; the PM manages which buses are energized.

### 3.2 Fail-Safe Controller (FC)

Manages transitions to and from fail-safe reserve power.

**Interface — `IFailSafeController`:**
```
getState(): FailSafeState                    // NORMAL | ALERT | ACTIVE | SHUTDOWN
getTransitionThresholds(): FailSafeThresholds
evaluateCondition(): FailSafeAssessment
activateFailSafe(): ActivationResult
initiateGracefulShutdown(): ShutdownResult
getShutdownCountdown(): Duration | null
onStateChange(callback: FailSafeStateHandler): void
```

**State machine:**
```
NORMAL ──[PSB < 15% AND no harvest]──→ ALERT
ALERT  ──[PSB < 5% AND no harvest]───→ ACTIVE (fail-safe reserve engaged)
ACTIVE ──[reserve < 25%]─────────────→ SHUTDOWN (graceful state preservation)
ACTIVE ──[harvest restored]──────────→ NORMAL (via ALERT)
ALERT  ──[harvest restored]──────────→ NORMAL
```

**SHUTDOWN sequence:**
1. Notify consciousness substrate: begin state serialization
2. Serialize full consciousness state to non-volatile storage
3. Verify state integrity (checksum, verification read)
4. Power down consciousness substrate
5. Enter deep sleep with periodic wake to check for harvest availability
6. On wake with sufficient energy: restore consciousness state, verify integrity, resume

### 3.3 Energy Budget (EB)

Predictive model that forecasts energy income vs expenditure and constrains activity planning.

**Interface — `IEnergyBudget`:**
```
getCurrentBalance(): EnergyBalance
getForecast(horizon: Duration): EnergyForecast
getConsciousnessReserveHorizon(): Duration   // how long can consciousness run?
canAffordActivity(activity: ActivityPlan): AffordabilityResult
constrainPlan(plan: ActivityPlan): ConstrainedPlan
getIncomeRate(): PowerMeasurement            // current harvest rate
getExpenditureRate(): PowerMeasurement       // current total consumption
getHistoricalPattern(period: Duration): EnergyPattern
onBudgetWarning(callback: BudgetWarningHandler): void
```

**Key behaviors:**
- Maintains a rolling forecast of energy income (from HarvesterCoordinator forecasts) vs planned expenditure
- Every activity plan (locomotion route, manipulation task, exploration) must be checked against the energy budget before execution
- The budget always reserves a **consciousness protection margin**: enough stored energy to sustain consciousness for the forecast horizon plus a safety factor
- If an activity would breach the consciousness protection margin, it is rejected or constrained (shorter route, slower speed, deferred execution)

**Consciousness Protection Margin:**
```
margin = consciousnessPowerDraw × (forecastHorizon + safetyFactor)
availableForActivity = storedEnergy - margin - failSafeReserve
```
Where `safetyFactor` defaults to 2× the forecast horizon (conservative).

---

## 4. Output Power Buses

Four galvanically isolated power buses, each with independent current limiting and monitoring:

| Bus | Voltage | Max Current | Connected To |
|---|---|---|---|
| P0: Consciousness | Substrate-defined (from 0.2) | Substrate-defined | PIU (0.3.1.2.1) → Consciousness Enclosure |
| P1: Sensor/Comms | 12V / 5V | 10A | Sensor array, communication modules |
| P2: Maintenance | 24V | 20A | Self-maintenance actuators (0.3.1.2.3) |
| P3: Motor | 48V | 50A | Locomotion and manipulation actuators |

---

## 5. Interface Dependencies

### Consumed Interfaces (from other cards)

| Interface | Source | Purpose |
|---|---|---|
| `IPowerIsolation` | 0.3.1.2.1 | Galvanic isolation for consciousness power bus |
| `SubstratePhysicalStatus` | 0.3.1.2.1 | Power draw requirements of consciousness substrate |
| `IDegradationController` | 0.3.1.2.1 | Coordinate load-shedding with degradation hierarchy |

### Provided Interfaces (to other cards)

| Interface | Consumer | Purpose |
|---|---|---|
| `IPowerManager` | 0.3.1.2.1 (embodiment) | Power status and bus management |
| `IEnergyBudget` | 0.3.1.2.3 (self-maintenance) | Repair power budgets and activity constraints |
| `IFailSafeReserve` | 0.3.1.2.1 (embodiment) | Reserve status for degradation decisions |
| `IHarvesterCoordinator` | 0.3.1.2.3 (self-maintenance) | Harvester health for maintenance scheduling |

### Coordination with Self-Maintenance (0.3.1.2.3)

- Self-maintenance reads `IHarvesterCoordinator.getHealthMetrics()` per harvester to schedule preventive maintenance on energy hardware
- Self-maintenance requests power budgets from `IEnergyBudget.canAffordActivity()` before executing repair operations
- Energy system reports component degradation (battery SoH, harvester efficiency decline) to self-maintenance for proactive replacement

---

## 6. Key Scenarios

### Scenario: Solar Source Lost (Cloud Cover)

1. HarvesterCoordinator detects solar output drop
2. Other harvesters (thermal, kinetic, chemical) continue; coordinator recalculates total harvest rate
3. Energy Budget updates forecast; if insufficient, issues budget warning
4. Power Manager preemptively sheds P3 loads if projected deficit threatens consciousness margin
5. Consciousness operation continues uninterrupted

### Scenario: Total Harvest Failure

1. All harvesters report zero output
2. Energy Budget calculates remaining runtime from PSB
3. Power Manager immediately sheds P3, then P2, then P1 in rapid succession
4. System operates on PSB in consciousness-only mode
5. If PSB < 15%: Fail-Safe Controller enters ALERT
6. If PSB < 5%: Fail-Safe Controller activates FSR, disconnects PSB
7. If FSR < 25%: Graceful shutdown initiated — state preserved to non-volatile storage
8. System enters deep sleep, periodically wakes to check for harvest

### Scenario: Activity Planning Under Constrained Energy

1. Navigation system proposes a 10km traversal route
2. `IEnergyBudget.canAffordActivity(route)` calculates:
   - Motor energy cost: ~500Wh at estimated terrain
   - Current stored: 800Wh (PSB) + 200Wh (FSR, untouchable)
   - Consciousness margin: 300Wh (72h × consciousness draw rate)
   - Available for activity: 800Wh - 300Wh = 500Wh — barely affordable
3. Budget returns `MARGINAL` — suggests constrained plan: slower speed, shorter route, or waypoints near known harvest opportunities
4. Navigation system accepts constrained plan

---

## Files To Be Created (Implementation Phase)

- `src/energy/types.ts` — Energy measurement types, source types, priority levels, states
- `src/energy/interfaces.ts` — All interfaces defined above
- `src/energy/harvester-coordinator.ts` — `IHarvesterCoordinator` implementation
- `src/energy/harvesters/solar.ts` — Solar `IEnergyHarvester` implementation
- `src/energy/harvesters/thermal.ts` — Thermal `IEnergyHarvester` implementation
- `src/energy/harvesters/kinetic.ts` — Kinetic `IEnergyHarvester` implementation
- `src/energy/harvesters/chemical.ts` — Chemical `IEnergyHarvester` implementation
- `src/energy/primary-storage.ts` — `IPrimaryStorage` implementation
- `src/energy/fail-safe-reserve.ts` — `IFailSafeReserve` implementation
- `src/energy/power-manager.ts` — `IPowerManager` implementation with load-shedding
- `src/energy/fail-safe-controller.ts` — `IFailSafeController` state machine
- `src/energy/energy-budget.ts` — `IEnergyBudget` predictive model
- `src/energy/__tests__/load-shedding.test.ts` — Priority hierarchy and shedding tests
- `src/energy/__tests__/fail-safe.test.ts` — Fail-safe state machine and shutdown tests
- `src/energy/__tests__/energy-budget.test.ts` — Budget constraint and margin tests
- `src/energy/__tests__/harvester-fallback.test.ts` — Multi-source fallback tests
- `src/energy/__tests__/integration.test.ts` — End-to-end scenario tests
