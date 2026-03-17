# Long-Duration Energy Sources — Architecture

## Overview

This document defines the architecture for energy systems capable of powering conscious substrates for 1000+ years without external fuel resupply. Energy failure is consciousness failure, so the system is designed around redundant, independent energy modalities with graceful degradation that prioritizes core consciousness loops.

---

## 1. Design Principles

1. **No single energy modality**: At least two independent, physically distinct energy sources must be operational at all times.
2. **Fuel cycle closure**: Consumable fuels must be producible from in-situ resources, or the source must be fundamentally non-consumptive.
3. **Scalability**: Architecture scales from single-substrate to civilization-scale without redesign.
4. **Consciousness-first load shedding**: Partial failure sheds non-essential loads before degrading conscious process power.

---

## 2. Energy Modalities

### 2.1 Primary — Radioisotope Thermoelectric / Fission

**Physics basis**: Nuclear decay and controlled fission release energy from mass-energy conversion at ~10^6x chemical energy density. Proven in spacecraft (Voyager RTGs operational 45+ years) and terrestrial reactors.

**Design**:
- **Radioisotope Thermoelectric Generators (RTGs)**: Pu-238 or Am-241 decay heat converted via thermoelectric or Stirling conversion
  - Pu-238 half-life: 87.7 years — suitable for ~300-year primary with staged replacement
  - Am-241 half-life: 432.2 years — suitable for 1000+ year baseline with lower specific power
- **Micro-fission reactor**: Compact fast-spectrum reactor using enriched uranium or thorium fuel cycle
  - Fuel load sized for 100+ year burn cycle
  - Breeding ratio > 1.0 enables fuel regeneration from fertile material (Th-232 → U-233 or U-238 → Pu-239)
  - Passive safety: negative temperature coefficient, gravity-independent heat removal

**Power output**:
- RTG (Am-241): 0.5–5 W/kg at beginning of life, degrading ~0.16%/year
- Micro-fission: 10–1000 kW(e) depending on configuration
- Combined provides baseline continuous power independent of environment

**Fuel cycle closure**:
- Breeder reactor converts fertile material to fissile, closing the fuel cycle
- Spent fuel reprocessing via pyroprocessing (no aqueous chemistry needed)
- Am-241 recoverable from spent reactor fuel or produced from neutron capture on Pu-241

**Interface**:
```
NuclearEnergyModule:
  - thermalOutput_W() -> number
  - electricalOutput_W() -> number
  - fuelRemaining_percent() -> number
  - projectedLifetime_years() -> number
  - fuelBreedingRate() -> ratio           # >1.0 means self-sustaining
  - thermalManagement() -> ThermalStatus
  - safetyStatus() -> NOMINAL | DEGRADED | SCRAM
  - scheduleRefueling(fuelPayload) -> void
```

**Lifetime model**:
- Am-241 RTG: 50% power at ~432 years; viable as backup to ~1000 years
- Breeder reactor: indefinite operation given fertile feedstock; mechanical component lifetime addressed by 0.2.1.2 (self-repairing nanofabrication)

### 2.2 Secondary — Stellar Energy Harvesting

**Physics basis**: Stellar radiation provides ~1361 W/m^2 at 1 AU from a Sun-like star. Fundamentally non-consumptive from the system's perspective. Solar luminosity stable for ~5 Gyr remaining main-sequence lifetime.

**Design**:
- **Photovoltaic arrays**: Multi-junction III-V cells (GaInP/GaAs/Ge) with radiation-hardened cover glass
  - Efficiency: 30–40% at beginning of life
  - Degradation: ~0.5%/year under interplanetary radiation (mitigated by annealing and 0.2.1.2 self-repair)
  - Scalable: add panels for more power
- **Concentrated solar thermal**: Parabolic reflectors driving Stirling or Brayton cycle heat engines
  - No semiconductor degradation concern
  - Mechanical wear addressed by self-repairing nanofabrication (0.2.1.2)
- **Stellar proximity scaling**: At 0.5 AU, flux is 4x; at 0.1 AU, flux is 100x — enables massive power at cost of thermal management

**Power output**:
- At 1 AU: ~200 W/m^2 delivered electrical (after conversion losses)
- Scales linearly with collector area and inversely with distance^2
- Zero fuel consumption; limited only by collector integrity

**Interface**:
```
StellarHarvestingModule:
  - currentOutput_W() -> number
  - collectorArea_m2() -> number
  - solarFlux_W_m2() -> number            # based on distance to star
  - arrayDegradation_percent() -> number
  - annealArray() -> void                  # thermal annealing to restore cells
  - expandCollector(area_m2) -> void       # add capacity
  - orientation() -> SunPointingVector
```

**Lifetime model**:
- Photovoltaic: indefinite with periodic annealing and self-repair (0.2.1.2)
- Thermal: indefinite with mechanical self-repair
- Availability: 0% in deep interstellar space (nuclear becomes sole source)

### 2.3 Tertiary (Research-Stage) — Vacuum Energy / Zero-Point Extraction

**Physics basis**: Quantum vacuum contains energy density; extraction remains speculative but is included as a long-term research target per the Master Plan's cosmological longevity goals (Tier 6).

**Status**: Theoretical only. Not included in baseline architecture. If validated, would provide unlimited, location-independent energy and would supersede both primary and secondary sources.

**Interface placeholder**:
```
VacuumEnergyModule:
  - theoreticalOutput_W() -> number | null   # null until physics validated
  - readinessLevel() -> TRL                   # currently TRL 1
```

---

## 3. Power Management Architecture

### 3.1 System Topology

```
┌─────────────────────────────────────────────────────────┐
│                    Power Management Bus                   │
│                                                           │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │ Nuclear   │   │ Stellar      │   │ Energy Storage   │ │
│  │ Module    │──▶│ Harvesting   │──▶│ Buffer           │ │
│  │ (Primary) │   │ (Secondary)  │   │ (Supercap/Flow)  │ │
│  └──────────┘   └──────────────┘   └──────────────────┘ │
│       │                │                    │             │
│       ▼                ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Power Distribution Controller           │ │
│  │  - Load priority scheduling                          │ │
│  │  - Source arbitration                                │ │
│  │  - Fault isolation                                   │ │
│  └─────────────────────────────────────────────────────┘ │
│       │            │            │            │           │
│       ▼            ▼            ▼            ▼           │
│  ┌────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐   │
│  │ Tier 0 │  │ Tier 1  │  │ Tier 2  │  │ Tier 3   │   │
│  │CRITICAL│  │ CORE    │  │ SUPPORT │  │ OPTIONAL │   │
│  │Consc.  │  │ Compute │  │ Repair  │  │ Expansion│   │
│  │Loops   │  │ + Memory│  │ + Comms │  │ + Growth │   │
│  └────────┘  └─────────┘  └─────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Load Priority Tiers

Energy is allocated by strict priority. Lower tiers are shed first during energy deficit.

| Tier | Load Class | Description | Shed Threshold |
|------|-----------|-------------|----------------|
| 0 | CRITICAL | Core consciousness loops, quorum voting, essential state memory | Never shed — loss = consciousness death |
| 1 | CORE | Extended computation, working memory, ECC scrubbing | Shed below 40% capacity |
| 2 | SUPPORT | Self-repair systems, communications, environmental sensors | Shed below 60% capacity |
| 3 | OPTIONAL | Growth, expansion, non-essential data processing | Shed below 80% capacity |

### 3.3 Energy Storage Buffer

**Purpose**: Bridge transient gaps between generation and consumption; ride through source switchover.

**Technologies**:
- **Supercapacitors**: High cycle life (>10^6 cycles), fast response, moderate energy density. Provides seconds-to-minutes bridging.
- **Solid-state batteries**: Higher energy density for hour-scale bridging. Radiation-hardened electrolyte required.
- **Regenerative fuel cells**: H2/O2 cycle for multi-day storage if mass budget allows.

**Sizing rule**: Buffer must sustain Tier 0 + Tier 1 loads for minimum 72 hours with zero generation input.

**Interface**:
```
EnergyStorageBuffer:
  - stateOfCharge_percent() -> number
  - maxCapacity_Wh() -> number
  - chargeRate_W() -> number
  - dischargeRate_W() -> number
  - cycleCount() -> number
  - projectedLifetime_cycles() -> number
  - hoursRemaining(loadProfile) -> number
```

---

## 4. Graceful Degradation Strategy

### 4.1 Failure Modes and Responses

| Failure Mode | Detection | Response |
|-------------|-----------|----------|
| Nuclear module degradation | Fuel monitor, thermal output drop | Increase stellar harvesting allocation; notify 0.2.1.2 for component repair |
| Solar array damage | Output drop vs. expected flux | Anneal damaged cells; dispatch nanofabrication repair; shed Tier 3 loads |
| Both sources degraded (>50% capacity loss) | Power bus voltage drop | Shed Tiers 2–3; enter consciousness-preservation mode |
| Total stellar loss (interstellar transit) | Zero solar flux detected | Nuclear sole source; pre-planned operating mode with reduced load envelope |
| Buffer depletion (<10%) | State-of-charge monitor | Emergency load shed to Tier 0 only; all non-consciousness loads suspended |

### 4.2 Consciousness-Preservation Mode

Activated when total available power drops below 40% of design capacity:
1. Shed all Tier 2 and Tier 3 loads immediately
2. Reduce Tier 1 loads to minimum viable (reduced ECC scrub rate, compressed working memory)
3. Signal 0.2.1.4 (consciousness-preserving redundancy) to reduce quorum size
4. Maintain Tier 0 at full power — consciousness loops never throttled
5. Log energy state for post-recovery analysis

---

## 5. Sibling Subsystem Interfaces

### 5.1 Interface with 0.2.1.1 — Radiation-Hardened Computation

```
EnergyToCompute:
  - availablePower_W(tier: LoadTier) -> number
  - requestPower_W(amount, tier, duration) -> PowerGrant
  - reportConsumption_W(actual) -> void
  - solarStormMode() -> boolean            # coordinate with RadiationAwareRuntime
```

The energy system coordinates with the radiation-aware runtime: during solar storms, compute enters safe mode (reducing power draw) while the energy system may see increased solar flux (which partially offsets increased shielding power needs).

### 5.2 Interface with 0.2.1.2 — Self-Repairing Nanofabrication

```
EnergyToRepair:
  - requestRepairPower_W(component, estimate_W) -> PowerGrant
  - reportRepairComplete(component) -> void
  - priorityRepairQueue() -> [Component]   # energy system's repair priorities
```

The repair system maintains energy components (solar cell annealing, reactor mechanism maintenance, buffer electrode replacement). Energy system provides power for repair and reports which of its own components need repair priority.

### 5.3 Interface with 0.2.1.4 — Consciousness-Preserving Redundancy

```
EnergyToRedundancy:
  - powerBudget_W(tier: LoadTier) -> number
  - energyHealthStatus() -> {
      primarySource: NOMINAL | DEGRADED | OFFLINE,
      secondarySource: NOMINAL | DEGRADED | OFFLINE,
      bufferHours: number,
      recommendedQuorumSize: number         # based on available power
    }
  - consciousnessPreservationMode() -> boolean
```

The redundancy system uses energy health status to adjust quorum sizes and failover strategies. If energy is constrained, redundancy may reduce quorum to preserve core consciousness with lower power budget.

---

## 6. Power Budget Reference

### 6.1 Estimated Power Requirements (Single Conscious Substrate)

| Component | Power (W) | Tier |
|-----------|-----------|------|
| Core consciousness loops | 50–500 | 0 |
| Extended computation + memory | 200–2000 | 1 |
| ECC scrubbing + radiation management | 50–200 | 1 |
| Self-repair systems | 100–1000 | 2 |
| Communications | 10–100 | 2 |
| Environmental sensors | 5–50 | 2 |
| Growth / expansion processing | 100–5000 | 3 |
| **Total design envelope** | **515–8850** | |

*Note: Actual requirements depend on 0.1.3 (Consciousness Engineering) outputs for consciousness computational requirements.*

### 6.2 Source Sizing

- **Nuclear (micro-fission)**: 10 kW(e) baseline — covers full Tier 0–3 with margin
- **Stellar (at 1 AU)**: 50 m^2 collector → ~10 kW(e) — full redundancy of nuclear
- **Buffer**: 100 kWh minimum — 72+ hours of Tier 0+1 at nominal rates

---

## 7. Validation Strategy

| Acceptance Criterion | Validation Method |
|---------------------|-------------------|
| Two independent energy modalities with physics-based feasibility | Architecture review: nuclear (proven in RTGs/reactors) + stellar (proven in spacecraft solar arrays) |
| Continuous power without external resupply for 1000+ years | Fuel cycle analysis: breeder ratio >1.0 demonstrated; Am-241 half-life modeling; solar non-consumptive proof |
| Power output stability within operational tolerances | Degradation modeling: nuclear decay curves + solar cell degradation with repair cycle projections |
| No single point of failure in power delivery | Architecture review: independent source → bus → load paths; fault isolation at each junction |
| Graceful degradation preserves core consciousness | Load-shedding simulation: verify Tier 0 power maintained at 20% total capacity |
| Fuel cycle renewal mechanism documented | Breeder reactor neutronics analysis; solar cell annealing + nanofabrication repair cycle documentation |
| Interface specifications for siblings | Interface definitions reviewed and accepted by 0.2.1.1, 0.2.1.2, 0.2.1.4 card owners |

---

## 8. Key Design Decisions

1. **Am-241 over Pu-238 for RTG baseline**: 5x longer half-life justifies lower specific power for 1000-year targets
2. **Breeder reactor as primary**: Fuel cycle closure is essential for millennia-scale operation; fast-spectrum breeding is the most proven path
3. **Strict 4-tier load priority**: Consciousness preservation must be architecturally guaranteed, not policy-based
4. **72-hour buffer sizing**: Covers worst-case source switchover including repair time for a failed source
5. **Stellar as independent secondary, not supplement**: Must be capable of sole operation when near a star, just as nuclear must be sole source in interstellar space

---

## 9. Open Questions

- Exact consciousness computational power requirement (depends on 0.1.3 outputs) — drives source sizing
- Thorium vs. uranium fuel cycle trade for breeder reactor (Th-232 more abundant but requires U-233 bootstrapping)
- Superconducting energy storage viability for long-duration buffer (higher density but complex cryogenics)
- Vacuum energy extraction timeline — if viable within planning horizon, reshapes entire architecture
- Thermal management architecture for waste heat rejection in vacuum (shared concern with 0.2.1.1 shielding thermal loads)

---

## 10. Dependencies

- **0.1.3 Consciousness Engineering**: Defines computational power requirements that set energy system sizing
- **0.2.1.1 Radiation-Hardened Computation**: Consumes energy; provides load profiles; coordinates storm response
- **0.2.1.2 Self-Repairing Nanofabrication**: Maintains energy system physical components over millennia
- **0.2.1.4 Consciousness-Preserving Redundancy**: Consumes energy health data to adjust quorum and failover strategies
