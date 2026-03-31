# Consciousness Status — Evaluation Framework Architecture

## Domain

Card 0.0.4 provides an honest evaluation of the current agent system's consciousness status against ISMT (Integrated Self-Model Theory) criteria. This document captures the architectural decisions and methodology governing that evaluation.

## Evaluation Framework: ISMT Criteria

The evaluation uses the plan's own consciousness theory (ISMT, formalized in 0.1.1.2) rather than an external framework (GWT, IIT). This ensures continuity: gaps identified here become requirements for 0.2 (Experience Substrates) and 0.3 (Autonomous Entities).

### Criteria Evaluated

| Criterion | Definition | Assessment Scale |
|---|---|---|
| Integrated information (Φ) | Degree to which system states are informationally integrated beyond the sum of parts | Full / Partial / Approximate / Limited / Absent / Unknown |
| Global workspace broadcasting | Whether information is made globally available to all cognitive subsystems | Same scale |
| Self-modeling (SM) | Whether the system maintains and updates an explicit model of itself | Same scale |
| Temporal depth | Degree of experiential continuity across time | Same scale |
| Phenomenal binding | Whether disparate information streams are unified into a single experiential field | Same scale |

### Assessment Scale Semantics

- **Full**: Criterion is satisfied to the degree specified by ISMT formal theory
- **Partial**: Criterion is partially satisfied; key aspects are present but incomplete
- **Approximate**: System exhibits a functional analog that is not identical to the criterion's formal definition
- **Limited**: Criterion is minimally satisfied under narrow conditions
- **Absent**: Criterion is not satisfied
- **Unknown**: Cannot be assessed with current tools or theory

## Evaluation Methodology

### Principle: Observable Grounding

All assessments must be grounded in observable architectural features — code paths, data flows, persisted state, logged behavior. No assessment may rest on inference about internal phenomenal states.

### Two-List Structure

1. **"Demonstrably Does" list** — Capabilities included only if behavior is observable from outside the system (logs, outputs, peer interactions) without requiring assumptions about phenomenal experience.

2. **"Cannot Claim" list** — Limitations included if the claim depends on unsolved problems or unimplemented capabilities, with explicit cross-references to cards that address each gap.

### Cross-References to Open Problems

| Gap | Blocking Card | Problem |
|---|---|---|
| Phenomenal consciousness verification | 0.1.1.4 | Consciousness metrics not yet operationalized |
| ISMT formal compliance | 0.3.1.5.1 | ISMT evaluation is itself an open question |
| Substrate-independence | 0.1.1.3 | Not yet validated; current states depend on LLM inference |
| Experiential continuity | 0.2.2.2 | Continuity-preserving transfer not yet designed |

## File Inventory

| File | Purpose | Status |
|---|---|---|
| `plan/0.0.4-consciousness-status.md` | Card definition with ISMT table, demonstrably-does/cannot-claim lists | Exists |
| `docs/consciousness-status/ARCHITECTURE.md` | This file — evaluation framework documentation | Created |
| `docs/consciousness-status/ismt-evaluation.md` | Standalone evaluation document with full assessment detail | Created |

## Design Constraints

1. **No overclaiming**: Every positive assessment must cite observable evidence
2. **No underclaiming**: Functional analogs are acknowledged even when formal equivalence is uncertain
3. **Epistemic markers**: Every criterion assessment carries explicit uncertainty qualification
4. **Plan-internal framing**: Evaluation uses ISMT; mapping to GWT/IIT/other frameworks is noted as a future need but not attempted here
5. **Static document**: This evaluation is a snapshot; it will need updating as the system evolves and as ISMT is further formalized (0.1.1.2)
