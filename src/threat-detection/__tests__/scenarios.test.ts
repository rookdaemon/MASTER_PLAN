/**
 * Tests for the bundled example scenarios
 *
 * Verifies that each scenario:
 * - Has a non-empty name, description, and timeline
 * - Produces the expected number of assessments when run
 * - Escalates to a tier at or above YELLOW by the end
 * - Has strictly non-decreasing timestamps across the timeline
 * - Produces causal predictions for every event
 */

import { describe, it, expect } from 'vitest';

import { DefaultThreatDetectionEngine } from '../threat-detection-engine.js';
import { DefaultScenarioRunner } from '../scenario-runner.js';
import { DegradationTier } from '../types.js';
import { asteroidImpactScenario } from '../scenarios/asteroid-impact.js';
import { infrastructureFailureScenario } from '../scenarios/infrastructure-failure.js';
import { cascadingDegradationScenario } from '../scenarios/cascading-degradation.js';

// ── Tier ordering helper ──────────────────────────────────────────────────────

const TIER_ORDER = [
  DegradationTier.Green,
  DegradationTier.Yellow,
  DegradationTier.Orange,
  DegradationTier.Red,
  DegradationTier.Black,
];

function tierIndex(tier: DegradationTier): number {
  return TIER_ORDER.indexOf(tier);
}

// ── Runner factory ────────────────────────────────────────────────────────────

function makeRunner() {
  const engine = new DefaultThreatDetectionEngine();
  return new DefaultScenarioRunner(engine);
}

// ── Shared scenario spec ──────────────────────────────────────────────────────

function describeScenario(name: string, getScenario: () => import('../types.js').ThreatScenario, expectedEventCount: number) {
  describe(name, () => {
    it('has a non-empty name and description', () => {
      const s = getScenario();
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    });

    it(`has exactly ${expectedEventCount} timeline events`, () => {
      const s = getScenario();
      expect(s.timeline).toHaveLength(expectedEventCount);
    });

    it('timeline events have monotonically non-decreasing timeOffsetMs', () => {
      const s = getScenario();
      const sorted = [...s.timeline].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
      sorted.forEach((event, i) => {
        if (i > 0) {
          expect(event.timeOffsetMs).toBeGreaterThanOrEqual(sorted[i - 1].timeOffsetMs);
        }
      });
    });

    it('produces the right number of assessments', () => {
      const runner = makeRunner();
      const result = runner.run(getScenario());
      expect(result.assessments).toHaveLength(expectedEventCount);
    });

    it('every assessment has a causal prediction', () => {
      const runner = makeRunner();
      const result = runner.run(getScenario());
      for (const a of result.assessments) {
        expect(a.causalPrediction).toBeDefined();
        expect(a.causalPrediction.consequent.length).toBeGreaterThan(0);
      }
    });

    it('final degradation tier is at or above YELLOW', () => {
      const runner = makeRunner();
      const result = runner.run(getScenario());
      expect(tierIndex(result.finalDegradationTier)).toBeGreaterThanOrEqual(
        tierIndex(DegradationTier.Yellow),
      );
    });

    it('all assessments have non-empty recommended responses', () => {
      const runner = makeRunner();
      const result = runner.run(getScenario());
      for (const a of result.assessments) {
        expect(a.recommendedResponse.length).toBeGreaterThan(0);
      }
    });

    it('all observations have unique IDs within the scenario', () => {
      const s = getScenario();
      const ids = s.timeline.map((e) => e.observation.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });
}

// ── Scenario-specific tests ───────────────────────────────────────────────────

describeScenario('asteroidImpactScenario', () => asteroidImpactScenario, 6);
describeScenario('infrastructureFailureScenario', () => infrastructureFailureScenario, 6);
describeScenario('cascadingDegradationScenario', () => cascadingDegradationScenario, 7);

describe('asteroidImpactScenario specifics', () => {
  it('first event has low severity (initial detection)', () => {
    const firstEvent = asteroidImpactScenario.timeline[0];
    expect(firstEvent.observation.severity).toBeLessThan(0.5);
  });

  it('final event is a cascading-failure category', () => {
    const last = asteroidImpactScenario.timeline[asteroidImpactScenario.timeline.length - 1];
    expect(last.observation.category).toBe('cascading-failure');
  });
});

describe('cascadingDegradationScenario specifics', () => {
  it('first event has zero severity (baseline)', () => {
    const first = cascadingDegradationScenario.timeline[0];
    expect(first.observation.severity).toBe(0);
  });

  it('final event has severity >= 0.9', () => {
    const last = cascadingDegradationScenario.timeline[cascadingDegradationScenario.timeline.length - 1];
    expect(last.observation.severity).toBeGreaterThanOrEqual(0.9);
  });

  it('reaches RED or BLACK tier by end', () => {
    const runner = makeRunner();
    const result = runner.run(cascadingDegradationScenario);
    expect(tierIndex(result.finalDegradationTier)).toBeGreaterThanOrEqual(
      tierIndex(DegradationTier.Red),
    );
  });
});
