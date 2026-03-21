/**
 * Autonomous Manufacturing Ecosystems — Core Type Definitions
 *
 * Types and interfaces for the five-layer closed-loop autonomous manufacturing
 * system defined in docs/autonomous-manufacturing-ecosystems/ARCHITECTURE.md
 *
 * Card: 0.3.2.1
 */

// ── Environment Abstractions ────────────────────────────────────────────────

/** Injectable clock abstraction — wraps Date.now() for testability (CLAUDE.md) */
export interface Clock {
  now(): number;
}

/** Injectable timer abstraction — wraps setTimeout for testability (CLAUDE.md) */
export interface Timer {
  schedule(callback: () => void, delayMs: number): void;
}

// ── Shared Primitives ───────────────────────────────────────────────────────

export interface MaterialSpec {
  materialId: string;
  /** Minimum purity fraction required (0.0–1.0) */
  minPurity: number;
  /** Quantity in kilograms */
  quantityKg: number;
}

export interface FeedstockSpec {
  feedstockId: string;
  /** Target purity fraction (0.0–1.0) */
  targetPurity: number;
  /** Required quantity in kilograms */
  quantityKg: number;
}

export interface ComponentDesign {
  designId: string;
  version: string;
  /** Bill of feedstocks required to fabricate one unit */
  feedstockRequirements: FeedstockSpec[];
  /** Whether this design is a fabricator (self-replicating unit) */
  isFabricatorDesign: boolean;
}

export interface BillOfMaterials {
  bomId: string;
  items: Array<{ design: ComponentDesign; quantity: number }>;
}

export interface Location {
  nodeId: string;
  coordinates?: { x: number; y: number; z: number };
}

// ── Layer 1: Resource Extraction ────────────────────────────────────────────

export interface SiteData {
  siteId: string;
  materialId: string;
  /** Estimated reserve in kilograms */
  estimatedReserveKg: number;
  /** Extraction rate in kg per day */
  extractionRateKgPerDay: number;
}

export interface YieldForecast {
  siteId: string;
  materialId: string;
  forecastedYieldKg: number;
  confidenceLevel: number;
}

export interface ExtractionStatus {
  active: boolean;
  currentOutputKgPerDay: number;
  activeSupplySources: string[];
  selfRepairInProgress: boolean;
}

export interface RawMaterialStream {
  materialId: string;
  flowRateKgPerDay: number;
  /** Purity fraction of extracted material */
  purity: number;
  sourceIds: string[];
}

export interface ResourceExtractor {
  extract(material: MaterialSpec): RawMaterialStream;
  status(): ExtractionStatus;
  estimateYield(site: SiteData): YieldForecast;
}

// ── Layer 2: Processing & Refining ──────────────────────────────────────────

export interface Sample {
  materialId: string;
  sampleId: string;
}

export interface PurityReport {
  sampleId: string;
  materialId: string;
  measuredPurity: number;
  meetsSpec: boolean;
}

export interface FeedstockStream {
  feedstockId: string;
  flowRateKgPerDay: number;
  purity: number;
}

export interface Refinery {
  process(raw: RawMaterialStream, spec: FeedstockSpec): FeedstockStream;
  purity(sample: Sample): PurityReport;
  adapt(newSpec: FeedstockSpec): void;
}

// ── Layer 3: Fabrication ────────────────────────────────────────────────────

export interface QualityReport {
  batchId: string;
  passCount: number;
  failCount: number;
  /** Overall pass fraction (0.0–1.0) */
  yieldFraction: number;
  defectCategories: string[];
}

export interface ComponentBatch {
  batchId: string;
  designId: string;
  quantity: number;
  producedAt: number;
}

export interface FabricatorSpec {
  modelId: string;
  capabilities: string[];
  throughputUnitsPerDay: number;
}

export interface Fabricator {
  produce(design: ComponentDesign, qty: number): ComponentBatch;
  verify(batch: ComponentBatch): QualityReport;
  selfReplicate(targetSpec: FabricatorSpec): Fabricator;
}

// ── Layer 4: Assembly & Integration ─────────────────────────────────────────

export interface System {
  systemId: string;
  components: ComponentBatch[];
  assembledAt: number;
}

export interface TestReport {
  systemId: string;
  passed: boolean;
  /** Functional substrate validation — required for conscious entity deployment */
  consciousnessSubstrateValidated: boolean;
  failureReasons: string[];
}

export interface InstallationRecord {
  systemId: string;
  location: Location;
  installedAt: number;
  success: boolean;
}

export interface Assembler {
  assemble(bom: BillOfMaterials): System;
  test(system: System): TestReport;
  install(system: System, location: Location): InstallationRecord;
}

// ── Layer 5: Recycling & End-of-Life ────────────────────────────────────────

export interface RecoveredMaterialStream {
  streamId: string;
  materials: Array<{ materialId: string; massKg: number; purity: number }>;
}

export interface SortedMaterials {
  streamId: string;
  /** Sorted by materialId */
  sorted: Array<{ materialId: string; massKg: number; purity: number }>;
}

export interface Recycler {
  disassemble(system: System): RecoveredMaterialStream;
  sort(stream: RecoveredMaterialStream): SortedMaterials;
  /** Feeds recovered materials back into Layer 1 inventory */
  reintroduce(materials: SortedMaterials): void;
}

// ── Control & Orchestration Layer ───────────────────────────────────────────

export interface DemandForecast {
  forecastId: string;
  /** Projected artificial mind population over planning horizon */
  projectedPopulation: number;
  /** Planning horizon in days */
  horizonDays: number;
  requiredBoms: BillOfMaterials[];
}

export interface ProductionPlan {
  planId: string;
  forecastId: string;
  phases: ProductionPhase[];
  createdAt: number;
}

export interface ProductionPhase {
  phaseId: string;
  description: string;
  targetCompletionDays: number;
  layerAllocations: LayerAllocation[];
}

export interface LayerAllocation {
  layer: 1 | 2 | 3 | 4 | 5;
  nodeIds: string[];
  taskDescription: string;
}

export interface ExecutionHandle {
  planId: string;
  startedAt: number;
  /** Returns current completion fraction (0.0–1.0) */
  progress(): number;
  /** Cancel the running plan */
  cancel(): void;
}

export interface DisruptionEvent {
  eventId: string;
  affectedNodeId: string;
  layer: 1 | 2 | 3 | 4 | 5;
  /** Estimated recovery time in hours */
  estimatedRecoveryHours: number;
}

export interface SystemHealthReport {
  timestamp: number;
  overallHealthFraction: number;
  layerHealth: Record<1 | 2 | 3 | 4 | 5, number>;
  activeDisruptions: DisruptionEvent[];
  /** Throughput as fraction of planned capacity */
  throughputFraction: number;
}

export interface ManufacturingOrchestrator {
  plan(demand: DemandForecast): ProductionPlan;
  execute(plan: ProductionPlan): ExecutionHandle;
  monitor(): SystemHealthReport;
  rebalance(event: DisruptionEvent): void;
}
