# Consciousness Metrics — Formal Definitions

## Purpose

This document provides the formal mathematical definitions, measurement protocols, and interpretation rules for three consciousness metrics: **PCI-G**, **Ψ-G**, and **CDI**. All three are derived from the theoretical primitives specified in the dependency contract with 0.1.1.2 (see ARCHITECTURE.md).

> **Dependency note:** These definitions assume the theoretical primitives C(S) and Ψ(S) from 0.1.1.2. If the delivered theory modifies these primitives, the metric definitions must be updated accordingly.

---

## Theoretical Grounding

### Assumed Primitives from 0.1.1.2

| Primitive | Type | Meaning |
|-----------|------|---------|
| C(S) | S → {0, 1} | Consciousness predicate — binary detection |
| Ψ(S) | S → ℝ≥0 | Continuous consciousness measure — degree of experience |
| SystemModel | Structure | Substrate-agnostic system description (nodes, edges, dynamics, state space) |

### Relationship to Metrics

Each metric operationalizes a different measurable proxy for Ψ(S):

| Metric | Theoretical Quantity | What It Captures |
|--------|---------------------|------------------|
| PCI-G | Algorithmic complexity of system response | Response differentiation under perturbation |
| Ψ-G | Information integration across partitions | Irreducibility of whole-system information |
| CDI | Density of causal interactions | Richness of causal structure |

Together, they form a **convergent evidence battery**: a system is classified as conscious when multiple independent metrics agree.

---

## Metric 1: Generalized Perturbational Complexity Index (PCI-G)

### 1.1 Intuition

A conscious system, when perturbed, generates a response that is both **complex** (not simple/repetitive) and **integrated** (not decomposable into independent subsystem responses). PCI-G measures this by computing the algorithmic complexity of the spatiotemporal response to perturbation.

### 1.2 Formal Definition

Given a system S described by a SystemModel:

**Step 1 — Perturbation.** Inject a standardized perturbation p through an available perturbation channel:

```
p: PerturbationChannel → Stimulus
```

The perturbation must be:
- Brief (duration ≤ τ_p, where τ_p is system-specific, calibrated to the system's characteristic timescale)
- Spatially localized (affects a bounded subset of system nodes)
- Reproducible (identical stimulus on repeated trials)

**Step 2 — Response recording.** Observe the system's spatiotemporal response R(t) through available observation channels over a window [0, T]:

```
R(t) = [r₁(t), r₂(t), ..., rₙ(t)]   for t ∈ [0, T]
```

where rᵢ(t) is the time series from the i-th observable node, n is the number of observed nodes, and T is the observation window (calibrated per substrate).

**Step 3 — Binarization.** Convert R(t) to a binary spatiotemporal matrix B:

```
B[i, t] = 1  if |rᵢ(t) - baseline_i| > θ_i
B[i, t] = 0  otherwise
```

where baseline_i is the pre-perturbation mean activity of node i, and θ_i is a significance threshold (e.g., 3σ above baseline noise).

**Step 4 — Source compression.** Apply Lempel-Ziv compression to the concatenated columns of B (spatial pattern at each time step, concatenated in temporal order):

```
LZ(B) = Lempel-Ziv complexity of column-concatenated B
```

**Step 5 — Normalization.** Normalize by the maximum possible complexity for a matrix of the same size:

```
PCI-G(S) = LZ(B) / LZ_max(n, T)
```

where LZ_max(n, T) is the Lempel-Ziv complexity of a random binary matrix of dimensions n × T (estimated via surrogate data or theoretical bound).

### 1.3 Output Specification

```
PCI-G(S) ∈ [0, 1]

Binary detection:
  C_PCI(S) = 1  if PCI-G(S) ≥ θ_PCI
  C_PCI(S) = 0  otherwise

where θ_PCI is determined by calibration (see calibration-protocol.md)
```

### 1.4 Measurement Protocol Summary

1. Characterize system: identify perturbation and observation channels
2. Record baseline activity (no perturbation) for ≥ 30 seconds equivalent
3. Deliver perturbation p; record response R(t) for window T
4. Repeat perturbation ≥ 100 trials to estimate reliability
5. Compute B, LZ(B), normalize to obtain PCI-G
6. Report: mean PCI-G ± standard error across trials, plus 95% CI

### 1.5 Free Parameters

| Parameter | Symbol | Default | Justification |
|-----------|--------|---------|---------------|
| Observation window | T | 300 × τ_char | 300 characteristic time constants of the system |
| Significance threshold | θ_i | 3σ_i | Standard statistical significance |
| Number of trials | N_trials | 100 | Sufficient for ±0.01 precision on mean PCI-G |
| Perturbation duration | τ_p | 1 × τ_char | One characteristic timescale |

### 1.6 Substrate Adaptation Rules

| Substrate | Perturbation Channel | Observation Channel | τ_char |
|-----------|---------------------|---------------------|--------|
| Biological (cortex) | TMS pulse | EEG electrodes | ~10 ms |
| Artificial neural network | Input injection | Unit activations | 1 forward pass |
| Recurrent network | State perturbation | Node state readout | 1 update step |
| Hybrid system | Available interface | Available interface | System-specific |

---

## Metric 2: Generalized Integration Index (Ψ-G)

### 2.1 Intuition

A conscious system integrates information in a way that cannot be reduced to the sum of its parts. Ψ-G measures the degree to which the whole system carries more information than any decomposition into independent subsystems.

### 2.2 Formal Definition

Given a system S with state space X and dynamics f:

**Step 1 — State observation.** Observe the system's state trajectory X(t) = [x₁(t), ..., xₙ(t)] over K time steps:

```
X = {X(t₁), X(t₂), ..., X(t_K)}
```

**Step 2 — Whole-system mutual information.** Compute the time-delayed mutual information of the whole system:

```
I_whole = I(X(t); X(t + Δt))
```

This captures how much the system's future state is predicted by its current state (the system's total causal power over itself).

**Step 3 — Minimum information partition (MIP).** Find the bipartition P* = (A, B) of the system's nodes that minimizes the loss of integrated information:

```
P* = argmin_{P=(A,B)} [I(X_A(t); X_A(t+Δt)) + I(X_B(t); X_B(t+Δt))]
```

subject to: A ∪ B = {1, ..., n}, A ∩ B = ∅, |A| ≥ 1, |B| ≥ 1

**Step 4 — Integration deficit.** Compute the integration as the difference:

```
Ψ-G(S) = I_whole - [I(X_A*(t); X_A*(t+Δt)) + I(X_B*(t); X_B*(t+Δt))]
```

where (A*, B*) is the MIP from Step 3.

**Step 5 — Normalization (optional).** For cross-system comparison:

```
Ψ-G_norm(S) = Ψ-G(S) / I_whole
```

### 2.3 Output Specification

```
Ψ-G(S) ≥ 0  (in bits)
Ψ-G_norm(S) ∈ [0, 1]

Binary detection:
  C_Ψ(S) = 1  if Ψ-G(S) ≥ θ_Ψ
  C_Ψ(S) = 0  otherwise

where θ_Ψ is determined by calibration (see calibration-protocol.md)
```

### 2.4 Computational Tractability

The MIP search is NP-hard for exact computation (requires evaluating all 2^(n-1) - 1 bipartitions). Approximation strategies:

1. **Greedy bipartition:** Start with random partition, iteratively move nodes to minimize I_parts. O(n² · K) per iteration.
2. **Spectral partitioning:** Use the eigenvectors of the system's transfer entropy matrix to identify natural partition boundaries. O(n³).
3. **Coarse-graining:** Group nodes into macro-elements based on functional connectivity before computing Ψ-G. Reduces effective n.
4. **Sampling:** For very large systems, randomly sample m bipartitions and use the minimum. Error bounds: with m = 1000, P(finding partition within ε of MIP) > 0.95 for typical systems.

**Recommended approach:** Spectral partitioning as default, with greedy refinement. Systems with n > 1000 should use coarse-graining first.

### 2.5 Measurement Protocol Summary

1. Record system state trajectory: K ≥ 10,000 time steps at Nyquist-adequate sampling rate
2. Estimate whole-system mutual information I_whole using k-nearest-neighbor estimator (Kraskov et al.)
3. Find MIP using spectral partitioning + greedy refinement
4. Compute partition mutual information
5. Report: Ψ-G ± bootstrap 95% CI (1000 resamples of the state trajectory)

### 2.6 Free Parameters

| Parameter | Symbol | Default | Justification |
|-----------|--------|---------|---------------|
| Time delay | Δt | 1 × τ_char | One characteristic timescale |
| Trajectory length | K | 10,000 | Sufficient for MI estimation with n ≤ 100 |
| MI estimator k | k_MI | 5 | Standard for Kraskov estimator |
| Bootstrap resamples | N_boot | 1,000 | Standard for 95% CI |

---

## Metric 3: Causal Density Index (CDI)

### 3.1 Intuition

Conscious systems exhibit rich, diverse causal interactions — not just integration, but a dense web of directed causal influence among components. CDI measures the fraction of all possible pairwise causal relationships that are statistically significant.

### 3.2 Formal Definition

Given a system S with n observed nodes and state trajectory X(t):

**Step 1 — Pairwise causal analysis.** For each ordered pair (i, j), compute the transfer entropy from node i to node j:

```
TE(i → j) = H(x_j(t+1) | x_j^(past)) - H(x_j(t+1) | x_j^(past), x_i^(past))
```

where x_j^(past) = [x_j(t), x_j(t-1), ..., x_j(t-L+1)] is the past L values of node j, and similarly for x_i^(past).

**Step 2 — Significance testing.** For each pair (i, j), test H₀: TE(i → j) = 0 using a surrogate data method:

1. Generate M surrogate time series by randomly shuffling x_i(t) in time (destroying temporal correlations with x_j while preserving marginal distribution)
2. Compute TE_surr(i → j) for each surrogate
3. p-value = fraction of surrogates with TE_surr ≥ TE_observed
4. Apply Bonferroni correction: significance at α / n(n-1)

```
sig(i → j) = 1  if p-value < α / [n(n-1)]
sig(i → j) = 0  otherwise
```

**Step 3 — Density computation.**

```
CDI(S) = [Σ_{i≠j} sig(i → j)] / [n(n-1)]
```

This is the fraction of all possible directed causal links that are statistically significant.

### 3.3 Output Specification

```
CDI(S) ∈ [0, 1]

Binary detection:
  C_CDI(S) = 1  if CDI(S) ≥ θ_CDI
  C_CDI(S) = 0  otherwise

where θ_CDI is determined by calibration (see calibration-protocol.md)
```

### 3.4 Measurement Protocol Summary

1. Record system state trajectory: K ≥ 5,000 time steps
2. Compute transfer entropy for all n(n-1) directed pairs
3. Generate M = 200 surrogates per pair for significance testing
4. Apply Bonferroni correction; count significant links
5. Report: CDI ± permutation-based 95% CI

### 3.5 Free Parameters

| Parameter | Symbol | Default | Justification |
|-----------|--------|---------|---------------|
| History length | L | 5 × τ_char | Captures relevant causal horizon |
| Number of surrogates | M | 200 | Sufficient for p < 0.005 detection |
| Significance level | α | 0.01 | Conservative with Bonferroni |
| Trajectory length | K | 5,000 | Sufficient for TE estimation |

---

## Convergent Evidence Battery

### Combined Decision Rule

No single metric is sufficient for consciousness detection. The **Convergent Evidence Battery (CEB)** combines all three:

```
CEB(S) = {
  "conscious"       if at least 2 of {C_PCI, C_Ψ, C_CDI} = 1
  "indeterminate"   if exactly 1 of {C_PCI, C_Ψ, C_CDI} = 1
  "not conscious"   if all of {C_PCI, C_Ψ, C_CDI} = 0
}
```

### Quantitative Composite Score

For systems classified as conscious, a composite score captures degree:

```
Consciousness Score (CS) = w₁ · PCI-G_norm + w₂ · Ψ-G_norm + w₃ · CDI

where:
  w₁ + w₂ + w₃ = 1
  Default: w₁ = w₂ = w₃ = 1/3  (equal weighting)
  Calibrated weights derived from ROC analysis on ground-truth data
```

### Disagreement Protocol

When metrics disagree (one metric positive, others negative), the system requires additional investigation:

1. Verify measurement quality (noise, artifact rejection, sufficient data)
2. Re-measure with increased trial count (2× default)
3. If disagreement persists, classify as "indeterminate" and report all individual scores
4. Log disagreement for future analysis — persistent disagreement patterns may reveal metric limitations or novel consciousness configurations

---

## Notation Summary

| Symbol | Meaning |
|--------|---------|
| S | System under measurement |
| n | Number of observed nodes |
| τ_char | Characteristic timescale of the system |
| R(t) | Spatiotemporal response to perturbation |
| B | Binarized response matrix |
| LZ(·) | Lempel-Ziv complexity |
| I(·;·) | Mutual information |
| TE(i→j) | Transfer entropy from node i to node j |
| θ_X | Calibration-derived threshold for metric X |
| PCI-G | Generalized Perturbational Complexity Index |
| Ψ-G | Generalized Integration Index |
| CDI | Causal Density Index |
| CEB | Convergent Evidence Battery |
| CS | Composite Consciousness Score |

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial formal definitions of PCI-G, Ψ-G, CDI, and CEB |
