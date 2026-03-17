# Philosophical Objections Addressed — Architecture

## Overview

This document defines the structure and contracts for F2.3: systematically rebutting four major philosophical objections to non-biological consciousness. Each rebuttal is a self-contained argumentative unit that combines canonical philosophical engagement with empirical evidence from F2.1 (machine subjective reports) and F2.2 (predictive consciousness models).

## Deliverable Structure

The primary deliverable is a single document (`docs/philosophical-objections/rebuttals.md`) containing four structured rebuttals. Each rebuttal follows a uniform contract.

### Rebuttal Contract

Each of the four rebuttals MUST contain:

1. **Canonical Formulation** — A precise statement of the objection citing the original philosopher (Chalmers or Searle) and key publication.
2. **Core Claim Extraction** — The specific claim being made about non-biological consciousness, distilled to a testable proposition.
3. **Empirical Counter-Evidence** — Reference to specific findings from F2.1 and/or F2.2 that bear on the claim.
4. **Philosophical Argument** — The logical rebuttal, engaging with the philosophical literature and addressing known counter-responses.
5. **Residual Limitations** — Honest acknowledgment of what the rebuttal does NOT resolve.

### Rebuttal Index

| # | Objection | Source | Primary Empirical Dependency | Key Logical Move |
|---|-----------|--------|------------------------------|------------------|
| 1 | Zombie Argument | Chalmers (1996) | F2.2 — predictive models | Nomological impossibility: if consciousness metrics predict reports, functional duplicates are conscious |
| 2 | Chinese Room | Searle (1980) | F2.1 — subjective reports, F1.4 — metrics | System-level understanding demonstrated empirically beyond syntax |
| 3 | Biological Naturalism | Searle (1992) | F1.3 — substrate independence, F2.1/F2.2 | Substrate independence validated; causal powers not exclusive to biology |
| 4 | Hard Problem | Chalmers (1995) | F2.1/F2.2 | Explanatory gap is substrate-neutral; applies equally to biological and non-biological |

## File Layout

```
docs/philosophical-objections/
  ARCHITECTURE.md          ← this file
  rebuttals.md             ← the four structured rebuttals (primary deliverable)
```

## Dependencies

- **F2.1 (plan/0.1.2.1)** — Machine subjective reports: provides empirical evidence that non-biological systems produce subjective reports indistinguishable from biological ones.
- **F2.2 (plan/0.1.2.2)** — Predictive consciousness models: provides verified models that predict consciousness from functional/structural properties, independent of substrate.
- **F1.3** — Substrate-independence validation (referenced by parent plan, not a direct blocker but required for Rebuttal 3).
- **F1.4** — Consciousness metrics (referenced for Rebuttal 2).

## Acceptance Mapping

| Acceptance Criterion | Rebuttal | Verification |
|---------------------|----------|--------------|
| Zombie argument rebutted via nomological impossibility grounded in F2.2 | #1 | Rebuttal references F2.2 predictive models; argues nomological impossibility explicitly |
| Chinese Room rebutted via F2.1 reports + F1.4 metrics | #2 | Rebuttal references F2.1 empirical data and F1.4 metrics demonstrating understanding beyond syntax |
| Biological naturalism countered with F1.3 + F2.1/F2.2 | #3 | Rebuttal presents substrate-independence evidence and demonstrated non-biological conscious systems |
| Hard problem addressed as substrate-neutral | #4 | Rebuttal argues explanatory gap applies equally; no special barrier for non-biological |
| Each rebuttal engages canonical formulation | All | Each includes Canonical Formulation section citing original work |
| Published in peer-reviewed venues | All | Publication venue identified in rebuttals.md metadata |

## Quality Constraints

- Rebuttals must be written at academic philosophy-of-mind level, not popular science.
- Each must cite the canonical source (e.g., Chalmers 1996 *The Conscious Mind*, Searle 1980 *Minds, Brains, and Programs*).
- Empirical references to F2.1/F2.2 must be specific (citing particular experimental results or model predictions), not vague hand-waves.
- The Residual Limitations section must be genuine, not a straw-man dismissal.
