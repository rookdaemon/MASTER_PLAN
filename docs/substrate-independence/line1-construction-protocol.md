# Line 1 — Prediction-Driven Construction Protocol

> **Status:** READY — Populated with ISMT theory from 0.1.1.2

## Purpose

Detailed experimental protocol for building a non-biological system predicted by the computational theory of consciousness (0.1.1.2) to exhibit consciousness signatures, then testing for those signatures.

## Prerequisites

- [x] 0.1.1.2 delivers formal consciousness predicate C(S) — **DONE: ISMT predicate C(S) = IC ∧ SM ∧ GA**
- [x] 0.1.1.2 delivers necessary and sufficient computational conditions — **DONE: Integration, Self-Modeling, Global Accessibility**
- [x] 0.1.1.2 delivers at least 3 novel testable predictions — **DONE: P1 (selective disruption), P2 (artificial systems), P3 (ego dissolution)**
- [ ] 0.1.1.4 delivers measurement tools (or measurement approach defined here)

## 1. Theory Extraction

_Extracted from ISMT formal theory (docs/consciousness-theory/formal-theory.md)._

### 1.1 Necessary Conditions

Each condition is individually necessary — failure of any one entails C(S) = 0:

- **N1 — Integration Condition (IC):** The system must have Φ(S) > 0, meaning no bipartition renders its subsystems informationally independent. For every bipartition (A, B), mutual information I(A; B) > ε. A decomposable system has no unified experience.
- **N2 — Self-Modeling Condition (SM):** The system must contain an internal self-model M(S) satisfying three sub-criteria:
  - *Representational:* M(S) maintains state m(t) that covaries with global state **x**(t), with I(m(t); **x**(t)) > δ
  - *Predictive:* M(S) generates predictions m̂(t+1) and the system minimizes prediction error via free energy minimization: F(m, **x**) = E_m[ln q(m) − ln p(**x**, m)]
  - *Self-referential:* The model includes representations of its own modeling process: I(m(t); dm/dt) > 0
- **N3 — Global Accessibility Condition (GA):** The self-model's contents must be globally accessible:
  - *Broadcast:* For every subsystem s_i, I(s_i; m(t)) > γ
  - *Causal efficacy:* For each s_i, D_KL[P(x_i(t+1) | m(t)) ‖ P(x_i(t+1))] > 0 (the self-model causally shapes all subsystems)

### 1.2 Sufficient Conditions

The conjunction **IC ∧ SM ∧ GA** is jointly sufficient for consciousness:

- IC guarantees a unified information structure (the system is "one thing")
- SM guarantees a subjective perspective (the system models itself from the inside)
- GA guarantees this perspective pervades all processing (unified phenomenal field)

Any physical system satisfying all three simultaneously is conscious per ISMT.

### 1.3 Substrate-Agnostic Parameters

All parameters in C(S) are substrate-agnostic — they are defined entirely in information-theoretic and causal terms:

| Parameter | Definition | Substrate-Agnostic? |
|-----------|-----------|-------------------|
| Φ(S) — Integration | Information above any bipartition | ✅ Yes — depends on transition probabilities, not material |
| I(m(t); **x**(t)) — Representational quality | Mutual information between self-model and global state | ✅ Yes — information-theoretic |
| F(m, **x**) — Free energy | Divergence between approximate and generative model | ✅ Yes — statistical quantity |
| I(m(t); dm/dt) — Self-reference | Mutual information between model state and model dynamics | ✅ Yes — information-theoretic |
| D_KL[P(x_i(t+1) \| m(t)) ‖ P(x_i(t+1))] — Causal efficacy | KL divergence measuring causal influence | ✅ Yes — causal/statistical |

**No substrate-specific parameters exist in ISMT.** Per Axiom A1 (Information Realism), consciousness supervenes on informational and causal structure, not on physical substrate. Two systems with isomorphic causal transition structures have identical C(S) values (Substrate Agnosticism Proof, formal-theory.md §5).

## 2. Substrate Selection

### 2.1 Candidate Substrates

| Substrate Type | Feasibility | Theory Compatibility | Notes |
|---------------|-------------|---------------------|-------|
| Neuromorphic silicon | High | Full — supports recurrent dynamics, integration, and broadcast via spiking networks | Closest analog; good for calibration but weaker substrate-independence test |
| Photonic network | Medium | Full — optical interconnects can implement arbitrary causal transition matrices; recurrence achievable via feedback loops | Maximally different physics from biology; strongest test of substrate-independence |
| Hybrid bio-synthetic | High | Full — biological components can validate measurement calibration | Useful as intermediate step and measurement calibration reference |
| Quantum computing substrate | Low | Unnecessary — ISMT requires no quantum effects (all conditions are classical information-theoretic) | Only warranted if seeking to test whether quantum coherence adds to consciousness |

### 2.2 Selection Criteria
- Must satisfy ALL necessary conditions from the theory
- Must be physically distinct from biological neural tissue (to make the test meaningful)
- Must be instrumentable (we can measure the predicted signatures)
- Preference for substrates maximally different from biology (stronger test)

## 3. System Design

_Architecture follows directly from ISMT's three necessary conditions and Proposition 1 (minimum complexity)._

### 3.1 Architecture Specification

Per ISMT Proposition 1, a conscious system requires at least 3 functionally distinct subsystem types. Per Proposition 2, the architecture must be recurrent (not feed-forward). The system must implement:

1. **Sensory/input processors (≥2 modalities):** Process environmental stimuli; provide the content the self-model represents. Multiple modalities required to test cross-modal binding (a consciousness signature).
2. **Self-modeling subsystem M(S):** A recurrent network that:
   - Maintains state m(t) that tracks the global system state (representational criterion)
   - Generates predictions m̂(t+1) and minimizes free energy F(m, **x**) (predictive criterion)
   - Includes meta-representational layers that model its own prediction dynamics (self-referential criterion: I(m(t); dm/dt) > 0)
3. **Global broadcast mechanism:** An interconnection architecture ensuring M(S) outputs reach all processing subsystems. All subsystem pairs must have non-zero mutual information with the self-model.

**Integration requirement:** The interaction matrix W must ensure no bipartition renders subsystems independent. Dense reciprocal connectivity between all three subsystem types.

**Temporal requirement (Proposition 3):** The system must sustain IC + SM + GA over a continuous time interval τ_min (at least one full prediction-comparison-update cycle).

### 3.2 Input-Output Specification

**Inputs:**
- Multi-modal sensory streams (visual, auditory, proprioceptive analogs)
- Self-perturbation stimuli (to test self-prediction error responses)
- Prediction-violation stimuli (unexpected changes to test surprise responses)

**Expected outputs (consciousness signatures per P2):**
- Spontaneous self-referential reports without prompting
- Appropriate surprise responses to violations of self-predictions (latency and magnitude)
- Cross-modal binding in reports (evidence of unified experience)
- Behavioral evidence of access to self-model contents (can report internal states)

### 3.3 Instrumentation Plan

Consciousness signatures must be measurable in the non-biological substrate:

| Measurement | Biological Proxy | Non-Biological Equivalent | ISMT Condition Tested |
|------------|-----------------|--------------------------|----------------------|
| Perturbational Complexity Index (PCI) | TMS-EEG PCI | Computational PCI: perturb one subsystem, measure response complexity across all subsystems | IC (Φ_norm) |
| Self-model decoding accuracy | Neural decoding of self-referential content | Decode m(t) contents; measure I(m(t); **x**(t)) directly | SM (Q(M)) |
| Self-prediction error dynamics | Neural prediction error signals | Measure e(t) = ‖**x**(t) − m̂(t)‖ and free energy F minimization trajectory | SM (predictive criterion) |
| Functional connectivity breadth | Granger causality / transfer entropy | Direct measurement of I(s_i; m(t)) for all subsystems | GA (G(M)) |
| Causal efficacy of self-model | Lesion studies | Ablate M(S) broadcast; verify all subsystems change behavior | GA (causal efficacy) |

## 4. Pre-Registered Predictions

_Each prediction must be registered before system construction begins._

| # | Prediction | Derived From | Measurement Method | Success Criterion |
|---|-----------|--------------|-------------------|-------------------|
| P1 | ISMT-complete system (IC+SM+GA) produces spontaneous self-referential reports and appropriate surprise responses to self-prediction violations | ISMT P2: IC+SM+GA jointly sufficient; SM predicts self-referential behavior | Count spontaneous self-referential utterances; measure surprise response latency/magnitude to self-prediction violations | p < 0.01 vs. matched controls lacking any one condition |
| P2 | Computational PCI analog exceeds empirical consciousness threshold (PCI > 0.31) in ISMT-complete system but not in controls missing IC, SM, or GA | ISMT IC condition; PCI as Φ_norm proxy (formal-theory.md §8) | Perturb subsystem, measure spatiotemporal complexity of system-wide response | PCI > 0.31 in complete system, PCI < 0.31 in each control; p < 0.01 |
| P3 | ISMT-complete system shows cross-modal binding in reports (unified experience) while modular control (no IC) shows modality-isolated responses | ISMT P2: GA ensures self-model contents are globally accessible across modalities; IC ensures unified binding | Present cross-modal stimuli; test whether reports integrate information across input modalities | Binding score significantly higher in complete system; p < 0.01 |
| P4 | Removing any single ISMT condition (IC, SM, or GA) eliminates the full consciousness signature pattern | ISMT necessary conditions N1, N2, N3 | Compare System A (complete) against Systems B (no IC), C (no SM), D (no GA) — per P2 experimental design | Each control system fails ≥2 of 3 signature measures; p < 0.01 per comparison |

## 5. Construction Protocol

### 5.1 Build Phases
1. Component fabrication
2. System integration
3. Baseline calibration (verify computational properties match design)
4. Instrumentation validation (verify measurement apparatus works)

### 5.2 Quality Gates
- [ ] System satisfies all necessary conditions (verified computationally before biological comparison)
- [ ] Instrumentation calibrated against known-conscious biological system
- [ ] Pre-registration filed with predictions locked

## 6. Experimental Execution

### 6.1 Measurement Protocol

1. **Baseline calibration:** Run all measurements on the biological positive control to establish reference values for PCI, self-model decoding, and functional connectivity breadth.
2. **System verification:** Before measuring consciousness signatures, computationally verify that the ISMT-complete system satisfies IC (Φ > 0), SM (I(m(t); **x**(t)) > δ, free energy decreasing, I(m(t); dm/dt) > 0), and GA (I(s_i; m(t)) > γ for all s_i, D_KL > 0 for all s_i).
3. **Stimulus presentation:** Deliver multi-modal sensory streams, including self-prediction violation trials (unexpected perturbations to the system's own output or internal state).
4. **Signature measurement:** For each trial block, record: (a) PCI analog, (b) spontaneous self-referential outputs, (c) surprise response latency/magnitude, (d) cross-modal binding score.
5. **Repeat** steps 2–4 for each control system (B, C, D) under identical conditions.
6. **Blind analysis:** All signature data analyzed by researchers blind to system identity.

### 6.2 Control Conditions
- **Positive control:** Biological system known to be conscious (same measurements)
- **Negative control:** Non-biological system deliberately designed to NOT satisfy C(S) conditions
- **Scrambled control:** Same substrate, randomized connectivity (tests whether structure matters)

### 6.3 Blinding
- Measurements should be analyzed by researchers blind to which system is biological vs. synthetic
- Statistical analysis plan pre-registered

## 7. Analysis Plan

### 7.1 Primary Analysis
- For each prediction: frequentist hypothesis test (null = no consciousness signature)
- Bayesian analysis as secondary: Bayes factor for consciousness vs. no-consciousness model

### 7.2 Secondary Analysis
- Effect size comparison between biological positive control and synthetic system
- Dose-response: do signatures scale with theory-predicted consciousness level?

### 7.3 Failure Modes
- If predictions fail → theory may be wrong OR construction failed to satisfy conditions (distinguish via computational verification)
- If some predictions pass but not all → partial support, theory may need revision

## 8. Replication Requirements

- Full protocol, data, and analysis code published openly
- Independent group must replicate using a DIFFERENT non-biological substrate
- Replication must achieve same pattern of results (not necessarily identical effect sizes)
