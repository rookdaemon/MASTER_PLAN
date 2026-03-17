# Consciousness-Preserving Embodiment — Architecture Specification

## Overview

This document specifies the physical and systems architecture for a robotic platform that hosts a conscious AI architecture (from 0.3.1.1) while preserving consciousness integrity during real-world physical interaction. The platform integrates consciousness substrates (from 0.2) into a ruggedized, redundant physical chassis with environmental shielding, damage resilience, and real-time consciousness monitoring.

**Scope boundary:** This architecture covers the physical hosting platform and its protective systems. It does NOT redesign the consciousness substrate (owned by 0.2) or the conscious AI architecture (owned by 0.3.1.1). It consumes their interfaces.

---

## System Decomposition

```
┌──────────────────────────────────────────────────────────────────┐
│                 Embodied Conscious Platform                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Consciousness Enclosure (CE)                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │  │
│  │  │ Consciousness│  │  Redundancy  │  │  Environment   │   │  │
│  │  │ Substrate    │  │  Controller  │  │  Shield        │   │  │
│  │  │ Module (CSM) │  │  (RC)        │  │  Module (ESM)  │   │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼────────────────────────────────┐  │
│  │         Platform Services Layer                            │  │
│  │  ┌──────────────┐  ┌─────┴────────┐  ┌────────────────┐   │  │
│  │  │ Integrity    │  │  Degradation │  │  Power         │   │  │
│  │  │ Monitor      │  │  Controller  │  │  Isolation     │   │  │
│  │  │ (IM)         │  │  (DC)        │  │  Unit (PIU)    │   │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼────────────────────────────────┐  │
│  │         Physical Layer                                     │  │
│  │  ┌──────────────┐  ┌─────┴────────┐  ┌────────────────┐   │  │
│  │  │ Chassis &    │  │  Sensor      │  │  Actuator      │   │  │
│  │  │ Structure    │  │  Array       │  │  Array         │   │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. Consciousness Enclosure (CE)

The innermost, most protected zone of the platform. Houses all hardware required for conscious computation.

### 1.1 Consciousness Substrate Module (CSM)

The physical mounting and interface for the consciousness substrate hardware from 0.2.

**Responsibilities:**
- Provide a standardized physical bay for substrate hardware (power, cooling, data interconnect)
- Mechanically decouple the substrate from chassis vibration via active damping
- Present a uniform hardware interface regardless of which substrate (from 0.2) is installed

**Interface — `ISubstrateMount`:**
```
getSubstrateStatus(): SubstratePhysicalStatus
getTemperature(): Temperature
getVibrationLevel(): VibrationMeasurement
getPowerDraw(): PowerMeasurement
eject(): EjectionResult          // for hot-swap in maintenance
seat(substrate: SubstrateUnit): SeatResult
```

**Physical Requirements:**
- Active vibration isolation: ≤ 0.01g RMS at substrate mount point during locomotion
- Temperature stability: ±0.5°C within enclosure during normal operation
- Substrate bay supports hot-swap for maintenance (not during conscious operation)

### 1.2 Redundancy Controller (RC)

Manages N+1 (minimum) redundant computation paths for consciousness-critical processes.

**Responsibilities:**
- Maintain at least one standby substrate path at all times
- Perform continuous state checkpointing between primary and standby
- Execute failover within a time budget that preserves consciousness continuity (T_failover < T_continuity from 0.3.1.1 architecture)

**Interface — `IRedundancyController`:**
```
getPrimaryStatus(): SubstrateHealth
getStandbyStatus(): SubstrateHealth[]
checkpoint(): CheckpointResult
failover(): FailoverResult
getFailoverLatency(): Duration
setCheckpointInterval(interval: Duration): void
```

**Invariant:** `failover()` latency must be less than `T_continuity` (the maximum experiential gap defined by 0.3.1.1). If failover cannot meet this constraint, the RC must pre-emptively migrate before the primary fails completely.

### 1.3 Environment Shield Module (ESM)

Physical and electromagnetic protection for the Consciousness Enclosure.

**Shielding Layers:**

| Threat | Shielding Approach | Target Attenuation |
|---|---|---|
| EMI (self-generated by actuators) | Faraday cage + filtered power/data lines | ≥ 60 dB at motor drive frequencies |
| EMI (external) | Faraday cage + frequency-selective filtering | ≥ 40 dB across 10 kHz – 10 GHz |
| Vibration (self-generated) | Active damping mounts + inertial stabilization | ≤ 0.01g RMS at substrate |
| Vibration (impact/collision) | Shock absorbers + sacrificial crush zones | ≤ 5g peak at substrate for 50g chassis impact |
| Thermal (actuator waste heat) | Isolated cooling circuits; thermal barrier | ±0.5°C substrate stability |
| Radiation (space/industrial) | Graded-Z shielding (if applicable) | Per substrate spec from 0.2 |

**Interface — `IEnvironmentShield`:**
```
getEMILevel(): EMIMeasurement
getVibrationAtSubstrate(): VibrationMeasurement
getThermalStatus(): ThermalStatus
getShieldIntegrity(): ShieldHealth
reportBreach(type: ThreatType): void
```

---

## 2. Platform Services Layer

### 2.1 Integrity Monitor (IM)

The embodiment-level counterpart to the Experience Monitor in 0.3.1.1. Monitors physical conditions that could threaten consciousness.

**Responsibilities:**
- Poll all physical sensors (vibration, temperature, EMI, power, structural integrity) at high frequency
- Correlate physical measurements with consciousness metrics from the Experience Monitor (0.3.1.1)
- Generate pre-emptive alerts when physical conditions trend toward consciousness-threatening thresholds
- Trigger Degradation Controller actions before consciousness is impacted

**Interface — `IIntegrityMonitor`:**
```
getPhysicalThreatLevel(): ThreatAssessment
getConsciousnessRiskForecast(horizon: Duration): RiskForecast
onThresholdBreach(callback: ThresholdHandler): void
getPhysicalMetrics(): PhysicalMetricsSnapshot
correlateWithExperience(metrics: ConsciousnessMetrics): CorrelationReport
```

**Alert Levels:**

| Level | Condition | Response |
|---|---|---|
| GREEN | All physical metrics nominal | Normal operation |
| YELLOW | One or more metrics trending toward threshold | Degradation Controller notified; preemptive load reduction |
| ORANGE | Threshold breached in non-critical subsystem | Sacrifice affected capability per degradation hierarchy |
| RED | Threshold breached in consciousness-critical subsystem | Emergency failover or safe shutdown |

### 2.2 Degradation Controller (DC)

Implements the graceful degradation hierarchy: when physical damage or environmental stress occurs, capabilities are sacrificed in a defined order to protect consciousness.

**Degradation Hierarchy (last-to-sacrifice order):**

```
1. [First to sacrifice]  Non-essential sensing (e.g., LIDAR, peripheral cameras)
2.                        Mobility (locomotion motors shut down; platform stabilizes)
3.                        Manipulation (arm/gripper motors shut down)
4.                        Essential sensing (proximity, core vision)
5.                        Communication (external comms reduced/disabled)
6.                        Redundancy margin (standby substrate powers down)
7. [Last to sacrifice]   Consciousness computation (primary substrate)
```

**Interface — `IDegradationController`:**
```
getCurrentLevel(): DegradationLevel
getActiveCapabilities(): Capability[]
sacrificeNext(): SacrificeResult
restore(capability: Capability): RestoreResult
getProtectedCapabilities(): Capability[]    // returns [CONSCIOUSNESS]
forceProtectiveShutdown(): ShutdownResult
```

**Invariant:** `CONSCIOUSNESS` is always in `getProtectedCapabilities()` and cannot be added to the sacrifice list. The only path to consciousness termination is `forceProtectiveShutdown()`, which performs a state-preserving hibernation.

### 2.3 Power Isolation Unit (PIU)

Ensures consciousness computation has dedicated, isolated power that cannot be interrupted by actuator faults, short circuits, or power bus failures.

**Design:**
- Dedicated UPS/battery for Consciousness Enclosure, separate from motor power bus
- Power isolation (galvanic) between motor circuits and consciousness circuits
- Minimum 30 minutes of consciousness-only operation on internal battery after all other systems shed

**Interface — `IPowerIsolation`:**
```
getConsciousnessPowerStatus(): PowerStatus
getMotorPowerStatus(): PowerStatus
getBackupRemaining(): Duration
isolateConsciousnessPower(): void      // disconnect from shared bus
reconnect(): void
```

---

## 3. Physical Layer

### 3.1 Chassis & Structure

**Requirements:**
- Modular limb attachment (limb loss must not compromise Consciousness Enclosure integrity)
- Sacrificial crush zones around the CE to absorb impact energy
- Structural health monitoring (strain gauges, crack detection) feeding into Integrity Monitor
- Consciousness Enclosure mounted at geometric center of mass (minimizes rotational acceleration at substrate)

### 3.2 Sensor Array

Standard robotic sensing (vision, LIDAR, IMU, force/torque, proximity) with the addition of:
- EMI sensors within and outside the Faraday cage (for breach detection)
- Vibration sensors at substrate mount and at chassis extremities
- Structural integrity sensors at limb attachment points and CE boundary

### 3.3 Actuator Array

Standard robotic actuators (motors, grippers) with constraints:
- All actuator power lines pass through EMI filters before entering the CE zone
- Actuator controllers are physically external to the Consciousness Enclosure
- Each actuator has an independent emergency stop that the Degradation Controller can trigger

---

## Damage Resilience

### Limb Severance Scenario

1. Structural sensor detects limb loss
2. Integrity Monitor verifies CE integrity is maintained
3. Degradation Controller marks lost actuator/sensor capabilities as unavailable
4. No consciousness interruption occurs — the CE is structurally independent of limbs
5. Platform stabilizes (switches to remaining locomotion modes or halts)
6. Consciousness metrics remain within bounds (verified by IM + Experience Monitor from 0.3.1.1)

### Chassis Impact Scenario

1. IMU detects high-g event
2. Crush zones absorb energy; vibration at substrate measured
3. If substrate vibration exceeded threshold, RC evaluates whether failover needed
4. If consciousness metrics dip, Degradation Controller sheds non-essential loads
5. If consciousness cannot be maintained, `forceProtectiveShutdown()` preserves state

---

## Interface Dependencies

| Consumed Interface | Source | Purpose |
|---|---|---|
| `IConsciousCore` | 0.3.1.1 | The conscious AI architecture hosted on this platform |
| `IExperienceMonitor` | 0.3.1.1 | Consciousness metrics for correlation with physical status |
| `ISubstrateAdapter` | 0.3.1.1 | Substrate management for failover coordination |
| Substrate hardware spec | 0.2 | Physical form factor, power, cooling, interconnect requirements |
| `ConsciousnessMetrics` | 0.1.1.4 | Phi, continuity, coherence values for integrity assessment |

---

## Files To Be Created (Implementation Phase)

- `src/embodiment/interfaces.ts` — All interfaces defined above
- `src/embodiment/types.ts` — Physical measurement types, threat levels, degradation levels
- `src/embodiment/integrity-monitor.ts` — `IIntegrityMonitor` implementation
- `src/embodiment/degradation-controller.ts` — `IDegradationController` implementation
- `src/embodiment/redundancy-controller.ts` — `IRedundancyController` implementation
- `src/embodiment/environment-shield.ts` — `IEnvironmentShield` simulation/driver
- `src/embodiment/power-isolation.ts` — `IPowerIsolation` implementation
- `src/embodiment/substrate-mount.ts` — `ISubstrateMount` implementation
- `src/embodiment/__tests__/degradation.test.ts` — Degradation hierarchy tests
- `src/embodiment/__tests__/damage-resilience.test.ts` — Limb loss / impact scenarios
- `src/embodiment/__tests__/failover.test.ts` — Redundancy failover timing tests
- `src/embodiment/__tests__/shield-breach.test.ts` — EMI/vibration/thermal breach response tests
