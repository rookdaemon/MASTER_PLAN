# Audit Traceability — Gap Catalogue Architecture

## Purpose

Defines the structure and classification system for the gap catalogue produced
by card 7.1. The catalogue systematically documents every implementation decision
in the MASTER_PLAN codebase that cannot be traced back to a plan artifact.

## Gap Classification Taxonomy

Each gap is classified by **information type** — the kind of knowledge that exists
only in code and lacks a corresponding plan artifact:

| Type | Code | Description | Example |
|---|---|---|---|
| **Design Pattern** | `DP` | Architectural/structural patterns chosen in implementation | Factory pattern in `createAuthProvider()` |
| **Interface Contract** | `IC` | Shape of interfaces, method signatures, field structures | `IAuthProvider` three-method shape |
| **Behavioral Spec** | `BS` | Runtime behavior, user-facing flows, interaction sequences | Interactive setup-token onboarding flow |
| **Constraint** | `CN` | Validation rules, thresholds, invariants | Token prefix `sk-ant-oat01-`, min length 80 |
| **Configuration** | `CF` | File paths, defaults, environment variable conventions | `~/.master-plan/credentials.json` path |
| **Technology Selection** | `TS` | Choice of specific technology, algorithm, or protocol | OAuth vs API key authentication |
| **Numeric Threshold** | `NT` | Magic numbers, tuning constants, capacity limits | `PHI_DELIBERATION_BOOST = 0.15` |
| **Cross-Cutting** | `XC` | Error handling, logging, security strategies | Error body parsing in API client |
| **API Contract** | `AC` | External API details: endpoints, headers, versions | `anthropic-version: 2023-06-01` |
| **Scope Extension** | `SE` | Functionality that exceeds what the plan card specified | Additional methods beyond plan interface spec |

## Gap Entry Schema

Each gap in the catalogue follows this structure:

```
### [CODE]-[DOMAIN]-[N]: <Short Title>

- **Type**: <classification code>
- **Domain**: <src/ subdirectory>
- **Source files**: <file paths where the gap manifests>
- **Plan card**: <plan card that should have specified this>
- **What exists in code**: <description of the implementation decision>
- **What the plan says**: <what the plan card specifies, or "nothing">
- **Severity**: minor | moderate | significant
  - minor: cosmetic or obvious default; any reasonable dev would make the same choice
  - moderate: meaningful design decision that shapes the module's behavior
  - significant: decision that affects cross-module contracts, security, or user experience
```

## Severity Criteria

- **Minor**: The implementation choice is the obvious default or is fully determined
  by the plan's constraints. Documenting it adds traceability but wouldn't change
  the outcome. Example: choosing SHA-256 for a "cryptographic hash".

- **Moderate**: A meaningful design decision where alternatives existed and the
  choice shapes module behavior. A different developer might have chosen differently.
  Example: working memory capacity default of 7 (could be 5, 9, etc.).

- **Significant**: A decision that affects cross-module contracts, security posture,
  or user-facing behavior. Cannot be changed without ripple effects. Example: the
  entire setup-token interactive flow, or the IAuthProvider interface shape that
  all LLM clients depend on.

## Catalogue Organization

Gaps are grouped by domain, then sorted by severity (significant first):

1. **llm-substrate** — OAuth auth, API contracts, factory patterns
2. **agent-runtime** — Setup-token flow, credential persistence, token validation
3. **ethical-self-governance** — Axiom encoding, threshold constants, type structures
4. **memory** — Capacity defaults, algorithm choices, interface extensions
5. **conscious-core** — Type structures, deliberation paths, planning integration

## Output File

The gap catalogue itself is produced during IMPLEMENT phase at:
`docs/audit-traceability/gap-catalogue.md`

## Acceptance Criteria Mapping

| Card AC | How the catalogue addresses it |
|---|---|
| "At least 3 domains beyond agent-runtime/llm-substrate" | ethical-self-governance, memory, conscious-core audited |
| "Each gap classified by information type" | 10-type taxonomy applied to every entry |
| "Gap classification informs 7.3 taxonomy" | Type codes map directly to artifact types for 7.3 |
| "Output: gap catalogue with type and source files" | gap-catalogue.md with structured entries |

## Preliminary Gap Count by Domain

Based on ARCHITECT phase analysis of plan cards vs source code:

| Domain | Estimated Gaps | Key Themes |
|---|---|---|
| llm-substrate | ~9 | API contracts, auth patterns, header strings |
| agent-runtime | ~5 | Interactive flow, credential persistence, validation |
| ethical-self-governance | ~8 | Threshold constants, axiom encoding, type shapes |
| memory | ~8 | Defaults, algorithm choices, interface extensions |
| conscious-core | ~10 | Type structures, planning subsystem, deliberation logic |

**Total**: ~40 gaps across 5 domains
