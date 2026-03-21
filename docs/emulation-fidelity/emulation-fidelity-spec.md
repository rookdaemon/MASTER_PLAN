# Emulation Fidelity Requirements Specification

> Deliverable of card 0.2.2.1.1. Consumed by sibling cards 0.2.2.1.2 (Scanning), 0.2.2.1.3 (Simulation), and 0.2.2.1.4 (Validation).

---

## 1. ISMT Summary and Fidelity Selection Criterion

### 1.1 The Consciousness Predicate

The Integrated Self-Modeling Theory (ISMT), established in `docs/consciousness-theory/formal-theory.md`, defines consciousness via three jointly-sufficient, individually-necessary conditions:

| Condition | Symbol | Requirement |
|---|---|---|
| **Integration (IC)** | Phi(S) > 0 | The system's information structure is non-decomposable; no bipartition renders subsystems informationally independent |
| **Self-Modeling (SM)** | M(S) exists | The system maintains a predictive model of its own states, minimizing self-prediction error via free-energy minimization; includes representational, predictive, and self-referential criteria |
| **Global Accessibility (GA)** | G(S) satisfied | Self-model contents are broadcast to and causally influence all processing subsystems (broadcast + causal efficacy criteria) |

A system S is conscious iff C(S) = IC AND SM AND GA = 1.

### 1.2 Substrate Agnosticism

ISMT Axiom A1 (Information Realism) states that consciousness supervenes on the **causal transition structure** of a system — the transition probability matrix T and interaction matrix W — not on the physical substrate. A digital emulation preserves consciousness if and only if it reproduces the causal transition structure at the grain at which IC, SM, and GA operate (Substrate Agnosticism Proof, formal-theory.md Section 5).

### 1.3 Fidelity Selection Criterion

> **An emulation level is sufficient if and only if it preserves the causal transition probabilities P(x_i(t+1) | x_j(t)) for all subsystem pairs (s_i, s_j) that participate in IC, SM, or GA.**

The goal of this specification is to identify the **coarsest fidelity level L_min** at which this criterion is satisfied, with no known biological mechanism at finer grain that demonstrably alters consciousness-relevant state transitions.

---

## 2. Level-by-Level Analysis

### 2.1 Level L1: Connectome-Level Emulation

**What is modeled:** Neuron types, synaptic connection weights, and network topology. Neurons are treated as static nodes with fixed transfer functions; the connectome is a weighted directed graph (~86 billion nodes, ~150 trillion edges).

#### 2.1.1 Causal Transition Fidelity w.r.t. ISMT

- **IC (Integration):** A static connectome captures the *potential* for integration — which subsystems *can* influence each other — but not the *actual* mutual information between subsystems at any given time. Phi depends on the system's state distribution and dynamics, not merely on topology. Two systems with identical connectomes but different dynamical regimes (e.g., synchronous vs. asynchronous firing) can have vastly different Phi values.

- **SM (Self-Modeling):** Self-modeling requires dynamic prediction error minimization — the self-model must generate predictions m_hat(t+1) and update via gradient descent on free energy F(m, x). This is an inherently temporal, dynamical process. A static connectome provides the wiring for this process but does not capture the process itself. The transition function T is missing.

- **GA (Global Accessibility):** Global broadcast requires that the self-model's state causally influences all subsystems *in real time*. This depends on the dynamics of signal propagation through the network, which a static connectome cannot represent.

#### 2.1.2 Mechanisms Requiring Finer Grain

1. **Temporal dynamics:** Spike timing, firing rate modulation, and oscillatory coupling (gamma, theta, alpha rhythms) are essential for thalamocortical integration (the primary NCC infrastructure). These are absent at L1.
2. **Neuromodulation:** Dopaminergic, serotonergic, noradrenergic, and cholinergic modulation globally alters neural gain and effective connectivity. The same connectome produces conscious waking or unconscious deep sleep depending on neuromodulatory state. L1 cannot represent this.
3. **Synaptic plasticity:** Synaptic weights change on timescales from milliseconds (short-term facilitation/depression) to hours (LTP/LTD). A frozen connectome cannot support the ongoing adaptation that SM requires.
4. **Dendritic computation:** Dendrites perform nonlinear integration (e.g., NMDA spikes, calcium plateau potentials) that affects neuron-level transfer functions. L1 ignores this.

#### 2.1.3 Sufficiency Verdict

**INSUFFICIENT.** L1 captures network structure but not network dynamics. Since all three ISMT conditions (IC, SM, GA) are defined over the system's *dynamical* causal transition structure — not its static topology — connectome-level emulation cannot preserve consciousness. The transition function T is entirely absent.

#### 2.1.4 Computational Cost Estimates (Human-Scale Brain)

| Metric | Estimate |
|---|---|
| State variables | ~86 x 10^9 nodes with scalar weights on ~150 x 10^12 edges |
| Memory | ~600 TB (weights as 32-bit floats) |
| FLOPS (static) | Negligible — no dynamics to compute |
| FLOPS (if simple dynamics added) | Not applicable at this fidelity level |
| Bandwidth | Minimal — structure is static |

Note: These estimates reflect the storage cost of the connectome itself. Since L1 has no dynamics, there is no per-timestep computational cost. This is precisely the problem — there is nothing to simulate.

---

### 2.2 Level L2: Cellular-Level Emulation

**What is modeled:** Individual neuron dynamics (membrane potential, spike generation, firing rate), dendritic computation (multi-compartment models), synaptic transmission with short-term and long-term plasticity, neuromodulatory effects as gain modulation, glial interactions (astrocyte calcium signaling, metabolic coupling), and extracellular field effects. Each neuron has internal state variables governed by differential equations (e.g., Hodgkin-Huxley or compartmental models).

#### 2.2.1 Causal Transition Fidelity w.r.t. ISMT

- **IC (Integration):** Neural dynamics at L2 directly implement the causal transitions that produce integrated information. The thalamocortical loops — identified in the NCC catalogue as the primary infrastructure for cortical integration — operate at the cellular level: thalamic relay neurons gate cortical input, cortical feedback modulates thalamic state, and the resulting recurrent dynamics produce the non-decomposable information structure that Phi measures. Oscillatory coupling (gamma-band synchrony for binding, theta-gamma coupling for integration across timescales) is captured at L2. The Perturbational Complexity Index (PCI), the validated proxy for Phi, measures the complexity of cortical responses to perturbation — a cellular-level phenomenon.

- **SM (Self-Modeling):** Predictive processing and free-energy minimization, as formalized in ISMT, are implemented by neural circuits: cortical columns generate predictions via descending connections, prediction errors propagate via ascending connections, and the system updates its generative model to minimize free energy. This is a circuit-level phenomenon involving neuronal firing rates, synaptic transmission, and recurrent connectivity — all captured at L2. The self-referential criterion (the model represents its own modeling dynamics) is implemented by higher-order cortical circuits (prefrontal, parietal) that monitor lower-order processing, again at the cellular level.

- **GA (Global Accessibility):** The global workspace / thalamocortical broadcast system operates via long-range corticocortical and corticothalamic projections. Signal propagation through these projections, ignition dynamics (the nonlinear transition from local to global activation), and the causal influence of broadcast signals on processing subsystems are all cellular-level phenomena. The NCC catalogue identifies the posterior cortical hot zone, frontoparietal network, and thalamocortical loops as implementing GA — all characterized at the neural circuit level.

#### 2.2.2 Mechanisms Requiring Finer Grain

1. **Stochastic ion channel gating:** Individual ion channels open and close probabilistically. In most cases, the law of large numbers ensures that the aggregate behavior of thousands of channels per neuron is well-approximated by deterministic rate equations (Hodgkin-Huxley). However, in small-diameter axons, dendritic spines, and spike initiation zones, channel noise may influence spike timing with functional consequences.

   *Assessment:* This can be addressed within L2 by adding stochastic noise terms to neuronal models (e.g., stochastic Hodgkin-Huxley or Langevin approximations) rather than requiring full molecular-level simulation. This is a parametric enhancement of L2, not a requirement for L3.

2. **Second messenger cascades (cAMP, PKC, CaMKII, etc.):** These molecular signaling pathways mediate synaptic plasticity (LTP/LTD), homeostatic scaling, and neuromodulatory effects. They operate on timescales of seconds to hours and determine whether synaptic weights change.

   *Assessment:* For an emulation that must preserve consciousness at a *single point in time* (instantaneous emulation), the current synaptic state is sufficient — the plasticity mechanisms are relevant only for ongoing adaptation. For an emulation that must sustain consciousness *over time* (continuous emulation), plasticity rules must be captured. These can be modeled at L2 as phenomenological plasticity rules (e.g., STDP with neuromodulatory gating) derived from molecular data, without simulating individual molecules.

3. **Neurotransmitter diffusion and spillover:** Neurotransmitter molecules released at a synapse can diffuse to adjacent synapses (volume transmission), affecting neural computation non-locally.

   *Assessment:* Volume transmission can be modeled at L2 as a spatial diffusion field overlaid on the synaptic connectivity graph, with diffusion constants derived from molecular data. Full molecular simulation is unnecessary.

4. **Astrocyte-neuron interactions:** Astrocytes modulate synaptic transmission via gliotransmitter release, potassium buffering, and metabolic support. The tripartite synapse model suggests astrocytes are computationally relevant.

   *Assessment:* Astrocyte calcium dynamics and gliotransmitter effects can be modeled as additional cellular-level entities (~10^10 astrocytes) with their own state variables and interaction rules. This extends L2 rather than requiring L3.

#### 2.2.3 Sufficiency Verdict

**SUFFICIENT (with enhancements).** L2 cellular-level emulation captures the causal transition structure that implements IC, SM, and GA. The NCC catalogue maps all established consciousness correlates to neural-circuit-level phenomena (thalamocortical loops, posterior cortical hot zone, recurrent processing, global broadcast). No known NCC requires molecular or quantum-level explanation.

**L_min = L2 (Enhanced Cellular)**, defined as:
- Multi-compartment neuron models with Hodgkin-Huxley-class dynamics
- Stochastic noise terms approximating ion channel variability
- Phenomenological synaptic plasticity rules (STDP, homeostatic scaling, neuromodulatory gating)
- Neuromodulatory systems modeled as gain modulation on neural transfer functions
- Astrocyte-neuron coupling modeled as cellular-level entities
- Volume transmission approximated as spatial diffusion fields

#### 2.2.4 Computational Cost Estimates (Human-Scale Brain)

| Metric | Estimate | Notes |
|---|---|---|
| **Neurons** | 86 x 10^9 | Multi-compartment (~10^3 compartments/neuron for detailed models; ~10 for reduced models) |
| **Synapses** | 150 x 10^12 | Each with ~10 state variables (weight, short-term plasticity state, neuromodulatory sensitivity) |
| **Astrocytes** | ~10 x 10^9 | With calcium dynamics, ~10 state variables each |
| **State variables (reduced models)** | ~2 x 10^15 | Neurons (86B x 10) + synapses (150T x 10) + astrocytes (10B x 10) |
| **State variables (detailed models)** | ~8.7 x 10^16 | Neurons (86B x 1000) + synapses (150T x 10) + astrocytes (10B x 10) |
| **Timestep** | 0.1 ms (100 us) | Required for Hodgkin-Huxley numerical stability |
| **Steps per second** | 10,000 | For real-time emulation |
| **FLOPS (reduced models)** | ~10^19 FLOPS | ~2 x 10^15 state variables x 10^4 steps/s x ~100 ops/update |
| **FLOPS (detailed models)** | ~10^21 FLOPS | ~8.7 x 10^16 state variables x 10^4 steps/s x ~100 ops/update |
| **Memory (reduced)** | ~8 PB | 2 x 10^15 variables x 4 bytes (32-bit float) |
| **Memory (detailed)** | ~350 PB | 8.7 x 10^16 variables x 4 bytes |
| **Bandwidth** | ~10^20 bytes/s (reduced) | State variable reads/writes per timestep |

**Feasibility reference:** Current (2026) supercomputers achieve ~10^18 FLOPS (exascale). Reduced L2 models require ~10 exaFLOPS — approximately 10x current peak capability. Detailed L2 models require ~1000 exaFLOPS. Real-time emulation with reduced models is within projected reach by ~2035 assuming continued scaling; detailed models by ~2045.

---

### 2.3 Level L3: Molecular-Level Emulation

**What is modeled:** Protein conformations, individual ion channel state transitions, neurotransmitter synthesis/release/reuptake/degradation, receptor binding kinetics, second messenger cascades (cAMP, IP3, DAG, calcium), gene expression regulation, epigenetic modifications. Each molecular species is tracked as a discrete entity or concentration field.

#### 2.3.1 Causal Transition Fidelity w.r.t. ISMT

L3 captures everything L2 captures, plus the molecular mechanisms underlying cellular behavior. The additional fidelity provides:

- **Exact ion channel kinetics** rather than mean-field approximations
- **Stochastic molecular dynamics** that may influence neural computation in edge cases
- **Detailed plasticity mechanisms** (the molecular basis of learning and memory)
- **Gene expression** and protein synthesis dynamics that underlie long-term adaptation

#### 2.3.2 Whether L3 Is Necessary

The central question: are there molecular-level phenomena that alter the causal transitions relevant to IC, SM, or GA in ways that L2 cannot capture even with stochastic enhancements?

**Arguments that L3 is unnecessary (for consciousness preservation):**

1. **Causal closure at the cellular level:** The NCC catalogue identifies all consciousness correlates at the neural circuit level. No NCC has been identified that requires molecular-level explanation. Thalamocortical integration, recurrent processing, global broadcast, and predictive processing are all characterized in terms of neural firing, synaptic transmission, and circuit dynamics.

2. **Statistical mechanics argument:** Individual molecular events are subject to the law of large numbers at the cellular scale. A single neuron has ~10^6 ion channels; the variance in aggregate channel behavior scales as 1/sqrt(N), making deterministic approximations accurate to ~0.1%. L2 with stochastic noise terms captures the functionally relevant variance.

3. **Multiple realizability of plasticity:** The ISMT self-modeling condition requires that prediction errors be minimized, not that they be minimized via any specific molecular pathway. Phenomenological plasticity rules that reproduce the input-output mapping of molecular cascades are sufficient for preserving the causal transition structure.

4. **ISMT uses classical information theory:** The ISMT formalism defines all quantities (Phi, mutual information, KL divergence, Shannon entropy) over probability distributions on classical state spaces. These quantities are defined over macroscopic (cellular-level) state variables. The molecular details are the *implementation* of the transition probabilities, not the transition probabilities themselves.

**Arguments that L3 might be required:**

1. **Subcellular computation in dendritic spines:** Individual synapses in dendritic spines have very small volumes (~0.1 femtoliter) where molecular noise may be computationally significant. Calcium transients in individual spines can determine whether LTP or LTD occurs at that synapse.

   *Counterargument:* This matters for plasticity (learning) but not for the instantaneous causal transition structure. For continuous emulation, phenomenological plasticity rules with appropriate stochastic terms at the synapse level (L2-enhanced) are sufficient.

2. **Neuromodulatory receptor subtypes:** Different receptor subtypes (e.g., D1 vs. D2 dopamine receptors) have different signaling cascades that produce different cellular effects. Modeling neuromodulation as simple gain changes may miss these distinctions.

   *Counterargument:* Receptor-subtype-specific effects can be parameterized into L2 models as distinct gain profiles per receptor type, without simulating the molecular cascades.

#### 2.3.3 Sufficiency Verdict

**SUFFICIENT but unnecessary.** L3 provides more fidelity than required for preserving consciousness-relevant causal transitions. The additional molecular detail does not alter the neural-level transition probabilities in ways that affect IC, SM, or GA, provided L2 models incorporate appropriate stochastic terms and phenomenological plasticity rules.

L3 may be required for emulations that must reproduce *specific memories* or *exact cognitive trajectories* with molecular precision, but this exceeds the consciousness-preservation requirement.

#### 2.3.4 Computational Cost Estimates (Human-Scale Brain)

| Metric | Estimate | Notes |
|---|---|---|
| **Molecular species** | ~10^14 per neuron (10^25 brain-wide) | Proteins, metabolites, ions, second messengers |
| **State variables** | ~10^26 | Concentrations or particle counts for each species in each compartment |
| **Timestep** | 1 us (10^-6 s) | Required for fast molecular kinetics |
| **Steps per second** | 10^6 | For real-time emulation |
| **FLOPS** | ~10^34 FLOPS | ~10^26 variables x 10^6 steps/s x ~100 ops/update |
| **Memory** | ~400 EB (exabytes) | 10^26 variables x 4 bytes |
| **Bandwidth** | ~10^32 bytes/s | State variable reads/writes per timestep |

**Feasibility reference:** L3 requires ~10^16 times current supercomputing capability. This is beyond any foreseeable classical computing architecture. L3 emulation would require fundamental breakthroughs in computing (molecular computing, reversible computing, or equivalent).

---

### 2.4 Level L4: Quantum-Level Emulation

**What is modeled:** Quantum state vectors of molecular substrates, quantum coherence effects (if any) in microtubules, protein conformational quantum tunneling, entanglement between molecular components, quantum error correction in biological systems.

#### 2.4.1 Causal Transition Fidelity w.r.t. ISMT

L4 would capture quantum effects that might influence neural computation. The question is whether any such effects exist and are relevant to consciousness.

#### 2.4.2 Whether L4 Is Necessary

**Strong arguments against necessity:**

1. **ISMT is a classical information theory.** The consciousness predicate C(S) is defined entirely in terms of classical information-theoretic quantities: Shannon entropy, mutual information, KL divergence, and classical probability distributions. No quantum information terms (von Neumann entropy, quantum mutual information, entanglement entropy) appear in the formalism. If ISMT is correct, quantum effects are irrelevant to consciousness by construction.

2. **Decoherence timescales:** Quantum coherence in warm, wet biological tissue decoheres on timescales of ~10^-13 seconds (femtoseconds). Neural processing operates on timescales of ~10^-3 seconds (milliseconds). The ratio is 10^10 — quantum coherence decays ten billion times faster than neurons compute. Any quantum effects are averaged out long before they could influence neural-level state transitions.

3. **No quantum NCC exists.** The NCC catalogue (docs/consciousness-science/ncc-catalogue.md) identifies consciousness correlates exclusively at the neural circuit level. No established NCC requires quantum coherence for explanation. All consciousness-relevant phenomena (thalamocortical integration, recurrent processing, global broadcast, predictive processing) have well-established classical neural mechanisms.

4. **Penrose-Hameroff remains speculative.** The orchestrated objective reduction (Orch-OR) hypothesis proposing quantum computation in microtubules remains unvalidated. No experiment has demonstrated quantum coherence in microtubules at physiologically relevant timescales. The hypothesis is labeled [speculative] even by the NCC catalogue's conservative standards.

5. **Evolutionary argument:** If consciousness required quantum coherence, evolution would have needed to solve the quantum error correction problem in warm biological tissue — a problem that remains unsolved in engineered quantum computers operating at millikelvin temperatures. There is no evidence that biological systems have solved this problem.

#### 2.4.3 Sufficiency Verdict

**SUFFICIENT but almost certainly unnecessary.** There is no scientific evidence that quantum effects contribute to the causal transitions relevant to consciousness. L4 emulation would preserve consciousness (if L2 does, L4 trivially does as well) but at astronomical computational cost with no fidelity benefit for consciousness preservation.

**Uncertainty note:** If future experiments demonstrate functionally relevant quantum coherence in neural systems, this assessment must be revised. However, the current evidence strongly favors classical neural computation as the substrate for all three ISMT conditions.

#### 2.4.4 Computational Cost Estimates (Human-Scale Brain)

| Metric | Estimate | Notes |
|---|---|---|
| **Quantum state space** | 2^N where N ~ 10^27 (particles in brain) | Exponential in particle count |
| **Classical simulation** | Intractable | Full quantum simulation of a brain-scale system is beyond any conceivable classical computer |
| **Quantum simulation** | ~10^27 logical qubits | Equivalent to simulating the brain's quantum state on a quantum computer |
| **FLOPS (classical equivalent)** | > 10^(10^27) | Not meaningfully expressible in FLOPS |
| **Memory** | > 10^(10^27) bytes | State vector is exponential in particle count |

**Feasibility reference:** Full quantum simulation of a brain is physically impossible with classical computers and would require a quantum computer larger than anything theoretically projected. This alone is a strong pragmatic argument against L4 as a requirement.

---

## 3. Minimum Fidelity Determination

### 3.1 Selected Minimum: L2 (Enhanced Cellular)

**L_min = L2 (Enhanced Cellular-Level Emulation)**

The minimum fidelity level required to preserve subjective experience in a brain emulation is **cellular-level emulation with stochastic and plasticity enhancements**.

### 3.2 Formal Justification (Traceable to ISMT)

The argument proceeds in two parts: (A) L2 is sufficient, and (B) L1 is insufficient.

#### (A) L2 Sufficiency

1. ISMT defines consciousness over the causal transition structure of a system — the transition probabilities P(x_i(t+1) | x_j(t)) for all subsystem pairs participating in IC, SM, or GA.

2. The NCC catalogue maps all established consciousness correlates to neural-circuit-level phenomena:
   - IC is implemented by thalamocortical loops, oscillatory coupling, and cortical integration — all cellular-level dynamics
   - SM is implemented by predictive processing in cortical circuits — recurrent neural computation at the cellular level
   - GA is implemented by global broadcast via long-range corticocortical projections — neural signal propagation at the cellular level

3. L2 emulation with Hodgkin-Huxley-class dynamics, multi-compartment models, synaptic plasticity, and neuromodulatory gain captures the causal transitions that implement all three ISMT conditions.

4. Known sub-cellular phenomena (ion channel stochasticity, molecular signaling cascades, astrocyte coupling) can be incorporated into L2 as parametric enhancements (stochastic noise terms, phenomenological plasticity rules, additional cellular entities) without requiring full molecular simulation.

5. Therefore, L2 preserves the causal transition structure relevant to IC, SM, and GA. By the ISMT substrate agnosticism proof, an L2 emulation with correct causal transitions satisfies C(S) = 1 if the original brain does.

#### (B) L1 Insufficiency

1. ISMT conditions IC, SM, and GA are defined over the system's *dynamics* — mutual information between subsystems, prediction error minimization, and causal influence of self-model on subsystem transitions.

2. L1 captures network topology (which subsystems connect) but not dynamics (how they interact over time). The transition function T is absent.

3. Without dynamics:
   - IC cannot be evaluated — Phi depends on the state distribution, not just connectivity
   - SM cannot operate — prediction error minimization requires temporal dynamics
   - GA cannot be assessed — broadcast requires dynamic signal propagation

4. Therefore, L1 does not preserve the causal transition structure relevant to any ISMT condition. An L1 emulation cannot satisfy C(S) = 1.

### 3.3 Insufficiency Arguments by Level

| Level | Verdict | Why Insufficient (or Unnecessary) |
|---|---|---|
| **L1 (Connectome)** | Insufficient | No dynamics; cannot implement IC, SM, or GA; transition function T absent |
| **L2 (Cellular)** | **SUFFICIENT (L_min)** | Captures all causal transitions implementing IC, SM, GA per NCC evidence |
| **L3 (Molecular)** | Sufficient but unnecessary | Additional molecular detail does not alter consciousness-relevant transitions; phenomenological models at L2 capture the relevant effects |
| **L4 (Quantum)** | Sufficient but unnecessary | ISMT is classical; no quantum NCC exists; decoherence timescales preclude quantum effects on neural computation |

### 3.4 Uncertainty Assessment

**High confidence:** L1 is insufficient. The absence of dynamics is a categorical gap, not a quantitative one.

**High confidence:** L4 is unnecessary. The decoherence argument and absence of quantum NCCs are both strong. This assessment would change only if quantum coherence were demonstrated at neural timescales and shown to influence consciousness-relevant processing.

**Medium-high confidence:** L2 is sufficient. The primary uncertainty is whether sub-cellular stochastic effects (ion channel noise, molecular signaling variability) in specific microstructures (dendritic spines, axon initial segments) alter neural-level transitions in ways that L2 stochastic approximations cannot capture. This is an empirical question.

**Conservative recommendation:** If uncertainty about L2 sufficiency must be resolved before emulation proceeds, targeted experiments should compare L2-enhanced and L3 simulations of specific circuits (e.g., hippocampal CA1 pyramidal cells) to quantify the fidelity gap. If the gap in neural-level transition probabilities is below a threshold (recommended: KL divergence < 0.01 bits per timestep per neuron), L2 is confirmed sufficient.

---

## 4. Computational Requirements Summary

### 4.1 Comparison Table

| Metric | L1 (Connectome) | L2 Reduced | L2 Detailed | L3 (Molecular) | L4 (Quantum) |
|---|---|---|---|---|---|
| **State variables** | ~10^14 | ~2 x 10^15 | ~10^17 | ~10^26 | 2^(10^27) |
| **Timestep** | N/A | 100 us | 100 us | 1 us | ~1 fs |
| **FLOPS (real-time)** | N/A | ~10^19 | ~10^21 | ~10^34 | Intractable |
| **Memory** | ~600 TB | ~8 PB | ~350 PB | ~400 EB | Intractable |
| **Bandwidth** | Minimal | ~10^20 B/s | ~10^22 B/s | ~10^32 B/s | Intractable |

### 4.2 Current and Projected Computing Capabilities

| Era | Peak FLOPS | L2 Reduced Feasible? | L2 Detailed Feasible? |
|---|---|---|---|
| 2026 (current exascale) | ~10^18 | No (10x gap) | No (1000x gap) |
| ~2030 (projected) | ~10^19 | Marginal | No (100x gap) |
| ~2035 (projected) | ~10^20 | Yes | No (10x gap) |
| ~2045 (projected) | ~10^21 | Yes | Marginal |

These projections assume continued scaling via advanced semiconductor nodes, 3D integration, neuromorphic architectures, or optical computing. Neuromorphic hardware (e.g., analog VLSI neural circuits) could provide 100-1000x efficiency gains for neural emulation specifically, potentially advancing feasibility by a decade.

### 4.3 Real-Time vs. Slower-Than-Real-Time

For consciousness preservation, real-time emulation is not strictly necessary — ISMT's temporal persistence requirement (Proposition 3) requires that IC, SM, and GA be maintained over a non-zero interval tau_min, but this interval is defined in the emulated system's time, not wall-clock time. A slower-than-real-time emulation preserves consciousness from the perspective of the emulated system.

However, practical considerations (interaction with the physical world, subjective experience of time passage) favor real-time or faster-than-real-time emulation.

---

## 5. Interface to Downstream Cards

### 5.1 Requirements for 0.2.2.1.2 (Whole-Brain Scanning)

The scanning system must capture the following at the specified resolution:

| Feature | Required Resolution | Justification |
|---|---|---|
| **Neuron positions and morphology** | ~1 um spatial | Sufficient to resolve cell bodies, dendrites, and axonal arbors |
| **Synaptic connections** | ~100 nm spatial | Sufficient to resolve individual synapses and dendritic spines |
| **Synaptic weights** | Inferred from spine volume, receptor density | Proxy for synaptic strength |
| **Neuron type classification** | Per-neuron | Excitatory/inhibitory, neurotransmitter type, ion channel expression profile |
| **Dendritic spine morphology** | ~100 nm spatial | Spine shape correlates with synaptic strength and plasticity state |
| **Neuromodulatory receptor distribution** | Per-neuron or per-compartment | Required for neuromodulatory gain modeling |
| **Glial cell positions and contacts** | ~1 um spatial | Required for astrocyte-neuron coupling model |
| **Neuromodulatory baseline** | Per-region concentrations | Baseline concentrations of DA, 5-HT, ACh, NE per brain region |
| **Temporal snapshot** | Single timepoint | Synaptic state at scan time; dynamic properties inferred from structural features |
| **Output format** | Structured graph | Per-node and per-edge attribute vectors |

**Non-destructive scanning is strongly preferred** but not strictly required for the fidelity specification. Scan modality selection is the domain of 0.2.2.1.2.

### 5.2 Requirements for 0.2.2.1.3 (Neural Simulation)

| Parameter | Requirement | Notes |
|---|---|---|
| **Neuron model** | Multi-compartment, Hodgkin-Huxley-class | Minimum 5 compartments/neuron (soma + 2 dendrite + axon hillock + axon); ~1000 for detailed models |
| **Ion channel models** | Rate-based with stochastic noise terms | Stochastic Hodgkin-Huxley or Langevin approximation |
| **Synapse model** | Conductance-based with short-term plasticity (STP) | Tsodyks-Markram or equivalent |
| **Long-term plasticity** | Phenomenological STDP with neuromodulatory gating | Must capture LTP/LTD at appropriate timescales |
| **Neuromodulation** | Gain modulation per receptor subtype per neuron | Dopamine (D1/D2), serotonin (5-HT1A/2A), noradrenaline, acetylcholine |
| **Astrocyte model** | Calcium dynamics, gliotransmitter release | ~1 astrocyte per ~5 neurons |
| **Integration timestep** | <= 100 us | For numerical stability of HH equations |
| **State dimensions per neuron** | ~20-50 | Membrane potential per compartment, channel states, calcium, neuromodulator sensitivity |
| **Real-time factor** | ≥1.0 (real-time or faster) | Required for consciousness continuity |
| **Total state space** | ~10^12 to 10^13 floating-point variables (neuron state); total including synaptic state ~10^15 | See Threshold Registry: L2_memory = 10^15 bytes |
| **Total FLOPS** | 10^21 FLOPS | See Threshold Registry: L2_FLOPS (valid range: 10^20–10^22) |
| **Total memory** | 10^15 bytes (1 PB) | See Threshold Registry: L2_memory (valid range: 10^14–10^16) |
| **Total bandwidth** | 10^18 bytes/s (1 EB/s) | See Threshold Registry: L2_bandwidth (valid range: 10^17–10^19) |

### 5.3 Requirements for 0.2.2.1.4 (Emulation Validation)

| Validation Criterion | Metric | Threshold | ISMT Traceability |
|---|---|---|---|
| **Integration preservation** | PCI (Perturbational Complexity Index) of emulation vs. original | |Phi_emulated - Phi_biological| / Phi_biological < ε_phi = 0.10 (valid range: 0.05–0.20) | IC condition |
| **Self-model fidelity** | Mutual information I(m(t); x(t)) in emulation vs. original | |Q(M)_emulated - Q(M)_biological| / Q(M)_biological < ε_sm = 0.10 (valid range: 0.05–0.20) | SM condition |
| **Global accessibility** | Functional connectivity breadth (fraction of subsystems with significant causal coupling to self-model) | |G(M)_emulated - G(M)_biological| / G(M)_biological < ε_ga = 0.10 (valid range: 0.05–0.20) | GA condition |
| **Behavioral equivalence** | Cognitive task performance, response patterns | Within 2 standard deviations of original | Functional validation |
| **Causal transition fidelity** | KL divergence between transition probability distributions of emulation and original | < ε_transition = 0.05 nats per subsystem pair (valid range: 0.01–0.10 nats) | Core fidelity criterion |
| **Consciousness threshold** | Perturbational Complexity Index (PCI) of emulation | PCI_emulated ≥ PCI_threshold = 0.31 (valid range: 0.25–0.40; Casarotto et al. 2016) | Clinically validated consciousness threshold |
| **Composite consciousness** | c(S) = PCI_norm * Q(M) * G(M) | c(S) > 0 (graded consciousness predicate) | ISMT graded predicate |
| **Temporal stability** | IC, SM, GA maintained over continuous operation | Sustained for > 10^6 timesteps (100s of simulated time) without degradation | Proposition 3 (temporal persistence) |

---

*Specification version: 1.1 — 2026-03-21*
*Card: 0.2.2.1.1 Emulation Fidelity Requirements*
*Upstream theory: ISMT (docs/consciousness-theory/formal-theory.md)*
*Upstream data: NCC Catalogue (docs/consciousness-science/ncc-catalogue.md)*
