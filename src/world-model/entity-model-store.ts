/**
 * In-memory implementation of IEntityModelStore (0.3.1.5.5)
 *
 * Tracks rich profiles of other agents and objects with inferred goals,
 * trust levels, consciousness status, and observation history.
 *
 * Invariant: consciousnessStatus.treatAsConscious defaults to true
 * (precautionary principle, 0.1.3.4).
 */

import type {
  EntityId,
  EntityProfile,
  ConsciousnessStatus,
} from '../ethical-self-governance/types.js';
import type {
  WorldModelEntityProfile,
  ObservationEvent,
} from './types.js';
import type { IEntityModelStore } from './interfaces.js';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const DEFAULT_CONSCIOUSNESS_STATUS: ConsciousnessStatus = {
  verdict: 'unknown',
  evidenceBasis: 'no prior observations',
  metricsAvailable: false,
  treatAsConscious: true,
};

export class EntityModelStore implements IEntityModelStore {
  private readonly store = new Map<EntityId, WorldModelEntityProfile>();

  upsertEntity(
    entityId: EntityId,
    observation: ObservationEvent,
    updates: Partial<
      Pick<
        WorldModelEntityProfile,
        | 'inferredGoals'
        | 'trustLevel'
        | 'consciousnessStatus'
        | 'knownCapabilities'
        | 'lastObservedState'
      >
    >,
  ): WorldModelEntityProfile {
    const existing = this.store.get(entityId);

    if (existing == null) {
      const initialTrust = updates.trustLevel ?? 0.5;
      const profile: WorldModelEntityProfile = {
        entityId,
        consciousnessStatus: updates.consciousnessStatus ?? DEFAULT_CONSCIOUSNESS_STATUS,
        knownCapabilities: updates.knownCapabilities ?? [],
        lastObservedState: updates.lastObservedState ?? null,
        inferredGoals: updates.inferredGoals ?? [],
        trustLevel: clamp01(initialTrust + observation.deltaConfidence),
        observationHistory: [observation],
        lastUpdatedAt: observation.timestamp,
      };
      this.store.set(entityId, profile);
      return profile;
    }

    const updatedProfile: WorldModelEntityProfile = {
      ...existing,
      consciousnessStatus: updates.consciousnessStatus ?? existing.consciousnessStatus,
      knownCapabilities: updates.knownCapabilities ?? existing.knownCapabilities,
      lastObservedState: updates.lastObservedState ?? existing.lastObservedState,
      inferredGoals: updates.inferredGoals ?? existing.inferredGoals,
      trustLevel:
        updates.trustLevel != null
          ? clamp01(updates.trustLevel)
          : clamp01(existing.trustLevel + observation.deltaConfidence),
      observationHistory: [...existing.observationHistory, observation],
      lastUpdatedAt: observation.timestamp,
    };
    this.store.set(entityId, updatedProfile);
    return updatedProfile;
  }

  getEntity(entityId: EntityId): WorldModelEntityProfile | null {
    return this.store.get(entityId) ?? null;
  }

  listEntities(domainFilter: string[]): WorldModelEntityProfile[] {
    const all = Array.from(this.store.values());
    if (domainFilter.length === 0) return all;
    // Filter by knownCapabilities overlap with domainFilter
    const filterSet = new Set(domainFilter);
    return all.filter((e) =>
      e.knownCapabilities.some((c) => filterSet.has(c)),
    );
  }

  toEntityProfile(entityId: EntityId): EntityProfile | null {
    const p = this.store.get(entityId);
    if (p == null) return null;
    return {
      entityId: p.entityId,
      consciousnessStatus: p.consciousnessStatus,
      knownCapabilities: p.knownCapabilities,
      lastObservedState: p.lastObservedState,
    };
  }

  removeEntity(entityId: EntityId): boolean {
    return this.store.delete(entityId);
  }
}
