/**
 * Autonomous Space Manufacturing — Types & Guards Tests
 * Tests Contract preconditions, postconditions, and invariants from card 0.4.1.3.
 */
import { describe, it, expect } from 'vitest';
import {
  // Constants (Threshold Registry)
  MIN_MATERIAL_PURITY,
  SOLAR_MARGIN,
  POWER_DEFICIT_THROTTLE_HOURS,
  MAX_CONSECUTIVE_FAILURES,
  QA_PASS_RATE_TARGET,
  VIBRATION_DAMPING_THRESHOLD,
  ECLIPSE_BRIDGE_CAPACITY,
  // Guards
  assertFeedstockAssayComplete,
  assertRefinedStockPurity,
  assertComponentDesignValid,
  assertQAManifestConsistency,
  assertValidatedForDownstream,
  assertSubsystemsOperational,
  assertNoEarthReagents,
  // Types
  type RefinedStock,
  type ComponentDesign,
  type QAManifest,
  type SubsystemTelemetry,
  type ProcessEvent,
  type SignedHash,
  type ToleranceSpec,
  type RadHardSpec,
  type FeedstockAssay,
} from '../types.js';

// --- Helpers ---

function makeSignedHash(): SignedHash {
  return { hash: 'abc123', algorithm: 'SHA-256', signerSubsystem: 'AQC' };
}

function makeTolerances(): ToleranceSpec {
  return { linearMm: 0.01, angularDeg: 0.5, surfaceRoughnessUm: 1.6 };
}

function makeRadHardSpec(): RadHardSpec {
  return { totalIonizingDoseKrad: 100, singleEventLatchupImmune: true };
}

function makeRefinedStock(overrides: Partial<RefinedStock> = {}): RefinedStock {
  return {
    materialId: 'mat-001',
    grade: 'SUBSTRATE',
    purity: MIN_MATERIAL_PURITY,
    quantityKg: 50,
    batchCertificate: makeSignedHash(),
    ...overrides,
  };
}

function makeComponentDesign(overrides: Partial<ComponentDesign> = {}): ComponentDesign {
  return {
    designId: 'des-001',
    revision: '1.0.0',
    geometrySpec: 'G28 G0 X0 Y0 Z0',
    materialRequirements: new Map([['feature-1', 'SUBSTRATE' as const]]),
    tolerances: makeTolerances(),
    radiationHardeningRequirements: makeRadHardSpec(),
    ...overrides,
  };
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

// ============================================================
// Threshold Registry — verify exact values from card
// ============================================================

describe('Threshold Registry constants', () => {
  it('MIN_MATERIAL_PURITY is 0.995', () => {
    expect(MIN_MATERIAL_PURITY).toBe(0.995);
  });

  it('SOLAR_MARGIN is 0.20', () => {
    expect(SOLAR_MARGIN).toBe(0.20);
  });

  it('POWER_DEFICIT_THROTTLE_HOURS is 2', () => {
    expect(POWER_DEFICIT_THROTTLE_HOURS).toBe(2);
  });

  it('MAX_CONSECUTIVE_FAILURES is 3', () => {
    expect(MAX_CONSECUTIVE_FAILURES).toBe(3);
  });

  it('QA_PASS_RATE_TARGET is 0.99', () => {
    expect(QA_PASS_RATE_TARGET).toBe(0.99);
  });

  it('VIBRATION_DAMPING_THRESHOLD is 0.001', () => {
    expect(VIBRATION_DAMPING_THRESHOLD).toBe(0.001);
  });

  it('ECLIPSE_BRIDGE_CAPACITY is 4', () => {
    expect(ECLIPSE_BRIDGE_CAPACITY).toBe(4);
  });
});

// ============================================================
// C1 precondition: FeedstockAssay completeness guard
// ============================================================

describe('assertFeedstockAssayComplete', () => {
  it('accepts assay where all contaminant elements ≥ 0.1% are in composition', () => {
    const assay: FeedstockAssay = {
      materialClass: 'METAL',
      composition: new Map([['Fe', 0.90], ['Ni', 0.05], ['S', 0.002]]),
      particleSize: { meanMicrons: 50, stdDevMicrons: 10 },
      contaminantFlags: [
        { element: 'S', massFraction: 0.002, exceedsThreshold: false },
      ],
    };
    expect(() => assertFeedstockAssayComplete(assay)).not.toThrow();
  });

  it('accepts assay with contaminant below 0.1% not in composition', () => {
    const assay: FeedstockAssay = {
      materialClass: 'METAL',
      composition: new Map([['Fe', 0.95], ['Ni', 0.04]]),
      particleSize: { meanMicrons: 50, stdDevMicrons: 10 },
      contaminantFlags: [
        { element: 'Pb', massFraction: 0.0005, exceedsThreshold: false },
      ],
    };
    // Pb is < 0.001 (0.1%), so not required in composition
    expect(() => assertFeedstockAssayComplete(assay)).not.toThrow();
  });

  it('rejects assay where contaminant ≥ 0.1% is missing from composition', () => {
    const assay: FeedstockAssay = {
      materialClass: 'METAL',
      composition: new Map([['Fe', 0.90], ['Ni', 0.05]]),
      particleSize: { meanMicrons: 50, stdDevMicrons: 10 },
      contaminantFlags: [
        { element: 'S', massFraction: 0.003, exceedsThreshold: true },
      ],
    };
    // S at 0.3% (≥ 0.1%) but missing from composition
    expect(() => assertFeedstockAssayComplete(assay)).toThrow(/S.*missing from composition/);
  });

  it('accepts assay with no contaminant flags', () => {
    const assay: FeedstockAssay = {
      materialClass: 'SILICATE',
      composition: new Map([['Si', 0.47], ['O', 0.53]]),
      particleSize: { meanMicrons: 30, stdDevMicrons: 5 },
      contaminantFlags: [],
    };
    expect(() => assertFeedstockAssayComplete(assay)).not.toThrow();
  });
});

// ============================================================
// C2 precondition: RefinedStock purity guard
// ============================================================

describe('assertRefinedStockPurity', () => {
  it('accepts stock at exactly MIN_MATERIAL_PURITY', () => {
    const stock = makeRefinedStock({ purity: MIN_MATERIAL_PURITY });
    expect(() => assertRefinedStockPurity(stock)).not.toThrow();
  });

  it('accepts stock above MIN_MATERIAL_PURITY', () => {
    const stock = makeRefinedStock({ purity: 0.999 });
    expect(() => assertRefinedStockPurity(stock)).not.toThrow();
  });

  it('rejects stock below MIN_MATERIAL_PURITY', () => {
    const stock = makeRefinedStock({ purity: 0.990 });
    expect(() => assertRefinedStockPurity(stock)).toThrow(/purity.*below MIN_MATERIAL_PURITY/);
  });
});

// ============================================================
// C2 precondition: ComponentDesign valid guard
// ============================================================

describe('assertComponentDesignValid', () => {
  it('accepts a valid design', () => {
    const design = makeComponentDesign();
    expect(() => assertComponentDesignValid(design)).not.toThrow();
  });

  it('rejects design with empty geometrySpec', () => {
    const design = makeComponentDesign({ geometrySpec: '' });
    expect(() => assertComponentDesignValid(design)).toThrow(/empty geometrySpec/);
  });

  it('rejects design with non-positive linear tolerance', () => {
    const design = makeComponentDesign({
      tolerances: { linearMm: 0, angularDeg: 0.5, surfaceRoughnessUm: 1.6 },
    });
    expect(() => assertComponentDesignValid(design)).toThrow(/non-positive linear tolerance/);
  });
});

// ============================================================
// C2 invariant: QAManifest consistency
// ============================================================

describe('assertQAManifestConsistency', () => {
  it('accepts PASS with feedsDownstream=true', () => {
    const manifest = makeQAManifest({ disposition: 'PASS', feedsDownstream: true });
    expect(() => assertQAManifestConsistency(manifest)).not.toThrow();
  });

  it('accepts FAIL with feedsDownstream=false', () => {
    const manifest = makeQAManifest({ disposition: 'FAIL', feedsDownstream: false });
    expect(() => assertQAManifestConsistency(manifest)).not.toThrow();
  });

  it('accepts REWORK with feedsDownstream=false', () => {
    const manifest = makeQAManifest({ disposition: 'REWORK', feedsDownstream: false });
    expect(() => assertQAManifestConsistency(manifest)).not.toThrow();
  });

  it('rejects PASS with feedsDownstream=false', () => {
    const manifest = makeQAManifest({ disposition: 'PASS', feedsDownstream: false });
    expect(() => assertQAManifestConsistency(manifest)).toThrow(/inconsistent/);
  });

  it('rejects FAIL with feedsDownstream=true', () => {
    const manifest = makeQAManifest({ disposition: 'FAIL', feedsDownstream: true });
    expect(() => assertQAManifestConsistency(manifest)).toThrow(/inconsistent/);
  });
});

// ============================================================
// C3 precondition: validated for downstream
// ============================================================

describe('assertValidatedForDownstream', () => {
  it('accepts PASS manifest with feedsDownstream=true', () => {
    const manifest = makeQAManifest({ disposition: 'PASS', feedsDownstream: true });
    expect(() => assertValidatedForDownstream(manifest)).not.toThrow();
  });

  it('rejects FAIL manifest', () => {
    const manifest = makeQAManifest({ disposition: 'FAIL', feedsDownstream: false });
    expect(() => assertValidatedForDownstream(manifest)).toThrow(/cannot feed downstream/);
  });

  it('rejects REWORK manifest', () => {
    const manifest = makeQAManifest({ disposition: 'REWORK', feedsDownstream: false });
    expect(() => assertValidatedForDownstream(manifest)).toThrow(/cannot feed downstream/);
  });
});

// ============================================================
// C4 precondition: subsystems operational
// ============================================================

describe('assertSubsystemsOperational', () => {
  it('accepts all OPERATIONAL subsystems', () => {
    const telemetry: SubsystemTelemetry[] = [
      { subsystem: 'ISRP', status: 'OPERATIONAL', timestamp: 1000 },
      { subsystem: 'MFM', status: 'OPERATIONAL', timestamp: 1000 },
      { subsystem: 'AQC', status: 'OPERATIONAL', timestamp: 1000 },
      { subsystem: 'PMS', status: 'OPERATIONAL', timestamp: 1000 },
    ];
    expect(() => assertSubsystemsOperational(telemetry)).not.toThrow();
  });

  it('accepts DEGRADED subsystems (still operable)', () => {
    const telemetry: SubsystemTelemetry[] = [
      { subsystem: 'MFM', status: 'DEGRADED', timestamp: 1000 },
    ];
    expect(() => assertSubsystemsOperational(telemetry)).not.toThrow();
  });

  it('rejects OFFLINE subsystem', () => {
    const telemetry: SubsystemTelemetry[] = [
      { subsystem: 'ISRP', status: 'OPERATIONAL', timestamp: 1000 },
      { subsystem: 'MFM', status: 'OFFLINE', timestamp: 1000 },
    ];
    expect(() => assertSubsystemsOperational(telemetry)).toThrow(/MFM is OFFLINE/);
  });
});

// ============================================================
// C1/C2 invariant: no Earth-sourced reagents
// ============================================================

describe('assertNoEarthReagents', () => {
  it('accepts process log with no Earth-sourced events', () => {
    const log: ProcessEvent[] = [
      { timestamp: 100, subsystem: 'ISRP', event: 'hydrogen_reduction_started' },
      { timestamp: 200, subsystem: 'ISRP', event: 'batch_certified' },
    ];
    expect(() => assertNoEarthReagents(log)).not.toThrow();
  });

  it('rejects process log containing Earth-sourced reagent', () => {
    const log: ProcessEvent[] = [
      { timestamp: 100, subsystem: 'ISRP', event: 'earth-sourced catalyst applied' },
    ];
    expect(() => assertNoEarthReagents(log)).toThrow(/Earth-sourced/);
  });
});
