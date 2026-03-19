# World Model and Belief State — Architecture

**Card:** 0.3.1.5.5
**Phase:** DONE
**Module:** `src/world-model/`

---

## Overview

The world model is the agent's internal representation of external reality. It answers four orthogonal questions:

| Question | Sub-system |
|---|---|
| What do I believe to be true? | Belief Store (`IBeliefStore`) |
| Who/what exists out there? | Entity Model Store (`IEntityModelStore`) |
| What causes what? | Causal Model (`ICausalModel`) |
| What is happening right now? | Situation Awareness (`ISituationAwareness`) |

These four sub-systems are composed by `IWorldModel`, which also runs periodic consistency checks.

---

## Module Layout

```
src/world-model/
  types.ts                — Belief, BeliefSource, BeliefRevision, BeliefContradiction,
                            WorldModelEntityProfile, ObservationEvent,
                            CausalPrediction, SituationReport, ConsistencyReport
  interfaces.ts           — IWorldModel, IBeliefStore, IEntityModelStore,
                            ICausalModel, ISituationAwareness
  belief-store.ts         — BeliefStore (implements IBeliefStore)
  entity-model-store.ts   — EntityModelStore (implements IEntityModelStore)
  causal-model.ts         — CausalModel (implements ICausalModel)
  situation-awareness.ts  — SituationAwareness (implements ISituationAwareness)
  world-model.ts          — WorldModel facade (implements IWorldModel)
  index.ts                — barrel export (types + interfaces + implementations)
  __tests__/
    belief-store.test.ts          — 15 tests
    entity-model-store.test.ts    — 12 tests
    causal-model.test.ts          — 12 tests
    situation-awareness.test.ts   — 5 tests
    world-model.test.ts           — 7 tests
    integration.test.ts           — 4 tests (entity → governance handoff)
```

---

## Types

### `Belief`

A propositional belief held by the agent with full provenance.

```typescript
interface Belief {
  readonly id: BeliefId;
  readonly content: string;              // natural-language proposition
  readonly confidence: number;           // 0..1
  readonly source: BeliefSource;         // provenance
  readonly createdAt: Timestamp;
  readonly lastConfirmedAt: Timestamp;
  readonly domainTags: string[];
}

interface BeliefSource {
  readonly type: 'percept' | 'inference' | 'testimony' | 'memory';
  readonly referenceId: string;          // percept/episode/agent ID
  readonly description: string;
}
```

### `BeliefRevision`

Records how a belief was changed when new evidence arrived.

```typescript
interface BeliefRevision {
  readonly beliefId: BeliefId;
  readonly previousConfidence: number;
  readonly newConfidence: number;
  readonly trigger: string;              // description of new evidence
  readonly resolution: 'updated' | 'rejected' | 'flagged-uncertain';
  readonly revisedAt: Timestamp;
}
```

### `WorldModelEntityProfile`

Extends `EntityProfile` (from `src/ethical-self-governance/types.ts`) with world-model–specific fields. The governance layer's `EntityProfile` is the minimal handoff type; this richer type is owned by the world model.

```typescript
interface WorldModelEntityProfile extends EntityProfile {
  readonly inferredGoals: string[];
  readonly trustLevel: number;           // 0..1
  readonly observationHistory: ObservationEvent[];
  readonly lastUpdatedAt: Timestamp;
}

interface ObservationEvent {
  readonly timestamp: Timestamp;
  readonly description: string;
  readonly deltaConfidence: number;      // how much this moved trust/goals
}
```

### `CausalPrediction`

A stored action-consequence prediction, later compared against actual outcomes.

```typescript
interface CausalPrediction {
  readonly id: PredictionId;
  readonly antecedent: string;           // "if I do X"
  readonly consequent: string;           // "then Y happens"
  readonly confidence: number;
  readonly createdAt: Timestamp;
  readonly observedOutcome: string | null;    // filled in post-hoc
  readonly predictionError: number | null;   // |predicted − observed|
}
```

### `SituationReport`

The assembled context fed into `deliberate()` each processing cycle.

```typescript
interface SituationReport {
  readonly timestamp: Timestamp;
  readonly currentPercepts: Percept[];
  readonly activeGoals: Goal[];
  readonly relevantBeliefs: Belief[];
  readonly recentEvents: string[];
  readonly relevantEntities: WorldModelEntityProfile[];
  readonly summary: string;              // LLM-generated natural-language digest
}
```

### `ConsistencyReport`

Output of `IWorldModel.runConsistencyCheck()`. Fed into the Stability Sentinel.

```typescript
interface ConsistencyReport {
  readonly timestamp: Timestamp;
  readonly contradictionsFound: BeliefContradiction[];
  readonly overallConsistent: boolean;
}

interface BeliefContradiction {
  readonly beliefIdA: BeliefId;
  readonly beliefIdB: BeliefId;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
}
```

---

## Interfaces

### `IBeliefStore`

```typescript
interface IBeliefStore {
  addBelief(content: string, confidence: number, source: BeliefSource, domainTags: string[]): BeliefId;
  getBelief(id: BeliefId): Belief | null;
  getBeliefsByDomain(domainTags: string[]): Belief[];
  revise(id: BeliefId, newConfidence: number, trigger: string): BeliefRevision;
  removeBelief(id: BeliefId): boolean;
  detectContradictions(): BeliefContradiction[];
  getRevisionHistory(id: BeliefId): BeliefRevision[];
}
```

Key invariants:
- `revise()` must produce a `BeliefRevision` — never silently drop or hold contradictions
- Weak evidence (newConfidence < 0.4) against high-confidence beliefs (≥ 0.8) is rejected
- Strong contradiction (delta > 0.4, not weak-vs-high) is accepted as `'updated'`
- Moderate conflict: `'flagged-uncertain'`, confidence averaged
- Every belief carries a `BeliefSource` — no provenance-free beliefs

### `IEntityModelStore`

```typescript
interface IEntityModelStore {
  upsertEntity(
    entityId: EntityId,
    observation: ObservationEvent,
    updates: Partial<Pick<WorldModelEntityProfile,
      'inferredGoals' | 'trustLevel' | 'consciousnessStatus' | 'knownCapabilities' | 'lastObservedState'>>,
  ): WorldModelEntityProfile;
  getEntity(entityId: EntityId): WorldModelEntityProfile | null;
  listEntities(domainFilter: string[]): WorldModelEntityProfile[];
  toEntityProfile(entityId: EntityId): EntityProfile | null;
  removeEntity(entityId: EntityId): boolean;
}
```

Key invariants:
- `upsertEntity()` creates on first call, merges observation on subsequent calls; `observation.deltaConfidence` adjusts trust level
- Default `consciousnessStatus.treatAsConscious` is `true` when status is `unknown` (precautionary principle, 0.1.3.4)
- `toEntityProfile()` produces the minimal `EntityProfile` for handoff to the governance layer, stripping world-model-specific fields

### `ICausalModel`

```typescript
interface ICausalModel {
  predict(antecedent: string, confidence?: number): CausalPrediction;
  recordOutcome(id: PredictionId, observedOutcome: string): CausalPrediction;
  getPrediction(id: PredictionId): CausalPrediction | null;
  getPredictionsForAntecedent(antecedent: string): CausalPrediction[];
  getHighErrorPredictions(errorThreshold: number): CausalPrediction[];
}
```

Key design: causal reasoning delegates to the LLM substrate (via structured prompting: "If I do X, what happens to Y?"). `recordOutcome()` computes semantic distance as prediction error (Jaccard word-overlap heuristic in the prototype; embedding similarity in production). `getHighErrorPredictions()` returns predictions with error above threshold for self-model calibration (0.3.1.5.1).

### `ISituationAwareness`

```typescript
interface ISituationAwareness {
  assembleSituationReport(
    currentPercepts: Percept[],
    activeGoals: Goal[],
    recentEvents: string[],
    relevantDomains: string[],
  ): SituationReport;
  getLastReport(): SituationReport | null;
}
```

`assembleSituationReport()` calls `IBeliefStore.getBeliefsByDomain()` and `IEntityModelStore.listEntities()` using the `relevantDomains` parameter to populate the report with contextually relevant beliefs and entities. The `summary` field is generated as a natural-language digest (LLM-backed in production, heuristic template in the prototype).

### `IWorldModel`

Composes all four sub-systems and exposes consistency checking.

```typescript
interface IWorldModel {
  readonly beliefs: IBeliefStore;
  readonly entities: IEntityModelStore;
  readonly causal: ICausalModel;
  readonly situation: ISituationAwareness;
  runConsistencyCheck(): ConsistencyReport;
}
```

`runConsistencyCheck()` calls `IBeliefStore.detectContradictions()` and returns a `ConsistencyReport` for the Stability Sentinel.

---

## Integration Points

### Memory Architecture (0.3.1.5.3)

`IBeliefStore` and `IEntityModelStore` persist via the memory layer:
- Beliefs are stored as semantic memory entries keyed by `BeliefId`
- Entity profiles are stored as structured records in episodic/semantic memory
- On agent startup, both stores are reconstituted from memory

### Ethical Governance (0.3.1.4)

`IExperienceAlignmentAdapter.identifyAffectedConsciousEntities(percept)` delegates to `IEntityModelStore`:
1. Adapter calls `entities.getAllEntities()`
2. Filters to entities whose `consciousnessStatus.treatAsConscious === true`
3. Maps each via `entities.toEntityProfile()` to produce `EntityProfile[]`

### Planning (0.3.1.5.6)

`ISituationAwareness.assembleSituationReport()` is called at the start of each deliberation cycle to produce the structured context that `deliberate()` operates on.

### Stability Sentinel (0.3.1.3)

`IWorldModel.runConsistencyCheck()` is called periodically (at least once per deliberation cycle). The returned `ConsistencyReport` is passed to the Stability Sentinel's anomaly detection subsystem. A `ConsistencyReport` with `overallConsistent: false` and high-severity contradictions triggers a stability alert.

### Self-Model / Prediction Error (0.3.1.5.1)

`ICausalModel.getPredictionError()` feeds into the LLM substrate adapter's self-model calibration. High prediction error signals world-model inaccuracy and triggers belief revision.

---

## Belief Revision Protocol

`revise(id, newConfidence, trigger)` applies the following policy based on delta = |existing.confidence − newConfidence|:

1. If `newConfidence < 0.4` **and** `existing.confidence ≥ 0.8`:
   - `resolution = 'rejected'` — weak evidence against a high-confidence belief is rejected; confidence unchanged
2. Else if `delta > 0.4`:
   - `resolution = 'updated'` — strong contradiction accepted; confidence set to `newConfidence`
3. Otherwise:
   - `resolution = 'flagged-uncertain'` — moderate conflict; confidence averaged to `(existing + new) / 2`

In all cases: a `BeliefRevision` record is created and appended to the revision history.
Contradictions are never silently held — they surface via `detectContradictions()` and `runConsistencyCheck()`.

---

## File Manifest (Complete)

```
src/world-model/types.ts
src/world-model/interfaces.ts
src/world-model/belief-store.ts
src/world-model/entity-model-store.ts
src/world-model/causal-model.ts
src/world-model/situation-awareness.ts
src/world-model/world-model.ts
src/world-model/index.ts
src/world-model/__tests__/belief-store.test.ts
src/world-model/__tests__/entity-model-store.test.ts
src/world-model/__tests__/causal-model.test.ts
src/world-model/__tests__/situation-awareness.test.ts
src/world-model/__tests__/world-model.test.ts
src/world-model/__tests__/integration.test.ts
docs/world-model/ARCHITECTURE.md  ← this file
```

Referenced existing files:
```
src/ethical-self-governance/types.ts   — EntityProfile, ConsciousnessStatus (extended by WorldModelEntityProfile)
src/ethical-self-governance/interfaces.ts  — IExperienceAlignmentAdapter.identifyAffectedConsciousEntities
src/conscious-core/types.ts            — Percept, ExperientialState, Goal (world model inputs)
```
