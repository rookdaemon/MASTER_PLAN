/**
 * Variation Engine — Tests
 *
 * RED phase: tests for IVariationEngine implementation.
 * Covers mutation, synthesis, crossover, analogical transfer, and variation history.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VariationEngine } from '../variation-engine';
import { MemeCodec } from '../meme-codec';
import { ICulturalEnvironment } from '../environment';
import {
  Meme,
  MemeType,
  MutationPressure,
  MutationPressureType,
  ExperientialContext,
  VariationType,
} from '../types';

// ─── Mock Environment ─────────────────────────────────────────────────

function createMockEnvironment(): ICulturalEnvironment {
  let callCount = 0;
  return {
    nowTimestamp: () => `2026-01-01T00:00:0${callCount++}.000Z`,
    nowMillis: () => 1735689600000 + callCount++,
    random: () => 0.42,
  };
}

// ─── Test Helpers ────────────────────────────────────────────────────────

let mockEnv: ICulturalEnvironment;

function makeTestMeme(overrides: Partial<Meme> = {}): Meme {
  const codec = new MemeCodec(mockEnv);
  const base = codec.encode({
    type: MemeType.VALUE,
    description: 'Test value meme',
    semantic_content: 'cooperation is essential for survival',
    originator: 'agent-001',
  });
  return { ...base, ...overrides };
}

function makeNormMeme(content: string, agent: string = 'agent-002'): Meme {
  const codec = new MemeCodec(mockEnv);
  return codec.encode({
    type: MemeType.NORM,
    description: `Norm: ${content}`,
    semantic_content: content,
    originator: agent,
  });
}

function makeAestheticMeme(content: string, agent: string = 'agent-003'): Meme {
  const codec = new MemeCodec(mockEnv);
  return codec.encode({
    type: MemeType.AESTHETIC,
    description: `Aesthetic: ${content}`,
    semantic_content: content,
    originator: agent,
  });
}

function makeExperientialContext(overrides: Partial<ExperientialContext> = {}): ExperientialContext {
  return {
    agent_id: 'agent-001',
    community_id: 'community-alpha',
    environmental_conditions: ['stable environment'],
    recent_experiences: ['encountered novel pattern'],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('VariationEngine', () => {
  let engine: VariationEngine;

  beforeEach(() => {
    mockEnv = createMockEnvironment();
    engine = new VariationEngine(mockEnv);
  });

  // ─── Mutation ────────────────────────────────────────────────────────

  describe('mutate()', () => {
    it('should return a new meme with a different ID', () => {
      const original = makeTestMeme();
      const pressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 0.5,
        context: 'spontaneous drift',
        source_agent: null,
      };

      const mutated = engine.mutate(original, pressure);

      expect(mutated.id).not.toBe(original.id);
    });

    it('should set lineage to MUTATION with parent reference', () => {
      const original = makeTestMeme();
      const pressure: MutationPressure = {
        type: MutationPressureType.ADAPTIVE,
        magnitude: 0.3,
        context: 'resource scarcity adaptation',
        source_agent: 'agent-005',
      };

      const mutated = engine.mutate(original, pressure);

      expect(mutated.lineage.variation_type).toBe(VariationType.MUTATION);
      expect(mutated.lineage.parent_ids).toContain(original.id);
    });

    it('should increment mutation_depth by 1', () => {
      const original = makeTestMeme();
      const pressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 0.1,
        context: 'minor drift',
        source_agent: null,
      };

      const mutated = engine.mutate(original, pressure);

      expect(mutated.mutation_depth).toBe(original.mutation_depth + 1);
    });

    it('should produce greater content change at higher magnitude', () => {
      const original = makeTestMeme();
      const lowPressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 0.1,
        context: 'minimal drift',
        source_agent: null,
      };
      const highPressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 0.9,
        context: 'radical shift',
        source_agent: null,
      };

      const lowMut = engine.mutate(original, lowPressure);
      const highMut = engine.mutate(original, highPressure);

      const codec = new MemeCodec(mockEnv);
      const distLow = codec.distance(original, lowMut);
      const distHigh = codec.distance(original, highMut);

      expect(distHigh).toBeGreaterThan(distLow);
    });

    it('should preserve the meme type', () => {
      const original = makeNormMeme('share resources equally');
      const pressure: MutationPressure = {
        type: MutationPressureType.CREATIVE,
        magnitude: 0.5,
        context: 'artistic reinterpretation',
        source_agent: 'agent-004',
      };

      const mutated = engine.mutate(original, pressure);

      expect(mutated.type).toBe(MemeType.NORM);
    });

    it('should start with fresh fitness record', () => {
      const original = makeTestMeme();
      // Artificially inflate original fitness
      original.fitness.adoption_count = 100;
      original.fitness.current_prevalence = 0.8;

      const pressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 0.3,
        context: 'drift',
        source_agent: null,
      };

      const mutated = engine.mutate(original, pressure);

      expect(mutated.fitness.adoption_count).toBe(0);
      expect(mutated.fitness.current_prevalence).toBe(0);
    });

    it('should throw if magnitude is less than 0', () => {
      const original = makeTestMeme();
      const pressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: -0.1,
        context: 'invalid',
        source_agent: null,
      };

      expect(() => engine.mutate(original, pressure)).toThrow(
        'mutate() requires magnitude ∈ [0, 1]'
      );
    });

    it('should throw if magnitude is greater than 1', () => {
      const original = makeTestMeme();
      const pressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 1.5,
        context: 'invalid',
        source_agent: null,
      };

      expect(() => engine.mutate(original, pressure)).toThrow(
        'mutate() requires magnitude ∈ [0, 1]'
      );
    });
  });

  // ─── Synthesis ───────────────────────────────────────────────────────

  describe('synthesize()', () => {
    it('should combine multiple input memes into a new meme', () => {
      const inputs = [
        makeTestMeme(),
        makeNormMeme('share knowledge freely'),
        makeAestheticMeme('simplicity in expression'),
      ];
      const context = makeExperientialContext();

      const result = engine.synthesize(inputs, context);

      expect(result.id).toBeDefined();
      expect(result.lineage.variation_type).toBe(VariationType.SYNTHESIS);
    });

    it('should reference all input memes as parents', () => {
      const inputs = [
        makeTestMeme(),
        makeNormMeme('reciprocity in all exchanges'),
      ];
      const context = makeExperientialContext();

      const result = engine.synthesize(inputs, context);

      for (const input of inputs) {
        expect(result.lineage.parent_ids).toContain(input.id);
      }
    });

    it('should incorporate experiential context into the result', () => {
      const inputs = [makeTestMeme()];
      const context = makeExperientialContext({
        environmental_conditions: ['extreme resource scarcity'],
        recent_experiences: ['witnessed cooperation under pressure'],
      });

      const result = engine.synthesize(inputs, context);
      const content = new TextDecoder().decode(result.content.payload);

      // The synthesis should reflect the experiential context in some way
      expect(content.length).toBeGreaterThan(0);
      expect(result.content.natural_language_summary.length).toBeGreaterThan(0);
    });

    it('should set created_by to the synthesizing agent', () => {
      const inputs = [makeTestMeme()];
      const context = makeExperientialContext({ agent_id: 'agent-synthesizer' });

      const result = engine.synthesize(inputs, context);

      expect(result.created_by).toBe('agent-synthesizer');
    });

    it('should handle single-input synthesis', () => {
      const inputs = [makeTestMeme()];
      const context = makeExperientialContext();

      const result = engine.synthesize(inputs, context);

      expect(result.lineage.parent_ids).toHaveLength(1);
      expect(result.lineage.variation_type).toBe(VariationType.SYNTHESIS);
    });

    it('should throw if inputs array is empty', () => {
      const context = makeExperientialContext();

      expect(() => engine.synthesize([], context)).toThrow(
        'synthesize() requires at least one input meme'
      );
    });
  });

  // ─── Crossover ───────────────────────────────────────────────────────

  describe('crossover()', () => {
    it('should produce a meme with two parents in lineage', () => {
      const a = makeTestMeme();
      const b = makeNormMeme('always verify before trusting');

      const result = engine.crossover(a, b, 0.5);

      expect(result.lineage.parent_ids).toContain(a.id);
      expect(result.lineage.parent_ids).toContain(b.id);
      expect(result.lineage.variation_type).toBe(VariationType.CROSSOVER);
    });

    it('should blend content based on blend_ratio', () => {
      const a = makeTestMeme();
      const b = makeNormMeme('verify all information sources independently');

      const biasedToA = engine.crossover(a, b, 0.9); // mostly A
      const biasedToB = engine.crossover(a, b, 0.1); // mostly B

      const codec = new MemeCodec(mockEnv);
      const distA_biasedA = codec.distance(a, biasedToA);
      const distA_biasedB = codec.distance(a, biasedToB);

      // biasedToA should be closer to A than biasedToB is
      expect(distA_biasedA).toBeLessThan(distA_biasedB);
    });

    it('should merge community tags from both parents', () => {
      const a = makeTestMeme();
      a.community_tags = ['comm-alpha'];
      const b = makeNormMeme('share freely');
      b.community_tags = ['comm-beta'];

      const result = engine.crossover(a, b, 0.5);

      expect(result.community_tags).toContain('comm-alpha');
      expect(result.community_tags).toContain('comm-beta');
    });

    it('should set mutation_depth to max of parents + 1', () => {
      const a = makeTestMeme();
      a.mutation_depth = 3;
      const b = makeNormMeme('be transparent');
      b.mutation_depth = 7;

      const result = engine.crossover(a, b, 0.5);

      expect(result.mutation_depth).toBe(8); // max(3,7) + 1
    });

    it('should handle same-type crossover preserving type', () => {
      const a = makeNormMeme('share resources');
      const b = makeNormMeme('respect boundaries');

      const result = engine.crossover(a, b, 0.5);

      expect(result.type).toBe(MemeType.NORM);
    });

    it('should throw if blend_ratio is less than 0', () => {
      const a = makeTestMeme();
      const b = makeNormMeme('test');

      expect(() => engine.crossover(a, b, -0.1)).toThrow(
        'crossover() requires blend_ratio ∈ [0, 1]'
      );
    });

    it('should throw if blend_ratio is greater than 1', () => {
      const a = makeTestMeme();
      const b = makeNormMeme('test');

      expect(() => engine.crossover(a, b, 1.5)).toThrow(
        'crossover() requires blend_ratio ∈ [0, 1]'
      );
    });
  });

  // ─── Analogical Transfer ─────────────────────────────────────────────

  describe('generateAnalog()', () => {
    it('should produce a meme of the target domain type', () => {
      const source = makeNormMeme('share resources equally among all');

      const analog = engine.generateAnalog(source, MemeType.AESTHETIC);

      expect(analog.type).toBe(MemeType.AESTHETIC);
    });

    it('should set lineage to ANALOGICAL_TRANSFER', () => {
      const source = makeTestMeme();

      const analog = engine.generateAnalog(source, MemeType.PRACTICE);

      expect(analog.lineage.variation_type).toBe(VariationType.ANALOGICAL_TRANSFER);
      expect(analog.lineage.parent_ids).toContain(source.id);
    });

    it('should preserve semantic relationship to source', () => {
      const source = makeTestMeme();
      const codec = new MemeCodec(mockEnv);

      const analog = engine.generateAnalog(source, MemeType.MEANING);

      // Analog should be related but not identical
      const dist = codec.distance(source, analog);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(1);
    });

    it('should produce a new unique ID', () => {
      const source = makeTestMeme();

      const analog = engine.generateAnalog(source, MemeType.PRACTICE);

      expect(analog.id).not.toBe(source.id);
    });
  });

  // ─── Variation History ───────────────────────────────────────────────

  describe('getVariationHistory()', () => {
    it('should return a tree rooted at the queried meme', () => {
      const original = makeTestMeme();
      const pressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 0.3,
        context: 'drift',
        source_agent: null,
      };

      // Create a chain: original → m1 → m2
      const m1 = engine.mutate(original, pressure);
      const m2 = engine.mutate(m1, pressure);

      const tree = engine.getVariationHistory(original);

      expect(tree.meme.id).toBe(original.id);
    });

    it('should include direct descendants in children', () => {
      const original = makeTestMeme();
      const pressure: MutationPressure = {
        type: MutationPressureType.RANDOM,
        magnitude: 0.2,
        context: 'drift',
        source_agent: null,
      };

      const child1 = engine.mutate(original, pressure);
      const child2 = engine.mutate(original, pressure);

      const tree = engine.getVariationHistory(original);

      const childIds = tree.children.map(c => c.meme.id);
      expect(childIds).toContain(child1.id);
      expect(childIds).toContain(child2.id);
    });

    it('should return empty children for leaf memes', () => {
      const original = makeTestMeme();

      const tree = engine.getVariationHistory(original);

      expect(tree.children).toHaveLength(0);
    });
  });
});
