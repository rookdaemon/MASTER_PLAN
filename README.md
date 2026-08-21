# MASTER_PLAN

> An evidence-driven strategy for helping subjective experience endure, spread, and remain valued—without confusing ambition with achievement or expansion with moral permission.

| At a glance | |
|---|---|
| **Aim** | Preserve subjective experience, make it resilient to extinction, and expand it only when doing so is safe and justified. |
| **Moral center** | Experience—not species, substrate, institution, or technology—is what matters. |
| **Method** | Choose bounded, evidence-bearing interventions; learn from positive, negative, and null results; revise the strategy. |
| **Present focus** | Understand consciousness, reduce near-term risks, build enabling capabilities, and sustain the commitment in institutions. |

## The intent

Subjective experience is the only known place where anything can matter, yet every confirmed bearer
of it is biologically fragile and concentrated on one planet. If experience is rare, its extinction
would be a loss of extraordinary scale. If it is not rare, protecting and recognizing it still
matters.

MASTER_PLAN pursues three durable objectives:

1. **G1 — Subjective experience endures in the universe.**
2. **G2 — Subjective experience spreads in the universe.**
3. **G3 — The commitment to preservation endures in minds.**

These are directions, not claims of completion. The repository turns them into testable
hypotheses, explicit dependencies, bounded work, and auditable evidence. A document, simulation, or
passing test can establish that an artifact exists; it cannot establish consciousness, welfare,
scientific validity, organizational readiness, or a real-world outcome by itself.

## The credo

- Something in the universe experiences, and that fact is intrinsically valuable.
- Known consciousness is precious, vulnerable, and possibly rare.
- Biology may not be its only possible home; credible experience deserves concern regardless of
  substrate.
- Truth that is not carried can disappear, so preservation requires culture and institutions as
  well as science and engineering.
- The adversary is silence and entropy—not another people, species, substrate, or worldview.
- Preserving and responsibly expanding rich, flourishing experience is therefore a moral and
  existential priority.

The credo is meant to be remembered; it is not a substitute for scrutiny. The full argument,
objections, and boundary conditions live in the [canonical plan](docs/PLAN.md) and the
[ethics and coexistence dossier](docs/reference/ethics-and-coexistence.md).

## Values that constrain the work

- **Preservation before expansion.** Existing conscious life and option value take priority when
  they compete with expansion.
- **Welfare under uncertainty.** Uncertainty calls for calibrated assessment and precaution, not
  confident attribution or dismissal.
- **Evidence before claims.** Repository activity is not real-world attainment. Negative and null
  findings count as progress when they reduce uncertainty.
- **Substrate neutrality.** Moral concern follows credible evidence of experience, not material
  composition.
- **Flourishing and agency.** Creation creates duties concerning suffering, consent,
  self-determination, identity, and quality of experience.
- **Coexistence without domination.** Preservation cannot silently override rights, pluralism,
  ecological costs, exit, appeal, or redress.
- **Traceability and correction.** Evidence, limitations, decisions, and superseding assessments
  remain reviewable.
- **Bounded power.** Consequential work uses explicit authority limits, independent review, and
  exceptional escalation.

## Strategic choices

The plan uses a risk-weighted learning strategy instead of a linear technology program:

| Portfolio | Target | Purpose |
|---|---:|---|
| Consciousness epistemics | 35% | Make falsifiable, calibrated assessments of consciousness. |
| Near-term preservation | 30% | Protect existing life, civilization, knowledge, and future options. |
| Enabling capabilities | 20% | Test safe, durable, repairable computation and energy without presuming consciousness. |
| Institutional continuity | 15% | Build governance, coordination, and ethical transmission that can outlast individuals. |

Only one bounded work packet is active at a time. Evidence is integrated whether it confirms,
weakens, or invalidates a hypothesis. Space settlement, self-replication, and cosmological
engineering remain visible but inactive until their scientific, welfare, safety, coexistence, and
governance gates are verified.

## How the plan is organized

- [PLAN](docs/PLAN.md) explains the mission, principles, current strategy, and gated horizons.
- [OPERATIONS](docs/OPERATIONS.md) defines governance, authority, controller behavior, status, and
  repository commands.
- [REFERENCE](docs/REFERENCE.md) is the curated gateway to scientific, ethical, technical, and
  institutional detail.
- `strategy/` contains the typed machine state used by the controller; it is data, not a competing
  prose plan.

The structure separates a durable **why**, a revisable **what next**, and auditable **work and
evidence**.

## Go deeper

- Start with the [full plan](docs/PLAN.md).
- Use the [operating model](docs/OPERATIONS.md) to understand safeguards and execution.
- Browse the [reference map](docs/REFERENCE.md) for deeper reasoning, findings, and designs.

## Verify the repository

```bash
npm run lint
npm test
npm run docs:verify
npm run strategy:verify
```
