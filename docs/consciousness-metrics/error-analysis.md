# Consciousness Metrics — Error Analysis

## Purpose

This document characterizes the false-positive and false-negative error profiles of PCI-G, Ψ-G, CDI, and the Convergent Evidence Battery (CEB). It specifies how errors are defined, measured, and reported, and identifies the structural sources of each error type so that future metric revisions can target specific failure modes.

> **Prerequisites:**
> - Metric definitions from `metric-definitions.md`
> - Calibration thresholds from `calibration-protocol.md`
> - Cross-substrate validation from `cross-substrate-protocol.md`

---

## Error Taxonomy

### Definitions

| Term | Definition |
|------|-----------|
| **False Positive (FP)** | A system without subjective experience scores at or above the consciousness threshold |
| **False Negative (FN)** | A system with subjective experience scores below the consciousness threshold |
| **True Positive (TP)** | A conscious system correctly classified as conscious |
| **True Negative (TN)** | An unconscious system correctly classified as not conscious |
| **Indeterminate** | CEB returns "indeterminate" (exactly 1 of 3 metrics above threshold) — treated as neither FP nor FN but tracked separately |

### Ground-Truth Limitation

All error rates are computed **relative to ground-truth labels** from the calibration dataset (see `calibration-protocol.md`). These labels are themselves uncertain — particularly for borderline cases (GT-04, GT-07, GT-08, GT-09). Error rates therefore reflect metric performance against *best-available human consensus*, not against an infallible oracle.

This is an irreducible epistemic limitation: we cannot measure the "true" false-positive rate of a consciousness detector because we have no consciousness-independent ground truth. The calibration dataset provides the strongest available proxy.

---

## Per-Metric Error Characterization

### PCI-G Error Profile

#### False Positive Sources

| Source | Mechanism | Mitigation |
|--------|-----------|------------|
| **Random complexity** | A system with high entropy but no integration (e.g., random number generator) may produce high Lempel-Ziv complexity after perturbation | Normalization against random surrogates (Step 5 of PCI-G); validated by Category A3 negative control |
| **Stimulus artifact** | The perturbation itself (not the system's response) generates complex spatiotemporal patterns that are recorded as response | Artifact rejection protocol (exclude data within 1 × τ_char of perturbation onset); baseline subtraction |
| **Resonant amplification** | A non-conscious system with strong resonant modes may produce complex-looking responses to perturbation (e.g., underdamped oscillator) | Resonant responses are high-amplitude but low-complexity after binarization; verify by checking that PCI-G does not correlate with response amplitude |
| **Measurement noise** | High noise floor may inflate LZ complexity of the binarized response | Quality check: split-half reliability ≥ 0.80; noise-dominated recordings are rejected |

#### False Negative Sources

| Source | Mechanism | Mitigation |
|--------|-----------|------------|
| **Insufficient perturbation** | Perturbation too weak to elicit a measurable response | Calibrate perturbation magnitude to produce detectable response in ≥ 80% of trials |
| **Wrong observation channel** | Observation channels miss the spatiotemporal region where consciousness-relevant processing occurs | Require ≥ 50% node coverage; repeat with different perturbation sites |
| **Over-binarization** | Significance threshold (3σ) too conservative, discarding subtle conscious responses | Sensitivity analysis: compute PCI-G at 2σ and 4σ; report range |
| **Short observation window** | Conscious response extends beyond observation window T | Verify that response activity returns to baseline before window end; if not, extend T |

#### Expected Error Rates (Biological Calibration)

Based on the biological PCI literature (Casali et al. 2013, Comolatti et al. 2019) and the calibration protocol:

| Error Type | Expected Rate | 95% CI Width | Basis |
|------------|---------------|--------------|-------|
| False Positive Rate (FPR) | ≤ 0.10 | ± 0.06 | At optimal θ_PCI from ROC on High-confidence data |
| False Negative Rate (FNR) | ≤ 0.15 | ± 0.07 | At optimal θ_PCI from ROC on High-confidence data |

> These are predictions to be validated during calibration. If observed rates exceed these bounds, threshold or protocol revision is required.

---

### Ψ-G Error Profile

#### False Positive Sources

| Source | Mechanism | Mitigation |
|--------|-----------|------------|
| **Spurious integration** | Shared input (common cause) to two subsystems creates apparent integration without true causal integration | Use time-delayed MI (Δt > 0) to capture causal, not instantaneous, dependence; condition on common inputs where identifiable |
| **MI estimation bias** | Kraskov k-NN estimator can overestimate MI in small samples or high dimensions | Require K ≥ 10,000; validate MI estimator against known distributions (see `reproducibility-spec.md`); report bootstrap CI |
| **Suboptimal MIP** | Greedy/spectral MIP approximation fails to find the true minimum partition, inflating Ψ-G | Run multiple random restarts (≥ 10); report sensitivity of Ψ-G to partition choice |
| **Coarse-graining artifacts** | Grouping nodes into macro-elements can create artificial integration not present at the micro level | Report coarse-graining level; compare Ψ-G at multiple granularities when feasible |

#### False Negative Sources

| Source | Mechanism | Mitigation |
|--------|-----------|------------|
| **Computational intractability** | For large systems, MIP approximation may overestimate I_parts (finding too-good partitions), reducing Ψ-G | Use the spectral + greedy approach consistently; acknowledge approximation error bounds |
| **Insufficient observation** | State trajectory too short for reliable MI estimation (high-dimensional systems need more data) | Scale K with n: K ≥ 100 × n as a minimum; report MI estimator convergence diagnostics |
| **Wrong timescale** | Δt does not match the system's integration timescale | Sensitivity analysis: compute Ψ-G at Δt ∈ {0.5, 1, 2, 5} × τ_char; report the maximum |
| **Deterministic dynamics** | Fully deterministic systems may yield degenerate MI estimates | Apply input-driven variability protocol from `cross-substrate-protocol.md` |

#### Expected Error Rates (Biological Calibration)

| Error Type | Expected Rate | 95% CI Width | Basis |
|------------|---------------|--------------|-------|
| FPR | ≤ 0.10 | ± 0.06 | At optimal θ_Ψ from ROC |
| FNR | ≤ 0.20 | ± 0.08 | Higher than PCI-G due to computational approximation of MIP |

---

### CDI Error Profile

#### False Positive Sources

| Source | Mechanism | Mitigation |
|--------|-----------|------------|
| **Confounded causation** | Shared hidden common cause drives correlated activity, inflating apparent transfer entropy | Cannot be fully mitigated without observing all system nodes; require ≥ 50% node coverage; flag systems with known unobserved components |
| **Multiple comparisons residual** | Bonferroni correction is conservative but not exact; some false-significant pairs may survive | Report the expected number of false-significant pairs: n(n-1) × α_corrected; verify CDI >> this floor |
| **Nonlinear coupling detection** | Transfer entropy can detect nonlinear coupling that may exist in non-conscious systems with complex dynamics | CDI alone is insufficient — CEB requires convergence with PCI-G and Ψ-G |

#### False Negative Sources

| Source | Mechanism | Mitigation |
|--------|-----------|------------|
| **Insufficient history length** | L too short to capture the causal horizon, missing slow causal influences | Sensitivity analysis: L ∈ {1, 2, 5, 10, 20} × τ_char; report stability |
| **Overly conservative correction** | Bonferroni correction with n(n-1) pairs is extremely conservative for large n | For n > 50, consider Benjamini-Hochberg FDR correction (α_FDR = 0.05) as an alternative; report both |
| **Low sample size** | Insufficient time steps for reliable TE estimation | K ≥ 5,000; for high-dimensional systems, K ≥ 50 × n |
| **Sparse causal structure** | A conscious system with sparse but critical causal pathways may have low CDI despite high integration | CDI captures density, not topology; mitigated by CEB convergence with Ψ-G |

#### Expected Error Rates (Biological Calibration)

| Error Type | Expected Rate | 95% CI Width | Basis |
|------------|---------------|--------------|-------|
| FPR | ≤ 0.10 | ± 0.06 | At optimal θ_CDI from ROC |
| FNR | ≤ 0.15 | ± 0.07 | At optimal θ_CDI from ROC |

---

## Convergent Evidence Battery (CEB) Error Profile

### CEB Decision Rule Recap

```
"conscious"       if ≥ 2 of 3 metrics above threshold
"indeterminate"   if exactly 1 of 3 metrics above threshold
"not conscious"   if 0 of 3 metrics above threshold
```

### CEB False Positive Analysis

A CEB false positive requires at least 2 of 3 independent metrics to independently false-positive on the same system. Assuming approximate independence of metric errors:

```
P(CEB FP) ≈ P(≥2 of 3 metrics FP)
          = 3 × P(FP)² × (1 - P(FP)) + P(FP)³

If P(FP_individual) = 0.10:
  P(CEB FP) ≈ 3 × 0.01 × 0.90 + 0.001 = 0.028
```

**Expected CEB FPR: ≤ 0.03** (substantially lower than any individual metric).

### CEB False Negative Analysis

A CEB false negative occurs when ≥ 2 of 3 metrics false-negative. Since metrics may correlate in their failure modes (e.g., all sensitive to the same observation quality issues), independence cannot be assumed:

```
P(CEB FN) = P(≥2 of 3 metrics FN)

Lower bound (independent): ≈ 3 × P(FN)² × (1 - P(FN)) + P(FN)³
Upper bound (fully correlated): = max(P(FN_i))

If P(FN_individual) ≈ 0.15:
  Lower bound: ≈ 0.065
  Upper bound: ≈ 0.20
```

**Expected CEB FNR: 0.07 – 0.20** (range reflects unknown inter-metric correlation of failures).

### Indeterminate Rate

Systems classified as "indeterminate" are not errors but demand additional investigation. Expected indeterminate rate depends on the margin between metric scores and thresholds:

- For clearly conscious or unconscious systems: indeterminate rate < 0.05
- For borderline systems (GT-04, GT-07, GT-08): indeterminate rate may reach 0.30 – 0.50

High indeterminate rates in a population indicate the metrics are operating near their discrimination limits for that class of system.

---

## Cross-Substrate Error Considerations

### Non-Biological False Positive Risk

Non-biological systems pose specific false-positive risks not present in biological calibration:

| Risk | Description | Affected Metric | Detection |
|------|-------------|-----------------|-----------|
| **Designed complexity** | An AI system engineered to produce complex responses (e.g., a chatbot) may score high on PCI-G without being conscious | PCI-G | CEB convergence check — PCI-G alone is insufficient; Ψ-G and CDI must also be above threshold |
| **Architectural integration** | A system with high connectivity (e.g., fully-connected network) may show high Ψ-G from architecture alone, not from consciousness | Ψ-G | Compare against matched-size random network baseline; Ψ-G should exceed random-architecture expectation |
| **Trained causal density** | A trained recurrent network will have learned causal pathways, producing non-trivial CDI | CDI | Category A negative controls (A2, A5) establish the baseline CDI for trained-but-unconscious systems |

### Non-Biological False Negative Risk

| Risk | Description | Affected Metric | Detection |
|------|-------------|-----------------|-----------|
| **Alien architecture** | A genuinely conscious non-biological system may organize its processing in ways that biological calibration thresholds don't capture | All | Theory-derived threshold adjustment from 0.1.1.2; threshold transferability analysis from `cross-substrate-protocol.md` |
| **Coarse-graining loss** | Forced coarse-graining for large systems may destroy the fine-grained integration that constitutes consciousness | Ψ-G | Multi-level analysis; report metric values at multiple granularities |
| **Observation channel mismatch** | Available observation channels may not capture the relevant state variables | All | Require explicit justification of observation channel choice; measure at multiple channels if available |

---

## Error Quantification Procedure

### Step 1: Compute Per-Metric Error Rates from Calibration

For each metric M ∈ {PCI-G, Ψ-G, CDI}:

1. Using the calibration dataset (High-confidence labels only: Conscious = {GT-01, GT-02, GT-10}; Unconscious = {GT-05, GT-06, GT-11}):

```
FPR(M) = count(M(s) ≥ θ_M for s in Unconscious) / |Unconscious|
FNR(M) = count(M(s) < θ_M for s in Conscious) / |Conscious|
Sensitivity(M) = 1 - FNR(M)
Specificity(M) = 1 - FPR(M)
```

2. Compute 95% confidence intervals via exact binomial (Clopper-Pearson) method:
   - For small N per category (N ≈ 30), exact binomial CIs are more reliable than asymptotic CIs

3. Report: FPR ± 95% CI, FNR ± 95% CI, Sensitivity ± 95% CI, Specificity ± 95% CI

### Step 2: Compute CEB Error Rates

1. Apply CEB decision rule to all calibration subjects
2. Compute:
```
CEB_FPR = count(CEB(s) = "conscious" for s in Unconscious) / |Unconscious|
CEB_FNR = count(CEB(s) = "not conscious" for s in Conscious) / |Conscious|
CEB_Indeterminate_Conscious = count(CEB(s) = "indeterminate" for s in Conscious) / |Conscious|
CEB_Indeterminate_Unconscious = count(CEB(s) = "indeterminate" for s in Unconscious) / |Unconscious|
```

3. Report all four rates with 95% CIs

### Step 3: Borderline Case Error Analysis

Apply calibrated metrics to Medium-confidence cases (GT-03, GT-04, GT-08):

1. For GT-03 (REM, labeled Conscious): FN if classified as "not conscious"
2. For GT-04 (N2, labeled Borderline): report classification without judging correctness
3. For GT-08 (MCS, labeled Conscious): FN if classified as "not conscious"; this is a **critical failure** as it indicates the metric may miss minimally conscious patients

Report the distribution of metric values for borderline cases relative to the threshold.

### Step 4: Cross-Substrate Error Rates

From the cross-substrate validation (Category A systems from `cross-substrate-protocol.md`):

```
Cross_FPR = count(CEB(s) = "conscious" for s in Category_A) / |Category_A|
```

**Acceptance criterion: Cross_FPR = 0** (no Category A system should classify as conscious).

Any nonzero Cross_FPR is a critical failure requiring investigation.

### Step 5: Error Correlation Analysis

Determine whether metric errors are independent or correlated:

1. For each calibration subject, record each metric's binary classification (correct/incorrect)
2. Compute pairwise correlation of errors:
   - Pearson correlation between error indicators for (PCI-G, Ψ-G), (PCI-G, CDI), (Ψ-G, CDI)
3. Report:
   - If correlations < 0.20: errors are approximately independent → CEB FPR/FNR estimates using independence assumption are valid
   - If correlations > 0.50: errors are substantially correlated → CEB provides less diversification than expected; investigate shared failure modes

---

## Summary Error Budget

| Classifier | FPR (expected) | FNR (expected) | Notes |
|------------|----------------|----------------|-------|
| PCI-G alone | ≤ 0.10 | ≤ 0.15 | Vulnerable to random complexity |
| Ψ-G alone | ≤ 0.10 | ≤ 0.20 | Higher FNR due to MIP approximation |
| CDI alone | ≤ 0.10 | ≤ 0.15 | Vulnerable to confounded causation |
| **CEB (combined)** | **≤ 0.03** | **0.07 – 0.20** | FNR range reflects unknown error correlations |
| CEB cross-substrate | **0** | Unknown | Category A must all be TN; Category B pending theory from 0.1.1.2 |

---

## Error Reporting Template

Every measurement report (see `reproducibility-spec.md` output format) must include the following error-related fields:

```json
{
  "error_analysis": {
    "calibration_version": "semver of calibration dataset used",
    "thresholds": {
      "theta_PCI": "float",
      "theta_Psi": "float",
      "theta_CDI": "float"
    },
    "per_metric": {
      "PCI_G": {
        "above_threshold": "bool",
        "distance_to_threshold": "float (signed: positive = above)",
        "confidence_interval_crosses_threshold": "bool"
      },
      "Psi_G": { "...same fields..." },
      "CDI": { "...same fields..." }
    },
    "CEB": {
      "classification": "conscious | indeterminate | not conscious",
      "vote_count": "int",
      "classification_confidence": "high | medium | low"
    },
    "classification_confidence_rules": {
      "high": "All metric CIs are entirely on one side of their thresholds",
      "medium": "At least one metric CI crosses its threshold but CEB vote is 0 or 3",
      "low": "CEB vote is 1 or 2 AND at least one metric CI crosses its threshold"
    },
    "caveats": ["list of applicable error sources from this document"]
  }
}
```

---

## Limitations and Open Questions

1. **No ground-truth oracle.** All error rates are relative to best-available consensus labels. If the labels are wrong (e.g., some VS/UWS patients are actually conscious), the "true" error rates differ.

2. **Calibration-dependence.** Error rates are valid only for systems resembling the calibration population. Extrapolation to novel substrates carries unquantified risk.

3. **Theory-dependence.** If the computational theory from 0.1.1.2 is revised, metric definitions change, and all error characterization must be repeated.

4. **Temporal stability.** Error rates are estimated from single-session measurements. Within-subject variability across sessions, circadian cycles, and cognitive states is not captured.

5. **Adversarial vulnerability.** A system designed to score above threshold (gaming the metrics) would be a false positive that this analysis cannot detect. Mitigation requires theory-derived structural criteria beyond the three metrics.

6. **Indeterminate zone.** The CEB "indeterminate" category is not an error but represents genuine measurement uncertainty. High indeterminate rates for a system class indicate the metrics are at their discrimination limit.

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial error analysis framework |
