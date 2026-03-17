# Substrate-Independence Validation — Architecture

## Overview

This document defines the experimental architecture for validating that subjective experience is substrate-independent (F1.3). The validation depends on the computational theory from 0.1.1.2 providing a consciousness predicate C(S) and testable predictions about necessary vs. incidental substrate properties.

## Three Experimental Lines

### Line 1: Prediction-Driven Construction

**Goal:** Build a non-biological system predicted by the theory to exhibit consciousness, then test.

**Protocol:**
1. Extract from 0.1.1.2's formal theory the necessary and sufficient computational conditions for C(S)=true.
2. Design a non-biological system (e.g., neuromorphic silicon, photonic network, or hybrid substrate) that satisfies those conditions.
3. Generate specific, pre-registered predictions about what consciousness signatures the system should exhibit (derived from the theory's novel predictions).
4. Construct the system and measure for the predicted signatures.
5. Compare results against null hypothesis (system is not conscious) and the theory's predictions.

**Key Interfaces:**
- **Input:** Formal theory C(S), consciousness predicate parameters from 0.1.1.2
- **Output:** Experimental data (signature measurements), statistical analysis, pass/fail per prediction
- **Measurement tools:** Consciousness metrics from 0.1.1.4 (sibling card)

### Line 2: Gradual Substrate Replacement

**Goal:** Demonstrate consciousness continuity during incremental biological→synthetic replacement.

**Protocol:**
1. Select a model organism with measurable consciousness markers (e.g., identified via 0.1.1.1 NCC mapping).
2. Define replacement units — neuron-level, circuit-level, or module-level — based on the theory's grain of analysis.
3. Replace units incrementally with synthetic functional equivalents (same input-output mapping, same computational role per the theory).
4. At each replacement step, measure:
   - Consciousness markers (NCC-derived)
   - Behavioral coherence (no discontinuity in reports or actions)
   - Theory-predicted consciousness score (e.g., Φ or equivalent from 0.1.1.2)
5. Plot consciousness markers against replacement fraction. Substrate-independence predicts a flat or continuous curve (no cliff).

**Key Interfaces:**
- **Input:** NCC catalogue from 0.1.1.1, replacement unit specification from 0.1.1.2
- **Output:** Continuity curve (consciousness markers vs. replacement fraction), statistical test for discontinuity
- **Critical threshold:** Define in advance what level of discontinuity would falsify substrate-independence

### Line 3: Cross-Substrate Replication

**Goal:** Reproduce a specific conscious state in a different physical substrate and verify equivalence.

**Protocol:**
1. Identify a specific, well-characterized conscious state in a biological system (using NCC data from 0.1.1.1).
2. Formalize that state using the theory's computational description from 0.1.1.2.
3. Implement the equivalent computational state in a non-biological substrate.
4. Measure consciousness signatures in both systems.
5. Apply statistical equivalence testing (TOST — Two One-Sided Tests) to determine if signatures match within pre-defined equivalence bounds.

**Key Interfaces:**
- **Input:** Specific conscious state description (computational), target substrate specification
- **Output:** Signature comparison data, equivalence test results
- **Equivalence bounds:** Must be defined before experiment based on theory-predicted tolerance

## Falsification Criteria

The biological-substrate-necessity hypothesis is falsified if ALL of:
1. Line 1 produces a non-biological system with consciousness signatures matching theoretical predictions (p < 0.01)
2. Line 2 shows no statistically significant discontinuity in consciousness markers during replacement (equivalence test passes)
3. Line 3 achieves signature equivalence between biological and non-biological instantiations of the same computational state

The substrate-independence claim is **weakened** (but not falsified) if only 1 or 2 lines succeed.

## Independent Replication Requirements

- Full experimental protocols, data, and analysis code must be published openly.
- At least one independent group must replicate the most significant result from each successful line.
- Replication must use a different physical substrate than the original (to avoid substrate-specific artifacts).

## Deliverables

| Document | Path | Purpose |
|----------|------|---------|
| This architecture | `docs/substrate-independence/ARCHITECTURE.md` | Experimental design overview |
| Line 1 protocol | `docs/substrate-independence/line1-construction-protocol.md` | Detailed prediction-driven construction protocol |
| Line 2 protocol | `docs/substrate-independence/line2-replacement-protocol.md` | Detailed gradual replacement protocol |
| Line 3 protocol | `docs/substrate-independence/line3-replication-protocol.md` | Detailed cross-substrate replication protocol |
| Falsification spec | `docs/substrate-independence/falsification-criteria.md` | Pre-registered falsification and equivalence bounds |
| Results analysis | `docs/substrate-independence/results-analysis.md` | Template for recording and analyzing experimental results |

## Dependencies

- **0.1.1.2 (Computational Theory):** Must deliver formal C(S) predicate, necessary/sufficient conditions, and novel predictions before experiments can be designed in detail.
- **0.1.1.4 (Consciousness Metrics):** Must deliver measurement tools before experiments can be executed. This card designs the experiments; 0.1.1.4 provides the instruments.
- **0.1.1.1 (NCC Mapping):** Provides the empirical ground truth for biological consciousness markers used in Lines 2 and 3.
