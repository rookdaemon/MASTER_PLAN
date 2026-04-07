import { describe, it, expect } from 'vitest';
import { buildProvider } from '../provider-factory.js';

describe('buildProvider', () => {
  it('builds local provider', () => {
    const provider = buildProvider('local', 'gemma4:e4b');
    expect(provider).toBeDefined();
    expect(typeof provider.infer).toBe('function');
  });

  it('builds openrouter provider when key is present', () => {
    const prev = process.env['OPENROUTER_API_KEY'];
    process.env['OPENROUTER_API_KEY'] = 'test-key';
    try {
      const provider = buildProvider('openrouter', 'google/gemma-3-27b-it');
      expect(provider).toBeDefined();
      expect(typeof provider.infer).toBe('function');
    } finally {
      if (prev === undefined) {
        delete process.env['OPENROUTER_API_KEY'];
      } else {
        process.env['OPENROUTER_API_KEY'] = prev;
      }
    }
  });

  it('throws for openrouter without api key', () => {
    const prevOpenRouter = process.env['OPENROUTER_API_KEY'];
    const prevLlm = process.env['LLM_API_KEY'];
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['LLM_API_KEY'];

    try {
      expect(() => buildProvider('openrouter', 'google/gemma-3-27b-it')).toThrow(
        /OPENROUTER_API_KEY/,
      );
    } finally {
      if (prevOpenRouter === undefined) {
        delete process.env['OPENROUTER_API_KEY'];
      } else {
        process.env['OPENROUTER_API_KEY'] = prevOpenRouter;
      }
      if (prevLlm === undefined) {
        delete process.env['LLM_API_KEY'];
      } else {
        process.env['LLM_API_KEY'] = prevLlm;
      }
    }
  });
});
