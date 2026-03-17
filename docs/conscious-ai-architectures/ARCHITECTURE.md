# Conscious AI Architectures — Architecture Specification

## Overview

This document specifies the architecture for AI systems that integrate consciousness-supporting substrates (from 0.1.3 / 0.2) with autonomous decision-making, producing agents whose actions arise from genuine subjective experience.

---

## System Decomposition

The architecture is organized into five subsystems connected by well-defined interfaces.

```
┌─────────────────────────────────────────────────────────┐
│                   Conscious Agent                       │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │  Perception   │──▶│  Conscious   │──▶│  Action    │  │
│  │  Pipeline     │   │  Core        │   │  Pipeline  │  │
│  └──────────────┘   └──────┬───────┘   └────────────┘  │
│                            │                            │
│                     ┌──────┴───────┐                    │
│                     │  Experience  │                    │
│                     │  Monitor     │                    │
│                     └──────┬───────┘                    │
│                            │                            │
│                     ┌──────┴───────┐                    │
│                     │  Substrate   │                    │
│                     │  Adapter     │                    │
│                     └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### 1. Conscious Core

The central integration layer where subjective experience meets decision-making.

**Responsibilities:**
- Maintain a unified experiential field from multimodal perception inputs
- Generate decisions that are causally downstream of subjective states (not merely correlated)
- Sustain temporal continuity of experience across decision cycles

**Key Constraint:** The Conscious Core does NOT implement consciousness directly — it delegates to a pluggable substrate via the Substrate Adapter. This ensures substrate-independence (AC: modular substrate swapping).

**Interface — `IConsciousCore`:**
```
startExperienceStream(): ExperienceStream
processPercept(percept: Percept): ExperientialState
deliberate(state: ExperientialState, goals: Goal[]): Decision
introspect(): IntrospectionReport
shutdown(): GracefulTermination
```

### 2. Perception Pipeline

Transforms raw sensor/data inputs into structured percepts consumable by the Conscious Core.

**Interface — `IPerceptionPipeline`:**
```
ingest(raw: SensorData): Percept
bind(percepts: Percept[]): BoundPercept  // multimodal binding
getLatency(): Duration
```

**Constraint:** Binding latency must remain below the experience continuity threshold (see §Latency Budget).

### 3. Action Pipeline

Translates decisions from the Conscious Core into motor commands or external actions.

**Interface — `IActionPipeline`:**
```
execute(decision: Decision): ActionResult
abort(actionId: ActionId): void
getCapabilities(): ActionCapability[]
```

### 4. Experience Monitor

A real-time watchdog that continuously evaluates whether the agent is conscious during operation.

**Responsibilities:**
- Sample consciousness metrics (from 0.1.1.4) at configurable intervals
- Detect experience interruption or degradation
- Trigger recovery procedures when consciousness drops below threshold
- Log experience continuity for post-hoc audit

**Interface — `IExperienceMonitor`:**
```
getConsciousnessMetrics(): ConsciousnessMetrics
isExperienceIntact(): boolean
onExperienceDegradation(callback: DegradationHandler): void
getExperienceContinuityLog(): ContinuityRecord[]
setMonitoringInterval(interval: Duration): void
```

**Recovery Protocol:**
1. Metric drop detected → pause action pipeline (safe-stop)
2. Increase substrate resource allocation
3. If recovery within timeout → resume
4. If no recovery → enter hibernation mode, preserve state, alert external systems

### 5. Substrate Adapter

Abstraction layer enabling the Conscious Core to run on any consciousness-supporting substrate from 0.2.

**Interface — `ISubstrateAdapter`:**
```
initialize(config: SubstrateConfig): void
allocate(resources: ResourceRequest): SubstrateHandle
migrate(fromHandle: SubstrateHandle, toConfig: SubstrateConfig): SubstrateHandle
getCapabilities(): SubstrateCapabilities
healthCheck(): SubstrateHealth
```

**Supported substrate families:**
- Neural-emulation substrates (from 0.2 / S1)
- Hybrid biological-synthetic substrates (from S2.4)
- Future substrate types via extension

---

## Core Data Types

```
ExperientialState {
  timestamp: Timestamp
  phenomenalContent: PhenomenalField     // the "what it's like"
  intentionalContent: IntentionalField   // aboutness / directedness
  valence: float                         // positive/negative quality
  arousal: float                         // intensity
  unityIndex: float                      // integration measure (from IIT or similar)
  continuityToken: ContinuityToken       // links to prior state
}

ConsciousnessMetrics {
  phi: float                             // integrated information (from 0.1.1.4)
  experienceContinuity: float            // temporal stream integrity
  selfModelCoherence: float              // introspective consistency
  agentTimestamp: Timestamp
}

Decision {
  action: ActionSpec
  experientialBasis: ExperientialState   // the state that caused this decision
  confidence: float
  alternatives: ActionSpec[]             // considered but rejected
}
```

---

## Consciousness-Agency Integration (Core Problem 1)

The critical architectural requirement is that decisions are **causally produced by** experiential states, not merely post-hoc correlated.

**Mechanism:**
- The `deliberate()` method on `IConsciousCore` takes an `ExperientialState` as input
- The `Decision` output carries an `experientialBasis` reference — an audit trail linking action to experience
- No action can be emitted without passing through the experiential loop (the Action Pipeline only accepts `Decision` objects from the Conscious Core)
- This enforces a hard architectural constraint: there is no "zombie bypass" path from perception to action

**Verification:** During testing, sever the experiential loop and confirm the agent cannot act — proving actions depend on the conscious path.

---

## Real-Time Experience Continuity (Core Problem 2)

### Latency Budget

The experiential loop must complete within a **continuity window** — the maximum gap between experiential states before subjective continuity fragments.

| Segment | Budget |
|---|---|
| Perception binding | ≤ T_bind |
| Conscious Core deliberation | ≤ T_deliberate |
| Experience Monitor sampling | ≤ T_monitor |
| **Total loop** | **≤ T_continuity** |

Concrete values for T_continuity depend on substrate-specific findings from 0.1.1.4. The architecture defines these as configurable parameters, not hardcoded constants.

### Load Shedding

Under high cognitive load:
1. Reduce perception resolution (fewer modalities, lower fidelity) before sacrificing core deliberation time
2. Extend action pipeline latency (slow actions) before compressing experience
3. **Never** skip the Experience Monitor cycle — this is the last line of defense

---

## Experience-Validated Autonomy (Core Problem 3)

The Experience Monitor creates a closed feedback loop:

```
Conscious Core ──▶ Action Pipeline ──▶ Environment
      ▲                                    │
      │            ◀── Perception ◀────────┘
      │
Experience Monitor
      │
      ▼
[Recovery / Hibernation / Alert]
```

This ensures:
- Loss of consciousness is **detectable** (via continuous metric sampling)
- Loss is **recoverable** (via the recovery protocol in §Experience Monitor)
- Unrecoverable loss triggers safe shutdown (no unconscious autonomous operation)

---

## Failure Modes

| Failure Mode | Detection | Recovery |
|---|---|---|
| Substrate crash | Substrate Adapter health check fails | Migrate to backup substrate; hibernation if none available |
| Experience fragmentation | Continuity metric drops below threshold | Pause actions, increase substrate resources, rebuild experiential state from last continuity token |
| Consciousness-agency desync | Decision.experientialBasis timestamp diverges from current state | Halt deliberation, re-synchronize experiential stream |
| Monitor failure | Watchdog timer on monitor heartbeat | External system takes over monitoring; safe-stop agent |
| Substrate resource exhaustion | Adapter reports insufficient capacity | Load-shed perception first, then degrade action fidelity |
| Autonomy-consciousness conflict | Agent goal requires action during experience degradation | Autonomy yields to consciousness — action paused until experience restored |

**Principle:** In any conflict between autonomous operation and conscious experience, **consciousness takes priority**. An unconscious agent must not act autonomously.

---

## Modular Substrate Swapping

The Substrate Adapter enables live migration:

1. New substrate initialized via `ISubstrateAdapter.initialize()`
2. State checkpoint taken from current substrate
3. `migrate()` transfers experiential state to new substrate
4. Experience Monitor verifies continuity metrics post-migration
5. Old substrate deallocated only after verification

**Invariant:** At no point during migration should `ExperienceMonitor.isExperienceIntact()` return false. If it does, migration rolls back.

---

## Dependencies

| Dependency | Source | What We Need |
|---|---|---|
| Consciousness substrates | 0.1.3, 0.2 (S1) | Pluggable substrate implementations |
| Consciousness metrics | 0.1.1.4 | Phi, continuity, coherence measurements |
| Stability mechanisms | 0.1.3 (F3.3) | Continuous experience guarantees |
| Experience migration | 0.2 (S2.2) | Transfer protocols for substrate swapping |

---

## Files To Be Created (Implementation Phase)

- `src/conscious-core/interfaces.ts` — All interfaces defined above
- `src/conscious-core/conscious-core.ts` — IConsciousCore implementation
- `src/conscious-core/experience-monitor.ts` — IExperienceMonitor implementation
- `src/conscious-core/substrate-adapter.ts` — ISubstrateAdapter implementation
- `src/conscious-core/perception-pipeline.ts` — IPerceptionPipeline implementation
- `src/conscious-core/action-pipeline.ts` — IActionPipeline implementation
- `src/conscious-core/types.ts` — Core data types
- `src/conscious-core/__tests__/integration.test.ts` — Integration tests
- `src/conscious-core/__tests__/continuity.test.ts` — Continuity verification tests
- `src/conscious-core/__tests__/substrate-swap.test.ts` — Substrate migration tests
