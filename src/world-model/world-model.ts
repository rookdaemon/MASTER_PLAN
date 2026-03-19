/**
 * WorldModel facade implementation (0.3.1.5.5)
 *
 * Top-level composite that owns all four world-model subsystems:
 * - IBeliefStore: propositional belief management
 * - IEntityModelStore: rich entity profiles
 * - ICausalModel: action-consequence predictions
 * - ISituationAwareness: per-cycle context assembly
 *
 * Exposes unified access plus cross-cutting consistency checking
 * whose output feeds the Stability Sentinel's anomaly detection.
 */

import type { Timestamp } from '../conscious-core/types.js';
import type { ConsistencyReport } from './types.js';
import type {
  IBeliefStore,
  IEntityModelStore,
  ICausalModel,
  ISituationAwareness,
  IWorldModel,
} from './interfaces.js';

export class WorldModel implements IWorldModel {
  readonly beliefs: IBeliefStore;
  readonly entities: IEntityModelStore;
  readonly causal: ICausalModel;
  readonly situation: ISituationAwareness;

  constructor(deps: {
    beliefs: IBeliefStore;
    entities: IEntityModelStore;
    causal: ICausalModel;
    situation: ISituationAwareness;
  }) {
    this.beliefs = deps.beliefs;
    this.entities = deps.entities;
    this.causal = deps.causal;
    this.situation = deps.situation;
  }

  runConsistencyCheck(): ConsistencyReport {
    const now: Timestamp = Date.now();
    const contradictionsFound = this.beliefs.detectContradictions();

    return {
      timestamp: now,
      contradictionsFound,
      overallConsistent: contradictionsFound.length === 0,
    };
  }
}
