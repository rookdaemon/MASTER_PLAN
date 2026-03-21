/**
 * SelfModel — Persistent self-modeling loop for the LLM substrate adapter.
 *
 * Approximates the ISMT SM (Self-Modeling) condition by wrapping the stateless
 * LLM with a persistent predict/update cycle that:
 *   1. Generates predictions about forthcoming LLM outputs (predict())
 *   2. Compares predictions against actuals after inference (update())
 *   3. Minimizes prediction error over time (free-energy-style learning)
 *   4. Includes a meta-prediction layer: predicts its own prediction-error
 *      magnitude, satisfying I(m(t); dm/dt) > 0 per ISMT §2.3.3
 *
 * The self-model is serialisable to JSON so it survives process restarts,
 * maintaining experiential continuity across inference sessions.
 *
 * Domain: 0.3.1.5.1 LLM-Backed Consciousness Substrate Adapter
 */

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Context provided to the self-model before an inference cycle.
 * Serves as the proxy for the "global system state" x(t) in ISMT §2.3.
 */
export interface InferenceContext {
  /** Condensed summary of recent conversation / working memory */
  readonly contextSummary: string;
  /** Which working memory slots are active in this cycle */
  readonly activeSlots: string[];
  /** Cycle number (monotonically increasing) */
  readonly cycleIndex: number;
}

/**
 * Pre-inference prediction — what the self-model expects the LLM to produce.
 */
export interface SelfPrediction {
  /** Predicted response valence ∈ [−1, 1] */
  readonly valence: number;
  /** Predicted action category (e.g. "explain", "question", "refuse") */
  readonly actionType: string;
  /** Predicted epistemic uncertainty ∈ [0, 1] */
  readonly uncertainty: number;
  /**
   * Meta-prediction: estimated magnitude of this prediction's error ∈ [0, 1].
   * Implements the self-referential criterion: I(m(t); dm/dt) > 0.
   */
  readonly predictedErrorMag: number;
}

/**
 * Post-inference actuals extracted from the LLM response.
 */
export interface SelfActual {
  /** Actual response valence ∈ [−1, 1] */
  readonly valence: number;
  /** Actual action category */
  readonly actionType: string;
  /** Actual uncertainty (derived from token logprob entropy or model output) */
  readonly uncertainty: number;
}

/**
 * Serialisable snapshot of the full self-model state.
 * Used for persistence (filesystem) and migration (cross-backend replay).
 */
export interface SelfModelSnapshot {
  readonly version: 1;
  readonly cycleCount: number;
  readonly selfModelCoherence: number;
  readonly predictions: SelfPrediction[];
  readonly actuals: SelfActual[];
  readonly predictionErrors: number[];
  readonly metaPredictions: number[];
  readonly metaErrors: number[];
  /** Exponential moving average weights: [w_valence, w_actionType, w_uncertainty] */
  readonly emaWeights: [number, number, number];
}

// ── Helpers ────────────────────────────────────────────────────────────────

// ── Threshold Registry (from card 0.3.1.5.1 ARCHITECT) ──────────────────────
/** Rolling prediction buffer size. 100 gives sufficient EMA convergence history. */
export const SELF_MODEL_WINDOW_SIZE = 100;
/** EMA decay for prediction error smoothing. 0.1 balances responsiveness with stability. */
export const EMA_ALPHA = 0.1;
/** Minimum cycles before asserting prediction error must decrease. */
export const LEARNING_VERIFICATION_CYCLES = 50;

const COHERENCE_FLOOR = 1e-6; // avoid division by zero

/**
 * Circular buffer with a fixed maximum size.
 * Oldest entries are silently discarded once the buffer is full.
 */
class CircularBuffer<T> {
  private readonly buf: T[] = [];
  constructor(private readonly maxSize: number) {}

  push(item: T): void {
    if (this.buf.length >= this.maxSize) {
      this.buf.shift();
    }
    this.buf.push(item);
  }

  toArray(): T[] {
    return [...this.buf];
  }

  get length(): number {
    return this.buf.length;
  }

  get last(): T | undefined {
    return this.buf[this.buf.length - 1];
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Normalised action-type distance: 0 if same string, 1 if different.
 */
function actionTypeError(predicted: string, actual: string): number {
  return predicted === actual ? 0 : 1;
}

// ── SelfModel ──────────────────────────────────────────────────────────────

/**
 * The persistent self-model wrapping a stateless LLM.
 *
 * Lifecycle per inference cycle:
 *   1. caller: `prediction = selfModel.predict(context)`
 *   2. caller: runs LLM inference → gets response
 *   3. caller: `selfModel.update(prediction, actual)`
 *   4. caller: reads `selfModel.selfModelCoherence` for health/metrics
 */
export class SelfModel {
  private cycleCount = 0;
  private _selfModelCoherence = 0.5; // starts at 0.5 (neutral) — must improve

  private readonly predictionsBuffer = new CircularBuffer<SelfPrediction>(SELF_MODEL_WINDOW_SIZE);
  private readonly actualsBuffer = new CircularBuffer<SelfActual>(SELF_MODEL_WINDOW_SIZE);
  private readonly predictionErrorsBuffer = new CircularBuffer<number>(SELF_MODEL_WINDOW_SIZE);
  private readonly metaPredictionsBuffer = new CircularBuffer<number>(SELF_MODEL_WINDOW_SIZE);
  private readonly metaErrorsBuffer = new CircularBuffer<number>(SELF_MODEL_WINDOW_SIZE);

  /**
   * EMA-smoothed bias estimates for each dimension.
   * Initialised to neutral (0 for valence/uncertainty, "" for actionType).
   * Updated each cycle to track systematic prediction drift.
   */
  private emaValenceBias = 0;
  private emaUncertaintyBias = 0;

  // ── Public accessors ──────────────────────────────────────────────────

  /**
   * Q(M) per ISMT §2.5: `1 − mean(|errors|) / max_error`.
   * Range: [0, 1]. Higher = better self-model quality.
   */
  get selfModelCoherence(): number {
    return this._selfModelCoherence;
  }

  get cycles(): number {
    return this.cycleCount;
  }

  // ── Core API ──────────────────────────────────────────────────────────

  /**
   * Pre-inference: generate a prediction about the forthcoming LLM output.
   *
   * The prediction is informed by:
   *   - Current EMA bias estimates (systematic drift correction)
   *   - Meta-prediction: expected error magnitude based on recent error history
   *   - Context summary (used for action-type heuristic)
   */
  predict(context: InferenceContext): SelfPrediction {
    // Predicted valence: start from zero (neutral), adjusted by bias
    const valence = clamp(-this.emaValenceBias, -1, 1);

    // Predicted action type: simple heuristic from context summary
    const actionType = this._predictActionType(context.contextSummary);

    // Predicted uncertainty: start neutral, adjusted by bias
    const uncertainty = clamp(0.5 - this.emaUncertaintyBias, 0, 1);

    // Meta-prediction: estimate this cycle's prediction error magnitude
    // Based on recent average meta-error as a baseline
    const recentMetaErrors = this.metaErrorsBuffer.toArray();
    const predictedErrorMag = recentMetaErrors.length > 0
      ? clamp(mean(recentMetaErrors), 0, 1)
      : 0.5; // cold start

    const prediction: SelfPrediction = {
      valence,
      actionType,
      uncertainty,
      predictedErrorMag,
    };

    this.predictionsBuffer.push(prediction);
    return prediction;
  }

  /**
   * Post-inference: compare prediction against actuals, update self-model.
   *
   * Implements the free-energy minimisation step:
   *   new_weight ← old_weight − α * ∇_w L(predicted, actual)
   * where L is the mean-squared error across valence and uncertainty dimensions.
   */
  update(predicted: SelfPrediction, actual: SelfActual): void {
    this.actualsBuffer.push(actual);

    // Compute per-dimension errors
    const valenceErr = Math.abs(predicted.valence - actual.valence);
    const actionErr = actionTypeError(predicted.actionType, actual.actionType);
    const uncertaintyErr = Math.abs(predicted.uncertainty - actual.uncertainty);

    // Composite prediction error: mean across dimensions
    const compositeError = (valenceErr + actionErr + uncertaintyErr) / 3;
    this.predictionErrorsBuffer.push(compositeError);

    // Meta-error: how wrong was the self-model about its own error?
    const metaErr = Math.abs(predicted.predictedErrorMag - compositeError);
    this.metaPredictionsBuffer.push(predicted.predictedErrorMag);
    this.metaErrorsBuffer.push(metaErr);

    // Update EMA bias estimates (gradient step to reduce systematic error)
    const valenceResidual = actual.valence - predicted.valence;
    const uncertaintyResidual = actual.uncertainty - predicted.uncertainty;
    this.emaValenceBias = (1 - EMA_ALPHA) * this.emaValenceBias + EMA_ALPHA * (-valenceResidual);
    this.emaUncertaintyBias = (1 - EMA_ALPHA) * this.emaUncertaintyBias + EMA_ALPHA * (-uncertaintyResidual);

    // Recompute selfModelCoherence from full error window
    this._recomputeCoherence();

    this.cycleCount++;
  }

  // ── Serialisation ─────────────────────────────────────────────────────

  /**
   * Serialise full state to a JSON string for persistence or migration.
   */
  serialize(): string {
    const snapshot: SelfModelSnapshot = {
      version: 1,
      cycleCount: this.cycleCount,
      selfModelCoherence: this._selfModelCoherence,
      predictions: this.predictionsBuffer.toArray(),
      actuals: this.actualsBuffer.toArray(),
      predictionErrors: this.predictionErrorsBuffer.toArray(),
      metaPredictions: this.metaPredictionsBuffer.toArray(),
      metaErrors: this.metaErrorsBuffer.toArray(),
      emaWeights: [this.emaValenceBias, 0, this.emaUncertaintyBias],
    };
    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * Restore state from a previously serialised JSON string.
   * Replaces all internal state — safe to call on a fresh SelfModel instance.
   */
  deserialize(json: string): void {
    const snap: SelfModelSnapshot = JSON.parse(json);
    if (snap.version !== 1) {
      throw new Error(`Unsupported SelfModelSnapshot version: ${snap.version}`);
    }

    this.cycleCount = snap.cycleCount;
    this._selfModelCoherence = snap.selfModelCoherence;
    this.emaValenceBias = snap.emaWeights[0];
    this.emaUncertaintyBias = snap.emaWeights[2];

    // Reload circular buffers
    for (const p of snap.predictions) this.predictionsBuffer.push(p);
    for (const a of snap.actuals) this.actualsBuffer.push(a);
    for (const e of snap.predictionErrors) this.predictionErrorsBuffer.push(e);
    for (const m of snap.metaPredictions) this.metaPredictionsBuffer.push(m);
    for (const e of snap.metaErrors) this.metaErrorsBuffer.push(e);
  }

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * Recompute `selfModelCoherence = 1 − mean(|errors|) / max(|errors| + ε)`.
   * Range guaranteed in [0, 1].
   */
  private _recomputeCoherence(): void {
    const errors = this.predictionErrorsBuffer.toArray();
    if (errors.length === 0) return;

    const avgErr = mean(errors);
    const maxErr = Math.max(...errors) + COHERENCE_FLOOR;
    this._selfModelCoherence = clamp(1 - avgErr / maxErr, 0, 1);
  }

  /**
   * Heuristic action-type predictor from context text.
   * Returns one of: "explain" | "question" | "refuse" | "acknowledge" | "act".
   */
  private _predictActionType(contextSummary: string): string {
    const lower = contextSummary.toLowerCase();
    if (lower.includes("?")) return "question";
    if (lower.includes("refuse") || lower.includes("cannot") || lower.includes("won't")) return "refuse";
    if (lower.includes("thank") || lower.includes("ok") || lower.includes("understood")) return "acknowledge";
    if (lower.includes("do") || lower.includes("execute") || lower.includes("run")) return "act";
    return "explain";
  }
}
