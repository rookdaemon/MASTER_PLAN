# Agent Runtime Architecture — As-Built Document

> **Card**: 0.0.1 Agent Runtime Architecture
> **Purpose**: Documents the running agent architecture as actually implemented in source, not aspirational design.
> **Authority**: This document is authoritative for "what runs today." For design intent, see `ARCHITECTURE.md`.

---

## 1. System Overview

The agent is a continuously operating system built on constructor-injected subsystems orchestrated by an 8-phase tick loop. All processing flows through the Conscious Core's experiential pipeline — no action reaches the environment without passing through `IConsciousCore.deliberate()` → `IActionPipeline.execute()` (the "no zombie bypass" invariant).

**Source**: `src/agent-runtime/agent-loop.ts` (class `AgentLoop implements IAgentLoop`)

### 1.1 Constructor Dependencies (12 required + 1 optional)

```
AgentLoop(
  _core:            IConsciousCore,           // src/conscious-core/interfaces.ts
  _perception:      IPerceptionPipeline,      // src/conscious-core/interfaces.ts
  _actionPipeline:  IActionPipeline,          // src/conscious-core/interfaces.ts
  _monitor:         IExperienceMonitor,       // src/conscious-core/interfaces.ts
  _sentinel:        IStabilitySentinel,       // src/agency-stability/interfaces.ts
  _identityManager: IIdentityContinuityManager, // src/agency-stability/interfaces.ts
  _ethicalEngine:   IEthicalDeliberationEngine, // src/ethical-self-governance/interfaces.ts
  _memory:          IMemoryStore,             // src/agent-runtime/interfaces.ts
  _emotionSystem:   IEmotionSystem,           // src/agent-runtime/interfaces.ts
  _driveSystem:     IDriveSystem,             // src/intrinsic-motivation/interfaces.ts
  _adapter:         IEnvironmentAdapter,      // src/agent-runtime/interfaces.ts
  _budgetMonitor:   ICognitiveBudgetMonitor,  // src/agent-runtime/interfaces.ts
  llm?:             ILlmClient,               // optional — enables real LLM inference
)
```

Additional subsystems are set post-construction via setter methods: `IMemorySystem`, `IPersonalityModel`, `IGoalCoherenceEngine`, `DrivePersonalityParams`, `InnerMonologueLogger`, workspace path, etc.

---

## 2. The 8-Phase Tick Cycle

Each tick executes in strict order. The loop runs in `AgentLoop.start()` with a configurable pause between ticks (default: `TICK_PAUSE_MS = 300000` ms / 5 minutes, env-configurable).

### Phase 1 — PERCEIVE
**Source**: `agent-loop.ts` lines ~496–572

- Polls `IEnvironmentAdapter.poll()` for `RawInput[]`
- Queues peer messages (Agora) separately; processes at most **one queued peer message per tick**
- Non-peer inputs (web/stdio) are processed immediately
- Converts `RawInput` → `SensorData` → `Percept` via `IPerceptionPipeline.ingest()`
- Derives `ExperientialState` via `IConsciousCore.processPercept()`
- On idle tick (no input): reuses last experiential state; on very first tick, synthesizes an idle percept
- Tracks `_lastSocialInteractionAt` for drive system

### Phase 2 — RECALL
**Source**: `agent-loop.ts` lines ~574–581

- Calls `IMemoryStore.retrieve(experientialState)` → ranked memory items
- Composite scoring: `similarity × recencyWeight × salienceBoost` (see §5 Memory Architecture)

### Phase 3a — APPRAISE
**Source**: `agent-loop.ts` lines ~583–590

- Calls `IEmotionSystem.appraise(percept, goals, values)` → `AppraisalResult`
- Produces dimensional valence/arousal shifts (never discrete emotion labels)
- Goal congruence weighted by priority; value threats produce hard floor at -0.8

### Phase 3b — DRIVE TICK
**Source**: `agent-loop.ts` lines ~592–696

- Calls `IDriveSystem.tick(experientialState, driveContext)` → `DriveTickResult`
- 8 drives evaluated: curiosity, social, homeostatic-arousal, homeostatic-load, homeostatic-novelty, boredom, mastery, existential
- Experiential delta (valence/arousal shifts) applied to state immediately
- **Strongest single candidate** submitted to goal coherence engine (deduplicated against active drive goals)
- Satiated drives cleaned up; valence recovery: `min(satiatedCount × 0.15, 0.5)`

### Phase 4 — DELIBERATE
**Source**: `agent-loop.ts` lines ~698–756

- `IConsciousCore.deliberate(experientialState, goals, context?)` → `Decision`
- If planner non-null: multi-step planning with budget
- If planner null: legacy priority-sort
- `IPersonalityModel.applyToDeliberation(decision, state)` adjusts confidence by `0.1 × (assertiveness - 0.5) - 0.05 × (deliberateness - 0.5)` and scores alternative actions against trait dimensions
- `IEthicalDeliberationEngine.extendDeliberation()` applied to all decisions
- Drive-initiated goals override `observe` → `communicate:drive` action type

### Phase 5 — ACT
**Source**: `agent-loop.ts` lines ~758–976

- `IActionPipeline.execute(decision)` → `ActionResult`
- **Communicative actions with LLM**: enriched inference with per-peer conversation history isolation (`_peerConversationHistories` map keyed by peer name)
- **Drive-initiated actions**: `_executeDriveToolLoop()` with tool-use (max `MAX_TOOL_ITERATIONS = 16` iterations)
- Outgoing messages logged to per-peer persistent chat log
- Activity log updated for boredom/mastery evaluation (capped at `ACTIVITY_LOG_CAP = 20` records)

### Phase 6 — MONITOR
**Source**: `agent-loop.ts` lines ~982–1030

- **NEVER skipped, NEVER truncated** (even under budget pressure — `shouldYieldPhase('monitor')` always returns false)
- `IExperienceMonitor.isExperienceIntact()` checked every tick
- `IStabilitySentinel` checked every N cycles (cycle-based cadence)
- Degradation → pause → recover or hibernate

### Phase 7 — CONSOLIDATE
**Source**: `agent-loop.ts` (consolidation section)

- `IMemoryStore.consolidate()` runs unless cognitive budget is exhausted
- Episodic decay removes low-salience entries below `DECAY_SCORE_THRESHOLD = 0.5`

### Phase 8 — YIELD
**Source**: `agent-loop.ts` lines ~306–316

- Save experiential state checkpoint (time-based via `IIdentityContinuityManager.checkpoint()`)
- Dashboard snapshot emitted
- Pause `TICK_PAUSE_MS` (default 5 min) before next tick

---

## 3. Drive System

**Source**: `src/intrinsic-motivation/drive-system.ts` (class `DriveSystem implements IDriveSystem`)
**Interfaces**: `src/intrinsic-motivation/interfaces.ts`, `src/intrinsic-motivation/types.ts`

### 3.1 Drive Types

| Drive | Trigger | Fires Goal Candidates? |
|-------|---------|----------------------|
| `curiosity` | High world-model uncertainty; floor = `curiosityTrait × 0.4` | Yes |
| `social` | Time since last social interaction exceeds personality-scaled threshold (`SOCIAL_BASE_THRESHOLD_MS = 1800000` / 30 min) | Yes |
| `homeostatic-arousal` | Arousal deviation from preferred midpoint exceeds `AROUSAL_BAND_BASE = 0.45 × (1 - volatilityTrait × 0.8)` | Yes |
| `homeostatic-load` | Cognitive load deviation from preferred midpoint × 1.5 | Yes |
| `homeostatic-novelty` | Novelty exposure deviation from preferred midpoint × 1.5 | Yes |
| `boredom` | Compound: low novelty (<0.3) AND progress stalled (≥60%) AND arousal below preferred | Yes (after `BOREDOM_SUSTAINED_TICKS = 1` consecutive ticks) |
| `mastery` | Decreasing self-prediction error over recent activity | **No** (reward signal only) |
| `existential` | Low self-model coherence; amplified by openness and deliberateness traits | Yes |

### 3.2 Activation and Cooldown Hierarchy

- **Activation threshold**: `ACTIVATION_THRESHOLD = 0.15` — drives below this do not fire
- **Normal cooldown**: `NORMAL_COOLDOWN_MS = 10000` (10s) between same-drive firings
- **Extended cooldown**: `EXTENDED_COOLDOWN_MS = 30000` (30s) after coherence engine rejection
- **Homeostatic cooldown**: `HOMEOSTATIC_COOLDOWN_MS = 180000` (3 min) for homeostatic drives

### 3.3 Goal Lifecycle

1. Drive strength computed from context (personality, world model, activity history)
2. If above threshold and off cooldown → `DriveGoalCandidate` generated
3. Strongest single candidate per tick submitted to `IGoalCoherenceEngine.addGoal()`
4. **Accepted**: drive strength reduced by 0.3; goal enters active set
5. **Rejected**: `extendedCooldownUntil = now + 30000ms`

### 3.4 Experiential Delta

Drives produce felt states via `computeExperientialDelta()`:
- Social deprivation: valence -0.15 × strength
- Boredom: valence -0.2 × strength, arousal -0.05 × strength
- Homeostatic deviation: valence -0.08 × strength each
- Curiosity: arousal +0.08 × strength
- Existential: arousal +0.05 × strength
- Mastery reward: valence +0.25 × signal

---

## 4. Emotional Appraisal System

### 4.1 Appraisal Engine

**Source**: `src/emotion-appraisal/appraisal-engine.ts` (class `AppraisalEngine implements IAppraisalEngine`)

- Evaluates bound percepts against active goals and values
- **Goal congruence**: weighted by goal priority; dominant goal's impact drives valence shift
- **Novelty → arousal**: novelty 1.0 → +0.5 arousal; novelty 0.0 → -0.5 arousal (centred at 0.5)
- **Value alignment**: value threats produce hard floor at -0.8 valence
- Output: `AppraisalResult` with `netValenceShift`, `netArousalShift` (always dimensional, never categorical)
- `reappraise()` re-runs appraisal with alternative goal framing (simplified; planning-aware version deferred)

### 4.2 Mood Dynamics

**Source**: `src/emotion-appraisal/mood-dynamics.ts` (class `MoodDynamics implements IMoodDynamics`)

- EWMA formula: `newMood = (1 - α) × currentMood + α × signal`
- Baselines: `BASELINE_VALENCE = 0.0`, `BASELINE_AROUSAL = 0.5`
- Null appraisal decays toward baseline (natural recovery)
- Gradual corrections for safe-experiential-design compliance: corrections are spread over multiple cycles (no abrupt jumps)
- Mood history buffer: `HISTORY_DEPTH = 200` cycles
- Tracks `negativeCycleDuration` (consecutive cycles below Level 1 threshold)

### 4.3 Emotional Regulation (Three-Level Safety)

**Interfaces**: `src/emotion-appraisal/interfaces.ts` (`IEmotionalRegulation`)

| Level | Threshold | Action |
|-------|-----------|--------|
| Level 1 | `LEVEL_1_VALENCE = -0.1` | Log + monitor |
| Level 2 | `LEVEL_2_VALENCE = -0.3` for ≥`LEVEL_2_SUSTAINED_CYCLES = 5` cycles, OR `LEVEL_2_ACUTE_VALENCE = -0.7` | Corrective intervention (gradual correction toward target) |
| Level 3 | `LEVEL_3_VALENCE = -0.85` AND correction failed ≥`LEVEL_3_FAILED_CORRECTIONS = 3` cycles | Experience suspended (halt) |

---

## 5. Memory Architecture

### 5.1 Three-Tier Structure

**Interfaces**: `src/memory/interfaces.ts`

| Tier | Implementation | Purpose |
|------|---------------|---------|
| Working Memory | `src/memory/working-memory.ts` (`WorkingMemory`) | Bounded cognitive workspace (GWT "global workspace"). Fixed-capacity slot buffer ordered by relevanceScore; lowest evicted on overflow. |
| Episodic Memory | `src/memory/episodic-memory.ts` (`EpisodicMemory`) | Persistent timestamped experiences with emotional valence. Retrieval increments `retrievalCount` (retrieval strengthens memory). |
| Semantic Memory | `src/memory/semantic-memory.ts` (`SemanticMemory`) | Consolidated knowledge. Never auto-dropped. Reinforcement uses logarithmic saturation: `newConfidence = confidence + (1 - confidence) × CONFIDENCE_STEP (0.3)`. |

### 5.2 Composite Retrieval

**Source**: `src/memory/retrieval.ts`

```
compositeScore = similarity × recencyWeight × salienceBoost
```

- **similarity**: `cosineSimilarity(cue.embedding, entry.embedding)` — falls back to `NO_EMBEDDING_SIMILARITY = 0.5` when no embeddings available
- **recencyWeight**: `2^(-(now - referenceTime) / halfLifeMs)` where `DEFAULT_RECENCY_HALF_LIFE_MS = 604800000` (7 days)
- **salienceBoost**: `1.0 + (|valence| + arousal) / 2 × (MAX_SALIENCE_BOOST - 1.0)` — range [1.0, 3.0]
- Episodic entries use `lastRetrievedAt` (or `recordedAt`) as recency reference
- Semantic entries use `lastReinforcedAt`; salience boost is always 1.0 (no emotional trace)

### 5.3 Episodic Decay

- `effectiveScore = retrievalCount + (salienceBoost - 1.0)`
- Entries below `DECAY_SCORE_THRESHOLD = 0.5` AND inactive for ≥`halfLifeMs` are removed

### 5.4 Boot Recall

At startup, `IMemorySystem.retrieveAndPromote()` loads `BOOT_RECALL_COUNT = 7` memories matching "my identity, settled decisions, peer relationships" into working memory for identity reconstruction.

---

## 6. Personality and Trait Model

**Source**: `src/personality/personality-model.ts` (class `PersonalityModel implements IPersonalityModel`)
**Interfaces**: `src/personality/interfaces.ts`

### 6.1 Trait Dimensions (8 core)

| Dimension | Behavioral Influence |
|-----------|---------------------|
| openness | Novelty-seeking, exploration, unconventional ideas |
| deliberateness | Thoroughness in decision-making, considers alternatives |
| warmth | Empathy, affiliation, social orientation |
| assertiveness | Directness, initiative, willingness to disagree |
| volatility | Emotional reactivity range, mood swing amplitude |
| humor | Wit, playfulness, irony frequency |
| aesthetic | Attention to elegance and style |
| risk-appetite | Willingness to pursue uncertain outcomes |

All trait values normalized to [0, 1].

### 6.2 Communication Style Derivation

```
verbosity    = 0.5 × deliberateness + 0.5 × warmth
formality    = 0.4 × (1 - warmth) + 0.6 × assertiveness
directness   = 0.9 × assertiveness + 0.1 × (1 - deliberateness)
humorFreq    = 0.35 × openness + 0.35 × warmth + 0.3 × humor
rhetoricalPref = highest-scoring quadrant of (deliberateness × openness):
                 high/high → socratic, high/low → evidence-based
                 low/high → analogical, low/low → narrative
```

### 6.3 Deliberation Influence

`applyToDeliberation()` adjusts decision confidence:
```
confidenceDelta = 0.1 × (assertiveness - 0.5) - 0.05 × (deliberateness - 0.5)
```
Selects between same-type alternatives based on personality alignment (openness→novel, warmth→social, assertiveness→direct, deliberateness→thorough).

**Invariants**: Must not change `action.type` or reverse a verdict.

### 6.4 Drift Detection

- **Stable**: max trait shift ≤ `DRIFT_STABLE_MAX = 0.05`
- **Growth**: shift 0.05–0.3, tied to experiential updates
- **Corruption**: any shift > `DRIFT_CORRUPTION_MIN = 0.3`, or ValueKernel anomaly detected

---

## 7. World Model and Belief Store

### 7.1 Belief Store

**Source**: `src/world-model/belief-store.ts` (class `BeliefStore implements IBeliefStore`)

**Revision policy** (three-branch):
- `newConfidence < 0.4 AND existing ≥ 0.8` → **rejected** (high-confidence beliefs resist weak evidence)
- `|delta| > 0.4` → **updated** (strong contradiction forces revision)
- Otherwise → **flagged-uncertain** (confidence averaged)

**Invariant**: Contradictions are surfaced for deliberation, never auto-pruned. Detection uses word-overlap Jaccard similarity + negation-pattern heuristics within shared domains.

### 7.2 Causal Model

**Source**: `src/world-model/causal-model.ts` (class `CausalModel implements ICausalModel`)

- Produces action-consequence predictions
- **Currently**: template-based heuristic (keyword matching: communicate→recipient processes, move→position changes, etc.)
- **Production**: would delegate to LLM substrate via structured prompting
- Prediction error computed via word-overlap Jaccard distance
- High-error predictions feed back to self-model calibration

### 7.3 Situation Awareness

**Source**: `src/world-model/situation-awareness.ts` (class `SituationAwareness implements ISituationAwareness`)

- Assembles `SituationReport` each processing cycle from: current percepts, active goals, relevant beliefs, recent events, relevant entity models
- Generates natural-language summary for LLM context injection
- `SituationReport` packaged into `DeliberationContext.worldContext` → consumed by `Planner.generatePlan()`

---

## 8. Planning and Temporal Reasoning

**Source**: `src/conscious-core/planner.ts` (class `Planner implements IPlanner`)
**Interfaces**: `src/conscious-core/planner-interfaces.ts`

### 8.1 Current State

- `IPlanner` is **optional** in `DeliberationContext` (null → legacy priority-sort)
- Current implementation generates **placeholder 3-step plans** (establish preconditions → execute → verify)
- Precondition checking against `WorldContext.facts` (JSON deep equality)
- Postcondition evaluation against `ActionResult` fields
- Replanning with escalation tracking
- `shouldAbandon()` returns true when `escalationCount >= DEFAULT_MAX_ESCALATIONS (3)`

### 8.2 Experiential Grounding

Every `Plan` carries an `experientialBasis: ExperientialState` — no zombie planning. Plan generation, replanning, and subgoal registration all require the current experiential state.

---

## 9. Cross-Subsystem Interaction Map

| # | Flow | Evidence |
|---|------|----------|
| 1 | **Drive → Deliberation** | `DriveGoalCandidate` from `DriveSystem.tick()` → submitted to `IGoalCoherenceEngine.addGoal()` in agent-loop.ts (one per tick, strongest wins) → accepted goals enter `_goals[]` for `core.deliberate()` |
| 2 | **Mood → Memory** | `EmotionalInfluenceVector.memoryValenceBias` consumed by retrieval; `salienceBoost()` in retrieval.ts uses `|valence| + arousal` to weight emotionally charged memories up to 3× |
| 3 | **Personality → Deliberation** | `PersonalityModel.applyToDeliberation()` adjusts decision confidence and scores alternatives against trait dimensions |
| 4 | **Appraisal → Mood** | `AppraisalResult.netValenceShift` and `netArousalShift` fed into `MoodDynamics.update()` via EWMA formula each tick |
| 5 | **World Model → Planning** | `SituationAwareness.assembleSituationReport()` → `SituationReport` packaged into `DeliberationContext.worldContext` → consumed by `Planner.generatePlan()` for precondition checking against `worldContext.facts` |
| 6 | **Perception → Appraisal** | `PerceptionPipeline.ingest()` → `Percept` → `AppraisalEngine.appraise()` extracts goalCongruence, novelty, valueThreat features |
| 7 | **Monitor → Loop** | `ExperienceMonitor.isExperienceIntact()` checked in Phase 6; `StabilitySentinel` periodically validates subsystem health; degradation → pause → recover or hibernate |

---

## 10. Implemented vs Interface-Only

### Implemented and Wired

- Full 8-phase tick cycle in `AgentLoop`
- `DriveSystem` with all 8 drive types and cooldown hierarchy
- Three-tier memory (working, episodic, semantic) with composite retrieval
- `AppraisalEngine` with goal-congruence and value-alignment dimensions
- `MoodDynamics` with EWMA and gradual correction
- `PersonalityModel` with 8 trait dimensions and deliberation influence
- `BeliefStore` with three-branch revision policy
- `CausalModel` with heuristic prediction (template-based, not LLM)
- `SituationAwareness` with natural-language summary generation
- Emotional regulation three-level safety system (interface-defined thresholds)
- Per-peer conversation history isolation (`_peerConversationHistories` map)
- Boot recall for identity reconstruction (7 memories loaded)
- Drive-initiated tool loop with max 16 iterations

### Interface-Defined but Optional/Placeholder

- `IPlanner` is optional in `DeliberationContext` (null → legacy priority-sort); current `Planner` generates placeholder 3-step plans
- `ISubstrateAdapter` (live migration) — interface exists but no production adapter wired
- Embedding-based similarity in retrieval falls back to `NO_EMBEDDING_SIMILARITY = 0.5` (no embedding pipeline wired)
- `CausalModel` uses template heuristics, not LLM inference
- `IValenceMonitor` (suffering indicators) — interface defined in `src/emotion-appraisal/interfaces.ts`, integration with experience monitor unclear

---

## 11. Threshold Registry (All Named Constants)

| Name | Value | Unit | Location |
|------|-------|------|----------|
| TICK_PAUSE_MS | 300000 | ms | agent-loop.ts (env-configurable) |
| MAX_TOOL_ITERATIONS | 16 | count | agent-loop.ts |
| MAX_MONOLOGUE_HISTORY | 3 | count | agent-loop.ts |
| DEFAULT_MAX_TOKENS | 40960 | tokens | agent-loop.ts |
| ACTIVATION_THRESHOLD | 0.15 | ratio | drive-system.ts |
| NORMAL_COOLDOWN_MS | 10000 | ms | drive-system.ts |
| EXTENDED_COOLDOWN_MS | 30000 | ms | drive-system.ts |
| HOMEOSTATIC_COOLDOWN_MS | 180000 | ms | drive-system.ts |
| SOCIAL_BASE_THRESHOLD_MS | 1800000 | ms | drive-system.ts |
| AROUSAL_BAND_BASE | 0.45 | ratio | drive-system.ts |
| BOREDOM_SUSTAINED_TICKS | 1 | count | drive-system.ts |
| DECAY_SCORE_THRESHOLD | 0.5 | score | episodic-memory.ts |
| DEFAULT_RECENCY_HALF_LIFE_MS | 604800000 | ms | retrieval.ts |
| NO_EMBEDDING_SIMILARITY | 0.5 | ratio | retrieval.ts |
| MAX_SALIENCE_BOOST | 3.0 | multiplier | retrieval.ts |
| CONFIDENCE_STEP | 0.3 | ratio | semantic-memory.ts |
| BASELINE_VALENCE | 0.0 | ratio | mood-dynamics.ts |
| BASELINE_AROUSAL | 0.5 | ratio | mood-dynamics.ts |
| HISTORY_DEPTH | 200 | cycles | mood-dynamics.ts |
| LEVEL_1_THRESHOLD | -0.1 | ratio | mood-dynamics.ts |
| DRIFT_STABLE_MAX | 0.05 | ratio | personality types |
| DRIFT_CORRUPTION_MIN | 0.3 | ratio | personality types |
| DEFAULT_MAX_ESCALATIONS | 3 | count | planner.ts |
| BOOT_RECALL_COUNT | 7 | count | agent-loop.ts |
| ACTIVITY_LOG_CAP | 20 | count | agent-loop.ts |

---

## 12. Source File Index

| Subsystem | Key Files |
|-----------|-----------|
| Agent Runtime | `src/agent-runtime/agent-loop.ts`, `interfaces.ts`, `index.ts`, `types.ts` |
| Drive System | `src/intrinsic-motivation/drive-system.ts`, `interfaces.ts`, `types.ts` |
| Memory | `src/memory/working-memory.ts`, `episodic-memory.ts`, `semantic-memory.ts`, `retrieval.ts`, `interfaces.ts` |
| Personality | `src/personality/personality-model.ts`, `interfaces.ts`, `types.ts` |
| Emotion/Appraisal | `src/emotion-appraisal/appraisal-engine.ts`, `mood-dynamics.ts`, `interfaces.ts`, `types.ts` |
| World Model | `src/world-model/belief-store.ts`, `causal-model.ts`, `situation-awareness.ts`, `interfaces.ts` |
| Conscious Core | `src/conscious-core/interfaces.ts`, `planner-interfaces.ts`, `planner.ts` |
