# Strategy v2

This directory is the current recursive strategy and evidence system. The `plan/` directory is
preserved as v1 history.

- `CONSTITUTION.md` and `constitution.json` define G1–G3, ethical invariants, and amendment rules.
- `graph.json` is the typed dependency graph.
- `evidence.json` separates claims, methods, sources, strength, limitations, and timestamps.
- `work-packets.json` contains the bounded ranked frontier.
- `portfolio.json` contains allocation and controller configuration.
- `legacy-audit.json` re-audits every v1 plan card without interpreting `[DONE]` as a real-world result.
- `ROADMAP.md` is a generated human-readable view and is not evidence.
- `shadow-cycles.json` contains generated proposals; `shadow-reviews.json` contains separate,
  auditable independent agent review records.
- `escalations.json` contains evidence-bound requests for the rare decisions automation cannot make.
- `decisions/` contains traceable strategy decisions.

The repository uses an automated operating body under servant-leader goals and constitutional
constraints. External actions remain bounded by evidence and verification; the human is contacted
only through the documented exceptional escalation process.
