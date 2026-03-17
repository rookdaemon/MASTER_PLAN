# Consciousness Metrics — Architecture

## Overview

This document defines the architecture for operationalizing consciousness metrics (F1.4). The goal is a measurement framework that can detect and quantify subjective experience in any substrate — biological, computational, or hybrid.

## Core Design Principle

All metrics must be **theory-derived** from the computational theory of consciousness (0.1.1.2). This ensures generalization across substrates rather than overfitting to biological neural signals.

## Dependency Contract with 0.1.1.2

This architecture assumes 0.1.1.2 will deliver:

1. **Consciousness predicate C(S)** — a formal function that maps a system description S to {0, 1} (conscious or not)
2. **Continuous measure Ψ(S)** — a scalar or vector quantity reflecting the degree/type of experience (derived from or related to Φ, information integration, or successor measure)
3. **Substrate-agnostic formalism** — defined over computational/informational properties, not bio-specific signals

If 0.1.1.2 delivers different primitives, the metric definitions below must be adapted accordingly.

---

## Metric Framework

### Layer 1: Abstract Metric Interface

Every consciousness metric must implement the following contract:

```
MetricDefinition:
  name: string                          # Unique identifier (e.g., "GCI-1", "PCI-G")
  version: semver                       # Metric version
  theory_grounding: reference           # Which theoretical quantity it operationalizes

  input_specification:
    system_description: SystemModel     # Formal description of the target system
    perturbation_protocol: Protocol     # How to probe the system (if perturbational)
    observation_window: TimeSpec        # Duration and sampling requirements

  output_specification:
    binary_detection: bool              # Does the system have experience? (yes/no)
    quantitative_score: float | vector  # Degree/type of experience
    confidence_interval: [float, float] # Uncertainty bounds

  measurement_protocol:
    steps: Step[]                       # Ordered measurement procedure
    equipment: Equipment[]              # Required measurement apparatus
    calibration: CalibrationSpec        # How to calibrate before measurement

  error_characterization:
    false_positive_rate: float          # P(metric says conscious | actually not)
    false_negative_rate: float          # P(metric says not conscious | actually is)
    calibration_dataset: reference      # Ground-truth data used for characterization
```

### Layer 2: SystemModel (Substrate-Agnostic)

The system under measurement is described abstractly:

```
SystemModel:
  # Structural description
  nodes: Set[Node]                      # Processing elements
  edges: Set[Edge]                      # Connections between elements
  dynamics: TransitionFunction          # State evolution rules

  # Informational description
  state_space: StateSpace               # Set of possible states
  information_capacity: float           # Channel capacity / entropy bounds
  integration_topology: Graph           # How information is integrated

  # Interface
  perturbation_channels: Channel[]      # How to inject perturbations
  observation_channels: Channel[]       # How to read responses
```

This abstraction allows the same metric to be applied to:
- Biological neural networks (nodes = neurons, edges = synapses)
- Artificial neural networks (nodes = units, edges = weights)
- Hybrid systems (mixed node types)
- Arbitrary computational substrates

### Layer 3: Candidate Metrics

Three metrics will be developed, each operationalizing a different aspect of 0.1.1.2's theory:

#### Metric 1: Generalized Perturbational Complexity Index (PCI-G)

**Operationalizes:** Response complexity to perturbation (extends Casali et al. 2013 beyond TMS-EEG)

- **Protocol:** Apply a standardized perturbation to the system via any available perturbation channel. Record the system's spatiotemporal response. Compute the Lempel-Ziv complexity of the response after source compression.
- **Substrate generalization:** Replace TMS with any perturbation protocol; replace EEG with any observation channel. The complexity computation is substrate-agnostic.
- **Output:** PCI-G ∈ [0, 1]. Threshold for consciousness detection derived from calibration.

#### Metric 2: Generalized Integration Index (Ψ-G)

**Operationalizes:** The theoretical continuous measure Ψ(S) from 0.1.1.2

- **Protocol:** Compute the information integration of the system by partitioning it and comparing whole-system information to the sum of parts. Uses the formalism from 0.1.1.2 directly.
- **Substrate generalization:** Defined over SystemModel, not over biological signals.
- **Output:** Ψ-G ≥ 0. Higher values indicate greater integration. Binary threshold derived from calibration.
- **Challenge:** Computational tractability — exact Φ-like measures are intractable for large systems. Architecture must include approximation strategies.

#### Metric 3: Causal Density Index (CDI)

**Operationalizes:** Richness of causal interactions within the system

- **Protocol:** Measure Granger causality (or transfer entropy) between all pairs of system components. Compute the density of significant causal relationships normalized by system size.
- **Substrate generalization:** Requires only time-series observations from system components.
- **Output:** CDI ∈ [0, 1]. Complements PCI-G and Ψ-G by capturing causal structure.

---

## Calibration Architecture

### Ground-Truth Calibration Dataset

Biological systems with known consciousness states:

| State | Expected | Source |
|-------|----------|--------|
| Healthy awake adult | Conscious | Self-report + behavioral |
| REM sleep (dreaming) | Conscious | Report upon awakening |
| Deep (N3) sleep | Unconscious | No report upon awakening |
| General anesthesia (propofol) | Unconscious | No report, no response |
| Minimally conscious state | Borderline | Clinical diagnosis |
| Vegetative state (unresponsive) | Unconscious* | Clinical diagnosis (*some exceptions) |
| Locked-in syndrome | Conscious | Communication via eye movement |
| Infant (neonatal) | Unknown/developing | No reliable ground truth |

### Calibration Protocol

1. Apply each metric to every ground-truth case
2. Compute ROC curve for binary detection
3. Determine optimal threshold maximizing sensitivity + specificity
4. Report AUC, sensitivity, specificity, and 95% CI

### Cross-Substrate Validation

After biological calibration, apply metrics to:
1. A simple artificial system expected to be unconscious (e.g., lookup table, feed-forward network)
2. A system predicted by 0.1.1.2's theory to be conscious (if any exist)
3. Verify that metric scores are consistent with theoretical predictions

---

## Reproducibility Protocol

### Independent Replication Specification

Each metric must include:

1. **Input specification** — Exact description of what data to collect and how
2. **Algorithm specification** — Pseudocode or reference implementation for computing the metric
3. **Parameter specification** — All free parameters, their values, and justification
4. **Expected output** — Reference values for calibration dataset with tolerances
5. **Replication checklist** — Step-by-step procedure any lab can follow

### Reference Implementation

A computational reference implementation will be provided as pseudocode (not production code) defining:
- Data preprocessing pipeline
- Core metric computation algorithm
- Statistical testing procedures
- Result reporting format

---

## Deliverables

| Document | Purpose |
|----------|---------|
| `docs/consciousness-metrics/ARCHITECTURE.md` | This document — overall design |
| `docs/consciousness-metrics/metric-definitions.md` | Formal mathematical definitions of PCI-G, Ψ-G, and CDI |
| `docs/consciousness-metrics/calibration-protocol.md` | Detailed biological calibration procedure and expected results |
| `docs/consciousness-metrics/cross-substrate-protocol.md` | How to apply metrics to non-biological systems |
| `docs/consciousness-metrics/reproducibility-spec.md` | Independent replication procedure |
| `docs/consciousness-metrics/error-analysis.md` | False positive/negative characterization framework |

---

## Acceptance Criteria Traceability

| Acceptance Criterion | Addressed By |
|----------------------|-------------|
| At least one metric formally defined with measurement protocol | `metric-definitions.md` — three metrics defined |
| Validated against known conscious/unconscious biological states | `calibration-protocol.md` |
| Generalizes to non-biological substrates | `cross-substrate-protocol.md` + SystemModel abstraction |
| Reproducible across independent labs/systems | `reproducibility-spec.md` |
| Sensitivity and specificity characterized | `error-analysis.md` |
