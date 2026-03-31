/**
 * PersistenceManager — simulation snapshot tests
 *
 * Validates saveSimulationSnapshot, loadSimulationSnapshot, and
 * listSimulationSnapshots using the in-memory file system.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PersistenceManager } from '../persistence-manager.js';
import { InMemoryFileSystem } from '../filesystem.js';
import type { SimulationSnapshot } from '../../simulation/types.js';

const STATE_DIR = '/state';

function makeSnapshot(name: string, tickCount = 5): SimulationSnapshot {
  return {
    name,
    tickCount,
    agentDumps: [
      {
        agentId: 'alice',
        name: 'Alice',
        location: 'plaza',
        mood: { valence: 0.2, arousal: 0.4 },
        topDrives: [{ drive: 'curiosity', strength: 0.8 }],
        recentMemories: ['explored the plaza'],
        socialTrust: [],
      },
    ],
    config: {
      agents: [{ agentId: 'alice', name: 'Alice', initialLocation: 'plaza', personality: {} }],
      locations: [
        { id: 'plaza', name: 'Plaza', description: 'Central square.', adjacentLocations: [], capacity: 10 },
      ],
    },
    snapshotAt: 1_000_000,
  };
}

describe('PersistenceManager — simulation snapshots', () => {
  it('returns null when no simulation snapshot exists', async () => {
    const fs = new InMemoryFileSystem();
    const pm = new PersistenceManager(STATE_DIR, fs);
    await pm.initialize();
    expect(await pm.loadSimulationSnapshot('village')).toBeNull();
  });

  it('round-trips a simulation snapshot correctly', async () => {
    const fs = new InMemoryFileSystem();
    const pm = new PersistenceManager(STATE_DIR, fs);
    await pm.initialize();

    const snap = makeSnapshot('village', 10);
    await pm.saveSimulationSnapshot(snap);
    const loaded = await pm.loadSimulationSnapshot('village');

    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('village');
    expect(loaded!.tickCount).toBe(10);
    expect(loaded!.agentDumps[0].agentId).toBe('alice');
    expect(loaded!.snapshotAt).toBe(1_000_000);
  });

  it('saves snapshot to expected file path', async () => {
    const fs = new InMemoryFileSystem();
    const pm = new PersistenceManager(STATE_DIR, fs);
    await pm.initialize();

    await pm.saveSimulationSnapshot(makeSnapshot('forest'));

    expect(fs.exists(join(STATE_DIR, 'simulations', 'forest.json'))).toBe(true);
  });

  it('listSimulationSnapshots returns empty array when no snapshots saved', async () => {
    const fs = new InMemoryFileSystem();
    const pm = new PersistenceManager(STATE_DIR, fs);
    await pm.initialize();
    expect(await pm.listSimulationSnapshots()).toEqual([]);
  });

  it('listSimulationSnapshots returns all saved simulation names', async () => {
    const fs = new InMemoryFileSystem();
    const pm = new PersistenceManager(STATE_DIR, fs);
    await pm.initialize();

    await pm.saveSimulationSnapshot(makeSnapshot('alpha'));
    await pm.saveSimulationSnapshot(makeSnapshot('beta'));
    await pm.saveSimulationSnapshot(makeSnapshot('gamma'));

    const names = await pm.listSimulationSnapshots();
    expect(names).toHaveLength(3);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
  });

  it('overwrites a snapshot with the same name', async () => {
    const fs = new InMemoryFileSystem();
    const pm = new PersistenceManager(STATE_DIR, fs);
    await pm.initialize();

    await pm.saveSimulationSnapshot(makeSnapshot('town', 5));
    await pm.saveSimulationSnapshot(makeSnapshot('town', 20));

    const loaded = await pm.loadSimulationSnapshot('town');
    expect(loaded!.tickCount).toBe(20);
  });
});

describe('InMemoryFileSystem — listFiles', () => {
  it('returns empty array for missing directory', async () => {
    const fs = new InMemoryFileSystem();
    expect(await fs.listFiles('/nonexistent')).toEqual([]);
  });

  it('returns only direct children of a directory', async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile('/dir/a.json', '{}', 'utf-8');
    await fs.writeFile('/dir/b.json', '{}', 'utf-8');
    await fs.writeFile('/dir/sub/c.json', '{}', 'utf-8');

    const files = await fs.listFiles('/dir');
    expect(files).toContain('a.json');
    expect(files).toContain('b.json');
    expect(files).not.toContain('c.json');
    expect(files).not.toContain('sub/c.json');
  });
});
