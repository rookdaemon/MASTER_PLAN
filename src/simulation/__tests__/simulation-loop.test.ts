/**
 * Tests for SimulationLoop (simulation/)
 */

import { describe, it, expect, vi } from 'vitest';
import { SimulationLoop } from '../simulation-loop.js';
import { createVillageConfig } from '../scenarios/village.js';
import type { SimulationConfig, SimulationStateDump } from '../types.js';

// ── Minimal config fixture ────────────────────────────────────────────────────

function miniConfig(maxTicks = 3): SimulationConfig {
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
        agentId: 'anna',
        name: 'Anna',
        personality: { openness: 0.7, warmth: 0.6, assertiveness: 0.5, volatility: 0.4 },
        initialLocation: 'plaza',
      },
      {
        agentId: 'bob',
        name: 'Bob',
        personality: { openness: 0.4, warmth: 0.4, assertiveness: 0.6, volatility: 0.3 },
        initialLocation: 'park',
      },
    ],
  };
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('SimulationLoop construction', () => {
  it('initialises at tick 0 and not running', () => {
    const loop = new SimulationLoop(miniConfig());
    expect(loop.currentTick).toBe(0);
    expect(loop.isRunning).toBe(false);
  });

  it('world has the registered agents', () => {
    const loop = new SimulationLoop(miniConfig());
    expect(loop.world.getAgents().length).toBe(2);
  });

  it('world has the registered locations', () => {
    const loop = new SimulationLoop(miniConfig());
    expect(loop.world.getLocation('plaza')).toBeDefined();
    expect(loop.world.getLocation('park')).toBeDefined();
  });
});

// ── stepOnce() ────────────────────────────────────────────────────────────────

describe('SimulationLoop.stepOnce()', () => {
  it('increments the tick counter', () => {
    const loop = new SimulationLoop(miniConfig());
    loop.stepOnce();
    expect(loop.currentTick).toBe(1);
    loop.stepOnce();
    expect(loop.currentTick).toBe(2);
  });

  it('returns a SimulationStateDump with the current tick number', () => {
    const loop = new SimulationLoop(miniConfig());
    const dump = loop.stepOnce();
    expect(dump.tick).toBe(1);
    expect(typeof dump.timestamp).toBe('number');
  });

  it('dump includes one entry per agent', () => {
    const loop = new SimulationLoop(miniConfig());
    const dump = loop.stepOnce();
    expect(dump.agents.length).toBe(2);
  });

  it('each agent dump has the expected fields', () => {
    const loop = new SimulationLoop(miniConfig());
    const dump = loop.stepOnce();
    for (const a of dump.agents) {
      expect(typeof a.agentId).toBe('string');
      expect(typeof a.name).toBe('string');
      expect(typeof a.location).toBe('string');
      expect(typeof a.mood.valence).toBe('number');
      expect(typeof a.mood.arousal).toBe('number');
      expect(Array.isArray(a.topDrives)).toBe(true);
      expect(Array.isArray(a.recentMemories)).toBe(true);
      expect(Array.isArray(a.socialTrust)).toBe(true);
    }
  });
});

// ── onTick callback ───────────────────────────────────────────────────────────

describe('SimulationLoop.onTick()', () => {
  it('callback is invoked once per step', () => {
    const loop = new SimulationLoop(miniConfig());
    const cb = vi.fn<[SimulationStateDump], void>();
    loop.onTick(cb);
    loop.stepOnce();
    expect(cb).toHaveBeenCalledTimes(1);
    loop.stepOnce();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('callback receives the correct tick number', () => {
    const loop = new SimulationLoop(miniConfig());
    const ticks: number[] = [];
    loop.onTick(dump => ticks.push(dump.tick));
    loop.stepOnce();
    loop.stepOnce();
    loop.stepOnce();
    expect(ticks).toEqual([1, 2, 3]);
  });
});

// ── run() async generator ─────────────────────────────────────────────────────

describe('SimulationLoop.run()', () => {
  it('yields exactly maxTicks dumps', async () => {
    const loop = new SimulationLoop(miniConfig(5));
    const dumps: SimulationStateDump[] = [];
    for await (const dump of loop.run()) {
      dumps.push(dump);
    }
    expect(dumps.length).toBe(5);
  });

  it('tick numbers are sequential from 1', async () => {
    const loop = new SimulationLoop(miniConfig(4));
    const ticks: number[] = [];
    for await (const dump of loop.run()) {
      ticks.push(dump.tick);
    }
    expect(ticks).toEqual([1, 2, 3, 4]);
  });

  it('isRunning is false after run() completes', async () => {
    const loop = new SimulationLoop(miniConfig(2));
    for await (const _ of loop.run()) { /* consume */ }
    expect(loop.isRunning).toBe(false);
  });
});

// ── runToCompletion() ─────────────────────────────────────────────────────────

describe('SimulationLoop.runToCompletion()', () => {
  it('returns all dumps and advances tick counter to maxTicks', async () => {
    const loop = new SimulationLoop(miniConfig(5));
    const dumps = await loop.runToCompletion();
    expect(dumps.length).toBe(5);
    expect(loop.currentTick).toBe(5);
  });
});

// ── stop() ───────────────────────────────────────────────────────────────────

describe('SimulationLoop.stop()', () => {
  it('halts an in-progress run before maxTicks', async () => {
    const loop = new SimulationLoop(miniConfig(100));
    const dumps: SimulationStateDump[] = [];
    for await (const dump of loop.run()) {
      dumps.push(dump);
      if (dumps.length === 3) loop.stop();
    }
    expect(dumps.length).toBe(3);
  });
});

// ── Village scenario smoke test ────────────────────────────────────────────────

describe('Village scenario', () => {
  it('runs 10 ticks without error and produces consistent state', async () => {
    const config = createVillageConfig(10);
    const loop = new SimulationLoop(config);
    const dumps = await loop.runToCompletion();

    expect(dumps.length).toBe(10);
    const lastDump = dumps[dumps.length - 1];
    expect(lastDump.agents.length).toBe(5);

    // Every agent should have a valid location
    for (const a of lastDump.agents) {
      expect(typeof a.location).toBe('string');
      expect(a.location.length).toBeGreaterThan(0);
    }
  });

  it('agents accumulate episodic memories over the run', async () => {
    const config = createVillageConfig(10);
    const loop = new SimulationLoop(config);
    await loop.runToCompletion();

    let totalMemories = 0;
    for (const agent of loop.world.getAgents()) {
      totalMemories += agent.getMemory().episodic.size();
    }
    expect(totalMemories).toBeGreaterThan(0);
  });

  it('agents form social models of other agents over the run', async () => {
    const config = createVillageConfig(15);
    const loop = new SimulationLoop(config);
    await loop.runToCompletion();

    // At least one agent should have observed another agent
    let knownEntitiesTotal = 0;
    for (const agent of loop.world.getAgents()) {
      knownEntitiesTotal += agent.getSocialCognition().getKnownEntities().length;
    }
    expect(knownEntitiesTotal).toBeGreaterThan(0);
  });
});
