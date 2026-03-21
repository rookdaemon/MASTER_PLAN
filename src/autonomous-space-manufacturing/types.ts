/**
 * Autonomous Space Manufacturing — Shared Types & Constants
 * Domain: 0.4.1.3
 *
 * Translates Contracts C1–C4 and Threshold Registry from card 0.4.1.3.
 */

// ============================================================
// Threshold Registry (from card 0.4.1.3)
// ============================================================

/** Minimum purity for manufacturing-grade refined stock (fraction 0–1). */
export const MIN_MATERIAL_PURITY = 0.995;

/** Solar array capacity margin above peak production draw (fraction). */
export const SOLAR_MARGIN = 0.20;

/** Hours of projected battery reserve below which CLCS throttles production. */
export const POWER_DEFICIT_THROTTLE_HOURS = 2;

/** Consecutive fabrication failures before quarantine and review flag. */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** Target first-pass yield for fabricated components (fraction 0–1). */
export const QA_PASS_RATE_TARGET = 0.99;

/** Maximum residual vibration on build platform during fabrication (g). */
export const VIBRATION_DAMPING_THRESHOLD = 0.001;

/** Battery reserve sized to bridge maximum eclipse duration at minimum production rate (hours). */
export const ECLIPSE_BRIDGE_CAPACITY = 4;

// ============================================================
// Enums & Literal Types
// ============================================================

export type MaterialClass = 'METAL' | 'SILICATE' | 'VOLATILE';

export type ManufacturingGrade =
  | 'STRUCTURAL'
  | 'SUBSTRATE'
  | 'DIELECTRIC'
  | 'CONDUCTOR';

export type Disposition = 'PASS' | 'FAIL' | 'REWORK';

export type InspectionMethod =
  | 'CT_SCAN'
  | 'OPTICAL_CMM'
  | 'ELECTRICAL_TEST'
  | 'THERMAL_CYCLE';

export type FabricationMode =
  | 'ADDITIVE_DED'
  | 'ADDITIVE_BINDER_JET'
  | 'SUBTRACTIVE_MILLING'
  | 'ASSEMBLY';

export type FailureMode =
  | 'MATERIAL_OFF_SPEC'
  | 'GEOMETRY_DRIFT'
  | 'POWER_BUDGET_EXCEEDED'
  | 'REPEATED_FAILURE';

export type RecalibrationPriority = 'IMMEDIATE' | 'SCHEDULED';

export type Subsystem = 'ISRP' | 'MFM' | 'AQC' | 'CLCS' | 'PMS';

export type SubsystemStatus = 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE';

// ============================================================
// C1 — Upstream Interface (from 0.4.1.2)
// ============================================================

export interface ContaminantReport {
  readonly element: string;
  readonly massFraction: number;
  readonly exceedsThreshold: boolean;
}

export interface SizeDistribution {
  readonly meanMicrons: number;
  readonly stdDevMicrons: number;
}

export interface FeedstockAssay {
  readonly materialClass: MaterialClass;
  readonly composition: ReadonlyMap<string, number>; // element → mass fraction
  readonly particleSize: SizeDistribution;
  readonly contaminantFlags: readonly ContaminantReport[];
}

export interface SignedHash {
  readonly hash: string;
  readonly algorithm: string;
  readonly signerSubsystem: Subsystem;
}

export interface RefinedStock {
  readonly materialId: string;          // UUID
  readonly grade: ManufacturingGrade;
  readonly purity: number;              // 0–1
  readonly quantityKg: number;
  readonly batchCertificate: SignedHash;
}

// ============================================================
// C2 — Internal Pipeline Interface (ISRP → MFM → AQC)
// ============================================================

export interface ToleranceSpec {
  readonly linearMm: number;
  readonly angularDeg: number;
  readonly surfaceRoughnessUm: number;
}

export interface RadHardSpec {
  readonly totalIonizingDoseKrad: number;
  readonly singleEventLatchupImmune: boolean;
}

export interface ComponentDesign {
  readonly designId: string;            // UUID
  readonly revision: string;            // semantic version
  readonly geometrySpec: string;        // GCode or STEP reference
  readonly materialRequirements: ReadonlyMap<string, ManufacturingGrade>; // featureId → grade
  readonly tolerances: ToleranceSpec;
  readonly radiationHardeningRequirements: RadHardSpec;
}

export interface ProcessEvent {
  readonly timestamp: number;           // epoch seconds
  readonly subsystem: Subsystem;
  readonly event: string;
  readonly details?: string;
}

export interface FabricatedPart {
  readonly partId: string;              // UUID
  readonly designId: string;            // UUID
  readonly materialId: string;          // traces to RefinedStock.materialId
  readonly fabricationTimestamp: number; // epoch seconds
  readonly processLog: readonly ProcessEvent[];
  readonly fabricationMode: FabricationMode;
}

export interface Measurement {
  readonly value: number;
  readonly unit: string;
}

export interface InspectionRecord {
  readonly method: InspectionMethod;
  readonly measuredValue: Measurement;
  readonly specValue: Measurement;
  readonly withinTolerance: boolean;
}

export interface QAManifest {
  readonly partId: string;              // UUID
  readonly disposition: Disposition;
  readonly inspectionResults: readonly InspectionRecord[];
  readonly validatorSignature: SignedHash;
  readonly feedsDownstream: boolean;    // true iff disposition === 'PASS'
}

// ============================================================
// C3 — Downstream Interface (to 0.4.1.4)
// ============================================================

export interface ValidatedComponent {
  readonly partId: string;
  readonly qaManifest: QAManifest;
  readonly traceabilityChain: TraceabilityChain;
}

export interface TraceabilityChain {
  readonly asteroidSampleId: string;
  readonly refinedBatchId: string;      // RefinedStock.materialId
  readonly fabricatedPartId: string;    // FabricatedPart.partId
  readonly qaPassTimestamp: number;     // epoch seconds
}

// ============================================================
// C4 — CLCS Orchestration Contract
// ============================================================

export interface ProductionOrder {
  readonly orderId: string;             // UUID
  readonly designId: string;
  readonly priority: 'CRITICAL' | 'NORMAL';
  readonly requestedTimestamp: number;   // epoch seconds
}

export interface CalibrationDelta {
  readonly parameter: string;
  readonly currentValue: number;
  readonly suggestedValue: number;
}

export interface RecalibrationOrder {
  readonly subsystem: 'MFM' | 'ISRP';
  readonly failureMode: FailureMode;
  readonly suggestedAdjustment: CalibrationDelta;
  readonly priority: RecalibrationPriority;
}

export interface SubsystemTelemetry {
  readonly subsystem: Subsystem;
  readonly status: SubsystemStatus;
  readonly timestamp: number;           // epoch seconds
}

export interface PowerBudget {
  readonly availableWatts: number;
  readonly allocations: ReadonlyMap<Subsystem, number>; // watts
  readonly storageKwh: number;
  readonly projectedDeficitHours: number;
}

// ============================================================
// Guard Functions — Contract Precondition Enforcement
// ============================================================

/**
 * C1 precondition: FeedstockAssay.composition covers all elements at mass fraction ≥ 0.1%.
 * Cross-checks contaminant flags: any element flagged at ≥ 0.001 mass fraction
 * must also appear in the composition map.
 */
export function assertFeedstockAssayComplete(assay: FeedstockAssay): void {
  for (const report of assay.contaminantFlags) {
    if (report.massFraction >= 0.001 && !assay.composition.has(report.element)) {
      throw new Error(
        `FeedstockAssay incomplete: element ${report.element} at ${report.massFraction} missing from composition`
      );
    }
  }
}

/**
 * C2 precondition: RefinedStock.purity ≥ MIN_MATERIAL_PURITY for manufacturing.
 */
export function assertRefinedStockPurity(stock: RefinedStock): void {
  if (stock.purity < MIN_MATERIAL_PURITY) {
    throw new Error(
      `RefinedStock ${stock.materialId} purity ${stock.purity} below MIN_MATERIAL_PURITY ${MIN_MATERIAL_PURITY}`
    );
  }
}

/**
 * C2 precondition: ComponentDesign has valid geometrySpec and tolerances.
 */
export function assertComponentDesignValid(design: ComponentDesign): void {
  if (!design.geometrySpec || design.geometrySpec.length === 0) {
    throw new Error(
      `ComponentDesign ${design.designId} has empty geometrySpec`
    );
  }
  if (design.tolerances.linearMm <= 0) {
    throw new Error(
      `ComponentDesign ${design.designId} has non-positive linear tolerance`
    );
  }
}

/**
 * C2 invariant: feedsDownstream must be true iff disposition is PASS.
 */
export function assertQAManifestConsistency(manifest: QAManifest): void {
  const shouldFeed = manifest.disposition === 'PASS';
  if (manifest.feedsDownstream !== shouldFeed) {
    throw new Error(
      `QAManifest ${manifest.partId}: feedsDownstream=${manifest.feedsDownstream} inconsistent with disposition=${manifest.disposition}`
    );
  }
}

/**
 * C3 precondition: Validated component has PASS disposition and feeds downstream.
 */
export function assertValidatedForDownstream(manifest: QAManifest): void {
  if (manifest.disposition !== 'PASS') {
    throw new Error(
      `QAManifest ${manifest.partId}: cannot feed downstream with disposition=${manifest.disposition}`
    );
  }
  if (!manifest.feedsDownstream) {
    throw new Error(
      `QAManifest ${manifest.partId}: feedsDownstream is false despite PASS disposition`
    );
  }
}

/**
 * C4 precondition: All subsystems report operational status.
 */
export function assertSubsystemsOperational(
  telemetry: readonly SubsystemTelemetry[]
): void {
  for (const t of telemetry) {
    if (t.status === 'OFFLINE') {
      throw new Error(
        `Subsystem ${t.subsystem} is OFFLINE — cannot dispatch production`
      );
    }
  }
}

/**
 * C1/C2 invariant: No Earth-sourced reagents in processing.
 * Validates that a process log contains no Earth-sourced events.
 */
export function assertNoEarthReagents(
  processLog: readonly ProcessEvent[]
): void {
  for (const event of processLog) {
    if (event.event.toLowerCase().includes('earth-sourced')) {
      throw new Error(
        `Process log contains Earth-sourced reagent at timestamp ${event.timestamp}: ${event.event}`
      );
    }
  }
}
