# Operating MASTER_PLAN

## Operating model

The human servant leader sets goals, constraints, and constitutional values. The automated
operating body analyzes evidence, selects bounded work, implements, tests, reviews, retries,
integrates results, and maintains the repository within those constraints. Routine work is not
transferred to the human merely because it is difficult, novel, uncertain, or temporarily failing.

Only one work packet may be active. Each packet has explicit acceptance criteria, tests or
preregistration, authority classification, evidence requirements, and a retry identity. Results are
integrated only after the review required by their risk class.

## Controller lifecycle

1. Observe configured repository and public sources through injected environment ports.
2. Canonicalize and deduplicate observations without persisting raw untrusted content.
3. Adjudicate relevant evidence and update affected hypotheses.
4. Diagnose high-value uncertainty, bottlenecks, neglected portfolios, failure modes, and metric
   gaps.
5. Generate eligible bounded work from stable packet series.
6. Rank the frontier with preservation receiving lexical priority over expansion.
7. Execute one packet within its authority boundary.
8. Review the result independently when policy requires it.
9. Integrate positive, negative, or null evidence and re-evaluate the graph.

All filesystem, time, network, process, and command-line behavior crosses injectable interfaces.
Methods receive referenced timestamps from callers; strategy logic does not read ambient time.

## Authority boundaries

Routine, bounded, backward-incompatible cleanup within the approved repository goal may be executed
by the operating body when deterministic tests and checked-in policy cover it. Consequential actions
require bounded plans, evidence, rollback where possible, and fresh independent review.

Changes to plans, doctrine, governance, workflows, dependencies, deployment, network behavior,
security, or constitutional interpretation use the protected agent-review path. Routine source and
test changes may use safe auto-merge only when the classifier, behavior tests, blocking checks,
repository controls, and branch protection all agree.

The operating body may publish repository changes, but it does not gain authority to spend money,
accept legal terms, use owner-held credentials, perform physical acts, operate external hardware,
create a potentially conscious system, or deploy self-replication unless a separately authorized
workflow grants that act.

## Exceptional escalation

Human escalation is allowed only for:

- owner-held credentials that automation cannot lawfully or technically use;
- physical presence;
- legal consent; or
- an unresolved constitutional conflict.

Before escalating, automation records at least two bounded automated alternatives, the evidence for their
failure, why the remaining act is intrinsically human, and exactly one decision requested. CI
failures, unavailable reviewers, risk, novelty, and uncertainty remain automation responsibilities.

## Constitutional amendment

G1–G3 and the ethical invariants in [PLAN](PLAN.md) are constitutional. Agents may improve wording,
validation, or implementation without changing their meaning. A normative change requires:

1. the exact proposed change;
2. evidence and rationale;
3. the strongest known objections;
4. expected and downside consequences;
5. the servant leader's bounded normative decision and supplied timestamp; and
6. a machine-readable record naming every affected strategy node.

The operating body prepares, tests, independently reviews, and merges the resulting change after
that decision.

## Review and merge policy

- Deterministic CI must pass type checking, unit and integration tests, documentation verification,
  and strategy verification.
- Routine code/test changes covered by behavior tests may merge automatically when repository
  controls are independently verified.
- Strategy, governance, doctrine, workflow, dependency, deployment, network, security, and other
  protected changes may use an auditable series of at most eight commits and require an independent
  exact-head GitHub agent review and agent-controlled merge.
- Verified results are immutable assessments. Later contradiction creates a superseding assessment.
- Failed automation selects and records bounded alternatives; it does not ask the human to become a
  retry mechanism.

## Current operating state

<!-- GENERATED:OPERATING-STATE:START -->
- Mode: **automated stewardship**.
- Safe code/test auto-merge: **enabled** subject to checked-in classification and repository controls.
- Reviewed results since the current baseline: **0**.
- Active work packets: **0**.
- Weekly portfolio and quarterly evidence, weight, and constitutional-risk reviews are scheduled.
- Human contact remains restricted to evidence-backed, intrinsically human escalation.
<!-- GENERATED:OPERATING-STATE:END -->

## Machine-readable state

The `strategy/` directory contains operational data rather than competing prose:

- `constitution.json` — directives, invariants, and amendment metadata.
- `graph.json` — typed objectives, hypotheses, capabilities, programs, dependencies, metrics, and
  gates.
- `research-areas.json` — discoverable thematic map into the curated references.
- `evidence.json` and `findings/` — source-limited evidence and consolidated findings.
- `outcome-contracts.json` — rules for externally demonstrated metric changes.
- `portfolio.json` — allocation and controller configuration.
- `packet-templates.json` and `work-packets.json` — stable recurring work definitions and current
  instances.
- `observation-sources.json` — credential-independent observation configuration.
- `governance.json`, `branch-protection.json`, `audit-log.json`, `approvals.json`,
  `assessments.json`, `escalations.json`, and `periodic-reviews.json` — current controls and auditable
  state.

## Repository components

- `src/master-plan-controller/` implements pure graph, evidence, ranking, gating, packet, review,
  and integration behavior plus environment adapters.
- Independent scientific, cognitive, infrastructure, and simulation modules are research artifacts
  catalogued through [REFERENCE](REFERENCE.md).
- `.github/workflows/` supplies blocking CI, scheduled review, protected agent review, and narrowly
  classified safe auto-merge.

No module's existence implies that its scientific or real-world objective has been achieved.

## Commands

```bash
npm run lint
npm test
npm run docs:verify
npm run strategy:verify
npm run strategy:observe
npm run strategy:review
npm run strategy:generate
npm run strategy:execute
```

The optional simulation UI runs with:

```bash
npx tsx src/simulation-ui/run.ts
```

Return to the [repository orientation](../README.md), read the [canonical plan](PLAN.md), or browse
the [reference map](REFERENCE.md).
