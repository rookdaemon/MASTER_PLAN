/**
 * MemoryStoreAdapter tests.
 *
 * Validates that the adapter correctly bridges IMemorySystem (three-tier)
 * to IMemoryStore (agent-loop interface), and exposes snapshot persistence
 * methods for the PersistenceManager.
 */
import { describe, it, expect, vi } from "vitest";
import { MemoryStoreAdapter } from "../memory-store-adapter.js";
import type { IMemorySystem } from "../../memory/interfaces.js";
import type {
  RetrievalCue,
  RetrievalResult,
  ConsolidationBudget,
  ConsolidationReport,
  MemorySnapshot,
  CryptographicHash,
} from "../../memory/types.js";
import type { ExperientialState } from "../../conscious-core/types.js";

// ── Helpers ──────────────────────────────────────────────────

function makeExperientialState(overrides: Partial<ExperientialState> = {}): ExperientialState {
  return {
    timestamp: 1000,
    phenomenalContent: { modalities: ["internal"], richness: 0.5, raw: null },
    intentionalContent: { target: "test", clarity: 0.7 },
    valence: 0.1,
    arousal: 0.3,
    unityIndex: 0.8,
    continuityToken: { id: "ct-1", previousId: null, timestamp: 1000 },
    ...overrides,
  };
}

function makeMockMemorySystem(): IMemorySystem {
  const mockResults: RetrievalResult[] = [
    {
      entry: { id: "ep-1", topic: "test" },
      source: "episodic",
      compositeScore: 0.9,
      similarityScore: 0.8,
      recencyWeight: 0.7,
      salienceBoost: 0.6,
    } as RetrievalResult,
  ];

  const mockReport: ConsolidationReport = {
    episodesConsolidated: 1,
    semanticEntriesCreated: 0,
    semanticEntriesReinforced: 1,
    episodesDecayed: 0,
    durationMs: 5,
    budgetExceeded: false,
  };

  const mockSnapshot: MemorySnapshot = {
    workingMemorySlots: [],
    episodicEntries: [],
    semanticEntries: [],
    takenAt: 1000,
    integrityHash: "abc123",
  };

  return {
    working: {} as IMemorySystem["working"],
    episodic: {} as IMemorySystem["episodic"],
    semantic: {} as IMemorySystem["semantic"],
    retrieveAndPromote: vi.fn().mockReturnValue(mockResults),
    consolidate: vi.fn().mockReturnValue(mockReport),
    stateHash: vi.fn().mockReturnValue("hash-abc" as CryptographicHash),
    toSnapshot: vi.fn().mockReturnValue(mockSnapshot),
    restoreFromSnapshot: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("MemoryStoreAdapter", () => {
  describe("retrieve()", () => {
    it("converts ExperientialState to RetrievalCue and delegates to IMemorySystem", async () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem);
      const state = makeExperientialState();

      const results = await adapter.retrieve(state);

      expect(mockSystem.retrieveAndPromote).toHaveBeenCalledTimes(1);
      const call = vi.mocked(mockSystem.retrieveAndPromote).mock.calls[0]!;
      // Cue should include the experiential state
      expect(call[0]).toEqual(
        expect.objectContaining({ experientialState: state })
      );
      // Default topK
      expect(call[1]).toBe(5);
      // Returns the retrieval results as unknown[]
      expect(results).toHaveLength(1);
    });

    it("uses configured topK", async () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem, { retrievalTopK: 10 });
      const state = makeExperientialState();

      await adapter.retrieve(state);

      const call = vi.mocked(mockSystem.retrieveAndPromote).mock.calls[0]!;
      expect(call[1]).toBe(10);
    });
  });

  describe("consolidate()", () => {
    it("delegates to IMemorySystem.consolidate with default budget", async () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem);

      await adapter.consolidate();

      expect(mockSystem.consolidate).toHaveBeenCalledTimes(1);
      const call = vi.mocked(mockSystem.consolidate).mock.calls[0]!;
      const budget = call[0] as ConsolidationBudget;
      expect(budget.maxMs).toBeGreaterThan(0);
      expect(budget.retrievalThreshold).toBeGreaterThanOrEqual(0);
      expect(budget.salienceThreshold).toBeGreaterThanOrEqual(0);
    });

    it("uses configured consolidation budget", async () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem, {
        consolidationBudget: { maxMs: 200, retrievalThreshold: 5, salienceThreshold: 0.7 },
      });

      await adapter.consolidate();

      const call = vi.mocked(mockSystem.consolidate).mock.calls[0]!;
      expect(call[0]).toEqual({ maxMs: 200, retrievalThreshold: 5, salienceThreshold: 0.7 });
    });
  });

  describe("snapshot persistence", () => {
    it("exposes stateHash()", () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem);

      const hash = adapter.stateHash();

      expect(mockSystem.stateHash).toHaveBeenCalled();
      expect(hash).toBe("hash-abc");
    });

    it("exposes toSnapshot()", () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem);

      const snapshot = adapter.toSnapshot();

      expect(mockSystem.toSnapshot).toHaveBeenCalled();
      expect(snapshot.integrityHash).toBe("abc123");
    });

    it("exposes restoreFromSnapshot()", () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem);

      const snap: MemorySnapshot = {
        workingMemorySlots: [],
        episodicEntries: [],
        semanticEntries: [],
        takenAt: 2000,
        integrityHash: "def456",
      };

      adapter.restoreFromSnapshot(snap);

      expect(mockSystem.restoreFromSnapshot).toHaveBeenCalledWith(snap);
    });
  });

  describe("inner property", () => {
    it("exposes the underlying IMemorySystem for direct access", () => {
      const mockSystem = makeMockMemorySystem();
      const adapter = new MemoryStoreAdapter(mockSystem);

      expect(adapter.inner).toBe(mockSystem);
    });
  });
});
