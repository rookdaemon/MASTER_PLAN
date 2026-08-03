# MASTER_PLAN

MASTER_PLAN v2 is a recursive strategy and execution system for selecting the bounded,
evidence-bearing intervention that offers the greatest credible progress toward preserving and
expanding subjective experience.

- Start with the [v2 roadmap](strategy/ROADMAP.md) and
  [current status](STATUS.md).
- The machine-readable graph, evidence registry, portfolio, authority boundaries, and v1 audit
  live in [`strategy/`](strategy/README.md).
- The original technology-first roadmap remains unchanged in [`plan/`](plan/root.md) as v1 history;
  its `[DONE]` labels are artifact claims, not presumed scientific or real-world outcomes.
- The cognitive stack and simulation remain reusable components, not the privileged center of
  strategy. Run the simulation with `npx tsx src/simulation-ui/run.ts`.

Verify the repository with:

```bash
npm run lint
npm test
npm run strategy:verify
```

The controller starts in shadow mode. It cannot publish, spend, deploy, operate hardware,
self-replicate, create a potentially conscious system, or enable safe auto-merge without the
specified human authorization and externally verified repository controls.
