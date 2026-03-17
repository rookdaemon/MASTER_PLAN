# Emulation Fidelity Requirements — Architecture

## 1. Purpose

This document defines the architecture for the emulation fidelity specification (`docs/emulation-fidelity/emulation-fidelity-spec.md`), the primary deliverable of card 0.2.2.1.1. The specification determines the minimum resolution at which a biological brain must be emulated to preserve subjective experience, as defined by the ISMT theory from F1 (card 0.1.1.2).

## 2. Upstream Dependency: ISMT Consciousness Predicate

The Integrated Self-Modeling Theory (from `docs/consciousness-theory/formal-theory.md`) defines consciousness via three jointly-sufficient, individually-necessary conditions:

| Condition | ISMT Symbol | What It Requires |
|---|---|---|
| **Integration** (IC) | Phi(S) > 0 | The system's information structure is non-decomposable — no bipartition renders subsystems independent |
| **Self-Modeling** (SM) | M(S) exists | The system maintains a predictive model of its own states, minimizing self-prediction error via free-energy minimization |
| **Global Accessibility** (GA) | G(S) satisfied | Self-model contents are broadcast to and causally influence all processing subsystems |

**Key ISMT property:** Consciousness is defined over **causal transition structure** — the transition probability matrix T and interaction matrix W — not over physical substrate (Axiom A1, Substrate Agnosticism Proof, Section 5 of formal-theory.md).

**Emulation fidelity implication:** An emulation preserves consciousness if and only if it reproduces the causal transition structure at the grain at which IC, SM, and GA operate. The question becomes: *at what physical grain is the brain's causal transition structure determined?*

## 3. Analytical Framework

The spec must evaluate each fidelity level against a single criterion:

> **Does emulating at this level preserve the causal transition probabilities P(x_i(t+1) | x_j(t)) for all subsystem pairs (s_i, s_j) that participate in IC, SM, or GA?**

### 3.1 Fidelity Levels Under Evaluation

| Level | What Is Modeled | Granularity |
|---|---|---|
| **L1: Connectome** | Neuron types, synaptic weights, network topology | ~10^11 nodes, ~10^14 edges |
| **L2: Cellular** | Individual neuron dynamics (Hodgkin-Huxley or similar), dendritic computation, glial interactions, neuromodulation | ~10^11 neurons with internal state |
| **L3: Molecular** | Protein conformations, neurotransmitter dynamics, ion channel stochastic gating, second messenger cascades | ~10^14 molecular-scale state variables |
| **L4: Quantum** | Quantum coherence in microtubules, entanglement effects, quantum error correction in warm biological tissue | Quantum state vectors over molecular substrates |

### 3.2 Evaluation Criteria Per Level

For each level, the spec must determine:

1. **Causal transition fidelity:** Does this level capture the transition probabilities that determine IC, SM, and GA? Are there known biological phenomena at finer grain that demonstrably alter neural-level causal transitions?

2. **Information loss analysis:** What information about the system's dynamics is lost by emulating at this level but not finer? Does that lost information affect Phi, Q(M), or G(M)?

3. **Sufficiency argument or counterexample:** Either a formal argument that this level suffices (causal closure at this grain) or a specific biological mechanism that requires finer grain and demonstrably affects consciousness-relevant processing.

4. **Computational cost estimate:** FLOPS, memory, and bandwidth requirements for a human-scale brain (~86 billion neurons, ~150 trillion synapses).

### 3.3 Decision Procedure

The spec selects the **coarsest level L_min** such that:
- All causal transitions relevant to IC, SM, and GA are captured at L_min
- No known biological mechanism at finer grain alters consciousness-relevant state transitions
- The argument for L_min is traceable to ISMT conditions

If evidence is ambiguous at a boundary, the spec must state the uncertainty and recommend a conservative (finer-grained) default with a research path to resolve the ambiguity.

## 4. Specification Document Structure

The deliverable `docs/emulation-fidelity/emulation-fidelity-spec.md` will have these sections:

### Section 1: ISMT Summary
- Recapitulate the three ISMT conditions (IC, SM, GA) and the causal transition structure requirement
- State the fidelity selection criterion

### Section 2: Level-by-Level Analysis
For each of L1 through L4:
- Description of what the level captures
- Analysis of causal transition fidelity w.r.t. ISMT conditions
- Known biological mechanisms requiring finer grain
- Sufficiency verdict with justification
- Computational cost estimates (FLOPS, memory, bandwidth)

### Section 3: Minimum Fidelity Determination
- The selected L_min with formal justification traceable to ISMT
- Arguments for why each coarser level is insufficient
- Uncertainty assessment and conservative bounds

### Section 4: Computational Requirements Summary
- Table of FLOPS, memory, bandwidth for each level at human scale
- Comparison against current and projected computing capabilities
- Implications for real-time vs. slower-than-real-time emulation

### Section 5: Interface to Downstream Cards
- Requirements statement consumable by:
  - **0.2.2.1.2 (Scanning):** Minimum spatial and temporal resolution for brain scanning
  - **0.2.2.1.3 (Simulation):** Computational model complexity, real-time constraints, state space size
  - **0.2.2.1.4 (Validation):** What fidelity metrics must be verified, tolerance thresholds

## 5. Key Technical Arguments (Preview)

Based on current neuroscience and the ISMT framework, the analysis will address:

### 5.1 Why L1 (Connectome) Is Likely Insufficient
- Static connectivity ignores temporal dynamics essential for SM (prediction error minimization is a dynamic process)
- Synaptic weights alone don't capture neuromodulatory state, which alters causal transitions globally
- IC requires mutual information between subsystems, which depends on dynamics, not just topology

### 5.2 Why L2 (Cellular) Is the Leading Candidate for L_min
- Neuron-level dynamics (firing rates, spike timing, dendritic integration) capture the causal transitions that implement thalamocortical loops (IC), predictive processing (SM), and global broadcast (GA)
- Neuromodulation can be modeled at cellular level as gain modulation on neural transfer functions
- Glial interactions (astrocyte calcium waves, metabolic coupling) may need inclusion for accurate neuromodulatory state
- The NCC catalogue maps consciousness correlates to neural-circuit-level phenomena, not molecular or quantum phenomena

### 5.3 Why L3 (Molecular) May Be Required in Specific Cases
- Stochastic ion channel gating introduces noise that may be functionally significant for certain computation types
- Second messenger cascades (e.g., cAMP, calcium-dependent plasticity) operate on timescales that affect learning and adaptation — potentially relevant if the emulation must preserve the capacity for consciousness to *develop*, not just instantaneous consciousness
- Possible resolution: L2 with stochastic noise models rather than full L3

### 5.4 Why L4 (Quantum) Is Almost Certainly Unnecessary
- ISMT defines consciousness over classical information-theoretic quantities (Shannon entropy, mutual information, KL divergence) — no quantum information terms appear in the formalism
- Decoherence timescales in warm biological tissue (~10^-13 s) are far shorter than neural processing timescales (~10^-3 s)
- No established NCC requires quantum coherence for explanation
- Penrose-Hameroff orchestrated objective reduction remains speculative and unfalsified

## 6. Downstream Consumers

| Consumer Card | What They Need From This Spec |
|---|---|
| 0.2.2.1.2 Whole-Brain Scanning | Spatial resolution (nm or um), temporal resolution (ms or us), which cellular/molecular features must be captured |
| 0.2.2.1.3 Neural Simulation | Neuron model complexity (e.g. Hodgkin-Huxley vs. integrate-and-fire), state space dimensionality, real-time factor, memory footprint |
| 0.2.2.1.4 Emulation Validation | Fidelity metrics (which causal transitions must match), tolerance thresholds, consciousness verification criteria |

## 7. Acceptance Criteria Traceability

| Acceptance Criterion | Spec Section |
|---|---|
| F1 theory reviewed; each fidelity level evaluated against ISMT | Sections 1-2 |
| Minimum resolution formally specified with F1-traceable justification | Section 3 |
| Formal argument for each lower-fidelity level's insufficiency | Section 3 |
| Computational requirements estimated for each level | Section 4 |
| Output consumable by sibling cards | Section 5 |
