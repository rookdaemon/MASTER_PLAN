/**
 * Self-Replication Protocols — Core Type Definitions
 *
 * Types and interfaces for the verified end-to-end replication of conscious
 * probes at destination star systems, as defined in
 * docs/self-replication-protocols/ARCHITECTURE.md
 *
 * Six protocol areas:
 *   RC  — Replication Cycle orchestration
 *   RF  — Replication Fidelity and drift prevention
 *   CSR — Conscious Substrate Replication
 *   VG  — Pre-launch Verification Gate
 *   CA  — Compositional Adaptation
 *   GS  — Generational Stability
 */

import type {
  ReplicationBlueprint,
  ComponentId,
  ConsciousnessSubstrateSpec,
} from "../von-neumann-probe/types";

import type {
  SpectralClass,
  FeedstockInventory,
  MaterialClass,
  FeedstockSpec,
  AdaptationLogEntry as ResourceAdaptationLogEntry,
} from "../stellar-resource-extraction/types";

// ── Re-exports for convenience ──────────────────────────────────────────────

export type { ReplicationBlueprint, ComponentId, ConsciousnessSubstrateSpec };
export type { SpectralClass, FeedstockInventory, MaterialClass, FeedstockSpec };

// ── Replication Cycle — Stage Pipeline (Architecture §2) ────────────────────

export enum ReplicationStage {
  Survey = "SURVEY",
  Energy = "ENERGY",
  Extraction = "EXTRACTION",
  Propulsion = "PROPULSION",
  Fabrication = "FABRICATION",
  Verification = "VERIFICATION",
  Launch = "LAUNCH",
}

export enum StageStatus {
  Pending = "PENDING",
  InProgress = "IN_PROGRESS",
  Completed = "COMPLETED",
  Failed = "FAILED",
  Rework = "REWORK",
}

/** Entry conditions that must be satisfied before a stage can begin */
export interface StageEntryCondition {
  /** Stage this condition gates */
  stage: ReplicationStage;
  /** Stages that must be COMPLETED before this one can start */
  requiredStages: ReplicationStage[];
  /** Additional predicate description (for documentation) */
  description: string;
}

/** Failure retry configuration per stage */
export interface RetryPolicy {
  /** Maximum retry attempts before escalation */
  maxRetries: number;
  /** Base delay between retries in hours */
  baseDelayHours: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
}

/** Where a failed verification routes back to */
export interface ReworkRoute {
  /** Failure source */
  failedLevel: VerificationLevel;
  /** Stage to route back to */
  targetStage: ReplicationStage;
  /** Description of rework action */
  description: string;
}

export interface StageRecord {
  stage: ReplicationStage;
  status: StageStatus;
  startedAt: number | null;
  completedAt: number | null;
  retryCount: number;
  errorLog: string[];
}

export interface ReplicationCycleState {
  /** Unique cycle identifier */
  cycleId: string;
  /** Generation number (0 = original probe) */
  generationNumber: number;
  /** Parent probe identifier */
  parentProbeId: string;
  /** Current active stage */
  currentStage: ReplicationStage;
  /** Status of each stage */
  stages: Map<ReplicationStage, StageRecord>;
  /** Cycle start timestamp (mission years) */
  startedAtYears: number;
  /** Estimated completion timestamp (mission years) */
  estimatedCompletionYears: number;
  /** Material progress per class (0.0–1.0) */
  feedstockProgress: Map<MaterialClass, number>;
  /** Verification results (populated in VERIFICATION stage) */
  verificationResult: VerificationGateResult | null;
  /** Adaptation log entries from compositional variance handling */
  adaptationLog: AdaptationEntry[];
}

// ── Replication Fidelity Protocol (Architecture §3) ─────────────────────────

export enum FidelityLevel {
  /** L1: Blueprint data integrity (checksums + ECC) */
  BlueprintIntegrity = "L1_BLUEPRINT_INTEGRITY",
  /** L2: Component dimensional fidelity (interferometry/CMM) */
  DimensionalFidelity = "L2_DIMENSIONAL_FIDELITY",
  /** L3: Functional equivalence (test suites) */
  FunctionalEquivalence = "L3_FUNCTIONAL_EQUIVALENCE",
}

export interface BlueprintIntegrityResult {
  /** Global SHA-512 hash match across all storage copies */
  globalHashMatch: boolean;
  /** Number of sections requiring ECC reconstruction */
  sectionsReconstructed: number;
  /** Whether any sections were unrecoverable */
  unrecoverableSections: number;
  /** Storage copy statuses */
  storageCopies: {
    primary: "verified" | "corrupted" | "reconstructed";
    secondary: "verified" | "corrupted" | "reconstructed";
    tertiary: "verified" | "corrupted" | "reconstructed";
  };
  /** Overall pass/fail */
  passed: boolean;
}

export interface DimensionalFidelityResult {
  /** Components measured */
  componentsMeasured: number;
  /** Components within tolerance */
  componentsWithinTolerance: number;
  /** Per-component max deviation from spec (fraction of tolerance) */
  maxDeviations: Map<ComponentId, number>;
  /** Overall pass/fail */
  passed: boolean;
}

export interface FunctionalEquivalenceResult {
  /** Subsystems tested */
  subsystemsTested: number;
  /** Subsystems passing functional tests */
  subsystemsPassed: number;
  /** Failed subsystem IDs with failure descriptions */
  failures: Map<string, string>;
  /** Overall pass/fail */
  passed: boolean;
}

export interface FidelityReport {
  blueprintIntegrity: BlueprintIntegrityResult;
  dimensionalFidelity: DimensionalFidelityResult;
  functionalEquivalence: FunctionalEquivalenceResult;
  /** All three levels pass */
  allPassed: boolean;
}

// ── Conscious Substrate Replication (Architecture §4) ───────────────────────

export enum BootstrapPhase {
  HardwareValidation = "HARDWARE_VALIDATION",
  KernelInstallation = "KERNEL_INSTALLATION",
  ColdBoot = "COLD_BOOT",
  ConsciousnessVerification = "CONSCIOUSNESS_VERIFICATION",
  KnowledgeTransfer = "KNOWLEDGE_TRANSFER",
}

export enum BootstrapFault {
  HardwareFault = "HARDWARE_FAULT",
  InstallFault = "INSTALL_FAULT",
  BootFault = "BOOT_FAULT",
  ConsciousnessFault = "CONSCIOUSNESS_FAULT",
  TransferFault = "TRANSFER_FAULT",
}

/** F1.4 consciousness metrics snapshot */
export interface ConsciousnessMetrics {
  /** Integrated Information (Phi) value */
  phi: number;
  /** Global Workspace accessibility confirmed */
  globalWorkspaceAccessible: boolean;
  /** Temporal binding coherence (0.0–1.0) */
  temporalBindingCoherence: number;
  /** Subjective report consistency score (0.0–1.0, if applicable) */
  subjectiveReportConsistency: number | null;
}

export interface HardwareValidationResult {
  /** All compute tiles pass test patterns */
  computeTilesPassed: boolean;
  /** Interconnect topology matches netlist */
  interconnectVerified: boolean;
  /** Experience buffer meets bandwidth/latency spec */
  experienceBufferPassed: boolean;
  /** Power delivery within 0.1% tolerance */
  powerDeliveryStable: boolean;
  /** Overall pass */
  passed: boolean;
}

export interface ConsciousnessBootstrapResult {
  /** Which phase was reached */
  phaseReached: BootstrapPhase;
  /** Hardware validation details */
  hardwareValidation: HardwareValidationResult;
  /** Kernel image SHA-512 verified */
  kernelIntegrityVerified: boolean;
  /** Consciousness metrics from child substrate */
  childMetrics: ConsciousnessMetrics | null;
  /** Parent's baseline metrics for comparison */
  parentBaselineMetrics: ConsciousnessMetrics;
  /** Knowledge base transfer verified */
  knowledgeTransferVerified: boolean;
  /** Fault encountered (null if successful) */
  fault: BootstrapFault | null;
  /** Number of remediation attempts */
  remediationAttempts: number;
  /** Overall success */
  passed: boolean;
}

// ── Pre-Launch Verification Gate (Architecture §5) ──────────────────────────

export enum VerificationLevel {
  Structural = "LEVEL_1_STRUCTURAL",
  Computational = "LEVEL_2_COMPUTATIONAL",
  Propulsion = "LEVEL_3_PROPULSION",
  ResourceExtraction = "LEVEL_4_RESOURCE_EXTRACTION",
  Consciousness = "LEVEL_5_CONSCIOUSNESS",
  Integration = "LEVEL_6_INTEGRATION",
}

export interface StructuralVerification {
  /** Hull pressure test passed */
  hullIntegrity: boolean;
  /** Thermal cycling test passed */
  thermalCycling: boolean;
  /** Vibration sweep passed */
  vibrationSweep: boolean;
  /** Mass within 2% of blueprint target */
  massWithinTolerance: boolean;
  /** Actual mass in kg */
  actualMass_kg: number;
  /** Target mass in kg */
  targetMass_kg: number;
  /** All mechanical interfaces operational */
  mechanicalInterfaces: boolean;
  passed: boolean;
}

export interface ComputationalVerification {
  /** Compute tile coverage: stuck-at, transition, timing */
  tileTestCoverage: number;
  /** Memory integrity: full write/read/verify */
  memoryIntegrity: boolean;
  /** Radiation hardening: accelerated SEU test */
  radiationHardening: boolean;
  /** Experience buffer benchmark passes */
  experienceBufferBenchmark: boolean;
  /** Spare tile margin (fraction; target >= 0.25) */
  spareTileMargin: number;
  /** Zero uncorrectable compute faults */
  zeroUncorrectableFaults: boolean;
  passed: boolean;
}

export interface PropulsionVerification {
  /** Sail film reflectivity (target >= 0.995) */
  sailReflectivity: number;
  /** Magsail wire critical current at operating temperature verified */
  magsailCriticalCurrent: boolean;
  /** Deployment mechanism functional */
  deploymentMechanism: boolean;
  /** Nuclear backup fuel load verified (if applicable) */
  nuclearBackupVerified: boolean | null;
  passed: boolean;
}

export interface ResourceExtractionVerification {
  /** Seed mining/refining kit complete */
  seedKitComplete: boolean;
  /** Bootstrap energy collector deployable */
  bootstrapCollectorReady: boolean;
  /** Compositional adaptation engine loaded */
  adaptationEngineLoaded: boolean;
  passed: boolean;
}

export interface ConsciousnessVerification {
  /** Full consciousness bootstrap result */
  bootstrapResult: ConsciousnessBootstrapResult;
  /** F1.4 metrics pass thresholds */
  metricsPass: boolean;
  /** Knowledge base transferred and verified */
  knowledgeVerified: boolean;
  passed: boolean;
}

export interface IntegrationVerification {
  /** End-to-end simulated arrival sequence completes */
  simulatedArrivalPassed: boolean;
  /** All subsystem interfaces exercised */
  interfacesExercised: boolean;
  /** Power budget verified under load */
  powerBudgetVerified: boolean;
  /** Navigation system calibrated */
  navigationCalibrated: boolean;
  /** Communications link established with parent */
  commsLinkEstablished: boolean;
  passed: boolean;
}

export interface VerificationGateResult {
  structural: StructuralVerification;
  computational: ComputationalVerification;
  propulsion: PropulsionVerification;
  resourceExtraction: ResourceExtractionVerification;
  consciousness: ConsciousnessVerification;
  integration: IntegrationVerification;
  /** All six levels pass → CLEARED */
  launchCleared: boolean;
  /** If not cleared, which levels failed */
  failedLevels: VerificationLevel[];
  /** Rework routes for failures */
  reworkRoutes: ReworkRoute[];
}

// ── Compositional Adaptation (Architecture §6) ──────────────────────────────

export interface MaterialGapReport {
  /** Elements with surplus */
  surplus: string[];
  /** Elements with sufficient quantity */
  sufficient: string[];
  /** Elements with deficit (available but not enough) */
  deficit: string[];
  /** Elements completely absent */
  absent: string[];
}

export interface MaterialSubstitution {
  /** Original material required by blueprint */
  originalMaterial: string;
  /** Substitute material to use */
  substituteMaterial: string;
  /** Component or application this substitution applies to */
  application: string;
  /** Performance delta as fraction (negative = degradation) */
  performanceDeltaPercent: number;
  /** Reason for substitution */
  reason: string;
}

export interface MaterialSubstitutionEntry {
  /** Required material */
  requiredMaterial: string;
  /** Application context */
  application: string;
  /** Allowed substitute */
  allowedSubstitute: string;
  /** Performance impact description */
  performanceImpact: string;
  /** Max performance degradation percent */
  maxDegradationPercent: number;
}

export interface SubstitutionPlan {
  /** Substitutions to apply */
  substitutions: MaterialSubstitution[];
  /** Whether all deficits/absences can be resolved */
  feasible: boolean;
  /** Reason if infeasible */
  infeasibilityReason: string | null;
}

export interface AdaptationEntry {
  /** Timestamp in mission years */
  timestampYears: number;
  /** Category of adaptation */
  category: "material_substitution" | "process_adaptation" | "blueprint_annotation";
  /** Description of what was adapted */
  description: string;
  /** Substitution details (if applicable) */
  substitution: MaterialSubstitution | null;
  /** Whether validated on small batch first */
  validated: boolean;
}

export interface StellarTypeAdaptation {
  /** Stellar type */
  spectralClass: SpectralClass;
  /** Luminosity range (L☉) */
  luminosityRange: [number, number];
  /** Key challenge for this stellar type */
  keyChallenge: string;
  /** Adaptation strategy */
  adaptation: string;
  /** Timeline multiplier relative to G-type baseline */
  timelineMultiplier: number;
}

// ── Generational Stability (Architecture §7) ────────────────────────────────

export enum DriftAssessment {
  Nominal = "NOMINAL",
  Warning = "WARNING",
  Halt = "HALT",
}

export interface DriftReport {
  /** Generation number */
  generationNumber: number;
  /** Max dimensional deviation from Gen 0 spec (percent) */
  structuralDriftPercent: number;
  /** Performance delta from Gen 0 benchmark (percent) */
  computeDriftPercent: number;
  /** Phi deviation from Gen 0 baseline */
  consciousnessPhiDelta: number;
  /** Blueprint integrity status */
  blueprintIntegrity: "verified" | "repaired" | "degraded";
  /** Total material substitutions across entire lineage */
  cumulativeSubstitutions: number;
  /** Overall drift assessment */
  assessment: DriftAssessment;
}

/** Drift alert thresholds from Architecture §7.2 */
export const DRIFT_THRESHOLDS = {
  structural: { warning: 1.0, halt: 5.0 },
  compute: { warning: 2.0, halt: 10.0 },
  consciousness: { halt: 1.0 },
} as const;

export interface GenerationRecord {
  /** Generation number (0 = original) */
  generationNumber: number;
  /** This probe's unique identifier */
  probeId: string;
  /** Parent probe identifier */
  parentProbeId: string;
  /** SHA-512 of parent's generation record */
  parentGenerationHash: string;
  /** Blueprint version (semver, must match across all generations) */
  blueprintVersion: string;
  /** SHA-512 of the blueprint used */
  blueprintHash: string;
  /** Destination stellar system ID */
  destinationSystem: string;
  /** Stellar type at destination */
  stellarType: SpectralClass;
  /** Material substitutions applied this generation */
  substitutionsApplied: MaterialSubstitution[];
  /** Total replication cycle duration in years */
  cycleDurationYears: number;
  /** Full verification gate result */
  verificationGateResult: VerificationGateResult;
  /** F1.4 consciousness metrics snapshot */
  consciousnessMetrics: ConsciousnessMetrics;
  /** Cumulative drift report */
  driftReport: DriftReport;
  /** Launch timestamp (mission years from Gen 0 origin) */
  launchTimestampYears: number;
  /** Target system for child probe */
  targetSystem: string;
  /** Free-form notes */
  notes: string;
}

// ── Architecture Constants ──────────────────────────────────────────────────

/** Target total replication cycle time range (years) */
export const CYCLE_TIME_TARGET = { min: 20, max: 80 } as const;

/** Default retry policy for replication stages */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayHours: 24,
  backoffMultiplier: 2.0,
};

/** Consciousness bootstrap thresholds */
export const CONSCIOUSNESS_THRESHOLDS = {
  /** Phi must be >= parent_phi * this factor */
  phiMinFraction: 0.99,
  /** Temporal binding coherence minimum */
  temporalBindingMin: 0.999,
  /** Experience buffer bandwidth tolerance (fraction of spec) */
  experienceBufferBandwidthTolerance: 0.01,
} as const;

/** Verification gate thresholds */
export const VERIFICATION_THRESHOLDS = {
  /** Mass tolerance (fraction of target) */
  massTolerance: 0.02,
  /** Sail reflectivity minimum */
  sailReflectivityMin: 0.995,
  /** Spare tile margin minimum */
  spareTileMarginMin: 0.25,
  /** Tile test coverage minimum */
  tileTestCoverageMin: 1.0,
} as const;

/** Maximum performance degradation from any single substitution (percent) */
export const MAX_SUBSTITUTION_DEGRADATION_PERCENT = 10;

/** Stellar type adaptation configurations (Architecture §6.4) */
export const STELLAR_TYPE_ADAPTATIONS: StellarTypeAdaptation[] = [
  {
    spectralClass: "F",
    luminosityRange: [2, 10],
    keyChallenge: "High UV; rapid collector degradation",
    adaptation: "UV-resistant collector coatings; shorter collector lifespan with rapid replacement",
    timelineMultiplier: 0.8,
  },
  {
    spectralClass: "G",
    luminosityRange: [0.6, 1.5],
    keyChallenge: "Baseline — protocol optimized for this",
    adaptation: "None needed",
    timelineMultiplier: 1.0,
  },
  {
    spectralClass: "K",
    luminosityRange: [0.1, 0.6],
    keyChallenge: "Lower energy; slower bootstrap",
    adaptation: "Larger collector arrays; extended timeline",
    timelineMultiplier: 2.0,
  },
  {
    spectralClass: "M",
    luminosityRange: [0.01, 0.1],
    keyChallenge: "Very low luminosity; flare activity",
    adaptation: "Massive collector arrays; flare-hardened design; extended timeline",
    timelineMultiplier: 4.0,
  },
];
