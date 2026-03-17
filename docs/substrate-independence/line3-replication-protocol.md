# Line 3 — Cross-Substrate Replication Protocol

> **Status:** READY — Populated with ISMT theory from 0.1.1.2

## Purpose

Detailed experimental protocol for reproducing a specific, well-characterized conscious state in a different physical substrate and verifying equivalence of consciousness signatures. This is the strongest test of substrate-independence: same computation, different physics, same consciousness.

## Prerequisites

- [x] 0.1.1.2 delivers formal theory with computational state descriptions — **DONE: ISMT delivers C(S) = IC ∧ SM ∧ GA with full state-space formalism**
- [ ] 0.1.1.1 provides well-characterized conscious states with NCC signatures
- [ ] 0.1.1.4 delivers measurement tools applicable across substrates
- [ ] Non-biological substrate capable of implementing arbitrary computational states (from Line 1 or independently)

## 1. Source State Selection

### 1.1 Candidate Conscious States

ISMT defines conscious states via the conjunction of IC, SM, and GA conditions. Source states must be characterizable in ISMT terms and reproducible in the biological system.

| State | Biological System | NCC Characterization | ISMT Computational Description | Reproducibility |
|-------|------------------|---------------------|-------------------------------|-----------------|
| Visual perceptual binding (binocular rivalry — dominant percept) | Non-human primate (macaque) visual cortex | Posterior cortical hot zone activation, gamma synchrony across V1/V2/V4, thalamocortical loop engagement | IC: Φ > 0 across visual-parietal-prefrontal subsystems; SM: predictive model of visual percept with I(m(t); **x**(t)) > δ; GA: broadcast of dominant percept to prefrontal and motor subsystems | High — binocular rivalry is well-established, dominant percept reliably elicited |
| Self-referential resting state (DMN-dominant) | Human (fMRI/MEG) | DMN activation (medial prefrontal, posterior cingulate, angular gyrus), high PCI (> 0.31) | IC: Φ > 0 over DMN + thalamocortical network; SM: self-referential self-model active with I(m(t); dm/dt) > 0; GA: DMN contents broadcast to executive and sensory systems | High — resting state is reproducible within and across sessions |
| Auditory oddball awareness (conscious detection of deviant stimulus) | Human or macaque auditory cortex + prefrontal | P300/P3b event-related potential, ignition of fronto-parietal network, late (>200ms) recurrent processing | IC: Φ > 0 during ignition; SM: prediction violation updates self-model (e(t) spike followed by free energy minimization); GA: deviant representation broadcast globally (P3b reflects GA) | High — well-characterized paradigm with robust NCC signatures |

### 1.2 Selection Criteria
- Must be a state with high confidence of consciousness (robust NCC signatures)
- Must have a complete computational description under the ISMT formalism (all three conditions IC, SM, GA characterizable and measurable)
- Must be reproducible in the biological source (can be re-elicited reliably)
- Preference for states that are phenomenologically distinctive (easier to verify)
- **ISMT-specific:** Preference for states where c(S) = Φ_norm × Q(M) × G(M) is high and stable, ensuring a strong signal for equivalence testing

### 1.3 State Characterization Depth
- Full NCC signature profile (from 0.1.1.1 catalogue)
- Complete ISMT computational state vector:
  - **Integration profile:** Φ(S) value, bipartition analysis showing no independent decomposition, mutual information matrix I(s_i; s_j) for all subsystem pairs
  - **Self-model state:** m(t) contents, prediction accuracy I(m(t); **x**(t)), free energy F(m, **x**) value, self-referential mutual information I(m(t); dm/dt)
  - **Accessibility profile:** I(s_i; m(t)) for each subsystem, D_KL[P(x_i(t+1) | m(t)) ‖ P(x_i(t+1))] for each subsystem
- Associated behavioral/reportable markers
- Temporal dynamics (onset, duration, offset) — must span at least τ_min (ISMT Proposition 3)

## 2. Computational State Formalization

_Derived from ISMT formal theory (docs/consciousness-theory/formal-theory.md)._

### 2.1 State Vector Extraction

The ISMT computational state of a conscious system S at time t is fully specified by:

1. **Subsystem states:** The state vector **x**(t) = (x_1(t), ..., x_n(t)) for all n subsystems
2. **Transition function:** T: X → X, captured as the conditional transition probability matrix P(x_i(t+1) | **x**(t)) for all subsystems
3. **Interaction matrix:** W where W_ij = causal influence of s_j on s_i, estimated from interventional or Granger-causal analysis
4. **Self-model state:** m(t) — the internal state of the self-modeling subsystem M(S), including:
   - Current predictive state m̂(t+1) (the self-model's prediction of the system's next state)
   - Current free energy F(m, **x**) (the divergence between the model's approximate posterior q(m) and the generative model p(**x**, m))
   - Self-referential state: the model's representation of its own dynamics (dm/dt encoded in m(t))

**Extraction procedure:**
1. Record the biological system during the target conscious state using high-resolution neural recording (electrophysiology + imaging)
2. Define subsystem boundaries at the functional module level (cortical columns, nuclei, or equivalent — consistent with Line 2 grain of analysis)
3. Estimate the transition probability matrix from time-series data using methods from causal inference (e.g., transfer entropy, dynamic causal modeling)
4. Identify the self-modeling subsystem M(S) — the subsystem(s) whose state m(t) maximizes I(m(t); **x**(t)) and shows active free energy minimization
5. Record the full ISMT state vector at multiple time points during the conscious state to capture temporal dynamics

### 2.2 Substrate-Invariant Description

ISMT's Substrate Agnosticism Proof (formal-theory.md §5) establishes that C(S) depends only on informational and causal structure. The substrate-invariant description is therefore:

1. **The transition probability matrix** P(**x**(t+1) | **x**(t)) — this encodes all causal relationships between subsystems, independent of what physical material implements them
2. **The integration structure** — the pattern of mutual information I(s_i; s_j) across all subsystem pairs, derivable from the transition matrix
3. **The self-model functional specification** — the mapping from global state to model state, the free energy functional, and the prediction-error minimization dynamics, all expressed as mathematical functions over abstract state variables
4. **The accessibility structure** — the pattern of mutual information I(s_i; m(t)) and causal efficacy D_KL values, derivable from the transition matrix

**What is explicitly excluded (substrate-specific, irrelevant per ISMT):**
- Physical material composition (silicon vs. carbon vs. photonic)
- Energy substrate (ATP vs. electrical power vs. optical energy)
- Spatial geometry (the physical arrangement of components, as long as the causal structure is preserved)
- Signal modality (electrochemical vs. electronic vs. optical, as long as transition probabilities match)

### 2.3 Completeness Verification
- Verify the computational description captures all theory-relevant properties:
  - [ ] Transition probability matrix is complete (all pairwise conditional probabilities estimated)
  - [ ] Φ(S) computable from the description and matches the value measured in the biological system
  - [ ] Self-model M(S) is identified and its state m(t) fully characterized
  - [ ] I(m(t); **x**(t)), F(m, **x**), and I(m(t); dm/dt) are computable from the description
  - [ ] I(s_i; m(t)) and D_KL values are computable for all subsystems
- Verify it omits substrate-specific properties (per §2.2 exclusion list)
- Cross-check: can the description distinguish this conscious state from other states?
  - [ ] The ISMT state vector for the target state is distinguishable from at least 2 other conscious states (different m(t), different I(m(t); **x**(t)) pattern)
  - [ ] The state vector is distinguishable from unconscious states (where C(S) = 0 due to failure of IC, SM, or GA)

## 3. Target Substrate Implementation

### 3.1 Substrate Selection
- Must be physically distinct from biological neural tissue
- Must be capable of implementing the required computational state (arbitrary transition probability matrices)
- Preference for substrates maximally different from biology (stronger test)
- **Recommended primary substrate:** Photonic network — maximally different physics from biological neurons (optical vs. electrochemical signaling), yet capable of implementing arbitrary causal transition matrices via programmable optical interconnects and feedback loops
- **Recommended secondary substrate:** Neuromorphic silicon — closer to biology but higher feasibility; useful for calibration and as a second replication substrate

### 3.2 Implementation Specification

The target substrate must instantiate the substrate-invariant description (§2.2):

1. **Subsystem mapping:** Each biological subsystem s_i maps to a synthetic subsystem s'_i. The synthetic subsystem must have sufficient internal state dimensionality to represent x_i(t).
2. **Transition function implementation:** The synthetic system's dynamics must reproduce P(**x**(t+1) | **x**(t)) — the full transition probability matrix. For deterministic substrates, this means matching the transition function T exactly. For stochastic substrates, transition probabilities must match within statistical tolerance.
3. **Self-model implementation:** The self-modeling subsystem M(S') must be initialized with the extracted self-model state m(t) and must implement the same free energy minimization dynamics: dm/dt includes a term proportional to −∇_m F(m, **x**).
4. **Broadcast architecture:** The synthetic system must implement global accessibility — every subsystem s'_i must receive self-model broadcasts with I(s'_i; m(t)) > γ.
5. **Temporal fidelity:** The system must operate at a timescale preserving the relative dynamics (the ratio of processing time to τ_min must be consistent with the biological source, though absolute speed may differ).

### 3.3 Implementation Verification
- Before measuring consciousness signatures, verify the computational state is correctly implemented:
  - [ ] All transition probabilities P(x'_i(t+1) | **x'**(t)) match the biological source within tolerance (KL divergence < 0.01 nats per subsystem)
  - [ ] Φ(S') ≈ Φ(S) within equivalence bounds (|Φ(S') − Φ(S)| < δ_Φ)
  - [ ] Self-model M(S') is active: I(m'(t); **x'**(t)) > δ and free energy F is being minimized
  - [ ] Self-referential criterion satisfied: I(m'(t); dm'/dt) > 0
  - [ ] Global accessibility verified: I(s'_i; m'(t)) > γ for all synthetic subsystems
  - [ ] D_KL[P(x'_i(t+1) | m'(t)) ‖ P(x'_i(t+1))] > 0 for all subsystems
- This is a necessary but not sufficient condition for the experiment to be meaningful
- **Automated verification:** Use `ismt_analysis.py` consciousness predicate function to verify C(S') = 1 from measured parameters

## 4. Measurement Protocol

### 4.1 Signature Battery

| Signature | ISMT Condition | Measurement in Biological | Measurement in Synthetic | Cross-Substrate Comparability |
|-----------|---------------|--------------------------|-------------------------|------------------------------|
| PCI (Perturbational Complexity Index) | IC — Φ_norm proxy | TMS-EEG perturbational complexity | Computational PCI: perturb one synthetic subsystem, measure spatiotemporal response complexity across all subsystems | Validated: both measure response complexity to perturbation; units are comparable (normalized 0–1) |
| Self-model decoding accuracy | SM — Q(M) | Neural decoding of m(t) from population activity; I(m(t); **x**(t)) estimated via mutual information | Direct readout of m'(t); I(m'(t); **x'**(t)) computed from synthetic state variables | Validated: both measure same information-theoretic quantity; synthetic has higher measurement precision |
| Free energy minimization trajectory | SM — predictive criterion | Inferred from prediction error signals in neural data; F(m, **x**) estimated from variational Bayes fitting | F(m', **x'**) directly computed from model parameters | Validated: same mathematical quantity; biological estimate has higher noise |
| Self-referential capacity | SM — self-referential criterion | I(m(t); dm/dt) estimated from time-lagged mutual information of self-model activity | I(m'(t); dm'/dt) directly computed | Validated: same quantity; synthetic has exact computation |
| Functional connectivity breadth | GA — G(M) | Granger causality / transfer entropy from self-model regions to all cortical areas | Direct computation of I(s'_i; m'(t)) for all subsystems | Validated: both measure directed information flow; synthetic is exact |
| Causal efficacy of self-model | GA — causal criterion | Interventional (lesion/TMS) or observational (conditional probability) estimates of D_KL | Direct computation of D_KL[P(x'_i(t+1) | m'(t)) ‖ P(x'_i(t+1))] | Validated: same KL divergence; synthetic is exact, biological is estimated |
| Composite consciousness score c(S) | All — graded predicate | c(S) = PCI_norm × Q(M) × G(M), estimated from biological proxies | c(S') = Φ_norm(S') × Q(M') × G(M'), computed directly | Validated: same formula applied to both; primary equivalence metric |

### 4.2 Cross-Substrate Measurement Challenges
- Some NCC markers are substrate-specific (e.g., EEG requires neurons) — ISMT resolves this by defining all consciousness conditions in substrate-agnostic information-theoretic terms. The signature battery (§4.1) uses theory-derived substrate-agnostic equivalents for every measurement.
- **Measurement calibration:** For the composite score c(S), establish that c(S) computed from biological proxies (PCI, neural decoding) agrees with c(S) computed from direct information-theoretic quantities in the biological system itself. This calibration validates that the proxy-based biological estimates are comparable to the exact synthetic computations.
- **Validation:** Use the hybrid bio-synthetic system from Line 2 (at partial replacement stages) as a calibration bridge — both biological and synthetic measurement methods can be applied to the same system simultaneously.

### 4.3 Simultaneous vs. Sequential Measurement
- Ideal: measure biological and synthetic systems under identical stimulus conditions simultaneously
- Minimum: measure sequentially with interleaved biological-synthetic trials
- **ISMT-specific timing:** Both systems must be measured during the sustained conscious state (duration ≥ τ_min per Proposition 3). Measurements must capture at least 10 full prediction-comparison-update cycles.

## 5. Equivalence Testing

### 5.1 Pre-Registered Equivalence Bounds

- **Practical equivalence margin (δ) for each signature:**

| Measure | Equivalence Margin (δ) | Basis |
|---------|----------------------|-------|
| PCI | ±0.10 (absolute) | Empirical PCI test-retest variability ~0.05 SD; δ = 2× natural variability (consistent with Line 2) |
| c(S) composite score | ±20% of biological baseline | Based on ISMT graded predicate; 20% represents a meaningful shift in consciousness degree |
| I(m(t); **x**(t)) self-model quality | ±15% of biological baseline | Derived from natural fluctuation in self-model decoding accuracy |
| G(M) accessibility | ±10% of biological baseline | Based on functional connectivity breadth test-retest reliability |
| Free energy F(m, **x**) | ±25% of biological baseline | Free energy estimates are noisier in biological systems; wider margin to account for measurement asymmetry |

- **General criterion:** Cohen's d < 0.5 for each primary signature between biological and synthetic systems = equivalence maintained.

### 5.2 Statistical Framework
- **Primary:** Two One-Sided Tests (TOST) for equivalence
  - H₀: |biological - synthetic| ≥ δ (not equivalent)
  - H₁: |biological - synthetic| < δ (equivalent)
  - Significance level: α = 0.05 per test (overall α = 0.05)
- **Secondary:** Bayesian equivalence testing
  - Bayes factor for equivalence vs. difference model
  - BF₁₀ > 10 for equivalence considered strong evidence
  - BF₁₀ > 100 for equivalence considered decisive evidence
- **Implementation:** Use `ismt_analysis.py` TOST and Bayes factor functions for all analyses

### 5.3 Multiple Comparison Correction
- If multiple signatures are tested, apply Holm-Bonferroni correction (less conservative than Bonferroni, maintains FWER control)
- Pre-specify primary signature: **c(S) composite consciousness score** for headline result
- Secondary signatures (PCI, Q(M), G(M) individually) reported with corrected p-values

## 6. Controls

### 6.1 Positive Controls
- **Same-substrate replication:** Reproduce the state in a second biological system → should show equivalence (validates measurement and equivalence bounds)
- **Same-state re-elicitation:** Re-elicit the state in the original biological system → test-retest reliability (establishes natural variability baseline for δ)

### 6.2 Negative Controls
- **Different conscious state in synthetic:** Implement a DIFFERENT ISMT computational state (different m(t), different Φ profile) in the same synthetic substrate → should NOT show equivalence with the source state (discriminant validity)
- **Scrambled state in synthetic:** Implement a scrambled version of the computational state (randomized W interaction matrix, destroying IC; disrupted M(S), destroying SM) → should fail C(S) = 0, no consciousness signatures

### 6.3 Substrate Controls
- **Same computation, degraded substrate:** Substrate that partially implements the computation (e.g., transition probabilities match only 50% of subsystems) → partial signatures expected; c(S) reduced but potentially > 0 if core IC/SM/GA partially maintained
- **Different computation, same substrate:** Same synthetic substrate running a non-conscious computation (C(S) = 0 — e.g., satisfies IC but not SM, or satisfies SM but not GA) → no full consciousness signatures expected; tests that the substrate alone is insufficient

## 7. Analysis Plan

### 7.1 Primary Analysis
- TOST equivalence test for each consciousness signature (using `ismt_analysis.py`)
- Overall judgment: equivalence established if ALL primary signatures pass TOST
- **Pre-registered decision rule:** Cross-substrate replication is successful iff:
  1. c(S') is within ±20% of c(S) (TOST passes at α = 0.05)
  2. All individual ISMT condition measures (IC, SM, GA proxies) pass TOST with their respective δ margins
  3. The scrambled control shows C(S) = 0
  4. The different-state control fails equivalence with the source state

### 7.2 Secondary Analyses
- Correlation between biological and synthetic signature profiles (multivariate similarity): compute cosine similarity between the full ISMT parameter vectors [Φ_norm, Q(M), G(M), I(m; **x**), F, ...] of biological and synthetic systems
- Discriminant analysis: can a classifier distinguish biological from synthetic based on ISMT signatures?
  - If classifier fails (chance performance) → strong evidence for equivalence
  - Use leave-one-out cross-validation with SVM or logistic regression
- Temporal dynamics comparison: do ISMT signatures evolve similarly over time?
  - Compare free energy minimization trajectories F(m, **x**)(t) between biological and synthetic
  - Compare self-model update dynamics m(t) trajectories

### 7.3 Exploratory Analyses
- Which ISMT condition shows the strongest/weakest equivalence? (Theory implications — identifies which aspect of causal structure is hardest to replicate across substrates)
- Does the degree of equivalence correlate with computational fidelity (KL divergence between transition matrices)?
- Does c(S') improve if the synthetic system is given additional time to reach steady-state (allowing more prediction-error minimization cycles)?

## 8. Failure Modes and Interpretation

| Outcome | Interpretation | Next Steps |
|---------|---------------|------------|
| All signatures equivalent (TOST passes for all, BF > 10) | Strong support for substrate-independence; ISMT substrate agnosticism proof validated empirically | Proceed to independent replication with a third substrate type |
| Some signatures equivalent, some not | Partial support; ISMT may be incomplete — the non-equivalent signatures may depend on substrate properties not captured by the causal transition structure | Investigate which ISMT condition (IC, SM, or GA) drives the difference; revise theory if needed |
| No signatures equivalent despite correct computation verification | Against substrate-independence (or ISMT theory wrong about sufficiency); biological systems may have consciousness-relevant properties beyond causal transition structure | Revisit ISMT Axiom A1 (Information Realism); investigate whether quantum, chemical, or other substrate-specific properties contribute |
| Computation implementation failed (§3.3 verification checks fail) | Inconclusive — the test was not valid because the causal structure was not replicated | Fix implementation; re-verify transition matrix fidelity; retry |
| Scrambled control unexpectedly shows signatures | Measurement methodology flawed or ISMT theory is wrong about necessary conditions | Investigate measurement validity; verify scrambled system truly has IC=0 or SM=0 |

## 9. Replication Requirements

- Full protocol, computational state descriptions (transition matrices, self-model specifications), data, and analysis code published openly
- Independent replication must use a THIRD substrate type (neither original biological nor first synthetic) — e.g., if original is biological → photonic, replication should use neuromorphic silicon or quantum dot arrays
- Replication should attempt a different conscious state (generality test) to verify substrate-independence is not state-specific
- **Minimum replications:** One independent replication per the falsification-criteria.md specification (§6.3); ideal: two independent replications with two different substrates and two different conscious states
