# Authority boundaries

The human serves as leader by setting goals, constraints, and constitutional values. Automated
agents form the operating body: they analyze, plan, test, review, retry, publish, merge, and run
bounded actions within those constraints.

Plan, doctrine, governance, workflow, dependency, deployment, network, security, and
constitutional changes require independent agent review and an agent-controlled merge. They do
not require routine human approval. GitHub Copilot is preferred; the trusted GitHub Models review
workflow supplies the automated second source when Copilot is unavailable.

Consequential actions require bounded plans, evidence, rollback where possible, and a fresh
qualified agent reviewer distinct from the packet owner. Risk or novelty alone does not transfer
the work to the human.

Human-in-the-loop escalation is permitted only for owner-held credentials, physical presence,
legal consent, or an unresolved constitutional conflict. Before escalating, automation must make
and record at least two alternatives, attach evidence, explain why it cannot perform the act, and
request one bounded decision. CI failures, unavailable reviewers, uncertainty, and ordinary
high-risk work remain automation responsibilities.

Safe code/test auto-merge starts disabled. It can be requested only for a bounded,
backward-compatible `src/` code/test diff after deterministic classification, behavior-covering
tests, all blocking checks, repository auto-merge, and protected-branch controls are verified.
The safe classifier cannot automatically approve its own workflow, governance, plan, doctrine,
dependency, deployment, network, security, or constitutional changes; the automated steward uses
the protected agent-review path for those changes.
