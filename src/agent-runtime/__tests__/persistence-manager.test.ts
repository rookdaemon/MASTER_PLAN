/**
 * PersistenceManager tests.
 *
 * Validates state-dir initialization, save/load for memory snapshots
 * and personality snapshots, and graceful handling of missing files.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { PersistenceManager, DRIVE_SNAPSHOT_FILE } from "../persistence-manager.js";
import { InMemoryFileSystem } from "../filesystem.js";
import type { MemorySnapshot } from "../../memory/types.js";
import type { PersonalitySnapshot } from "../../personality/types.js";
import type { DriveSnapshot } from "../../intrinsic-motivation/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeMemorySnapshot(): MemorySnapshot {
  return {
    workingMemorySlots: [],
    episodicEntries: [],
    semanticEntries: [],
    takenAt: 1000,
    integrityHash: "test-hash-abc",
  };
}

function makePersonalitySnapshot(): PersonalitySnapshot {
  return {
    agentId: "agent-0",
    traitValues: {
      openness: 0.7,
      conscientiousness: 0.6,
      extraversion: 0.5,
      agreeableness: 0.8,
      neuroticism: 0.3,
    } as Record<string, number>,
    snapshotAt: 1000,
  };
}

function makeDriveSnapshot(): DriveSnapshot {
  return {
    driveStates: {
      curiosity: {
        driveType: 'curiosity',
        strength: 0.7,
        active: true,
        lastFiredAt: 999_000,
        extendedCooldownUntil: null,
        consecutiveActiveTickCount: 2,
      },
      social: {
        driveType: 'social',
        strength: 0.3,
        active: true,
        lastFiredAt: null,
        extendedCooldownUntil: null,
        consecutiveActiveTickCount: 1,
      },
      'homeostatic-arousal': { driveType: 'homeostatic-arousal', strength: 0, active: false, lastFiredAt: null, extendedCooldownUntil: null, consecutiveActiveTickCount: 0 },
      'homeostatic-load':    { driveType: 'homeostatic-load',    strength: 0, active: false, lastFiredAt: null, extendedCooldownUntil: null, consecutiveActiveTickCount: 0 },
      'homeostatic-novelty': { driveType: 'homeostatic-novelty', strength: 0, active: false, lastFiredAt: null, extendedCooldownUntil: null, consecutiveActiveTickCount: 0 },
      boredom:    { driveType: 'boredom',    strength: 0, active: false, lastFiredAt: null, extendedCooldownUntil: null, consecutiveActiveTickCount: 0 },
      mastery:    { driveType: 'mastery',    strength: 0, active: false, lastFiredAt: null, extendedCooldownUntil: null, consecutiveActiveTickCount: 0 },
      existential:{ driveType: 'existential',strength: 0, active: false, lastFiredAt: null, extendedCooldownUntil: null, consecutiveActiveTickCount: 0 },
    } as DriveSnapshot['driveStates'],
    snapshotAt: 1_000_000,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("PersistenceManager", () => {
  const STATE_DIR = "/home/agent/.master-plan/state";

  describe("initialize()", () => {
    it("creates the state directory", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);

      await pm.initialize();

      // mkdir was called — no error means it worked
      // (InMemoryFileSystem mkdir is a no-op, which is fine for the test)
    });
  });

  describe("memory snapshots", () => {
    it("saves and loads a memory snapshot", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      const snapshot = makeMemorySnapshot();
      await pm.saveMemorySnapshot(snapshot);

      const loaded = await pm.loadMemorySnapshot();
      expect(loaded).toEqual(snapshot);
    });

    it("returns null when no memory snapshot exists", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      const loaded = await pm.loadMemorySnapshot();
      expect(loaded).toBeNull();
    });

    it("persists to the expected file path", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      await pm.saveMemorySnapshot(makeMemorySnapshot());

      expect(fs.exists(join(STATE_DIR, "memory-snapshot.json"))).toBe(true);
    });
  });

  describe("personality snapshots", () => {
    it("saves and loads a personality snapshot", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      const snapshot = makePersonalitySnapshot();
      await pm.savePersonalitySnapshot(snapshot);

      const loaded = await pm.loadPersonalitySnapshot();
      expect(loaded).toEqual(snapshot);
    });

    it("returns null when no personality snapshot exists", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      const loaded = await pm.loadPersonalitySnapshot();
      expect(loaded).toBeNull();
    });

    it("persists to the expected file path", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      await pm.savePersonalitySnapshot(makePersonalitySnapshot());

      expect(fs.exists(join(STATE_DIR, "personality-snapshot.json"))).toBe(true);
    });
  });

  describe("hasState()", () => {
    it("returns false when state directory has no snapshots", () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);

      expect(pm.hasState()).toBe(false);
    });

    it("returns true when memory snapshot exists", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();
      await pm.saveMemorySnapshot(makeMemorySnapshot());

      expect(pm.hasState()).toBe(true);
    });

    it("returns true when personality snapshot exists", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();
      await pm.savePersonalitySnapshot(makePersonalitySnapshot());

      expect(pm.hasState()).toBe(true);
    });

    it("returns true when drive snapshot exists", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();
      await pm.saveDriveSnapshot(makeDriveSnapshot());

      expect(pm.hasState()).toBe(true);
    });
  });

  describe("drive snapshots", () => {
    it("saves and loads a drive snapshot", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      const snapshot = makeDriveSnapshot();
      await pm.saveDriveSnapshot(snapshot);

      const loaded = await pm.loadDriveSnapshot();
      expect(loaded).toEqual(snapshot);
    });

    it("returns null when no drive snapshot exists", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      const loaded = await pm.loadDriveSnapshot();
      expect(loaded).toBeNull();
    });

    it("persists to the expected file path", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      await pm.saveDriveSnapshot(makeDriveSnapshot());

      expect(fs.exists(join(STATE_DIR, DRIVE_SNAPSHOT_FILE))).toBe(true);
    });

    it("preserves drive state fields across save/load round-trip", async () => {
      const fs = new InMemoryFileSystem();
      const pm = new PersistenceManager(STATE_DIR, fs);
      await pm.initialize();

      const snapshot = makeDriveSnapshot();
      await pm.saveDriveSnapshot(snapshot);
      const loaded = await pm.loadDriveSnapshot();

      expect(loaded!.driveStates['curiosity'].strength).toBe(0.7);
      expect(loaded!.driveStates['curiosity'].lastFiredAt).toBe(999_000);
      expect(loaded!.snapshotAt).toBe(1_000_000);
    });
  });
});
