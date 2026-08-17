# Strategy v2

This directory is the current recursive strategy and evidence system. The `plan/` directory is
preserved as v1 history.

- `CONSTITUTION.md` and `constitution.json` define G1–G3, ethical invariants, and amendment rules.
- `graph.json` is the typed dependency graph.
- `evidence.json` separates claims, methods, sources, strength, limitations, and timestamps.
- `observation-sources.json` configures credential-independent external observations that are
  deduplicated and integrated before diagnosis. Public records are bounded, treated as untrusted,
  adjudicated in memory by a pinned local agent, and never persisted as raw source content.
- `periodic-reviews.json` records deterministic weekly portfolio reviews and quarterly evidence,
  weight, and constitutional-risk reviews produced by the automated operating body.
- `work-packets.json` contains the bounded ranked frontier.
- `packet-templates.json` contains versioned recurring interventions for all four portfolios.
  Fresh matching adjudicated evidence advances terminal reviewed work to a new identity; unrelated
  or null snapshots and active or blocked work suppress duplicate retries.
- `portfolio.json` contains allocation and controller configuration.
- `legacy-audit.json` re-audits every v1 plan card without interpreting `[DONE]` as a real-world result.
- `ROADMAP.md` is a generated human-readable view and is not evidence.
- `shadow-cycles.json` contains generated proposals; `shadow-reviews.json` contains separate,
  auditable independent agent review records.
- `escalations.json` contains evidence-bound requests for the rare decisions automation cannot make.
- `decisions/` contains traceable strategy decisions.
- [`docs/machine-ecology-and-coexistence.md`](../docs/machine-ecology-and-coexistence.md)
  defines the adversarial coexistence doctrine. Its measured governance capability gates
  self-replicating conscious infrastructure; it does not declare machine consciousness or amend G1-G3.

The scheduled `strategy-periodic-review` workflow supplies the review timestamp, creates one
auditable record commit, and routes it through blocking checks and independent GitHub agent review.
The packet executor has deterministic, authority-bounded handlers for consciousness comparison,
preservation-register refresh, durable-compute fault-model extension, and institutional-map refresh.

The repository uses an automated operating body under servant-leader goals and constitutional
constraints. External actions remain bounded by evidence and verification; the human is contacted
only through the documented exceptional escalation process.
