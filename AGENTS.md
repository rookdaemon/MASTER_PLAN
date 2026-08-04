- Always wrap all environment-specifics (OS, file system, time, network, and CLI interactions) in abstractions that can be injected and mocked.
- Always pass any referenced timestamps into methods as parameters so they can be properly provided in tests.
- Always employ strict TDD.
- Always strive for modularity and configurability.

## GitHub stewardship authorization

- Codex is pre-authorized to create and switch branches, commit repository-scoped changes, push them, open or update pull requests, mark pull requests ready, request GitHub reviews, and merge qualifying pull requests for `MASTER_PLAN` without asking for confirmation again.
- The human is the servant leader: they set goals, constraints, and values. The automated process is the operating body and owns routine analysis, execution, review, retry, scheduling, committing, pushing, and merging. Do not turn the human into a routine reviewer, merge operator, scheduler, or retry mechanism.
- The automated process must be proactive: an unmet strategy metric is itself a work signal. When no external actor is closing a gap and a safe repository-scoped path can reasonably advance or test it, generate and execute the next bounded, reversible experiment instead of waiting idly. Stop only for active work, an explicit cooldown, exhausted documented safe strategies, or a qualified intrinsically human boundary.
- Routine, bounded changes pass deterministic CI and auto-merge without human or agent review. This includes behavior-covered code/test changes and bounded machine-generated evidence-only updates. Protected, untested, destructive, or otherwise non-routine changes require an independent GitHub agent review and an agent-controlled merge; prefer Copilot code review and fall back to the trusted GitHub-hosted pinned local-model workflow when Copilot is unavailable.
- Escalate to the human only when an issue intrinsically requires owner-held credentials, physical presence, legal consent, or resolution of a constitutional conflict, and only after at least two documented automated alternatives have failed. Risk, novelty, uncertainty, failed CI, or unavailable agent review are not by themselves escalation grounds.
- Every escalation must include evidence, attempted alternatives, why automation cannot complete the act, and one bounded decision requested from the human. If an escalation requires a repository change, confine that change to one auditable commit.
- Codex may enable or request GitHub auto-merge when the checked-in risk policy, required CI checks, and protected-branch controls say that the change qualifies.
- This authorization does not bypass CI, branch protection, risk classification, the independent agent-review gate for non-routine changes, or qualified servant-leader escalation boundaries. Historical shadow records are evidence only: no cycle count, human review, or human approval is an operating prerequisite.
