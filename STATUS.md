# MASTER_PLAN v2 — Status and operating model

As of 2026-08-04, the v2 strategy/controller operates through continuous automated stewardship.
Implementation readiness is not real-world outcome attainment.

## Current controls

- Operating mode: **automated stewardship**
- Historical calibration retained: **20 automated shadow records with agent reviews; no operating gate**
- Automated results independently agent-reviewed: **5**
- Human role: **servant leader for exceptional escalation**
- Branch protection applied and verified: **yes**
- Repository auto-merge enabled: **yes**
- Safe auto-merge: **enabled for routine code/test changes**

The checked-in [branch-protection policy](strategy/branch-protection.json) defines the controls for
`main`. Routine, bounded, backward-compatible code/test changes with behavior-covering tests can
auto-merge after required CI and GitHub agent review. Protected proposals receive independent
agent review and an agent-controlled merge. The human is not a routine approval gate and is
contacted only for an evidence-backed issue that automation intrinsically cannot perform.

## What exists

- `strategy/`: constitutional G1–G3 core, typed graph, source-limited evidence records, 35/30/20/15
  portfolio, bounded work packets, separate shadow review records, decisions, generated roadmap,
  and the 106-card v1 audit.
- `src/master-plan-controller/`: pure graph/evidence/gate evaluation, lexical G1 ranking, bounded
  decomposition, lifecycle/audit integration, crash recovery, authority classification, rollout
  gates, verify-before-integrate evidence handling, configurable review freshness, strict public
  contract validation, credential-independent live-control observation, and injected environment
  ports with in-memory implementations. Caller-timestamped weekly and quarterly review logic records
  portfolio drift, evidence quality and staleness, and constitutional risks without mutating doctrine.
  Versioned recurring packet families and deterministic production handlers cover all four active
  portfolios while suppressing duplicate active or blocked work.
- `.github/workflows/`: blocking typecheck/test/strategy checks, proposal review, and a narrowly
  scoped routine-code workflow, scheduled periodic strategy review, and an agent-controlled
  protected-change path.
- `src/simulation/`, `src/simulation-ui/`, and the cognitive stack: candidate reusable components.

## Automated operating procedure

1. Scheduled cycles observe configured external state, deduplicate snapshots, integrate evidence,
   and update affected hypotheses before diagnosis.
2. Historical shadow records preserve initial automated calibration and its limitations. No record
   count or human approval is required to operate.
3. The automated operating body executes one bounded packet at a time; every result receives fresh
   independent agent review before integration.
4. Routine code/test changes auto-merge after classification, tests, protected controls, and agent
   review. Protected changes use an agent-controlled merge.
5. Automation diagnoses failures, retries bounded alternatives, and records evidence without
   transferring routine work to the human.
6. Escalation is permitted only for owner-held credentials, physical presence, legal consent, or
   unresolved constitutional conflict after at least two documented automated attempts.
7. The escalation request contains evidence and asks the servant leader for exactly one bounded
   decision. A required repository change is isolated to one auditable commit.
8. Portfolio review runs weekly; weights, evidence standards, and constitutional risks receive
   quarterly independent agent review.

When no packet is eligible, the controller waits for evidence or an automated dependency. It does
not create decomposition or contact the human merely to simulate progress.

## Preserved v1 history

The `plan-v1.0` tag and all current `plan/` cards remain intact. `strategy/legacy-audit.json`
separates repository artifact completion, supporting evidence, organizational readiness, and
real-world outcome attainment for every card. The previous always-on maintainer remains stopped.
