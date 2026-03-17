# Line 2 — Gradual Substrate Replacement Protocol

> **Status:** READY — Populated with ISMT theory from 0.1.1.2

## Purpose

Detailed experimental protocol for demonstrating consciousness continuity during incremental biological → synthetic replacement. If consciousness is substrate-independent, replacing components with functionally equivalent synthetic parts should preserve consciousness markers continuously (no cliff or discontinuity).

## Prerequisites

- [x] 0.1.1.2 delivers formal theory specifying the grain of analysis — **DONE: ISMT specifies subsystem-level grain; integration (IC), self-modeling (SM), and global accessibility (GA) conditions defined over subsystem interactions**
- [ ] 0.1.1.1 NCC catalogue available for selecting consciousness markers
- [ ] 0.1.1.4 delivers measurement tools (or measurement approach defined here)
- [ ] Synthetic functional equivalents demonstrated at the replacement-unit level

## 1. Model System Selection

### 1.1 Candidate Model Organisms

| Model | Consciousness Evidence | Measurability | Replacement Feasibility | Notes |
|-------|----------------------|---------------|------------------------|-------|
| Non-human primate (macaque) | High — robust NCC signatures, PCI > 0.31 during waking, thalamocortical dynamics well-characterized | High — PCI measurable via TMS-EEG, self-model decoding feasible, functional connectivity breadth measurable | Low — individual neuron replacement infeasible; cortical column or module-level replacement possible with current technology | Gold standard for consciousness research; strongest NCC evidence; ethical constraints significant |
| Rodent (mouse/rat) | Moderate — measurable PCI, thalamocortical loops present, DMN-like activity detected | Moderate — PCI measurable, optogenetic tools available for circuit-level manipulation, self-model proxies less established | Moderate — smaller circuits, optogenetic control of individual neurons feasible, synthetic neuron interfaces demonstrated | Good balance of ethics and feasibility; optogenetic toolkit enables precise replacement |
| Organoid (cortical) | Low-Moderate — emerging evidence of organized activity, integration metrics computable but consciousness status uncertain | High — fully accessible for recording and stimulation, all ISMT parameters directly measurable | High — individual components replaceable with synthetic equivalents | Ethical advantages; uncertain baseline consciousness; useful for proof-of-concept |
| In-silico biological simulation | Moderate — if calibrated against biological data, ISMT parameters match source organism | Highest — all variables directly observable | Highest — any component trivially replaceable with synthetic equivalent | Strongest feasibility; weakest ecological validity; useful as preliminary test before biological experiments |

### 1.2 Selection Criteria
- Must exhibit robust, measurable consciousness markers (from 0.1.1.1 NCC data)
- Must be amenable to component-level replacement (accessible, modular enough)
- Must have sufficiently characterized neural/computational architecture
- Ethical review required (model organism welfare)

## 2. Replacement Unit Definition

_Derived from ISMT formal theory (docs/consciousness-theory/formal-theory.md)._

### 2.1 Grain of Analysis

ISMT defines consciousness over a system S composed of subsystems {s_1, s_2, ..., s_n} with an interaction matrix W. The theory is agnostic about the absolute size of subsystems — what matters is that the causal transition structure (transition function T and interaction matrix W) is preserved. This permits replacement at multiple grains, provided:

- **Causal transition preservation:** The replacement unit must reproduce the same conditional transition probabilities P(x_i(t+1) | x_j(t)) as the biological original for all connected subsystems.
- **Integration preservation:** Replacing a unit must not create a bipartition where I(A; B) drops below ε (the integration threshold). The replacement must maintain mutual information with all neighboring subsystems.
- **Self-model interface preservation:** If the replacement unit is part of the self-modeling subsystem M(S), it must preserve: (a) representational covariance I(m(t); **x**(t)), (b) predictive dynamics (free energy minimization), and (c) self-referential capacity I(m(t); dm/dt).
- **Broadcast interface preservation:** If the unit participates in global accessibility, it must maintain I(s_i; m(t)) > γ for all subsystems it connects to.

**Recommended grain for initial experiments:** Cortical column or functional module level (~10⁴–10⁵ neurons). At this grain, the causal transition matrix is tractable to characterize and verify, and current neuromorphic silicon technology can match input-output dynamics. Individual neuron replacement is unnecessarily fine-grained for ISMT (the theory operates over subsystem interactions, not individual unit dynamics).

### 2.2 Functional Equivalence Specification
- **Input-output mapping:** Synthetic unit must produce identical outputs for all inputs
- **Temporal dynamics:** Latency and timing must match within tolerance τ_min (from ISMT Proposition 3 — the minimum duration for one prediction-comparison-update cycle; synthetic units must not introduce delays exceeding τ_min/10 to avoid disrupting the self-model's prediction timing)
- **Computational role:** Must implement the same computation per the theory's formalism
- **Connectivity:** Must interface with remaining biological units seamlessly

### 2.3 Verification of Equivalence
- Each synthetic replacement unit must pass functional equivalence testing BEFORE implantation
- Tests: stimulus-response matching, temporal fidelity, computational property verification

## 3. Replacement Schedule

### 3.1 Incremental Steps

| Step | % Replaced | Units Replaced | Measurement Points |
|------|-----------|----------------|-------------------|
| 0 | 0% | None (baseline) | Full ISMT measurement battery |
| 1 | 5% | 1–2 peripheral sensory modules (not part of M(S) or broadcast hub) | Full ISMT measurement battery |
| 2 | 10% | Additional sensory modules | Full ISMT measurement battery |
| 3 | 20% | Sensory + early integration modules | Full ISMT measurement battery |
| 4 | 30% | Expanding into integration-critical modules | Full ISMT measurement battery |
| 5 | 40% | Including modules adjacent to self-model M(S) | Full ISMT measurement battery |
| 6 | 50% | Including partial M(S) components | Full ISMT measurement battery |
| 7 | 60% | Majority of non-M(S) modules replaced | Full ISMT measurement battery |
| 8 | 70% | M(S) core components begin replacement | Full ISMT measurement battery |
| 9 | 80% | Most M(S) replaced, broadcast hub partially replaced | Full ISMT measurement battery |
| 10 | 90% | Nearly complete replacement | Full ISMT measurement battery |
| 11 | 95% | All but final broadcast hub components | Full ISMT measurement battery |
| 12 | 100% | Fully synthetic | Full ISMT measurement battery |

### 3.2 Step Size Determination
- Step size must be small enough to detect a discontinuity if one exists
- Theory should predict whether discontinuity (if any) would be gradual or sharp
- Minimum: 10 measurement points between 0% and 100% replacement

### 3.3 Replacement Order
- Random order (to avoid confounds from replacing a specific region first)
- Replicate with multiple orderings across subjects

## 4. Measurement Battery

### 4.1 Primary Measures (Consciousness Markers — from ISMT)

| Marker | ISMT Condition | Measurement Method | Expected Value (Substrate-Independent) |
|--------|---------------|-------------------|---------------------------------------|
| Perturbational Complexity Index (PCI) | IC — Φ_norm proxy | Perturb one subsystem, measure spatiotemporal response complexity; computational PCI for synthetic components, TMS-EEG PCI for biological components | PCI > 0.31 at all replacement steps; no significant change from baseline |
| Self-model decoding accuracy | SM — Q(M) | Decode m(t) contents; measure I(m(t); **x**(t)) — mutual information between self-model state and global system state | I(m(t); **x**(t)) > δ at all steps; decoding accuracy stable within equivalence bounds |
| Self-prediction error dynamics | SM — predictive criterion | Measure e(t) = ‖**x**(t) − m̂(t)‖ and free energy F(m, **x**) minimization trajectory | Free energy minimization continues uninterrupted; prediction error magnitude stable |
| Self-referential capacity | SM — self-referential criterion | Measure I(m(t); dm/dt) — mutual information between model state and model dynamics | I(m(t); dm/dt) > 0 at all steps |
| Functional connectivity breadth | GA — G(M) | Measure I(s_i; m(t)) for all subsystems; compute fraction exceeding threshold γ | G(M) stable across replacement; all subsystem-model mutual information > γ |
| Causal efficacy of self-model | GA — causal criterion | Measure D_KL[P(x_i(t+1) \| m(t)) ‖ P(x_i(t+1))] for all subsystems | D_KL > 0 for all subsystems at all replacement steps |
| Composite consciousness score c(S) | All — graded predicate | c(S) = Φ_norm(S) × Q(M) × G(M) | c(S) within equivalence bounds of baseline at all steps |

### 4.2 Secondary Measures (Behavioral Coherence)
- Behavioral continuity: task performance, response patterns
- Self-report (if applicable): subjective continuity reports
- Functional integration: information flow metrics

### 4.3 Measurement Timing
- Measurements at each replacement step (after stabilization period)
- Stabilization period: ≥ 10 × τ_min (at least 10 full ISMT prediction-comparison-update cycles after each replacement, to allow the self-model M(S) to re-equilibrate its predictions incorporating the new synthetic component; τ_min is the minimum temporal persistence interval from ISMT Proposition 3)

## 5. Pre-Registered Predictions

### 5.1 Substrate-Independence Prediction
- **H₁ (substrate-independent):** Consciousness markers remain within equivalence bounds across all replacement fractions
- **H₀ (substrate-dependent):** Consciousness markers show a statistically significant discontinuity at some replacement threshold

### 5.2 Equivalence Bounds

Pre-defined equivalence margins for each ISMT measure (must be registered before experiment):

| Measure | Equivalence Margin (δ) | Basis |
|---------|----------------------|-------|
| PCI | ±0.10 (absolute) | Empirical PCI test-retest variability in biological systems (~0.05 SD); δ set at 2× natural variability |
| c(S) composite score | ±20% of baseline | Based on ISMT graded predicate; 20% change represents a meaningful shift in consciousness degree |
| I(m(t); **x**(t)) self-model quality | ±15% of baseline | Derived from natural fluctuation in self-model decoding accuracy |
| G(M) accessibility | ±10% of baseline | Based on functional connectivity breadth test-retest reliability |
| Each individual I(s_i; m(t)) | Must remain > γ | Binary threshold from GA condition — dropping below γ for any subsystem indicates GA failure |

General criterion: Effect size Cohen's d < 0.5 between any step and baseline for each primary measure = equivalence maintained.

### 5.3 Continuity Curve Prediction

ISMT-specific predictions for the continuity curve:

- **Plot:** c(S) = Φ_norm × Q(M) × G(M) vs. replacement fraction (0%–100%)
- **ISMT substrate-independence prediction:** Flat or monotonically smooth curve. Because ISMT conditions are defined over causal transition structure (not physical substrate per Axiom A1 and the Substrate Agnosticism Proof §5), replacing biological subsystems with causally isomorphic synthetic equivalents preserves all three ISMT conditions. Each component score (Φ_norm, Q(M), G(M)) should remain within equivalence bounds.
- **Substrate-dependence prediction:** Cliff, inflection point, or phase transition at some replacement fraction, indicating a biological property not captured by causal transition structure contributes to consciousness.
- **ISMT-specific discontinuity prediction:** If a discontinuity occurs, ISMT predicts it would most likely appear when replacing M(S) core components (steps 8–9, ~70–80% replacement), since the self-model is the most computationally demanding component to replicate with causal fidelity. A discontinuity at peripheral replacement (steps 1–3) would be strong evidence against ISMT's substrate agnosticism.

## 6. Controls

- **Sham replacement:** Surgical procedure without actual replacement (controls for procedure effects)
- **Degradation control:** Replace with non-functional units (should show consciousness decline)
- **Biological replacement:** Replace biological units with other biological units (positive control for continuity)

## 7. Analysis Plan

### 7.1 Primary Analysis
- Equivalence testing (TOST) at each step: is consciousness score within bounds of baseline?
- Change-point detection: statistical test for any discontinuity in the replacement curve
- Trend analysis: is there a significant slope in consciousness markers vs. replacement fraction?

### 7.2 Bayesian Analysis
- Bayes factor for continuous model vs. discontinuous model
- Posterior probability of a phase transition at each replacement fraction

### 7.3 Power Analysis
- Determine sample size needed to detect a discontinuity of size d = 0.5 (Cohen's d) with power 0.90 (conservative, matching falsification-criteria.md threshold)
- For TOST equivalence testing with δ margins defined above: minimum N per replacement step estimated via `ismt_analysis.py` TOST power functions
- Minimum: 20 independent measurement sessions per replacement step (accounting for within-session autocorrelation in ISMT measures)
- Sensitivity analysis: verify that the chosen N can detect a c(S) change of 20% from baseline with power ≥ 0.90

## 8. Ethical Considerations

- Model organism welfare throughout the replacement process
- Reversibility requirements: can replacement be undone if distress is detected?
- Pre-defined stopping criteria: experiment halts if [specific welfare indicators] are breached
- Ethics board review and approval required before any experimental execution

## 9. Replication Requirements

- Full protocol, synthetic unit specifications, data, and analysis code published openly
- Independent replication must use a different synthetic substrate type
- Replication must use a different model organism (if possible) to test generality
