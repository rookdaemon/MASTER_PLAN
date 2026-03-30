/**
 * TF-IDF Embedder Tests
 *
 * Covers:
 *   - tokenize(): lowercase, punctuation, stop words, short token filtering
 *   - l2normalize(): unit vector output, zero-vector safety
 *   - TfIdfEmbedder.embed(): vector shape, similarity ordering, null-safe tokens
 *   - TfIdfEmbedder.exportVocabulary() / importVocabulary(): roundtrip
 *   - Vocabulary cap (maxVocabSize)
 */

import { describe, it, expect } from 'vitest';
import { tokenize, l2normalize, TfIdfEmbedder } from '../tfidf-embedder.js';
import { cosineSimilarity } from '../retrieval.js';

// ── tokenize ──────────────────────────────────────────────────

describe('tokenize', () => {
  it('lowercases input', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('splits on punctuation and whitespace', () => {
    const tokens = tokenize('foo-bar, baz.qux');
    expect(tokens).toContain('foo');
    expect(tokens).toContain('bar');
    expect(tokens).toContain('baz');
    expect(tokens).toContain('qux');
  });

  it('filters tokens shorter than 2 characters', () => {
    expect(tokenize('I a go')).not.toContain('i');
    expect(tokenize('I a go')).not.toContain('a');
    expect(tokenize('I a go')).toContain('go');
  });

  it('removes common stop words', () => {
    const tokens = tokenize('the quick brown fox and the lazy dog');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('and');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
  });

  it('returns empty array for pure punctuation / stop-word-only input', () => {
    expect(tokenize('...')).toHaveLength(0);
    expect(tokenize('the and or')).toHaveLength(0);
  });

  it('handles numbers as tokens', () => {
    const tokens = tokenize('version 42 update');
    expect(tokens).toContain('42');
    expect(tokens).toContain('version');
    expect(tokens).toContain('update');
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toHaveLength(0);
  });
});

// ── l2normalize ───────────────────────────────────────────────

describe('l2normalize', () => {
  it('produces a unit vector', () => {
    const v = [3, 4]; // magnitude = 5
    const norm = l2normalize([...v]);
    const magnitude = Math.sqrt(norm.reduce((s, x) => s + x * x, 0));
    expect(magnitude).toBeCloseTo(1.0);
  });

  it('returns the zero vector unchanged (no division by zero)', () => {
    const v = [0, 0, 0];
    expect(l2normalize([...v])).toEqual([0, 0, 0]);
  });

  it('preserves direction', () => {
    const v = [1, 0, 0];
    const norm = l2normalize([...v]);
    expect(norm[0]).toBeCloseTo(1.0);
    expect(norm[1]).toBeCloseTo(0.0);
    expect(norm[2]).toBeCloseTo(0.0);
  });
});

// ── TfIdfEmbedder.embed() ─────────────────────────────────────

describe('TfIdfEmbedder.embed()', () => {
  it('returns an array of numbers', () => {
    const embedder = new TfIdfEmbedder();
    const v = embedder.embed('memory persistence architecture');
    expect(Array.isArray(v)).toBe(true);
    expect(v.every(x => typeof x === 'number')).toBe(true);
  });

  it('returns an empty array for all-stop-word text', () => {
    const embedder = new TfIdfEmbedder();
    const v = embedder.embed('the and or but');
    expect(v).toHaveLength(0);
  });

  it('returns a vector with length equal to vocabulary size', () => {
    const embedder = new TfIdfEmbedder();
    embedder.embed('alpha beta gamma');
    const v = embedder.embed('delta epsilon');
    expect(v.length).toBe(embedder.vocabSize());
  });

  it('produces a unit-norm vector (L2 = 1)', () => {
    const embedder = new TfIdfEmbedder();
    const v = embedder.embed('memory persistence architecture design');
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1.0, 5);
  });

  it('similar texts have higher cosine similarity than dissimilar texts', () => {
    const embedder = new TfIdfEmbedder();

    // Seed vocabulary with background corpus
    embedder.embed('memory system architecture design');
    embedder.embed('file system operations');
    embedder.embed('network protocol communication');
    embedder.embed('database query optimisation');
    embedder.embed('memory retrieval search');

    const query = embedder.embed('memory architecture');
    const relatedDoc = embedder.embed('memory system design architecture');
    const unrelatedDoc = embedder.embed('network protocol communication');

    const simRelated = cosineSimilarity(query, relatedDoc);
    const simUnrelated = cosineSimilarity(query, unrelatedDoc);

    expect(simRelated).toBeGreaterThan(simUnrelated);
  });

  it('identical texts produce cosine similarity close to 1.0', () => {
    const embedder = new TfIdfEmbedder();
    const text = 'persistence architecture memory design';
    const v1 = embedder.embed(text);
    // Embed a second time — both are unit vectors with the same non-zero components
    const v2 = embedder.embed(text);
    // v2 has updated IDF (docCount is now 2 for all terms), so similarity is high but not exactly 1.0
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeGreaterThan(0.95);
  });

  it('increments vocabulary size as new terms are introduced', () => {
    const embedder = new TfIdfEmbedder();
    const before = embedder.vocabSize();
    embedder.embed('uniqueterm1 uniqueterm2');
    expect(embedder.vocabSize()).toBeGreaterThan(before);
  });

  it('vocabulary size does not exceed maxVocabSize', () => {
    const embedder = new TfIdfEmbedder({ maxVocabSize: 5 });
    for (let i = 0; i < 50; i++) {
      embedder.embed(`word${i} another${i} term${i}`);
    }
    expect(embedder.vocabSize()).toBeLessThanOrEqual(5);
  });
});

// ── exportVocabulary / importVocabulary ───────────────────────

describe('TfIdfEmbedder vocabulary persistence', () => {
  it('exportVocabulary captures termIndex, docFreq, and docCount', () => {
    const embedder = new TfIdfEmbedder();
    embedder.embed('hello world');
    embedder.embed('hello again');

    const vocab = embedder.exportVocabulary();

    expect(typeof vocab.docCount).toBe('number');
    expect(vocab.docCount).toBe(2);
    expect(typeof vocab.termIndex).toBe('object');
    expect(typeof vocab.docFreq).toBe('object');
    expect(Object.keys(vocab.termIndex)).toContain('hello');
    expect(Object.keys(vocab.termIndex)).toContain('world');
    expect(vocab.docFreq['hello']).toBe(2); // appeared in both docs
    expect(vocab.docFreq['world']).toBe(1);
  });

  it('importVocabulary restores state so embeddings are consistent', () => {
    const embedderA = new TfIdfEmbedder();
    embedderA.embed('persistence architecture');
    embedderA.embed('memory retrieval system');
    const vocab = embedderA.exportVocabulary();

    // Embed a cue with embedderA
    const cueA = embedderA.embed('persistence retrieval');

    // Restore to a fresh embedder and embed the same cue
    const embedderB = new TfIdfEmbedder();
    embedderB.importVocabulary(vocab);
    const cueB = embedderB.embed('persistence retrieval');

    // Both cues should be identical
    expect(cueA.length).toBe(cueB.length);
    const sim = cosineSimilarity(cueA, cueB);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('importVocabulary replaces any existing state', () => {
    const embedderA = new TfIdfEmbedder();
    embedderA.embed('original content here');
    const vocabA = embedderA.exportVocabulary();

    const embedderB = new TfIdfEmbedder();
    embedderB.embed('different unrelated words completely');
    // Now overwrite with vocabA
    embedderB.importVocabulary(vocabA);

    const vocabB = embedderB.exportVocabulary();
    expect(vocabB.docCount).toBe(vocabA.docCount);
    expect(Object.keys(vocabB.termIndex)).toEqual(
      expect.arrayContaining(Object.keys(vocabA.termIndex)),
    );
  });

  it('roundtrip produces the same docCount and term coverage', () => {
    const embedder = new TfIdfEmbedder();
    for (const text of ['alpha beta', 'beta gamma', 'gamma delta alpha']) {
      embedder.embed(text);
    }
    const exported = embedder.exportVocabulary();

    const restored = new TfIdfEmbedder();
    restored.importVocabulary(exported);
    const reExported = restored.exportVocabulary();

    expect(reExported.docCount).toBe(exported.docCount);
    expect(Object.keys(reExported.termIndex).sort()).toEqual(
      Object.keys(exported.termIndex).sort(),
    );
    expect(Object.keys(reExported.docFreq).sort()).toEqual(
      Object.keys(exported.docFreq).sort(),
    );
  });
});
