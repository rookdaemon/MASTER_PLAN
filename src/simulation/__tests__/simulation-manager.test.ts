/**
 * Tests for SimulationManager (simulation/)
 *
 * Validates create/remove/list, tick execution, parameter mutation,
 * world and NPC inspection, and snapshot/restore round-trips.
 */

import { describe, it, expect, vi } from 'vitest';
import { SimulationManager } from '../simulation-manager.js';
import type { SimulationConfig } from '../types.js';

// ── Minimal config fixture ────────────────────────────────────────────────────

function miniConfig(maxTicks = 5): SimulationConfig {
  return {
    maxTicks,
    tickIntervalMs: 0,
    locations: [
      {
        id: 'plaza',
        name: 'Plaza',
        description: 'Central square.',
        adjacentLocations: ['park'],
        capacity: 10,
      },
      {
        id: 'park',
        name: 'Park',
        description: 'Green area.',
        adjacentLocations: ['plaza'],
        capacity: 6,
      },
    ],
    agents: [
      {
        agentId: 'alice',
        name: 'Alice',
        initialLocation: 'plaza',
        personality: { openness: 0.7 },
      },
      {
        agentId: 'bob',
        name: 'Bob',
        initialLocation: 'park',
        personality: { openness: 0.4 },
      },
    ],
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe('SimulationManager — lifecycle', () => {
  it('creates a simulation and lists it as active', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('test', miniConfig());
    expect(mgr.listActiveSimulations()).toContain('test');
  });

  it('throws when creating a duplicate simulation name', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('dup', miniConfig());
    expect(() => mgr.createSimulation('dup', miniConfig())).toThrow(/already exists/);
  });

  it('removes a simulation and returns true', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('rem', miniConfig());
    expect(mgr.removeSimulation('rem')).toBe(true);
    expect(mgr.listActiveSimulations()).not.toContain('rem');
  });

  it('returns false when removing a non-existent simulation', () => {
    const mgr = new SimulationManager();
    expect(mgr.removeSimulation('ghost')).toBe(false);
  });

  it('creates a village scenario simulation', () => {
    const mgr = new SimulationManager();
    mgr.createSimulationFromScenario('village-1', 'village');
    expect(mgr.listActiveSimulations()).toContain('village-1');
  });

  it('throws for unknown scenario', () => {
    const mgr = new SimulationManager();
    expect(() => mgr.createSimulationFromScenario('x', 'alien')).toThrow(/Unknown scenario/);
  });

  it('throws when accessing a non-existent simulation', () => {
    const mgr = new SimulationManager();
    expect(() => mgr.tickSimulation('ghost')).toThrow(/not found/);
  });
});

// ── Tick execution ─────────────────────────────────────────────────────────────

describe('SimulationManager — tickSimulation', () => {
  it('advances one tick and returns one dump', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('t', miniConfig());
    const dumps = mgr.tickSimulation('t', 1);
    expect(dumps).toHaveLength(1);
    expect(dumps[0].tick).toBe(1);
  });

  it('advances multiple ticks and returns all dumps', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('t', miniConfig());
    const dumps = mgr.tickSimulation('t', 3);
    expect(dumps).toHaveLength(3);
    expect(dumps[2].tick).toBe(3);
  });

  it('clamps ticks to maximum of 1000', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('t', miniConfig(2000));
    const dumps = mgr.tickSimulation('t', 9999);
    expect(dumps).toHaveLength(1000);
  });

  it('clamps ticks to minimum of 1', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('t', miniConfig());
    const dumps = mgr.tickSimulation('t', -5);
    expect(dumps).toHaveLength(1);
  });
});

// ── Inspection ────────────────────────────────────────────────────────────────

describe('SimulationManager — inspectWorld', () => {
  it('returns currentTick=0 before any ticks', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('w', miniConfig());
    const info = mgr.inspectWorld('w');
    expect(info.simulationName).toBe('w');
    expect(info.currentTick).toBe(0);
    expect(info.agents).toHaveLength(2);
  });

  it('reflects updated tick after ticking', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('w', miniConfig());
    mgr.tickSimulation('w', 2);
    expect(mgr.inspectWorld('w').currentTick).toBe(2);
  });
});

describe('SimulationManager — inspectNpc', () => {
  it('returns NPC mood, traits, drives, and trust scores', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('n', miniConfig());
    mgr.tickSimulation('n', 1);
    const info = mgr.inspectNpc('n', 'alice');
    expect(info.agentId).toBe('alice');
    expect(typeof info.mood.valence).toBe('number');
    expect(typeof info.traits['openness']).toBe('number');
    expect(Array.isArray(info.drives)).toBe(true);
    expect(Array.isArray(info.trustScores)).toBe(true);
  });

  it('throws for unknown agent', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('n', miniConfig());
    expect(() => mgr.inspectNpc('n', 'nobody')).toThrow(/not found/);
  });
});

// ── Parameter control ─────────────────────────────────────────────────────────

describe('SimulationManager — setParameter', () => {
  it('throws for unknown key', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('p', miniConfig());
    expect(() => mgr.setParameter('p', 'unknown_key', 1)).toThrow(/Unknown parameter key/);
  });

  it('throws for non-finite tick_interval_ms', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('p', miniConfig());
    expect(() => mgr.setParameter('p', 'tick_interval_ms', 'fast')).toThrow(/finite number/);
  });

  it('sets npc_trait without throwing', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('p', miniConfig());
    expect(() =>
      mgr.setParameter('p', 'npc_trait', { agentId: 'alice', trait: 'openness', value: 0.9 }),
    ).not.toThrow();
  });

  it('throws for npc_trait with unknown agent', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('p', miniConfig());
    expect(() =>
      mgr.setParameter('p', 'npc_trait', { agentId: 'nobody', trait: 'openness', value: 0.9 }),
    ).toThrow(/not found/);
  });

  it('throws for malformed npc_trait value', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('p', miniConfig());
    expect(() =>
      mgr.setParameter('p', 'npc_trait', { agentId: 'alice' }),
    ).toThrow(/must be an object/);
  });
});

// ── Snapshot / restore ────────────────────────────────────────────────────────

describe('SimulationManager — snapshot/restore', () => {
  it('snapshotSimulation returns correct name and tickCount', () => {
    const clock = vi.fn().mockReturnValue(1_000_000);
    const mgr = new SimulationManager(clock);
    mgr.createSimulation('s', miniConfig());
    mgr.tickSimulation('s', 3);
    const snap = mgr.snapshotSimulation('s');
    expect(snap.name).toBe('s');
    expect(snap.tickCount).toBe(3);
    expect(snap.agentDumps).toHaveLength(2);
    expect(snap.snapshotAt).toBe(1_000_000);
  });

  it('restoreSimulation makes simulation accessible again', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('r', miniConfig());
    mgr.tickSimulation('r', 2);
    const snap = mgr.snapshotSimulation('r');

    const mgr2 = new SimulationManager();
    mgr2.restoreSimulation(snap);
    expect(mgr2.listActiveSimulations()).toContain('r');
    // can tick after restore
    const dumps = mgr2.tickSimulation('r', 1);
    expect(dumps[0].tick).toBe(1);
  });

  it('restoreSimulation replaces an existing simulation with the same name', () => {
    const mgr = new SimulationManager();
    mgr.createSimulation('r', miniConfig());
    const snap = mgr.snapshotSimulation('r');
    mgr.tickSimulation('r', 4);
    // restore overwrites
    mgr.restoreSimulation(snap);
    expect(mgr.inspectWorld('r').currentTick).toBe(0);
  });
});
