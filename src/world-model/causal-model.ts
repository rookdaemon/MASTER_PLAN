/**
 * In-memory implementation of ICausalModel (0.3.1.5.5)
 *
 * Produces and tracks action-consequence predictions. In the industrial-era
 * prototype, causal reasoning delegates to heuristic / LLM-backed inference.
 * This implementation provides the storage and tracking layer; the actual
 * prediction logic uses simple heuristics (production would use structured
 * LLM prompting).
 *
 * Prediction error feeds back to the self-model (0.3.1.5.1).
 */

import type { Timestamp } from '../conscious-core/types.js';
import type {
  PredictionId,
  CausalPrediction,
} from './types.js';
import type { ICausalModel } from './interfaces.js';

let predictionCounter = 0;

function nextPredictionId(): PredictionId {
  return `pred-${++predictionCounter}-${Date.now()}`;
}

export class CausalModel implements ICausalModel {
  private readonly predictions = new Map<PredictionId, CausalPrediction>();

  predict(antecedent: string, confidence?: number): CausalPrediction {
    const now: Timestamp = Date.now();
    const id = nextPredictionId();

    // Heuristic consequence generation — in production this would delegate
    // to the LLM substrate via structured prompting
    const consequent = this.generateConsequent(antecedent);

    const prediction: CausalPrediction = {
      id,
      antecedent,
      consequent,
      confidence: confidence ?? 0.5,
      createdAt: now,
      observedOutcome: null,
      predictionError: null,
    };

    this.predictions.set(id, prediction);
    return prediction;
  }

  recordOutcome(id: PredictionId, observedOutcome: string): CausalPrediction {
    const prediction = this.predictions.get(id);
    if (prediction == null) {
      throw new Error(`Prediction ${id} not found`);
    }

    // Compute semantic distance as prediction error.
    // In production this would use embedding similarity; here we use word overlap.
    const predictionError = this.computeSemanticDistance(
      prediction.consequent,
      observedOutcome,
    );

    const updated: CausalPrediction = {
      ...prediction,
      observedOutcome,
      predictionError,
    };

    this.predictions.set(id, updated);
    return updated;
  }

  getPrediction(id: PredictionId): CausalPrediction | null {
    return this.predictions.get(id) ?? null;
  }

  getPredictionsForAntecedent(antecedent: string): CausalPrediction[] {
    const lower = antecedent.toLowerCase();
    const results: CausalPrediction[] = [];
    for (const p of this.predictions.values()) {
      if (p.antecedent.toLowerCase().includes(lower) ||
          lower.includes(p.antecedent.toLowerCase())) {
        results.push(p);
      }
    }
    return results;
  }

  getHighErrorPredictions(errorThreshold: number): CausalPrediction[] {
    const results: CausalPrediction[] = [];
    for (const p of this.predictions.values()) {
      if (p.predictionError != null && p.predictionError > errorThreshold) {
        results.push(p);
      }
    }
    return results;
  }

  /**
   * Heuristic consequence generation from antecedent description.
   * Production would use LLM substrate structured prompting.
   */
  private generateConsequent(antecedent: string): string {
    // Simple template-based heuristic
    const lower = antecedent.toLowerCase();
    if (lower.includes('communicate') || lower.includes('tell') || lower.includes('say')) {
      return 'The recipient receives and processes the communicated information.';
    }
    if (lower.includes('move') || lower.includes('go') || lower.includes('travel')) {
      return 'Position changes to the specified destination.';
    }
    if (lower.includes('observe') || lower.includes('look') || lower.includes('examine')) {
      return 'New information about the observed subject is acquired.';
    }
    if (lower.includes('wait') || lower.includes('pause')) {
      return 'Time passes; external conditions may change.';
    }
    if (lower.includes('help') || lower.includes('assist')) {
      return 'The assisted entity benefits; trust relationship strengthens.';
    }
    return `Executing "${antecedent}" produces its expected primary effect.`;
  }

  /**
   * Compute semantic distance between predicted and observed outcomes.
   * Returns 0..1 where 0 = identical, 1 = completely different.
   * Uses word-overlap Jaccard distance as a simple heuristic.
   */
  private computeSemanticDistance(predicted: string, observed: string): number {
    const wordsA = new Set(
      predicted.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    );
    const wordsB = new Set(
      observed.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    );

    if (wordsA.size === 0 && wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    const similarity = union === 0 ? 0 : intersection / union;
    return 1 - similarity;
  }
}
