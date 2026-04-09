/**
 * IModelSelector — priority-ordered model circuit breaker.
 *
 * Maintains a priority-ordered list of inference providers and tracks
 * per-model rate-limit state. When a model returns a 429, it is backed off
 * exponentially (same constants as task-level backoff). The selector
 * automatically promotes the next available model by priority. When a
 * higher-priority model's backoff expires it is restored automatically — no
 * timers or polling, just lazy evaluation on the next `selectProvider` call.
 *
 * This is the classic "priority circuit breaker" pattern used in resilience
 * libraries (Polly, Hystrix, Resilience4j). The state lives here so that
 * scheduler and provider layers stay clean and separate.
 *
 * Domain: Plan Guardian
 */

import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';

const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface SelectedProvider {
  modelId: string;
  provider: IInferenceProvider;
}

/**
 * Priority-ordered model selector with per-model circuit-breaker state.
 */
export interface IModelSelector {
  /**
   * Returns the highest-priority model whose backoff has expired (or was never
   * triggered). Returns `null` when every model is currently rate-limited.
   */
  selectProvider(nowMs: number): SelectedProvider | null;

  /** Record a rate-limit hit for a model. Applies exponential backoff. */
  recordRateLimit(modelId: string, hintMs: number, nowMs: number): void;

  /**
   * Returns the earliest `nowMs` at which any blocked model becomes available.
   * Returns `nowMs` if at least one model is already available.
   */
  nextAvailableAtMs(nowMs: number): number;

  /** All model IDs in descending priority order (index 0 = most preferred). */
  readonly modelIds: readonly string[];
}

interface ModelCircuitState {
  lastDelayMs: number;
  resumeAtMs: number;
}

export class PriorityModelSelector implements IModelSelector {
  private readonly circuit = new Map<string, ModelCircuitState>();

  /**
   * @param models  Ordered most-preferred first. At least one entry required.
   * @param initialBackoffMs  First backoff delay when a model hasn't been seen before.
   */
  constructor(
    private readonly models: ReadonlyArray<SelectedProvider>,
    private readonly initialBackoffMs: number = INITIAL_BACKOFF_MS,
  ) {
    if (models.length === 0) {
      throw new Error('PriorityModelSelector requires at least one model');
    }
  }

  get modelIds(): readonly string[] {
    return this.models.map(m => m.modelId);
  }

  selectProvider(nowMs: number): SelectedProvider | null {
    for (const model of this.models) {
      const state = this.circuit.get(model.modelId);
      if (!state || state.resumeAtMs <= nowMs) {
        return model;
      }
    }
    return null; // all models currently backed off
  }

  recordRateLimit(modelId: string, hintMs: number, nowMs: number): void {
    const previous = this.circuit.get(modelId);
    const baseDelayMs = previous
      ? Math.min(previous.lastDelayMs * 2, MAX_BACKOFF_MS)
      : this.initialBackoffMs;
    const delayMs = Math.min(Math.max(baseDelayMs, hintMs), MAX_BACKOFF_MS);
    this.circuit.set(modelId, { lastDelayMs: delayMs, resumeAtMs: nowMs + delayMs });
  }

  nextAvailableAtMs(nowMs: number): number {
    let earliest = Infinity;
    for (const model of this.models) {
      const state = this.circuit.get(model.modelId);
      if (!state || state.resumeAtMs <= nowMs) {
        return nowMs; // at least one is ready right now
      }
      earliest = Math.min(earliest, state.resumeAtMs);
    }
    return earliest;
  }
}

/**
 * Priority list of OpenRouter free-tier models, most preferred first.
 * Used when `--provider openrouter` is selected.
 *
 * Add new model IDs here to include them in the fallback chain.
 * The first entry in the list that is not currently backed off is used.
 */
export const DEFAULT_OPENROUTER_MODEL_PRIORITY: readonly string[] = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3-coder:free',
  'gpt-oss-120b:free',
];
