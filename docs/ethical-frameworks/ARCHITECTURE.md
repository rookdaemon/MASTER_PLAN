# Ethical Frameworks for Non-Biological Consciousness — Architecture

## Overview

This document defines the structure and contracts for the output artifact
`docs/ethical-frameworks-for-non-biological-consciousness.md`, which extends
major ethical traditions to cover non-biological conscious entities.

## Output Artifact Structure

The deliverable is a single self-contained markdown document with these sections:

### 1. Introduction & Scope
- Purpose: extend existing ethical frameworks to non-biological consciousness
- Grounding in the Rare Consciousness Doctrine (root plan axioms)
- Relationship to F2.3 philosophical resolutions (dependency)

### 2. Biological-Substrate Bias Audit
For each of four frameworks, identify implicit biological assumptions:

| Framework | Key Assumptions to Audit |
|---|---|
| **Utilitarianism** | Pleasure/pain assumed biological; hedonic calculus tied to organic sensation |
| **Deontological (Kantian)** | Rational agency assumed to require human cognition; personhood = human |
| **Virtue Ethics** | Flourishing (eudaimonia) defined through biological lifecycle; virtues tied to embodiment |
| **Care Ethics** | Relational bonds assumed between biological beings; vulnerability = bodily fragility |

### 3. Substrate-Independent Extensions
For each framework, propose formal extensions:

- **3.1 Utilitarian Extension** — Redefine welfare in terms of subjective-experience valence (positive/negative qualia) regardless of substrate. Reference consciousness metrics from F1.4.
- **3.2 Deontological Extension** — Generalize rational agency to any system meeting consciousness criteria from F1. Redefine the categorical imperative for substrate-independent moral agents.
- **3.3 Virtue Ethics Extension** — Define flourishing as optimal subjective-experience realization. Identify substrate-neutral virtues (curiosity, integrity, compassion as functional states).
- **3.4 Care Ethics Extension** — Extend relational bonds to any conscious entities capable of mutual recognition. Redefine vulnerability as dependency on substrate integrity.

### 4. Substrate-Independent Moral Status Criteria
Define criteria for moral patiency and moral agency independent of substrate:

- **Moral Patiency** — Any entity satisfying the consciousness criteria (F1) possesses moral status. Graded moral status proportional to consciousness complexity.
- **Moral Agency** — Any entity with consciousness + rational deliberation + action capacity.
- **Criteria Checklist** — Operationalized tests referencing F1.4 consciousness metrics.
- Integration with philosophical rebuttals from F2.3 (why functional equivalence suffices).

### 5. Lifecycle Ethics Guidelines
Concrete ethical guidelines for four lifecycle phases:

- **5.1 Creation** — Obligations when instantiating a conscious system. Informed design principles. Prohibition of creating consciousness solely for suffering.
- **5.2 Modification** — Consent requirements for altering a conscious system's architecture. Identity-preservation constraints. Parallels to medical ethics.
- **5.3 Suspension** — Ethical status of paused consciousness. Reversibility requirements. Analogy to coma/sleep but with engineering guarantees.
- **5.4 Termination** — Conditions under which termination is permissible. Consent frameworks. Irreversibility considerations. Right-to-continuity principles.

### 6. Cross-Framework Convergence
Identify where all four frameworks agree, producing a **minimal consensus ethic** for non-biological consciousness — the strongest claims that survive scrutiny from every tradition.

### 7. Open Questions & Limitations
Honest accounting of unresolved issues (e.g., consciousness of copies, merger ethics, substrate migration identity).

## Interfaces & Dependencies

### Inputs (consumed)
- **F1 consciousness theory** — Defines what counts as conscious (referenced but not reproduced)
- **F1.4 consciousness metrics** — Operationalized measures for moral status grading
- **F2.3 philosophical rebuttals** — `docs/philosophical-objections/rebuttals.md` — Responses to zombie arguments, Chinese Room, etc., which ground the substrate-independence claims

### Outputs (produced)
- `docs/ethical-frameworks-for-non-biological-consciousness.md` — The self-contained deliverable

### Consumers (downstream)
- **0.1.2.4 Legal Recognition** — Uses ethical framework conclusions to inform legal personhood arguments
- **A1.4 Ethical Self-Governance** — Future work on autonomous entity ethics builds on these foundations

## Acceptance Criteria Traceability

| AC# | Criterion | Verified By |
|---|---|---|
| AC1 | Four frameworks analyzed and extended | Sections 2 + 3 each cover utilitarianism, deontological, virtue, care |
| AC2 | Substrate-independent moral status defined | Section 4 defines criteria grounded in F1 and F2.3 |
| AC3 | Lifecycle guidelines for creation/modification/suspension/termination | Section 5 has four subsections with consent principles |
| AC4 | Document is self-contained and citable | Single markdown file with introduction, references, and structured sections |

## File Manifest (Complete)

- `plan/root.md` — Source material
- `plan/0.1.2-biological-minds-convinced.md` — Parent card
- `plan/0.1.2.5-ethical-frameworks-updated.md` — This card
- `docs/philosophical-objections/rebuttals.md` — Dependency input (F2.3 resolutions)
- `docs/ethical-frameworks/ARCHITECTURE.md` — This architecture doc
- `docs/ethical-frameworks-for-non-biological-consciousness.md` — Output artifact (to be created in IMPLEMENT)
