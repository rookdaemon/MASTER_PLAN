/**
 * Tests for SimulationWorld (simulation/)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationWorld } from '../simulation-world.js';
import { SimulatedAgent } from '../simulated-agent.js';
import type { SimulationLocation, AgentConfig, SimulationAction } from '../types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeLocation(id: string, adjacent: string[] = []): SimulationLocation {
  return {
    id,
    name: `Location ${id}`,
    description: `Test location ${id}`,
    adjacentLocations: adjacent,
    capacity: 10,
  };
}

function makeAgentConfig(agentId: string, location: string): AgentConfig {
  return {
    agentId,
    name: agentId,
    personality: { openness: 0.5, warmth: 0.5, assertiveness: 0.5, volatility: 0.4 },
    initialLocation: location,
  };
}

function makeAgent(agentId: string, location: string): SimulatedAgent {
  return new SimulatedAgent(makeAgentConfig(agentId, location));
}

// ── Setup helper ──────────────────────────────────────────────────────────────

function buildWorld(): { world: SimulationWorld; alpha: SimulatedAgent; beta: SimulatedAgent } {
  const world = new SimulationWorld();
  world.addLocation(makeLocation('a', ['b']));
  world.addLocation(makeLocation('b', ['a', 'c']));
  world.addLocation(makeLocation('c', ['b']));

  const alpha = makeAgent('alpha', 'a');
  const beta = makeAgent('beta', 'b');
  world.addAgent(alpha, makeAgentConfig('alpha', 'a'));
  world.addAgent(beta, makeAgentConfig('beta', 'b'));

  return { world, alpha, beta };
}

// ── Registry ──────────────────────────────────────────────────────────────────

describe('SimulationWorld registry', () => {
  it('getAgents() returns all registered agents', () => {
    const { world } = buildWorld();
    expect(world.getAgents().length).toBe(2);
  });

  it('getAgent() returns the correct agent by ID', () => {
    const { world, alpha } = buildWorld();
    expect(world.getAgent('alpha')).toBe(alpha);
  });

  it('getAgent() returns undefined for unknown ID', () => {
    const { world } = buildWorld();
    expect(world.getAgent('nobody')).toBeUndefined();
  });

  it('getLocation() returns the registered location', () => {
    const { world } = buildWorld();
    expect(world.getLocation('a')?.id).toBe('a');
  });

  it('getLocation() returns undefined for unknown ID', () => {
    const { world } = buildWorld();
    expect(world.getLocation('z')).toBeUndefined();
  });
});

// ── Location queries ──────────────────────────────────────────────────────────

describe('SimulationWorld location queries', () => {
  it('getAgentsAtLocation() returns agents at the correct location', () => {
    const { world } = buildWorld();
    expect(world.getAgentsAtLocation('a')).toContain('alpha');
    expect(world.getAgentsAtLocation('b')).toContain('beta');
  });

  it('getNearbyAgents() includes agents at the location and its neighbours', () => {
    const { world } = buildWorld();
    // 'a' is adjacent to 'b', so alpha (at a) should see beta (at b)
    const nearA = world.getNearbyAgents('a');
    expect(nearA).toContain('alpha');
    expect(nearA).toContain('beta');
  });

  it('getAdjacentLocations() returns correct adjacent IDs', () => {
    const { world } = buildWorld();
    const adj = world.getAdjacentLocations('b');
    expect(adj).toContain('a');
    expect(adj).toContain('c');
    expect(adj).not.toContain('b');
  });
});

// ── Action resolution — move ──────────────────────────────────────────────────

describe('SimulationWorld.resolveAction() — move', () => {
  it('move to adjacent location updates agent location', () => {
    const { world, alpha } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'move',
      targetId: 'b',
      description: 'alpha moves to b',
      timestamp: Date.now(),
    };
    world.resolveAction(action, 1, Date.now());
    expect(alpha.location).toBe('b');
  });

  it('move produces a SimulationEvent visible to agents at origin and target', () => {
    const { world } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'move',
      targetId: 'b',
      description: 'alpha moves to b',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event).not.toBeNull();
    expect(event!.visibleToAgentIds).toContain('beta'); // beta is at 'b'
  });

  it('move to non-adjacent location is rejected and returns null', () => {
    const { world } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'move',
      targetId: 'c', // 'c' is not adjacent to 'a'
      description: 'alpha tries to jump to c',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event).toBeNull();
  });

  it('move without targetId returns null', () => {
    const { world } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'move',
      description: 'alpha moves nowhere',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event).toBeNull();
  });
});

// ── Action resolution — interact ──────────────────────────────────────────────

describe('SimulationWorld.resolveAction() — interact', () => {
  it('interact between two co-located agents produces an event', () => {
    const world = new SimulationWorld();
    world.addLocation(makeLocation('hub', []));

    const a = makeAgent('a', 'hub');
    const b = makeAgent('b', 'hub');
    world.addAgent(a, makeAgentConfig('a', 'hub'));
    world.addAgent(b, makeAgentConfig('b', 'hub'));

    const action: SimulationAction = {
      agentId: 'a',
      type: 'interact',
      targetId: 'b',
      description: 'a talks to b',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event).not.toBeNull();
    expect(event!.actorId).toBe('a');
    expect(event!.visibleToAgentIds).toContain('a');
    expect(event!.visibleToAgentIds).toContain('b');
  });

  it('interact with high-warmth agents produces positive valence event', () => {
    const world = new SimulationWorld();
    world.addLocation(makeLocation('hub', []));

    const a = new SimulatedAgent({ agentId: 'a', name: 'A', personality: { warmth: 0.9 }, initialLocation: 'hub' });
    const b = new SimulatedAgent({ agentId: 'b', name: 'B', personality: { warmth: 0.9 }, initialLocation: 'hub' });
    world.addAgent(a, makeAgentConfig('a', 'hub'));
    world.addAgent(b, makeAgentConfig('b', 'hub'));

    const action: SimulationAction = {
      agentId: 'a',
      type: 'interact',
      targetId: 'b',
      description: 'a and b exchange warmly',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event!.valenceHint).toBeGreaterThan(0);
  });
});

// ── Action resolution — explore / rest / observe ──────────────────────────────

describe('SimulationWorld.resolveAction() — explore / rest / observe', () => {
  it('explore produces an event with high noveltyHint', () => {
    const { world } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'explore',
      description: 'alpha explores',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event).not.toBeNull();
    expect(event!.noveltyHint).toBeGreaterThan(0.5);
  });

  it('rest produces an event with low noveltyHint', () => {
    const { world } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'rest',
      description: 'alpha rests',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event).not.toBeNull();
    expect(event!.noveltyHint).toBeLessThan(0.3);
  });

  it('idle produces no event', () => {
    const { world } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'idle',
      description: 'alpha idles',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now());
    expect(event).toBeNull();
  });
});

// ── eventToPercept ─────────────────────────────────────────────────────────────

describe('SimulationWorld.eventToPercept()', () => {
  it('converts event to percept with expected modality and features', () => {
    const { world } = buildWorld();
    const action: SimulationAction = {
      agentId: 'alpha',
      type: 'explore',
      description: 'alpha explores a',
      timestamp: Date.now(),
    };
    const event = world.resolveAction(action, 1, Date.now())!;
    const percept = world.eventToPercept(event, 'beta');
    expect(percept.modality).toBe('social-event');
    expect(percept.features['actorId']).toBe('alpha');
    expect(typeof percept.features['valenceHint']).toBe('number');
    expect(typeof percept.features['noveltyHint']).toBe('number');
  });
});
