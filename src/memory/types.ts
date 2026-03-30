/**
 * Memory Architecture — Core Types (0.3.1.5.3)
 *
 * Defines the fundamental data structures for the three-tier memory system:
 *   - WorkingMemory: bounded cognitive workspace (maps to LLM context window)
 *   - EpisodicMemory: timestamped experiential records
 *   - SemanticMemory: consolidated knowledge nodes with provenance
 *
 * Imports ExperientialState and related types from conscious-core; builds
 * on NarrativeRecord from agency-stability for identity integration.
 */

import type {
  Timestamp,
  ExperientialState,
  Percept,
  ActionSpec,
} from '../conscious-core/types.js';

// Re-export the primitives used throughout the memory module
export type { Timestamp, ExperientialState, Percept, ActionSpec };

// ── Shared Primitives ────────────────────────────────────────

export type MemoryId = string;
export type CryptographicHash = string;
export type EmbeddingVector = number[];

// ── Working Memory ───────────────────────────────────────────

/**
 * The kind of item occupying a working-memory slot.
 *
 * - 'percept':              a raw sense datum entering the cognitive workspace
 * - 'goal':                 an active goal being pursued this cycle
 * - 'retrieved-episode':    an episodic memory promoted from long-term store
 * - 'deliberation-context': partial plans, ethical considerations, sub-goals
 * - 'self-model':           self-model prediction from the substrate adapter
 */
export type WorkingMemorySlotKind =
  | 'percept'
  | 'goal'
  | 'retrieved-episode'
  | 'deliberation-context'
  | 'self-model';

/**
 * A single active item in the cognitive workspace.
 *
 * Capacity is bounded (maps to the GWT "global workspace"). Items with the
 * lowest relevanceScore are evicted when the buffer is full.
 */
export interface WorkingMemorySlot {
  readonly id: MemoryId;
  readonly kind: WorkingMemorySlotKind;
  readonly content: unknown;
  /** Determines eviction order — lower values are evicted first. */
  readonly relevanceScore: number;
  readonly enteredAt: Timestamp;
}

// ── Episodic Memory ──────────────────────────────────────────

/**
 * A timestamped experiential record of what happened.
 *
 * Each entry is anchored to an ExperientialState (capturing valence, arousal,
 * unityIndex) and records the context, action, and observed outcome of a
 * single episode. retrievalCount and lastRetrievedAt are mutable to support
 * consolidation logic.
 */
export interface EpisodicEntry {
  readonly id: MemoryId;
  readonly percept: Percept;
  readonly experientialState: ExperientialState;
  readonly actionTaken: ActionSpec | null;
  readonly outcomeObserved: string | null;
  /** Snapshot of valence/arousal for fast salience ranking without re-reading the full ExperientialState. */
  readonly emotionalTrace: { valence: number; arousal: number };
  readonly recordedAt: Timestamp;
  /** Embedding of the episode text for cosine-similarity retrieval. */
  readonly embedding: EmbeddingVector | null;
  /** Number of times this entry has been retrieved — used for consolidation threshold. */
  retrievalCount: number;
  lastRetrievedAt: Timestamp | null;
}

// ── Semantic Memory ──────────────────────────────────────────

/**
 * A directed relationship between two semantic nodes.
 * Relation vocabulary examples: "causes", "is-a", "part-of", "enables", "conflicts-with".
 */
export interface SemanticRelationship {
  readonly targetId: MemoryId;
  /** Free-text relation label drawn from a soft ontology (no enum — allows evolution). */
  readonly relation: string;
}

/**
 * A generalised knowledge node decoupled from specific episodes.
 *
 * Consolidated from frequently retrieved or emotionally salient episodes.
 * Confidence increases as corroborating episodes are encountered. Semantic
 * entries are never auto-dropped (unlike episodic entries).
 */
export interface SemanticEntry {
  readonly id: MemoryId;
  readonly topic: string;
  /** Human-readable fact / pattern / skill description. */
  readonly content: string;
  readonly relationships: SemanticRelationship[];
  /** IDs of the episodic entries that contributed to this knowledge node. */
  readonly sourceEpisodeIds: MemoryId[];
  /** 0..1 — increases with corroborating episodes. */
  confidence: number;
  readonly createdAt: Timestamp;
  lastReinforcedAt: Timestamp;
  /** Embedding for similarity search at retrieval time. */
  readonly embedding: EmbeddingVector | null;
}

// ── Retrieval ────────────────────────────────────────────────

/**
 * Cue used to drive memory retrieval.
 *
 * At least one of `text`, `embedding`, or `experientialState` should be
 * provided. The retrieval engine will use whatever is available.
 */
export interface RetrievalCue {
  /** Free-text query that will be embedded for similarity search. */
  readonly text?: string;
  /** Pre-computed embedding (skip embedding step if provided). */
  readonly embedding?: EmbeddingVector;
  /** An experiential state whose emotional trace biases retrieval. */
  readonly experientialState?: ExperientialState;
  /** Optional topic filter to narrow semantic retrieval. */
  readonly topic?: string;
}

/**
 * A single ranked result returned by a memory query.
 *
 * compositeScore = similarity * recencyWeight * salienceBoost
 */
export interface RetrievalResult {
  readonly type: 'episodic' | 'semantic';
  readonly entry: EpisodicEntry | SemanticEntry;
  /** Overall ranking score. */
  readonly compositeScore: number;
  /** Cosine similarity to the cue embedding (0..1). */
  readonly similarity: number;
  /** Recency decay factor — 1.0 at creation, decays toward 0 over time. */
  readonly recencyWeight: number;
  /** Boost from emotional valence/arousal magnitude. */
  readonly salienceBoost: number;
}

// ── Consolidation ────────────────────────────────────────────

/**
 * Controls how much of the cognitive cycle budget consolidation may use.
 * Must not exceed ≤15% of total cycle budget (per architecture spec).
 */
export interface ConsolidationBudget {
  /** Maximum wall-clock milliseconds this consolidation pass may consume. */
  readonly maxMs: number;
  /** Minimum retrieval count before an episode is a consolidation candidate. */
  readonly retrievalThreshold: number;
  /** Minimum |emotionalTrace| magnitude for salience-based consolidation. */
  readonly salienceThreshold: number;
}

/**
 * Summary of what a consolidation pass did.
 */
export interface ConsolidationReport {
  readonly episodesConsolidated: number;
  readonly semanticEntriesCreated: number;
  readonly semanticEntriesReinforced: number;
  readonly episodesDecayed: number;
  readonly durationMs: number;
  readonly budgetExceeded: boolean;
}

// ── Checkpoint / Migration ───────────────────────────────────

/**
 * Serialised TF-IDF vocabulary state for embedding persistence.
 *
 * Stored alongside the memory snapshot so that embeddings remain consistent
 * across agent restarts without requiring a refit pass.
 */
export interface IdfVocabulary {
  /** Maps each known term to its stable column index in the embedding vector. */
  readonly termIndex: Record<string, number>;
  /** Number of documents (memory entries) that contain each term. */
  readonly docFreq: Record<string, number>;
  /** Total number of documents (memory entries) the embedder has processed. */
  readonly docCount: number;
}

/**
 * A serialisable snapshot of the full memory state for identity checkpoint
 * inclusion and substrate migration.
 */
export interface MemorySnapshot {
  readonly workingMemorySlots: WorkingMemorySlot[];
  readonly episodicEntries: EpisodicEntry[];
  readonly semanticEntries: SemanticEntry[];
  readonly takenAt: Timestamp;
  /** SHA-256 of the canonical JSON of the three arrays (integrity check). */
  readonly integrityHash: CryptographicHash;
  /**
   * TF-IDF vocabulary persisted alongside memory so embeddings stay
   * consistent across restarts. Optional for backward compatibility with
   * snapshots created before this field was added.
   */
  readonly idfVocabulary?: IdfVocabulary;
}
