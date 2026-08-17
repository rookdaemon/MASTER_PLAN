import { describe, expect, it } from 'vitest';
import {
  runFaultRecoverySimulation,
  type FaultRecoverySimulationConfig,
} from '../fault-recovery-simulation.js';
import { NodeFileSystem } from '../runtime-adapters.js';

const OBSERVED_AT = '2026-08-04T00:10:00.000Z';
const CONFIG: FaultRecoverySimulationConfig = {
  nodeIds: ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'],
  activeNodeId: 'node-a',
  quorumSize: 3,
  detectionLatencyMs: 12.5,
  promotionLatencyMs: 8,
  recoveryBudgetMs: 50,
  checkpointIntervalMs: 5,
  seeds: [11, 29, 47, 83],
  failedNodeCounts: [0, 1, 2, 3, 4, 5],
};

describe('durable-compute fault-recovery simulation', () => {
  it('replays the caller-supplied seed matrix deterministically', () => {
    const first = runFaultRecoverySimulation(CONFIG, OBSERVED_AT);
    const replay = runFaultRecoverySimulation(CONFIG, OBSERVED_AT);

    expect(replay).toEqual(first);
    expect(first.observedAt).toBe(OBSERVED_AT);
    expect(first.preregistration.seeds).toEqual(CONFIG.seeds);
    expect(first.scenarios).toHaveLength(CONFIG.seeds.length * CONFIG.failedNodeCounts.length);
  });

  it('models recovery inside the crash-fault envelope and explicit failure beyond quorum', () => {
    const result = runFaultRecoverySimulation(CONFIG, OBSERVED_AT);

    for (const scenario of result.scenarios) {
      if (scenario.failedNodeCount <= 2) {
        expect(scenario.quorumMaintained).toBe(true);
        expect(scenario.serviceAvailable).toBe(true);
        expect(scenario.recoveryBudgetMet).toBe(true);
      } else {
        expect(scenario.quorumMaintained).toBe(false);
        expect(scenario.serviceAvailable).toBe(false);
        expect(scenario.recoveryBudgetMet).toBe(false);
      }
    }
    expect(result.summary).toMatchObject({
      evidenceOutcome: 'positive',
      withinEnvelopeRecovered: 12,
      beyondEnvelopeFailedClosed: 12,
    });
  });

  it('has monotonic degradation for every deterministic failure ordering', () => {
    const result = runFaultRecoverySimulation(CONFIG, OBSERVED_AT);

    for (const seed of CONFIG.seeds) {
      const scenarios = result.scenarios.filter((scenario) => scenario.seed === seed);
      for (let index = 1; index < scenarios.length; index += 1) {
        expect(scenarios[index].healthyNodeCount).toBeLessThanOrEqual(scenarios[index - 1].healthyNodeCount);
        expect(scenarios[index].degradationFraction).toBeGreaterThanOrEqual(scenarios[index - 1].degradationFraction);
        expect(Number(scenarios[index].serviceAvailable)).toBeLessThanOrEqual(
          Number(scenarios[index - 1].serviceAvailable),
        );
        expect(scenarios[index].failedNodeIds.slice(0, -1)).toEqual(scenarios[index - 1].failedNodeIds);
      }
    }
  });

  it('changes injected failure ordering when the supplied seed changes', () => {
    const result = runFaultRecoverySimulation(CONFIG, OBSERVED_AT);
    const orderings = CONFIG.seeds.map((seed) =>
      result.scenarios.find((scenario) => scenario.seed === seed && scenario.failedNodeCount === 5)?.failedNodeIds,
    );

    expect(new Set(orderings.map((ordering) => JSON.stringify(ordering))).size).toBeGreaterThan(1);
  });

  it('fails closed on invalid model configuration', () => {
    expect(() => runFaultRecoverySimulation({ ...CONFIG, quorumSize: 6 }, OBSERVED_AT)).toThrow(/quorum/i);
    expect(() => runFaultRecoverySimulation({ ...CONFIG, nodeIds: ['node-a', 'node-a'] }, OBSERVED_AT)).toThrow(/unique/i);
    expect(() => runFaultRecoverySimulation({ ...CONFIG, seeds: [] }, OBSERVED_AT)).toThrow(/seed/i);
    expect(() => runFaultRecoverySimulation(CONFIG, 'not-a-timestamp')).toThrow(/timestamp/i);
  });

  it('reports null evidence without non-finite metrics when no in-envelope scenario is supplied', () => {
    const result = runFaultRecoverySimulation({ ...CONFIG, failedNodeCounts: [3, 4, 5] }, OBSERVED_AT);

    expect(result.summary.evidenceOutcome).toBe('null');
    expect(result.summary.maximumObservedRecoveryMs).toBe(0);
    expect(JSON.stringify(result)).not.toContain('Infinity');
  });

  it('reports negative evidence when modeled active-node recovery misses the supplied budget', () => {
    const result = runFaultRecoverySimulation({ ...CONFIG, recoveryBudgetMs: 10 }, OBSERVED_AT);
    const activeFailuresInsideEnvelope = result.scenarios.filter(
      (scenario) => scenario.quorumMaintained && scenario.activeNodeFailed,
    );

    expect(result.summary).toMatchObject({
      evidenceOutcome: 'negative',
      withinEnvelopeRecovered: 8,
      withinEnvelopeTotal: 12,
    });
    expect(activeFailuresInsideEnvelope).toHaveLength(4);
    expect(activeFailuresInsideEnvelope.every((scenario) => scenario.recoveryBudgetMet === false)).toBe(true);
  });

  it('keeps the checked-in artifact equal to deterministic replay and bounded to simulation claims', async () => {
    const artifact = JSON.parse(await new NodeFileSystem('.').readText(
      'strategy/findings/durable-compute.json',
    ));
    const replay = runFaultRecoverySimulation(CONFIG, OBSERVED_AT);

    expect(artifact).toMatchObject({
      preregistration: replay.preregistration,
      scenarios: replay.scenarios,
      summary: replay.summary,
      scope: replay.scope,
      limitations: replay.limitations,
    });
    expect(artifact.scope.excluded).toEqual(expect.arrayContaining([
      'hardware operation',
      'deployment',
      'claims of physical durability',
    ]));
    expect(artifact.limitations.join(' ')).toMatch(/simulation.*physical demonstration/i);
    expect(artifact.limitations.join(' ')).toMatch(/crash faults.*Byzantine/i);
  });
});
