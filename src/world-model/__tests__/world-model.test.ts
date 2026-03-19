import { describe, it, expect } from 'vitest';
import { BeliefStore } from '../belief-store.js';
import { EntityModelStore } from '../entity-model-store.js';
import { CausalModel } from '../causal-model.js';
import { SituationAwareness } from '../situation-awareness.js';
import { WorldModel } from '../world-model.js';
import type { BeliefSource } from '../types.js';
import type { Percept, Goal } from '../../conscious-core/types.js';

const source: BeliefSource = {
  type: 'percept',
  referenceId: 'p-1',
  description: 'test observation',
};

describe('WorldModel facade', () => {
  function createWorldModel() {
    const beliefs = new BeliefStore();
    const entities = new EntityModelStore();
    const causal = new CausalModel();
    const situation = new SituationAwareness(beliefs, entities);
    return new WorldModel({ beliefs, entities, causal, situation });
  }

  it('exposes all four subsystems', () => {
    const wm = createWorldModel();
    expect(wm.beliefs).toBeDefined();
    expect(wm.entities).toBeDefined();
    expect(wm.causal).toBeDefined();
    expect(wm.situation).toBeDefined();
  });

  it('consistency check returns consistent when no contradictions', () => {
    const wm = createWorldModel();
    wm.beliefs.addBelief('A is true', 0.8, source, ['test']);
    wm.beliefs.addBelief('B is true', 0.7, source, ['test']);

    const report = wm.runConsistencyCheck();
    expect(report.overallConsistent).toBe(true);
    expect(report.contradictionsFound).toHaveLength(0);
    expect(report.timestamp).toBeGreaterThan(0);
  });

  it('consistency check detects contradictions', () => {
    const wm = createWorldModel();
    wm.beliefs.addBelief('The route is safe', 0.8, source, ['navigation']);
    wm.beliefs.addBelief('The route is not safe', 0.75, source, ['navigation']);

    const report = wm.runConsistencyCheck();
    expect(report.overallConsistent).toBe(false);
    expect(report.contradictionsFound.length).toBeGreaterThanOrEqual(1);
  });

  // ── End-to-end integration ──

  it('full cycle: add beliefs, entities, predict, assemble situation, check consistency', () => {
    const wm = createWorldModel();

    // Add beliefs
    wm.beliefs.addBelief('Sector 7 has resources', 0.9, source, ['resources']);
    wm.beliefs.addBelief('Path to sector 7 is clear', 0.7, source, ['navigation']);

    // Add entity
    wm.entities.upsertEntity(
      'agent-b',
      { timestamp: Date.now(), description: 'Allied agent spotted.', deltaConfidence: 0.1 },
      {
        trustLevel: 0.6,
        consciousnessStatus: {
          verdict: 'probable',
          evidenceBasis: 'behavioral indicators',
          metricsAvailable: false,
          treatAsConscious: true,
        },
      },
    );

    // Make causal prediction
    const pred = wm.causal.predict('move to sector 7', 0.7);
    expect(pred.consequent).toContain('destination');

    // Assemble situation report
    const percept: Percept = {
      modality: 'visual',
      features: { sector: 7 },
      timestamp: Date.now(),
    };
    const goal: Goal = {
      id: 'goal-1',
      description: 'Reach sector 7 for resources',
      priority: 8,
    };

    const report = wm.situation.assembleSituationReport(
      [percept],
      [goal],
      ['Detected resources in sector 7'],
      ['resources', 'navigation'],
    );

    expect(report.relevantBeliefs).toHaveLength(2);
    expect(report.summary.length).toBeGreaterThan(0);

    // Consistency check
    const consistency = wm.runConsistencyCheck();
    expect(consistency.overallConsistent).toBe(true);
  });

  it('belief revision flows through the facade', () => {
    const wm = createWorldModel();
    const id = wm.beliefs.addBelief('Hypothesis X', 0.5, source, ['science']);

    const revision = wm.beliefs.revise(id, 0.95, 'New experimental data');
    expect(revision.resolution).toBe('updated');
    expect(wm.beliefs.getBelief(id)!.confidence).toBe(0.95);
  });

  it('entity trust degradation flows through the facade', () => {
    const wm = createWorldModel();
    wm.entities.upsertEntity(
      'agent-c',
      { timestamp: Date.now(), description: 'Initial.', deltaConfidence: 0 },
      { trustLevel: 0.8 },
    );
    wm.entities.upsertEntity(
      'agent-c',
      { timestamp: Date.now(), description: 'Betrayal.', deltaConfidence: -0.5 },
      {},
    );
    expect(wm.entities.getEntity('agent-c')!.trustLevel).toBeCloseTo(0.3);
  });

  it('causal prediction error tracking flows through the facade', () => {
    const wm = createWorldModel();
    const pred = wm.causal.predict('wait patiently');
    wm.causal.recordOutcome(pred.id, 'Time passed and conditions changed.');
    const updated = wm.causal.getPrediction(pred.id)!;
    expect(updated.predictionError).not.toBeNull();
    expect(updated.observedOutcome).toBe('Time passed and conditions changed.');
  });
});
