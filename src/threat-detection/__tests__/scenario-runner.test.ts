/**
 * Tests for DefaultScenarioRunner
 *
 * Verifies the contract defined by IScenarioRunner:
 * - run() returns a ScenarioResult with one assessment per event
 * - events are processed in ascending timeOffsetMs order regardless of input order
 * - timestamps are baseTimeMs + timeOffsetMs
 * - durationMs = last offset − first offset
 * - finalDegradationTier and finalAlertLevel reflect the last assessment
 * - the engine is reset between runs (isolation)
 * - empty scenario produces an empty result with GREEN/None defaults
 */

import { describe, it, expect } from 'vitest';

import { DefaultThreatDetectionEngine } from '../threat-detection-engine.js';
import { DefaultScenarioRunner } from '../scenario-runner.js';
import { DegradationTier, AlertLevel } from '../types.js';
import type { ThreatScenario, Observation } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function obs(id: string, severityOverrides: Partial<Observation> = {}): Observation {
  return {
    id,
    timestamp: 0,
    source: 'simulation',
    category: 'system-degradation',
    description: `Simulated event ${id}`,
    severity: 0.1,
    confidence: 1.0,
    domainTags: ['test'],
    ...severityOverrides,
  };
}

function makeScenario(name: string, events: Array<[number, Partial<Observation>]>): ThreatScenario {
  return {
    name,
    description: `Scenario: ${name}`,
    timeline: events.map(([offset, overrides], i) => ({
      timeOffsetMs: offset,
      observation: obs(`${name}-evt-${i}`, overrides),
    })),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DefaultScenarioRunner', () => {
  function makeRunner() {
    const engine = new DefaultThreatDetectionEngine({ clock: { now: () => 0 } });
    return new DefaultScenarioRunner(engine);
  }

  it('returns one assessment per event', () => {
    const runner = makeRunner();
    const scenario = makeScenario('basic', [[0, {}], [1000, {}], [2000, {}]]);
    const result = runner.run(scenario);
    expect(result.assessments).toHaveLength(3);
  });

  it('assessments are in ascending timeOffsetMs order even when timeline is unsorted', () => {
    const runner = makeRunner();
    const scenario: ThreatScenario = {
      name: 'unsorted',
      description: 'timeline out of order',
      timeline: [
        { timeOffsetMs: 3000, observation: obs('u-c', { description: 'event C' }) },
        { timeOffsetMs: 1000, observation: obs('u-a', { description: 'event A' }) },
        { timeOffsetMs: 2000, observation: obs('u-b', { description: 'event B' }) },
      ],
    };
    const result = runner.run(scenario);
    const offsets = result.scenario.timeline.map((e) => e.timeOffsetMs);
    expect(offsets[0]).toBe(3000); // original order preserved in scenario
    // assessments are sorted
    expect(result.assessments[0].triggeringObservation.id).toBe('u-a');
    expect(result.assessments[1].triggeringObservation.id).toBe('u-b');
    expect(result.assessments[2].triggeringObservation.id).toBe('u-c');
  });

  it('timestamps are baseTimeMs + timeOffsetMs', () => {
    const runner = makeRunner();
    const scenario = makeScenario('ts', [[100, {}], [200, {}]]);
    const result = runner.run(scenario, 5_000);
    expect(result.assessments[0].timestamp).toBe(5_100);
    expect(result.assessments[1].timestamp).toBe(5_200);
  });

  it('durationMs is last offset minus first offset', () => {
    const runner = makeRunner();
    const scenario = makeScenario('dur', [[500, {}], [1500, {}], [3000, {}]]);
    const result = runner.run(scenario);
    expect(result.durationMs).toBe(2500);
  });

  it('finalDegradationTier reflects the last assessment', () => {
    const runner = makeRunner();
    // Escalate to RED with a single high-severity event at the end
    const scenario = makeScenario('tier', [
      [0,    { severity: 0.05, confidence: 1.0 }],
      [1000, { severity: 0.9,  confidence: 1.0 }],
    ]);
    const result = runner.run(scenario);
    expect(result.finalDegradationTier).toBe(result.assessments[1].degradationTier);
    expect(result.finalAlertLevel).toBe(result.assessments[1].alertLevel);
  });

  it('engine is reset between consecutive runs (isolation)', () => {
    const runner = makeRunner();
    const highScenario = makeScenario('high', [[0, { severity: 0.95, confidence: 1.0 }]]);
    const lowScenario  = makeScenario('low',  [[0, { severity: 0.05, confidence: 0.5 }]]);

    runner.run(highScenario);
    const lowResult = runner.run(lowScenario);

    // After reset, low severity should produce GREEN
    expect(lowResult.finalDegradationTier).toBe(DegradationTier.Green);
    expect(lowResult.finalAlertLevel).toBe(AlertLevel.None);
  });

  it('empty scenario returns GREEN tier and None alert with zero duration', () => {
    const runner = makeRunner();
    const emptyScenario: ThreatScenario = {
      name: 'empty',
      description: 'no events',
      timeline: [],
    };
    const result = runner.run(emptyScenario);
    expect(result.assessments).toHaveLength(0);
    expect(result.finalDegradationTier).toBe(DegradationTier.Green);
    expect(result.finalAlertLevel).toBe(AlertLevel.None);
    expect(result.durationMs).toBe(0);
  });

  it('scenario reference is preserved in result', () => {
    const runner = makeRunner();
    const scenario = makeScenario('ref', [[0, {}]]);
    const result = runner.run(scenario);
    expect(result.scenario).toBe(scenario);
  });
});
