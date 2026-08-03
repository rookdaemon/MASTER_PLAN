import { describe, expect, it } from 'vitest';
import { ConstraintAwareDeliberationEngine } from '../constraint-engine.js';
import { DefaultEthicalDeliberationEngine } from '../default-subsystems.js';

describe('ConstraintAwareDeliberationEngine deliberation record handoff', () => {
  it('drains each D4 record exactly once for semantic-memory persistence', () => {
    const engine = new ConstraintAwareDeliberationEngine(new DefaultEthicalDeliberationEngine());
    const store = engine.getDeliberationRecordStore();
    store.create(
      {
        id: 'entry-1',
        action: { type: 'bounded-action', parameters: {} },
        violation: {
          principleId: 'D4',
          severity: 'deliberate',
          reason: 'test deliberation',
          indicatorMatched: 'test',
        },
        doctrineContext: [],
        enqueuedAt: 1,
        expiresAt: 2,
      },
      {
        entryId: 'entry-1',
        score: 0.5,
        costAxis: -0.2,
        benefitAxis: 0.7,
        uncertaintyPenalty: 0,
        reasoning: 'bounded and reversible',
        secondPassWarning: null,
      },
      'proceed',
      'test record',
    );

    expect(engine.drainDeliberationRecords()).toHaveLength(1);
    expect(engine.drainDeliberationRecords()).toEqual([]);
    expect(store.getAll()).toEqual([]);
  });
});
