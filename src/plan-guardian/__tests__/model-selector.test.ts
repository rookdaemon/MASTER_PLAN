import { describe, it, expect } from 'vitest';
import { PriorityModelSelector } from '../model-selector.js';
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
    expect(outcome).toEqual({ kind: 'ok', value: 'a', modelId: 'a' });
  });

  it('falls through to second model when first is rate-limited', async () => {
    // First model: always 429; second model: ok
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: rateLimitedProvider('a') },
      { modelId: 'b', provider: fakeProvider('b') },
    ]);
    // First execute: hits 'a', gets 429 → records backoff, returns rate-limited
    const first = await runId(sel);
    expect(first.kind).toBe('rate-limited');
    // Second execute (same nowMs, 'a' still blocked): uses 'b'
    const second = await runId(sel);
    expect(second).toEqual({ kind: 'ok', value: 'b', modelId: 'b' });
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
    expect(first.kind).toBe('rate-limited'); // 'a' backed off ~5s
    const atNow = await runId(sel);
    expect(atNow).toEqual({ kind: 'ok', value: 'b', modelId: 'b' }); // 'a' still blocked
    // After backoff expires, 'a' is tried first and succeeds
    const after = await runId(sel, NOW + 10_000);
    expect(after).toEqual({ kind: 'ok', value: 'a', modelId: 'a' });
  });

  it('respects Retry-After hint', async () => {
    const sel = new PriorityModelSelector([
      { modelId: 'a', provider: retryAfterProvider('a', 60) },
      { modelId: 'b', provider: fakeProvider('b') },
    ]);
    const first = await runId(sel);
    expect(first.kind).toBe('rate-limited'); // 'a' backed off 60s
    // At NOW + 5s: 'a' still blocked (5s < 60s)
    const at5s = await runId(sel, NOW + 5_000);
    expect(at5s).toEqual({ kind: 'ok', value: 'b', modelId: 'b' });
    // At NOW + 60s: 'a' recovered and succeeds
    const at60s = await runId(sel, NOW + 60_000);
    expect(at60s).toEqual({ kind: 'ok', value: 'a', modelId: 'a' });
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
