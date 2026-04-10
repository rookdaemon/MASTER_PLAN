import { describe, it, expect } from 'vitest';
import { PriorityModelSelector, parseRateLimitBackoffHintMs } from '../model-selector.js';
import type { IInferenceProvider, InferenceResult } from '../../llm-substrate/inference-provider.js';

const NOW = Date.parse('2026-04-09T12:00:00.000Z');

function fakeProvider(id: string): IInferenceProvider {
  return {
    async probe() { return { reachable: true, latencyMs: 1 }; },
    async infer(): Promise<InferenceResult> {
      return { text: id, toolCalls: [], promptTokens: 0, completionTokens: 0, latencyMs: 0 };
    },
  };
}

function rateLimitedProvider(id: string): IInferenceProvider {
  return {
    async probe() { return { reachable: true, latencyMs: 1 }; },
    async infer(): Promise<InferenceResult> {
      throw new Error(`429 Too Many Requests (${id})`);
    },
  };
}

function makeSelector(ids: string[], providerFn = fakeProvider) {
  return new PriorityModelSelector(ids.map(id => ({ modelId: id, provider: providerFn(id) })));
}

/** Provider that throws 429 for the first `failCount` calls, then succeeds. */
function failThenSucceedProvider(id: string, failCount = 1): IInferenceProvider {
  let calls = 0;
  return {
    async probe() { return { reachable: true, latencyMs: 1 }; },
    async infer(): Promise<InferenceResult> {
      if (calls++ < failCount) throw new Error(`429 Too Many Requests (${id})`);
      return { text: id, toolCalls: [], promptTokens: 0, completionTokens: 0, latencyMs: 0 };
    },
  };
}

/** Provider that throws 429 for the first call with a Retry-After header, then succeeds. */
function retryAfterProvider(id: string, retryAfterSecs: number): IInferenceProvider {
  let calls = 0;
  return {
    async probe() { return { reachable: true, latencyMs: 1 }; },
    async infer(): Promise<InferenceResult> {
      if (calls++ === 0) throw new Error(`429 Too Many Requests\nRetry-After: ${retryAfterSecs}`);
      return { text: id, toolCalls: [], promptTokens: 0, completionTokens: 0, latencyMs: 0 };
    },
  };
}

/** Helper: run execute with a trivial fn that returns the provider identity. */
async function runId(sel: PriorityModelSelector, nowMs = NOW) {
  return sel.execute(nowMs, async provider => {
    const r = await provider.infer('', [], [], 1);
    return r.text ?? '?';
  });
}

describe('PriorityModelSelector', () => {
  it('uses the highest-priority model when none are blocked', async () => {
    const sel = makeSelector(['a', 'b', 'c']);
    const outcome = await runId(sel);
    expect(outcome).toMatchObject({ kind: 'ok', value: 'a', modelId: 'a' });
  });

  it('tries next model when first fails with 429 in the same execute call', async () => {
    // Within one execute call: model 0 fails with 429, model 1 succeeds
    // This is the key retry behavior that makes the circuit breaker resilient
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
      { modelId: 'b', provider: fakeProvider('b') },
      { modelId: 'c', provider: fakeProvider('c') },
    ]);
    const outcome = await runId(sel);
    // Should skip 'a' (failed with 429), try 'b' and succeed
    expect(outcome).toMatchObject({ kind: 'ok', value: 'b', modelId: 'b' });
    expect(outcome.attemptedModels).toContain('a');
    expect(outcome.attemptedModels).toContain('b');
    // Verify 'a' was recorded as blocked for the next call
    const nextCall = await runId(sel, NOW);
    expect(nextCall).toMatchObject({ kind: 'ok', value: 'b', modelId: 'b' });
  });

  it('falls through to second model when first is rate-limited', async () => {
    // Model 'a' always fails with 429; model 'b' always succeeds
    // In a single execute call, 'a' fails, we try 'b' and succeed
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
      { modelId: 'b', provider: fakeProvider('b') },
    ]);
    const outcome = await runId(sel);
    // With the new retry logic: tries 'a' (fails), tries 'b' (succeeds)
    expect(outcome).toMatchObject({ kind: 'ok', value: 'b', modelId: 'b' });
    expect(outcome.attemptedModels).toEqual(['a', 'b']);
  });

  it('tries all models and returns rate-limited if all fail with 429', async () => {
    // All three models fail with rate-limit
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
      { modelId: 'b', provider: rateLimitedProvider('b') },
      { modelId: 'c', provider: rateLimitedProvider('c') },
    ]);
    const outcome = await runId(sel);
    expect(outcome.kind).toBe('rate-limited');
    expect((outcome as any).reason).toBe('rate-limit'); // extracted from error message
    // All three should be recorded as blocked
    const nextAvail = sel.nextAvailableAtMs(NOW);
    expect(nextAvail).toBeGreaterThan(NOW);
  });

  it('returns rate-limited when all models are blocked', async () => {
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
    ]);
    await runId(sel); // records 'a' as blocked
    const outcome = await runId(sel); // all blocked
    expect(outcome.kind).toBe('rate-limited');
    expect((outcome as { kind: 'rate-limited'; resumeAtMs: number }).resumeAtMs).toBeGreaterThan(NOW);
  });

  it('restores a model once its backoff expires', async () => {
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: failThenSucceedProvider('a', 1) },
      { modelId: 'b', provider: fakeProvider('b') },
    ]);
    const first = await runId(sel);
    // 'a' fails with 429 once, then we try 'b' and succeed
    expect(first).toMatchObject({ kind: 'ok', value: 'b', modelId: 'b' });
    const atNow = await runId(sel);
    // 'a' still blocked at NOW, so we use 'b'
    expect(atNow).toMatchObject({ kind: 'ok', value: 'b', modelId: 'b' });
    // After backoff expires, 'a' is tried first and succeeds
    const after = await runId(sel, NOW + 10_000);
    expect(after).toMatchObject({ kind: 'ok', value: 'a', modelId: 'a' });
  });

  it('respects Retry-After hint', async () => {
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: retryAfterProvider('a', 60) },
      { modelId: 'b', provider: fakeProvider('b') },
    ]);
    const first = await runId(sel);
    // 'a' fails with Retry-After: 60, then we try 'b' and succeed
    expect(first).toMatchObject({ kind: 'ok', value: 'b', modelId: 'b' });
    // At NOW + 5s: 'a' still blocked (5s < 60s)
    const at5s = await runId(sel, NOW + 5_000);
    expect(at5s).toMatchObject({ kind: 'ok', value: 'b', modelId: 'b' });
    // At NOW + 60s: 'a' recovered and succeeds
    const at60s = await runId(sel, NOW + 60_000);
    expect(at60s).toMatchObject({ kind: 'ok', value: 'a', modelId: 'a' });
  });

  it('applies exponential backoff on repeated rate-limits', async () => {
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
    ]);
    await runId(sel); // first hit → 5s
    const after1 = sel.nextAvailableAtMs(NOW);
    await runId(sel); // all blocked, no new record (already blocked)
    // Force a second hit at after1 (when 'a' is available again)
    await runId(sel, after1); // second hit → 10s
    const after2 = sel.nextAvailableAtMs(after1);
    expect(after2 - after1).toBeGreaterThan(after1 - NOW);
  });

  it('caps backoff at 2 hours', async () => {
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    // Use a huge Retry-After to test the cap
    const sel = new PriorityModelSelector([
      {
        modelId: 'a',
        provider: {
          async probe() { return { reachable: true, latencyMs: 1 }; },
          async infer(): Promise<InferenceResult> {
            throw new Error('429 Too Many Requests\nRetry-After: 999999');
          },
        },
      },
    ]);
    await runId(sel);
    expect(sel.nextAvailableAtMs(NOW)).toBeLessThanOrEqual(NOW + TWO_HOURS_MS);
  });

  it('nextAvailableAtMs returns nowMs when a model is ready', async () => {
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
      { modelId: 'b', provider: fakeProvider('b') },
    ]);
    await runId(sel); // 'a' blocked, 'b' still free
    expect(sel.nextAvailableAtMs(NOW)).toBe(NOW);
  });

  it('nextAvailableAtMs returns earliest resume when all blocked', async () => {
    const sel = new PriorityModelSelector([
      {
        modelId: 'a',
        provider: {
          async probe() { return { reachable: true, latencyMs: 1 }; },
          async infer(): Promise<InferenceResult> {
            throw new Error('429 Too Many Requests\nRetry-After: 10');
          },
        },
      },
      {
        modelId: 'b',
        provider: {
          async probe() { return { reachable: true, latencyMs: 1 }; },
          async infer(): Promise<InferenceResult> {
            throw new Error('429 Too Many Requests\nRetry-After: 30');
          },
        },
      },
    ]);
    await runId(sel); // 'a' blocked 10s
    await runId(sel); // 'b' blocked 30s
    const resumeAtMs = sel.nextAvailableAtMs(NOW);
    expect(resumeAtMs).toBe(NOW + 10_000);
  });

  it('exposes modelIds in priority order', () => {
    const sel = makeSelector(['x', 'y', 'z']);
    expect(sel.modelIds).toEqual(['x', 'y', 'z']);
  });

  it('throws on empty model list', () => {
    expect(() => new PriorityModelSelector([])).toThrow();
  });

  it('non-rate-limit errors are re-thrown', async () => {
    const sel = new PriorityModelSelector([
      {
        modelId: 'a',
        provider: {
          async probe() { return { reachable: true, latencyMs: 1 }; },
          async infer(): Promise<InferenceResult> {
            throw new Error('Internal Server Error');
          },
        },
      },
    ]);
    await expect(runId(sel)).rejects.toThrow('Internal Server Error');
  });

  it('includes attempted models in the outcome', async () => {
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
      { modelId: 'b', provider: rateLimitedProvider('b') },
      { modelId: 'c', provider: fakeProvider('c') },
    ]);
    const outcome = await runId(sel);
    expect(outcome.attemptedModels).toEqual(['a', 'b', 'c']);
  });

  it('preserves first detailed reason instead of generic fallback', async () => {
    const detailedErrorProvider = (): IInferenceProvider => ({
      async probe() { return { reachable: true, latencyMs: 1 }; },
      async infer(): Promise<InferenceResult> {
        throw new Error('429 Too Many Requests\nRate limit exceeded: free-models-per-day-high-balance');
      },
    });
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: detailedErrorProvider() },
      { modelId: 'b', provider: rateLimitedProvider('b') }, // generic 429
    ]);
    const outcome = await runId(sel);
    expect(outcome.kind).toBe('rate-limited');
    // Should preserve the detailed reason from model 'a', not the generic one
    if (outcome.kind === 'rate-limited') {
      expect(outcome.reason).toBe('free-models-per-day-high-balance');
    }
  });

  it('parses Retry-After HTTP-date header hint', () => {
    const retryAt = new Date(NOW + 90_000).toUTCString();
    const err = new Error(`429 Too Many Requests\nRetry-After: ${retryAt}`);
    const hintedMs = parseRateLimitBackoffHintMs(err, NOW);
    expect(hintedMs).toBeGreaterThanOrEqual(89_000);
    expect(hintedMs).toBeLessThanOrEqual(91_000);
  });

  it('parses X-RateLimit-Reset-Requests epoch-seconds hint', () => {
    const resetEpochSec = Math.floor((NOW + 120_000) / 1000);
    const err = new Error(`429 Too Many Requests\nX-RateLimit-Reset-Requests: ${resetEpochSec}`);
    const hintedMs = parseRateLimitBackoffHintMs(err, NOW);
    expect(hintedMs).toBeGreaterThanOrEqual(119_000);
    expect(hintedMs).toBeLessThanOrEqual(121_000);
  });
});

describe('parseCli --model', () => {
  it('defaults to three-model priority list', async () => {
    const { parseCli } = await import('../cli.js');
    const opts = parseCli(['node', 'main.ts']);
    expect(opts.models).toEqual([
      'nvidia/nemotron-3-super-120b-a12b:free',
      'qwen/qwen3-coder:free',
      'gpt-oss-120b:free',
    ]);
  });

  it('single --model replaces defaults', async () => {
    const { parseCli } = await import('../cli.js');
    const opts = parseCli(['node', 'main.ts', '--model', 'my/model:free']);
    expect(opts.models).toEqual(['my/model:free']);
  });

  it('multiple --model flags build priority list in order', async () => {
    const { parseCli } = await import('../cli.js');
    const opts = parseCli(['node', 'main.ts', '--model', 'first', '--model', 'second', '--model', 'third']);
    expect(opts.models).toEqual(['first', 'second', 'third']);
  });
});
