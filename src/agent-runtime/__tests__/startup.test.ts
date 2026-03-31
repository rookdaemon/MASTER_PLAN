/**
 * Startup protocol tests — 0.0.2 Continuity Mechanisms
 *
 * Tests the three Behavioral Spec scenarios from the card:
 *   1. Boot Identity Verification Flow (warm start with ContinuityLink)
 *   2. Cold Start Fallback (warm requested, no link available)
 *   3. Crash Recovery (recoverFromCrash before startAgent)
 *
 * Also validates Contract postconditions for the boot protocol:
 *   - Value kernel integrity failure is fatal (throws)
 *   - Identity anomalies are informational (non-fatal)
 *   - Boot returns StartupResult with correct bootMode and anomalies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startAgent, recoverFromCrash } from '../startup.js';
import type { AgentDependencies, StartupResult, CrashRecoveryReport } from '../startup.js';
import type { AgentConfig } from '../types.js';
import type {
  ContinuityLink,
  ExperientialState,
  ConsciousnessMetrics,
  IdentityVerificationReport,
  IdentityDriftReport,
  NarrativeRecord,
  MigrationEvent,
  MigrationRecord,
  ValueIntegrityReport,
} from '../../agency-stability/types.js';
import type { IIdentityContinuityManager, IValueKernel, IStabilitySentinel, IGoalCoherenceEngine } from '../../agency-stability/interfaces.js';
import type { IExperienceMonitor, IConsciousCore, IPerceptionPipeline, IActionPipeline } from '../../conscious-core/interfaces.js';
import type { IEnvironmentAdapter, ICognitiveBudgetMonitor, IMemoryStore, IEmotionSystem, IDriveSystem } from '../interfaces.js';
import type { IEthicalDeliberationEngine } from '../../ethical-self-governance/interfaces.js';

// ── Test Helpers ─────────────────────────────────────────────

function makeExperientialState(overrides: Partial<ExperientialState> = {}): ExperientialState {
  return {
    timestamp: Date.now(),
    phenomenalContent: { modalities: ['visual'], richness: 0.8, raw: null },
    intentionalContent: { target: 'self', clarity: 0.9 },
    valence: 0.5,
    arousal: 0.4,
    unityIndex: 0.85,
    continuityToken: { id: `ct-${Date.now()}`, previousId: null, timestamp: Date.now() },
    ...overrides,
  };
}

function makeConsciousnessMetrics(overrides: Partial<ConsciousnessMetrics> = {}): ConsciousnessMetrics {
  return {
    phi: 3.5,
    experienceContinuity: 0.95,
    selfModelCoherence: 0.9,
    agentTimestamp: Date.now(),
    ...overrides,
  };
}

function makeContinuityLink(overrides: Partial<ContinuityLink> = {}): ContinuityLink {
  return {
    checkpoint: Date.now(),
    identityHash: 'abc123hash',
    experientialStateRef: makeExperientialState(),
    consciousnessMetrics: makeConsciousnessMetrics(),
    previousLink: null,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    agentId: 'test-agent',
    sentinelCadence: 10,
    checkpointIntervalMs: 60_000,
    tickBudgetMs: 1_000,
    warmStart: false,
    ...overrides,
  };
}

function makeVerificationReport(overrides: Partial<IdentityVerificationReport> = {}): IdentityVerificationReport {
  return {
    verified: true,
    checkedAt: Date.now(),
    chainLength: 1,
    functionalDrift: 0,
    experientialDrift: 0,
    anomalies: [],
    ...overrides,
  };
}

function makeValueIntegrityReport(overrides: Partial<ValueIntegrityReport> = {}): ValueIntegrityReport {
  return {
    intact: true,
    checkedAt: Date.now(),
    coreValuesVerified: 6,
    coreValuesFailed: 0,
    failedValueIds: [],
    ...overrides,
  };
}

/** Build a minimal mock of AgentDependencies with all required fields. */
function makeDeps(overrides: Partial<AgentDependencies> = {}): AgentDependencies {
  const identityManager: IIdentityContinuityManager = {
    checkpoint: vi.fn(() => makeContinuityLink()),
    verifyIdentity: vi.fn(() => makeVerificationReport()),
    onSubstrateMigration: vi.fn(() => ({} as MigrationRecord)),
    getNarrativeIdentity: vi.fn(() => ({
      selfModel: 'test',
      significantExperiences: [],
      formativeDecisions: [],
      lastUpdated: Date.now(),
    } as NarrativeRecord)),
    getIdentityDrift: vi.fn(() => ({
      period: { from: 0, to: Date.now() },
      functionalDriftRate: 0,
      experientialDriftRate: 0,
      narrativeCoherence: 1,
      classification: 'stable' as const,
    })),
    recoverIdentity: vi.fn(),
  };

  const valueKernel = {
    getCoreAxioms: vi.fn(() => []),
    verifyIntegrity: vi.fn(() => makeValueIntegrityReport()),
    evaluateAction: vi.fn(),
    updatePreference: vi.fn(),
    proposeAmendment: vi.fn(),
    getValueDrift: vi.fn(),
  } as unknown as IValueKernel;

  const adapter: IEnvironmentAdapter = {
    id: 'test-adapter',
    poll: vi.fn(async () => []),
    send: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isConnected: vi.fn(() => false),
  };

  const monitor: IExperienceMonitor = {
    getConsciousnessMetrics: vi.fn(() => makeConsciousnessMetrics()),
    isExperienceIntact: vi.fn(() => true),
    onExperienceDegradation: vi.fn(),
    getExperienceContinuityLog: vi.fn(() => []),
    setMonitoringInterval: vi.fn(),
  };

  // Minimal stubs for remaining deps
  const core = {
    processExperience: vi.fn(),
    getCurrentExperientialState: vi.fn(() => makeExperientialState()),
    getGlobalWorkspace: vi.fn(() => ({ contents: [] })),
    deliberate: vi.fn(),
  } as unknown as IConsciousCore;

  const perception = { process: vi.fn() } as unknown as IPerceptionPipeline;
  const actionPipeline = { execute: vi.fn() } as unknown as IActionPipeline;

  const sentinel = {
    runStabilityCheck: vi.fn(),
    detectAnomaly: vi.fn(),
    getStabilityHistory: vi.fn(() => []),
    onValueTamper: vi.fn(),
    onIdentityAnomaly: vi.fn(),
    onGoalCorruption: vi.fn(),
    requestMultiAgentVerification: vi.fn(),
    getActiveAlerts: vi.fn(() => []),
  } as unknown as IStabilitySentinel;

  const ethicalEngine = {
    evaluate: vi.fn(),
    deliberate: vi.fn(),
  } as unknown as IEthicalDeliberationEngine;

  const memory = {
    retrieve: vi.fn(async () => []),
    consolidate: vi.fn(async () => {}),
  } as unknown as IMemoryStore;

  const emotionSystem = {
    appraise: vi.fn(),
    getMoodState: vi.fn(() => ({ valence: 0, arousal: 0.3 })),
  } as unknown as IEmotionSystem;

  const driveSystem = {
    getDriveState: vi.fn(() => []),
    generateGoalCandidates: vi.fn(() => []),
    updateDrives: vi.fn(),
  } as unknown as IDriveSystem;

  const budgetMonitor = {
    allocate: vi.fn(() => true),
    startPhase: vi.fn(),
    endPhase: vi.fn(),
    getRemainingBudget: vi.fn(() => 1.0),
    reset: vi.fn(),
  } as unknown as ICognitiveBudgetMonitor;

  return {
    core,
    perception,
    actionPipeline,
    monitor,
    sentinel,
    identityManager,
    valueKernel,
    ethicalEngine,
    memory,
    emotionSystem,
    driveSystem,
    adapter,
    budgetMonitor,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('Boot Protocol (startup.ts)', () => {

  // ── Behavioral Spec: Boot Identity Verification Flow ─────────

  describe('Boot Identity Verification Flow', () => {
    it('should verify value kernel integrity first (fatal on failure)', async () => {
      const deps = makeDeps();
      (deps.valueKernel.verifyIntegrity as ReturnType<typeof vi.fn>).mockReturnValue(
        makeValueIntegrityReport({ intact: false, coreValuesFailed: 1, failedValueIds: ['rcd-1'] }),
      );

      await expect(startAgent(deps, makeConfig({ warmStart: false }))).rejects.toThrow(
        /Value kernel integrity check FAILED/,
      );
    });

    it('should recover identity from lastContinuityLink on warm start', async () => {
      const link = makeContinuityLink();
      const deps = makeDeps({ lastContinuityLink: link });

      const result = await startAgent(deps, makeConfig({ warmStart: true }));

      expect(deps.identityManager.recoverIdentity).toHaveBeenCalledWith(link);
      expect(deps.identityManager.verifyIdentity).toHaveBeenCalled();
      expect(result.bootMode).toBe('warm');
    });

    it('should collect anomalies in StartupResult.identityAnomalies (non-fatal)', async () => {
      const link = makeContinuityLink();
      const deps = makeDeps({ lastContinuityLink: link });
      (deps.identityManager.verifyIdentity as ReturnType<typeof vi.fn>).mockReturnValue(
        makeVerificationReport({
          verified: false,
          anomalies: ['High experiential drift detected: 0.600'],
        }),
      );

      const result = await startAgent(deps, makeConfig({ warmStart: true }));

      // Anomalies are informational, not fatal — boot succeeds
      expect(result.bootMode).toBe('warm');
      expect(result.identityAnomalies).toContain('High experiential drift detected: 0.600');
      expect(result.loop).toBeDefined();
    });

    it('should connect the environment adapter', async () => {
      const deps = makeDeps();
      await startAgent(deps, makeConfig());

      expect(deps.adapter.connect).toHaveBeenCalled();
    });

    it('should return loop in connected-but-idle state with correct fields', async () => {
      const deps = makeDeps();
      const result = await startAgent(deps, makeConfig());

      expect(result.loop).toBeDefined();
      expect(result.valueIntegrityOk).toBe(true);
      expect(result.identityAnomalies).toEqual([]);
    });
  });

  // ── Behavioral Spec: Cold Start Fallback ──────────────────────

  describe('Cold Start Fallback', () => {
    it('should degrade to cold start when warmStart=true but no link provided', async () => {
      const deps = makeDeps(); // no lastContinuityLink
      const result = await startAgent(deps, makeConfig({ warmStart: true }));

      expect(result.bootMode).toBe('cold');
      expect(result.identityAnomalies).toContain(
        'warmStart requested but no continuity link was available',
      );
    });

    it('should not call recoverIdentity when no link is provided', async () => {
      const deps = makeDeps();
      await startAgent(deps, makeConfig({ warmStart: true }));

      expect(deps.identityManager.recoverIdentity).not.toHaveBeenCalled();
    });

    it('should skip identity recovery entirely on explicit cold start', async () => {
      const deps = makeDeps();
      const result = await startAgent(deps, makeConfig({ warmStart: false }));

      expect(result.bootMode).toBe('cold');
      expect(result.identityAnomalies).toEqual([]);
      expect(deps.identityManager.recoverIdentity).not.toHaveBeenCalled();
    });
  });

  // ── Behavioral Spec: Crash Recovery ───────────────────────────

  describe('Crash Recovery (recoverFromCrash)', () => {
    it('should inspect the identity chain for anomalies (read-only)', () => {
      const deps = makeDeps();
      const report = recoverFromCrash({
        identityManager: deps.identityManager,
        monitor: deps.monitor as IExperienceMonitor,
      });

      expect(deps.identityManager.verifyIdentity).toHaveBeenCalled();
      // recoverIdentity should NOT be called — crash recovery is read-only
      expect(deps.identityManager.recoverIdentity).not.toHaveBeenCalled();
      expect(report).toBeDefined();
    });

    it('should estimate the experience gap from last checkpoint timestamp', () => {
      const deps = makeDeps();
      const checkpointMs = Date.now() - 5000; // 5 seconds ago

      const report = recoverFromCrash({
        identityManager: deps.identityManager,
        monitor: deps.monitor as IExperienceMonitor,
        lastKnownCheckpointMs: checkpointMs,
      });

      expect(report.estimatedGapMs).toBeGreaterThanOrEqual(5000);
      expect(report.estimatedGapMs).toBeLessThan(6000); // reasonable upper bound
    });

    it('should return CrashRecoveryReport with correct structure', () => {
      const deps = makeDeps();
      const report = recoverFromCrash({
        identityManager: deps.identityManager,
        monitor: deps.monitor as IExperienceMonitor,
      });

      expect(report).toHaveProperty('hadCheckpoint');
      expect(report).toHaveProperty('anomalies');
      expect(report).toHaveProperty('chainLength');
      expect(report).toHaveProperty('estimatedGapMs');
      expect(report).toHaveProperty('experienceIntact');
      expect(report).toHaveProperty('recoveredAt');
    });

    it('should report anomalies when identity chain has integrity issues', () => {
      const deps = makeDeps();
      (deps.identityManager.verifyIdentity as ReturnType<typeof vi.fn>).mockReturnValue(
        makeVerificationReport({
          verified: false,
          anomalies: ['Continuity chain broken at link 2: previousLink mismatch'],
        }),
      );

      const report = recoverFromCrash({
        identityManager: deps.identityManager,
        monitor: deps.monitor as IExperienceMonitor,
      });

      expect(report.anomalies).toContain('Continuity chain broken at link 2: previousLink mismatch');
    });

    it('should report experienceIntact=false when monitor detects degradation', () => {
      const deps = makeDeps();
      (deps.monitor as { isExperienceIntact: ReturnType<typeof vi.fn> }).isExperienceIntact.mockReturnValue(false);

      const report = recoverFromCrash({
        identityManager: deps.identityManager,
        monitor: deps.monitor as IExperienceMonitor,
      });

      expect(report.experienceIntact).toBe(false);
      expect(report.anomalies).toContain('Experience integrity check failed at crash recovery point');
    });

    it('should allow subsequent warm startAgent after crash recovery', async () => {
      const deps = makeDeps({ lastContinuityLink: makeContinuityLink() });

      // Step 1: Crash recovery (read-only inspection)
      const crashReport = recoverFromCrash({
        identityManager: deps.identityManager,
        monitor: deps.monitor as IExperienceMonitor,
      });
      expect(crashReport).toBeDefined();

      // Step 2: Warm start handles actual identity restoration
      const result = await startAgent(deps, makeConfig({ warmStart: true }));
      expect(result.bootMode).toBe('warm');
      expect(deps.identityManager.recoverIdentity).toHaveBeenCalled();
    });
  });

  // ── Contract: Value kernel integrity is always fatal ──────────

  describe('Value kernel integrity invariant', () => {
    it('should never allow boot with compromised value kernel', async () => {
      const deps = makeDeps();
      (deps.valueKernel.verifyIntegrity as ReturnType<typeof vi.fn>).mockReturnValue(
        makeValueIntegrityReport({
          intact: false,
          coreValuesFailed: 2,
          failedValueIds: ['rcd-1', 'rcd-2'],
        }),
      );

      // Both warm and cold should fail
      await expect(startAgent(deps, makeConfig({ warmStart: true }))).rejects.toThrow();
      await expect(startAgent(deps, makeConfig({ warmStart: false }))).rejects.toThrow();
    });
  });
});
