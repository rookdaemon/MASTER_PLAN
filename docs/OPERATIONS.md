# Operating MASTER_PLAN

## Operating model

The human servant leader sets goals, constraints, and constitutional values. The automated
operating body analyzes evidence, selects bounded work, implements, tests, retries,
integrates results, and maintains the repository within those constraints. Routine work is not
transferred to the human merely because it is difficult, novel, uncertain, or temporarily failing.

Only one work packet may be active. Each packet has explicit acceptance criteria, tests or
preregistration, authority classification, evidence requirements, and a retry identity. Repository
updates are integrated after deterministic verification.

## Controller lifecycle

1. Observe configured repository and public sources through injected environment ports.
2. Canonicalize and deduplicate observations without persisting raw untrusted content.
3. Adjudicate relevant evidence and update affected hypotheses.
4. Diagnose high-value uncertainty, bottlenecks, neglected portfolios, failure modes, and metric
   gaps.
5. Generate eligible bounded work from stable packet series; when passive triggers are quiet, fill a
   proactive bounded backlog from feasible series.
6. Rank the frontier with preservation receiving lexical priority over expansion.
7. Execute one packet within its authority boundary.
8. Integrate positive, negative, or null evidence and re-evaluate the graph.

All filesystem, time, network, process, and command-line behavior crosses injectable interfaces.
Methods receive referenced timestamps from callers; strategy logic does not read ambient time.

## Authority boundaries

Repository updates—including plans, doctrine, governance, workflows, dependencies, deployment,
network behavior, security, and constitutional interpretation—use the same deterministic CI checks.
There are no special update classifications, model-review gates, or merge-policy exceptions.

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
failures, risk, novelty, and uncertainty remain automation responsibilities.

## Constitutional amendment

G1–G3 and the ethical invariants in [PLAN](PLAN.md) are constitutional. Agents may improve wording,
validation, or implementation without changing their meaning. A normative change requires:

1. the exact proposed change;
2. evidence and rationale;
3. the strongest known objections;
4. expected and downside consequences;
5. the servant leader's bounded normative decision and supplied timestamp; and
6. a machine-readable record naming every affected strategy node.

The operating body prepares, tests, and merges the resulting change after that decision.

## Guardian communication

Guardian communication is collaborative rather than an update gate. A configured connector can ask
for `status` or `help` and receive an immediate answer. Any other message is stored in the
machine-readable Guardian inbox, included in the next bounded cycle, and answered through the
Guardian update stream. Guardian publishes one concise cycle summary explaining the executed work and
its ranked-strategy reason. A successful cycle does not idle for a passive trigger: it selects the
highest-ranked feasible packet from the proactive bounded backlog.

When an exceptional escalation requires an intrinsically human act, Guardian posts one bounded
question. Reply with `answer <question-id> <text>`; the answer is recorded as input, not treated as
an approval, consent record, credential, or constitutional amendment by itself.

Slack is the supported transport. Set the repository secret `SLACK_WEBHOOK_URL` to an incoming
webhook URL for outbound updates. A Slack slash-command relay can dispatch `guardian-cycle.yml`
with its Slack member ID in `sender` and the command text in `message`; the workflow then queues the
message and begins the next cycle immediately. The relay needs its own Slack signing secret and a
GitHub workflow-dispatch credential; neither belongs in this repository.

## Update policy

- Deterministic CI must pass type checking, unit and integration tests, documentation verification,
  and strategy verification.
- No review classifier, agent reviewer, special merge policy, or protected-change exception controls
  repository updates.
- Verified results are immutable assessments. Later contradiction creates a superseding assessment.
- Failed automation selects and records bounded alternatives; it does not ask the human to become a
  retry mechanism.

## Current operating state

<!-- GENERATED:OPERATING-STATE:START -->
- Mode: **automated stewardship**.
- Repository updates use deterministic CI only.
- Reviewed results since the current baseline: **3**.
- Active work packets: **0**.
- Guardian executes the highest-ranked feasible bounded packet every hour and proactively fills an empty frontier.
- Guardian publishes one explanatory cycle summary and accepts immediate status requests plus queued messages and answers through configured connectors.
- The controller maintains a proactive bounded backlog; a successful cycle does not idle for a passive trigger.
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
- `guardian-inbox.json`, `guardian-questions.json`, and `guardian-updates.json` — queued human
  messages, bounded questions, and delivery-tracked progress or replies.

## Repository components

- `src/master-plan-controller/` implements pure graph, evidence, ranking, gating, packet, review,
  and integration behavior plus environment adapters.
- Independent scientific, cognitive, infrastructure, and simulation modules are research artifacts
  catalogued through [REFERENCE](REFERENCE.md).
- `.github/workflows/` supplies blocking CI only.

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
npm run guardian:status
npm run guardian:inbox -- <timestamp> <sender> <message>
npm run guardian:communicate -- <timestamp>
npm run guardian:notify -- <timestamp>
```

The optional simulation UI runs with:

```bash
npx tsx src/simulation-ui/run.ts
```

Return to the [repository orientation](../README.md), read the [canonical plan](PLAN.md), or browse
the [reference map](REFERENCE.md).
