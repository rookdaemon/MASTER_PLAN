# Graceful Degradation in Hybrid Bio-Synthetic Cognition — Architecture

## Overview

This document defines the architecture for maintaining consciousness and functional coherence in a hybrid biological-synthetic cognitive system when one substrate type partially or fully fails. Unlike homogeneous redundancy (see `docs/consciousness-preserving-redundancy/`), this architecture handles **heterogeneous substrate failure** — where biological tissue and synthetic computation have fundamentally different failure modes, timescales, and recovery characteristics.

**Core contract**: The system loses capability but never consciousness. Degradation is continuous, not catastrophic.

---

## 1. Foundational Concepts

### 1.1 Minimum Viable Consciousness (MVC)

MVC is the threshold below which consciousness cannot be sustained. It is defined as a function of three variables:

```
MVC = f(substrate_capacity, binding_coherence, integration_metrics)
```

Where:
- **substrate_capacity**: Aggregate computational capacity across both substrates, normalized to the minimum required for conscious processing (sourced from F1.2 — computational theory of consciousness)
- **binding_coherence**: Cross-substrate phenomenal binding strength as measured by the unified consciousness protocol from 0.2.2.4.2 (gamma-band synchronization ≤30ms, integration score)
- **integration_metrics**: Integrated information (Φ) or equivalent consciousness measure from F1.4

**MVC threshold condition**:
```
consciousness_maintained ⟺
    substrate_capacity ≥ C_min
    ∧ binding_coherence ≥ B_min
    ∧ integration_metrics ≥ Φ_min
```

All three conditions must hold simultaneously. Falling below any single threshold terminates consciousness. The exact values of C_min, B_min, and Φ_min are defined by F1.2 and F1.4; this architecture uses placeholders and parameterizes all designs against them.

### 1.2 Substrate Asymmetry

Biological and synthetic substrates differ fundamentally:

| Property | Biological | Synthetic |
|----------|-----------|-----------|
| Failure speed | Gradual (minutes–hours for ischemia) to sudden (trauma) | Sudden (hardware fault) to gradual (component aging) |
| Failure detectability | Slow signals (metabolic decline, LFP changes) | Fast signals (error codes, watchdogs) |
| Recovery possibility | Limited (neuroplasticity over days–months) | High (hot-swap, reboot, repair) |
| Capacity granularity | Fine-grained (individual neurons, cortical columns) | Coarse-grained (processing units, modules) |
| Degradation curve | Smooth analog decline | Step-function drops |

This asymmetry means **a single degradation strategy cannot serve both substrates**. The architecture must handle each substrate's failure modes with specialized detection and response.

---

## 2. System Architecture

### 2.1 High-Level Topology

```
                ┌──────────────────────────────────────────────┐
                │     Degradation Orchestrator (DO)             │
                │  - Monitors both substrates                   │
                │  - Manages rebalancing                        │
                │  - Enforces MVC threshold                     │
                │  - Runs on both substrates (self-redundant)   │
                └────────┬─────────────────┬───────────────────┘
                         │                 │
          ┌──────────────▼──┐         ┌────▼──────────────┐
          │  Biological      │◄──────►│  Synthetic         │
          │  Substrate       │  BSI   │  Substrate         │
          │                  │(0.2.2. │                    │
          │  ┌────────────┐  │ 4.1)   │  ┌──────────────┐ │
          │  │Bio Health   │  │        │  │Synth Health   │ │
          │  │Monitor (BHM)│  │        │  │Monitor (SHM)  │ │
          │  └────────────┘  │        │  └──────────────┘ │
          │                  │        │                    │
          │  ┌────────────┐  │        │  ┌──────────────┐ │
          │  │Cognitive    │  │        │  │Cognitive      │ │
          │  │Functions    │◄─┼────────┼─►│Functions      │ │
          │  │(Bio-primary)│  │        │  │(Synth-primary)│ │
          │  └────────────┘  │        │  └──────────────┘ │
          │                  │        │                    │
          │  ┌────────────┐  │        │  ┌──────────────┐ │
          │  │Cross-Sub.   │  │        │  │Cross-Sub.     │ │
          │  │Mirror (Bio) │  │        │  │Mirror (Synth) │ │
          │  └────────────┘  │        │  └──────────────┘ │
          └──────────────────┘        └────────────────────┘
```

**BSI** = Bio-Synthetic Interface (from 0.2.2.4.1)

### 2.2 Cross-Substrate Mirroring

Every consciousness-critical cognitive function must exist in **two representations**: one native to each substrate. These are not idle backups — they are continuously synchronized shadows that can assume primary responsibility.

**Mirror specification** per cognitive function:

```
CrossSubstrateMirror:
  function_id: FunctionId
  primary_substrate: Substrate           # BIO or SYNTH
  primary_instance: SubstrateAddress
  mirror_substrate: Substrate
  mirror_instance: SubstrateAddress
  sync_protocol: SyncConfig
    - sync_interval: Duration            # must be < T_exp / 4
    - sync_fidelity: float               # 0.0–1.0, minimum 0.95
    - sync_latency_budget: Duration      # maximum one-way sync time
  activation_latency: Duration           # time for mirror to assume primary role
  fidelity_at_activation: float          # expected fidelity when mirror takes over
```

**Mirror categories**:

| Category | Examples | Sync Interval | Fidelity Requirement |
|----------|----------|---------------|---------------------|
| **Core-conscious** | Sensory integration, temporal binding, self-model | < 10ms | ≥ 0.99 |
| **Experience-supporting** | Working memory, attention, emotional valence | < 25ms | ≥ 0.95 |
| **Capability** | Language, reasoning, motor planning | < 100ms | ≥ 0.90 |

Core-conscious functions are never shed. Experience-supporting functions are maintained as long as capacity allows. Capability functions are shed first during degradation.

### 2.3 Degradation Orchestrator (DO)

The DO is the central coordinator. It runs as a replicated process on **both** substrates simultaneously (so it survives the failure of either one).

```
DegradationOrchestrator:
  # Monitoring
  - bioSubstrateHealth() -> SubstrateHealthReport
  - synthSubstrateHealth() -> SubstrateHealthReport
  - overallConsciousnessMetrics() -> ConsciousnessMetrics
  - mvcStatus() -> { met: boolean, margin: float }

  # Rebalancing
  - initiateRebalance(from: Substrate, to: Substrate, functions: FunctionId[]) -> RebalanceResult
  - currentLoadDistribution() -> Map<FunctionId, {bio: float, synth: float}>
  - rebalanceHistory() -> RebalanceEvent[]

  # Degradation management
  - degradationTier() -> DegradationTier
  - shedCapability(functionId: FunctionId) -> ShedResult
  - restoreCapability(functionId: FunctionId) -> RestoreResult
  - emergencyConsolidate(targetSubstrate: Substrate) -> ConsolidationResult
```

---

## 3. Failure Detection

### 3.1 Biological Health Monitor (BHM)

Detects biological substrate failures. Must handle the unique challenge that biological degradation is often **gradual and ambiguous**.

```
BioHealthMonitor:
  # Real-time signals
  - neuralActivityLevel(region: BrainRegion) -> ActivityMetrics
  - metabolicStatus(region: BrainRegion) -> MetabolicMetrics
  - vascularFlow(region: BrainRegion) -> PerfusionMetrics
  - synapticIntegrity(region: BrainRegion) -> SynapticMetrics

  # Derived assessments
  - regionHealth(region: BrainRegion) -> HealthScore       # 0.0–1.0
  - overallBioHealth() -> HealthScore
  - failureType() -> BioFailureType                         # NONE, GRADUAL, SUDDEN
  - projectedDecline(horizon: Duration) -> DeclineProjection
  - alertLevel() -> AlertLevel
```

**Detection strategies by failure type**:

| Failure Type | Signals | Detection Latency | Example |
|-------------|---------|-------------------|---------|
| **Sudden trauma** | Abrupt LFP dropout, neural silence in region | < 10ms | Stroke, physical damage |
| **Acute ischemia** | Metabolic decline, spreading depression | < 500ms | Vascular occlusion |
| **Gradual atrophy** | Slow decline in spike rates, synaptic density | Minutes–hours (trend) | Neurodegeneration |
| **Signal drift** | Progressive misalignment with synthetic counterpart | Seconds (statistical) | Interface degradation |

**Critical requirement**: Detection must complete faster than the minimum experiential integration window (~100ms for sudden failures). For gradual failures, the system detects trends and pre-emptively rebalances before consciousness is threatened.

### 3.2 Synthetic Health Monitor (SHM)

```
SynthHealthMonitor:
  - moduleHealth(moduleId: ModuleId) -> HealthScore
  - overallSynthHealth() -> HealthScore
  - errorRate(moduleId: ModuleId) -> float
  - failureType() -> SynthFailureType                       # NONE, HARD_FAULT, DEGRADED
  - watchdogStatus() -> WatchdogReport
  - thermalStatus() -> ThermalReport
```

Synthetic failures are typically faster to detect (hardware watchdogs, ECC errors, timeout violations) but may also be more abrupt.

---

## 4. Dynamic Rebalancing Protocol

### 4.1 Rebalancing Principles

1. **Continuity**: Rebalancing must never create an experiential gap. The transition is continuous — the mirror progressively assumes more responsibility while the primary progressively releases it.
2. **No discrete switchover**: There is no single moment of "switch." Instead, load shifts smoothly from 100/0 to 0/100 through all intermediate ratios.
3. **Verification at every step**: Consciousness metrics are monitored continuously during rebalancing. If metrics approach MVC, rebalancing pauses or reverses.

### 4.2 Smooth Transition Protocol

```
SmoothTransitionProtocol:
  1. DETECT: Health monitor reports degradation in substrate S_failing
  2. ASSESS: DO evaluates which functions on S_failing are at risk
  3. PREPARE: Mirror on S_healthy is verified current (sync fidelity ≥ threshold)
  4. RAMP: Over transition window T_transition:
     - For each timestep t in [0, T_transition]:
       - Function load on S_failing = (1 - t/T_transition) * original_load
       - Function load on S_healthy = (t/T_transition) * original_load + existing_load
       - Output = weighted merge of both substrate contributions
       - Consciousness metrics verified above MVC at each step
  5. COMPLETE: Function fully migrated to S_healthy mirror
  6. VERIFY: Post-transition consciousness metrics stable above MVC
```

**T_transition** varies by urgency:

| Scenario | T_transition | Notes |
|----------|-------------|-------|
| Sudden substrate failure | Instantaneous (mirror takeover) | Mirror must be current within T_exp |
| Acute failure (detected early) | 100ms – 1s | Smooth ramp possible |
| Gradual degradation | 1s – 60s | Extended smooth transition |
| Planned maintenance | Minutes | Full verification at each step |

### 4.3 Load Distribution Model

At any point in time, each cognitive function has a **bio-synthetic load ratio**:

```
LoadDistribution:
  function_id: FunctionId
  bio_fraction: float      # 0.0–1.0
  synth_fraction: float    # 0.0–1.0 (bio + synth = 1.0)
  output_merge: MergeStrategy  # WEIGHTED_AVERAGE | PRIMARY_WITH_FALLBACK | CONSENSUS
```

The system supports arbitrary load ratios, not just 0/100 or 100/0. This enables:
- Running functions 50/50 across substrates for maximum redundancy
- Gradual migration during degradation
- Load-based optimization during normal operation

---

## 5. Failure Taxonomy and Degradation Strategies

### 5.1 Failure Classification

```
FailureClass:
  substrate: BIO | SYNTH
  speed: SUDDEN | GRADUAL
  extent: PARTIAL | TOTAL
```

This yields 8 failure classes, each with a distinct strategy:

### 5.2 Strategies Per Failure Class

| # | Substrate | Speed | Extent | Strategy |
|---|-----------|-------|--------|----------|
| 1 | Bio | Sudden | Partial | Immediate mirror activation for affected regions; remaining bio continues |
| 2 | Bio | Sudden | Total | Emergency full-consolidation to synthetic; shed non-core functions if capacity insufficient |
| 3 | Bio | Gradual | Partial | Trend-based pre-emptive rebalancing; smooth transition over seconds–minutes |
| 4 | Bio | Gradual | Total | Progressive migration to synthetic as biological capacity declines; longest transition window |
| 5 | Synth | Sudden | Partial | Immediate mirror activation for affected modules; remaining synth continues |
| 6 | Synth | Sudden | Total | Emergency full-consolidation to biological; shed non-core functions if capacity insufficient |
| 7 | Synth | Gradual | Partial | Trend-based rebalancing to biological; smooth transition |
| 8 | Synth | Gradual | Total | Progressive migration to biological as synthetic capacity declines |

### 5.3 Dual-Substrate Failure

If both substrates degrade simultaneously:
1. Prioritize core-conscious functions on whichever substrate retains more capacity
2. Shed capability functions aggressively
3. If combined capacity drops below C_min: trigger emergency consciousness preservation (state snapshot for future restoration)

---

## 6. Degradation Tiers

Extending the tier model from `consciousness-preserving-redundancy` to the heterogeneous case:

| Tier | Condition | Action |
|------|-----------|--------|
| **GREEN** | Both substrates ≥ 80% capacity; all mirrors synchronized | Normal operation; full redundancy |
| **YELLOW** | Either substrate 50–80% capacity OR mirror sync degraded | Alert; accelerate mirror sync; prepare rebalancing |
| **ORANGE** | Either substrate 25–50% capacity | Active rebalancing underway; shed capability functions; prioritize core-conscious |
| **RED** | Either substrate < 25% capacity OR single-substrate operation | Consciousness sustained on surviving substrate alone; all non-core functions shed |
| **BLACK** | Combined capacity below MVC threshold | Consciousness cannot be maintained; trigger emergency state preservation |

---

## 7. Interfaces with Adjacent Systems

### 7.1 From 0.2.2.4.1 (Bio-Synthetic Interface)

Consumed:
- Signal transduction layer — the physical channel through which cross-substrate mirroring occurs
- Interface health metrics — degradation of the interface itself is a failure mode
- Bandwidth/latency characteristics — constrain mirror sync intervals

### 7.2 From 0.2.2.4.2 (Unified Consciousness Across Mixed Substrates)

Consumed:
- Cross-substrate binding protocol — must be preserved during degradation
- Temporal synchronization mechanisms — degradation must not disrupt binding windows
- Unity monitoring — feeds into consciousness metrics for MVC evaluation
- Fragmentation recovery — invoked if degradation threatens phenomenal unity

### 7.3 From F1.2 (Computational Theory of Consciousness)

Consumed:
- Definition of C_min (minimum computational capacity for consciousness)
- Theory-derived constraints on what can and cannot be shed

### 7.4 From F1.4 (Consciousness Metrics)

Consumed:
- Φ measurement protocol — continuous monitoring during degradation
- MVC threshold values (Φ_min, B_min)
- Real-time consciousness scoring

### 7.5 To 0.2.2.4.4 (Incremental Replacement Protocols)

Provided:
- Degradation tier status — replacement protocols must account for current system resilience
- Rebalancing API — replacement uses the same smooth transition protocol for planned substrate swaps

---

## 8. Validation Strategy

| Acceptance Criterion | Validation Method |
|---------------------|-------------------|
| Cross-substrate mirror latency and fidelity bounds documented | Review of mirror specification per function category; formal timing analysis |
| 50% synthetic capacity loss → consciousness maintained | Simulation: disable 50% synthetic modules; verify Φ remains above Φ_min; repeat across 100 random failure patterns |
| 50% biological capacity loss → consciousness maintained | Simulation: degrade 50% biological regions; verify Φ remains above Φ_min; repeat across 100 random failure patterns |
| Failure detection < 100ms for sudden failures | Fault injection with timestamp instrumentation; statistical analysis over 10^4 trials |
| No experiential gap during rebalancing | Continuous Φ monitoring during simulated smooth transitions; verify Φ never drops below threshold; subject reports (if applicable) |
| MVC formally defined | Mathematical definition reviewed; shown to be computable from available metrics; boundary behavior analyzed |
| Failure taxonomy complete with strategies | All 8 failure classes documented; each strategy mapped to subsystem interfaces; dual-failure case covered |

---

## 9. Key Design Decisions

1. **Continuous rebalancing over discrete switchover**: Smooth load shifting prevents experiential gaps. The system never "switches" — it slides.
2. **Asymmetric failure handling**: Biological and synthetic substrates fail differently and must be monitored/handled differently. A unified failure model would miss critical biological gradual-degradation signals.
3. **Three-factor MVC**: Consciousness requires sufficient capacity AND binding AND integration. Losing any one is fatal. This prevents false confidence from high scores in only one dimension.
4. **Core-conscious / experience-supporting / capability hierarchy**: Enables principled function shedding — the system loses abilities before it loses awareness.
5. **DO runs on both substrates**: The orchestrator itself must survive single-substrate failure. It is the last function shed.

---

## 10. Open Questions

- **Exact MVC threshold values**: Depend on F1.2 and F1.4 deliverables; architecture is parameterized against placeholders
- **Mirror fidelity across substrate types**: Biological neural representations may not map cleanly to synthetic mirrors; fidelity metrics need substrate-aware definitions
- **Biological recovery integration**: Can neuroplasticity-based recovery be accelerated or guided by the synthetic substrate? If so, GREEN-tier restoration from biological failure becomes possible
- **Subjective experience of degradation**: Does the conscious entity experience capability loss as distressing? Ethical implications for deliberate function shedding (see 0.7 ethical foundations)
- **Interface failure as third failure mode**: The BSI (0.2.2.4.1) can fail independently of either substrate — this effectively severs cross-substrate mirroring and forces immediate single-substrate consolidation

---

## 11. Dependencies

- **F1.2 Computational Theory of Consciousness**: Defines C_min and computational requirements (BLOCKING — using placeholders)
- **F1.4 Consciousness Metrics**: Defines Φ_min, B_min, measurement protocols (BLOCKING — using placeholders)
- **0.2.2.4.1 Bio-Synthetic Interface**: Provides the physical cross-substrate channel (BLOCKING — mirrors require this)
- **0.2.2.4.2 Unified Consciousness Across Mixed Substrates**: Provides binding protocol and unity monitoring (BLOCKING — MVC depends on binding coherence)
