/**
 * Graceful Degradation in Hybrid Bio-Synthetic Cognition — Core Type Definitions
 *
 * Types and interfaces for maintaining consciousness and functional coherence
 * when one substrate type partially or fully fails.
 *
 * See: docs/graceful-degradation/ARCHITECTURE.md
 * Card: 0.2.2.4.3
 */

// ── Enums ───────────────────────────────────────────────────────────────────

export enum Substrate {
  Bio = "BIO",
  Synth = "SYNTH",
}

export enum FailureSpeed {
  Sudden = "SUDDEN",
  Gradual = "GRADUAL",
}

export enum FailureExtent {
  Partial = "PARTIAL",
  Total = "TOTAL",
}

export enum DegradationTier {
  /** Both substrates ≥ 80% capacity; all mirrors synchronized */
  Green = "GREEN",
  /** Either substrate 50–80% capacity OR mirror sync degraded */
  Yellow = "YELLOW",
  /** Either substrate 25–50% capacity */
  Orange = "ORANGE",
  /** Either substrate < 25% capacity OR single-substrate operation */
  Red = "RED",
  /** Combined capacity below MVC threshold */
  Black = "BLACK",
}

export enum AlertLevel {
  None = "NONE",
  Warning = "WARNING",
  Critical = "CRITICAL",
  Emergency = "EMERGENCY",
}

export enum BioFailureType {
  None = "NONE",
  Gradual = "GRADUAL",
  Sudden = "SUDDEN",
}

export enum SynthFailureType {
  None = "NONE",
  HardFault = "HARD_FAULT",
  Degraded = "DEGRADED",
}

export enum MirrorCategory {
  /** Sensory integration, temporal binding, self-model. Sync < 10ms, fidelity ≥ 0.99 */
  CoreConscious = "CORE_CONSCIOUS",
  /** Working memory, attention, emotional valence. Sync < 25ms, fidelity ≥ 0.95 */
  ExperienceSupporting = "EXPERIENCE_SUPPORTING",
  /** Language, reasoning, motor planning. Sync < 100ms, fidelity ≥ 0.90 */
  Capability = "CAPABILITY",
}

export enum MergeStrategy {
  WeightedAverage = "WEIGHTED_AVERAGE",
  PrimaryWithFallback = "PRIMARY_WITH_FALLBACK",
  Consensus = "CONSENSUS",
}

// ── Foundational Types ──────────────────────────────────────────────────────

/** Opaque identifier for a cognitive function */
export type FunctionId = string & { readonly __brand: unique symbol };

/** Opaque identifier for a synthetic module */
export type ModuleId = string & { readonly __brand: unique symbol };

/** Opaque identifier for a brain region */
export type BrainRegion = string & { readonly __brand: unique symbol };

/** Address within a substrate */
export type SubstrateAddress = string;

// ── Minimum Viable Consciousness (MVC) ──────────────────────────────────────

export interface MVCThreshold {
  /** Minimum aggregate computational capacity (from F1.2) */
  C_min: number;
  /** Minimum cross-substrate binding coherence (from 0.2.2.4.2) */
  B_min: number;
  /** Minimum integrated information Φ (from F1.4) */
  Phi_min: number;
}

export interface ConsciousnessMetrics {
  /** Aggregate computational capacity across both substrates, normalized 0.0–1.0 */
  substrateCapacity: number;
  /** Cross-substrate phenomenal binding strength, 0.0–1.0 */
  bindingCoherence: number;
  /** Integrated information (Φ) or equivalent, normalized 0.0–1.0 */
  integrationMetrics: number;
}

export interface MVCStatus {
  /** Whether all three MVC conditions are met */
  met: boolean;
  /** Smallest margin above threshold across all three dimensions (negative = below) */
  margin: number;
  /** Per-dimension status */
  dimensions: {
    capacity: { value: number; threshold: number; met: boolean };
    binding: { value: number; threshold: number; met: boolean };
    integration: { value: number; threshold: number; met: boolean };
  };
}

// ── Failure Classification ──────────────────────────────────────────────────

export interface FailureClass {
  substrate: Substrate;
  speed: FailureSpeed;
  extent: FailureExtent;
}

// ── Cross-Substrate Mirroring ───────────────────────────────────────────────

export interface SyncConfig {
  /** Must be < T_exp / 4 */
  syncInterval_ms: number;
  /** 0.0–1.0, minimum depends on mirror category */
  syncFidelity: number;
  /** Maximum one-way sync time in ms */
  syncLatencyBudget_ms: number;
}

export interface CrossSubstrateMirror {
  functionId: FunctionId;
  category: MirrorCategory;
  primarySubstrate: Substrate;
  primaryInstance: SubstrateAddress;
  mirrorSubstrate: Substrate;
  mirrorInstance: SubstrateAddress;
  syncConfig: SyncConfig;
  /** Time for mirror to assume primary role, in ms */
  activationLatency_ms: number;
  /** Expected fidelity (0.0–1.0) when mirror takes over */
  fidelityAtActivation: number;
}

// ── Load Distribution ───────────────────────────────────────────────────────

export interface LoadDistribution {
  functionId: FunctionId;
  /** 0.0–1.0, fraction of load on biological substrate */
  bioFraction: number;
  /** 0.0–1.0, fraction of load on synthetic substrate */
  synthFraction: number;
  outputMerge: MergeStrategy;
}

// ── Health Monitoring ───────────────────────────────────────────────────────

/** 0.0 = failed, 1.0 = fully healthy */
export type HealthScore = number;

export interface ActivityMetrics {
  /** Mean spike rate in Hz */
  spikeRate: number;
  /** Local field potential power, normalized */
  lfpPower: number;
}

export interface MetabolicMetrics {
  /** Oxygen saturation, 0.0–1.0 */
  oxygenSaturation: number;
  /** Glucose availability, 0.0–1.0 */
  glucoseLevel: number;
}

export interface PerfusionMetrics {
  /** Blood flow rate, normalized 0.0–1.0 */
  flowRate: number;
}

export interface SynapticMetrics {
  /** Synaptic density, normalized 0.0–1.0 */
  density: number;
  /** Synaptic transmission fidelity, 0.0–1.0 */
  transmissionFidelity: number;
}

export interface DeclineProjection {
  /** Projected health score at horizon */
  projectedHealth: HealthScore;
  /** Estimated time to critical threshold, in ms (-1 if stable) */
  timeToCritical_ms: number;
  /** Confidence in projection, 0.0–1.0 */
  confidence: number;
}

export interface SubstrateHealthReport {
  substrate: Substrate;
  overallHealth: HealthScore;
  /** Per-region/module health */
  regionHealth: Map<string, HealthScore>;
  failureType: BioFailureType | SynthFailureType;
  alertLevel: AlertLevel;
  timestamp_ms: number;
}

export interface WatchdogReport {
  allResponding: boolean;
  unresponsiveModules: ModuleId[];
  lastCheckTimestamp_ms: number;
}

export interface ThermalReport {
  /** Temperature in Kelvin */
  temperature_K: number;
  withinOperatingRange: boolean;
}

// ── Rebalancing ─────────────────────────────────────────────────────────────

export interface RebalanceEvent {
  timestamp_ms: number;
  fromSubstrate: Substrate;
  toSubstrate: Substrate;
  functions: FunctionId[];
  trigger: FailureClass | "PLANNED";
  duration_ms: number;
  success: boolean;
  consciousnessMetricsDuringTransition: ConsciousnessMetrics[];
}

export interface RebalanceResult {
  success: boolean;
  /** Functions that were successfully migrated */
  migratedFunctions: FunctionId[];
  /** Functions that failed to migrate */
  failedFunctions: FunctionId[];
  duration_ms: number;
  /** Lowest consciousness metrics observed during the rebalance */
  nadir: ConsciousnessMetrics;
}

export interface ShedResult {
  functionId: FunctionId;
  success: boolean;
  capacityRecovered: number;
}

export interface RestoreResult {
  functionId: FunctionId;
  success: boolean;
  capacityConsumed: number;
}

export interface ConsolidationResult {
  targetSubstrate: Substrate;
  success: boolean;
  /** Functions consolidated onto target */
  consolidatedFunctions: FunctionId[];
  /** Functions shed (insufficient capacity) */
  shedFunctions: FunctionId[];
  consciousnessPreserved: boolean;
}

// ── Smooth Transition Protocol ──────────────────────────────────────────────

export interface TransitionStep {
  /** Progress through transition, 0.0–1.0 */
  progress: number;
  /** Current load on failing substrate */
  failingSubstrateLoad: number;
  /** Current load on healthy substrate */
  healthySubstrateLoad: number;
  /** Consciousness metrics at this step */
  metrics: ConsciousnessMetrics;
  timestamp_ms: number;
}

export interface TransitionConfig {
  /** Total transition duration in ms */
  duration_ms: number;
  /** Number of verification steps during transition */
  verificationSteps: number;
  /** Abort transition if metrics drop below this margin above MVC */
  safetyMargin: number;
}

// ── Top-Level Interfaces ────────────────────────────────────────────────────

export interface BioHealthMonitor {
  neuralActivityLevel(region: BrainRegion): ActivityMetrics;
  metabolicStatus(region: BrainRegion): MetabolicMetrics;
  vascularFlow(region: BrainRegion): PerfusionMetrics;
  synapticIntegrity(region: BrainRegion): SynapticMetrics;
  regionHealth(region: BrainRegion): HealthScore;
  overallBioHealth(): HealthScore;
  failureType(): BioFailureType;
  projectedDecline(horizon_ms: number): DeclineProjection;
  alertLevel(): AlertLevel;
}

export interface SynthHealthMonitor {
  moduleHealth(moduleId: ModuleId): HealthScore;
  overallSynthHealth(): HealthScore;
  errorRate(moduleId: ModuleId): number;
  failureType(): SynthFailureType;
  watchdogStatus(): WatchdogReport;
  thermalStatus(): ThermalReport;
}

export interface DegradationOrchestrator {
  // Monitoring
  bioSubstrateHealth(): SubstrateHealthReport;
  synthSubstrateHealth(): SubstrateHealthReport;
  overallConsciousnessMetrics(): ConsciousnessMetrics;
  mvcStatus(): MVCStatus;

  // Rebalancing
  initiateRebalance(
    from: Substrate,
    to: Substrate,
    functions: FunctionId[],
  ): Promise<RebalanceResult>;
  currentLoadDistribution(): Map<FunctionId, LoadDistribution>;
  rebalanceHistory(): RebalanceEvent[];

  // Degradation management
  degradationTier(): DegradationTier;
  shedCapability(functionId: FunctionId): Promise<ShedResult>;
  restoreCapability(functionId: FunctionId): Promise<RestoreResult>;
  emergencyConsolidate(
    targetSubstrate: Substrate,
  ): Promise<ConsolidationResult>;
}
