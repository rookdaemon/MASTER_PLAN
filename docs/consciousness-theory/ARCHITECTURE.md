# Computational Theory of Consciousness — Architecture

## Overview

This document defines the structure, methodology, and interfaces for establishing a computational theory of consciousness (card 0.1.1.2). The work produces three deliverable documents and must satisfy the acceptance criteria defined on the card.

## Dependency

- **0.1.1.1 Neural Correlates Mapped** — provides the NCC catalogue against which any theory must be validated. This card is currently in [ARCHITECT]. Once its NCC catalogue is available, step 5 (Validate against NCC) can be completed. Steps 1-4 can proceed using the established NCC literature as a provisional basis.

## Deliverable Structure

### 1. `docs/consciousness-theory/survey.md` — Comparative Framework Survey

**Purpose:** Systematically evaluate six candidate frameworks.

**Structure:**
1. **Evaluation Criteria** — a rubric applied uniformly to all frameworks:
   - *Empirical adequacy* — consistency with known NCCs (from 0.1.1.1 catalogue)
   - *Explanatory depth* — does it explain *why* correlates give rise to experience, or merely describe?
   - *Substrate agnosticism* — does it apply beyond biological neurons?
   - *Formalizability* — can it be expressed in precise mathematical/computational terms?
   - *Predictive power* — does it generate novel, testable predictions?
   - *Parsimony* — minimal assumptions beyond established science
   - *Scope* — does it address all modalities and altered states?

2. **Framework Analyses** — one section per framework, each containing:
   - Core claim and mechanism
   - Mathematical formalism (if any)
   - Strengths scored against rubric
   - Weaknesses scored against rubric
   - Key empirical support and counterevidence

   Frameworks:
   - Integrated Information Theory (IIT) — Phi as consciousness measure
   - Global Workspace Theory (GWT) — broadcasting and access
   - Higher-Order Theories (HOT) — meta-representation
   - Predictive Processing / Active Inference — prediction error minimization
   - Recurrent Processing Theory (RPT) — recurrent loops
   - Attention Schema Theory (AST) — attention modeling

3. **Comparative Matrix** — a summary table scoring all 6 frameworks across all criteria (1-5 scale with justification)

4. **Selection/Synthesis Rationale** — argument for which framework(s) to adopt or how to synthesize

### 2. `docs/consciousness-theory/formal-theory.md` — Formalized Theory

**Purpose:** Express the selected/synthesized theory in rigorous mathematical and computational terms.

**Structure:**
1. **Informal Statement** — plain-language description of the theory's core claim
2. **Definitions**
   - State space S (the space of possible system configurations)
   - Information structure I(S) (the information-theoretic properties of a state)
   - Consciousness predicate C(S) : S -> {0, 1} (or graded: S -> [0, 1])
   - Necessary conditions N_i such that NOT N_i => NOT C(S)
   - Sufficient conditions: conjunction of conditions that guarantee C(S) = 1
3. **Axioms** — foundational assumptions stated explicitly
4. **Core Theorems / Propositions** — derived consequences of the axioms
5. **Substrate Agnosticism Proof** — demonstrate that C(S) depends only on computational/informational properties, not on physical substrate
6. **Boundary Cases** — analysis of edge cases:
   - Thermostat (simple feedback) — should predict non-conscious
   - Brain in deep sleep — should predict reduced/absent consciousness
   - Split-brain — should make a specific prediction
   - Digital simulation of a brain — should predict conscious (substrate agnosticism)
   - Philosophical zombies — should be ruled out or explained
7. **Relation to NCC Data** — how each NCC entry maps to terms in the formal theory

### 3. `docs/consciousness-theory/predictions.md` — Novel Predictions

**Purpose:** Generate discriminating, testable predictions.

**Structure:**
1. **Prediction Template** — each prediction follows this format:
   - **Statement**: precise, falsifiable claim
   - **Derivation**: how it follows from the formal theory
   - **Discriminating power**: which rival theories predict differently, and what they predict
   - **Proposed test**: experimental or computational protocol to test
   - **Expected outcome if theory is correct**
   - **Expected outcome if theory is wrong**

2. **Minimum 3 predictions**, targeting:
   - P1: A prediction about a neural system (e.g., specific manipulation that should alter consciousness in a precise, measurable way)
   - P2: A prediction about a non-biological system (e.g., conditions under which an artificial system would/wouldn't be conscious)
   - P3: A prediction about an edge case or altered state not already explained by NCC data

3. **Discrimination Table** — matrix showing how each prediction distinguishes the selected theory from each of the 5 rival frameworks

## Interfaces & Contracts

### Input Interface (from 0.1.1.1)
The theory must consume an NCC catalogue with entries of the form:
```
NCC Entry:
  - structure/process: <neural structure or process>
  - modality: <visual | auditory | somatosensory | emotional | meta-cognitive | ...>
  - state_context: <waking | dreaming | anesthesia | coma | altered>
  - role: <NCC-proper | prerequisite | consequence>
  - evidence_strength: <strong | moderate | preliminary>
  - key_references: [...]
```

### Output Interface (to 0.1.1.3 and 0.1.1.4)
The theory must export:
1. **Consciousness predicate C(S)** — a computable function (or at minimum, a decidable criterion for well-specified systems)
2. **Necessary conditions list** — checkable properties any conscious system must have
3. **Sufficient conditions list** — properties that guarantee consciousness
4. **Measurable quantities** — quantities derivable from C(S) that can be operationalized as metrics (feeds into 0.1.1.4)
5. **Substrate-independence claim** — a precise statement testable by 0.1.1.3

## Acceptance Criteria Traceability

| Acceptance Criterion | Deliverable | Section |
|---|---|---|
| Comparative survey of 6 frameworks scored against NCC data | survey.md | Framework Analyses + Comparative Matrix |
| Formalized theory with mathematical C(S) | formal-theory.md | Definitions |
| Necessary and sufficient computational conditions | formal-theory.md | Definitions (N_i, sufficient conditions) |
| At least 3 novel testable predictions discriminating from rivals | predictions.md | Predictions P1-P3 + Discrimination Table |
| Every NCC catalogue entry accounted for | formal-theory.md | Relation to NCC Data |
| Predicts consciousness for arbitrary physical systems | formal-theory.md | Substrate Agnosticism Proof + Boundary Cases |
| All deliverable documents written and in manifest | card file | File Manifest |

## Implementation Order

1. Write `survey.md` (can begin immediately using established NCC literature)
2. Write `formal-theory.md` (depends on survey conclusion)
3. Write `predictions.md` (depends on formal theory)
4. Validate all against 0.1.1.1 NCC catalogue when available (final pass)
