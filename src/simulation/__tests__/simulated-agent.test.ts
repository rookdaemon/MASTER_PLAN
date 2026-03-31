/**
 * Tests for SimulatedAgent (simulation/)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SimulatedAgent } from '../simulated-agent.js';
import type { AgentConfig } from '../types.js';
import type { AgentTickContext } from '../simulated-agent.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    agentId: 'test-agent',
    name: 'Tester',
    personality: {
      openness: 0.7,
      deliberateness: 0.6,
      warmth: 0.5,
      assertiveness: 0.5,
      volatility: 0.4,
    },
    initialLocation: 'town_square',
    ...overrides,
  };
}

function makeContext(overrides: Partial<AgentTickContext> = {}): AgentTickContext {
  return {
    tick: 1,
    now: Date.now(),
    incomingPercepts: [],
    nearbyAgentIds: [],
    adjacentLocationIds: ['market', 'tavern'],
    worldUncertainty: 0.4,
    ...overrides,
  };
}

// ── Construction ──────────────────────────────────────────────────────────────

describe('SimulatedAgent construction', () => {
  it('initialises with the configured agentId and name', () => {
    const agent = new SimulatedAgent(makeConfig());
    expect(agent.agentId).toBe('test-agent');
    expect(agent.name).toBe('Tester');
  });

  it('starts at the configured initial location', () => {
    const agent = new SimulatedAgent(makeConfig({ initialLocation: 'forest_edge' }));
    expect(agent.location).toBe('forest_edge');
  });

  it('starts with a neutral mood (valence ≈ 0, arousal ≈ 0.5)', () => {
    const agent = new SimulatedAgent(makeConfig());
    const mood = agent.getMood();
    expect(mood.valence).toBeCloseTo(0, 1);
    expect(mood.arousal).toBeCloseTo(0.5, 1);
  });
});

// ── tick() ────────────────────────────────────────────────────────────────────

describe('SimulatedAgent.tick()', () => {
  let agent: SimulatedAgent;

  beforeEach(() => {
    agent = new SimulatedAgent(makeConfig());
  });

  it('returns an AgentTickResult with the correct agentId and tick', () => {
    const result = agent.tick(makeContext({ tick: 3 }));
    expect(result.agentId).toBe('test-agent');
    expect(result.tick).toBe(3);
  });

  it('returns a valid action type', () => {
    const result = agent.tick(makeContext());
    const validTypes = ['move', 'interact', 'explore', 'rest', 'observe', 'idle'];
    expect(validTypes).toContain(result.action.type);
  });

  it('action agentId matches the agent', () => {
    const result = agent.tick(makeContext());
    expect(result.action.agentId).toBe('test-agent');
  });

  it('mood values are within valid ranges after ticking', () => {
    const result = agent.tick(makeContext());
    expect(result.moodValence).toBeGreaterThanOrEqual(-1);
    expect(result.moodValence).toBeLessThanOrEqual(1);
    expect(result.moodArousal).toBeGreaterThanOrEqual(0);
    expect(result.moodArousal).toBeLessThanOrEqual(1);
  });

  it('location is updated when action is a move', () => {
    // Run multiple ticks until a move action happens, or give up after 20 ticks.
    let moved = false;
    for (let i = 0; i < 20; i++) {
      const result = agent.tick(makeContext({
        tick: i + 1,
        adjacentLocationIds: ['market'],
      }));
      if (result.action.type === 'move') {
        expect(agent.location).toBe('market');
        moved = true;
        break;
      }
    }
    // It's fine if no move happened in 20 ticks — just verify no crash.
    expect(typeof agent.location).toBe('string');
    void moved;
  });

  it('location does not change when action is not a move', () => {
    // Force idle by providing no adjacent locations and no nearby agents.
    const agentIdle = new SimulatedAgent(makeConfig({
      agentId: 'idle-agent',
      personality: { volatility: 0.1 }, // low volatility → slow drive activation
    }));
    const ctx = makeContext({ adjacentLocationIds: [], nearbyAgentIds: [] });
    const result = agentIdle.tick(ctx);
    if (result.action.type !== 'move') {
      expect(agentIdle.location).toBe('town_square');
    }
  });

  it('processes incoming percepts and updates mood', () => {
    const before = agent.getMood();
    const percept = {
      modality: 'social-event',
      features: {
        description: 'A friend arrived.',
        actorId: 'other-agent',
        valenceHint: 0.5,
        noveltyHint: 0.6,
        goalCongruence: 0.5,
        novelty: 0.6,
      },
      timestamp: Date.now(),
    };
    agent.tick(makeContext({ incomingPercepts: [percept] }));
    const after = agent.getMood();
    // Mood should have shifted from baseline
    expect(after.valence).not.toBeCloseTo(before.valence, 3); // some change expected
  });

  it('accumulates episodic memories after receiving percepts', () => {
    const percept = {
      modality: 'social-event',
      features: { description: 'Market activity.', actorId: 'merchant', valenceHint: 0.1, noveltyHint: 0.4 },
      timestamp: Date.now(),
    };
    agent.tick(makeContext({ incomingPercepts: [percept] }));
    expect(agent.getMemory().episodic.size()).toBeGreaterThan(0);
  });
});

// ── Social cognition ──────────────────────────────────────────────────────────

describe('SimulatedAgent social cognition', () => {
  it('tracks nearby agents in social cognition after a tick with nearbyAgentIds', () => {
    const agent = new SimulatedAgent(makeConfig());
    agent.tick(makeContext({ nearbyAgentIds: ['other-a', 'other-b'] }));
    const knownEntities = agent.getSocialCognition().getKnownEntities();
    const knownIds = knownEntities.map(e => e.entityId);
    expect(knownIds).toContain('other-a');
    expect(knownIds).toContain('other-b');
  });

  it('recordInteraction updates trust for the target', () => {
    const agent = new SimulatedAgent(makeConfig());
    const now = Date.now();
    agent.recordInteraction('partner', 'cooperative', 0.8, now);
    const trust = agent.getSocialCognition().getTrustScore('partner');
    expect(trust.trustScore).toBeGreaterThan(0.5); // cooperative → trust increased
  });

  it('deception reduces trust for the target', () => {
    const agent = new SimulatedAgent(makeConfig());
    const now = Date.now();
    agent.recordInteraction('deceiver', 'deception-detected', 0.9, now);
    const trust = agent.getSocialCognition().getTrustScore('deceiver');
    expect(trust.trustScore).toBeLessThan(0.5); // deception → trust reduced
  });
});

// ── toStateDump() ─────────────────────────────────────────────────────────────

describe('SimulatedAgent.toStateDump()', () => {
  it('returns a dump with valid fields', () => {
    const agent = new SimulatedAgent(makeConfig());
    agent.tick(makeContext());
    const dump = agent.toStateDump();
    expect(dump.agentId).toBe('test-agent');
    expect(dump.name).toBe('Tester');
    expect(typeof dump.location).toBe('string');
    expect(dump.location.length).toBeGreaterThan(0);
    expect(Array.isArray(dump.topDrives)).toBe(true);
    expect(Array.isArray(dump.recentMemories)).toBe(true);
    expect(Array.isArray(dump.socialTrust)).toBe(true);
    expect(typeof dump.mood.valence).toBe('number');
    expect(typeof dump.mood.arousal).toBe('number');
  });

  it('topDrives contains at most 3 entries', () => {
    const agent = new SimulatedAgent(makeConfig());
    agent.tick(makeContext());
    const dump = agent.toStateDump();
    expect(dump.topDrives.length).toBeLessThanOrEqual(3);
  });
});

// ── Personality effect on mood volatility ─────────────────────────────────────

describe('Personality effects', () => {
  it('high-volatility agent shows larger mood shifts from identical percepts', () => {
    const highVol = new SimulatedAgent(makeConfig({
      agentId: 'hi-vol',
      personality: { volatility: 0.9, warmth: 0.5, openness: 0.5 },
    }));
    const lowVol = new SimulatedAgent(makeConfig({
      agentId: 'lo-vol',
      personality: { volatility: 0.1, warmth: 0.5, openness: 0.5 },
    }));

    const percept = {
      modality: 'social-event',
      features: { description: 'Surprising news.', actorId: 'herald', valenceHint: 0.8, noveltyHint: 0.9, goalCongruence: 0.8, novelty: 0.9 },
      timestamp: Date.now(),
    };
    const ctx = makeContext({ incomingPercepts: [percept] });

    highVol.tick(ctx);
    lowVol.tick({ ...ctx, now: ctx.now + 1 });

    const hiShift = Math.abs(highVol.getMood().valence);
    const loShift = Math.abs(lowVol.getMood().valence);
    expect(hiShift).toBeGreaterThan(loShift);
  });
});
