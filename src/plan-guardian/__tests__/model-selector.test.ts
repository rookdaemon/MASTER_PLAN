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

function makeSelector(ids: string[]) {
  return new PriorityModelSelector(ids.map(id => ({ modelId: id, provider: fakeProvider(id) })));
}

describe('PriorityModelSelector', () => {
  it('returns the highest-priority model when none are blocked', () => {
    const sel = makeSelector(['a', 'b', 'c']);
    const result = sel.selectProvider(NOW);
    expect(result?.modelId).toBe('a');
  });

  it('falls through to second model when first is rate-limited', () => {
    const sel = makeSelector(['a', 'b', 'c']);
    sel.recordRateLimit('a', 0, NOW);
    expect(sel.selectProvider(NOW)?.modelId).toBe('b');
  });

  it('falls through to third model when first two are rate-limited', () => {
    const sel = makeSelector(['a', 'b', 'c']);
    sel.recordRateLimit('a', 0, NOW);
    sel.recordRateLimit('b', 0, NOW);
    expect(sel.selectProvider(NOW)?.modelId).toBe('c');
  });

  it('returns null when all models are rate-limited', () => {
    const sel = makeSelector(['a', 'b']);
    sel.recordRateLimit('a', 0, NOW);
    sel.recordRateLimit('b', 0, NOW);
    expect(sel.selectProvider(NOW)).toBeNull();
  });

  it('restores a model once its backoff expires', () => {
    const sel = makeSelector(['a', 'b']);
    sel.recordRateLimit('a', 0, NOW); // default 5s backoff
    expect(sel.selectProvider(NOW)?.modelId).toBe('b');
    // advance past the backoff
    expect(sel.selectProvider(NOW + 10_000)?.modelId).toBe('a');
  });

  it('respects hintMs over the default initial backoff', () => {
    const sel = makeSelector(['a', 'b']);
    sel.recordRateLimit('a', 60_000, NOW); // 60s hint
    expect(sel.selectProvider(NOW + 5_000)?.modelId).toBe('b'); // default 5s not enough
    expect(sel.selectProvider(NOW + 60_000)?.modelId).toBe('a'); // 60s clears it
  });

  it('applies exponential backoff on repeated rate-limits', () => {
    const sel = makeSelector(['a']); // single model so nextAvailableAtMs reflects 'a'
    sel.recordRateLimit('a', 0, NOW);
    const after1 = sel.nextAvailableAtMs(NOW); // NOW + 5_000
    sel.recordRateLimit('a', 0, NOW);
    const after2 = sel.nextAvailableAtMs(NOW); // NOW + 10_000
    expect(after2).toBeGreaterThan(after1);
  });

  it('caps backoff at 2 hours', () => {
    const sel = makeSelector(['a']);
    // Simulate many repeated rate-limits to hit the cap
    for (let i = 0; i < 40; i++) {
      sel.recordRateLimit('a', 0, NOW);
    }
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    expect(sel.nextAvailableAtMs(NOW)).toBeLessThanOrEqual(NOW + TWO_HOURS_MS);
  });

  it('nextAvailableAtMs returns nowMs when a model is ready', () => {
    const sel = makeSelector(['a', 'b']);
    sel.recordRateLimit('a', 0, NOW);
    expect(sel.nextAvailableAtMs(NOW)).toBe(NOW); // 'b' is ready
  });

  it('nextAvailableAtMs returns earliest resume when all blocked', () => {
    const sel = makeSelector(['a', 'b']);
    sel.recordRateLimit('a', 10_000, NOW);
    sel.recordRateLimit('b', 30_000, NOW);
    expect(sel.nextAvailableAtMs(NOW)).toBe(NOW + 10_000);
  });

  it('exposes modelIds in priority order', () => {
    const sel = makeSelector(['x', 'y', 'z']);
    expect(sel.modelIds).toEqual(['x', 'y', 'z']);
  });

  it('throws on empty model list', () => {
    expect(() => new PriorityModelSelector([])).toThrow();
  });
});

describe('parseCli --model', () => {
  // Importing here avoids circular deps in the test file
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
