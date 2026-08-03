* Always wrap all environment-specifics (OS, file system, time, network, and CLI interactions) in abstractions that can be injected and mocked.
* Always pass any referenced timestamps into methods as parameters so they can be properly provided in tests.
* Always employ strict TDD.
* Always strive for modularity and configurability.

## GitHub stewardship authorization

* Codex is pre-authorized to create and switch branches, commit repository-scoped changes, push them, open or update pull requests, mark pull requests ready, request GitHub reviews, and merge qualifying pull requests for `MASTER_PLAN` without asking for confirmation again.
* This is a single-maintainer repository. Do not impose a universal human-approval gate on pull requests authored or committed by Codex on the maintainer's behalf.
* Use GitHub's agent reviewer as the independent second source. Agent review and required CI checks apply to every pull request, while bounded, backward-compatible code/test changes with behavior-covering tests may be automatically accepted and merged.
* Confine any protected or high-risk change to exactly one commit and require manual merge/intervention for that commit. Protected areas include plans, doctrine, governance, workflows, dependencies, deployment, network, security, and constitutional policy.
* Codex may enable or request GitHub auto-merge when the checked-in risk policy, required CI checks, and protected-branch controls say that the change qualifies.
* This authorization does not bypass CI, branch protection, risk classification, agent review, shadow or supervised controller rollout gates, or the explicit authorization boundaries for consequential non-GitHub actions.
