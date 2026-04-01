/**
 * Tests for SimulationManager (simulation-ui/)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationManager } from '../simulation-manager.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

let idCounter = 0;
const makeId = () => `sim-${(++idCounter).toString().padStart(3, '0')}`;
const fakeClock = () => 1_000_000;

function makeManager() {
  return new SimulationManager({
    idFactory: makeId,
    clock: fakeClock,
    // Use real timers in most tests; override per-test when needed
  });
}

beforeEach(() => {
  idCounter = 0;
});

// ── Scenarios ─────────────────────────────────────────────────────────────────

describe('SimulationManager.getScenarios()', () => {
  it('returns village and colony scenarios', () => {
    const mgr = makeManager();
    const scenarios = mgr.getScenarios();
    const ids = scenarios.map(s => s.id);
    expect(ids).toContain('village');
    expect(ids).toContain('colony');
  });

  it('each scenario has required fields', () => {
    const mgr = makeManager();
    for (const s of mgr.getScenarios()) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.description).toBe('string');
      expect(typeof s.defaultAgentCount).toBe('number');
    }
  });
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe('SimulationManager.create()', () => {
  it('creates a simulation and assigns an id', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'Test Village', scenarioId: 'village' });
    expect(rec.id).toBe('sim-001');
    expect(rec.name).toBe('Test Village');
    expect(rec.scenarioId).toBe('village');
  });

  it('new simulation starts with status idle and tick 0', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'T', scenarioId: 'village' });
    expect(rec.status).toBe('idle');
    expect(rec.loop.currentTick).toBe(0);
  });

  it('creates a colony simulation with the right agent count', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'Colony', scenarioId: 'colony' });
    expect(rec.loop.world.getAgents().length).toBe(6);
  });

  it('throws for unknown scenario', () => {
    const mgr = makeManager();
    expect(() => mgr.create({ name: 'X', scenarioId: 'unknown' as 'village' })).toThrow();
  });
});

describe('SimulationManager.list()', () => {
  it('returns empty array when no simulations', () => {
    const mgr = makeManager();
    expect(mgr.list()).toEqual([]);
  });

  it('lists all created simulations', () => {
    const mgr = makeManager();
    mgr.create({ name: 'A', scenarioId: 'village' });
    mgr.create({ name: 'B', scenarioId: 'colony' });
    const list = mgr.list();
    expect(list.length).toBe(2);
    expect(list.map(s => s.name)).toEqual(['A', 'B']);
  });

  it('summary has required fields', () => {
    const mgr = makeManager();
    mgr.create({ name: 'Village', scenarioId: 'village' });
    const [s] = mgr.list();
    expect(s).toBeDefined();
    expect(typeof s!.id).toBe('string');
    expect(typeof s!.currentTick).toBe('number');
    expect(typeof s!.agentCount).toBe('number');
    expect(s!.status).toBe('idle');
  });
});

describe('SimulationManager.get()', () => {
  it('returns the record by id', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'V', scenarioId: 'village' });
    expect(mgr.get(rec.id)).toBe(rec);
  });

  it('returns undefined for unknown id', () => {
    const mgr = makeManager();
    expect(mgr.get('nope')).toBeUndefined();
  });
});

describe('SimulationManager.delete()', () => {
  it('removes the simulation', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'D', scenarioId: 'village' });
    expect(mgr.delete(rec.id)).toBe(true);
    expect(mgr.get(rec.id)).toBeUndefined();
    expect(mgr.list().length).toBe(0);
  });

  it('returns false for unknown id', () => {
    const mgr = makeManager();
    expect(mgr.delete('nope')).toBe(false);
  });
});

// ── step() ─────────────────────────────────────────────────────────────────

describe('SimulationManager.step()', () => {
  it('advances tick by 1 and returns a dump', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'S', scenarioId: 'village' });
    const dump = mgr.step(rec.id);
    expect(dump.tick).toBe(1);
    expect(rec.loop.currentTick).toBe(1);
  });

  it('appends dump to history', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'S', scenarioId: 'village' });
    mgr.step(rec.id);
    expect(rec.history.length).toBe(1);
  });

  it('throws when simulation is running', () => {
    const fakeTimers = { handle: null as NodeJS.Timeout | null };
    const mgr = new SimulationManager({
      idFactory: makeId,
      clock: fakeClock,
      timerFactory: (cb, _ms) => {
        fakeTimers.handle = setTimeout(cb, 100_000); // won't fire in test
        return fakeTimers.handle;
      },
      timerCleaner: (h) => clearTimeout(h),
    });
    const rec = mgr.create({ name: 'R', scenarioId: 'village' });
    mgr.startAutoRun(rec.id);
    expect(() => mgr.step(rec.id)).toThrow();
    mgr.pause(rec.id); // cleanup
    if (fakeTimers.handle) clearTimeout(fakeTimers.handle);
  });

  it('throws for unknown simulation', () => {
    const mgr = makeManager();
    expect(() => mgr.step('nope')).toThrow();
  });
});

// ── pause() / startAutoRun() ──────────────────────────────────────────────

describe('SimulationManager lifecycle', () => {
  it('startAutoRun sets status to running', () => {
    const callbacks: Array<() => void> = [];
    const mgr = new SimulationManager({
      idFactory: makeId,
      clock: fakeClock,
      timerFactory: (cb) => {
        callbacks.push(cb);
        return 999 as unknown as NodeJS.Timeout; // fake handle
      },
      timerCleaner: vi.fn(),
    });
    const rec = mgr.create({ name: 'AR', scenarioId: 'village' });
    mgr.startAutoRun(rec.id);
    expect(rec.status).toBe('running');
  });

  it('pause sets status to idle', () => {
    const timerCleaner = vi.fn();
    const mgr = new SimulationManager({
      idFactory: makeId,
      clock: fakeClock,
      timerFactory: (_cb) => 999 as unknown as NodeJS.Timeout,
      timerCleaner,
    });
    const rec = mgr.create({ name: 'AR', scenarioId: 'village' });
    mgr.startAutoRun(rec.id);
    mgr.pause(rec.id);
    expect(rec.status).toBe('idle');
    expect(timerCleaner).toHaveBeenCalled();
  });

  it('stop sets status to stopped', () => {
    const mgr = new SimulationManager({
      idFactory: makeId,
      clock: fakeClock,
      timerFactory: (_cb) => 999 as unknown as NodeJS.Timeout,
      timerCleaner: vi.fn(),
    });
    const rec = mgr.create({ name: 'ST', scenarioId: 'village' });
    mgr.stop(rec.id);
    expect(rec.status).toBe('stopped');
    expect(rec.stoppedAtTick).toBe(0);
  });

  it('step after stop throws', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'X', scenarioId: 'village' });
    mgr.stop(rec.id);
    expect(() => mgr.step(rec.id)).toThrow();
  });
});

// ── injectEvent() ─────────────────────────────────────────────────────────

describe('SimulationManager.injectEvent()', () => {
  it('queues an event that is reflected in the next dump', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'Inject', scenarioId: 'village' });
    mgr.injectEvent(rec.id, {
      description: 'A stranger arrives at the town square.',
      locationId: 'town_square',
      valenceHint: 0.1,
      noveltyHint: 0.9,
    });
    const dump = mgr.step(rec.id);
    // The injected event should appear in recentEvents
    const found = dump.recentEvents.some(e => e.description.includes('stranger'));
    expect(found).toBe(true);
  });

  it('throws when simulation is stopped', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'I', scenarioId: 'village' });
    mgr.stop(rec.id);
    expect(() =>
      mgr.injectEvent(rec.id, { description: 'test', locationId: 'town_square' })
    ).toThrow();
  });
});

// ── setAgentTrait() ──────────────────────────────────────────────────────────

describe('SimulationManager.setAgentTrait()', () => {
  it('updates the personality trait of an agent', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'Traits', scenarioId: 'village' });
    mgr.setAgentTrait(rec.id, 'aldric', 'openness', 0.1);
    const agent = rec.loop.world.getAgent('aldric');
    const trait = agent!.getPersonality().getTraitProfile().traits.get('openness');
    expect(trait!.value).toBeCloseTo(0.1);
  });

  it('throws for unknown agent', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'T', scenarioId: 'village' });
    expect(() => mgr.setAgentTrait(rec.id, 'nobody', 'openness', 0.5)).toThrow();
  });
});

// ── Listeners ─────────────────────────────────────────────────────────────

describe('SimulationManager listeners', () => {
  it('listener is called after step', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'L', scenarioId: 'village' });
    const calls: number[] = [];
    const listener = (dump: { tick: number }) => calls.push(dump.tick);
    mgr.addListener(rec.id, listener as Parameters<typeof mgr.addListener>[1]);
    mgr.step(rec.id);
    mgr.step(rec.id);
    expect(calls).toEqual([1, 2]);
  });

  it('listener is not called after removal', () => {
    const mgr = makeManager();
    const rec = mgr.create({ name: 'L', scenarioId: 'village' });
    const calls: number[] = [];
    const listener = (dump: { tick: number }) => calls.push(dump.tick);
    mgr.addListener(rec.id, listener as Parameters<typeof mgr.addListener>[1]);
    mgr.step(rec.id);
    mgr.removeListener(rec.id, listener as Parameters<typeof mgr.removeListener>[1]);
    mgr.step(rec.id);
    expect(calls).toEqual([1]);
  });
});
