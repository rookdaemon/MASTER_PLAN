/**
 * Autonomous Space Manufacturing — CLCS (Closed-Loop Control System) Tests
 *
 * Tests Behavioral Spec scenarios and Contract C4 from card 0.4.1.3.
 * Red step: these tests define the required behavior before implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_CONSECUTIVE_FAILURES,
  POWER_DEFICIT_THROTTLE_HOURS,
  type QAManifest,
  type ProductionOrder,
  type RecalibrationOrder,
  type PowerBudget,
  type SubsystemTelemetry,
  type SignedHash,
  type FabricatedPart,
  type FailureMode,
} from '../types.js';
import {
  CLCSOrchestrator,
  type CLCSResult,
  type CLCSPowerAction,
} from '../clcs.js';

// --- Helpers ---

function makeSignedHash(signer: 'AQC' | 'ISRP' | 'MFM' = 'AQC'): SignedHash {
  return { hash: 'abc123', algorithm: 'SHA-256', signerSubsystem: signer };
}

function makeQAManifest(overrides: Partial<QAManifest> = {}): QAManifest {
  return {
    partId: 'part-001',
    disposition: 'PASS',
    inspectionResults: [],
    validatorSignature: makeSignedHash(),
    feedsDownstream: true,
    ...overrides,
  };
}

function makeProductionOrder(overrides: Partial<ProductionOrder> = {}): ProductionOrder {
  return {
    orderId: 'order-001',
    designId: 'des-001',
    priority: 'NORMAL',
    requestedTimestamp: 1000,
    ...overrides,
  };
}

function makeOperationalTelemetry(timestamp: number = 1000): SubsystemTelemetry[] {
  return [
    { subsystem: 'ISRP', status: 'OPERATIONAL', timestamp },
    { subsystem: 'MFM', status: 'OPERATIONAL', timestamp },
    { subsystem: 'AQC', status: 'OPERATIONAL', timestamp },
    { subsystem: 'PMS', status: 'OPERATIONAL', timestamp },
    { subsystem: 'CLCS', status: 'OPERATIONAL', timestamp },
  ];
}

function makePowerBudget(overrides: Partial<PowerBudget> = {}): PowerBudget {
  return {
    availableWatts: 10000,
    allocations: new Map([
      ['ISRP', 4000],
      ['MFM', 3000],
      ['AQC', 1000],
      ['CLCS', 500],
      ['PMS', 500],
    ]),
    storageKwh: 50,
    projectedDeficitHours: 10,
    ...overrides,
  };
}

// ============================================================
// Behavioral Spec Scenario 1:
// FAIL with GEOMETRY_DRIFT, consecutive < MAX_CONSECUTIVE_FAILURES
// → recalibrate MFM, re-queue order, recycle part to ISRP
// ============================================================

describe('CLCS Behavioral Spec — Scenario 1: FAIL with GEOMETRY_DRIFT below threshold', () => {
  let clcs: CLCSOrchestrator;

  beforeEach(() => {
    clcs = new CLCSOrchestrator();
  });

  it('issues RecalibrationOrder to MFM with priority SCHEDULED on GEOMETRY_DRIFT failure', () => {
    const order = makeProductionOrder({ designId: 'des-drift' });
    clcs.enqueueOrder(order);

    const manifest = makeQAManifest({
      partId: 'part-drift-1',
      disposition: 'FAIL',
      feedsDownstream: false,
    });

    const result = clcs.processQAManifest(manifest, 'GEOMETRY_DRIFT', 'des-drift', 2000);

    expect(result.recalibrationOrder).toBeDefined();
    expect(result.recalibrationOrder!.subsystem).toBe('MFM');
    expect(result.recalibrationOrder!.priority).toBe('SCHEDULED');
    expect(result.recalibrationOrder!.failureMode).toBe('GEOMETRY_DRIFT');
  });

  it('re-queues the ProductionOrder with updated parameters', () => {
    const order = makeProductionOrder({ designId: 'des-drift', orderId: 'order-drift' });
    clcs.enqueueOrder(order);

    const manifest = makeQAManifest({
      partId: 'part-drift-1',
      disposition: 'FAIL',
      feedsDownstream: false,
    });

    const result = clcs.processQAManifest(manifest, 'GEOMETRY_DRIFT', 'des-drift', 2000);

    expect(result.requeued).toBe(true);
    expect(result.requeuedOrderDesignId).toBe('des-drift');
  });

  it('marks the failed part for recycling back to ISRP', () => {
    const order = makeProductionOrder({ designId: 'des-drift' });
    clcs.enqueueOrder(order);

    const manifest = makeQAManifest({
      partId: 'part-drift-1',
      disposition: 'FAIL',
      feedsDownstream: false,
    });

    const result = clcs.processQAManifest(manifest, 'GEOMETRY_DRIFT', 'des-drift', 2000);

    expect(result.recycleToISRP).toBe(true);
  });
});

// ============================================================
// Behavioral Spec Scenario 2:
// FAIL with consecutive >= MAX_CONSECUTIVE_FAILURES
// → quarantine design, flag for review, continue queue
// ============================================================

describe('CLCS Behavioral Spec — Scenario 2: consecutive failures >= MAX_CONSECUTIVE_FAILURES', () => {
  let clcs: CLCSOrchestrator;

  beforeEach(() => {
    clcs = new CLCSOrchestrator();
  });

  it('quarantines design after MAX_CONSECUTIVE_FAILURES consecutive failures', () => {
    const designId = 'des-fragile';
    const order = makeProductionOrder({ designId });
    clcs.enqueueOrder(order);

    // Cause MAX_CONSECUTIVE_FAILURES failures
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      clcs.processQAManifest(
        makeQAManifest({
          partId: `part-fail-${i}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        'GEOMETRY_DRIFT',
        designId,
        2000 + i
      );
    }

    expect(clcs.isDesignQuarantined(designId)).toBe(true);
  });

  it('flags quarantined design for mission-parameter review', () => {
    const designId = 'des-fragile';
    const order = makeProductionOrder({ designId });
    clcs.enqueueOrder(order);

    let lastResult: CLCSResult | undefined;
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      lastResult = clcs.processQAManifest(
        makeQAManifest({
          partId: `part-fail-${i}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        'GEOMETRY_DRIFT',
        designId,
        2000 + i
      );
    }

    expect(lastResult!.designQuarantined).toBe(true);
    expect(lastResult!.flaggedForReview).toBe(true);
  });

  it('continues processing remaining production queue items after quarantine', () => {
    const designId = 'des-fragile';
    const otherDesignId = 'des-healthy';

    clcs.enqueueOrder(makeProductionOrder({ designId, orderId: 'order-fragile' }));
    clcs.enqueueOrder(makeProductionOrder({ designId: otherDesignId, orderId: 'order-healthy' }));

    // Cause quarantine
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      clcs.processQAManifest(
        makeQAManifest({
          partId: `part-fail-${i}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        'GEOMETRY_DRIFT',
        designId,
        2000 + i
      );
    }

    // The healthy design should still be in the queue
    const pendingOrders = clcs.getPendingOrders();
    const healthyOrders = pendingOrders.filter(o => o.designId === otherDesignId);
    expect(healthyOrders.length).toBe(1);
  });

  it('does not quarantine below MAX_CONSECUTIVE_FAILURES', () => {
    const designId = 'des-okay';
    clcs.enqueueOrder(makeProductionOrder({ designId }));

    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i++) {
      clcs.processQAManifest(
        makeQAManifest({
          partId: `part-fail-${i}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        'GEOMETRY_DRIFT',
        designId,
        2000 + i
      );
    }

    expect(clcs.isDesignQuarantined(designId)).toBe(false);
  });

  it('resets consecutive failure count on PASS', () => {
    const designId = 'des-recover';
    clcs.enqueueOrder(makeProductionOrder({ designId }));

    // Two failures
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i++) {
      clcs.processQAManifest(
        makeQAManifest({
          partId: `part-fail-${i}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        'GEOMETRY_DRIFT',
        designId,
        2000 + i
      );
    }

    // One pass resets
    clcs.processQAManifest(
      makeQAManifest({
        partId: 'part-pass',
        disposition: 'PASS',
        feedsDownstream: true,
      }),
      undefined,
      designId,
      3000
    );

    // Two more failures should not quarantine
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i++) {
      clcs.processQAManifest(
        makeQAManifest({
          partId: `part-fail-again-${i}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        'GEOMETRY_DRIFT',
        designId,
        2000 + i
      );
    }

    expect(clcs.isDesignQuarantined(designId)).toBe(false);
  });
});

// ============================================================
// Behavioral Spec Scenario 3:
// PMS reports projectedDeficitHours < POWER_DEFICIT_THROTTLE_HOURS
// → throttle production, prioritize ISRP, no stoppage unless 0
// ============================================================

describe('CLCS Behavioral Spec — Scenario 3: power deficit throttling', () => {
  let clcs: CLCSOrchestrator;

  beforeEach(() => {
    clcs = new CLCSOrchestrator();
  });

  it('throttles production when projectedDeficitHours < POWER_DEFICIT_THROTTLE_HOURS', () => {
    const powerBudget = makePowerBudget({
      projectedDeficitHours: POWER_DEFICIT_THROTTLE_HOURS - 0.5,
    });

    const action = clcs.evaluatePowerTelemetry(powerBudget);

    expect(action.throttled).toBe(true);
  });

  it('does not throttle when projectedDeficitHours >= POWER_DEFICIT_THROTTLE_HOURS', () => {
    const powerBudget = makePowerBudget({
      projectedDeficitHours: POWER_DEFICIT_THROTTLE_HOURS,
    });

    const action = clcs.evaluatePowerTelemetry(powerBudget);

    expect(action.throttled).toBe(false);
  });

  it('prioritizes ISRP thermal refining to peak-solar windows when throttled', () => {
    const powerBudget = makePowerBudget({
      projectedDeficitHours: POWER_DEFICIT_THROTTLE_HOURS - 1,
    });

    const action = clcs.evaluatePowerTelemetry(powerBudget);

    expect(action.isrpPrioritized).toBe(true);
  });

  it('does not stop production unless projectedDeficitHours reaches 0', () => {
    const almostEmpty = makePowerBudget({
      projectedDeficitHours: 0.1,
    });

    const action = clcs.evaluatePowerTelemetry(almostEmpty);

    expect(action.throttled).toBe(true);
    expect(action.productionStopped).toBe(false);
  });

  it('stops production when projectedDeficitHours reaches 0', () => {
    const empty = makePowerBudget({
      projectedDeficitHours: 0,
    });

    const action = clcs.evaluatePowerTelemetry(empty);

    expect(action.productionStopped).toBe(true);
  });
});

// ============================================================
// Contract C4 — CLCS Orchestration Contract
// ============================================================

describe('CLCS Contract C4 — Production Order dispatching', () => {
  let clcs: CLCSOrchestrator;

  beforeEach(() => {
    clcs = new CLCSOrchestrator();
  });

  it('accepts and enqueues a ProductionOrder', () => {
    const order = makeProductionOrder();
    clcs.enqueueOrder(order);

    expect(clcs.getPendingOrders()).toContainEqual(order);
  });

  it('does not dispatch orders for quarantined designs', () => {
    const designId = 'des-quarantined';

    // Force quarantine
    clcs.enqueueOrder(makeProductionOrder({ designId }));
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
      clcs.processQAManifest(
        makeQAManifest({
          partId: `part-q-${i}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        'GEOMETRY_DRIFT',
        designId,
        2000 + i
      );
    }

    // Enqueue another order for quarantined design
    clcs.enqueueOrder(makeProductionOrder({ designId, orderId: 'order-new' }));

    const dispatchable = clcs.getDispatchableOrders();
    const quarantinedOrders = dispatchable.filter(o => o.designId === designId);
    expect(quarantinedOrders.length).toBe(0);
  });

  it('handles REWORK disposition by re-queuing with same design', () => {
    const designId = 'des-rework';
    clcs.enqueueOrder(makeProductionOrder({ designId }));

    const result = clcs.processQAManifest(
      makeQAManifest({
        partId: 'part-rework-1',
        disposition: 'REWORK',
        feedsDownstream: false,
      }),
      undefined,
      designId,
      3000
    );

    expect(result.requeued).toBe(true);
    expect(result.requeuedOrderDesignId).toBe(designId);
  });

  it('does not re-queue on PASS disposition', () => {
    const designId = 'des-pass';
    clcs.enqueueOrder(makeProductionOrder({ designId }));

    const result = clcs.processQAManifest(
      makeQAManifest({
        partId: 'part-pass-1',
        disposition: 'PASS',
        feedsDownstream: true,
      }),
      undefined,
      designId,
      3000
    );

    expect(result.requeued).toBe(false);
  });
});

// ============================================================
// Contract C4 invariant: CLCS never requires human intervention
// for faults within the defined taxonomy
// ============================================================

describe('CLCS Contract C4 — autonomous fault handling', () => {
  let clcs: CLCSOrchestrator;

  beforeEach(() => {
    clcs = new CLCSOrchestrator();
  });

  const taxonomyFailures: Array<{ mode: FailureMode; expectedSubsystem: 'MFM' | 'ISRP' }> = [
    { mode: 'GEOMETRY_DRIFT', expectedSubsystem: 'MFM' },
    { mode: 'MATERIAL_OFF_SPEC', expectedSubsystem: 'ISRP' },
  ];

  for (const { mode, expectedSubsystem } of taxonomyFailures) {
    it(`handles ${mode} failure autonomously by routing recalibration to ${expectedSubsystem}`, () => {
      const designId = `des-${mode}`;
      clcs.enqueueOrder(makeProductionOrder({ designId }));

      const result = clcs.processQAManifest(
        makeQAManifest({
          partId: `part-${mode}`,
          disposition: 'FAIL',
          feedsDownstream: false,
        }),
        mode,
        designId,
        2000
      );

      expect(result.recalibrationOrder).toBeDefined();
      expect(result.recalibrationOrder!.subsystem).toBe(expectedSubsystem);
      expect(result.requiresHumanIntervention).toBe(false);
    });
  }

  it('handles POWER_BUDGET_EXCEEDED by throttling via PMS', () => {
    const designId = 'des-power';
    clcs.enqueueOrder(makeProductionOrder({ designId }));

    const result = clcs.processQAManifest(
      makeQAManifest({
        partId: 'part-power',
        disposition: 'FAIL',
        feedsDownstream: false,
      }),
      'POWER_BUDGET_EXCEEDED',
      designId,
      2000
    );

    expect(result.requiresHumanIntervention).toBe(false);
    expect(result.recycleToISRP).toBe(true);
  });
});
