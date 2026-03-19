import { describe, it, expect } from 'vitest';
import { CausalModel } from '../causal-model.js';

describe('CausalModel', () => {
  it('creates a prediction with a generated consequent', () => {
    const model = new CausalModel();
    const pred = model.predict('communicate with agent-b');
    expect(pred.antecedent).toBe('communicate with agent-b');
    expect(pred.consequent).toContain('recipient');
    expect(pred.confidence).toBe(0.5);
    expect(pred.observedOutcome).toBeNull();
    expect(pred.predictionError).toBeNull();
  });

  it('accepts explicit confidence', () => {
    const model = new CausalModel();
    const pred = model.predict('move to sector 7', 0.8);
    expect(pred.confidence).toBe(0.8);
  });

  it('retrieves prediction by ID', () => {
    const model = new CausalModel();
    const pred = model.predict('observe target');
    const retrieved = model.getPrediction(pred.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(pred.id);
  });

  it('returns null for unknown prediction ID', () => {
    const model = new CausalModel();
    expect(model.getPrediction('nonexistent')).toBeNull();
  });

  it('records outcome and computes prediction error', () => {
    const model = new CausalModel();
    const pred = model.predict('help agent-b');
    const updated = model.recordOutcome(pred.id, 'Agent-b was assisted and trust increased.');

    expect(updated.observedOutcome).toBe('Agent-b was assisted and trust increased.');
    expect(updated.predictionError).not.toBeNull();
    expect(updated.predictionError!).toBeGreaterThanOrEqual(0);
    expect(updated.predictionError!).toBeLessThanOrEqual(1);
  });

  it('throws when recording outcome for nonexistent prediction', () => {
    const model = new CausalModel();
    expect(() => model.recordOutcome('nonexistent', 'outcome')).toThrow();
  });

  it('prediction error is low for similar outcomes', () => {
    const model = new CausalModel();
    const pred = model.predict('observe the environment');
    // The generated consequent contains 'information' and 'observed' and 'subject'
    const updated = model.recordOutcome(
      pred.id,
      'New information about the observed subject was acquired.',
    );
    expect(updated.predictionError!).toBeLessThan(0.5);
  });

  it('prediction error is high for dissimilar outcomes', () => {
    const model = new CausalModel();
    const pred = model.predict('observe the environment');
    const updated = model.recordOutcome(
      pred.id,
      'The entire system exploded catastrophically without warning.',
    );
    expect(updated.predictionError!).toBeGreaterThan(0.5);
  });

  it('finds predictions by antecedent substring', () => {
    const model = new CausalModel();
    model.predict('move to sector 5');
    model.predict('move to sector 7');
    model.predict('communicate with agent-b');

    const movePreds = model.getPredictionsForAntecedent('move');
    expect(movePreds).toHaveLength(2);
  });

  it('returns empty for unmatched antecedent', () => {
    const model = new CausalModel();
    model.predict('move to sector 5');
    expect(model.getPredictionsForAntecedent('quantum')).toHaveLength(0);
  });

  it('filters high-error predictions', () => {
    const model = new CausalModel();
    const p1 = model.predict('action-1');
    const p2 = model.predict('action-2');
    model.recordOutcome(p1.id, p1.consequent); // low error (same text)
    model.recordOutcome(p2.id, 'completely unrelated xyz abc 123');

    const highError = model.getHighErrorPredictions(0.5);
    expect(highError.length).toBeGreaterThanOrEqual(1);
    expect(highError.every((p) => p.predictionError! > 0.5)).toBe(true);
  });

  it('does not include unrecorded predictions in high-error results', () => {
    const model = new CausalModel();
    model.predict('unrecorded action');
    const highError = model.getHighErrorPredictions(0.0);
    expect(highError).toHaveLength(0);
  });
});
