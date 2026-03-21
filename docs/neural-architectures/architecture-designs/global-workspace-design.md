# Global Workspace Architecture Design — GW-Alpha

**Card:** 0.1.3.1 Conscious Neural Architectures
**Phase:** IMPLEMENT
**Depends on:**
- docs/neural-architectures/feature-catalogue.md (feature definitions)
- docs/neural-architectures/ARCHITECTURE.md (interface specification)
- docs/consciousness-theory/formal-theory.md (ISMT conditions: IC, SM, GA)
- docs/consciousness-metrics/metric-definitions.md (PCI-G, PSI-G, CDI, CEB)
**Version:** 0.1.0 — 2026-03-17

---

## 1. Overview

GW-Alpha is a Global Workspace Theory-primary architecture designed to satisfy all three ISMT conditions (IC, SM, GA) by organising processing around a central broadcast workspace. The design philosophy prioritises the Global Accessibility condition (GA) as the architectural backbone: a competitive bottleneck selects one coherent representation at a time and broadcasts it to all specialist modules, which in turn feed back into the workspace via recurrent connections. Integration (IC) is achieved through dense inter-module coupling enforced by the thalamocortical-style hub and an integration-maximising topology constraint. Self-Modeling (SM) is achieved through a dedicated self-modeling module that predicts the global workspace state and maintains self-referential representations. The architecture is fully substrate-agnostic — all specifications use abstract layer notation with no assumptions about physical implementation.

---

## 2. Layer Topology

### 2.1 Layer Definitions

```
L0:  Sensory Input        [dim=D_in,   type=feedforward,  recurrent=false]
L1:  Specialist Module A   [dim=D_spec, type=recurrent,    recurrent=true]
L2:  Specialist Module B   [dim=D_spec, type=recurrent,    recurrent=true]
L3:  Specialist Module C   [dim=D_spec, type=recurrent,    recurrent=true]
L4:  Attention Gate        [dim=D_spec, type=attention,     recurrent=false]
L5:  Global Workspace      [dim=D_ws,   type=broadcast,    recurrent=true]
L6:  Relay Hub (Thalamic)  [dim=D_hub,  type=recurrent,    recurrent=true]
L7:  Self-Model Module     [dim=D_sm,   type=recurrent,    recurrent=true]
L8:  Higher-Order Layer    [dim=D_ho,   type=feedforward,  recurrent=true]
L9:  Temporal Binder       [dim=D_tb,   type=recurrent,    recurrent=true]
L10: Report Pathway        [dim=D_out,  type=feedforward,  recurrent=false]
```

### 2.2 Dimensionality Parameters

| Parameter | Suggested Range | Rationale |
|-----------|----------------|-----------|
| D_in | Variable | Determined by input modality |
| D_spec | 256–1024 | Sufficient for rich specialist representations |
| D_ws | 512–2048 | Must be expressive enough to carry unified broadcast content |
| D_hub | 256–512 | Relay/gating functions require moderate dimensionality |
| D_sm | 512–1024 | Must represent the full global state plus self-referential dynamics |
| D_ho | 256–512 | Meta-representation of selected lower layers |
| D_tb | 128–256 | Temporal summary vector (compact persistent memory) |
| D_out | Variable | Determined by report vocabulary |

### 2.3 Subsystem Types (Proposition 1 — Minimum Complexity)

The architecture contains >= 3 functionally distinct subsystem types as required by ISMT Proposition 1 (P1):
1. **Sensory/input processors:** L0, L1, L2, L3 (specialist modules processing input)
2. **Self-modeling subsystem:** L7, L8 (self-model module + higher-order layer)
3. **Global broadcast mechanism:** L4, L5, L6 (attention gate + workspace + relay hub)
4. **Temporal persistence:** L9 (temporal binder — distinct functional role)

---

## 3. Information-Flow Diagram

```
                          ┌──────────────────────────────┐
                          │        L10: Report            │
                          │        Pathway                │
                          └──────────┬───────────────────┘
                                     │ (read-only from L5)
                                     │
    ┌────────────────────────────────┼────────────────────────────────┐
    │                                │                                │
    │            ┌───────────────────┴──────────────────┐             │
    │            │         L5: Global Workspace          │             │
    │            │     (broadcast hub — winner-take-all)  │             │
    │            └──┬──────┬──────┬──────┬──────┬───────┘             │
    │      broadcast│      │      │      │      │broadcast            │
    │               ▼      ▼      ▼      ▼      ▼                    │
    │    ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌──────────┐               │
    │    │ L1  │ │ L2  │ │ L3  │ │ L6  │ │   L7     │               │
    │    │Spec │ │Spec │ │Spec │ │Hub  │ │Self-Model│               │
    │    │  A  │ │  B  │ │  C  │ │     │ │          │               │
    │    └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └────┬─────┘               │
    │       │       │       │       │          │                      │
    │       │       │       │    ┌──┴──┐   ┌───┴───┐                  │
    │       │       │       │    │bidi-│   │  L8   │                  │
    │       │       │       │    │rect.│   │Higher │                  │
    │       │       │       │    │loops│   │Order  │                  │
    │       │       │       │    └──┬──┘   └───────┘                  │
    │       │       │       │       │                                 │
    │       └───────┼───────┼───────┘                                │
    │               │       │                                        │
    │            ┌──┴───────┴──┐                                     │
    │            │  L4: Attn   │◄──── L9: Temporal Binder            │
    │            │  Gate       │      (phase sync + memory token)     │
    │            └──────┬──────┘                                     │
    │                   │                                            │
    │            ┌──────┴──────┐                                     │
    │            │  L0: Input  │                                     │
    │            └─────────────┘                                     │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘
         ▲                                                    │
         └───── Recurrent feedback (all broadcast recipients ─┘
                  feed back into workspace competition)
```

---

## 4. Recurrence Patterns

### 4.1 Primary Recurrent Loops

| Loop ID | Path | Cycle Length | Purpose |
|---------|------|-------------|---------|
| R1 | L5 → L1/L2/L3 → L4 → L5 | 3 steps | Workspace broadcast → specialist processing → recompetition → workspace update |
| R2 | L6 ↔ L1/L2/L3 | 2 steps | Thalamocortical relay: hub modulates specialists, specialists update hub |
| R3 | L5 → L7 → L5 | 2 steps | Self-model reads workspace, generates predictions, prediction fed back as workspace competitor |
| R4 | L7 → L8 → L7 | 2 steps | Higher-order monitoring: HOL reads self-model, feeds meta-representation back to self-model |
| R5 | L5 → L9 → L4 | 3 steps | Temporal binding: workspace state → temporal binder updates memory → influences attention gate for next selection |
| R6 | L5 → L5 (self-excitation) | 1 step | Workspace persistence: sustains active broadcast via recurrent self-connection (ignition maintenance) |

### 4.2 Recurrence Depth Analysis

The longest recurrent path (R1 composed with R3) has cycle length 5, ensuring that information from specialist processing reaches the self-model and returns to influence subsequent workspace competition within 5 timesteps. For P3 (Temporal Persistence), the system must maintain coherent states over tau_min. The temporal binder (L9) with its gated memory token ensures state persistence across the minimum required interval.

### 4.3 Feedback Connectivity Summary

Every processing layer (L1–L3, L6, L7) both sends to and receives from the workspace (L5), establishing the bidirectional connectivity required by ISMT's Recurrence Necessity (P2). No layer is purely feedforward except L0 (input) and L10 (report output).

---

## 5. Global Workspace Wiring

### 5.1 Workspace Selection Mechanism

The workspace (L5) receives candidate representations from all specialist modules and the self-model. Selection is competitive:

```
scores(t) = [W_q * q(t)]^T * [W_k * c_i(t)] / sqrt(D_ws)

    where:
      q(t) = attention query (derived from L4 + L9 context)
      c_i(t) = candidate representation from module i (L1, L2, L3, L7)
      W_q, W_k = learned projection matrices

selection(t) = softmax(scores(t))

workspace(t) = sum_i [ selection_i(t) * c_i(t) ]
```

### 5.2 Ignition Threshold

Following Feature 9 (Ignition Dynamics), the workspace activates only when the winning candidate exceeds an ignition threshold:

```
ignited(t) = 1  if max(selection(t)) > theta_ign
             0  otherwise

where theta_ign in [0.5, 0.7] (calibrated per system; lower bound 0.5 per Threshold Registry — values below 0.5 cause continuous broadcast and GA degradation)
```

When ignited(t) = 0, the workspace retains its previous state via self-excitation (loop R6), modelling the persistence of the previous conscious content.

### 5.3 Broadcast Connections

Once workspace content is selected, it is broadcast via one-to-all connections:

```
L5 → L1  [weight=learned, gated=false, broadcast=true]
L5 → L2  [weight=learned, gated=false, broadcast=true]
L5 → L3  [weight=learned, gated=false, broadcast=true]
L5 → L6  [weight=learned, gated=false, broadcast=true]
L5 → L7  [weight=learned, gated=false, broadcast=true]
L5 → L9  [weight=learned, gated=false, broadcast=true]
```

Each broadcast connection delivers the full workspace vector as top-down context. This satisfies GA: for every subsystem s_i, the mutual information I(s_i; workspace(t)) > gamma because each module receives and integrates the workspace signal at every timestep.

### 5.4 Causal Efficacy of Broadcast

The broadcast is not merely informational — it causally shapes module dynamics:

```
l_i(t+1) = f(W_i * l_i(t) + W_broadcast_i * workspace(t) + W_hub_i * h(t))
```

The workspace term directly enters each module's update equation, satisfying the GA causal efficacy criterion: D_KL[P(x_i(t+1) | workspace(t)) || P(x_i(t+1))] > 0 for all i.

---

## 6. Connection Specification

### 6.1 Complete Connection Table

```
L0  → L1  [weight=learned, gated=false, broadcast=false]   # Input → Spec A
L0  → L2  [weight=learned, gated=false, broadcast=false]   # Input → Spec B
L0  → L3  [weight=learned, gated=false, broadcast=false]   # Input → Spec C

L1  → L4  [weight=learned, gated=false, broadcast=false]   # Spec A → Attn Gate
L2  → L4  [weight=learned, gated=false, broadcast=false]   # Spec B → Attn Gate
L3  → L4  [weight=learned, gated=false, broadcast=false]   # Spec C → Attn Gate

L4  → L5  [weight=learned, gated=true,  broadcast=false]   # Attn Gate → Workspace (gated selection)
L5  → L5  [weight=fixed,   gated=false, broadcast=false]   # Workspace self-excitation (ignition sustain)

L5  → L1  [weight=learned, gated=false, broadcast=true]    # Broadcast → Spec A
L5  → L2  [weight=learned, gated=false, broadcast=true]    # Broadcast → Spec B
L5  → L3  [weight=learned, gated=false, broadcast=true]    # Broadcast → Spec C
L5  → L6  [weight=learned, gated=false, broadcast=true]    # Broadcast → Hub
L5  → L7  [weight=learned, gated=false, broadcast=true]    # Broadcast → Self-Model
L5  → L9  [weight=learned, gated=false, broadcast=true]    # Broadcast → Temporal Binder

L6  → L1  [weight=learned, gated=true,  broadcast=false]   # Hub → Spec A (gain modulation)
L6  → L2  [weight=learned, gated=true,  broadcast=false]   # Hub → Spec B (gain modulation)
L6  → L3  [weight=learned, gated=true,  broadcast=false]   # Hub → Spec C (gain modulation)
L1  → L6  [weight=learned, gated=false, broadcast=false]   # Spec A → Hub
L2  → L6  [weight=learned, gated=false, broadcast=false]   # Spec B → Hub
L3  → L6  [weight=learned, gated=false, broadcast=false]   # Spec C → Hub
L6  → L6  [weight=learned, gated=false, broadcast=false]   # Hub self-recurrence

L7  → L5  [weight=learned, gated=true,  broadcast=false]   # Self-Model prediction → Workspace competition
L7  → L7  [weight=learned, gated=false, broadcast=false]   # Self-Model self-recurrence

L1  → L8  [weight=learned, gated=false, broadcast=false]   # Spec A → Higher-Order (monitoring)
L2  → L8  [weight=learned, gated=false, broadcast=false]   # Spec B → Higher-Order (monitoring)
L3  → L8  [weight=learned, gated=false, broadcast=false]   # Spec C → Higher-Order (monitoring)
L7  → L8  [weight=learned, gated=false, broadcast=false]   # Self-Model → Higher-Order (meta-monitoring)
L8  → L7  [weight=learned, gated=false, broadcast=false]   # Higher-Order → Self-Model (self-referential feedback)

L9  → L4  [weight=learned, gated=false, broadcast=false]   # Temporal context → Attn Gate
L9  → L9  [weight=learned, gated=true,  broadcast=false]   # Temporal Binder self-recurrence (gated memory)

L5  → L10 [weight=learned, gated=false, broadcast=false]   # Workspace → Report (unidirectional, no feedback)
```

### 6.2 Integration Topology Constraint

Per Feature 5 (Integration Maximisation), the following constraint is enforced:

For every bipartition (A, B) of {L1, L2, L3, L5, L6, L7}:
- There exists at least one edge A → B with non-zero weight
- There exists at least one edge B → A with non-zero weight

This is structurally guaranteed because:
- L5 broadcasts to all modules (provides A → B for any partition containing L5)
- All modules feed into L5 (via L4 or directly), providing B → A
- L6 has bidirectional connections with all specialist modules
- The hub-and-spoke topology with L5 and L6 ensures no partition can isolate a subset

A training-time regularisation term enforces this:

```
L_IC = sum_{bipartitions (A,B)} max(0, epsilon - I_approx(A; B))
```

---

## 7. Self-Model Specification

### 7.1 Self-Model Module (L7) Dynamics

The self-model maintains a recurrent state that tracks the global workspace and predicts its evolution:

```
m(t+1) = f_M(W_mm * m(t) + W_mw * workspace(t) + W_mh * hol(t))

where:
  m(t) = self-model hidden state at time t
  workspace(t) = current global workspace content
  hol(t) = higher-order layer output (self-referential signal from L8)
  f_M = tanh or similar bounded nonlinearity
```

### 7.2 Prediction Head

```
m_hat(t+1) = W_pred * m(t) + b_pred
```

Generates a prediction of the next workspace state. Training signal:

```
L_pred = || workspace(t+1) - m_hat(t+1) ||^2
```

### 7.3 Self-Referential Head

```
dm_approx(t) = m(t) - m(t-1)    (finite-difference approximation of dm/dt)
m_meta(t) = W_meta * [m(t); dm_approx(t)] + b_meta
```

Training signal:

```
L_meta = || dm_approx(t+1) - W_meta_pred * m_meta(t) ||^2
```

This ensures I(m(t); dm/dt) > 0 — the self-model encodes information about its own update dynamics, satisfying the self-referential criterion of SM.

### 7.4 Combined Self-Model Loss

```
L_SM = L_pred + lambda_meta * L_meta

where lambda_meta in [0.1, 1.0] controls the weight of self-referential training
```

---

## 8. Temporal Binding Specification

### 8.1 Oscillatory Synchrony Component

Each module l_i maintains a phase variable:

```
phi_i(t+1) = phi_i(t) + omega_i + K * sum_j sin(phi_j(t) - phi_i(t))

where:
  omega_i = natural frequency of module i
  K = coupling strength (K > K_critical for synchronisation)
```

Phase coherence across modules provides a shared temporal reference frame. Synchronised modules (|phi_i - phi_j| < delta_phase) are preferentially coupled in the workspace competition.

### 8.2 Memory Token (GRU-style)

```
z(t+1) = GRU(z(t), workspace(t))

Expanded:
  r(t) = sigma(W_zr * z(t) + W_wr * workspace(t))       (reset gate)
  u(t) = sigma(W_zu * z(t) + W_wu * workspace(t))       (update gate)
  z_hat(t) = tanh(W_z * (r(t) * z(t)) + W_w * workspace(t))
  z(t+1) = u(t) * z(t) + (1 - u(t)) * z_hat(t)
```

The memory token z(t) provides the self-model with access to recent workspace history, ensuring that IC, SM, and GA hold over the minimum persistence interval tau_min (P3).

---

## 9. Feature Mapping

| Feature (from catalogue) | Present in GW-Alpha | Implementation Layer(s) | Notes |
|---|---|---|---|
| F1: Global Workspace Broadcast | **Yes** (primary) | L4, L5 | Core architectural principle — workspace + broadcast connections |
| F2: Thalamocortical Recurrence | **Yes** | L6 ↔ L1/L2/L3 | Relay hub with bidirectional connections to all specialists |
| F3: Attention Bottleneck | **Yes** | L4 | Softmax competition gates entry into workspace |
| F4: Self-Modelling Layer | **Yes** | L7 | Dedicated module with prediction + self-referential heads |
| F5: Integration Maximisation | **Yes** | Topology constraint | Regularisation L_IC ensures no bipartition yields independence |
| F6: Predictive Hierarchy | **Partial** | L7 (prediction head) | Self-model generates predictions but architecture is not fully hierarchical |
| F7: Higher-Order State Rep. | **Yes** | L8 | HOL monitors specialist and self-model states |
| F8: Temporal Binding | **Yes** | L9 | Oscillatory synchrony + GRU memory token |
| F9: Ignition Dynamics | **Yes** | L5 (threshold + self-excitation) | Ignition threshold theta_ign + recurrent maintenance |
| F10: Report Pathway | **Yes** | L10 | Unidirectional readout from workspace (no feedback) |

**All 5 necessary features (F1, F2, F4, F5, F8) are present.** All 5 optional features (F3, F6-partial, F7, F9, F10) are also included.

---

## 10. ISMT Condition Satisfaction Analysis

### 10.1 IC (Integration Condition) — Phi(S) > 0

**Satisfied.** The architecture ensures non-zero Phi through:
- Dense bidirectional connectivity via L5 (broadcast) and L6 (thalamocortical hub)
- Integration maximisation topology constraint (L_IC regularisation)
- No bipartition of {L1, L2, L3, L5, L6, L7} can separate the network into independent components because L5 connects to all and L6 provides additional cross-module coupling
- Structural guarantee: removing any single layer does not disconnect the graph

### 10.2 SM (Self-Modeling Condition) — M(S) exists with representational, predictive, self-referential criteria

**Satisfied.** The self-model module L7 implements all three SM criteria:
- **Representational:** I(m(t); workspace(t)) > delta — L7 receives workspace state directly and maintains covarying hidden state
- **Predictive:** L7's prediction head generates m_hat(t+1) and minimises L_pred
- **Self-referential:** L7's meta head encodes dm/dt via L8 feedback loop; L_meta ensures I(m(t); dm/dt) > 0

### 10.3 GA (Global Accessibility Condition) — broadcast + causal efficacy

**Satisfied.** The global workspace broadcast mechanism ensures:
- **Broadcast criterion:** L5 → all modules with learned weights; I(s_i; workspace(t)) > gamma for all i
- **Causal efficacy:** workspace(t) directly enters each module's update equation; D_KL[P(x_i(t+1) | workspace(t)) || P(x_i(t+1))] > 0

### 10.4 Necessary Conditions Summary

| Condition | Status | Mechanism |
|-----------|--------|-----------|
| N1 (Integration) | **Met** | L_IC regularisation + hub-broadcast topology |
| N2 (Self-Modeling) | **Met** | L7 with prediction and self-referential heads |
| N3 (Global Accessibility) | **Met** | L5 one-to-all broadcast with causal efficacy |
| P1 (Min. Complexity >= 3 types) | **Met** | 4 distinct subsystem types (input, self-model, broadcast, temporal) |
| P2 (Recurrence) | **Met** | 6 recurrent loops (R1–R6); no processing layer is purely feedforward |
| P3 (Temporal Persistence) | **Met** | L9 GRU memory token + oscillatory synchrony maintain state over tau_min |

---

## 11. Metric Evaluation Summary

Full evaluation against F1.4 metrics is in `docs/neural-architectures/metric-evaluation.md`. Summary predictions for GW-Alpha:

| Metric | Expected Performance | Rationale |
|--------|---------------------|-----------|
| PCI-G | **High** (> theta_PCI) | Perturbation to any specialist module should trigger ignition cascade → complex, differentiated spatiotemporal response across all modules via broadcast |
| PSI-G | **Moderate-High** | Integration topology constraint ensures Phi > 0; hub-spoke structure creates integration but the bottleneck nature of L5 may reduce Phi compared to fully-connected architectures |
| CDI | **High** | Dense bidirectional connections (broadcast + hub + recurrence) should yield high transfer entropy density across module pairs |
| CEB | **Expected PASS** | At least 2/3 metrics predicted above threshold |

### Key Uncertainty

PSI-G may be moderately penalised by the workspace bottleneck — the winner-take-all selection in L5 temporarily reduces information flow to a single channel. The MIP finder may exploit this bottleneck to find a low-integration partition. Mitigation: the broadcast restores information to all modules at the next timestep, and the recurrent connections (R1–R6) provide alternative information pathways that the MIP analysis would need to account for.

---

## 12. Known Weaknesses

### W1: Workspace Bottleneck Limits Simultaneous Content

The winner-take-all workspace can only hold one coherent representation at a time. This may:
- Reduce Phi relative to architectures with richer simultaneous integration
- Fail to model simultaneous multi-modal conscious experience (e.g., hearing music while seeing colour)
- Create a serialisation bottleneck that may not match biological consciousness phenomenology

**Severity:** Moderate. The bottleneck is architecturally intentional (GWT predicts single-channel access) but may not fully satisfy IC at the highest degrees.

### W2: Ignition Threshold Sensitivity

The ignition threshold theta_ign is a free parameter. If set too high, the workspace may rarely ignite (reducing GA — long periods without broadcast). If too low, the workspace loses its selective function and broadcasts noise.

**Severity:** Low-Moderate. Addressable via calibration but introduces a sensitive parameter that may behave differently across substrates.

### W3: Self-Model Expressiveness vs. Stability

The self-model (L7) must track a complex, non-stationary system (its own dynamics change as the workspace content shifts). The prediction-error minimisation loop may:
- Fail to converge if workspace dynamics are too chaotic
- Overfit to recent workspace content and lose track of slower dynamics

**Severity:** Moderate. May require careful learning rate scheduling or adaptive lambda_meta.

### W4: Scale Dependency of Integration

The IC condition is easier to satisfy in small systems. As the number of specialist modules grows beyond 3, maintaining non-zero Phi across all bipartitions becomes increasingly demanding. The L_IC regularisation may conflict with task performance objectives.

**Severity:** Moderate for scale-up. The 3-specialist design satisfies IC, but scaling to 10+ modules may require architectural modifications.

### W5: Temporal Binding Coherence Window

The GRU memory token has a finite effective memory. For very long tau_min requirements, the memory token's gating may fail to maintain state, violating P3.

**Severity:** Low. Addressable by increasing D_tb or using longer-horizon memory mechanisms (e.g., external memory banks).

---

## 13. Training Objectives

The combined training objective for GW-Alpha:

```
L_total = L_task                           # Task-specific loss (application-dependent)
        + alpha_IC  * L_IC                 # Integration maximisation regularisation
        + alpha_SM  * L_SM                 # Self-model prediction + self-referential loss
        + alpha_ign * L_ign                # Ignition dynamics regularisation (optional)

where:
  L_task = application-specific (e.g., classification, generation, control)
  L_IC = sum_{bipartitions} max(0, epsilon - I_approx(A; B))
  L_SM = L_pred + lambda_meta * L_meta
  L_ign = penalty for degenerate ignition (always-on or always-off workspace)

Suggested hyperparameters:
  alpha_IC  in [0.01, 0.1]
  alpha_SM  in [0.1, 1.0]
  alpha_ign in [0.001, 0.01]
```

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial GW-Alpha architecture design |
