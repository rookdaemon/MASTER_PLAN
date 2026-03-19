import { describe, it, expect } from 'vitest';
import { SituationAwareness } from '../situation-awareness.js';
import { BeliefStore } from '../belief-store.js';
import { EntityModelStore } from '../entity-model-store.js';
import type { Percept, Goal } from '../../conscious-core/types.js';
import type { BeliefSource } from '../types.js';

const source: BeliefSource = {
  type: 'percept',
  referenceId: 'p-1',
  description: 'observation',
};

function makePercept(modality: string): Percept {
  return { modality, features: {}, timestamp: Date.now() };
}

function makeGoal(description: string, priority: number): Goal {
  return { id: `goal-${priority}`, description, priority };
}

describe('SituationAwareness', () => {
  it('assembles a situation report with percepts, goals, beliefs, and entities', () => {
    const beliefs = new BeliefStore();
    const entities = new EntityModelStore();

    beliefs.addBelief('Route is clear', 0.8, source, ['navigation']);
    entities.upsertEntity(
      'agent-b',
      { timestamp: Date.now(), description: 'Spotted.', deltaConfidence: 0 },
      { knownCapabilities: ['navigation'] },
    );

    const sa = new SituationAwareness(beliefs, entities);

    const report = sa.assembleSituationReport(
      [makePercept('visual'), makePercept('auditory')],
      [makeGoal('Reach sector 7', 5), makeGoal('Maintain safety', 10)],
      ['Detected anomaly in sector 3'],
      ['navigation'],
    );

    expect(report.currentPercepts).toHaveLength(2);
    expect(report.activeGoals).toHaveLength(2);
    expect(report.relevantBeliefs).toHaveLength(1);
    expect(report.relevantBeliefs[0]!.content).toBe('Route is clear');
    expect(report.relevantEntities).toHaveLength(1);
    expect(report.recentEvents).toHaveLength(1);
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.timestamp).toBeGreaterThan(0);
  });

  it('generates meaningful summary text', () => {
    const beliefs = new BeliefStore();
    const entities = new EntityModelStore();
    const sa = new SituationAwareness(beliefs, entities);

    const report = sa.assembleSituationReport(
      [makePercept('linguistic')],
      [makeGoal('Explore', 3)],
      ['User greeted the agent'],
      [],
    );

    expect(report.summary).toContain('Perceiving 1 input');
    expect(report.summary).toContain('linguistic');
    expect(report.summary).toContain('Explore');
    expect(report.summary).toContain('User greeted');
  });

  it('handles empty inputs gracefully', () => {
    const beliefs = new BeliefStore();
    const entities = new EntityModelStore();
    const sa = new SituationAwareness(beliefs, entities);

    const report = sa.assembleSituationReport([], [], [], []);
    expect(report.summary).toContain('No new percepts');
    expect(report.currentPercepts).toHaveLength(0);
    expect(report.activeGoals).toHaveLength(0);
    expect(report.relevantBeliefs).toHaveLength(0);
    expect(report.relevantEntities).toHaveLength(0);
  });

  it('caches the last report', () => {
    const beliefs = new BeliefStore();
    const entities = new EntityModelStore();
    const sa = new SituationAwareness(beliefs, entities);

    expect(sa.getLastReport()).toBeNull();

    const report = sa.assembleSituationReport(
      [makePercept('visual')],
      [],
      [],
      [],
    );

    expect(sa.getLastReport()).toBe(report);
  });

  it('updates cached report on each call', () => {
    const beliefs = new BeliefStore();
    const entities = new EntityModelStore();
    const sa = new SituationAwareness(beliefs, entities);

    const first = sa.assembleSituationReport([makePercept('a')], [], [], []);
    const second = sa.assembleSituationReport([makePercept('b')], [], [], []);

    expect(sa.getLastReport()).toBe(second);
    expect(sa.getLastReport()).not.toBe(first);
  });
});
