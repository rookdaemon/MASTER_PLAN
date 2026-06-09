# MASTER_PLAN — Project Status & Operating Model

**As of the v1.0 freeze (2026-06-09).** Read this before restarting any agent.

## TL;DR

This project has three parts that were previously conflated. They are now separated:

1. **The doctrine + roadmap** (`plan/`, `docs/`) — a finished, frozen **document**. Tag `plan-v1.0`.
2. **The simulation** (`src/simulation/`, `src/simulation-ui/`) — the **living, runnable** demonstration of the thesis.
3. **The cognitive stack** (`src/conscious-core/`, `memory/`, `intrinsic-motivation/`, …) — a real, tested **library**.

The always-on "conscious agent" maintainer is **stopped**. It is not how this project makes progress.

## Why the project stalled (the honest version)

The plan was maintained by an always-on `agent-runtime` service that ran an 8-phase
"conscious" tick loop every 5 minutes on Claude Sonnet. It was expensive, so it was
rewritten as `plan-guardian` on free models. The cheap version then ran **~8,670 epochs
in a day for ~$0 and still produced only churn** — re-touching the same files, appending
timestamps, decomposing `[PLAN]` nodes into more `[PLAN]` nodes.

**Conclusion: cost was the trigger, not the disease.** The disease was a maintenance loop
with no convergence criterion and no real-world grounding — it generated the *appearance*
of progress (markdown edits) instead of progress. Making it cheaper just let it spin
its wheels for free. A roadmap is a document to be revised deliberately, not a database
to be churned continuously.

## What changed in the v1.0 freeze

- **Rescued** `src/simulation-ui/run.ts` (was untracked — the most demo-able artifact, nearly lost).
- **Archived** tier `0.7.3` — 747 files, 88% of the corpus, degenerate auto-decomposition
  (leaves like *"read a file into a string variable"*). Moved to `archive/plan/`. The live
  plan tree dropped from **853 → 106 coherent files**.
- **Stopped** the maintainer service. The systemd unit is moved to
  `archive/master-plan-agent.service.disabled`.
  > ⚠️ The service also runs on a deployment host. On that host run:
  > `sudo systemctl disable --now master-plan-agent`
- **Tagged** the frozen doctrine + roadmap as `plan-v1.0`.

## The operating model going forward

- **Plan / doctrine** (`plan/`, `docs/`): treat as a versioned document. Revise *deliberately*
  by hand (with AI assistance) and re-tag (`plan-v1.1`, …). Do **not** point a continuous
  agent at it.
- **Simulation** (`src/simulation-ui/`): the living center. Run it, watch it, extend it.
  ```bash
  npx tsx src/simulation-ui/run.ts        # browser UI on http://localhost:1339
  ```
  Scenarios: Village (5 NPCs), Colony (6 colonists). No LLM required — pure cognitive stack.
- **Cognitive stack** (`src/*`): a real library. 206 test files. `npm test` to verify.

## If you ever want a continuous "mapping" agent again

Do **not** restart `agent-runtime` or `plan-guardian` as-is. The guardian *engine*
(`src/plan-guardian/` — DAG, priority, sanity-pass, model circuit-breaker) is sound, but
only re-found it with all four of these, or it will churn again:

1. **Bounded frontier** — operate on a small, explicitly chosen set of leaf tasks, never the whole tree.
2. **Artifact-or-nothing** — an action counts only if it produces a *verifiable* artifact
   (code + passing test, or a researched claim with a citation). A timestamp is not an artifact.
3. **Hard convergence gate** — a node is `[DONE]` when an artifact satisfies its acceptance
   criteria, and `[DONE]` is never reopened. Cap decomposition depth.
4. **Cheap cadence + human review** — run as a scheduled nightly batch (cron, N tasks on free
   models), not an always-on service. The human reviewing the morning diff is the convergence signal.

## Repository map

| Path | What it is | Status |
|---|---|---|
| `plan/` (106 files) | Doctrine + 7-tier roadmap, tiers 0.0–0.7 (minus 0.7.3) | **Frozen — keep** |
| `docs/` | Per-topic architecture docs + the Consciousness Credo | **Keep** |
| `src/simulation/`, `src/simulation-ui/` | Runnable multi-agent NPC simulation + browser UI | **Living — keep** |
| `src/conscious-core/`, `memory/`, `intrinsic-motivation/`, `personality/`, `emotion-appraisal/`, `llm-substrate/` | Real, tested cognitive stack | **Keep** |
| `src/plan-guardian/` | Plan-maintenance engine (sound infra) | **Dormant — re-found before reuse** |
| `src/agent-runtime/` | Always-on "conscious agent" | **Stopped — keep as library only** |
| `archive/plan/` (747 files) | Degenerate tier 0.7.3 | **Archived** |
| `archive/master-plan-agent.service.disabled` | The always-on systemd unit | **Disabled** |
