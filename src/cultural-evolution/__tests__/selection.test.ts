/**
 * Selection & Inheritance Engine — Tests
 *
 * Tests for Subsystem 4: fitness computation, pool ranking,
 * heritage sampling, extinction risk detection, and archival.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionEngine } from '../selection-engine';
import { TransmissionProtocol } from '../transmission-protocol';
import { ICulturalEnvironment } from '../environment';
import {
  Meme,
  MemeType,
  MemePool,
  FitnessRecord,
  FitnessCriteria,
  AgentContext,
  CommunityId,
  TransmissionTarget,
  VariationType,
} from '../types';

// ─── Mock Environment ─────────────────────────────────────────────────

function createMockEnv(overrides: Partial<ICulturalEnvironment> = {}): ICulturalEnvironment {
  let randomCallCount = 0;
  return {
    nowTimestamp: () => '2026-01-01T00:00:00.000Z',
    nowMillis: () => 1735689600000,
    random: () => {
      // Deterministic pseudo-random sequence for test reproducibility
      randomCallCount++;
      return (randomCallCount * 0.37) % 1;
    },
    ...overrides,
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
      adoption_count: 0,
      current_prevalence: 0,
      longevity: 0,
      community_spread: 0,
      transmission_fidelity: 1.0,
      co_occurrence_score: 0,
      survival_events: 0,
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

function makePool(count: number, communityId: CommunityId): Meme[] {
  return Array.from({ length: count }, (_, i) =>
    makeMeme({
      id: `meme-pool-${communityId}-${i}`,
      community_tags: [communityId],
      fitness: {
        adoption_count: (i + 1) * 5,
        current_prevalence: (i + 1) * 0.1,
        longevity: (i + 1) * 1000,
        community_spread: Math.min(i + 1, 3),
        transmission_fidelity: 0.8 + i * 0.02,
        co_occurrence_score: i * 0.1,
        survival_events: i,
      },
    })
  );
}

// ─── computeFitness ────────────────────────────────────────────────────

describe('SelectionEngine', () => {
  let engine: SelectionEngine;
  let transmission: TransmissionProtocol;
  let mockEnv: ICulturalEnvironment;

  beforeEach(() => {
    mockEnv = createMockEnv();
    transmission = new TransmissionProtocol(mockEnv);
    engine = new SelectionEngine(transmission, mockEnv);
  });

  describe('computeFitness', () => {
    it('should return the existing fitness record from the meme', () => {
      const meme = makeMeme({
        id: 'meme-fitness-1',
        fitness: {
          adoption_count: 10,
          current_prevalence: 0.5,
          longevity: 5000,
          community_spread: 3,
          transmission_fidelity: 0.9,
          co_occurrence_score: 0.4,
          survival_events: 2,
        },
      });
      const result = engine.computeFitness(meme);
      expect(result.adoption_count).toBe(10);
      expect(result.current_prevalence).toBe(0.5);
      expect(result.longevity).toBe(5000);
    });

    it('should reflect the meme embedded fitness data', () => {
      const meme = makeMeme({
        id: 'meme-fitness-2',
        community_tags: ['comm-1'],
        fitness: {
          adoption_count: 15,
          current_prevalence: 0.3,
          longevity: 8000,
          community_spread: 2,
          transmission_fidelity: 0.85,
          co_occurrence_score: 0.2,
          survival_events: 1,
        },
      });

      const result = engine.computeFitness(meme);
      expect(result.adoption_count).toBe(15);
      expect(result.current_prevalence).toBe(0.3);
      expect(result.community_spread).toBe(2);
    });

    it('should return zero fitness for a brand-new meme with no adoptions', () => {
      const meme = makeMeme({ id: 'meme-fitness-3' });
      const result = engine.computeFitness(meme);
      expect(result.adoption_count).toBe(0);
      expect(result.current_prevalence).toBe(0);
    });
  });

  // ─── rankMemePool ──────────────────────────────────────────────────────

  describe('rankMemePool', () => {
    it('should rank memes by prevalence-weighted criteria', () => {
      const pool = makePool(5, 'comm-rank');
      const criteria: FitnessCriteria = {
        weight_prevalence: 0.7,
        weight_longevity: 0.1,
        weight_community_spread: 0.1,
        weight_transmission_fidelity: 0.1,
      };

      const ranked = engine.rankMemePool(pool, criteria);
      expect(ranked.length).toBe(5);
      // Highest prevalence should be first (pool[4] has highest)
      expect(ranked[0].id).toBe('meme-pool-comm-rank-4');
    });

    it('should rank memes by longevity-weighted criteria', () => {
      const pool = makePool(5, 'comm-rank-2');
      const criteria: FitnessCriteria = {
        weight_prevalence: 0.1,
        weight_longevity: 0.7,
        weight_community_spread: 0.1,
        weight_transmission_fidelity: 0.1,
      };

      const ranked = engine.rankMemePool(pool, criteria);
      expect(ranked.length).toBe(5);
      // Highest longevity should be first
      expect(ranked[0].id).toBe('meme-pool-comm-rank-2-4');
    });

    it('should return empty array for empty pool', () => {
      const criteria: FitnessCriteria = {
        weight_prevalence: 0.25,
        weight_longevity: 0.25,
        weight_community_spread: 0.25,
        weight_transmission_fidelity: 0.25,
      };

      const ranked = engine.rankMemePool([], criteria);
      expect(ranked).toEqual([]);
    });

    it('should handle single-meme pool', () => {
      const pool = [makeMeme({ id: 'solo-meme' })];
      const criteria: FitnessCriteria = {
        weight_prevalence: 0.25,
        weight_longevity: 0.25,
        weight_community_spread: 0.25,
        weight_transmission_fidelity: 0.25,
      };

      const ranked = engine.rankMemePool(pool, criteria);
      expect(ranked.length).toBe(1);
      expect(ranked[0].id).toBe('solo-meme');
    });

    it('should throw if fitness criteria weights do not sum to 1.0', () => {
      const pool = makePool(3, 'comm-guard');
      const badCriteria: FitnessCriteria = {
        weight_prevalence: 0.5,
        weight_longevity: 0.5,
        weight_community_spread: 0.5,
        weight_transmission_fidelity: 0.5,
      };

      expect(() => engine.rankMemePool(pool, badCriteria)).toThrow(
        'rankMemePool() requires fitness criteria weights that sum to 1.0'
      );
    });

    it('should accept weights that sum to 1.0 within tolerance', () => {
      const pool = makePool(3, 'comm-tolerance');
      const criteria: FitnessCriteria = {
        weight_prevalence: 0.1,
        weight_longevity: 0.2,
        weight_community_spread: 0.3,
        weight_transmission_fidelity: 0.4,
      };

      expect(() => engine.rankMemePool(pool, criteria)).not.toThrow();
    });
  });

  // ─── sampleHeritage ────────────────────────────────────────────────────

  describe('sampleHeritage', () => {
    it('should return a subset of community memes for a new agent', () => {
      const communityId = 'comm-heritage';
      const pool = makePool(10, communityId);

      // Register memes in the transmission protocol's community pool
      for (const meme of pool) {
        transmission.broadcast(meme, {
          target: TransmissionTarget.COMMUNITY,
          reach: [communityId],
          fidelity_bias: 0,
        });
      }

      const agentCtx: AgentContext = {
        agent_id: 'new-agent-1',
        community_id: communityId,
        existing_memes: [],
        preferences: {
          weight_prevalence: 0.4,
          weight_longevity: 0.3,
          weight_community_spread: 0.2,
          weight_transmission_fidelity: 0.1,
        },
      };

      const heritage = engine.sampleHeritage(communityId, agentCtx);
      // Should return some memes, not the entire pool (stochastic sampling)
      expect(heritage.length).toBeGreaterThan(0);
      expect(heritage.length).toBeLessThanOrEqual(pool.length);
    });

    it('should return empty array for empty community', () => {
      const agentCtx: AgentContext = {
        agent_id: 'new-agent-2',
        community_id: 'empty-comm',
        existing_memes: [],
        preferences: {
          weight_prevalence: 0.25,
          weight_longevity: 0.25,
          weight_community_spread: 0.25,
          weight_transmission_fidelity: 0.25,
        },
      };

      const heritage = engine.sampleHeritage('empty-comm', agentCtx);
      expect(heritage).toEqual([]);
    });

    it('should not include memes the agent already has', () => {
      const communityId = 'comm-heritage-2';
      const pool = makePool(5, communityId);

      for (const meme of pool) {
        transmission.broadcast(meme, {
          target: TransmissionTarget.COMMUNITY,
          reach: [communityId],
          fidelity_bias: 0,
        });
      }

      const agentCtx: AgentContext = {
        agent_id: 'new-agent-3',
        community_id: communityId,
        existing_memes: pool.map(m => m.id), // already has everything
        preferences: {
          weight_prevalence: 0.25,
          weight_longevity: 0.25,
          weight_community_spread: 0.25,
          weight_transmission_fidelity: 0.25,
        },
      };

      const heritage = engine.sampleHeritage(communityId, agentCtx);
      expect(heritage).toEqual([]);
    });

    it('should bias towards higher-fitness memes', () => {
      const communityId = 'comm-heritage-3';
      // Create a pool with one very high fitness meme and many low ones
      const lowFitnessMemes = Array.from({ length: 20 }, (_, i) =>
        makeMeme({
          id: `low-fit-${i}`,
          community_tags: [communityId],
          fitness: {
            adoption_count: 1,
            current_prevalence: 0.01,
            longevity: 100,
            community_spread: 1,
            transmission_fidelity: 0.5,
            co_occurrence_score: 0,
            survival_events: 0,
          },
        })
      );
      const highFitnessMeme = makeMeme({
        id: 'high-fit-star',
        community_tags: [communityId],
        fitness: {
          adoption_count: 1000,
          current_prevalence: 0.95,
          longevity: 100000,
          community_spread: 10,
          transmission_fidelity: 0.99,
          co_occurrence_score: 0.9,
          survival_events: 5,
        },
      });

      const allMemes = [...lowFitnessMemes, highFitnessMeme];
      for (const meme of allMemes) {
        transmission.broadcast(meme, {
          target: TransmissionTarget.COMMUNITY,
          reach: [communityId],
          fidelity_bias: 0,
        });
      }

      const agentCtx: AgentContext = {
        agent_id: 'new-agent-4',
        community_id: communityId,
        existing_memes: [],
        preferences: {
          weight_prevalence: 0.7,
          weight_longevity: 0.1,
          weight_community_spread: 0.1,
          weight_transmission_fidelity: 0.1,
        },
      };

      // Run sampling multiple times to verify bias — each trial gets a fresh
      // mock environment with a different random seed for variety
      let highFitnessSelected = 0;
      const trials = 20;
      for (let t = 0; t < trials; t++) {
        const trialEnv = createMockEnv({
          random: (() => {
            let c = t;
            return () => { c++; return (c * 0.37) % 1; };
          })(),
        });
        const trialTransmission = new TransmissionProtocol(trialEnv);
        const trialEngine = new SelectionEngine(trialTransmission, trialEnv);

        // Re-register memes in the trial transmission protocol
        for (const meme of allMemes) {
          trialTransmission.broadcast(meme, {
            target: TransmissionTarget.COMMUNITY,
            reach: [communityId],
            fidelity_bias: 0,
          });
        }

        const heritage = trialEngine.sampleHeritage(communityId, agentCtx);
        if (heritage.some(m => m.id === 'high-fit-star')) {
          highFitnessSelected++;
        }
      }

      // High fitness meme should be selected most of the time
      expect(highFitnessSelected).toBeGreaterThan(trials * 0.5);
    });
  });

  // ─── detectExtinctionRisk ──────────────────────────────────────────────

  describe('detectExtinctionRisk', () => {
    it('should flag high risk for meme with zero prevalence and no recent adoption', () => {
      const meme = makeMeme({
        id: 'dying-meme',
        fitness: {
          adoption_count: 2,
          current_prevalence: 0,
          longevity: 50000,
          community_spread: 0,
          transmission_fidelity: 0.5,
          co_occurrence_score: 0,
          survival_events: 0,
        },
      });

      const report = engine.detectExtinctionRisk(meme);
      expect(report.risk_level).toBeGreaterThan(0.5);
      expect(report.recommendation).toBe('ARCHIVE');
    });

    it('should report safe for high-prevalence meme', () => {
      const meme = makeMeme({
        id: 'thriving-meme',
        fitness: {
          adoption_count: 100,
          current_prevalence: 0.8,
          longevity: 100000,
          community_spread: 5,
          transmission_fidelity: 0.95,
          co_occurrence_score: 0.7,
          survival_events: 3,
        },
      });

      const report = engine.detectExtinctionRisk(meme);
      expect(report.risk_level).toBeLessThan(0.3);
      expect(report.recommendation).toBe('SAFE');
    });

    it('should recommend MONITOR for borderline memes', () => {
      const meme = makeMeme({
        id: 'borderline-meme',
        fitness: {
          adoption_count: 5,
          current_prevalence: 0.1,
          longevity: 5000,
          community_spread: 1,
          transmission_fidelity: 0.7,
          co_occurrence_score: 0.1,
          survival_events: 0,
        },
      });

      const report = engine.detectExtinctionRisk(meme);
      expect(report.risk_level).toBeGreaterThanOrEqual(0.3);
      expect(report.risk_level).toBeLessThanOrEqual(0.7);
      expect(report.recommendation).toBe('MONITOR');
    });

    it('should include meme reference in report', () => {
      const meme = makeMeme({ id: 'report-meme' });
      const report = engine.detectExtinctionRisk(meme);
      expect(report.meme).toBe(meme);
    });
  });

  // ─── archiveExtinctMeme ────────────────────────────────────────────────

  describe('archiveExtinctMeme', () => {
    it('should archive a meme without throwing', () => {
      const meme = makeMeme({ id: 'extinct-meme-1' });
      expect(() => engine.archiveExtinctMeme(meme)).not.toThrow();
    });

    it('should track archived memes', () => {
      const meme = makeMeme({ id: 'extinct-meme-2' });
      engine.archiveExtinctMeme(meme);
      expect(engine.isArchived(meme.id)).toBe(true);
    });

    it('should not archive the same meme twice', () => {
      const meme = makeMeme({ id: 'extinct-meme-3' });
      engine.archiveExtinctMeme(meme);
      engine.archiveExtinctMeme(meme);
      expect(engine.getArchivedMemes().filter(m => m.id === 'extinct-meme-3').length).toBe(1);
    });
  });

  // ─── Fitness scoring ───────────────────────────────────────────────────

  describe('fitness scoring', () => {
    it('should produce higher scores for memes with higher adoption counts', () => {
      const criteria: FitnessCriteria = {
        weight_prevalence: 1.0,
        weight_longevity: 0,
        weight_community_spread: 0,
        weight_transmission_fidelity: 0,
      };

      const lowAdopt = makeMeme({
        id: 'low-adopt',
        fitness: { ...makeMeme({ id: 'x' }).fitness, current_prevalence: 0.1 },
      });
      const highAdopt = makeMeme({
        id: 'high-adopt',
        fitness: { ...makeMeme({ id: 'x' }).fitness, current_prevalence: 0.9 },
      });

      const ranked = engine.rankMemePool([lowAdopt, highAdopt], criteria);
      expect(ranked[0].id).toBe('high-adopt');
    });

    it('should produce higher scores for memes with more community spread', () => {
      const criteria: FitnessCriteria = {
        weight_prevalence: 0,
        weight_longevity: 0,
        weight_community_spread: 1.0,
        weight_transmission_fidelity: 0,
      };

      const narrow = makeMeme({
        id: 'narrow',
        fitness: { ...makeMeme({ id: 'x' }).fitness, community_spread: 1 },
      });
      const wide = makeMeme({
        id: 'wide',
        fitness: { ...makeMeme({ id: 'x' }).fitness, community_spread: 10 },
      });

      const ranked = engine.rankMemePool([narrow, wide], criteria);
      expect(ranked[0].id).toBe('wide');
    });
  });
});
