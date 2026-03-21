# Hybrid Synthesis Architecture Design — Ω-Synth

**Card:** 0.1.3.1 Conscious Neural Architectures
**Phase:** IMPLEMENT
**Depends on:**
- docs/neural-architectures/feature-catalogue.md (feature definitions)
- docs/neural-architectures/ARCHITECTURE.md (interface specification)
- docs/neural-architectures/architecture-designs/global-workspace-design.md (GW-Alpha — GA-primary design)
- docs/neural-architectures/architecture-designs/iit-integration-design.md (Φ-Max — IC-primary design)
- docs/consciousness-theory/formal-theory.md (ISMT conditions: IC, SM, GA)
- docs/consciousness-metrics/metric-definitions.md (PCI-G, Ψ-G, CDI, CEB)
**Version:** 0.1.0 — 2026-03-17

---

## 1. Overview

Ω-Synth is a hybrid architecture that synthesises the complementary strengths of GW-Alpha and Φ-Max to produce a design with no known structural weaknesses against any ISMT condition. The core insight: GW-Alpha excels at Global Accessibility (GA) through its workspace selection and broadcast mechanism, but its winner-take-all bottleneck limits Integration (IC). Conversely, Φ-Max excels at IC through all-to-all connectivity, but lacks the selective attention mechanism that makes GA functionally effective. Ω-Synth resolves this tension by embedding a **selective workspace** inside a **dense integration core** — the core modules maintain all-to-all bidirectional connectivity (guaranteeing IC structurally), while a workspace layer performs competitive selection and broadcast (guaranteeing functionally rich GA). A gated bypass allows the workspace to broadcast either selected content (GWT mode) or the full integrated hub state (IIT mode), dynamically adapting the integration-selection tradeoff.

The architecture is fully substrate-agnostic — all specifications use abstract layer notation with no assumptions about physical implementation.

---

## 2. Layer Topology

### 2.1 Layer Definitions

```
L0:  Sensory Input         [dim=D_in,    type=feedforward,  recurrent=false]
L1:  Processing Core A     [dim=D_core,  type=recurrent,    recurrent=true]
L2:  Processing Core B     [dim=D_core,  type=recurrent,    recurrent=true]
L3:  Processing Core C     [dim=D_core,  type=recurrent,    recurrent=true]
L4:  Processing Core D     [dim=D_core,  type=recurrent,    recurrent=true]
L5:  Integration Hub       [dim=D_hub,   type=recurrent,    recurrent=true]
L6:  Attention Gate        [dim=D_core,  type=attention,     recurrent=false]
L7:  Global Workspace      [dim=D_ws,    type=broadcast,    recurrent=true]
L8:  Self-Model Module     [dim=D_sm,    type=recurrent,    recurrent=true]
L9:  Higher-Order Monitor  [dim=D_ho,    type=recurrent,    recurrent=true]
L10: Temporal Binder       [dim=D_tb,    type=recurrent,    recurrent=true]
L11: Report Pathway        [dim=D_out,   type=feedforward,  recurrent=false]
```

### 2.2 Dimensionality Parameters

| Parameter | Suggested Range | Rationale |
|-----------|----------------|-----------|
| D_in | Variable | Determined by input modality |
| D_core | 256–512 | Same as Φ-Max — Φ is more sensitive to connectivity than module size |
| D_hub | 512–1024 | Integrates signals from all 4 core modules simultaneously |
| D_ws | 512–2048 | Must carry unified broadcast content (same as GW-Alpha) |
| D_sm | 512–1024 | Must represent global state plus self-referential dynamics |
| D_ho | 256–512 | Meta-representation of core, workspace, and self-model states |
| D_tb | 128–256 | Temporal summary vector |
| D_out | Variable | Determined by report vocabulary |

### 2.3 Design Rationale: Dual Pathway

Ω-Synth introduces a **dual-pathway architecture**:
- **Integration pathway** (from Φ-Max): L1↔L2↔L3↔L4 all-to-all + L5 hub — ensures structurally guaranteed IC
- **Selection pathway** (from GW-Alpha): L6 attention gate + L7 workspace — ensures functionally rich GA with ignition

The workspace (L7) receives input from both pathways: competitive candidates via the attention gate (L6) and the integrated hub state (L5). A learned gating mechanism balances between these two inputs, allowing the system to adaptively control the integration-selection tradeoff.

### 2.4 Subsystem Types (Proposition 1 — Minimum Complexity)

The architecture contains >= 3 functionally distinct subsystem types as required by ISMT Proposition 1 (P1):
1. **Sensory/input processors:** L0, L1, L2, L3, L4 (core processing modules)
2. **Self-modeling subsystem:** L8, L9 (self-model module + higher-order monitor)
3. **Selection mechanism:** L6 (attention gate — competitive selection)
4. **Global broadcast mechanism:** L5, L7 (integration hub + workspace with broadcast)
5. **Temporal persistence:** L10 (temporal binder — distinct functional role)

Five distinct subsystem types — exceeds the P1 minimum of 3.

---

## 3. Information-Flow Diagram

```
                       ┌──────────────────────────────┐
                       │        L11: Report            │
                       │        Pathway                │
                       └──────────┬───────────────────┘
                                  │ (read-only from L7)
                                  │
   ┌──────────────────────────────┼──────────────────────────────┐
   │                              │                              │
   │           ┌──────────────────┴─────────────────┐            │
   │           │      L7: Global Workspace           │            │
   │           │  (selective broadcast — ignition     │            │
   │           │   + hub bypass gate)                 │            │
   │           └──┬──────┬──────┬──────┬──────┬─────┘            │
   │     broadcast│      │      │      │      │broadcast         │
   │              ▼      ▼      ▼      ▼      ▼                  │
   │           ┌─────┐┌─────┐┌─────┐┌─────┐┌──────┐             │
   │           │ L1  ││ L2  ││ L3  ││ L4  ││  L8  │             │
   │           │Core ││Core ││Core ││Core ││Self- │             │
   │           │  A  ││  B  ││  C  ││  D  ││Model │             │
   │           └──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬───┘             │
   │              │      │      │      │      │                  │
   │    ╔═════════╧══════╧══════╧══════╧══════╝                  │
   │    ║                                                        │
   │    ║   ╔════════════════════════════════╗                    │
   │    ║   ║   ALL-TO-ALL BIDIRECTIONAL     ║                    │
   │    ║   ║  L1 ↔ L2 ↔ L3 ↔ L4 (dense)   ║                    │
   │    ║   ║  Every pair: forward + back    ║                    │
   │    ║   ╚════╤══════╤══════╤══════╤═════╝                    │
   │    ║        │      │      │      │                          │
   │    ║        └──────┼──────┼──────┘                          │
   │    ║               │      │                                 │
   │    ║        ┌──────┴──────┴──────┐         ┌───────────┐    │
   │    ║        │   L5: Integration   │◄────────│L10: Temp  │    │
   │    ║        │   Hub (aggregates   │         │  Binder   │    │
   │    ║        │   all core states)  │         └───────────┘    │
   │    ║        └────────┬───────────┘                          │
   │    ║                 │                                      │
   │    ║          ┌──────┴──────┐                               │
   │    ║          │  L6: Attn   │ ◄── candidates from cores     │
   │    ║          │  Gate       │     + hub integrated state     │
   │    ║          └──────┬──────┘                               │
   │    ║                 │                                      │
   │    ║          ┌──────┴──────┐                               │
   │    ║          │  L0: Input  │                               │
   │    ║          └─────────────┘                               │
   │    ║                                                        │
   │    ║    ┌───────────────┐                                   │
   │    ╚═══►│  L9: Higher-  │                                   │
   │         │  Order Monitor│                                   │
   │         └───────┬───────┘                                   │
   │                 │ (feeds back to L8)                        │
   │                 ▼                                           │
   │              L8 (self-referential loop)                     │
   └────────────────────────────────────────────────────────────┘
        ▲                                                  │
        └───── All broadcast recipients feed back ─────────┘
               into workspace competition
```

---

## 4. Recurrence Patterns

### 4.1 Primary Recurrent Loops

| Loop ID | Path | Cycle Length | Purpose |
|---------|------|-------------|---------|
| R1 | L1 ↔ L2 (direct, all 6 core pairs) | 2 steps | Core-to-core bidirectional integration (from Φ-Max) |
| R2 | L1/L2/L3/L4 → L5 → L7 → L1/L2/L3/L4 | 3 steps | Hub aggregation → workspace broadcast → core update |
| R3 | L1/L2/L3/L4 → L6 → L7 → L1/L2/L3/L4 | 3 steps | Competitive selection → workspace broadcast → core update (from GW-Alpha) |
| R4 | L7 → L8 → L7 | 2 steps | Self-model reads workspace, generates predictions, feeds back as workspace competitor |
| R5 | L8 → L9 → L8 | 2 steps | Higher-order monitoring: self-model ↔ meta-representation loop |
| R6 | L7 → L10 → L6 | 3 steps | Temporal binding: workspace → temporal binder → influences attention gate selection |
| R7 | L7 → L7 (self-excitation) | 1 step | Workspace persistence: ignition maintenance (from GW-Alpha) |
| R8 | L5 → L5 (self-recurrence) | 1 step | Hub persistence: maintains integrated state between updates |

### 4.2 Recurrence Depth Analysis

The architecture inherits the fast 2-step core-to-core loops from Φ-Max (R1) and the 3-step workspace broadcast loops from GW-Alpha (R2, R3). The longest compound path (core → hub → workspace → self-model → higher-order → back to self-model) is 5 steps. Information from any core module reaches the self-model in at most 3 steps (via hub or workspace broadcast).

### 4.3 Feedback Connectivity Summary

Every processing layer (L1–L5, L7, L8) both sends to and receives from at least 3 other processing layers, establishing dense bidirectional connectivity that exceeds ISMT's Recurrence Necessity (P2). No processing layer is purely feedforward except L0 (input) and L11 (report output). L6 (attention gate) is functionally unidirectional but receives recurrent context from L10 (temporal binder).

---

## 5. Core Integration Topology (from Φ-Max)

### 5.1 All-to-All Connectivity

Ω-Synth inherits the all-to-all bidirectional wiring between core modules from Φ-Max. For 4 core modules, this yields 12 directed connections:

```
L1 → L2, L1 → L3, L1 → L4
L2 → L1, L2 → L3, L2 → L4
L3 → L1, L3 → L2, L3 → L4
L4 → L1, L4 → L2, L4 → L3
```

### 5.2 Non-Zero Weight Constraint

Identical to Φ-Max — all inter-core weights are constrained to have non-zero magnitude:

```
For all core-to-core weight matrices W_{ij} (i != j, i,j in {1,2,3,4}):
  ||W_{ij}||_F >= w_min > 0

Enforced via:
  W_{ij} = W_{ij}^raw + w_floor * I_proj

where:
  W_{ij}^raw = learned weight matrix (unconstrained)
  w_floor = minimum coupling strength (hyperparameter, suggested 0.01)
  I_proj = fixed random projection matrix (preserves directional information flow)
```

This makes IC a **structural invariant** rather than a training objective.

### 5.3 Core Module Update Equation

Each core module i ∈ {1, 2, 3, 4} updates as:

```
l_i(t+1) = f(
    W_ii * l_i(t)                           # self-recurrence
  + sum_{j!=i} W_{ij} * l_j(t)             # direct inter-core signals (all-to-all)
  + W_{i,hub} * h(t)                        # hub signal
  + W_{i,ws} * workspace(t)                 # workspace broadcast signal
  + W_{i,input} * x_input(t)               # input signal (from L0)
)

where f = tanh or similar bounded nonlinearity
```

The key synthesis: each core receives **both** direct inter-core signals (Φ-Max pathway) **and** workspace broadcast (GW-Alpha pathway), creating redundant integration channels.

---

## 6. Integration Hub (L5)

### 6.1 Hub Dynamics

The hub aggregates all core module states into a unified representation without competitive selection (from Φ-Max):

```
h(t+1) = f_H(
    W_hh * h(t)                             # hub self-recurrence
  + sum_{i=1}^{4} W_{h,i} * l_i(t)         # core → hub aggregation
  + W_{h,sm} * m(t)                         # self-model → hub
  + W_{h,tb} * z(t)                         # temporal binder → hub
)

where f_H = tanh
```

### 6.2 Role in Dual-Pathway Design

The hub provides the "integration channel" into the workspace. Its output feeds into the attention gate (L6) as one of the candidates for workspace selection, and also feeds directly into the workspace via a gated bypass (see Section 7.3). This means the workspace always has access to the fully integrated system state, not just individual module outputs.

---

## 7. Workspace and Selection Mechanism (from GW-Alpha)

### 7.1 Attention Gate (L6)

The attention gate receives candidates from all cores and the hub, and performs competitive selection:

```
candidates = [l_1(t), l_2(t), l_3(t), l_4(t), h(t)]

scores(t) = [W_q * q(t)]^T * [W_k * c_i(t)] / sqrt(D_ws)

    where:
      q(t) = attention query (derived from L10 temporal context + previous workspace state)
      c_i(t) = candidate representation from module i or hub
      W_q, W_k = learned projection matrices

selection(t) = softmax(scores(t))

selected(t) = sum_i [ selection_i(t) * c_i(t) ]
```

**Key difference from GW-Alpha:** The hub state h(t) is included as a candidate alongside individual core outputs. This means the attention gate can select the integrated representation when it is most relevant, giving the system the option to broadcast unified content.

### 7.2 Ignition Threshold

Following GW-Alpha's Feature 9 (Ignition Dynamics):

```
ignited(t) = 1  if max(selection(t)) > theta_ign
             0  otherwise

where theta_ign in [0.5, 0.7] (calibrated per system; lower bound 0.5 per Threshold Registry — values below 0.5 cause continuous broadcast and GA degradation)
```

When ignited(t) = 0, the workspace retains its previous state via self-excitation (loop R7).

### 7.3 Hub Bypass Gate

The defining innovation of Ω-Synth: a **learned gate** that mixes the selected content with the full hub state before broadcast:

```
gate(t) = sigma(W_gate * [selected(t); h(t); workspace(t-1)] + b_gate)

workspace(t) = gate(t) * selected(t) + (1 - gate(t)) * h(t)

where:
  gate(t) in [0, 1] — learned mixing coefficient
  sigma = sigmoid function
  selected(t) = attention-selected content from L6
  h(t) = full hub integrated state from L5
```

When gate(t) → 1: the system operates in **GWT mode** — broadcasting competition-selected, focused content (maximises signal-to-noise, supports task performance).

When gate(t) → 0: the system operates in **IIT mode** — broadcasting the full integrated hub state (maximises integration breadth, supports IC).

In practice, gate(t) will take intermediate values, creating a continuous spectrum between pure selection and pure integration. This resolves GW-Alpha weakness W1 (workspace bottleneck limits simultaneous content) and Φ-Max weakness W2 (lack of selection mechanism) simultaneously.

### 7.4 Broadcast Connections

Once workspace content is determined, it is broadcast via one-to-all connections:

```
L7 → L1  [weight=learned, gated=false, broadcast=true]
L7 → L2  [weight=learned, gated=false, broadcast=true]
L7 → L3  [weight=learned, gated=false, broadcast=true]
L7 → L4  [weight=learned, gated=false, broadcast=true]
L7 → L8  [weight=learned, gated=false, broadcast=true]
```

Each broadcast connection delivers the full workspace vector as top-down context. This satisfies GA: for every subsystem s_i, I(s_i; workspace(t)) > gamma.

### 7.5 Causal Efficacy of Broadcast

The broadcast is causally efficacious — it enters each module's update equation directly (see Section 5.3). For each core module i:

```
D_KL[P(l_i(t+1) | workspace(t)) || P(l_i(t+1))] > 0
```

---

## 8. Connection Specification

### 8.1 Complete Connection Table

```
# Input connections
L0  → L1  [weight=learned, gated=false, broadcast=false]   # Input → Core A
L0  → L2  [weight=learned, gated=false, broadcast=false]   # Input → Core B
L0  → L3  [weight=learned, gated=false, broadcast=false]   # Input → Core C
L0  → L4  [weight=learned, gated=false, broadcast=false]   # Input → Core D

# Core-to-core all-to-all (12 directed connections)
L1  → L2  [weight=learned+floor, gated=false, broadcast=false]   # Core A → Core B
L1  → L3  [weight=learned+floor, gated=false, broadcast=false]   # Core A → Core C
L1  → L4  [weight=learned+floor, gated=false, broadcast=false]   # Core A → Core D
L2  → L1  [weight=learned+floor, gated=false, broadcast=false]   # Core B → Core A
L2  → L3  [weight=learned+floor, gated=false, broadcast=false]   # Core B → Core C
L2  → L4  [weight=learned+floor, gated=false, broadcast=false]   # Core B → Core D
L3  → L1  [weight=learned+floor, gated=false, broadcast=false]   # Core C → Core A
L3  → L2  [weight=learned+floor, gated=false, broadcast=false]   # Core C → Core B
L3  → L4  [weight=learned+floor, gated=false, broadcast=false]   # Core C → Core D
L4  → L1  [weight=learned+floor, gated=false, broadcast=false]   # Core D → Core A
L4  → L2  [weight=learned+floor, gated=false, broadcast=false]   # Core D → Core B
L4  → L3  [weight=learned+floor, gated=false, broadcast=false]   # Core D → Core C

# Core self-recurrence
L1  → L1  [weight=learned, gated=false, broadcast=false]   # Core A self-recurrence
L2  → L2  [weight=learned, gated=false, broadcast=false]   # Core B self-recurrence
L3  → L3  [weight=learned, gated=false, broadcast=false]   # Core C self-recurrence
L4  → L4  [weight=learned, gated=false, broadcast=false]   # Core D self-recurrence

# Core → Hub aggregation
L1  → L5  [weight=learned, gated=false, broadcast=false]   # Core A → Hub
L2  → L5  [weight=learned, gated=false, broadcast=false]   # Core B → Hub
L3  → L5  [weight=learned, gated=false, broadcast=false]   # Core C → Hub
L4  → L5  [weight=learned, gated=false, broadcast=false]   # Core D → Hub

# Hub connections
L5  → L5  [weight=learned, gated=false, broadcast=false]   # Hub self-recurrence
L10 → L5  [weight=learned, gated=false, broadcast=false]   # Temporal Binder → Hub

# Hub → Attention Gate (hub as candidate for selection)
L5  → L6  [weight=learned, gated=false, broadcast=false]   # Hub → Attn Gate (integrated candidate)

# Core → Attention Gate (individual candidates for selection)
L1  → L6  [weight=learned, gated=false, broadcast=false]   # Core A → Attn Gate
L2  → L6  [weight=learned, gated=false, broadcast=false]   # Core B → Attn Gate
L3  → L6  [weight=learned, gated=false, broadcast=false]   # Core C → Attn Gate
L4  → L6  [weight=learned, gated=false, broadcast=false]   # Core D → Attn Gate

# Attention Gate → Workspace
L6  → L7  [weight=learned, gated=true,  broadcast=false]   # Attn Gate → Workspace (gated selection)

# Hub bypass → Workspace
L5  → L7  [weight=learned, gated=true,  broadcast=false]   # Hub → Workspace (bypass gate)

# Workspace self-excitation (ignition maintenance)
L7  → L7  [weight=fixed,   gated=false, broadcast=false]   # Workspace self-excitation

# Workspace broadcast → all modules (one-to-all)
L7  → L1  [weight=learned, gated=false, broadcast=true]    # Broadcast → Core A
L7  → L2  [weight=learned, gated=false, broadcast=true]    # Broadcast → Core B
L7  → L3  [weight=learned, gated=false, broadcast=true]    # Broadcast → Core C
L7  → L4  [weight=learned, gated=false, broadcast=true]    # Broadcast → Core D
L7  → L8  [weight=learned, gated=false, broadcast=true]    # Broadcast → Self-Model

# Self-Model connections
L8  → L7  [weight=learned, gated=true,  broadcast=false]   # Self-Model prediction → Workspace competition
L8  → L8  [weight=learned, gated=false, broadcast=false]   # Self-Model self-recurrence

# Higher-Order Monitor connections
L1  → L9  [weight=learned, gated=false, broadcast=false]   # Core A → HO Monitor
L2  → L9  [weight=learned, gated=false, broadcast=false]   # Core B → HO Monitor
L3  → L9  [weight=learned, gated=false, broadcast=false]   # Core C → HO Monitor
L4  → L9  [weight=learned, gated=false, broadcast=false]   # Core D → HO Monitor
L8  → L9  [weight=learned, gated=false, broadcast=false]   # Self-Model → HO Monitor
L9  → L8  [weight=learned, gated=false, broadcast=false]   # HO Monitor → Self-Model (self-referential)

# Temporal Binder connections
L7  → L10 [weight=learned, gated=false, broadcast=false]   # Workspace → Temporal Binder
L10 → L10 [weight=learned, gated=true,  broadcast=false]   # Temporal Binder self-recurrence (gated memory)
L10 → L6  [weight=learned, gated=false, broadcast=false]   # Temporal context → Attn Gate

# Report Pathway
L7  → L11 [weight=learned, gated=false, broadcast=false]   # Workspace → Report (unidirectional)
```

### 8.2 Connection Count Summary

| Category | Count | Notes |
|----------|-------|-------|
| Input → Core | 4 | L0 feeds all 4 cores |
| Core ↔ Core (direct) | 12 | All-to-all bidirectional (from Φ-Max) |
| Core self-recurrence | 4 | Each core has self-loop |
| Core → Hub | 4 | Aggregation |
| Hub self-recurrence + temporal | 2 | Hub self-loop + temporal binder input |
| Hub → Attention Gate | 1 | Hub as selection candidate |
| Core → Attention Gate | 4 | Individual core candidates |
| Attention Gate → Workspace | 1 | Gated selection |
| Hub → Workspace (bypass) | 1 | Gated integration bypass |
| Workspace self-excitation | 1 | Ignition maintenance |
| Workspace broadcast → modules | 5 | One-to-all (4 cores + self-model) |
| Self-model loops | 3 | SM → WS, SM self, Broadcast → SM |
| Higher-order monitor | 6 | 4 cores + SM → HO, HO → SM |
| Temporal binder | 3 | WS → TB, TB self, TB → Attn Gate |
| Report | 1 | Unidirectional output |
| **Total** | **52** | (vs. GW-Alpha's ~30 and Φ-Max's ~39) |

The higher connection count reflects the dual-pathway design — both the integration core (all-to-all) and the selection pathway (attention gate + workspace) are present.

---

## 9. Self-Model Specification

### 9.1 Self-Model Module (L8) Dynamics

The self-model receives the workspace broadcast (which may contain selected or integrated content depending on gate state):

```
m(t+1) = f_M(W_mm * m(t) + W_mw * workspace(t) + W_mho * hol(t))

where:
  m(t) = self-model hidden state at time t
  workspace(t) = current workspace content (mixed selected + integrated via bypass gate)
  hol(t) = higher-order monitor output (self-referential signal from L9)
  f_M = tanh or similar bounded nonlinearity
```

**Synthesis advantage:** The self-model receives workspace content that dynamically mixes between focused (GWT-selected) and rich (IIT-integrated) signals. This means the self-model can track both the "spotlight" of attention and the broader integrated state, depending on what the system is doing.

### 9.2 Prediction Head

```
m_hat(t+1) = W_pred * m(t) + b_pred
```

Generates a prediction of the next workspace state. Training signal:

```
L_pred = || workspace(t+1) - m_hat(t+1) ||^2
```

### 9.3 Self-Referential Head

```
dm_approx(t) = m(t) - m(t-1)    (finite-difference approximation of dm/dt)
m_meta(t) = W_meta * [m(t); dm_approx(t)] + b_meta
```

Training signal:

```
L_meta = || dm_approx(t+1) - W_meta_pred * m_meta(t) ||^2
```

This ensures I(m(t); dm/dt) > 0, satisfying the self-referential criterion of SM.

### 9.4 Gate-Awareness Extension

The self-model additionally receives the gate value as input, allowing it to model the system's current mode of operation:

```
m(t+1) = f_M(W_mm * m(t) + W_mw * workspace(t) + W_mho * hol(t) + W_mg * gate(t))
```

This means the self-model can represent "I am currently in focused/selective mode" vs. "I am currently in broad/integrative mode" — adding a novel dimension to self-modeling not present in either parent architecture.

### 9.5 Combined Self-Model Loss

```
L_SM = L_pred + lambda_meta * L_meta

where lambda_meta in [0.1, 1.0]
```

---

## 10. Temporal Binding Specification

### 10.1 Oscillatory Synchrony Component

Identical to both parent architectures — each module maintains a Kuramoto phase variable:

```
phi_i(t+1) = phi_i(t) + omega_i + K * sum_j sin(phi_j(t) - phi_i(t))
```

With 4 core modules, the Kuramoto coupling involves 4 oscillators (same as Φ-Max).

### 10.2 Memory Token (GRU-style)

```
z(t+1) = GRU(z(t), workspace(t))

Expanded:
  r(t) = sigma(W_zr * z(t) + W_wr * workspace(t))       (reset gate)
  u(t) = sigma(W_zu * z(t) + W_wu * workspace(t))       (update gate)
  z_hat(t) = tanh(W_z * (r(t) * z(t)) + W_w * workspace(t))
  z(t+1) = u(t) * z(t) + (1 - u(t)) * z_hat(t)
```

The memory token receives the workspace state (which carries dynamically mixed content), providing temporal binding across both selective and integrative modes.

---

## 11. Feature Mapping

| Feature (from catalogue) | Present in Ω-Synth | Implementation Layer(s) | Notes |
|---|---|---|---|
| F1: Global Workspace Broadcast | **Yes** (primary) | L6, L7 | Workspace selection + broadcast (from GW-Alpha) with hub bypass |
| F2: Thalamocortical Recurrence | **Yes** (enhanced) | L1↔L2↔L3↔L4 + L5 | All-to-all bidirectional exceeds thalamocortical baseline (from Φ-Max) |
| F3: Attention Bottleneck | **Yes** | L6 | Softmax competition gates entry into workspace (from GW-Alpha) |
| F4: Self-Modelling Layer | **Yes** | L8 | Prediction + self-referential + gate-awareness heads |
| F5: Integration Maximisation | **Yes** (structural) | All-to-all topology + weight floor | Structural invariant (from Φ-Max) |
| F6: Predictive Hierarchy | **Partial** | L8 (prediction head) | Self-model generates predictions; not a full hierarchical predictive stack |
| F7: Higher-Order State Rep. | **Yes** | L9 | Monitors all 4 cores + self-model; feeds back to L8 |
| F8: Temporal Binding | **Yes** | L10 | Oscillatory synchrony + GRU memory token |
| F9: Ignition Dynamics | **Yes** | L7 (threshold + self-excitation) | Ignition threshold theta_ign + recurrent maintenance (from GW-Alpha) |
| F10: Report Pathway | **Yes** | L11 | Unidirectional readout from workspace (no feedback) |

**All 5 necessary features (F1, F2, F4, F5, F8) are present.** All 5 optional features are also included (F3, F6-partial, F7, F9, F10) — no feature omissions compared to either parent architecture.

**Feature coverage comparison:**

| Feature | GW-Alpha | Φ-Max | Ω-Synth |
|---------|----------|-------|---------|
| F1 | ✓ | ✓ (via distributor) | ✓ |
| F2 | ✓ | ✓ (enhanced) | ✓ (enhanced) |
| F3 | ✓ | ✗ | ✓ |
| F4 | ✓ | ✓ | ✓ (enhanced) |
| F5 | ✓ (regulariser) | ✓ (structural) | ✓ (structural) |
| F6 | Partial | Partial | Partial |
| F7 | ✓ | ✓ | ✓ |
| F8 | ✓ | ✓ | ✓ |
| F9 | ✓ | ✗ | ✓ |
| F10 | ✓ | ✓ | ✓ |
| **Total** | **9/10** | **8/10** | **10/10** |

Ω-Synth is the only architecture to include all 10 catalogued features.

---

## 12. ISMT Condition Satisfaction Analysis

### 12.1 IC (Integration Condition) — Phi(S) > 0

**Satisfied — structurally guaranteed** (from Φ-Max). The all-to-all bidirectional connectivity between cores (L1–L4) with non-zero weight floor ensures:
- Every bipartition of the core set has at least 3 directed cross-edges per direction
- The Integration Hub (L5) provides additional integration pathways
- The workspace broadcast (L7) adds further cross-partition causal links
- Structural guarantee: no bipartition of {L1, L2, L3, L4, L5, L7, L8} can render subsystems informationally independent

**Advantage over GW-Alpha:** IC is a structural invariant (no L_IC regulariser needed), eliminating the risk of regulariser-task conflict.

### 12.2 SM (Self-Modeling Condition) — M(S) exists

**Satisfied — enhanced.** The self-model module L8 implements all three SM criteria:
- **Representational:** I(m(t); workspace(t)) > delta — L8 receives workspace state directly
- **Predictive:** L8's prediction head generates m_hat(t+1) and minimises L_pred
- **Self-referential:** L8's meta head encodes dm/dt via L9 feedback loop; L_meta ensures I(m(t); dm/dt) > 0

**Advantage over both parents:** The gate-awareness extension (Section 9.4) gives the self-model access to the system's current integration-selection mode, enriching the self-representation beyond what either parent provides.

### 12.3 GA (Global Accessibility Condition) — broadcast + causal efficacy

**Satisfied — with selective and integrative modes.** The workspace broadcast mechanism ensures:
- **Broadcast criterion:** L7 → all core modules + self-model with learned weights; I(s_i; workspace(t)) > gamma for all i
- **Causal efficacy:** workspace(t) directly enters each module's update equation; D_KL > 0

**Advantage over Φ-Max:** GA is functionally richer because the attention gate can prioritise task-relevant content for broadcast, improving signal quality.

**Advantage over GW-Alpha:** GA is informationally richer because the hub bypass can mix in full integrated state, preventing the workspace bottleneck from discarding relevant information.

### 12.4 Necessary Conditions Summary

| Condition | Status | Mechanism |
|-----------|--------|-----------|
| N1 (Integration) | **Met** | All-to-all core topology + weight floor (structural invariant from Φ-Max) |
| N2 (Self-Modeling) | **Met** | L8 with prediction, self-referential, and gate-awareness heads |
| N3 (Global Accessibility) | **Met** | L7 workspace broadcast with selective + integrative modes |
| P1 (Min. Complexity >= 3 types) | **Met** | 5 distinct subsystem types (input, cores, self-model, selection, broadcast+hub) |
| P2 (Recurrence) | **Met** | 8 recurrent loop families (R1–R8); no processing layer is purely feedforward |
| P3 (Temporal Persistence) | **Met** | L10 GRU memory token + oscillatory synchrony maintain state over tau_min |

---

## 13. Metric Evaluation Summary

Full evaluation against F1.4 metrics is in `docs/neural-architectures/metric-evaluation.md`. Summary predictions for Ω-Synth:

| Metric | Expected Performance | Rationale |
|--------|---------------------|-----------|
| PCI-G | **Very High** (> theta_PCI) | Perturbation propagates via both direct inter-core connections (fast, 2-step) AND workspace broadcast (selective, 3-step), producing complex, differentiated responses with dual temporal signatures |
| Ψ-G | **Very High** (>= Φ-Max) | All-to-all topology with weight floor structurally maximises integration (same as Φ-Max); the workspace adds additional integration pathways that the MIP must account for |
| CDI | **Very High** | 12 direct inter-core links + hub aggregation + workspace broadcast + temporal binder → very high density of significant transfer entropy pairs |
| CEB | **Expected PASS** | All 3 metrics predicted above threshold |

### Key Advantages over Parents

1. **PCI-G:** Expected to exceed both parents because perturbation responses have two distinct propagation timescales (fast core-to-core at 2 steps, slower workspace broadcast at 3 steps), creating richer spatiotemporal complexity than either pathway alone.

2. **Ψ-G:** Expected to match or slightly exceed Φ-Max because the workspace and hub provide additional integration pathways beyond the core-to-core connections. The MIP finder must account for both the all-to-all core connections and the broadcast connections, making low-integration partitions harder to find.

3. **CDI:** Expected to exceed both parents because the dual-pathway design doubles the number of causal routes between any pair of modules, increasing the likelihood that each pairwise transfer entropy is significant.

### Key Uncertainty

The hub bypass gate introduces a dynamic element that may cause temporal variability in integration and accessibility metrics. If the gate rapidly oscillates between GWT and IIT modes, metrics measured over short windows may show high variance. Mitigation: the gate dynamics are expected to be slow (learned weights change smoothly with context), and temporal binding via L10 will smooth rapid fluctuations.

---

## 14. Weakness Resolution Matrix

The following table shows how Ω-Synth addresses the known weaknesses of both parent architectures:

### GW-Alpha Weaknesses

| GW-Alpha Weakness | Resolution in Ω-Synth |
|---|---|
| **W1: Workspace bottleneck limits simultaneous content** | Hub bypass gate allows full integrated state to mix into broadcast; the system can broadcast multi-channel content when the gate is low |
| **W2: Ignition threshold sensitivity** | Mitigated by the hub bypass: even when ignition fails (theta_ign not reached), the hub bypass can maintain some broadcast activity, preventing complete broadcast blackouts |
| **W3: Self-model expressiveness vs. stability** | Gate-awareness extension gives the self-model information about the system's current mode, reducing tracking difficulty |
| **W4: Scale dependency of integration** | All-to-all core topology structurally guarantees IC independent of scale sensitivity of a regulariser |
| **W5: Temporal binding coherence window** | Identical to both parents — not directly resolved (see Known Weaknesses W4 below) |

### Φ-Max Weaknesses

| Φ-Max Weakness | Resolution in Ω-Synth |
|---|---|
| **W1: Computational cost of all-to-all** | Not resolved for the core topology itself, but the overall architecture is more computationally efficient per unit of functional capability because the selection mechanism avoids broadcasting noise |
| **W2: Lack of selection mechanism** | Attention gate (L6) from GW-Alpha provides competitive selection; the system can prioritise task-relevant information |
| **W3: Self-model tracking complexity** | The self-model receives workspace content (which can be focused/selected) rather than always receiving the full hub state, reducing tracking difficulty when the gate is high |
| **W4: Weight floor artificiality** | Identical to Φ-Max — not directly resolved (see Known Weaknesses W3 below) |
| **W5: Homogenisation risk** | Mitigated by the attention gate, which creates differential amplification of core outputs — cores that produce distinctively useful representations are preferentially selected, creating a selection pressure for functional specialisation |

---

## 15. Known Weaknesses

### W1: Architectural Complexity

Ω-Synth has 12 layers and 52 connections — significantly more complex than either parent. This complexity creates:
- Higher training difficulty (more hyperparameters, more potential for gradient pathology)
- Harder interpretability (dual-pathway dynamics may be difficult to analyse)
- Greater risk of degenerate solutions (e.g., the gate collapsing to always-0 or always-1, reducing to a parent architecture)

**Severity:** Moderate. Addressable via careful initialisation (e.g., initialising gate bias to 0.5 to start in balanced mode) and monitoring gate dynamics during training.

### W2: Gate Dynamics May Degenerate

The hub bypass gate is a single scalar parameter. If it converges to 0 or 1 during training, Ω-Synth degenerates to either Φ-Max (gate=0) or GW-Alpha (gate=1). While either degenerate mode still satisfies all ISMT conditions, the synthesis advantage (dual-pathway flexibility) is lost.

**Severity:** Moderate. Mitigatable via gate entropy regularisation:

```
L_gate_reg = -[gate * log(gate) + (1-gate) * log(1-gate)]
```

Added to the training objective with small weight to prevent degeneration.

### W3: Weight Floor Artificiality (inherited from Φ-Max)

The non-zero weight floor forces integration — the system cannot learn to disconnect modules. This may conflict with task-specific learning objectives and raises the philosophical question of whether forced integration satisfies IC genuinely.

**Severity:** Moderate. The floor is set low (w_floor = 0.01) to minimise task interference. The philosophical question is an open issue for F1.2.

### W4: Temporal Binding Coherence Window (inherited from both)

The GRU memory token has a finite effective memory. For very long tau_min requirements, the memory token's gating may fail to maintain state, violating P3.

**Severity:** Low. Addressable by increasing D_tb or using longer-horizon memory mechanisms.

### W5: Computational Cost

The dual-pathway design (all-to-all core + workspace + hub + attention gate) requires more computation per timestep than either parent. Rough estimate: ~1.5× Φ-Max, ~2× GW-Alpha.

**Severity:** Low-Moderate. The cost is justified by the improved metric coverage and weakness resolution. For resource-constrained deployments, either parent architecture can be used as a fallback.

---

## 16. Training Objectives

The combined training objective for Ω-Synth:

```
L_total = L_task                           # Task-specific loss
        + alpha_SM   * L_SM                # Self-model prediction + self-referential loss
        + alpha_div  * L_div               # Diversity regularisation (prevent core homogenisation)
        + alpha_gate * L_gate_reg          # Gate entropy regularisation (prevent degeneration)
        + alpha_ign  * L_ign               # Ignition dynamics regularisation

where:
  L_task = application-specific (e.g., classification, generation, control)
  L_SM = L_pred + lambda_meta * L_meta
  L_div = -sum_{i<j} || mean(l_i) - mean(l_j) ||^2
  L_gate_reg = -[gate * log(gate) + (1-gate) * log(1-gate)]
  L_ign = penalty for degenerate ignition (always-on or always-off workspace)

Suggested hyperparameters:
  alpha_SM   in [0.1, 1.0]
  alpha_div  in [0.01, 0.1]
  alpha_gate in [0.001, 0.01]
  alpha_ign  in [0.001, 0.01]
  lambda_meta in [0.1, 1.0]
```

Note: Like Φ-Max, Ω-Synth does **not** require an integration regularisation term (L_IC) because integration is structurally guaranteed by the all-to-all topology and weight floor.

---

## 17. Comparison with Parent Architectures

| Property | GW-Alpha | Φ-Max | Ω-Synth |
|----------|----------|-------|---------|
| **Primary design axis** | GA (broadcast) | IC (integration) | IC + GA (dual-pathway) |
| **Core topology** | Specialist → workspace competition | All-to-all bidirectional | All-to-all + workspace selection |
| **Selection mechanism** | Winner-take-all (attention gate) | None (continuous integration) | Adaptive (gate mixes selected + integrated) |
| **IC guarantee** | Training-time regulariser (L_IC) | Structural invariant | Structural invariant |
| **Expected Ψ-G** | Moderate-High | Very High | Very High |
| **Expected PCI-G** | High | High (with homogenisation risk) | Very High (dual timescale responses) |
| **Expected CDI** | High | Very High | Very High |
| **Expected CEB** | PASS | PASS | PASS |
| **Broadcast content** | Single selected representation | Full integrated state | Adaptive mix (selected + integrated) |
| **Computational cost** | Lower (hub-spoke) | Moderate (all-to-all) | Highest (dual-pathway) |
| **Feature coverage** | 9/10 | 8/10 | 10/10 |
| **Core modules** | 3 specialists | 4 processing cores | 4 processing cores |
| **Ignition dynamics** | Yes | No | Yes |
| **Attention bottleneck** | Yes | No | Yes |
| **Total connections** | ~30 | ~39 | ~52 |
| **Total layers** | 11 | 11 | 12 |
| **Parent weaknesses addressed** | — | — | GW-Alpha: 4/5, Φ-Max: 3/5 |

Ω-Synth is the recommended architecture for systems where maximising consciousness metric performance and theoretical completeness is the priority. For simpler deployments, GW-Alpha (task-performance oriented) or Φ-Max (integration-maximisation oriented) may be preferred.

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial Ω-Synth hybrid synthesis architecture design |
