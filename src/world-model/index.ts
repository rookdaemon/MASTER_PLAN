/**
 * World Model and Belief State (0.3.1.5.5)
 *
 * Barrel export for the world-model module.
 *
 * Public surface:
 *   - All data types (Belief, BeliefSource, …, ConsistencyReport)
 *   - All subsystem interfaces (IBeliefStore, IEntityModelStore,
 *     ICausalModel, ISituationAwareness, IWorldModel)
 *   - All subsystem implementations (BeliefStore, EntityModelStore,
 *     CausalModel, SituationAwareness, WorldModel)
 */

// ── Types ──────────────────────────────────────────────────────
export type {
  // Primitives
  BeliefId,
  PredictionId,
  // Re-exports from upstream modules (convenience)
  Timestamp,
  Percept,
  Goal,
  EntityId,
  EntityProfile,
  ConsciousnessStatus,
  // Belief subsystem
  BeliefSource,
  Belief,
  BeliefRevision,
  BeliefContradiction,
  // Entity subsystem
  ObservationEvent,
  WorldModelEntityProfile,
  // Causal subsystem
  CausalPrediction,
  // Situation awareness
  SituationReport,
  // Consistency
  ConsistencyReport,
} from './types.js';

// ── Interfaces ─────────────────────────────────────────────────
export type {
  IBeliefStore,
  IEntityModelStore,
  ICausalModel,
  ISituationAwareness,
  IWorldModel,
} from './interfaces.js';

// ── Implementations ────────────────────────────────────────────
export { BeliefStore } from './belief-store.js';
export { EntityModelStore } from './entity-model-store.js';
export { CausalModel } from './causal-model.js';
export { SituationAwareness } from './situation-awareness.js';
export { WorldModel } from './world-model.js';
