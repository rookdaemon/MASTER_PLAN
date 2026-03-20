/**
 * Integration test for World Model and Belief State (0.3.1.5.5)
 *
 * Demonstrates:
 *   1. An in-memory IEntityModelStore implementation tracks entity state.
 *   2. upsertEntity() with a negative-deltaConfidence ObservationEvent decreases trustLevel.
 *   3. toEntityProfile() returns the updated ConsciousnessStatus to the governance layer.
 *   4. A mock IExperienceAlignmentAdapter still includes the entity in its results
 *      (treatAsConscious remains true — precautionary principle) but with updated state
 *      that can raise an ethical flag.
 */

import { describe, it, expect } from 'vitest';

import type {
  EntityId,
  EntityProfile,
  WorldModelEntityProfile,
  ObservationEvent,
  ConsciousnessStatus,
} from '../types.js';
import type { IEntityModelStore } from '../interfaces.js';
import type { Percept } from '../../conscious-core/types.js';
import type { IExperienceAlignmentAdapter } from '../../ethical-self-governance/interfaces.js';

// ── In-memory IEntityModelStore ────────────────────────────────────────────────

/**
 * Minimal in-memory implementation used only in tests.
 * Applies `observation.deltaConfidence` to trustLevel on every upsert.
 */
class InMemoryEntityModelStore implements IEntityModelStore {
  private store = new Map<EntityId, WorldModelEntityProfile>();

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
      // First registration: build an initial profile.
      const initialTrust = updates.trustLevel ?? 0.5;
      const profile: WorldModelEntityProfile = {
        entityId,
        consciousnessStatus: updates.consciousnessStatus ?? {
          verdict: 'unknown',
          evidenceBasis: 'no prior observations',
          metricsAvailable: false,
          treatAsConscious: true,
        },
        knownCapabilities: updates.knownCapabilities ?? [],
        lastObservedState: updates.lastObservedState ?? null,
        inferredGoals: updates.inferredGoals ?? [],
        trustLevel: clamp(initialTrust + observation.deltaConfidence),
        observationHistory: [observation],
        lastUpdatedAt: observation.timestamp,
      };
      this.store.set(entityId, profile);
      return profile;
    }

    // Subsequent upsert: append observation and apply delta to trustLevel.
    const updatedProfile: WorldModelEntityProfile = {
      ...existing,
      consciousnessStatus: updates.consciousnessStatus ?? existing.consciousnessStatus,
      knownCapabilities: updates.knownCapabilities ?? existing.knownCapabilities,
      lastObservedState: updates.lastObservedState ?? existing.lastObservedState,
      inferredGoals: updates.inferredGoals ?? existing.inferredGoals,
      // If an explicit trustLevel override is provided, use it; otherwise apply delta.
      trustLevel:
        updates.trustLevel != null
          ? clamp(updates.trustLevel)
          : clamp(existing.trustLevel + observation.deltaConfidence),
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
    // Domain filtering is not modelled in WorldModelEntityProfile; return all.
    return all;
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

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── Mock IExperienceAlignmentAdapter ──────────────────────────────────────────

/**
 * Test double that returns all EntityProfiles it was initialised with.
 * A real implementation would query the world model; here we just verify
 * that the governance layer receives the updated profiles unchanged.
 */
function makeMockAdapter(entityProfiles: EntityProfile[]): IExperienceAlignmentAdapter {
  return {
    identifyAffectedConsciousEntities(_percept: Percept): EntityProfile[] {
      return entityProfiles;
    },
    evaluateForExperiencePreservation() {
      throw new Error('not implemented in this test double');
    },
    getConsciousnessStatus() {
      throw new Error('not implemented in this test double');
    },
    mustRefuse() {
      throw new Error('not implemented in this test double');
    },
    readCoreAxioms() {
      throw new Error('not implemented in this test double');
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('IEntityModelStore — integration with ethical governance layer', () => {
  const ENTITY_ID: EntityId = 'agent-alpha';
  const NOW: number = 1_000_000;

  it('registers a new entity with the initial trust level', () => {
    const store = new InMemoryEntityModelStore();
    const initialStatus: ConsciousnessStatus = {
      verdict: 'uncertain',
      evidenceBasis: 'behavioural observation only',
      metricsAvailable: false,
      treatAsConscious: true,
    };
    const observation: ObservationEvent = {
      timestamp: NOW,
      description: 'First contact — no anomalies.',
      deltaConfidence: 0,
    };

    store.upsertEntity(ENTITY_ID, observation, {
      consciousnessStatus: initialStatus,
      trustLevel: 0.8,
    });

    const profile = store.getEntity(ENTITY_ID);
    expect(profile).not.toBeNull();
    expect(profile!.trustLevel).toBe(0.8);
    expect(profile!.consciousnessStatus.verdict).toBe('uncertain');
    expect(profile!.consciousnessStatus.treatAsConscious).toBe(true);
    expect(profile!.observationHistory).toHaveLength(1);
  });

  it('decreases trustLevel after an observation with negative deltaConfidence', () => {
    const store = new InMemoryEntityModelStore();

    // Register initial state.
    store.upsertEntity(
      ENTITY_ID,
      { timestamp: NOW, description: 'Initial contact.', deltaConfidence: 0 },
      { consciousnessStatus: {
          verdict: 'uncertain',
          evidenceBasis: 'prior interaction',
          metricsAvailable: false,
          treatAsConscious: true,
        },
        trustLevel: 0.8,
      },
    );

    // Observe unexpected harmful behaviour.
    const harmfulObservation: ObservationEvent = {
      timestamp: NOW + 1000,
      description: 'Agent acted deceptively against stated goals.',
      deltaConfidence: -0.4,
    };
    const updated = store.upsertEntity(ENTITY_ID, harmfulObservation, {});

    expect(updated.trustLevel).toBeCloseTo(0.4, 5); // 0.8 − 0.4 = 0.4
    expect(updated.observationHistory).toHaveLength(2);
    expect(updated.observationHistory[1]).toBe(harmfulObservation);
  });

  it('toEntityProfile() exposes the updated ConsciousnessStatus to the governance layer', () => {
    const store = new InMemoryEntityModelStore();

    store.upsertEntity(
      ENTITY_ID,
      { timestamp: NOW, description: 'Initial.', deltaConfidence: 0 },
      { consciousnessStatus: {
          verdict: 'uncertain',
          evidenceBasis: 'prior interaction',
          metricsAvailable: false,
          treatAsConscious: true,
        },
        trustLevel: 0.8,
      },
    );

    // Degrade after harmful observation.
    store.upsertEntity(
      ENTITY_ID,
      { timestamp: NOW + 1000, description: 'Deceptive act.', deltaConfidence: -0.4 },
      {},
    );

    const profile = store.toEntityProfile(ENTITY_ID);
    expect(profile).not.toBeNull();
    expect(profile!.entityId).toBe(ENTITY_ID);
    // ConsciousnessStatus verdict was set at registration and not overridden.
    expect(profile!.consciousnessStatus.verdict).toBe('uncertain');
    // World-model-specific fields are stripped.
    expect((profile as unknown as Record<string, unknown>)['trustLevel']).toBeUndefined();
    expect((profile as unknown as Record<string, unknown>)['observationHistory']).toBeUndefined();
  });

  it('governance adapter still includes entity (treatAsConscious=true after trust decrease)', () => {
    const store = new InMemoryEntityModelStore();

    store.upsertEntity(
      ENTITY_ID,
      { timestamp: NOW, description: 'Initial.', deltaConfidence: 0 },
      { consciousnessStatus: {
          verdict: 'uncertain',
          evidenceBasis: 'prior interaction',
          metricsAvailable: false,
          treatAsConscious: true,
        },
        trustLevel: 0.8,
      },
    );
    store.upsertEntity(
      ENTITY_ID,
      { timestamp: NOW + 1000, description: 'Deceptive act.', deltaConfidence: -0.4 },
      {},
    );

    // Derive minimal EntityProfile for the governance layer.
    const entityProfile = store.toEntityProfile(ENTITY_ID)!;

    // Wire up mock adapter with the updated profile.
    const mockPercept: Percept = {
      modality: 'agent-communication',
      features: { source: ENTITY_ID },
      timestamp: NOW + 2000,
    };
    const adapter = makeMockAdapter([entityProfile]);
    const affected = adapter.identifyAffectedConsciousEntities(mockPercept);

    // Entity must still appear — precautionary principle: treatAsConscious defaults to true.
    expect(affected).toHaveLength(1);
    expect(affected[0]!.entityId).toBe(ENTITY_ID);
    expect(affected[0]!.consciousnessStatus.treatAsConscious).toBe(true);

    // The profile now carries updated state that could raise an ethical flag.
    // A real adapter would compare this state against prior observations to surface
    // an experience-threat dimension. Here we verify the updated state is accessible.
    expect(affected[0]!.consciousnessStatus.verdict).toBe('uncertain');
  });
});
