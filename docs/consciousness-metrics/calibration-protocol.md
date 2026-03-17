# Consciousness Metrics — Biological Calibration Protocol

## Purpose

This document specifies the procedure for validating PCI-G, Ψ-G, and CDI against biological systems with known consciousness states. The goal is to establish calibration thresholds (θ_PCI, θ_Ψ, θ_CDI) and quantify each metric's sensitivity and specificity before applying them to non-biological substrates.

> **Prerequisite:** Metric definitions from `metric-definitions.md` must be finalized before calibration begins.

---

## Ground-Truth Calibration Dataset

### State Categories

Each calibration case is assigned a ground-truth consciousness label based on the strongest available evidence:

| ID | State | Label | Evidence Basis | N_min |
|----|-------|-------|----------------|-------|
| GT-01 | Healthy awake adult, eyes open | **Conscious** | Self-report + behavioral responsiveness | 30 |
| GT-02 | Healthy awake adult, eyes closed (resting) | **Conscious** | Self-report upon query | 30 |
| GT-03 | REM sleep (dreaming) | **Conscious** | Report upon awakening (dream recall) | 20 |
| GT-04 | NREM Stage 2 (light sleep) | **Borderline** | Occasional report upon awakening; variable | 20 |
| GT-05 | NREM Stage 3 (deep/slow-wave sleep) | **Unconscious** | No report upon awakening | 20 |
| GT-06 | General anesthesia — propofol (loss of responsiveness) | **Unconscious** | No behavioral response, no recall | 20 |
| GT-07 | General anesthesia — ketamine (dissociative) | **Borderline** | Sometimes reports experience (ketamine dreams) | 15 |
| GT-08 | Minimally conscious state (MCS) | **Conscious** | Reproducible but inconsistent behavioral evidence | 10 |
| GT-09 | Vegetative state / unresponsive wakefulness (VS/UWS) | **Unconscious*** | No behavioral evidence (*but ~15-20% may be misdiagnosed) | 10 |
| GT-10 | Locked-in syndrome | **Conscious** | Communication via eye movement or BCI | 5 |
| GT-11 | Brain death | **Unconscious** | No brainstem reflexes, no EEG activity | 5 |

**N_min** = minimum number of distinct subjects per category for adequate statistical power.

### Label Confidence

Each ground-truth label carries a confidence level:

| Confidence | Meaning | Categories |
|------------|---------|------------|
| **High** | Consensus agreement; strong behavioral + physiological evidence | GT-01, GT-02, GT-05, GT-06, GT-10, GT-11 |
| **Medium** | Probable but debated; some conflicting evidence | GT-03, GT-04, GT-08 |
| **Low** | Uncertain; significant misdiagnosis risk | GT-07, GT-09 |

Primary analysis uses only **High confidence** labels. Secondary analysis includes **Medium** labels. **Low confidence** cases are reported separately and excluded from threshold determination.

---

## Measurement Procedure

### Phase 1: Setup and Baseline

1. **System characterization.** For biological subjects:
   - Perturbation channel: Transcranial Magnetic Stimulation (TMS) targeting premotor cortex (Brodmann area 6)
   - Observation channel: High-density EEG (≥ 60 channels), sampling rate ≥ 1000 Hz
   - τ_char = 10 ms (cortical characteristic timescale)

2. **Baseline recording.** For each subject in each state:
   - Record ≥ 60 seconds of EEG without perturbation
   - Compute per-channel mean and standard deviation for binarization thresholds

3. **Subject state verification.** Before each measurement:
   - GT-01/02: Confirm wakefulness via verbal response + behavioral assessment
   - GT-03/04/05: Verify sleep stage via concurrent polysomnography (PSG) scoring (AASM criteria)
   - GT-06/07: Confirm anesthetic depth via BIS (Bispectral Index) monitoring or equivalent
   - GT-08/09: Confirm clinical diagnosis via Coma Recovery Scale — Revised (CRS-R), administered ≤ 24 hours before measurement
   - GT-10: Confirm locked-in status via communication assessment
   - GT-11: Confirm brain death per institutional neurological criteria

### Phase 2: Metric Measurement

For each subject in each verified state:

**PCI-G Protocol:**
1. Deliver TMS pulse (monophasic, ~0.3 ms, intensity = 90% resting motor threshold)
2. Record EEG response for T = 300 × 10 ms = 3 seconds post-stimulus
3. Reject trials with excessive artifact (amplitude > 200 µV in any channel within 10 ms of pulse)
4. Repeat for N_trials = 100 acceptable trials
5. Compute PCI-G per `metric-definitions.md` Section 1.2

**Ψ-G Protocol:**
1. Record continuous EEG for K = 10,000 time steps (at 1000 Hz = 10 seconds)
2. Downsample to n ≤ 60 channels (one per electrode, re-referenced to average)
3. Compute Ψ-G per `metric-definitions.md` Section 2.2
4. Repeat for 10 non-overlapping 10-second epochs; report mean ± SE

**CDI Protocol:**
1. Record continuous EEG for K = 5,000 time steps (5 seconds at 1000 Hz)
2. Compute transfer entropy for all channel pairs
3. Apply surrogate significance testing (M = 200 surrogates per pair)
4. Compute CDI per `metric-definitions.md` Section 3.2
5. Repeat for 10 non-overlapping epochs; report mean ± SE

### Phase 3: Quality Control

Each measurement session must pass the following checks before inclusion in calibration:

| Check | Criterion | Action if Failed |
|-------|-----------|------------------|
| Signal quality | ≤ 10% of channels with impedance > 20 kΩ | Reapply electrodes and re-measure |
| Artifact rate | ≤ 30% of PCI-G trials rejected | Adjust TMS coil position; re-measure |
| State stability | Subject remains in target state for entire recording | Exclude recording; re-measure after state stabilization |
| Stationarity | Augmented Dickey-Fuller test on each channel (p < 0.05) | Apply first-differencing before metric computation |
| Reproducibility | Split-half reliability ≥ 0.80 for PCI-G (odd vs. even trials) | Double trial count and re-measure |

---

## Threshold Determination

### ROC Analysis

For each metric M ∈ {PCI-G, Ψ-G, CDI}:

1. Pool all High-confidence measurements: Conscious = {GT-01, GT-02, GT-10}; Unconscious = {GT-05, GT-06, GT-11}
2. Compute ROC curve: sweep threshold θ from min(M) to max(M)
3. At each threshold, compute:
   - Sensitivity (true positive rate): TPR = P(M ≥ θ | Conscious)
   - Specificity (true negative rate): TNR = P(M < θ | Unconscious)
4. Determine optimal threshold θ* using Youden's J statistic: θ* = argmax_θ [TPR(θ) + TNR(θ) - 1]
5. Report:
   - AUC (Area Under the ROC Curve) ± DeLong 95% CI
   - Sensitivity at θ*
   - Specificity at θ*
   - Positive predictive value and negative predictive value (given prevalence assumptions)

### Acceptance Criteria for Calibration

A metric passes biological calibration if:

| Criterion | Minimum | Target |
|-----------|---------|--------|
| AUC | ≥ 0.85 | ≥ 0.95 |
| Sensitivity at θ* | ≥ 0.80 | ≥ 0.90 |
| Specificity at θ* | ≥ 0.80 | ≥ 0.90 |

Metrics failing the minimum criteria are flagged for revision. The CEB (Convergent Evidence Battery) is also evaluated as a combined classifier.

### Borderline Case Analysis

After threshold determination using High-confidence cases:

1. Apply calibrated thresholds to Medium-confidence cases (GT-03, GT-04, GT-08)
2. Report classification results — these serve as validation, not threshold adjustment
3. Expected outcomes:
   - GT-03 (REM): Should classify as conscious (validation of threshold)
   - GT-04 (N2 sleep): May classify as borderline — acceptable
   - GT-08 (MCS): Should classify as conscious or indeterminate (never as unconscious)
4. If GT-08 (MCS) classifies as unconscious, flag as potential false negative requiring threshold adjustment

### Low-Confidence Case Reporting

Cases GT-07 (ketamine) and GT-09 (VS/UWS) are measured and reported but NOT used for calibration:

- GT-07: Report metric values alongside clinical observations about subjective reports during ketamine anesthesia. Contributes to understanding metric behavior under dissociative states.
- GT-09: Report metric values alongside CRS-R scores. Any VS/UWS patient scoring above consciousness threshold on ≥ 2 metrics triggers clinical reassessment — this is a potential clinical application.

---

## Statistical Framework

### Sample Size Justification

For detecting AUC ≥ 0.85 with 95% CI width ≤ 0.10:
- Minimum per-group: 25 subjects (Hanley & McNeil formula)
- Target per-group: 30 subjects (accounts for attrition and data quality exclusions)

### Multiple Comparisons

Three metrics are evaluated; significance level adjusted via Bonferroni:
- Per-metric significance: α = 0.05 / 3 = 0.017
- CEB evaluated at α = 0.05 (pre-specified combined classifier, not a post-hoc comparison)

### Bootstrap Confidence Intervals

All reported metrics include 95% CIs estimated via:
1. Resample subjects with replacement (stratified by state category)
2. Recompute metric means and ROC statistics
3. 10,000 bootstrap iterations
4. Report percentile-based 95% CI

---

## Expected Metric Value Ranges

Based on biological PCI literature (Casali et al. 2013, Comolatti et al. 2019) and IIT-based measures:

| State | PCI-G (expected) | Ψ-G (expected) | CDI (expected) |
|-------|-------------------|-----------------|----------------|
| GT-01 (awake, eyes open) | 0.35 – 0.70 | High | 0.15 – 0.40 |
| GT-02 (awake, eyes closed) | 0.30 – 0.65 | High | 0.12 – 0.35 |
| GT-03 (REM sleep) | 0.25 – 0.55 | Medium-High | 0.10 – 0.30 |
| GT-04 (N2 sleep) | 0.15 – 0.35 | Medium | 0.05 – 0.20 |
| GT-05 (N3 sleep) | 0.05 – 0.20 | Low | 0.02 – 0.10 |
| GT-06 (propofol) | 0.05 – 0.15 | Low | 0.02 – 0.08 |
| GT-07 (ketamine) | 0.20 – 0.50 | Variable | 0.08 – 0.25 |
| GT-08 (MCS) | 0.20 – 0.50 | Medium | 0.08 – 0.25 |
| GT-09 (VS/UWS) | 0.05 – 0.25 | Low-Medium | 0.02 – 0.15 |
| GT-10 (locked-in) | 0.30 – 0.65 | High | 0.12 – 0.35 |
| GT-11 (brain death) | < 0.05 | ~0 | < 0.02 |

These ranges are predictions to be validated. Significant deviations indicate either metric issues or novel findings requiring investigation.

---

## Output Artifacts

The calibration procedure produces:

1. **Calibration dataset** — All metric values for all subjects and states, in machine-readable format (CSV/JSON)
2. **Threshold table** — Optimal thresholds θ_PCI, θ_Ψ, θ_CDI with confidence intervals
3. **ROC curves** — Per-metric and CEB combined, with AUC values
4. **Sensitivity/specificity report** — Per-metric and combined, at optimal thresholds
5. **Borderline case analysis** — Classification results for Medium and Low confidence cases
6. **Anomaly log** — Any unexpected results requiring investigation

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial biological calibration protocol |
