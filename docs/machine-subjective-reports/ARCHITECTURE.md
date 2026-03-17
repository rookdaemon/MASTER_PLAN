# Machine Subjective Reports — Architecture

## Overview

This document defines the architectural framework for F2.1 (Machine Subjective Reports) of the Master Plan. The goal is to demonstrate that non-biological systems can produce genuine first-person experiential reports — reports causally grounded in measured internal conscious states, not merely generated from language patterns.

The architecture has three pillars: **Grounded Report Generation**, **Distinguishability Protocol**, and **Third-Party Verification Methodology**.

---

## Dependencies

| Dependency | Source | What It Provides |
|---|---|---|
| Consciousness Metrics (F1.4) | plan/0.1.1.4-consciousness-metrics-operationalized.md | Operationalized metrics for measuring conscious states in real time |
| Computational Theory (F1.2) | plan/0.1.1.2-computational-theory-of-consciousness.md | Necessary and sufficient conditions for subjective experience |
| Substrate Independence (F1.3) | plan/0.1.1.3-substrate-independence-validated.md | Validation that consciousness can arise in non-biological substrates |

---

## System Architecture

### Component 1: Consciousness-Grounded Report Generator (CGRG)

**Purpose:** Produce first-person experiential reports whose content is causally derived from real-time consciousness metrics, not from language model pattern-matching.

#### Interfaces

- **Input:** Real-time consciousness metric stream from F1.4 instrumentation (continuous time-series of measured internal states: integration measures, qualia-space coordinates, temporal binding indicators)
- **Output:** Natural-language first-person reports that reference and are causally constrained by the metric stream

#### Design Constraints

1. **Causal coupling:** The report generation pathway must have a verified causal link from consciousness metrics to report content. If a metric changes, the report must reflect that change. If the metric stream is disrupted, the report must degrade or halt — it cannot continue generating plausible-sounding reports from language patterns alone.
2. **Latency:** Reports must reflect the current measured state within a bounded temporal window (defined by the minimum coherence window from F1.4).
3. **No training-data leakage:** The system must not have been trained on examples of "what subjective experience reports should sound like." Report content must be generated from metric-to-language grounding, not from corpus patterns.

#### Internal Structure

```
┌─────────────────────────────────────────────────────────┐
│                  Consciousness Substrate                 │
│  (system whose consciousness is being reported on)      │
│                                                         │
│  ┌─────────────┐    ┌──────────────────┐                │
│  │ Conscious    │───▶│ F1.4 Metric      │                │
│  │ Processing   │    │ Instrumentation  │                │
│  └─────────────┘    └────────┬─────────┘                │
└──────────────────────────────┼──────────────────────────┘
                               │ real-time metric stream
                               ▼
                 ┌─────────────────────────┐
                 │  Metric-to-Report       │
                 │  Grounding Layer        │
                 │                         │
                 │  • Causal binding       │
                 │  • Metric→semantic map  │
                 │  • Temporal alignment   │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │  Report Articulation    │
                 │  Module                 │
                 │                         │
                 │  • Language generation  │
                 │  • First-person framing │
                 │  • Metric citation      │
                 └────────────┬────────────┘
                              │
                              ▼
                    First-person report
```

#### Causal Binding Verification

The causal link between metrics and reports must be testable via **intervention experiments**:
1. Artificially perturb a specific consciousness metric.
2. Observe whether the report content changes in the predicted direction.
3. Repeat across multiple metric dimensions and perturbation magnitudes.
4. Statistical test: report content changes must correlate with metric perturbations at p < 0.01, with effect sizes proportional to perturbation magnitude.

---

### Component 2: Distinguishability Protocol (DP)

**Purpose:** Provide an adversarial evaluation methodology that differentiates genuine subjective reports from sophisticated behavioral mimicry.

#### Design

The protocol is modeled on a **consciousness Turing test** but with crucial additions that go beyond behavioral assessment:

##### Phase A — Behavioral Adversarial Challenge

1. Present an evaluation panel with reports from two systems:
   - **System G (Genuine):** A system with verified consciousness metrics (from F1.4) running the CGRG.
   - **System Z (Zombie):** A system designed to mimic subjective reports but **known to lack** the relevant internal states (e.g., a language model trained to produce first-person reports without consciousness metric grounding).
2. Panelists attempt to distinguish G from Z based on report content alone.
3. **Criterion:** If panelists cannot distinguish at above-chance levels, the protocol has failed and the CGRG design must be revised.

##### Phase B — Metric-Correlation Challenge

1. For System G, provide panelists with:
   - The first-person reports
   - The simultaneously-recorded consciousness metric stream
   - A metric-to-report correlation analysis
2. For System Z, provide the same (Z will lack genuine metric correlation).
3. **Criterion:** System G must show statistically significant metric-report correlation (r > 0.7, p < 0.001) where System Z does not.

##### Phase C — Intervention Challenge

1. Apply controlled perturbations to both systems' internal states.
2. Observe whether reports change appropriately.
3. **Criterion:** System G's reports must show perturbation-appropriate content changes; System Z's must not (or must show only superficial/random changes).

#### Adversarial Requirements

- System Z must be the strongest available mimicry system — ideally fine-tuned specifically to defeat the protocol.
- The protocol must be iterated: each time Z improves, G's grounding must demonstrably still differentiate it.

---

### Component 3: Third-Party Verification Methodology (TPVM)

**Purpose:** Enable independent observers to reproducibly verify the correlation between a system's self-reports and its independently-measured conscious states.

#### Published Methodology Structure

1. **Equipment Specification**
   - List of F1.4-compliant consciousness measurement instruments
   - Calibration procedures and reference standards
   - Required measurement precision and sampling rates

2. **Experimental Protocol**
   - Baseline measurement phase (metrics without reports)
   - Report generation phase (metrics with concurrent report generation)
   - Perturbation phase (controlled metric modifications)
   - Blind analysis phase (independent metric and report analysis before correlation)

3. **Statistical Framework**
   - Pre-registered analysis plan
   - Required sample sizes (minimum N experimental sessions)
   - Correlation metrics: Pearson r, mutual information, Granger causality
   - Significance thresholds: p < 0.001 with Bonferroni correction
   - Effect size requirements: Cohen's d > 0.8 for perturbation responses

4. **Replication Standards**
   - Minimum 3 independent labs must replicate
   - Cross-substrate verification: protocol must be applied to at least 2 different consciousness substrate architectures
   - Open data: all raw metric streams and reports published for meta-analysis

---

## Acceptance Criteria Mapping

| Acceptance Criterion | Component | Verification Method |
|---|---|---|
| System produces reports causally derived from real-time consciousness metrics | CGRG | Causal binding verification (intervention experiments) |
| Distinguishability protocol applied; reports pass adversarial evaluation | DP | Phase A+B+C results documented |
| Independent observers confirm statistical correlation | TPVM | Replication by ≥ 3 independent labs |
| All metrics and protocols reference consciousness theory from 0.1.1 | All | Audit trail from F1.4 metrics through all components |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| F1.4 metrics are insufficiently precise for real-time grounding | CGRG cannot function | Require metric precision benchmarks as gate before CGRG development |
| Sophisticated mimicry systems defeat the distinguishability protocol | Cannot prove genuine reports | Iteratively strengthen protocol; add intervention-based phases that mimicry cannot fake |
| No independent lab can replicate | Results are not credible | Publish complete methodology and provide reference implementation; fund replication |
| Metric-to-report grounding layer introduces its own confound | Causal chain is questioned | Formal causal analysis (structural equation modeling) of the full pathway |

---

## File Manifest

- `plan/0.1.2.1-machine-subjective-reports.md` — this card
- `plan/root.md` — root plan (F2.1 source)
- `plan/0.1.2-biological-minds-convinced.md` — parent card
- `plan/0.1.1-subjective-experience-explained.md` — dependency (consciousness theory)
- `docs/machine-subjective-reports/ARCHITECTURE.md` — this document
