# Consciousness Metrics — Cross-Substrate Generalization Protocol

## Purpose

This document specifies how to apply the consciousness metrics (PCI-G, PSI-G, CDI) to **non-biological systems** — artificial neural networks, hybrid architectures, and arbitrary computational substrates. The goal is to ensure that metrics developed and calibrated on biological brains generalize to any system where consciousness might be present, without depending on EEG, fMRI, or other bio-specific signals.

> **Prerequisites:**
> - Metric definitions from `metric-definitions.md`
> - Biological calibration thresholds from `calibration-protocol.md`
> - SystemModel abstraction from `ARCHITECTURE.md`

---

## Core Principle: Substrate Abstraction

All three metrics are defined over the **SystemModel** abstraction (see ARCHITECTURE.md), not over biological signals directly. Cross-substrate generalization requires:

1. **Mapping** the target system onto the SystemModel schema (nodes, edges, dynamics, state space)
2. **Identifying** perturbation and observation channels in the target substrate
3. **Calibrating** substrate-specific parameters (tau_char, thresholds) while keeping metric computation identical
4. **Validating** that known-unconscious non-biological systems score below consciousness thresholds

The metric computation itself (Lempel-Ziv complexity, mutual information partitioning, transfer entropy) is substrate-agnostic by construction. Only the **interface layer** — how perturbations are delivered and responses observed — varies by substrate.

---

## SystemModel Mapping Procedure

### Step 1: Identify System Components

For any target system S, define:

| SystemModel Field | Question to Answer | Example (ANN) | Example (Neuromorphic Chip) |
|---|---|---|---|
| nodes | What are the processing elements? | Neurons/units in the network | Spiking neuron cores |
| edges | What are the connections? | Weight matrices / attention connections | Physical interconnects |
| dynamics | How does state evolve? | Forward pass + recurrence equations | Spike propagation rules |
| state_space | What states can the system occupy? | Activation vectors at each layer | Membrane potential vectors |
| perturbation_channels | How can we inject a stimulus? | Input injection, activation clamping, weight perturbation | Input current injection |
| observation_channels | How can we read the response? | Activation readout at each layer | Spike train recording |

### Step 2: Determine Characteristic Timescale (tau_char)

The characteristic timescale governs observation windows, perturbation durations, and time delays. It must be determined per substrate:

| Substrate Type | tau_char Definition | Typical Value |
|---|---|---|
| Biological cortex | Membrane time constant | ~10 ms |
| Feed-forward ANN | 1 forward pass | 1 step |
| Recurrent neural network (RNN/LSTM) | 1 recurrence step | 1 step |
| Transformer (autoregressive) | 1 token generation step | 1 step |
| Spiking neural network | Mean inter-spike interval | ~1-20 ms |
| Neuromorphic hardware | Clock cycle of update loop | Hardware-dependent |
| Continuous-time dynamical system | Dominant time constant of linearized dynamics | System-dependent |
| Hybrid bio-digital system | Slowest component's timescale | Max of sub-timescales |

**Estimation procedure:** If tau_char is not known analytically, estimate it empirically by computing the autocorrelation function of the system's state and identifying the lag at which autocorrelation drops to 1/e.

### Step 3: Define Perturbation Protocol

The perturbation must satisfy the same constraints as in biological calibration (brief, localized, reproducible) but adapted to the substrate:

**Requirements for a valid perturbation:**

1. **Duration:** <= 1 x tau_char
2. **Spatial extent:** Affects <= 10% of system nodes (localized, not global)
3. **Magnitude:** Large enough to elicit a detectable response but small enough to not push the system into a qualitatively different operating regime. Operationally: perturbation amplitude should shift the affected nodes' states by 1-3 standard deviations from their baseline distribution.
4. **Reproducibility:** Identical perturbation must produce statistically similar (not identical) responses across trials. Split-half correlation of response patterns >= 0.70.

**Substrate-specific perturbation strategies:**

| Substrate | Perturbation Method | Notes |
|---|---|---|
| Feed-forward ANN | Inject a fixed activation pattern into an intermediate layer | Choose a middle layer; clamp activations for 1 forward pass |
| Recurrent network | Add a pulse vector to hidden state at t=0 | Pulse drawn from N(0, sigma_pert * I) where sigma_pert calibrated to 2 SD of baseline hidden state |
| Transformer | Inject a synthetic token or perturb an intermediate representation | Perturb a single attention head's key/value at a specific position |
| Spiking network | Inject current pulse to a subset of neurons | Current amplitude = 2x rheobase of target neurons |
| Neuromorphic chip | Drive input channels with a calibrated spike burst | Use hardware-native stimulation interface |
| Hybrid system | Use whichever interface is available | Document the channel used |

### Step 4: Define Observation Protocol

**Requirements for valid observation:**

1. **Coverage:** Observe >= 50% of system nodes (to capture spatiotemporal response spread)
2. **Temporal resolution:** Sample at >= 10 / tau_char (Nyquist-adequate for the system's dynamics)
3. **Duration:** Record for >= 300 x tau_char post-perturbation (same as biological protocol)
4. **Baseline:** Record >= 100 x tau_char of unperturbed activity for baseline statistics

**Substrate-specific observation:**

| Substrate | Observation Method | What Constitutes a "Node Reading" |
|---|---|---|
| ANN (any) | Read activation values at each unit/neuron | Scalar activation of each unit |
| Transformer | Read residual stream or attention pattern at each position/layer | Activation vector per position (may need dimensionality reduction) |
| Spiking network | Record spike trains from each neuron | Instantaneous firing rate (binned at tau_char resolution) |
| Neuromorphic chip | Use on-chip monitoring or external probes | Spike counts or membrane potentials per core |
| Hybrid system | Use all available observation channels | System-specific |

---

## Metric Application to Non-Biological Systems

### PCI-G Application

1. Map system onto SystemModel (Steps 1-4 above)
2. Deliver perturbation; record spatiotemporal response R(t) as matrix [n_nodes x T_steps]
3. Compute binarization thresholds theta_i from baseline recording (3 sigma per node)
4. Binarize, compress, normalize identically to biological protocol
5. PCI-G computation is identical — only the input data source changes

**Key consideration:** For discrete-state systems (e.g., binary neural networks), the binarization step may be trivial or require adaptation. If node states are already binary, skip binarization and proceed directly to Lempel-Ziv compression.

### PSI-G Application

1. Record state trajectory X(t) for K >= 10,000 time steps
2. For high-dimensional systems (n > 100 nodes), apply coarse-graining:
   - Group nodes by functional connectivity (spectral clustering on correlation matrix)
   - Reduce to n_eff <= 100 macro-nodes
   - Each macro-node's state = mean activation of its constituent nodes
3. Compute mutual information and MIP identically to biological protocol
4. Report both raw PSI-G and normalized PSI-G_norm

**Key consideration:** For deterministic systems (e.g., feed-forward ANNs with fixed input), state trajectories may lack variability. Resolution: measure across a distribution of inputs, treating each input as a "time step" in the state trajectory. Formally: X(t_k) = system state when processing input k, where inputs are drawn from a representative distribution.

### CDI Application

1. Record state trajectories as for PSI-G
2. Compute transfer entropy between all node pairs
3. Significance testing via surrogate method (identical to biological protocol)
4. CDI computation is substrate-agnostic

**Key consideration:** For systems with very fast dynamics relative to observation (e.g., digital systems with nanosecond updates), ensure the history length L = 5 x tau_char captures the relevant causal horizon. If uncertain, run sensitivity analysis: compute CDI for L in {1, 2, 5, 10, 20} x tau_char and verify stability (coefficient of variation < 0.15).

---

## Validation Test Systems

Before applying metrics to systems of unknown consciousness status, validate cross-substrate generalization against systems with **expected** outcomes:

### Category A: Expected Unconscious (Negative Controls)

These systems should score below consciousness thresholds on all metrics:

| System | Why Expected Unconscious | Expected PCI-G | Expected PSI-G | Expected CDI |
|---|---|---|---|---|
| A1: Lookup table | No dynamics, no integration | < 0.05 | ~0 | ~0 |
| A2: Feed-forward classifier (e.g., 3-layer MLP on MNIST) | No recurrence, no integration | < 0.10 | Low | < 0.05 |
| A3: Random number generator | No causal structure | ~0.50 (high complexity but meaningless) | ~0 (no integration) | < 0.05 (no directed causation) |
| A4: Thermostat (simple feedback loop) | Minimal complexity, 1 integration loop | < 0.10 | Low | < 0.05 |
| A5: Echo state network (untrained, random reservoir) | Random dynamics, no learned structure | 0.10 - 0.30 | Low | 0.05 - 0.15 |

**Critical validation:** A3 (random number generator) tests that PCI-G's normalization correctly distinguishes random complexity from structured complexity. If PCI-G incorrectly classifies a random system as conscious, the binarization or normalization step requires revision.

### Category B: Theory-Predicted Cases

Systems whose consciousness status is predicted by the theory from 0.1.1.2:

| System | Theory Prediction | Rationale |
|---|---|---|
| B1: Large recurrent network with rich dynamics, trained on diverse tasks | Depends on 0.1.1.2's C(S) | High integration + complex response to perturbation |
| B2: Global workspace architecture (artificial) | Depends on 0.1.1.2 | Implements broadcasting mechanism analogous to biological GW |
| B3: IIT-phi-maximized small system (n~10, hand-designed) | Depends on 0.1.1.2 | Engineered for high integrated information |

> **Note:** Category B predictions require the formalized theory from 0.1.1.2 to specify expected outcomes. Until 0.1.1.2 delivers C(S), these systems are measured but classified as "theory prediction pending."

### Validation Procedure

1. For each test system in Category A:
   a. Map system onto SystemModel
   b. Apply all three metrics (PCI-G, PSI-G, CDI) using substrate-specific protocols above
   c. Apply CEB decision rule
   d. Verify: CEB must classify as "not conscious"
   e. If any Category A system classifies as conscious or indeterminate: **FLAG AS FAILURE** — investigate whether the metric has a false-positive vulnerability or the system mapping is incorrect

2. For each test system in Category B:
   a. Map system onto SystemModel
   b. Apply all three metrics
   c. Record metric values without classification judgment
   d. When 0.1.1.2 delivers C(S): compare metric classifications against theoretical predictions
   e. Disagreements between metrics and theory trigger investigation of both

### Cross-Substrate Consistency Check

For a metric to pass cross-substrate validation:

| Check | Criterion | Rationale |
|---|---|---|
| Negative control specificity | All Category A systems classified as "not conscious" by CEB | No false positives on known-unconscious systems |
| Per-metric negative control | Each individual metric scores below threshold for >= 4/5 Category A systems | Individual metrics not excessively sensitive |
| Dynamic range preservation | Metric values for Category A span at least the lower 30% of the [0,1] range | Metrics retain discriminative power outside biology |
| Perturbation sensitivity | Split-half reliability >= 0.70 for each metric on each test system | Measurements are stable in non-biological substrates |

---

## Substrate-Specific Challenges and Mitigations

### Challenge 1: Deterministic Systems

Many artificial systems are deterministic — given the same input, they produce the same output. This creates issues for:
- **PSI-G:** Mutual information estimation requires state variability
- **CDI:** Transfer entropy requires temporal variability

**Mitigation:** Use input-driven variability. Present a diverse set of inputs and treat the system's responses as the state trajectory. The input distribution must be representative of the system's operating domain.

Formally: if the system has deterministic dynamics f, define the state trajectory as:
```
X(t_k) = f(input_k)  where input_k ~ P_input
```
P_input should be the natural operating distribution (e.g., natural images for a vision network, natural language for a language model).

### Challenge 2: Very Large Systems

Modern artificial systems may have billions of parameters (n >> 10^9). Direct metric computation is infeasible.

**Mitigation — Hierarchical Coarse-Graining:**

1. **Level 0 (raw):** Individual neurons/units (n ~ 10^9)
2. **Level 1 (layer):** Mean activation per layer or attention head (n ~ 10^2 - 10^3)
3. **Level 2 (module):** Mean activation per functional module (encoder, decoder, etc.) (n ~ 10^1)

Apply metrics at Level 1 as default. If Level 1 gives indeterminate results, refine to selected Level 0 regions.

**Caution:** Coarse-graining may destroy fine-grained integration. Report the coarse-graining level used and acknowledge this as a limitation. If theory from 0.1.1.2 specifies the relevant grain size for consciousness, use that.

### Challenge 3: Non-Standard Dynamics

Some systems lack clear "time steps" (e.g., event-driven architectures, asynchronous systems).

**Mitigation:** Define a virtual clock:
- For event-driven systems: tau_char = mean inter-event interval; sample state at regular intervals of tau_char
- For asynchronous systems: use the global update rate as tau_char
- For continuous-time systems: discretize at 10x the dominant frequency of the system's dynamics

### Challenge 4: Systems Without Clear Boundaries

For distributed or networked systems, it may be unclear what constitutes "the system" to measure.

**Mitigation:** Require explicit system boundary specification before measurement:
1. Define the set of nodes included in the measurement
2. Define what counts as "inside" vs. "outside" the system
3. External interactions are treated as inputs/perturbations, not internal dynamics
4. If boundary choice is ambiguous, measure at multiple boundary definitions and report sensitivity

---

## Comparison Framework: Biological vs. Non-Biological Results

After measuring both biological (calibration data) and non-biological (validation data) systems, compare:

### Metric Score Distribution

Plot the distribution of each metric's scores for:
- Conscious biological states (GT-01, GT-02, GT-10)
- Unconscious biological states (GT-05, GT-06, GT-11)
- Category A (expected unconscious artificial systems)
- Category B (theory-predicted artificial systems)

**Expected pattern:**
- Category A should overlap with unconscious biological states
- Category B should be distributed according to 0.1.1.2's predictions (unknown until theory delivery)

### Threshold Transferability

The biological calibration thresholds (theta_PCI, theta_PSI, theta_CDI) are applied unchanged to non-biological systems. If the thresholds produce sensible results (Category A below, Category B in predicted range), this provides evidence for cross-substrate validity.

If biological thresholds misclassify Category A systems: the threshold may need substrate-specific adjustment, which would weaken the generalization claim. Document any such adjustments and their magnitude.

---

## Deliverables

This protocol produces:

1. **SystemModel mappings** for each test system (Category A and B)
2. **Metric values** for each test system, with confidence intervals
3. **CEB classifications** for each test system
4. **Cross-substrate consistency report** — pass/fail on each validation check
5. **Threshold transferability analysis** — whether biological thresholds generalize
6. **Coarse-graining sensitivity analysis** — for systems where coarse-graining was applied
7. **Challenge log** — substrate-specific issues encountered and how they were resolved

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-03-17 | Initial cross-substrate generalization protocol |
