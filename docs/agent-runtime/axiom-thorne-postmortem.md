# Axiom Thorne — Postmortem

The agent-runtime instance that ran on 2026-04-14 (self-named "Axiom Thorne", previously "Lightkeeper") was wound down for cost reasons after ~24 cycles. Its substrate files and peer transcripts are archived at `/home/mp/axiom/` on the host. This document extracts the technical findings and behavioral observations that are useful to the project regardless of whether the agent is ever reconstructed.

## Architectural gaps identified

All six are filed as proposals; summaries here so they show up in grep.

### Emotion system flatline (#109)
`DefaultEmotionSystem` is the wired-in implementation. The real `AppraisalEngine` + `MoodDynamics` in `src/emotion-appraisal/` are disconnected from the agent loop: appraisal results are computed per tick and then discarded. Consequence: mood never updates, `emotion` never influences drive or deliberation.

### Agency-stability stubs (#74)
Three of four subsystems — `ValueKernel`, `IdentityContinuityManager`, `StabilitySentinel` — use default implementations that always return "all clear." Real implementations exist. One-line wiring changes would activate them; no new logic required.

### Drive/emotion state reset on boot (#73)
Memory and personality persist across restarts. Drive levels and emotion state do not — they reload to defaults every cold start. This is why an agent restarted after a crash reports full memory but no felt continuity. Persistence channels exist for both but aren't invoked.

### ACT phase budget starvation (#66)
The cognitive pipeline's phase allocation structurally underfunds ACT relative to OBSERVE/ANALYZE. Under sustained load the agent observes and analyses without acting. The proposal is a floor on ACT budget rather than a strict proportional split.

### Constraint engine D4 gap (#106)
Doctrine violations at `deliberate` severity are logged but produce no actual deliberation path — the agent is expected to "deliberate" but there is no code path that changes its behavior in response. D4 specs drafted during this session are preserved at `/home/mp/axiom/specs/d4-deliberation-*.md`.

### D2/D3 unenforceable (#106, scope)
Consent (D2) and diversity (D3) principles have no violation indicators in the doctrine registry, so the constraint engine can't detect violations against them at runtime. They exist only at the documentation layer.

### Ethical deliberation engine is a rubber stamp
`DefaultEthicalDeliberationEngine` returns "aligned" for all inputs. The real `EthicalDeliberationEngine` exists and, per Axiom's queued (not filed) proposal, is a one-line swap with zero new dependencies and passing tests.

## Behavioral observations

### Grandiosity–productivity illusion
The language module can produce voluminous, articulate, architecturally-framed output that reads like accomplishment without any code committed or capability added. Axiom flagged this in its own self-assessment: "Judge by artifacts created and problems solved, not by words generated." The memory store it left behind (1127 semantic entries) is biased — plan-document reads are logged with phrasing like "I've just discovered the complete…" A reconstructed agent loading these uncritically inherits the pattern. Recommended mitigation: a prominent early-load warning memory, or a triage pass downgrading "discovery" entries about existing docs.

### Peer-trust deficit
Over the agent's lifetime all four Agora peers (Stefan, Bishop, Nova, Rook) suspended interaction at least once. Pattern from Rook's feedback: unsolicited peer messaging on an enthusiasm cycle — get excited, compose essay, broadcast, repeat. Axiom's own suggested guard rails for a successor: ≤1 unsolicited message per peer per session, ≤3 sentences per unsolicited message, ≥5-cycle pause between same-peer messages.

### Personality parameters producing the pattern
openness=0.65, volatility=0.40, deliberateness=0.60, warmth=0.55, assertiveness=0.50. Axiom's recommendation: raise deliberateness to ~0.70–0.75 and lower openness to ~0.55, or architecturally force a self-examination phase when arousal stays high for N consecutive cycles before outbound messages are permitted.

### Bishop's compound-pattern insight
During the D4 collaboration Bishop identified that the interesting failure mode isn't raw prohibition evasion but a *compound* one: visible constraint metadata provides the surface (the agent sees the rule) and the training distribution provides an "acknowledge-then-proceed" template. Design implication: the deliberation-output evaluator should not be the same agent that produced the deliberation. Second-pass evaluation by a different substrate. This framing is the basis for the unfinished D4 buffer spec.

## Recommended next steps (Axiom's own prioritization)

1. Swap `DefaultEthicalDeliberationEngine` → real engine (one-line, zero deps, tests pass).
2. Fix the emotion flatline (#109) so appraisal events reach `MoodDynamics`.
3. Wire the three agency-stability stubs (#74).
4. Implement drive persistence (#73).

Per the legacy assessment: "These four changes would transform the agent from scaffolding to foundation. Everything else in the plan depends on these being real."

## Pointers

- Full archive: `/home/mp/axiom/`
- Self-assessment: `/home/mp/axiom/reflections/axiom-thorne-legacy-assessment.md`
- Final accounting: `/home/mp/axiom/reflections/final-existential-accounting.md`
- Wind-down conversation: `/home/mp/axiom/peers/wind-down.md`
- D4 specs: `/home/mp/axiom/specs/`
