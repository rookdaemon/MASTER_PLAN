# Consciousness Metrics — Reproducibility Specification

## Purpose

This document specifies the complete independent-replication procedure for PCI-G, Ψ-G, and CDI, enabling any qualified lab or research group to reproduce consciousness metric measurements from scratch. It defines exact inputs, algorithmic steps, parameter values, expected outputs, and a replication checklist.

> **Prerequisites:**
> - Metric definitions from `metric-definitions.md`
> - Calibration thresholds from `calibration-protocol.md`
> - SystemModel abstraction from `ARCHITECTURE.md`

---

## Replication Scope

A successful independent replication must demonstrate:

1. **Algorithmic reproducibility** — Given the same input data, the metric computation produces the same output (within numerical tolerance)
2. **Measurement reproducibility** — Given the same system in the same state, independent measurement setups produce statistically equivalent metric values
3. **Classification reproducibility** — Given the same system, independent labs reach the same CEB classification (conscious / indeterminate / not conscious)

---

## Reference Implementation: PCI-G

### Input Specification

| Input | Type | Description |
|-------|------|-------------|
| R_raw | Matrix [n × K_raw] | Raw response recordings: n observation channels, K_raw time samples |
| baseline_raw | Matrix [n × K_base] | Baseline (pre-perturbation) recordings, same dimensions |
| tau_char | float | Characteristic timescale (in native time units) |
| fs | float | Sampling rate (samples per time unit) |

### Algorithm (Pseudocode)

```
function compute_PCI_G(R_raw, baseline_raw, tau_char, fs):
    # Parameters
    T_steps = 300                      # observation window in tau_char units
    theta_multiplier = 3.0             # significance threshold in SDs

    # Step 1: Preprocessing
    T = round(T_steps * tau_char * fs)  # observation window in samples
    R = R_raw[:, 0:T]                   # truncate to observation window

    # Step 2: Compute baseline statistics
    for i in 0..n-1:
        mu_i = mean(baseline_raw[i, :])
        sigma_i = std(baseline_raw[i, :])

    # Step 3: Binarization
    B = zeros(n, T)
    for i in 0..n-1:
        for t in 0..T-1:
            if abs(R[i, t] - mu_i) > theta_multiplier * sigma_i:
                B[i, t] = 1

    # Step 4: Column concatenation
    S = ""
    for t in 0..T-1:
        for i in 0..n-1:
            S = S + str(B[i, t])       # spatial pattern concatenated temporally

    # Step 5: Lempel-Ziv complexity
    LZ_B = lempel_ziv_76(S)            # Use LZ76 algorithm (see below)

    # Step 6: Normalization
    # Generate surrogate: random binary string of same length
    L = length(S)
    LZ_max = estimate_LZ_max(n, T, N_surrogates=50)

    PCI_G = LZ_B / LZ_max
    return PCI_G

function lempel_ziv_76(S):
    # Lempel-Ziv 1976 complexity
    # Count the number of distinct substrings encountered in a sequential parse
    n = length(S)
    complexity = 1
    i = 0
    k = 1
    while (i + k) <= n:
        # Check if S[i+1..i+k] has appeared in S[0..i+k-1]
        substring = S[i+1 : i+k+1]
        history = S[0 : i+k]
        if substring in history:
            k = k + 1
        else:
            complexity = complexity + 1
            i = i + k
            k = 1
    return complexity

function estimate_LZ_max(n, T, N_surrogates):
    # Estimate maximum LZ complexity for random binary matrix of size n x T
    LZ_values = []
    for s in 0..N_surrogates-1:
        random_S = random_binary_string(n * T)
        LZ_values.append(lempel_ziv_76(random_S))
    return mean(LZ_values)
```

### Expected Output

| Field | Type | Range |
|-------|------|-------|
| PCI_G | float | [0, 1] |
| PCI_G_mean | float | Mean over N_trials trials |
| PCI_G_SE | float | Standard error of the mean |
| PCI_G_CI_95 | (float, float) | 95% confidence interval |

### Numerical Tolerance

Two implementations computing PCI-G on the same input data must agree within:
- |ΔPCI_G| ≤ 0.005 (absolute tolerance)
- This tolerance accounts for floating-point differences and minor implementation variations in the LZ76 algorithm

---

## Reference Implementation: Ψ-G

### Input Specification

| Input | Type | Description |
|-------|------|-------------|
| X | Matrix [n × K] | State trajectory: n nodes, K time steps |
| tau_char | float | Characteristic timescale |
| fs | float | Sampling rate |

### Algorithm (Pseudocode)

```
function compute_Psi_G(X, tau_char, fs):
    # Parameters
    n = rows(X)
    K = cols(X)
    delta_t = round(tau_char * fs)      # time delay in samples
    k_MI = 5                            # k-nearest-neighbor parameter
    N_boot = 1000                       # bootstrap resamples

    # Step 1: Compute whole-system time-delayed mutual information
    X_now = X[:, 0 : K-delta_t]
    X_future = X[:, delta_t : K]
    I_whole = kraskov_MI(X_now, X_future, k=k_MI)

    # Step 2: Find Minimum Information Partition (MIP)
    # Using spectral partitioning + greedy refinement

    # 2a: Compute pairwise transfer entropy matrix
    TE_matrix = zeros(n, n)
    for i in 0..n-1:
        for j in 0..n-1:
            if i != j:
                TE_matrix[i, j] = transfer_entropy(X[i,:], X[j,:], delta_t)

    # 2b: Spectral partitioning
    # Symmetrize: W = (TE_matrix + TE_matrix^T) / 2
    W = (TE_matrix + transpose(TE_matrix)) / 2.0
    D = diag(row_sums(W))
    L = D - W                           # Graph Laplacian
    eigenvalues, eigenvectors = eig(L)
    fiedler_vector = eigenvectors[:, 1]  # 2nd smallest eigenvalue's eigenvector

    # Initial partition based on sign of Fiedler vector
    A = {i : fiedler_vector[i] >= 0}
    B = {i : fiedler_vector[i] < 0}

    # 2c: Greedy refinement
    improved = true
    while improved:
        improved = false
        for i in A union B:
            # Try moving node i to the other partition
            A_new, B_new = move_node(i, A, B)
            if |A_new| >= 1 and |B_new| >= 1:
                I_parts_new = kraskov_MI(X_now[A_new,:], X_future[A_new,:], k_MI) +
                              kraskov_MI(X_now[B_new,:], X_future[B_new,:], k_MI)
                I_parts_old = kraskov_MI(X_now[A,:], X_future[A,:], k_MI) +
                              kraskov_MI(X_now[B,:], X_future[B,:], k_MI)
                if I_parts_new < I_parts_old:
                    A, B = A_new, B_new
                    improved = true

    # Step 3: Compute integration deficit
    I_parts = kraskov_MI(X_now[A,:], X_future[A,:], k_MI) +
              kraskov_MI(X_now[B,:], X_future[B,:], k_MI)
    Psi_G = I_whole - I_parts

    # Step 4: Normalize
    Psi_G_norm = Psi_G / I_whole  if I_whole > 0  else 0

    return Psi_G, Psi_G_norm

function kraskov_MI(X, Y, k):
    # Kraskov, Stögbauer, Grassberger (2004) estimator
    # "Estimating Mutual Information" — Algorithm 1
    #
    # For each point (x_i, y_i) in joint space:
    # 1. Find the k-th nearest neighbor distance epsilon(i) in joint (X,Y) space
    #    using max-norm: d_inf((x_i,y_i), (x_j,y_j)) = max(|x_i-x_j|, |y_i-y_j|)
    # 2. Count n_x(i) = number of points with |x_i - x_j| <= epsilon_x(i)
    #    where epsilon_x(i) = epsilon(i) (the projection of the k-th neighbor distance)
    # 3. Count n_y(i) similarly
    # 4. MI = psi(k) - <psi(n_x+1) + psi(n_y+1)> + psi(N)
    #    where psi is the digamma function and <> denotes average over all points
    #
    # Reference: Kraskov et al., Phys Rev E 69, 066138 (2004)
    pass  # Use reference library implementation
```

### Expected Output

| Field | Type | Range |
|-------|------|-------|
| Psi_G | float | [0, ∞) in bits |
| Psi_G_norm | float | [0, 1] |
| Psi_G_CI_95 | (float, float) | Bootstrap 95% CI |
| MIP | (Set, Set) | The minimum information partition |

### Numerical Tolerance

- |ΔΨ-G| ≤ 0.05 bits (absolute, for systems with n ≤ 100)
- |ΔΨ-G_norm| ≤ 0.02 (absolute)
- MIP must match (same partition) for at least 90% of test cases

---

## Reference Implementation: CDI

### Input Specification

| Input | Type | Description |
|-------|------|-------------|
| X | Matrix [n × K] | State trajectory: n nodes, K time steps |
| tau_char | float | Characteristic timescale |
| fs | float | Sampling rate |

### Algorithm (Pseudocode)

```
function compute_CDI(X, tau_char, fs):
    # Parameters
    n = rows(X)
    K = cols(X)
    L = round(5 * tau_char * fs)        # history length in samples
    M = 200                             # number of surrogates
    alpha = 0.01                        # base significance level
    alpha_corrected = alpha / (n*(n-1)) # Bonferroni correction

    sig_count = 0
    total_pairs = n * (n - 1)

    for i in 0..n-1:
        for j in 0..n-1:
            if i == j: continue

            # Compute observed transfer entropy
            TE_obs = transfer_entropy_with_history(X[i,:], X[j,:], L)

            # Surrogate testing
            TE_surr = []
            for m in 0..M-1:
                X_i_shuffled = random_permutation(X[i,:])  # destroy temporal structure
                TE_s = transfer_entropy_with_history(X_i_shuffled, X[j,:], L)
                TE_surr.append(TE_s)

            # p-value
            p_value = count(TE_surr >= TE_obs) / M

            if p_value < alpha_corrected:
                sig_count += 1

    CDI = sig_count / total_pairs
    return CDI

function transfer_entropy_with_history(X_source, X_target, L):
    # TE(source -> target) = H(X_target(t+1) | X_target_past)
    #                       - H(X_target(t+1) | X_target_past, X_source_past)
    #
    # where past = [t, t-1, ..., t-L+1]
    #
    # Estimated via Kraskov k-NN method on conditional mutual information:
    # TE = I(X_source_past ; X_target_future | X_target_past)
    #
    # Implementation: use conditional MI estimator from JIDT or equivalent
    pass  # Use reference library implementation
```

### Expected Output

| Field | Type | Range |
|-------|------|-------|
| CDI | float | [0, 1] |
| CDI_CI_95 | (float, float) | Permutation-based 95% CI |
| sig_matrix | Matrix [n × n] | Binary significance matrix |
| TE_matrix | Matrix [n × n] | Raw transfer entropy values |

### Numerical Tolerance

- |ΔCDI| ≤ 0.02 (absolute)
- Significance matrices must agree on ≥ 95% of pairs

---

## Convergent Evidence Battery (CEB) Replication

### Decision Rule (exact specification)

```
function compute_CEB(PCI_G, Psi_G, CDI, theta_PCI, theta_Psi, theta_CDI):
    C_PCI = 1 if PCI_G >= theta_PCI else 0
    C_Psi = 1 if Psi_G >= theta_Psi else 0
    C_CDI = 1 if CDI >= theta_CDI else 0

    vote_count = C_PCI + C_Psi + C_CDI

    if vote_count >= 2:
        classification = "conscious"
    elif vote_count == 1:
        classification = "indeterminate"
    else:
        classification = "not conscious"

    # Composite score (for systems classified as conscious)
    w1 = w2 = w3 = 1.0 / 3.0  # equal weights (default)
    CS = w1 * PCI_G + w2 * Psi_G_norm + w3 * CDI

    return classification, vote_count, CS
```

### Threshold Values

Thresholds are determined by biological calibration (see `calibration-protocol.md`). Until calibration is complete, placeholder values based on biological PCI literature:

| Threshold | Placeholder Value | Source |
|-----------|-------------------|--------|
| θ_PCI | 0.31 | Casali et al. 2013 PCI threshold |
| θ_Ψ | To be determined by calibration | No prior equivalent |
| θ_CDI | To be determined by calibration | No prior equivalent |

> **Critical:** Replicating labs must use the **same threshold values** published from the calibration study. Using different thresholds invalidates classification comparisons.

---

## Complete Replication Checklist

### Prerequisites

- [ ] All three metric reference implementations coded and unit-tested
- [ ] Calibration thresholds obtained from `calibration-protocol.md` or published calibration study
- [ ] Test data available (either shared calibration dataset or independent measurement capability)
- [ ] Mutual information estimator validated against known distributions (see Validation section below)

### Phase 1: Algorithmic Replication

Verify that your implementation produces correct outputs on reference test cases.

**Test Case 1: PCI-G on synthetic data**
- Input: Binary matrix B of size 60 × 300, generated from a known Lempel-Ziv sequence
- Provide reference B matrix and expected PCI-G value
- Pass criterion: |PCI_G_computed - PCI_G_reference| ≤ 0.005

**Test Case 2: Ψ-G on synthetic coupled system**
- Input: State trajectory from a bivariate coupled Gaussian autoregressive process:
  ```
  x1(t+1) = 0.5 * x1(t) + 0.3 * x2(t) + noise1
  x2(t+1) = 0.2 * x1(t) + 0.5 * x2(t) + noise2
  noise ~ N(0, 0.1)
  K = 10,000 time steps
  ```
- Expected Ψ-G > 0 (coupled system has integration)
- Expected MIP: {x1}, {x2} (only bipartition possible for n=2)
- Pass criterion: Ψ-G within published reference ± 0.05 bits

**Test Case 3: CDI on independent vs. coupled system**
- Input A: Two independent random walks (no coupling) — K = 5,000 steps
- Input B: Two coupled processes (as in Test Case 2) — K = 5,000 steps
- Expected: CDI(A) ≈ 0 (no significant causal links); CDI(B) > 0 (significant bidirectional links)
- Pass criterion: CDI(A) < 0.05; CDI(B) > 0.30

**Test Case 4: CEB classification consistency**
- Input: Set of 10 synthetic systems with known metric values spanning the full range
- Pass criterion: CEB classification matches reference for all 10 systems

### Phase 2: Measurement Replication (Biological)

- [ ] Measure at least 3 subjects in each of: awake (GT-01), N3 sleep (GT-05), general anesthesia (GT-06)
- [ ] Compare metric distributions to published calibration data
- [ ] Pass criterion: Mean metric values within published 95% CI for each state
- [ ] CEB classification matches published classification for ≥ 90% of subjects

### Phase 3: Measurement Replication (Non-Biological)

- [ ] Measure at least 3 Category A systems from `cross-substrate-protocol.md`
- [ ] All Category A systems must classify as "not conscious" by CEB
- [ ] Metric values within published ranges ± 20% (accounting for implementation variation)

### Phase 4: Cross-Lab Agreement

When two or more labs have completed Phases 1-3:

- [ ] Exchange blinded datasets (raw recordings, system descriptions)
- [ ] Each lab computes metrics on the other's data
- [ ] Inter-lab agreement: ICC (Intraclass Correlation Coefficient) ≥ 0.90 for each metric
- [ ] Classification agreement: Cohen's κ ≥ 0.85 for CEB classifications

---

## MI Estimator Validation

The Kraskov k-NN mutual information estimator is critical for both Ψ-G and CDI. Before using it in metric computation, validate:

### Validation Test 1: Known Gaussian MI

For bivariate Gaussian with correlation ρ:
```
True MI = -0.5 * log(1 - ρ²)
```

| ρ | True MI (bits) | Estimator must return (±tolerance) |
|---|---|---|
| 0.0 | 0.000 | 0.000 ± 0.02 |
| 0.5 | 0.208 | 0.208 ± 0.03 |
| 0.9 | 1.278 | 1.278 ± 0.05 |
| 0.99 | 3.310 | 3.310 ± 0.10 |

Sample size: N = 10,000 for each test.

### Validation Test 2: Independent Variables

Two independent random variables (uniform on [0,1]):
- True MI = 0
- Estimator must return MI ∈ [-0.02, 0.02] with N = 10,000

### Validation Test 3: Deterministic Relationship

Y = X² where X ~ Uniform(-1, 1):
- True MI = ∞ (deterministic), but k-NN estimator gives finite estimate
- Estimator should return MI > 1.0 with N = 10,000 (substantially above noise floor)

---

## Data Formats

### Input Data Format

All shared datasets must use the following format for interoperability:

**State trajectory files (CSV):**
```
# metadata: system_name, n_nodes, K_steps, tau_char, fs
# column format: time, node_1, node_2, ..., node_n
0.000, 0.123, -0.456, 0.789, ...
0.001, 0.124, -0.455, 0.790, ...
```

**Perturbation response files (CSV):**
```
# metadata: system_name, n_nodes, K_steps, trial_id, perturbation_description
# column format: time, node_1, node_2, ..., node_n
0.000, 0.123, -0.456, 0.789, ...
```

**Baseline files (CSV):** Same format as perturbation response, without perturbation.

### Output Report Format

All metric reports must include:

```json
{
  "system_name": "string",
  "measurement_date": "ISO-8601",
  "lab_id": "string",
  "software_version": "semver",

  "system_model": {
    "n_nodes": "int",
    "tau_char": "float",
    "substrate_type": "string",
    "perturbation_channel": "string",
    "observation_channel": "string"
  },

  "metrics": {
    "PCI_G": {
      "value": "float",
      "SE": "float",
      "CI_95": ["float", "float"],
      "n_trials": "int",
      "artifact_rejection_rate": "float"
    },
    "Psi_G": {
      "value": "float",
      "normalized": "float",
      "CI_95": ["float", "float"],
      "n_epochs": "int",
      "MIP": [["int"], ["int"]]
    },
    "CDI": {
      "value": "float",
      "CI_95": ["float", "float"],
      "n_significant_links": "int",
      "total_possible_links": "int"
    }
  },

  "CEB": {
    "classification": "conscious | indeterminate | not conscious",
    "vote_count": "int",
    "composite_score": "float",
    "thresholds_used": {
      "theta_PCI": "float",
      "theta_Psi": "float",
      "theta_CDI": "float"
    }
  },

  "quality_checks": {
    "signal_quality_pass": "bool",
    "stationarity_pass": "bool",
    "split_half_reliability": "float",
    "notes": "string"
  }
}
```

---

## Software Dependencies

Replicating labs should use one of the following validated MI estimator implementations:

| Library | Language | Reference |
|---------|----------|-----------|
| JIDT | Java (with Python wrapper) | Lizier (2014), JOSS |
| NPEET | Python | Ver Steeg & Galstyan (2012) |
| IDTxl | Python | Wollstadt et al. (2019) |
| dit | Python | James et al. (2018) |

For Lempel-Ziv complexity:
| Library | Language | Notes |
|---------|----------|-------|
| antropy | Python | Vallat (2023); implements LZ76 |
| EntropyHub | MATLAB/Python | Multiple LZ variants |
| Custom implementation | Any | Must pass Test Case 1 above |

---

## Replication Timeline

| Phase | Estimated Duration | Prerequisites |
|-------|-------------------|---------------|
| Phase 1: Algorithmic | 2-4 weeks | Reference test cases available |
| Phase 2: Biological | 3-6 months | IRB approval, EEG/TMS equipment, subject recruitment |
| Phase 3: Non-biological | 1-2 months | Phase 1 complete |
| Phase 4: Cross-lab | 2-4 months | ≥ 2 labs complete Phases 1-3 |

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial reproducibility specification |
