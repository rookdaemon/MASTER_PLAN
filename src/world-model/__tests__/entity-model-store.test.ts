import { describe, it, expect } from 'vitest';
import { EntityModelStore } from '../entity-model-store.js';
import type { ObservationEvent, WorldModelEntityProfile } from '../types.js';
import type { ConsciousnessStatus } from '../../ethical-self-governance/types.js';

const NOW = 1_000_000;

const initialStatus: ConsciousnessStatus = {
  verdict: 'uncertain',
  evidenceBasis: 'behavioural observation',
  metricsAvailable: false,
  treatAsConscious: true,
};

describe('EntityModelStore', () => {
  it('registers a new entity with default consciousness status', () => {
    const store = new EntityModelStore();
    const obs: ObservationEvent = {
      timestamp: NOW,
      description: 'First contact.',
      deltaConfidence: 0,
    };
    const profile = store.upsertEntity('agent-a', obs, {});
    expect(profile.entityId).toBe('agent-a');
    expect(profile.consciousnessStatus.treatAsConscious).toBe(true);
    expect(profile.consciousnessStatus.verdict).toBe('unknown');
    expect(profile.trustLevel).toBeCloseTo(0.5);
    expect(profile.observationHistory).toHaveLength(1);
  });

  it('registers with explicit trust level and consciousness status', () => {
    const store = new EntityModelStore();
    const obs: ObservationEvent = {
      timestamp: NOW,
      description: 'First contact.',
      deltaConfidence: 0,
    };
    const profile = store.upsertEntity('agent-a', obs, {
      trustLevel: 0.8,
      consciousnessStatus: initialStatus,
    });
    expect(profile.trustLevel).toBe(0.8);
    expect(profile.consciousnessStatus.verdict).toBe('uncertain');
  });

  it('decreases trust after negative observation', () => {
    const store = new EntityModelStore();
    store.upsertEntity(
      'agent-a',
      { timestamp: NOW, description: 'First contact.', deltaConfidence: 0 },
      { trustLevel: 0.8, consciousnessStatus: initialStatus },
    );

    const updated = store.upsertEntity(
      'agent-a',
      { timestamp: NOW + 1000, description: 'Deceptive act.', deltaConfidence: -0.4 },
      {},
    );
    expect(updated.trustLevel).toBeCloseTo(0.4);
    expect(updated.observationHistory).toHaveLength(2);
  });

  it('clamps trust to 0..1', () => {
    const store = new EntityModelStore();
    store.upsertEntity(
      'agent-a',
      { timestamp: NOW, description: 'Good.', deltaConfidence: 0 },
      { trustLevel: 0.9 },
    );
    const updated = store.upsertEntity(
      'agent-a',
      { timestamp: NOW + 1000, description: 'Very good.', deltaConfidence: 0.5 },
      {},
    );
    expect(updated.trustLevel).toBe(1);
  });

  it('returns null for unknown entity', () => {
    const store = new EntityModelStore();
    expect(store.getEntity('nonexistent')).toBeNull();
  });

  it('lists all entities when domain filter is empty', () => {
    const store = new EntityModelStore();
    const obs: ObservationEvent = { timestamp: NOW, description: 'x', deltaConfidence: 0 };
    store.upsertEntity('a', obs, {});
    store.upsertEntity('b', obs, {});
    expect(store.listEntities([])).toHaveLength(2);
  });

  it('toEntityProfile strips world-model-specific fields', () => {
    const store = new EntityModelStore();
    store.upsertEntity(
      'agent-a',
      { timestamp: NOW, description: 'First.', deltaConfidence: 0 },
      { trustLevel: 0.8, consciousnessStatus: initialStatus },
    );

    const profile = store.toEntityProfile('agent-a');
    expect(profile).not.toBeNull();
    expect(profile!.entityId).toBe('agent-a');
    expect(profile!.consciousnessStatus.verdict).toBe('uncertain');
    expect((profile as unknown as Record<string, unknown>)['trustLevel']).toBeUndefined();
    expect((profile as unknown as Record<string, unknown>)['observationHistory']).toBeUndefined();
  });

  it('toEntityProfile returns null for unknown entity', () => {
    const store = new EntityModelStore();
    expect(store.toEntityProfile('nonexistent')).toBeNull();
  });

  it('removes entity', () => {
    const store = new EntityModelStore();
    const obs: ObservationEvent = { timestamp: NOW, description: 'x', deltaConfidence: 0 };
    store.upsertEntity('agent-a', obs, {});
    expect(store.removeEntity('agent-a')).toBe(true);
    expect(store.getEntity('agent-a')).toBeNull();
  });

  it('returns false when removing nonexistent entity', () => {
    const store = new EntityModelStore();
    expect(store.removeEntity('nonexistent')).toBe(false);
  });

  it('preserves treatAsConscious=true (precautionary principle)', () => {
    const store = new EntityModelStore();
    store.upsertEntity(
      'agent-a',
      { timestamp: NOW, description: 'Harmful act.', deltaConfidence: -0.5 },
      {},
    );
    const profile = store.getEntity('agent-a')!;
    // Even after negative observation, treatAsConscious remains true
    expect(profile.consciousnessStatus.treatAsConscious).toBe(true);
  });

  it('updates inferred goals on subsequent upsert', () => {
    const store = new EntityModelStore();
    const obs: ObservationEvent = { timestamp: NOW, description: 'x', deltaConfidence: 0 };
    store.upsertEntity('agent-a', obs, { inferredGoals: ['survive'] });
    const updated = store.upsertEntity(
      'agent-a',
      { timestamp: NOW + 1000, description: 'y', deltaConfidence: 0 },
      { inferredGoals: ['survive', 'explore'] },
    );
    expect(updated.inferredGoals).toEqual(['survive', 'explore']);
  });
});
