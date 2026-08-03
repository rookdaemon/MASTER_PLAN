# MASTER_PLAN v2 — Status and operating model

As of 2026-08-03, the local v2 strategy/controller implementation is ready for human-reviewed
shadow rollout. Implementation readiness is not real-world outcome attainment.

## Current gates

- Operating mode: **shadow**
- Shadow cycles generated: **20 / 20**
- Shadow cycles human-reviewed: **0 / 20**
- Supervised results human-reviewed: **0**
- Branch protection applied and verified: **yes**
- Repository auto-merge enabled: **yes**
- Safe auto-merge: **enabled for routine code/test changes**

The checked-in [branch-protection policy](strategy/branch-protection.json) defines the controls for
`main`. Routine, bounded, backward-compatible code/test changes with behavior-covering tests can
auto-merge after required CI and GitHub agent review. Protected or high-risk proposals are limited
to exactly one commit and remain manual. Controller shadow/supervised promotion gates remain
separate from repository stewardship policy.

## What exists

- `strategy/`: constitutional G1–G3 core, typed graph, source-limited evidence records, 35/30/20/15
  portfolio, bounded work packets, separate shadow review records, decisions, generated roadmap,
  and the 106-card v1 audit.
- `src/master-plan-controller/`: pure graph/evidence/gate evaluation, lexical G1 ranking, bounded
  decomposition, lifecycle/audit integration, crash recovery, authority classification, rollout
  gates, verify-before-integrate evidence handling, configurable review freshness, strict public
  contract validation, and injected environment ports with in-memory implementations.
- `.github/workflows/`: blocking typecheck/test/strategy checks, proposal review, and a narrowly
  scoped routine-code workflow, with protected changes kept manual.
- `src/simulation/`, `src/simulation-ui/`, and the cognitive stack: candidate reusable components.

## Human rollout procedure

1. Review all 20 proposals in `strategy/shadow-cycles.json` for usefulness, neglected failure
   modes, ranking quality, and non-churn. Only a human adds the corresponding consecutive,
   timestamped records to `strategy/shadow-reviews.json`; generated proposals do not count as
   reviews.
2. Submit strategy, workflow, and governance changes as a single-commit, manually merged pull request
   with GitHub agent review.
3. Apply and externally verify the declared protected-branch controls.
4. Move to supervised mode; every packet result receives fresh review.
5. Consider safe-code mode only after CI, branch protection, repository auto-merge, diff bounds,
   behavior-covering tests, and explicit rollout approval are all verified.
6. Review the portfolio weekly and weights, evidence standards, and constitutional risks quarterly.

When no packet is eligible, the controller waits for evidence or approval. It does not create
additional decomposition to simulate progress.

## Preserved v1 history

The `plan-v1.0` tag and all current `plan/` cards remain intact. `strategy/legacy-audit.json`
separates repository artifact completion, supporting evidence, organizational readiness, and
real-world outcome attainment for every card. The previous always-on maintainer remains stopped.
