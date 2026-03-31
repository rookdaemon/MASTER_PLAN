/**
 * Tests for simulation tool handlers in executeToolCall.
 *
 * Verifies that the 8 simulation tools route correctly, return
 * proper results, and produce user-friendly errors when deps are
 * missing or inputs are invalid.
 */

import { describe, it, expect, vi } from 'vitest';
import { executeToolCall } from '../tool-executor.js';
import { SimulationManager } from '../../simulation/simulation-manager.js';
import { PersistenceManager } from '../persistence-manager.js';
import { InMemoryFileSystem } from '../filesystem.js';
import type { ToolExecutorDeps } from '../tool-executor.js';
import type { SimulationConfig } from '../../simulation/types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function miniConfig(maxTicks = 5): SimulationConfig {
  return {
    maxTicks,
    tickIntervalMs: 0,
    locations: [
      { id: 'plaza', name: 'Plaza', description: 'Central.', adjacentLocations: ['park'], capacity: 10 },
      { id: 'park', name: 'Park', description: 'Green.', adjacentLocations: ['plaza'], capacity: 6 },
    ],
    agents: [
      { agentId: 'alice', name: 'Alice', initialLocation: 'plaza', personality: { openness: 0.7 } },
    ],
  };
}

function makeDeps(
  overrides: Partial<ToolExecutorDeps> = {},
): ToolExecutorDeps {
  return {
    memorySystem: null,
    driveSystem: { recordActivity: () => {} } as any,
    goalCoherenceEngine: null,
    personalityModel: null,
    experientialState: {} as any,
    goals: [],
    activityLog: [],
    narrativeIdentity: '',
    projectRoot: '/fake',
    workspacePath: '/fake',
    adapter: null,
    chatLog: null,
    taskJournal: null,
    agentDigest: null,
    constraintEngine: null,
    ...overrides,
  };
}

// ── create_simulation ─────────────────────────────────────────────────────────

describe('create_simulation', () => {
  it('creates a village scenario and returns status ok', async () => {
    const manager = new SimulationManager();
    const deps = makeDeps({ simulationManager: manager });
    const result = await executeToolCall({ name: 'create_simulation', input: { name: 'v1', scenario: 'village' } }, deps);
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content);
    expect(data.status).toBe('created');
    expect(data.name).toBe('v1');
  });

  it('returns error when simulationManager is not set', async () => {
    const deps = makeDeps();
    const result = await executeToolCall({ name: 'create_simulation', input: { name: 'x', scenario: 'village' } }, deps);
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/not available/);
  });

  it('returns error for missing name', async () => {
    const deps = makeDeps({ simulationManager: new SimulationManager() });
    const result = await executeToolCall({ name: 'create_simulation', input: { scenario: 'village' } }, deps);
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/requires "name"/);
  });

  it('creates a custom scenario from agents/locations arrays', async () => {
    const manager = new SimulationManager();
    const deps = makeDeps({ simulationManager: manager });
    const result = await executeToolCall({
      name: 'create_simulation',
      input: {
        name: 'custom1',
        scenario: 'custom',
        agents: [{ agentId: 'a1', name: 'A1', initialLocation: 'loc1', personality: {} }],
        locations: [{ id: 'loc1', name: 'Loc1', description: 'desc', adjacentLocations: [], capacity: 5 }],
      },
    }, deps);
    expect(result.is_error).toBe(false);
    expect(JSON.parse(result.content).scenario).toBe('custom');
  });

  it('returns error for custom scenario with missing agents', async () => {
    const deps = makeDeps({ simulationManager: new SimulationManager() });
    const result = await executeToolCall({ name: 'create_simulation', input: { name: 'c', scenario: 'custom', locations: [] } }, deps);
    expect(result.is_error).toBe(true);
  });
});

// ── tick_simulation ───────────────────────────────────────────────────────────

describe('tick_simulation', () => {
  it('advances one tick and returns tick data', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('t', miniConfig());
    const deps = makeDeps({ simulationManager: manager });
    const result = await executeToolCall({ name: 'tick_simulation', input: { name: 't', ticks: 1 } }, deps);
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content);
    expect(data.currentTick).toBe(1);
    expect(data.ticksAdvanced).toBe(1);
  });

  it('returns error for unknown simulation', async () => {
    const deps = makeDeps({ simulationManager: new SimulationManager() });
    const result = await executeToolCall({ name: 'tick_simulation', input: { name: 'ghost' } }, deps);
    expect(result.is_error).toBe(true);
  });
});

// ── set_parameter ─────────────────────────────────────────────────────────────

describe('set_parameter', () => {
  it('sets max_ticks without error', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('p', miniConfig());
    const deps = makeDeps({ simulationManager: manager });
    const result = await executeToolCall({ name: 'set_parameter', input: { name: 'p', key: 'max_ticks', value: 100 } }, deps);
    expect(result.is_error).toBe(false);
  });

  it('returns error for unknown key', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('p', miniConfig());
    const deps = makeDeps({ simulationManager: manager });
    const result = await executeToolCall({ name: 'set_parameter', input: { name: 'p', key: 'bad_key', value: 1 } }, deps);
    expect(result.is_error).toBe(true);
  });
});

// ── inspect_world ─────────────────────────────────────────────────────────────

describe('inspect_world', () => {
  it('returns world inspection data', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('w', miniConfig());
    const deps = makeDeps({ simulationManager: manager });
    const result = await executeToolCall({ name: 'inspect_world', input: { name: 'w' } }, deps);
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content);
    expect(data.simulationName).toBe('w');
    expect(data.currentTick).toBe(0);
    expect(Array.isArray(data.agents)).toBe(true);
  });
});

// ── inspect_npc ───────────────────────────────────────────────────────────────

describe('inspect_npc', () => {
  it('returns NPC detail', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('n', miniConfig());
    manager.tickSimulation('n', 1);
    const deps = makeDeps({ simulationManager: manager });
    const result = await executeToolCall({ name: 'inspect_npc', input: { simulation_name: 'n', agent_id: 'alice' } }, deps);
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content);
    expect(data.agentId).toBe('alice');
  });

  it('returns error for missing simulation_name', async () => {
    const deps = makeDeps({ simulationManager: new SimulationManager() });
    const result = await executeToolCall({ name: 'inspect_npc', input: { agent_id: 'alice' } }, deps);
    expect(result.is_error).toBe(true);
  });
});

// ── save / load / list simulations ────────────────────────────────────────────

describe('save_simulation / load_simulation / list_simulations', () => {
  async function makePersistence() {
    const fs = new InMemoryFileSystem();
    const pm = new PersistenceManager('/state', fs);
    await pm.initialize();
    return pm;
  }

  it('saves a simulation snapshot', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('saved', miniConfig());
    manager.tickSimulation('saved', 2);
    const pm = await makePersistence();
    const deps = makeDeps({ simulationManager: manager, persistenceManager: pm });
    const result = await executeToolCall({ name: 'save_simulation', input: { name: 'saved' } }, deps);
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content);
    expect(data.name).toBe('saved');
    expect(data.tickCount).toBe(2);
  });

  it('loads a saved simulation back into manager', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('loadme', miniConfig());
    manager.tickSimulation('loadme', 1);
    const pm = await makePersistence();
    const deps = makeDeps({ simulationManager: manager, persistenceManager: pm });

    // save
    await executeToolCall({ name: 'save_simulation', input: { name: 'loadme' } }, deps);
    // remove from memory
    manager.removeSimulation('loadme');
    expect(manager.listActiveSimulations()).not.toContain('loadme');

    // load back
    const loadResult = await executeToolCall({ name: 'load_simulation', input: { name: 'loadme' } }, deps);
    expect(loadResult.is_error).toBe(false);
    expect(manager.listActiveSimulations()).toContain('loadme');
  });

  it('returns error when loading a non-existent snapshot', async () => {
    const manager = new SimulationManager();
    const pm = await makePersistence();
    const deps = makeDeps({ simulationManager: manager, persistenceManager: pm });
    const result = await executeToolCall({ name: 'load_simulation', input: { name: 'ghost' } }, deps);
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/No saved simulation found/);
  });

  it('list_simulations returns active and saved combined', async () => {
    const manager = new SimulationManager();
    manager.createSimulation('active-sim', miniConfig());
    const pm = await makePersistence();

    // save a different simulation
    const manager2 = new SimulationManager();
    manager2.createSimulation('saved-sim', miniConfig());
    const deps2 = makeDeps({ simulationManager: manager2, persistenceManager: pm });
    await executeToolCall({ name: 'save_simulation', input: { name: 'saved-sim' } }, deps2);

    const deps = makeDeps({ simulationManager: manager, persistenceManager: pm });
    const result = await executeToolCall({ name: 'list_simulations', input: {} }, deps);
    expect(result.is_error).toBe(false);
    const data = JSON.parse(result.content);
    const names = data.simulations.map((s: { name: string }) => s.name);
    expect(names).toContain('active-sim');
    expect(names).toContain('saved-sim');
  });
});
