/**
 * Predictive Interpolator — bridges conscious processing lag by predicting
 * sensor values forward in time using a simple linear extrapolation model.
 *
 * Maintains per-modality models that track recent data points, estimate
 * rate-of-change, and measure prediction accuracy. Confidence degrades
 * with prediction horizon and data inconsistency.
 *
 * @see docs/sensorimotor-consciousness-integration/ARCHITECTURE.md §3.2
 */

import type { IPredictiveInterpolator } from './interfaces';
import type {
  SensoryFrame,
  PredictedFrame,
  PredictionError,
  ModalityId,
  Timestamp,
  Duration,
  Confidence,
} from './types';
import { PREDICTION_RELIABLE_CONFIDENCE } from './types';

/** Maximum number of frames retained per modality for model fitting */
const MAX_HISTORY = 20;

/** Base confidence for a model with minimal data */
const BASE_CONFIDENCE = 0.3;

/** Maximum confidence achievable */
const MAX_CONFIDENCE = 0.95;

interface ModalityModel {
  /** Recent frames, chronologically ordered */
  history: SensoryFrame[];
  /** Estimated rate of change (value delta per nanosecond) */
  slope: number;
  /** Consistency measure: 0 = chaotic, 1 = perfectly linear */
  consistency: number;
  /** Pending predictions awaiting validation */
  pendingPredictions: Map<Timestamp, Uint8Array>;
  /** Accumulated prediction errors */
  errors: { absolute: number; count: number; max: number };
}

export class PredictiveInterpolator implements IPredictiveInterpolator {
  private models = new Map<ModalityId, ModalityModel>();

  // ---------------------------------------------------------------------------
  // IPredictiveInterpolator
  // ---------------------------------------------------------------------------

  predict(modalityId: ModalityId, targetTime: Timestamp): PredictedFrame {
    const model = this.models.get(modalityId);

    if (!model || model.history.length === 0) {
      return this.fallbackPrediction(modalityId, targetTime);
    }

    const lastFrame = model.history[model.history.length - 1];
    const horizon: Duration = targetTime - lastFrame.timestamp;

    // Extrapolate the first byte value using the linear slope
    const lastValue = new Uint8Array(lastFrame.data)[0] ?? 0;
    const predictedValue = Math.round(lastValue + model.slope * horizon);
    const clampedValue = Math.max(0, Math.min(255, predictedValue));

    const predictedData = new Uint8Array([clampedValue]);

    // Store prediction for later error tracking
    model.pendingPredictions.set(targetTime, predictedData);

    const confidence = this.computeConfidence(model, horizon);

    return {
      modalityId,
      modalityType: lastFrame.modalityType,
      timestamp: targetTime,
      data: predictedData.buffer,
      confidence: lastFrame.confidence * confidence,
      spatialRef: lastFrame.spatialRef,
      metadata: { ...lastFrame.metadata, predicted: true },
      predictionConfidence: confidence,
      predictionHorizon: horizon,
    };
  }

  getPredictionConfidence(modalityId: ModalityId): Confidence {
    const model = this.models.get(modalityId);
    if (!model || model.history.length < 2) return 0;
    return this.computeConfidence(model, this.averageInterval(model));
  }

  getPredictionError(modalityId: ModalityId): PredictionError {
    const model = this.models.get(modalityId);
    if (!model) {
      return { modalityId, meanAbsoluteError: 0, maxError: 0, sampleCount: 0 };
    }
    const { errors } = model;
    return {
      modalityId,
      meanAbsoluteError: errors.count > 0 ? errors.absolute / errors.count : 0,
      maxError: errors.max,
      sampleCount: errors.count,
    };
  }

  updateModel(modalityId: ModalityId, actualFrame: SensoryFrame): void {
    let model = this.models.get(modalityId);
    if (!model) {
      model = {
        history: [],
        slope: 0,
        consistency: 0,
        pendingPredictions: new Map(),
        errors: { absolute: 0, count: 0, max: 0 },
      };
      this.models.set(modalityId, model);
    }

    // Check if we have a pending prediction for this timestamp
    const predicted = model.pendingPredictions.get(actualFrame.timestamp);
    if (predicted) {
      const actualValue = new Uint8Array(actualFrame.data)[0] ?? 0;
      const predictedValue = predicted[0] ?? 0;
      const error = Math.abs(actualValue - predictedValue);
      model.errors.absolute += error;
      model.errors.count += 1;
      model.errors.max = Math.max(model.errors.max, error);
      model.pendingPredictions.delete(actualFrame.timestamp);
    }

    // Add to history
    model.history.push(actualFrame);

    // Trim to MAX_HISTORY
    if (model.history.length > MAX_HISTORY) {
      model.history.splice(0, model.history.length - MAX_HISTORY);
    }

    // Refit the linear model
    this.fitModel(model);
  }

  getMaxReliableHorizon(modalityId: ModalityId): Duration {
    const model = this.models.get(modalityId);
    if (!model || model.history.length < 2) return 0;

    // Find the horizon at which confidence drops below PREDICTION_RELIABLE_CONFIDENCE
    // by stepping forward in increments and checking computeConfidence.
    const avgInterval = this.averageInterval(model);
    const step = Math.max(1, Math.round(avgInterval / 10));
    let horizon: Duration = 0;
    while (horizon < avgInterval * 10) {
      horizon += step;
      if (this.computeConfidence(model, horizon) < PREDICTION_RELIABLE_CONFIDENCE) {
        return Math.max(0, horizon - step);
      }
    }
    return horizon;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private fallbackPrediction(
    modalityId: ModalityId,
    targetTime: Timestamp,
  ): PredictedFrame {
    return {
      modalityId,
      modalityType: 'CUSTOM',
      timestamp: targetTime,
      data: new Uint8Array([0]).buffer,
      confidence: 0,
      spatialRef: null,
      metadata: { predicted: true, fallback: true },
      predictionConfidence: 0,
      predictionHorizon: 0,
    };
  }

  /**
   * Fit a simple linear model to the first-byte values over time.
   * Also computes a consistency score based on residuals.
   */
  private fitModel(model: ModalityModel): void {
    const { history } = model;
    if (history.length < 2) {
      model.slope = 0;
      model.consistency = 0;
      return;
    }

    // Extract (time, value) pairs
    const points: Array<{ t: number; v: number }> = history.map((f) => ({
      t: f.timestamp,
      v: new Uint8Array(f.data)[0] ?? 0,
    }));

    // Linear regression: slope = Σ(t-t̄)(v-v̄) / Σ(t-t̄)²
    const n = points.length;
    const meanT = points.reduce((s, p) => s + p.t, 0) / n;
    const meanV = points.reduce((s, p) => s + p.v, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (const p of points) {
      const dt = p.t - meanT;
      numerator += dt * (p.v - meanV);
      denominator += dt * dt;
    }

    model.slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = meanV - model.slope * meanT;

    // Compute R² as consistency measure
    let ssRes = 0;
    let ssTot = 0;
    for (const p of points) {
      const predicted = model.slope * p.t + intercept;
      ssRes += (p.v - predicted) ** 2;
      ssTot += (p.v - meanV) ** 2;
    }

    model.consistency = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  }

  /**
   * Compute prediction confidence based on model quality and horizon.
   * Confidence decays with distance from last known data.
   */
  private computeConfidence(model: ModalityModel, horizon: Duration): Confidence {
    if (model.history.length < 2) return 0;

    const avgInterval = this.averageInterval(model);
    // How many intervals ahead are we predicting?
    const horizonRatio = avgInterval > 0 ? horizon / avgInterval : Infinity;

    // Base confidence from data quantity (more data = higher base)
    const dateFactor = Math.min(1, model.history.length / 5);

    // Consistency contribution
    const consistencyFactor = model.consistency;

    // Decay with horizon: halves every 2 intervals
    const horizonDecay = Math.exp(-0.35 * horizonRatio);

    const raw =
      BASE_CONFIDENCE +
      (MAX_CONFIDENCE - BASE_CONFIDENCE) * dateFactor * consistencyFactor * horizonDecay;

    return Math.max(0, Math.min(MAX_CONFIDENCE, raw));
  }

  /** Average time interval between consecutive frames for this model */
  private averageInterval(model: ModalityModel): Duration {
    const { history } = model;
    if (history.length < 2) return 0;
    return (
      (history[history.length - 1].timestamp - history[0].timestamp) /
      (history.length - 1)
    );
  }
}
