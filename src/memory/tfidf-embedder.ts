/**
 * Memory Architecture — TF-IDF Embedder (0.3.1.5.3)
 *
 * Lightweight content-based embedding using Term Frequency–Inverse Document
 * Frequency (TF-IDF). Replaces the null-embedding placeholder so that memory
 * retrieval can use cosine similarity for topic-level matching instead of
 * falling back to recency × salience only.
 *
 * Design goals:
 *   - Zero external dependencies (no API calls, no model loading)
 *   - Sub-millisecond per embedding
 *   - Stable vocabulary indices (old embeddings remain valid as vocab grows)
 *   - Serialisable vocabulary for cross-restart consistency
 *
 * Limitations (acceptable for this use case):
 *   - Vocabulary is learned online; old embeddings are not retroactively
 *     updated when new terms enter the vocabulary.
 *   - Embeddings stored before the vocabulary reached its current size will
 *     have shorter vectors; `cosineSimilarity` in retrieval.ts gracefully
 *     falls back to NO_EMBEDDING_SIMILARITY (0.5) for mismatched lengths.
 *   - No stemming or lemmatisation — tokens are lowercased only.
 */

import type { IdfVocabulary } from './types.js';

// ── Constants ────────────────────────────────────────────────

/**
 * Maximum number of distinct terms tracked in the vocabulary.
 * Terms encountered after the cap is reached are ignored (rare terms
 * are typically not useful for topic-level retrieval).
 */
const DEFAULT_MAX_VOCAB_SIZE = 2048;

/**
 * Tokens shorter than this are discarded (articles, conjunctions, etc.).
 */
const MIN_TOKEN_LENGTH = 2;

/**
 * Common English stop words to exclude from the vocabulary.
 * Kept small — the IDF weighting already suppresses ubiquitous terms.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'its', 'as', 'be', 'was',
  'are', 'were', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'this', 'that',
  'these', 'those', 'not', 'no', 'so', 'if', 'then', 'than', 'also',
]);

// ── Helpers ──────────────────────────────────────────────────

/**
 * Tokenises a text string into lowercase alphabetic/numeric tokens.
 *
 * Splits on any run of non-alphanumeric characters, filters stop words,
 * and discards tokens shorter than MIN_TOKEN_LENGTH.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(t));
}

/**
 * L2-normalises a vector in place, returning the same array.
 * Returns the zero vector unchanged when magnitude is 0.
 */
export function l2normalize(v: number[]): number[] {
  let mag = 0;
  for (let i = 0; i < v.length; i++) mag += v[i] * v[i];
  if (mag === 0) return v;
  const inv = 1 / Math.sqrt(mag);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

// ── TfIdfEmbedder ────────────────────────────────────────────

/**
 * Incremental TF-IDF embedder.
 *
 * Each call to `embed()` both updates the vocabulary/IDF weights with the
 * new document and returns the L2-normalised TF-IDF vector for that document.
 * The vocabulary is stable (terms keep their column indices once assigned),
 * which ensures previously stored embeddings remain valid.
 *
 * IDF formula (sklearn smooth variant):
 *   IDF(t) = log((1 + N) / (1 + df(t))) + 1
 *
 * where N is the total number of documents seen so far and df(t) is the
 * number of documents containing term t.
 */
export class TfIdfEmbedder {
  private readonly _termIndex: Map<string, number>;
  private readonly _docFreq: Map<string, number>;
  private _docCount: number;
  private readonly _maxVocabSize: number;

  constructor(options?: { maxVocabSize?: number }) {
    this._termIndex = new Map();
    this._docFreq = new Map();
    this._docCount = 0;
    this._maxVocabSize = options?.maxVocabSize ?? DEFAULT_MAX_VOCAB_SIZE;
  }

  /**
   * Embeds `text` as an L2-normalised TF-IDF vector.
   *
   * Side-effects: updates vocabulary, document-frequency counts, and
   * document count with the new content.
   *
   * Returns an empty array when the text produces no usable tokens
   * (e.g. pure punctuation). The retrieval engine treats empty/null
   * embeddings as NO_EMBEDDING_SIMILARITY (0.5).
   */
  embed(text: string): number[] {
    const tokens = tokenize(text);
    if (tokens.length === 0) return [];

    this._docCount++;

    // Update vocabulary indices and document frequencies
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      if (!this._termIndex.has(token)) {
        if (this._termIndex.size >= this._maxVocabSize) continue;
        this._termIndex.set(token, this._termIndex.size);
      }
      // Token is now guaranteed to be in _termIndex (either pre-existing or just added above)
      this._docFreq.set(token, (this._docFreq.get(token) ?? 0) + 1);
    }

    // Compute raw TF for tokens present in the vocabulary
    const tf = new Map<string, number>();
    for (const token of tokens) {
      if (this._termIndex.has(token)) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
      }
    }

    // Build the TF-IDF vector
    const dim = this._termIndex.size;
    const vector = new Array<number>(dim).fill(0);

    for (const [token, count] of tf) {
      const idx = this._termIndex.get(token)!;
      const tfValue = count / tokens.length;
      const df = this._docFreq.get(token) ?? 1;
      const idf = Math.log((1 + this._docCount) / (1 + df)) + 1;
      vector[idx] = tfValue * idf;
    }

    return l2normalize(vector);
  }

  /**
   * Returns the current vocabulary size (number of distinct terms tracked).
   */
  vocabSize(): number {
    return this._termIndex.size;
  }

  /**
   * Serialises the vocabulary state for inclusion in a memory snapshot.
   * Use `importVocabulary()` to restore.
   */
  exportVocabulary(): IdfVocabulary {
    return {
      termIndex: Object.fromEntries(this._termIndex),
      docFreq: Object.fromEntries(this._docFreq),
      docCount: this._docCount,
    };
  }

  /**
   * Hydrates vocabulary state from a previously exported snapshot.
   * Replaces current state — call before any `embed()` calls on warm start.
   */
  importVocabulary(vocab: IdfVocabulary): void {
    this._termIndex.clear();
    this._docFreq.clear();

    for (const [term, idx] of Object.entries(vocab.termIndex)) {
      this._termIndex.set(term, idx);
    }
    for (const [term, freq] of Object.entries(vocab.docFreq)) {
      this._docFreq.set(term, freq);
    }
    this._docCount = vocab.docCount;
  }
}
