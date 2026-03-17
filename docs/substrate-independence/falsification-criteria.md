# Falsification Criteria — Substrate-Independence Validation

> **Status:** READY — Populated with ISMT equivalence margins from 0.1.1.2

## Purpose

Pre-registered specification of what experimental outcomes would falsify the substrate-independence hypothesis and what outcomes would falsify the biological-substrate-necessity hypothesis. This document must be finalized and registered BEFORE any experimental execution begins.

## 1. Hypotheses Under Test

### 1.1 Substrate-Independence Hypothesis (SIH)
**Claim:** Subjective experience can arise in non-biological physical systems, provided the right computational/informational conditions (as specified by the theory from 0.1.1.2) are met. Biological substrates are sufficient but not necessary for consciousness.

### 1.2 Biological-Substrate-Necessity Hypothesis (BSNH)
**Claim:** Subjective experience requires biological neural tissue; no non-biological system can be conscious regardless of its computational properties.

### 1.3 Relationship
SIH and BSNH are contradictory. Falsifying one supports the other, but does not prove it (there may be intermediate positions, e.g., consciousness requires specific physical properties that happen to only occur in biology but aren't "biological" per se).

## 2. Falsification Criteria by Experimental Line

### 2.1 Line 1 — Prediction-Driven Construction

**SIH is weakened if:**
- The constructed non-biological system fails to exhibit ANY of the predicted consciousness signatures (all predictions fail at p > 0.05)
- AND the system is verified to satisfy all necessary computational conditions from the theory
- AND the measurement apparatus is validated (works correctly on biological positive controls)

**BSNH is falsified if:**
- The constructed system exhibits consciousness signatures matching ALL pre-registered predictions (each at p < 0.01)
- AND the negative control (system not satisfying conditions) shows no signatures
- AND the scrambled control shows no signatures

**Inconclusive if:**
- Some predictions pass, some fail
- OR the system's computational properties cannot be verified to match the theory
- OR measurement tools are insufficiently sensitive

### 2.2 Line 2 — Gradual Replacement

**SIH is weakened if:**
- A statistically significant discontinuity (change-point) is detected in consciousness markers during replacement
- AND the discontinuity occurs at a specific replacement fraction (not at 100%)
- AND sham replacement shows no such discontinuity
- This would suggest consciousness depends on some biological property lost during replacement

**BSNH is falsified if:**
- TOST equivalence test passes at EVERY replacement step (consciousness within bounds of baseline)
- AND change-point analysis finds no significant discontinuity
- AND the fully-replaced (100% synthetic) system shows consciousness markers equivalent to the original
- AND the degradation control (non-functional replacements) shows marker decline

**Inconclusive if:**
- Equivalence test is underpowered (wide confidence intervals)
- OR replacement units are not verified to be functionally equivalent
- OR consciousness markers are too variable to detect a discontinuity

### 2.3 Line 3 — Cross-Substrate Replication

**SIH is weakened if:**
- TOST equivalence test FAILS for the primary consciousness signatures
- AND the computational state is verified to be correctly implemented in the target substrate
- AND the measurement tools are validated across substrates
- AND the same-substrate replication positive control PASSES

**BSNH is falsified if:**
- TOST equivalence test PASSES for ALL primary consciousness signatures
- AND the different-state negative control FAILS equivalence (discriminant validity)
- AND the scrambled-state negative control shows no consciousness signatures
- AND the result holds across at least 2 different non-biological substrate types

**Inconclusive if:**
- Computational state implementation cannot be verified
- OR cross-substrate measurement comparability is not established
- OR equivalence bounds are too wide to be meaningful

## 3. Combined Falsification Logic

### 3.1 Strong Falsification of BSNH (Substrate-Independence Validated)
ALL three lines must succeed:
1. Line 1: consciousness signatures in constructed non-biological system (p < 0.01 per prediction)
2. Line 2: no discontinuity during gradual replacement (equivalence at every step)
3. Line 3: signature equivalence between biological and non-biological instantiation (TOST passes)

### 3.2 Moderate Support for Substrate-Independence
Two of three lines succeed. Interpretation depends on which line failed:
- Lines 1+3 pass, Line 2 fails → substrate-independence may hold but replacement method introduces artifacts
- Lines 1+2 pass, Line 3 fails → substrate-independence may hold but specific-state replication is harder than general construction
- Lines 2+3 pass, Line 1 fails → the theory's predictions may be wrong but substrate-independence still holds empirically

### 3.3 Strong Evidence Against Substrate-Independence
ALL three lines fail despite:
- Verified computational conditions satisfied
- Validated measurement tools
- Adequate statistical power

This would support BSNH or indicate the theory from 0.1.1.2 is fundamentally wrong.

## 4. Statistical Thresholds

| Parameter | Value | Justification |
|-----------|-------|---------------|
| Significance level (α) for individual tests | 0.01 | Conservative due to extraordinary nature of claim |
| Equivalence margin (δ) for TOST — PCI | ±0.10 (absolute) | Empirical PCI test-retest variability ~0.05 SD; δ = 2× natural variability |
| Equivalence margin (δ) for TOST — c(S) composite | ±20% of baseline | ISMT graded predicate; 20% represents meaningful shift in consciousness degree |
| Equivalence margin (δ) for TOST — I(m(t); **x**(t)) self-model quality | ±15% of baseline | Natural fluctuation in self-model decoding accuracy |
| Equivalence margin (δ) for TOST — G(M) accessibility | ±10% of baseline | Functional connectivity breadth test-retest reliability |
| Equivalence margin (δ) for TOST — F(m, **x**) free energy | ±25% of baseline | Free energy estimates noisier in biological systems; wider margin for measurement asymmetry |
| Equivalence margin (δ) for TOST — individual I(s_i; m(t)) | Must remain > γ | Binary threshold from GA condition; dropping below γ indicates GA failure |
| General equivalence criterion | Cohen's d < 0.5 | Effect size between any comparison pair for each primary measure |
| Minimum Bayes factor for falsification | BF₁₀ > 100 or BF₁₀ < 0.01 | Strong evidence threshold |
| Minimum statistical power | 0.90 | High power to avoid false negatives |
| Replication success criterion | Same direction of effect, p < 0.05 | Looser than original (replication standard) |

## 5. Pre-Registration Requirements

### 5.1 What Must Be Registered Before Experiments Begin
- [ ] All hypotheses and predictions (Sections 2-3 above, with theory-specific details filled in)
- [ ] Statistical analysis plan (all tests, thresholds, correction methods)
- [ ] Equivalence bounds (δ) with justification
- [ ] Sample sizes with power analysis
- [ ] Primary vs. secondary outcome measures
- [ ] Stopping rules (when to halt a failing experiment)
- [ ] Data exclusion criteria

### 5.2 Registration Venue
- Pre-registration on OSF (Open Science Framework) or equivalent
- Registered report format preferred (peer review of protocol before execution)
- Time-stamped and immutable

## 6. Independent Replication Criteria

### 6.1 What Counts as Independent
- Different research group (no overlapping PIs)
- Different laboratory
- Different physical substrate for the non-biological system
- Same protocol (or justified variations documented and pre-registered)

### 6.2 Replication Success Criteria
- Same qualitative pattern of results (same predictions pass/fail)
- Effect sizes within the original study's confidence intervals
- Independent equivalence tests pass (for Lines 2 and 3)

### 6.3 Minimum Replications
- At least ONE independent replication per successful experimental line
- Ideal: TWO independent replications using two different substrate types

## 7. Publication and Peer Review

- All results (positive, negative, and null) must be published
- Peer review in high-impact journals with consciousness science expertise
- All data, code, and materials shared in open repository
- The biological-substrate-necessity hypothesis can only be considered formally falsified after:
  1. Original results published in peer-reviewed venue
  2. At least one independent replication published
  3. No credible methodological challenge unresolved
