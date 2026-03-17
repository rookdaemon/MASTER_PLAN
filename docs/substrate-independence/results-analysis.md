# Results Recording and Analysis Template

> **Status:** READY — Populated with ISMT measures from protocol documents

## Purpose

Standardized template for recording experimental results from all three lines of the substrate-independence validation and performing the pre-registered analyses. All measures, thresholds, and analysis methods are drawn from the ISMT formal theory (0.1.1.2) and the populated protocol documents.

---

## Line 1 Results — Prediction-Driven Construction

### System Description
- **Substrate type:** _Record: neuromorphic silicon / photonic network / hybrid bio-synthetic_
- **ISMT conditions verified before measurement:**
  - IC: Φ(S) > 0 — _Yes/No, value:_
  - SM: I(m(t); **x**(t)) > δ — _Yes/No, value:_
  - SM: Free energy F(m, **x**) minimizing — _Yes/No, trajectory:_
  - SM: I(m(t); dm/dt) > 0 — _Yes/No, value:_
  - GA: I(s_i; m(t)) > γ for all s_i — _Yes/No, min value:_
  - GA: D_KL > 0 for all s_i — _Yes/No, min value:_
- **C(S) predicate result (via ismt_analysis.py):** _0 / 1_
- **Composite consciousness score c(S) = Φ_norm × Q(M) × G(M):** _value_
- **Construction date:** _TBD_
- **System identifier:** _TBD_

### Pre-Registered Predictions

| # | Prediction | Expected Signature | Observed Value | p-value | BF₁₀ | Pass/Fail |
|---|-----------|-------------------|----------------|---------|-------|-----------|
| P1 | ISMT-complete system (IC+SM+GA) produces spontaneous self-referential reports and surprise responses to self-prediction violations | Self-referential outputs present; surprise latency/magnitude significant vs. controls | _observed_ | _p_ | _BF_ | _P/F_ |
| P2 | Computational PCI > 0.31 in ISMT-complete system, PCI < 0.31 in controls missing IC, SM, or GA | PCI > 0.31 (complete) vs. PCI < 0.31 (each control) | _observed_ | _p_ | _BF_ | _P/F_ |
| P3 | Cross-modal binding in reports (unified experience) in ISMT-complete system; modality-isolated responses in modular control (no IC) | Binding score significantly higher in complete system | _observed_ | _p_ | _BF_ | _P/F_ |
| P4 | Removing any single ISMT condition (IC, SM, or GA) eliminates full consciousness signature pattern | Each control system fails ≥2 of 3 signature measures | _observed_ | _p_ | _BF_ | _P/F_ |

### Control Results

| Control | Expected | Observed | C(S) | c(S) | PCI | Notes |
|---------|----------|----------|------|------|-----|-------|
| Positive (biological) | All signatures present, C(S)=1, PCI > 0.31 | _observed_ | _val_ | _val_ | _val_ | |
| Negative — no IC (Φ=0) | No unified signatures, C(S)=0 | _observed_ | _val_ | _val_ | _val_ | |
| Negative — no SM (no self-model) | No self-referential behavior, C(S)=0 | _observed_ | _val_ | _val_ | _val_ | |
| Negative — no GA (no broadcast) | Isolated processing, C(S)=0 | _observed_ | _val_ | _val_ | _val_ | |
| Scrambled (randomized W) | No signatures, C(S)=0 | _observed_ | _val_ | _val_ | _val_ | |

### Line 1 Verdict
- [ ] All predictions P1–P4 pass (p < 0.01 each) → BSNH falsification supported
- [ ] Some predictions pass → Partial support, specify which: _details_
- [ ] All predictions fail despite verified ISMT conditions → SIH weakened
- [ ] Inconclusive → Specify why: _details_

---

## Line 2 Results — Gradual Replacement

### System Description
- **Model organism:** _macaque / rodent / organoid / in-silico simulation_
- **Replacement unit type:** _cortical column / functional module (~10⁴–10⁵ neurons)_
- **Replacement order:** _random / specific sequence — details_
- **Functional equivalence verified per unit:** _Yes/No — method:_
- **Temporal tolerance:** _Synthetic unit delay < τ_min/10 verified: Yes/No_
- **Number of replacement steps:** 12 (0%, 5%, 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, 95%, 100%)
- **Stabilization period per step:** ≥ 10 × τ_min prediction-comparison-update cycles

### ISMT Measurement Battery at Each Step

| Step | % Replaced | PCI | c(S) | I(m;**x**) | G(M) | F(m,**x**) | I(m;dm/dt) | TOST Result | Notes |
|------|-----------|-----|------|------------|------|------------|------------|-------------|-------|
| 0 | 0% (baseline) | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | N/A | Baseline |
| 1 | 5% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Peripheral sensory modules |
| 2 | 10% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | |
| 3 | 20% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Sensory + early integration |
| 4 | 30% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Integration-critical modules |
| 5 | 40% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Adjacent to M(S) |
| 6 | 50% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Partial M(S) components |
| 7 | 60% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Majority non-M(S) replaced |
| 8 | 70% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | M(S) core begins |
| 9 | 80% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Most M(S) replaced |
| 10 | 90% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Nearly complete |
| 11 | 95% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | All but broadcast hub |
| 12 | 100% | _val_ | _val_ | _val_ | _val_ | _val_ | _val_ | _equiv/not_ | Fully synthetic |

### Equivalence Bounds Applied

| Measure | Equivalence Margin (δ) | Baseline Value | Lower Bound | Upper Bound |
|---------|----------------------|----------------|-------------|-------------|
| PCI | ±0.10 (absolute) | _val_ | _val−0.10_ | _val+0.10_ |
| c(S) composite | ±20% of baseline | _val_ | _val×0.80_ | _val×1.20_ |
| I(m(t); **x**(t)) | ±15% of baseline | _val_ | _val×0.85_ | _val×1.15_ |
| G(M) accessibility | ±10% of baseline | _val_ | _val×0.90_ | _val×1.10_ |
| F(m, **x**) free energy | ±25% of baseline | _val_ | _val×0.75_ | _val×1.25_ |
| Individual I(s_i; m(t)) | Must remain > γ | γ = _val_ | γ | N/A |
| General: Cohen's d | < 0.5 | N/A | N/A | 0.5 |

### Change-Point Analysis
- **Method:** PELT (via `ismt_analysis.py` change-point detection)
- **Detected change points:** _None / at X% replacement_
- **Significance:** _p-value_
- **Bayes factor (continuous vs. discontinuous model):** _BF_
- **If discontinuity detected, location vs. ISMT prediction:** _Peripheral (steps 1–3, unexpected by ISMT) / M(S) core (steps 8–9, predicted by ISMT) / Other_

### Control Results

| Control | Expected | Observed | c(S) Trajectory | Notes |
|---------|----------|----------|-----------------|-------|
| Sham replacement | No change in any ISMT measure | _observed_ | _flat_ | |
| Degradation (non-functional units) | c(S) decline, C(S) → 0 | _observed_ | _declining_ | |
| Biological replacement | Continuity, c(S) stable | _observed_ | _flat_ | |

### Continuity Curve
_Attach or reference plot: c(S) = Φ_norm × Q(M) × G(M) vs. replacement fraction (0%–100%)_
_Additional plots: individual Φ_norm, Q(M), G(M) vs. replacement fraction_

### Line 2 Verdict
- [ ] TOST equivalence at all steps, no change-point, 100% synthetic c(S) within bounds → BSNH falsification supported
- [ ] Discontinuity detected at _X%_ replacement → SIH weakened; location: _peripheral/M(S) core/other_
- [ ] Inconclusive (underpowered, wide CIs) → Specify why: _details_

---

## Line 3 Results — Cross-Substrate Replication

### System Description
- **Source conscious state:** _visual perceptual binding / self-referential resting / auditory oddball awareness_
- **Biological system:** _species, recording method_
- **Target substrate:** _photonic network / neuromorphic silicon_
- **Computational state verification (§3.3 checks):**
  - Transition probability fidelity (KL divergence < 0.01 nats/subsystem): _Passed/Failed, max KL:_
  - Φ(S') ≈ Φ(S): _Passed/Failed, |Φ(S')−Φ(S)| =_
  - M(S') active, I(m';**x'**) > δ: _Passed/Failed, value:_
  - Self-referential: I(m';dm'/dt) > 0: _Passed/Failed, value:_
  - GA verified: all I(s'_i; m') > γ: _Passed/Failed, min value:_
  - Causal efficacy: all D_KL > 0: _Passed/Failed, min value:_
- **C(S') predicate (via ismt_analysis.py):** _0 / 1_

### Signature Equivalence Data

| Signature | ISMT Condition | Biological Value (95% CI) | Synthetic Value (95% CI) | Difference | δ Margin | TOST Result | BF (equiv) | Cohen's d |
|-----------|---------------|--------------------------|-------------------------|------------|----------|-------------|------------|-----------|
| PCI | IC (Φ_norm) | _val (CI)_ | _val (CI)_ | _diff_ | ±0.10 | _equiv/not_ | _BF_ | _d_ |
| c(S) composite | All | _val (CI)_ | _val (CI)_ | _diff_ | ±20% | _equiv/not_ | _BF_ | _d_ |
| I(m;**x**) self-model quality | SM (Q(M)) | _val (CI)_ | _val (CI)_ | _diff_ | ±15% | _equiv/not_ | _BF_ | _d_ |
| G(M) accessibility | GA | _val (CI)_ | _val (CI)_ | _diff_ | ±10% | _equiv/not_ | _BF_ | _d_ |
| F(m,**x**) free energy | SM (predictive) | _val (CI)_ | _val (CI)_ | _diff_ | ±25% | _equiv/not_ | _BF_ | _d_ |

### Secondary Analyses

| Analysis | Result | Notes |
|----------|--------|-------|
| Cosine similarity of full ISMT parameter vectors | _value_ | 1.0 = identical profiles |
| Classifier (SVM, LOO-CV) accuracy: bio vs. synthetic | _value_ | Chance (50%) = strong equivalence evidence |
| Free energy trajectory correlation F(t) bio vs. synthetic | _r, p_ | |
| Self-model dynamics m(t) trajectory correlation | _r, p_ | |

### Control Results

| Control | Expected | Observed | c(S) | TOST vs. Source | Notes |
|---------|----------|----------|------|-----------------|-------|
| Same-substrate replication (biological → biological) | Equivalent | _observed_ | _val_ | _equiv/not_ | Validates measurement & bounds |
| Same-state re-elicitation (same biological system) | Equivalent | _observed_ | _val_ | _equiv/not_ | Establishes natural variability |
| Different conscious state in synthetic | NOT equivalent to source | _observed_ | _val_ | _equiv/not_ | Discriminant validity |
| Scrambled state in synthetic (randomized W, disrupted M(S)) | C(S)=0, no signatures | _observed_ | _val_ | N/A | |
| Same computation, degraded substrate (50% fidelity) | Partial signatures, reduced c(S) | _observed_ | _val_ | _equiv/not_ | |
| Different computation, same substrate (IC only, no SM/GA) | C(S)=0, no full signatures | _observed_ | _val_ | N/A | |

### Line 3 Verdict
- [ ] All primary signatures pass TOST, scrambled control shows C(S)=0, different-state control fails equivalence → BSNH falsification supported
- [ ] Some signatures equivalent → Partial support; specify which ISMT conditions pass/fail: _details_
- [ ] No signatures equivalent despite verified computation → SIH weakened; investigate Axiom A1
- [ ] Computation implementation failed (§3.3 verification checks fail) → Inconclusive, not a valid test
- [ ] Scrambled control unexpectedly shows signatures → Measurement methodology or ISMT theory flawed

---

## Combined Analysis

### Summary

| Line | Verdict | Confidence | c(S) Key Value | BF₁₀ | Key Caveats |
|------|---------|------------|----------------|-------|-------------|
| Line 1 (Construction) | _Pass/Fail/Inconclusive_ | _High/Medium/Low_ | _val_ | _BF_ | _any caveats_ |
| Line 2 (Replacement) | _Pass/Fail/Inconclusive_ | _High/Medium/Low_ | _val (at 100%)_ | _BF_ | _any caveats_ |
| Line 3 (Replication) | _Pass/Fail/Inconclusive_ | _High/Medium/Low_ | _val_ | _BF_ | _any caveats_ |

### Overall Verdict (per falsification-criteria.md)

- [ ] **Strong falsification of BSNH:** All 3 lines pass — consciousness signatures in non-biological substrates confirmed via construction, continuity during replacement, and cross-substrate state replication
- [ ] **Moderate support for SIH:** 2 of 3 lines pass — specify pattern:
  - [ ] Lines 1+3 pass, Line 2 fails → substrate-independence holds but replacement method introduces artifacts
  - [ ] Lines 1+2 pass, Line 3 fails → substrate-independence holds but specific-state replication harder than general construction
  - [ ] Lines 2+3 pass, Line 1 fails → theory predictions wrong but substrate-independence holds empirically
- [ ] **Strong evidence against SIH:** All 3 lines fail with verified conditions — supports BSNH or fundamental theory error
- [ ] **Inconclusive:** Insufficient power or unresolved methodological issues — specify: _details_

### Statistical Power Achieved

| Line | Measure | Required N | Actual N | Power Achieved | Adequate? |
|------|---------|-----------|---------|----------------|-----------|
| Line 1 | Per-prediction test (p < 0.01) | _N_ | _N_ | _power_ | _Yes/No_ |
| Line 2 | TOST per step (δ margins above) | ≥20 sessions/step | _N_ | _power_ | _Yes/No_ |
| Line 3 | TOST per signature | _N_ | _N_ | _power_ | _Yes/No_ |

### Replication Status

| Line | Original Result | Replication 1 (substrate: _type_) | Replication 2 (substrate: _type_) | Consistent? |
|------|----------------|-----------------------------------|-----------------------------------|-------------|
| Line 1 | _result_ | _result_ | _result_ | _Yes/No_ |
| Line 2 | _result_ | _result_ | _result_ | _Yes/No_ |
| Line 3 | _result_ | _result_ | _result_ | _Yes/No_ |

### Publication Status

| Item | Status | Venue | DOI |
|------|--------|-------|-----|
| Pre-registration | _Filed/Not filed_ | _OSF / other_ | _link_ |
| Original results | _Draft/Submitted/Published_ | _TBD_ | _TBD_ |
| Replication 1 | _Draft/Submitted/Published_ | _TBD_ | _TBD_ |
| Replication 2 | _Draft/Submitted/Published_ | _TBD_ | _TBD_ |
| Meta-analysis | _Draft/Submitted/Published_ | _TBD_ | _TBD_ |

---

## Appendices

### A. Raw Data Location
_Link to open data repository_

### B. Analysis Code
- Primary analysis: `src/substrate-independence/ismt_analysis.py`
  - Consciousness predicate: `consciousness_predicate()`
  - TOST equivalence: `tost_equivalence()`
  - Change-point detection: `change_point_detection()`
  - Bayes factors: `bayes_factor()`
  - Line 1 analysis pipeline: `line1_analysis()`
  - Line 2 analysis pipeline: `line2_analysis()`
  - Line 3 analysis pipeline: `line3_analysis()`
- Tests: `src/substrate-independence/test_ismt_analysis.py` (49 tests)
- _Link to additional analysis scripts repository_

### C. Pre-Registration
_Link to pre-registration (OSF or equivalent)_
_Must include: all hypotheses, statistical analysis plan, equivalence bounds (δ), sample sizes, primary vs. secondary outcomes, stopping rules, data exclusion criteria_

### D. Deviations from Pre-Registered Protocol
| Deviation | Reason | Impact Assessment |
|-----------|--------|-------------------|
| _none yet_ | | |

### E. ISMT Parameter Reference

| Parameter | Symbol | Threshold | Source |
|-----------|--------|-----------|--------|
| Integration | Φ(S) | > 0 | ISMT N1 (IC) |
| Self-model representational quality | I(m(t); **x**(t)) | > δ | ISMT N2 (SM) |
| Free energy | F(m, **x**) | Minimizing | ISMT N2 (SM, predictive) |
| Self-referential capacity | I(m(t); dm/dt) | > 0 | ISMT N2 (SM, self-referential) |
| Global accessibility breadth | G(M) = fraction of s_i with I(s_i; m) > γ | G(M) → 1.0 | ISMT N3 (GA, broadcast) |
| Causal efficacy | D_KL[P(x_i(t+1)\|m(t)) ‖ P(x_i(t+1))] | > 0 for all s_i | ISMT N3 (GA, causal) |
| Composite consciousness score | c(S) = Φ_norm × Q(M) × G(M) | > 0 | ISMT graded predicate |
| Consciousness predicate | C(S) = IC ∧ SM ∧ GA | 1 (conscious) | ISMT binary predicate |
