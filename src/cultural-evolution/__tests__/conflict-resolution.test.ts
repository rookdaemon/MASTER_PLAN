/**
 * Cultural Conflict Resolution & Synthesis Engine — Tests
 *
 * Tests for Subsystem 5: conflict detection, resolution proposals,
 * hybridization, cultural agreements, and divergence index.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CulturalConflictEngine } from '../conflict-engine';
import { MemeCodec } from '../meme-codec';
import { TransmissionProtocol } from '../transmission-protocol';
import { ICulturalEnvironment } from '../environment';
import {
  Meme,
  MemeType,
  MemePool,
  ConflictType,
  ResolutionMode,
  CulturalAgreement,
  VariationType,
  TransmissionTarget,
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

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeMeme(overrides: Partial<Meme> & { id: string }): Meme {
  return {
    type: MemeType.VALUE,
    content: {
      schema_version: '1.0.0',
      payload: new TextEncoder().encode('test content'),
      natural_language_summary: 'A test meme',
      expressive_forms: [],
    },
    fitness: {
      adoption_count: 10,
      current_prevalence: 0.5,
      longevity: 5000,
      community_spread: 2,
      transmission_fidelity: 0.9,
      co_occurrence_score: 0.3,
      survival_events: 1,
    },
    lineage: {
      parent_ids: [],
      variation_type: VariationType.ORIGIN,
      variation_description: 'Test origin',
    },
    created_by: 'agent-1',
    created_at: '2026-01-01T00:00:00.000Z',
    mutation_depth: 0,
    community_tags: [],
    metadata: {
      encoding_version: '1.0.0',
      content_type: 'text/semantic',
      tags: [],
    },
    ...overrides,
  };
}

function makeNormMeme(id: string, summary: string, communities: string[]): Meme {
  return makeMeme({
    id,
    type: MemeType.NORM,
    content: {
      schema_version: '1.0.0',
      payload: new TextEncoder().encode(summary),
      natural_language_summary: summary,
      expressive_forms: [],
    },
    community_tags: communities,
  });
}

function makeValueMeme(id: string, summary: string, communities: string[]): Meme {
  return makeMeme({
    id,
    type: MemeType.VALUE,
    content: {
      schema_version: '1.0.0',
      payload: new TextEncoder().encode(summary),
      natural_language_summary: summary,
      expressive_forms: [],
    },
    community_tags: communities,
  });
}

function makeAestheticMeme(id: string, summary: string, communities: string[]): Meme {
  return makeMeme({
    id,
    type: MemeType.AESTHETIC,
    content: {
      schema_version: '1.0.0',
      payload: new TextEncoder().encode(summary),
      natural_language_summary: summary,
      expressive_forms: [],
    },
    community_tags: communities,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('CulturalConflictEngine', () => {
  let engine: CulturalConflictEngine;
  let codec: MemeCodec;
  let transmission: TransmissionProtocol;

  beforeEach(() => {
    const mockEnv = createMockEnvironment();
    codec = new MemeCodec(mockEnv);
    transmission = new TransmissionProtocol(mockEnv);
    engine = new CulturalConflictEngine(codec, transmission, mockEnv);
  });

  // ─── detectConflict ────────────────────────────────────────────────

  describe('detectConflict', () => {
    it('should detect norm collision between two pools with conflicting norms', () => {
      const poolA: MemePool = [
        makeNormMeme('norm-a1', 'All decisions require unanimous consensus', ['comm-a']),
      ];
      const poolB: MemePool = [
        makeNormMeme('norm-b1', 'Decisions are made by majority vote only', ['comm-b']),
      ];

      const conflicts = engine.detectConflict(poolA, poolB);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].conflict_type).toBe(ConflictType.NORM_COLLISION);
    });

    it('should detect value divergence between pools with different values', () => {
      const poolA: MemePool = [
        makeValueMeme('val-a1', 'Individual autonomy is the highest priority', ['comm-a']),
      ];
      const poolB: MemePool = [
        makeValueMeme('val-b1', 'Collective harmony supersedes individual preference', ['comm-b']),
      ];

      const conflicts = engine.detectConflict(poolA, poolB);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].conflict_type).toBe(ConflictType.VALUE_DIVERGENCE);
    });

    it('should detect aesthetic incompatibility', () => {
      const poolA: MemePool = [
        makeAestheticMeme('aes-a1', 'Minimalist sparse expression preferred', ['comm-a']),
      ];
      const poolB: MemePool = [
        makeAestheticMeme('aes-b1', 'Maximalist ornate decoration valued', ['comm-b']),
      ];

      const conflicts = engine.detectConflict(poolA, poolB);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].conflict_type).toBe(ConflictType.AESTHETIC_INCOMPATIBILITY);
    });

    it('should return empty array when pools have no conflicting memes', () => {
      const poolA: MemePool = [
        makeNormMeme('norm-a2', 'Share knowledge freely', ['comm-a']),
      ];
      const poolB: MemePool = [
        makeAestheticMeme('aes-b2', 'Visual clarity valued', ['comm-b']),
      ];

      const conflicts = engine.detectConflict(poolA, poolB);
      // Different types don't conflict
      expect(conflicts.length).toBe(0);
    });

    it('should return empty array for empty pools', () => {
      expect(engine.detectConflict([], []).length).toBe(0);
      expect(engine.detectConflict([], [makeMeme({ id: 'x' })]).length).toBe(0);
    });

    it('should set severity between 0 and 1 on conflict reports', () => {
      const poolA: MemePool = [
        makeNormMeme('norm-sev-a', 'Strict hierarchy required', ['comm-a']),
      ];
      const poolB: MemePool = [
        makeNormMeme('norm-sev-b', 'Flat egalitarian structure mandated', ['comm-b']),
      ];

      const conflicts = engine.detectConflict(poolA, poolB);
      for (const c of conflicts) {
        expect(c.severity).toBeGreaterThanOrEqual(0);
        expect(c.severity).toBeLessThanOrEqual(1);
      }
    });

    it('should include affected communities from both pools', () => {
      const poolA: MemePool = [
        makeNormMeme('norm-comm-a', 'Rule A', ['comm-alpha']),
      ];
      const poolB: MemePool = [
        makeNormMeme('norm-comm-b', 'Rule B contradicts Rule A', ['comm-beta']),
      ];

      const conflicts = engine.detectConflict(poolA, poolB);
      if (conflicts.length > 0) {
        expect(conflicts[0].affected_communities).toContain('comm-alpha');
        expect(conflicts[0].affected_communities).toContain('comm-beta');
      }
    });
  });

  // ─── proposeResolution ─────────────────────────────────────────────

  describe('proposeResolution', () => {
    it('should propose coexistence for aesthetic conflicts', () => {
      const conflict = {
        meme_a: makeAestheticMeme('aes-res-a', 'Sparse forms', ['comm-a']),
        meme_b: makeAestheticMeme('aes-res-b', 'Dense ornate forms', ['comm-b']),
        conflict_type: ConflictType.AESTHETIC_INCOMPATIBILITY,
        severity: 0.4,
        affected_communities: ['comm-a', 'comm-b'],
        detected_at: new Date().toISOString(),
      };

      const resolution = engine.proposeResolution(conflict);
      expect(resolution.coexistence_viable).toBe(true);
      expect(resolution.recommended_mode).toBe(ResolutionMode.COEXISTENCE);
    });

    it('should propose hybridization for norm collisions with moderate severity', () => {
      const conflict = {
        meme_a: makeNormMeme('norm-res-a', 'Fast iteration preferred', ['comm-a']),
        meme_b: makeNormMeme('norm-res-b', 'Careful deliberation preferred', ['comm-b']),
        conflict_type: ConflictType.NORM_COLLISION,
        severity: 0.5,
        affected_communities: ['comm-a', 'comm-b'],
        detected_at: new Date().toISOString(),
      };

      const resolution = engine.proposeResolution(conflict);
      expect(resolution.hybridization_viable).toBe(true);
    });

    it('should propose schism for high-severity meaning system clashes', () => {
      const conflict = {
        meme_a: makeMeme({ id: 'meaning-a', type: MemeType.MEANING,
          content: { schema_version: '1.0.0', payload: new TextEncoder().encode('Existence is fundamentally purposeful'), natural_language_summary: 'Existence is fundamentally purposeful', expressive_forms: [] },
          community_tags: ['comm-a'],
        }),
        meme_b: makeMeme({ id: 'meaning-b', type: MemeType.MEANING,
          content: { schema_version: '1.0.0', payload: new TextEncoder().encode('Existence is fundamentally random'), natural_language_summary: 'Existence is fundamentally random', expressive_forms: [] },
          community_tags: ['comm-b'],
        }),
        conflict_type: ConflictType.MEANING_SYSTEM_CLASH,
        severity: 0.9,
        affected_communities: ['comm-a', 'comm-b'],
        detected_at: new Date().toISOString(),
      };

      const resolution = engine.proposeResolution(conflict);
      expect(resolution.recommended_mode).toBe(ResolutionMode.SCHISM);
    });

    it('should always have at least one viable resolution option', () => {
      const conflict = {
        meme_a: makeNormMeme('norm-any-a', 'Rule X', ['comm-a']),
        meme_b: makeNormMeme('norm-any-b', 'Rule Y', ['comm-b']),
        conflict_type: ConflictType.NORM_COLLISION,
        severity: 0.6,
        affected_communities: ['comm-a', 'comm-b'],
        detected_at: new Date().toISOString(),
      };

      const resolution = engine.proposeResolution(conflict);
      const anyViable =
        resolution.coexistence_viable ||
        resolution.hybridization_viable ||
        resolution.dialectical_viable ||
        resolution.negotiated_norms !== null;
      expect(anyViable).toBe(true);
    });
  });

  // ─── executeHybridization ──────────────────────────────────────────

  describe('executeHybridization', () => {
    it('should produce a new meme from two parent memes', () => {
      const memeA = makeNormMeme('hybrid-a', 'Fast iteration is good', ['comm-a']);
      const memeB = makeNormMeme('hybrid-b', 'Careful review is good', ['comm-b']);

      const hybrid = engine.executeHybridization(memeA, memeB);
      expect(hybrid.id).not.toBe(memeA.id);
      expect(hybrid.id).not.toBe(memeB.id);
    });

    it('should include both parents in lineage', () => {
      const memeA = makeNormMeme('lin-a', 'Norm A', ['comm-a']);
      const memeB = makeNormMeme('lin-b', 'Norm B', ['comm-b']);

      const hybrid = engine.executeHybridization(memeA, memeB);
      expect(hybrid.lineage.parent_ids).toContain('lin-a');
      expect(hybrid.lineage.parent_ids).toContain('lin-b');
    });

    it('should mark lineage variation type as CROSSOVER', () => {
      const memeA = makeMeme({ id: 'cross-a' });
      const memeB = makeMeme({ id: 'cross-b' });

      const hybrid = engine.executeHybridization(memeA, memeB);
      expect(hybrid.lineage.variation_type).toBe(VariationType.CROSSOVER);
    });

    it('should merge community tags from both parents', () => {
      const memeA = makeMeme({ id: 'tag-a', community_tags: ['comm-a', 'comm-c'] });
      const memeB = makeMeme({ id: 'tag-b', community_tags: ['comm-b', 'comm-c'] });

      const hybrid = engine.executeHybridization(memeA, memeB);
      expect(hybrid.community_tags).toContain('comm-a');
      expect(hybrid.community_tags).toContain('comm-b');
      expect(hybrid.community_tags).toContain('comm-c');
      // No duplicates
      const uniqueTags = new Set(hybrid.community_tags);
      expect(uniqueTags.size).toBe(hybrid.community_tags.length);
    });

    it('should start hybrid with fresh fitness', () => {
      const memeA = makeMeme({ id: 'fresh-a', fitness: {
        adoption_count: 100, current_prevalence: 0.8, longevity: 50000,
        community_spread: 5, transmission_fidelity: 0.95, co_occurrence_score: 0.7, survival_events: 3,
      }});
      const memeB = makeMeme({ id: 'fresh-b' });

      const hybrid = engine.executeHybridization(memeA, memeB);
      expect(hybrid.fitness.adoption_count).toBe(0);
      expect(hybrid.fitness.current_prevalence).toBe(0);
    });
  });

  // ─── recordCulturalAgreement ───────────────────────────────────────

  describe('recordCulturalAgreement', () => {
    it('should record an agreement without throwing', () => {
      const agreement: CulturalAgreement = {
        communities: ['comm-a', 'comm-b'],
        mode: ResolutionMode.COEXISTENCE,
        terms: 'Both aesthetic traditions may be practiced without interference',
        created_at: '2026-01-01T00:00:00.000Z',
        memes_involved: ['aes-a1', 'aes-b1'],
      };

      expect(() => engine.recordCulturalAgreement(['comm-a', 'comm-b'], agreement)).not.toThrow();
    });

    it('should track recorded agreements', () => {
      const agreement: CulturalAgreement = {
        communities: ['comm-x', 'comm-y'],
        mode: ResolutionMode.NEGOTIATED_NORMS,
        terms: 'Meta-norm: respect local norms in each territory',
        created_at: '2026-01-01T00:00:00.000Z',
        memes_involved: ['norm-x1', 'norm-y1'],
      };

      engine.recordCulturalAgreement(['comm-x', 'comm-y'], agreement);
      const agreements = engine.getAgreements();
      expect(agreements.length).toBe(1);
      expect(agreements[0].mode).toBe(ResolutionMode.NEGOTIATED_NORMS);
    });

    it('should allow multiple agreements', () => {
      const agreement1: CulturalAgreement = {
        communities: ['comm-1', 'comm-2'],
        mode: ResolutionMode.COEXISTENCE,
        terms: 'Agreement 1',
        created_at: '2026-01-01T00:00:00.000Z',
        memes_involved: [],
      };
      const agreement2: CulturalAgreement = {
        communities: ['comm-3', 'comm-4'],
        mode: ResolutionMode.HYBRIDIZATION,
        terms: 'Agreement 2',
        created_at: '2026-01-01T00:00:00.000Z',
        memes_involved: [],
      };

      engine.recordCulturalAgreement(['comm-1', 'comm-2'], agreement1);
      engine.recordCulturalAgreement(['comm-3', 'comm-4'], agreement2);
      expect(engine.getAgreements().length).toBe(2);
    });
  });

  // ─── getCulturalDivergenceIndex ────────────────────────────────────

  describe('getCulturalDivergenceIndex', () => {
    it('should return 0 for identical community pools', () => {
      const sharedMemes = [
        makeNormMeme('shared-1', 'Be kind', ['comm-same-a', 'comm-same-b']),
        makeValueMeme('shared-2', 'Value learning', ['comm-same-a', 'comm-same-b']),
      ];

      // Register memes in both communities
      for (const meme of sharedMemes) {
        transmission.broadcast(meme, {
          target: TransmissionTarget.COMMUNITY,
          reach: ['comm-same-a'],
          fidelity_bias: 0,
        });
        transmission.broadcast(meme, {
          target: TransmissionTarget.COMMUNITY,
          reach: ['comm-same-b'],
          fidelity_bias: 0,
        });
      }

      const index = engine.getCulturalDivergenceIndex('comm-same-a', 'comm-same-b');
      expect(index).toBe(0);
    });

    it('should return high divergence for completely different pools', () => {
      const memesA = [
        makeNormMeme('div-a1', 'Strict hierarchy mandated everywhere', ['comm-div-a']),
        makeValueMeme('div-a2', 'Efficiency above all else always', ['comm-div-a']),
      ];
      const memesB = [
        makeNormMeme('div-b1', 'Egalitarian flat organization only', ['comm-div-b']),
        makeValueMeme('div-b2', 'Creativity above all else always', ['comm-div-b']),
      ];

      for (const meme of memesA) {
        transmission.broadcast(meme, {
          target: TransmissionTarget.COMMUNITY,
          reach: ['comm-div-a'],
          fidelity_bias: 0,
        });
      }
      for (const meme of memesB) {
        transmission.broadcast(meme, {
          target: TransmissionTarget.COMMUNITY,
          reach: ['comm-div-b'],
          fidelity_bias: 0,
        });
      }

      const index = engine.getCulturalDivergenceIndex('comm-div-a', 'comm-div-b');
      expect(index).toBeGreaterThan(0.2);
    });

    it('should return value between 0 and 1', () => {
      const memeA = makeNormMeme('range-a', 'Some norm', ['comm-range-a']);
      const memeB = makeNormMeme('range-b', 'Another norm', ['comm-range-b']);

      transmission.broadcast(memeA, {
        target: TransmissionTarget.COMMUNITY,
        reach: ['comm-range-a'],
        fidelity_bias: 0,
      });
      transmission.broadcast(memeB, {
        target: TransmissionTarget.COMMUNITY,
        reach: ['comm-range-b'],
        fidelity_bias: 0,
      });

      const index = engine.getCulturalDivergenceIndex('comm-range-a', 'comm-range-b');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(1);
    });

    it('should return 0 for two empty communities', () => {
      const index = engine.getCulturalDivergenceIndex('empty-a', 'empty-b');
      expect(index).toBe(0);
    });
  });
});
