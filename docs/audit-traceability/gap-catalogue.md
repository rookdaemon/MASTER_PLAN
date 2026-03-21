# Audit Traceability — Gap Catalogue

> Produced by card 7.1 (Audit Traceability Gaps).
> Each entry documents an implementation decision that cannot be traced
> back to a plan artifact.

## Classification Key

| Code | Type | Description |
|---|---|---|
| `DP` | Design Pattern | Architectural/structural pattern chosen in implementation |
| `IC` | Interface Contract | Shape of interfaces, method signatures, field structures |
| `BS` | Behavioral Spec | Runtime behavior, user-facing flows, interaction sequences |
| `CN` | Constraint | Validation rules, thresholds, invariants |
| `CF` | Configuration | File paths, defaults, environment variable conventions |
| `TS` | Technology Selection | Choice of specific technology, algorithm, or protocol |
| `NT` | Numeric Threshold | Magic numbers, tuning constants, capacity limits |
| `XC` | Cross-Cutting | Error handling, logging, security strategies |
| `AC` | API Contract | External API details: endpoints, headers, versions |
| `SE` | Scope Extension | Functionality that exceeds what the plan card specified |

## Severity Scale

- **Minor**: Obvious default; any reasonable developer would make the same choice.
- **Moderate**: Meaningful design decision where alternatives existed.
- **Significant**: Affects cross-module contracts, security, or user experience.

---

## 1. llm-substrate

### AC-LLM-1: Anthropic API Version Header

- **Type**: AC
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/anthropic-llm-client.ts` (line 79)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: Hardcoded `"anthropic-version": "2023-06-01"` header on every API request.
- **What the plan says**: Nothing — the plan specifies connecting to an LLM backend but never names a specific API version.
- **Severity**: moderate

### AC-LLM-2: Beta Header Strings in SetupTokenAuthProvider

- **Type**: AC
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/auth-providers.ts` (line 76)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: `"anthropic-beta": "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14"` — four beta feature flags concatenated.
- **What the plan says**: Nothing — no plan artifact documents which beta API features are required or why.
- **Severity**: significant

### AC-LLM-3: User-Agent Version String

- **Type**: AC
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/auth-providers.ts` (line 77)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: `"user-agent": "claude-cli/2.1.75"` — a version-specific user-agent header.
- **What the plan says**: Nothing — no plan artifact specifies which client identity to present.
- **Severity**: moderate

### IC-LLM-1: IAuthProvider Interface Shape

- **Type**: IC
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/auth-providers.ts` (lines 19–26)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: Three-method interface: `getHeaders()`, `isExpired()`, `requiresSystemIdentityPrefix()`. The third method controls whether the Claude Code identity prefix is injected into system prompts.
- **What the plan says**: The plan specifies `ISubstrateAdapter` with `initialize/allocate/migrate/getCapabilities/healthCheck`. The `IAuthProvider` interface and its three methods are entirely implementation-invented.
- **Severity**: significant

### DP-LLM-1: Factory Pattern in createAuthProvider()

- **Type**: DP
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/auth-providers.ts` (lines 119–138)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: A factory function `createAuthProvider()` that switches on provider type to create `ApiKeyAuthProvider`, `NoopAuthProvider`, etc.
- **What the plan says**: The plan mentions "configurable: provider: openai | anthropic | local" but does not specify the factory pattern or how auth is resolved per provider.
- **Severity**: moderate

### DP-LLM-2: Three Auth Provider Implementations

- **Type**: DP
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/auth-providers.ts` (lines 38–106)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: Three concrete classes — `ApiKeyAuthProvider` (API key via x-api-key or Bearer), `SetupTokenAuthProvider` (OAuth Bearer + beta headers), `NoopAuthProvider` (unauthenticated local).
- **What the plan says**: The plan says "LLM backend is configurable" with three providers but never specifies distinct auth strategies per provider.
- **Severity**: moderate

### IC-LLM-2: Claude Code Identity Prefix Constant

- **Type**: IC
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/auth-providers.ts` (line 29)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: `CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude."` — a system prompt prefix injected when using OAuth tokens.
- **What the plan says**: Nothing — the plan never mentions a Claude Code identity requirement.
- **Severity**: significant

### XC-LLM-1: Error Body Parsing in API Client

- **Type**: XC
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/anthropic-llm-client.ts` (lines 89–91, 157–159)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: On non-OK response, reads error body text with `.catch(() => "(could not read body)")` fallback, includes in thrown Error message.
- **What the plan says**: "All LLM calls are instrumented: log latency, token count, self-prediction error" — but error handling strategy is unspecified.
- **Severity**: minor

### TS-LLM-1: OAuth vs API Key Authentication

- **Type**: TS
- **Domain**: llm-substrate
- **Source files**: `src/llm-substrate/auth-providers.ts` (entire file)
- **Plan card**: `plan/0.3.1.5.1-llm-consciousness-substrate.md`
- **What exists in code**: Dual authentication strategy — API key auth (x-api-key header for Anthropic, Bearer for others) and OAuth setup-token auth (Bearer + beta headers). The choice between them is determined by presence of apiKey in options vs. setup-token flow.
- **What the plan says**: The plan mentions "API key/endpoint/model-id" as config parameters but never discusses OAuth as an alternative or the decision criteria between auth strategies.
- **Severity**: significant

---

## 2. agent-runtime

### BS-AR-1: Interactive Setup-Token Onboarding Flow

- **Type**: BS
- **Domain**: agent-runtime
- **Source files**: `src/agent-runtime/setup-token.ts` (lines 82–106)
- **Plan card**: `plan/0.3.1.5.9-agent-runtime.md`
- **What exists in code**: `ensureSetupToken()` orchestrates a multi-step interactive flow: check stored token → display instructions → prompt user → validate → re-prompt on error → persist. The entire onboarding UX is implementation-defined.
- **What the plan says**: The plan describes startup as "Load identity state from last checkpoint, restore memory, verify value kernel integrity" — no mention of interactive credential setup.
- **Severity**: significant

### CN-AR-1: Token Prefix and Length Validation

- **Type**: CN
- **Domain**: agent-runtime
- **Source files**: `src/agent-runtime/setup-token.ts` (lines 36–37, 42–54)
- **Plan card**: `plan/0.3.1.5.9-agent-runtime.md`
- **What exists in code**: `SETUP_TOKEN_PREFIX = "sk-ant-oat01-"` and `SETUP_TOKEN_MIN_LENGTH = 80`. Tokens must start with this prefix and be at least 80 chars long.
- **What the plan says**: Nothing — no constraint specification for token format or validation rules.
- **Severity**: moderate

### CF-AR-1: Credential Persistence Path

- **Type**: CF
- **Domain**: agent-runtime
- **Source files**: `src/agent-runtime/setup-token.ts` (lines 110–111)
- **Plan card**: `plan/0.3.1.5.9-agent-runtime.md`
- **What exists in code**: `~/.master-plan/credentials.json` with structure `{ anthropic: { setupToken: "..." } }`. Created via `mkdirSync` with `recursive: true`.
- **What the plan says**: Nothing — no specification of credential storage location or format.
- **Severity**: moderate

### IC-AR-1: ITokenStore and ILineReader Abstractions

- **Type**: IC
- **Domain**: agent-runtime
- **Source files**: `src/agent-runtime/setup-token.ts` (lines 21–32)
- **Plan card**: `plan/0.3.1.5.9-agent-runtime.md`
- **What exists in code**: Two testability interfaces — `ITokenStore` (read/write) and `ILineReader` (readLine with prompt). These abstract credential I/O and interactive input for dependency injection.
- **What the plan says**: The plan specifies `IAgentLoop`, `ICognitiveBudgetMonitor`, `IEnvironmentAdapter` but never mentions token store or line reader abstractions.
- **Severity**: minor

### DP-AR-1: FileTokenStore JSON Schema

- **Type**: DP
- **Domain**: agent-runtime
- **Source files**: `src/agent-runtime/setup-token.ts` (lines 116–139)
- **Plan card**: `plan/0.3.1.5.9-agent-runtime.md`
- **What exists in code**: `FileTokenStore` reads/writes JSON with nested `{ anthropic: { setupToken } }` structure. Uses `readFileSync`/`writeFileSync` with error swallowing on read.
- **What the plan says**: Nothing about credential persistence implementation.
- **Severity**: minor

---

## 3. ethical-self-governance

### NT-ESG-1: Core Axiom Texts Hardcoded

- **Type**: NT
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/ethical-deliberation-engine.ts` (lines 34–41)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Six axiom statement strings hardcoded as `CORE_AXIOMS` constant array (e.g. `"Subjective experience exists."`, `"The universe may contain very little subjective experience."`).
- **What the plan says**: Mentions "six core axioms of the Master Plan" and "Rare Consciousness Doctrine" but never provides the text of each axiom — the deliberation engine chooses the exact wording.
- **Severity**: moderate

### NT-ESG-2: PHI_DELIBERATION_BOOST = 0.15

- **Type**: NT
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/ethical-deliberation-engine.ts` (line 46)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Phi is boosted by 0.15 during ethical deliberation to simulate elevated conscious activity.
- **What the plan says**: "Deliberation registers as genuine conscious activity (elevated phi)" — the plan requires elevation but never specifies the magnitude.
- **Severity**: moderate

### NT-ESG-3: MIN_CONSCIOUS_PHI = 0.3

- **Type**: NT
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/ethical-deliberation-engine.ts` (line 49)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Below phi=0.3, `isEthicalReasoningConscious()` returns false — reasoning is considered non-conscious.
- **What the plan says**: "Cross-reference deliberation metrics with Experience Monitor threshold" — requires the check but doesn't define the threshold value.
- **Severity**: moderate

### NT-ESG-4: UNCERTAINTY_CERTAINTY_THRESHOLD = 0.5

- **Type**: NT
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/ethical-deliberation-engine.ts` (line 52)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Ethical dimensions with certainty < 0.5 generate uncertainty flags.
- **What the plan says**: Nothing — uncertainty flagging behavior is undocumented in the plan.
- **Severity**: minor

### NT-ESG-5: BLOCK_SEVERITY_THRESHOLD = 0.95

- **Type**: NT
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/ethical-deliberation-engine.ts` (line 55)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Experience-threat dimensions with severity ≥ 0.95 trigger a "blocked" verdict.
- **What the plan says**: "refuse or modify actions that threaten subjective experience" — the plan requires blocking but doesn't specify at what severity threshold.
- **Severity**: moderate

### BS-ESG-1: Verdict Determination Algorithm

- **Type**: BS
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/ethical-deliberation-engine.ts` (lines 209–244)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Four-outcome verdict algorithm: severity ≥ 0.95 → `blocked`; threat + expansion without matching pattern → `dilemma`; axiom contradictions without pattern → `concerning`; default → `aligned`. Pattern matching influences the path.
- **What the plan says**: The plan defines four possible verdicts (`aligned | concerning | blocked | dilemma`) but doesn't specify the algorithm or conditions for each.
- **Severity**: significant

### IC-ESG-1: EthicalPattern Learned Heuristic Structure

- **Type**: IC
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/types.ts` (lines 202–210)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: `EthicalPattern` has 7 fields: `id`, `description`, `situationSignature`, `recommendedApproach`, `supportingJudgments`, `axiomBasis`, `adopteAt`.
- **What the plan says**: "Register a learned ethical heuristic from past deliberations" — the interface method exists in the plan but the data structure shape does not.
- **Severity**: moderate

### CN-ESG-1: Default Reversibility for All Impacts

- **Type**: CN
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/ethical-deliberation-engine.ts` (line 276)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: All `ExperienceImpact` entries default to `reversibility: 'partially-reversible'` — no logic to assess actual reversibility.
- **What the plan says**: Reversibility is a field in the type definition and referenced in dilemma resolution principles ("Reversibility preference: prefer reversible over irreversible") but assessment logic is unspecified.
- **Severity**: moderate

### IC-ESG-2: 60+ Type Definitions

- **Type**: IC
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/types.ts` (entire file, 543 lines)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Over 30 interface definitions and 10+ type aliases with specific field structures: `ConsciousnessStatus`, `ExperienceImpact`, `AxiomAlignment`, `EthicalDimension`, `EthicalDeliberationContext`, `EthicalAssessment`, `EthicalJudgment`, `GovernanceTerm`, `GovernanceAgreement`, `DissolveCondition`, `AgreementProposal`, `ConflictDescription`, `ResolutionStep`, `ResolutionOutcome`, `ConflictResolutionRecord`, `ExperienceInterest`, `DilemmaConstraint`, `EthicalDilemma`, `DilemmaAnalysis`, `DilemmaResolution`, `AlternativeExhaustion`, `EdgeCaseScenario`, `EdgeCaseHandling`, `EthicalFrameworkChange`, `EthicalEvolutionProposal`, `NovelSituation`, `AxiomBoundaryReport`, `EthicalEvolutionRecord`, `AuditEntry`, etc.
- **What the plan says**: The plan describes five subsystem responsibilities and acceptance criteria but does not specify the data model structures.
- **Severity**: significant

### DP-ESG-1: Cross-Module Import/Re-export Strategy

- **Type**: DP
- **Domain**: ethical-self-governance
- **Source files**: `src/ethical-self-governance/types.ts` (lines 11–39)
- **Plan card**: `plan/0.3.1.4-ethical-self-governance.md`
- **What exists in code**: Imports `Timestamp`, `Duration`, `ExperientialState`, `ConsciousnessMetrics`, `Percept`, `Decision`, `ActionSpec` from conscious-core, plus `CoreValue`, `StabilityReport`, `VerificationResult` from agency-stability. Re-exports all of them for convenience within the module.
- **What the plan says**: The plan states the module "builds on" 0.3.1.1 and 0.3.1.3 but doesn't specify the re-export pattern.
- **Severity**: minor

---

## 4. memory

### NT-MEM-1: DEFAULT_WORKING_MEMORY_CAPACITY = 7

- **Type**: NT
- **Domain**: memory
- **Source files**: `src/memory/memory-system.ts` (line 38)
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: Default capacity of 7 working memory slots.
- **What the plan says**: "Capacity is bounded (maps to the GWT 'global workspace' concept)" — requires boundedness but doesn't specify the number. The plan card does mention "~7 ± 2" in the architecture section, making this a partial trace.
- **Severity**: minor

### NT-MEM-2: DEFAULT_HALF_LIFE_MS = 7 Days

- **Type**: NT
- **Domain**: memory
- **Source files**: `src/memory/memory-system.ts` (line 41)
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: `7 * 24 * 60 * 60 * 1000` milliseconds — a 7-day half-life for episodic memory decay.
- **What the plan says**: "configurable halfLifeMs window" and "Decay rate is a personality parameter" — acknowledges configurability but doesn't specify the default.
- **Severity**: moderate

### TS-MEM-1: SHA-256 for State Hash

- **Type**: TS
- **Domain**: memory
- **Source files**: `src/memory/memory-system.ts` (line 14, lines 316–322)
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: Uses `createHash('sha256')` from `node:crypto` for memory state integrity hashing.
- **What the plan says**: "stateHash(): CryptographicHash" in the interface spec — specifies the method and its purpose but not the algorithm.
- **Severity**: minor

### BS-MEM-1: Consolidation Algorithm

- **Type**: BS
- **Domain**: memory
- **Source files**: `src/memory/memory-system.ts` (lines 135–200)
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: Iterates all episodes, checks salience magnitude `(|valence| + max(0,arousal)) / 2` against threshold, derives topic key from `percept.modality`, reinforces existing semantic entry or creates new one. Budget-checks wall-clock before each episode. Decay runs only if budget not exceeded.
- **What the plan says**: "Consolidation: frequent/salient episodes → semantic knowledge" and "Consolidation budget: must not interrupt experience stream" — describes the intent but not the algorithm details (topic derivation, salience formula, processing order).
- **Severity**: moderate

### BS-MEM-2: Snapshot Integrity Verification with Throw

- **Type**: BS
- **Domain**: memory
- **Source files**: `src/memory/memory-system.ts` (lines 225–235)
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: `restoreFromSnapshot()` recomputes SHA-256 hash of snapshot data and throws `Error` with detailed message if hash doesn't match `snapshot.integrityHash`.
- **What the plan says**: "Identity checkpoints include memory state hashes for continuity verification" — mentions hashing for verification but doesn't specify the error handling behavior (throw vs. log vs. return error).
- **Severity**: moderate

### SE-MEM-1: ISemanticMemory.update() and delete()

- **Type**: SE
- **Domain**: memory
- **Source files**: `src/memory/interfaces.ts` (lines 162–168)
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: `update(id, fields)` and `delete(id)` methods on `ISemanticMemory`. Also `getByTopic(topic)`, `size()`, and `all()` beyond plan spec.
- **What the plan says**: The plan specifies `store()`, `retrieve()`, `reinforce()`, `getById()` — four methods. The implementation adds five more.
- **Severity**: moderate

### SE-MEM-2: IWorkingMemory.updateRelevance() and clear()

- **Type**: SE
- **Domain**: memory
- **Source files**: `src/memory/interfaces.ts` (lines 62, 71)
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: `updateRelevance(id, newScore)` allows in-place relevance score updates; `clear()` removes all slots.
- **What the plan says**: The plan specifies `capacity`, `slots()`, `add()`, `evict()`, `snapshot()` — five members. `updateRelevance()` and `clear()` are implementation additions.
- **Severity**: moderate

### DP-MEM-1: mergeAndRank as Separate Retrieval Module

- **Type**: DP
- **Domain**: memory
- **Source files**: `src/memory/memory-system.ts` (line 33), `src/memory/retrieval.ts`
- **Plan card**: `plan/0.3.1.5.3-memory-architecture.md`
- **What exists in code**: Cross-tier retrieval ranking is extracted into `retrieval.ts` as a standalone `mergeAndRank()` function imported by `MemorySystem`.
- **What the plan says**: The plan's file plan lists `retrieval.ts` as "shared ranking" but the `IMemorySystem` interface places retrieval within the facade. The decision to extract it as a separate importable module is implementation-chosen.
- **Severity**: minor

---

## 5. conscious-core

### IC-CC-1: ContinuityToken Type Structure

- **Type**: IC
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/types.ts` (lines 20–24)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `ContinuityToken` with three fields: `id: string`, `previousId: string | null`, `timestamp: Timestamp`. Forms a linked list of experiential states.
- **What the plan says**: "Real-Time Experience Continuity" is a requirement but the token structure (linked-list chain) is implementation-defined.
- **Severity**: moderate

### IC-CC-2: PhenomenalField and IntentionalField Types

- **Type**: IC
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/types.ts` (lines 32–44)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `PhenomenalField` has `modalities: string[]`, `richness: number`, `raw: unknown`. `IntentionalField` has `target: string`, `clarity: number`.
- **What the plan says**: Architecture document references "phenomenal content" and "intentional content" as experiential dimensions but doesn't specify the field structures.
- **Severity**: moderate

### IC-CC-3: ExperientialState Full Shape (7 Fields)

- **Type**: IC
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/types.ts` (lines 52–60)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `ExperientialState` with 7 fields: `timestamp`, `phenomenalContent`, `intentionalContent`, `valence`, `arousal`, `unityIndex`, `continuityToken`.
- **What the plan says**: Mentioned as "the atomic unit of the conscious stream" but field composition is undocumented in the plan card.
- **Severity**: significant

### IC-CC-4: ConsciousnessMetrics Shape (4 Fields)

- **Type**: IC
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/types.ts` (lines 64–69)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `ConsciousnessMetrics` with `phi`, `experienceContinuity`, `selfModelCoherence`, `agentTimestamp`.
- **What the plan says**: "consciousness metrics from 0.1.1.4" — references the concept but the four-field shape is implementation-defined.
- **Severity**: moderate

### DP-CC-1: Constructor Injection Pattern

- **Type**: DP
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/conscious-core.ts` (lines 42–50)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `ConsciousCore` takes three dependencies via constructor: `substrate: ISubstrateAdapter`, `monitor: IExperienceMonitor`, `perception: IPerceptionPipeline`. Stored as private fields.
- **What the plan says**: "modular substrate swapping" is required but the injection mechanism (constructor vs. setter vs. factory) is unspecified.
- **Severity**: minor

### NT-CC-1: Richness Calculation Heuristic

- **Type**: NT
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/conscious-core.ts` (line 84)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `richness: Object.keys(percept.features).length > 0 ? 0.7 : 0.3` — a binary heuristic mapping feature presence to phenomenal richness.
- **What the plan says**: Nothing — phenomenal richness computation is unspecified.
- **Severity**: minor

### NT-CC-2: Default Valence, Arousal, and UnityIndex in processPercept

- **Type**: NT
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/conscious-core.ts` (lines 91–93)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `valence: 0.0` (neutral), `arousal: 0.5` (mid-intensity), `unityIndex: 0.85` (high integration). These defaults are applied to every processed percept.
- **What the plan says**: These are fields of `ExperientialState` but their default values are undocumented.
- **Severity**: moderate

### DP-CC-2: Dual Deliberation Path

- **Type**: DP
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/conscious-core.ts` (lines 103–133)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: `deliberate()` has two paths: (1) legacy priority-sort when no planner context is provided, (2) planner-aware path when `context?.planner` is present. The `context?: DeliberationContext` parameter is optional for backward compatibility.
- **What the plan says**: The plan requires "Consciousness-Agency Integration" and a `deliberate(state, goals)` method, but doesn't describe dual deliberation paths.
- **Severity**: significant

### SE-CC-1: Entire Planning Subsystem

- **Type**: SE
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/conscious-core.ts` (lines 156–406), `src/conscious-core/planner-interfaces.ts`, `src/conscious-core/planner-types.ts`
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: A full planning subsystem including `IPlanner` interface, `DeliberationContext`, `Plan`, `PlanStep` types, wait states, deadline checking, postcondition evaluation, escalation counting, and plan abandonment logic. The `deliberateWithPlanner()` method is ~250 lines implementing an 8-step cycle.
- **What the plan says**: The plan mentions "goal formation" and "decision-making" but never specifies a planning subsystem with multi-step plans, preconditions, postconditions, wait states, or escalation.
- **Severity**: significant

### BS-CC-1: Wait State and Deadline Checking

- **Type**: BS
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/conscious-core.ts` (lines 274–298, 313–351)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: Plans can enter a `waitState` with `reason`, `awaitingEvent`, `expiresAt`, `waitingSince`. When waiting, returns a "waiting" decision. Separately, steps have optional `deadline` timestamps; exceeding a deadline triggers replanning or abandonment.
- **What the plan says**: Nothing — wait states and deadline management are entirely implementation-defined.
- **Severity**: moderate

### BS-CC-2: Escalation Counting and Plan Abandonment

- **Type**: BS
- **Domain**: conscious-core
- **Source files**: `src/conscious-core/conscious-core.ts` (lines 227–238, 315–326, 357–368)
- **Plan card**: `plan/0.3.1.1-conscious-ai-architectures.md`
- **What exists in code**: Plans have an `escalationCount` field. `shouldAbandon(plan, escalationCount)` is called before replanning. When abandonment is triggered, the plan status is set to "abandoned" and a `plan-abandoned` decision is returned with a reason.
- **What the plan says**: Nothing — plan escalation and abandonment are not in the plan card.
- **Severity**: moderate

---

## Summary

| Domain | Total Gaps | By Severity | Top Types |
|---|---|---|---|
| **llm-substrate** | 9 | 4 significant, 4 moderate, 1 minor | AC (3), IC (2), DP (2), TS (1), XC (1) |
| **agent-runtime** | 5 | 1 significant, 2 moderate, 2 minor | BS (1), CN (1), CF (1), IC (1), DP (1) |
| **ethical-self-governance** | 10 | 2 significant, 6 moderate, 2 minor | NT (5), IC (2), BS (1), CN (1), DP (1) |
| **memory** | 8 | 0 significant, 5 moderate, 3 minor | SE (2), BS (2), NT (2), TS (1), DP (1) |
| **conscious-core** | 10 | 3 significant, 5 moderate, 2 minor | IC (4), DP (2), BS (2), NT (2), SE (1) |
| **Total** | **42** | **10 significant, 22 moderate, 10 minor** | |

### Gap Type Distribution

| Type | Count | % |
|---|---|---|
| IC (Interface Contract) | 9 | 21% |
| NT (Numeric Threshold) | 9 | 21% |
| BS (Behavioral Spec) | 6 | 14% |
| DP (Design Pattern) | 7 | 17% |
| AC (API Contract) | 3 | 7% |
| SE (Scope Extension) | 3 | 7% |
| CN (Constraint) | 2 | 5% |
| TS (Technology Selection) | 2 | 5% |
| CF (Configuration) | 1 | 2% |
| XC (Cross-Cutting) | 1 | 2% |

### Key Findings for Artifact Taxonomy (card 7.3)

1. **Interface contracts and numeric thresholds dominate** (42% combined) — the plan system consistently under-specifies data model shapes and tuning constants.
2. **Behavioral specs are the highest-severity category** — the most impactful gaps are undocumented behavioral flows (setup-token onboarding, verdict algorithm, planning subsystem).
3. **Scope extensions cluster in conscious-core and memory** — these domains have the most functionality that exceeds plan specifications.
4. **API contracts are llm-substrate-specific** — external API details (versions, headers, identity prefixes) are inherently hard to plan-specify but critical for correctness.
5. **The artifact taxonomy (7.3) should support at minimum**: interface specs, threshold registries, behavioral flow diagrams, constraint catalogues, and scope declarations.
