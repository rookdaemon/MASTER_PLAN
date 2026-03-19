/**
 * Memory Store Adapter — Agent Runtime
 *
 * Bridges the three-tier IMemorySystem to the minimal IMemoryStore
 * interface consumed by AgentLoop.
 *
 * Adds:
 *   - ExperientialState → RetrievalCue conversion for retrieve()
 *   - Default ConsolidationBudget for consolidate()
 *   - Snapshot persistence surface for PersistenceManager
 */

import type { IMemoryStore } from "./interfaces.js";
import type { IMemorySystem } from "../memory/interfaces.js";
import type {
  RetrievalCue,
  ConsolidationBudget,
  MemorySnapshot,
  CryptographicHash,
} from "../memory/types.js";
import type { ExperientialState } from "../conscious-core/types.js";

// ── Configuration ────────────────────────────────────────────

const DEFAULT_RETRIEVAL_TOP_K = 5;
const DEFAULT_CONSOLIDATION_BUDGET: ConsolidationBudget = {
  maxMs: 100,
  retrievalThreshold: 2,
  salienceThreshold: 0.3,
};

export interface MemoryStoreAdapterOptions {
  retrievalTopK?: number;
  consolidationBudget?: ConsolidationBudget;
}

// ── Adapter ──────────────────────────────────────────────────

export class MemoryStoreAdapter implements IMemoryStore {
  private readonly _system: IMemorySystem;
  private readonly _topK: number;
  private readonly _budget: ConsolidationBudget;

  constructor(system: IMemorySystem, options: MemoryStoreAdapterOptions = {}) {
    this._system = system;
    this._topK = options.retrievalTopK ?? DEFAULT_RETRIEVAL_TOP_K;
    this._budget = options.consolidationBudget ?? DEFAULT_CONSOLIDATION_BUDGET;
  }

  /** Direct access to the underlying IMemorySystem. */
  get inner(): IMemorySystem {
    return this._system;
  }

  async retrieve(state: ExperientialState): Promise<unknown[]> {
    const cue: RetrievalCue = { experientialState: state };
    return this._system.retrieveAndPromote(cue, this._topK);
  }

  async consolidate(): Promise<void> {
    this._system.consolidate(this._budget);
  }

  // ── Snapshot persistence surface ─────────────────────────

  stateHash(): CryptographicHash {
    return this._system.stateHash();
  }

  toSnapshot(): MemorySnapshot {
    return this._system.toSnapshot();
  }

  restoreFromSnapshot(snapshot: MemorySnapshot): void {
    this._system.restoreFromSnapshot(snapshot);
  }
}
