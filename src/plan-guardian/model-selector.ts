/**
 * IModelSelector — priority-ordered model circuit breaker.
 *
 * The public API is a single `execute<T>` method (Polly-style):
 *
 *   const outcome = await selector.execute(nowMs, provider =>
 *     callProvider(provider, systemPrompt, messages),
 *   );
 *
 * The selector picks the highest-priority non-blocked provider, calls `fn`,
 * and returns `{ kind: 'ok', value, modelId }` on success. If the provider
 * throws a 429-style error the model is backed off exponentially and
 * `{ kind: 'rate-limited', resumeAtMs, reason }` is returned immediately.
 * Non-rate-limit errors are re-thrown unchanged.
 *
 * `selectProvider` and `recordRateLimit` are private — callers have no way
 * to misuse the circuit state.
 *
 * Domain: Plan Guardian
 */

import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';

// ── Constants ────────────────────────────────────────────────

export const INITIAL_BACKOFF_MS = 5_000;
export const MAX_BACKOFF_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Rate-limit error helpers ─────────────────────────────────

export function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('429')
    || normalized.includes(' 524')
    || normalized.includes('code":524')
    || normalized.includes('provider returned error')
    || normalized.includes('gateway timeout')
    || normalized.includes('cloudflare')
    || normalized.includes('too many requests')
    || normalized.includes('rate limit')
    || normalized.includes('temporarily unavailable')
    || normalized.includes('upstream timed out');
}

export function parseRateLimitBackoffHintMs(err: unknown, nowMs: number): number {
  const message = err instanceof Error ? err.message : String(err ?? '');

  // Prefer explicit reset headers when present.
  const resetPatterns = [
    /x-ratelimit-reset(?:-[a-z]+)?"?\s*[:=]\s*"?([^\n\r",}]+)/i,
    /x-ratelimit-reset-(?:requests|tokens|day|minute)"?\s*[:=]\s*"?([^\n\r",}]+)/i,
  ];
  for (const pattern of resetPatterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const hintedMs = parseHeaderTimeValueToDelayMs(match[1]?.trim() ?? '', nowMs);
    if (hintedMs > 0) return clampBackoffMs(hintedMs);
  }

  // Fallback: parse Retry-After as either seconds or HTTP-date.
  const retryAfterMatch = message.match(/retry-after\s*:\s*([^\n\r]+)/i);
  if (!retryAfterMatch) return 0;
  const hintedMs = parseHeaderTimeValueToDelayMs(retryAfterMatch[1]?.trim() ?? '', nowMs);
  if (hintedMs <= 0) return 0;
  return clampBackoffMs(hintedMs);
}

function parseHeaderTimeValueToDelayMs(raw: string, nowMs: number): number {
  if (!raw) return 0;

  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    // 13+ digits => epoch milliseconds
    if (numeric >= 1_000_000_000_000) {
      return Math.round(numeric - nowMs);
    }
    // 10+ digits => epoch seconds
    if (numeric >= 1_000_000_000) {
      return Math.round((numeric * 1000) - nowMs);
    }
    // Smaller positive numbers are treated as a delay in seconds.
    return Math.round(numeric * 1000);
  }

  const parsedDateMs = Date.parse(raw);
  if (!Number.isNaN(parsedDateMs)) {
    return Math.round(parsedDateMs - nowMs);
  }

  return 0;
}

export function extractRateLimitReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const reasonMatch = message.match(/rate limit exceeded\s*:\s*([^\.\n\"]+)/i);
  if (reasonMatch && reasonMatch[1].trim().length > 0) {
    return reasonMatch[1].trim();
  }
  if (/\b524\b/.test(message) || /provider returned error/i.test(message) || /gateway timeout|upstream timed out/i.test(message)) {
    return 'provider-timeout';
  }
  const bucketMatch = message.match(/free-models-per-min|requests-per-minute|requests-per-day/i);
  if (bucketMatch) return bucketMatch[0];
  return 'rate-limit';
}

export function clampBackoffMs(value: number): number {
  return Math.max(INITIAL_BACKOFF_MS, Math.min(value, MAX_BACKOFF_MS));
}

// ── Public types ─────────────────────────────────────────────

export interface SelectedProvider {
  modelId: string;
  provider: IInferenceProvider;
}

export type SelectorOutcome<T> =
  | { kind: 'ok'; value: T; modelId: string; attemptedModels?: readonly string[] }
  | { kind: 'rate-limited'; resumeAtMs: number; reason: string; attemptedModels?: readonly string[] };

/**
 * Priority-ordered model circuit breaker.
 *
 * The only public surface callers need:
 * - `execute<T>(nowMs, fn)` — run work against the best available provider
 * - `nextAvailableAtMs(nowMs)` — earliest time any provider will be unblocked
 * - `modelIds` — ordered list for logging
 */
export interface IModelSelector {
  execute<T>(
    nowMs: number,
    fn: (provider: IInferenceProvider) => Promise<T>,
  ): Promise<SelectorOutcome<T>>;

  /**
   * Earliest timestamp at which at least one provider will be available.
   * Returns `nowMs` if a provider is available right now.
   */
  nextAvailableAtMs(nowMs: number): number;

  /** Model IDs in descending priority order (index 0 = most preferred). */
  readonly modelIds: readonly string[];
}

// ── Implementation ───────────────────────────────────────────

interface ModelCircuitState {
  lastDelayMs: number;
  resumeAtMs: number;
}

export class PriorityModelSelector implements IModelSelector {
  private readonly circuit = new Map<string, ModelCircuitState>();

  /**
   * @param models  Ordered most-preferred first. At least one entry required.
   * @param initialBackoffMs  First backoff delay when a model has never been seen.
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

  async execute<T>(
    nowMs: number,
    fn: (provider: IInferenceProvider) => Promise<T>,
  ): Promise<SelectorOutcome<T>> {
    // Try models in priority order. Only return rate-limited if all are either
    // already blocked or fail with rate-limit errors.
    const attemptedModels: string[] = [];
    let primaryReason = ''; // Preserve the first detailed reason

    for (const model of this.models) {
      const state = this.circuit.get(model.modelId);
      // Skip already-blocked models for now; we'll handle all-blocked case below
      if (state && state.resumeAtMs > nowMs) {
        continue;
      }
      
      attemptedModels.push(model.modelId);
      
      try {
        const value = await fn(model.provider);
        return { kind: 'ok', value, modelId: model.modelId, attemptedModels };
      } catch (err) {
        if (isRateLimitError(err)) {
          const hintMs = parseRateLimitBackoffHintMs(err, nowMs);
          this.recordRateLimit(model.modelId, hintMs, nowMs);
          const reason = extractRateLimitReason(err);
          // Preserve the first detailed reason; don't overwrite with generic fallbacks
          if (!primaryReason || reason !== 'rate-limit') {
            primaryReason = reason;
          }
          // Continue to next model instead of returning immediately
          continue;
        }
        // Non-rate-limit errors are re-thrown; caller handles them
        throw err;
      }
    }

    // If we get here, either all models are blocked or all available models failed with rate-limit.
    // Return the rate-limit outcome with the detailed reason from the first error.
    return {
      kind: 'rate-limited',
      resumeAtMs: this.nextAvailableAtMs(nowMs),
      reason: primaryReason || 'all-models-rate-limited',
      attemptedModels,
    };
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

  private selectProvider(nowMs: number): SelectedProvider | null {
    for (const model of this.models) {
      const state = this.circuit.get(model.modelId);
      if (!state || state.resumeAtMs <= nowMs) {
        return model;
      }
    }
    return null;
  }

  private recordRateLimit(modelId: string, hintMs: number, nowMs: number): void {
    const previous = this.circuit.get(modelId);
    const baseDelayMs = previous
      ? Math.min(previous.lastDelayMs * 2, MAX_BACKOFF_MS)
      : this.initialBackoffMs;
    const delayMs = Math.min(Math.max(baseDelayMs, hintMs), MAX_BACKOFF_MS);
    this.circuit.set(modelId, { lastDelayMs: delayMs, resumeAtMs: nowMs + delayMs });
  }
}

// ── Defaults ─────────────────────────────────────────────────

/**
 * Priority list of OpenRouter free-tier models, most preferred first.
 * Add new model IDs here to include them in the fallback chain.
 */
export const DEFAULT_OPENROUTER_MODEL_PRIORITY: readonly string[] = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3-coder:free',
  'gpt-oss-120b:free',
];
