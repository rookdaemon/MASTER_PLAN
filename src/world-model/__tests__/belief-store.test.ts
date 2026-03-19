import { describe, it, expect } from 'vitest';
import { BeliefStore } from '../belief-store.js';
import type { BeliefSource } from '../types.js';

const source: BeliefSource = {
  type: 'percept',
  referenceId: 'percept-1',
  description: 'Visual observation',
};

describe('BeliefStore', () => {
  it('adds and retrieves a belief', () => {
    const store = new BeliefStore();
    const id = store.addBelief('The sky is blue', 0.9, source, ['environment']);
    const belief = store.getBelief(id);
    expect(belief).not.toBeNull();
    expect(belief!.content).toBe('The sky is blue');
    expect(belief!.confidence).toBe(0.9);
    expect(belief!.source).toEqual(source);
    expect(belief!.domainTags).toEqual(['environment']);
  });

  it('returns null for unknown belief ID', () => {
    const store = new BeliefStore();
    expect(store.getBelief('nonexistent')).toBeNull();
  });

  it('retrieves beliefs by domain tags', () => {
    const store = new BeliefStore();
    store.addBelief('Fact A', 0.8, source, ['navigation']);
    store.addBelief('Fact B', 0.7, source, ['environment']);
    store.addBelief('Fact C', 0.6, source, ['navigation', 'environment']);

    const navBeliefs = store.getBeliefsByDomain(['navigation']);
    expect(navBeliefs.length).toBe(2);

    const envBeliefs = store.getBeliefsByDomain(['environment']);
    expect(envBeliefs.length).toBe(2);
  });

  it('returns empty array for empty domain tags', () => {
    const store = new BeliefStore();
    store.addBelief('Fact A', 0.8, source, ['navigation']);
    expect(store.getBeliefsByDomain([])).toEqual([]);
  });

  it('clamps confidence to 0..1', () => {
    const store = new BeliefStore();
    const id = store.addBelief('Over confident', 1.5, source, ['test']);
    expect(store.getBelief(id)!.confidence).toBe(1);
  });

  // ── Revision policy ──

  it('rejects weak evidence against high-confidence belief', () => {
    const store = new BeliefStore();
    const id = store.addBelief('Firm belief', 0.85, source, ['test']);
    const revision = store.revise(id, 0.3, 'weak counter-evidence');

    expect(revision.resolution).toBe('rejected');
    expect(revision.newConfidence).toBe(0.85);
    expect(store.getBelief(id)!.confidence).toBe(0.85);
  });

  it('accepts strong contradictory evidence (delta > 0.4) when new evidence is not weak', () => {
    const store = new BeliefStore();
    const id = store.addBelief('Old belief', 0.9, source, ['test']);
    // newConfidence=0.4 is not < 0.4, so it's not "weak evidence" —
    // but delta=0.5 > 0.4 makes it a strong contradiction → updated
    const revision = store.revise(id, 0.4, 'strong refutation');

    expect(revision.resolution).toBe('updated');
    expect(revision.newConfidence).toBe(0.4);
    expect(store.getBelief(id)!.confidence).toBe(0.4);
  });

  it('flags uncertain for moderate conflict', () => {
    const store = new BeliefStore();
    const id = store.addBelief('Moderate belief', 0.6, source, ['test']);
    const revision = store.revise(id, 0.4, 'moderate counter-evidence');

    expect(revision.resolution).toBe('flagged-uncertain');
    expect(revision.newConfidence).toBeCloseTo(0.5, 5);
    expect(store.getBelief(id)!.confidence).toBeCloseTo(0.5, 5);
  });

  it('throws when revising nonexistent belief', () => {
    const store = new BeliefStore();
    expect(() => store.revise('nonexistent', 0.5, 'test')).toThrow();
  });

  it('records revision history', () => {
    const store = new BeliefStore();
    const id = store.addBelief('Evolving belief', 0.5, source, ['test']);
    store.revise(id, 0.1, 'first update');
    store.revise(id, 0.8, 'second update');

    const history = store.getRevisionHistory(id);
    expect(history).toHaveLength(2);
    expect(history[0]!.trigger).toBe('first update');
    expect(history[1]!.trigger).toBe('second update');
  });

  // ── Removal ──

  it('removes a belief', () => {
    const store = new BeliefStore();
    const id = store.addBelief('Temporary', 0.5, source, ['test']);
    expect(store.removeBelief(id)).toBe(true);
    expect(store.getBelief(id)).toBeNull();
    expect(store.getRevisionHistory(id)).toEqual([]);
  });

  it('returns false when removing nonexistent belief', () => {
    const store = new BeliefStore();
    expect(store.removeBelief('nonexistent')).toBe(false);
  });

  // ── Contradiction detection ──

  it('detects contradictions between negated beliefs in the same domain', () => {
    const store = new BeliefStore();
    store.addBelief('The bridge is passable', 0.8, source, ['navigation']);
    store.addBelief('The bridge is not passable', 0.7, source, ['navigation']);

    const contradictions = store.detectContradictions();
    expect(contradictions.length).toBeGreaterThanOrEqual(1);
    expect(contradictions[0]!.severity).toBe('medium');
  });

  it('does not flag contradictions across unrelated domains', () => {
    const store = new BeliefStore();
    store.addBelief('The bridge is passable', 0.8, source, ['navigation']);
    store.addBelief('The bridge is not passable', 0.7, source, ['cooking']);

    const contradictions = store.detectContradictions();
    expect(contradictions).toHaveLength(0);
  });

  it('does not flag non-contradictory beliefs', () => {
    const store = new BeliefStore();
    store.addBelief('The sky is blue', 0.9, source, ['environment']);
    store.addBelief('Water is wet', 0.95, source, ['environment']);

    const contradictions = store.detectContradictions();
    expect(contradictions).toHaveLength(0);
  });
});
