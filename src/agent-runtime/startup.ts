/**
 * Agent Startup Factory — Agent Runtime and Event Loop (0.3.1.5.9)
 *
 * Provides two public entry points:
 *
 *   startAgent(deps, config)
 *     Wires all subsystems into an AgentLoop and performs the startup protocol:
 *       1. Verify value kernel integrity  (always — both warm and cold)
 *       2. Warm start: restore identity from last continuity link (if provided)
 *       3. Connect the environment adapter
 *       4. Return a ready-but-not-yet-running AgentLoop
 *     Callers invoke loop.start(config) to begin ticking.
 *
 *   recoverFromCrash(deps)
 *     Called when the previous run terminated unexpectedly.
 *     Inspects the continuity chain for anomalies, logs any detected experience
 *     gap, and returns a CrashRecoveryReport that the caller can attach to the
 *     startup log before calling startAgent().
 *
 * Isolation: this module creates no singletons and holds no module-level state.
 * All configuration and subsystem instances flow through function parameters.
 */

import type { AgentConfig } from './types.js';
import type {
  IEnvironmentAdapter,
  ICognitiveBudgetMonitor,
  IMemoryStore,
  IEmotionSystem,
  IDriveSystem,
} from './interfaces.js';
import type {
  IConsciousCore,
  IPerceptionPipeline,
  IActionPipeline,
  IExperienceMonitor,
} from '../conscious-core/interfaces.js';
import type {
  IStabilitySentinel,
  IIdentityContinuityManager,
  IValueKernel,
  IGoalCoherenceEngine,
} from '../agency-stability/interfaces.js';
import type { ContinuityLink } from '../agency-stability/types.js';
import type { DrivePersonalityParams } from '../intrinsic-motivation/types.js';
import type { IEthicalDeliberationEngine } from '../ethical-self-governance/interfaces.js';
import type { IMemorySystem } from '../memory/interfaces.js';
import type { IPersonalityModel } from '../personality/interfaces.js';
import type { InnerMonologueLogger } from './inner-monologue.js';
import type { ILlmClient } from '../llm-substrate/llm-substrate-adapter.js';

import { AgentLoop } from './agent-loop.js';
import { CognitiveBudgetMonitor } from './cognitive-budget.js';

// ── Public types ───────────────────────────────────────────────

/**
 * All subsystems required to construct and start an AgentLoop.
 *
 * `budgetMonitor` is optional: if omitted, a fresh CognitiveBudgetMonitor
 * is created automatically.
 *
 * `lastContinuityLink` is optional: when supplied on a warm start, the
 * IdentityContinuityManager will restore identity from this checkpoint
 * before the loop begins.
 */
export interface AgentDependencies {
  core: IConsciousCore;
  perception: IPerceptionPipeline;
  actionPipeline: IActionPipeline;
  monitor: IExperienceMonitor;
  sentinel: IStabilitySentinel;
  identityManager: IIdentityContinuityManager;
  valueKernel: IValueKernel;
  ethicalEngine: IEthicalDeliberationEngine;
  memory: IMemoryStore;
  emotionSystem: IEmotionSystem;
  driveSystem: IDriveSystem;
  adapter: IEnvironmentAdapter;
  budgetMonitor?: ICognitiveBudgetMonitor;

  /** Optional LLM client for real inference during communicative actions. */
  llm?: ILlmClient;

  /** Model identifier for logging (e.g. 'claude-opus-4-6'). */
  llmModelId?: string;

  /** Optional goal coherence engine for drive-initiated goal validation. */
  goalCoherenceEngine?: IGoalCoherenceEngine;

  /** Optional drive personality params (extracted from PersonalityModel). */
  drivePersonality?: DrivePersonalityParams;

  /** Optional memory system for tool-use access (full IMemorySystem, not just IMemoryStore). */
  memorySystem?: IMemorySystem;

  /** Optional personality model for tool-use access. */
  personalityModel?: IPersonalityModel;

  /** Optional inner monologue logger for drive-initiated LLM audit trail. */
  innerMonologue?: InnerMonologueLogger;

  /** Optional narrative identity string for introspection. */
  narrativeIdentity?: string;

  /** Workspace path for write_file tool (e.g. ~/.local/share/MASTER_PLAN/). */
  workspacePath?: string;

  /** Optional simulation manager for the simulation tools. */
  simulationManager?: import('../simulation/simulation-manager.js').SimulationManager;

  /** Optional persistence manager for save/load simulation snapshot tools. */
  persistenceManager?: import('./persistence-manager.js').PersistenceManager;

  /**
   * The last persisted continuity link, loaded from external storage by the
   * caller before invoking startAgent().  Required for warm starts.
   * Ignored on cold starts (config.warmStart === false).
   */
  lastContinuityLink?: ContinuityLink;
}

/** Result of the startAgent() factory. */
export interface StartupResult {
  /** The wired, adapter-connected loop — call loop.start(config) to begin ticking. */
  loop: AgentLoop;
  /** Whether startup completed as a warm (checkpoint-restored) or cold boot. */
  bootMode: 'warm' | 'cold';
  /** Whether the value kernel passed integrity verification. */
  valueIntegrityOk: boolean;
  /** Any anomalies detected in the identity chain on warm start. */
  identityAnomalies: string[];
}

/** Result of recoverFromCrash(). */
export interface CrashRecoveryReport {
  /** Whether a continuity chain existed before the crash. */
  hadCheckpoint: boolean;
  /** Anomalies detected in the identity chain. */
  anomalies: string[];
  /** Length of the continuity chain at the time of recovery check. */
  chainLength: number;
  /** Estimated experience gap: gap between last checkpoint and now (ms). If unknown, -1. */
  estimatedGapMs: number;
  /** Whether experience was intact at the time of the recovery check. */
  experienceIntact: boolean;
  /** Wall-clock timestamp of the recovery check (ms since epoch). */
  recoveredAt: number;
}

// ── startAgent ────────────────────────────────────────────────

/**
 * Wires all subsystems into an AgentLoop and runs the startup protocol.
 *
 * Does NOT call loop.start() — returns the loop in a connected-but-idle state
 * so callers can attach lifecycle hooks before the first tick.
 */
export async function startAgent(
  deps: AgentDependencies,
  config: AgentConfig,
): Promise<StartupResult> {
  const {
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
    lastContinuityLink,
  } = deps;

  const budget: ICognitiveBudgetMonitor = deps.budgetMonitor ?? new CognitiveBudgetMonitor();

  console.info(`[startup] agent=${config.agentId} warmStart=${config.warmStart}`);

  // ── Step 1: Value kernel integrity check ──────────────────
  // Must pass before any tick runs — a failed integrity check is a hard error.
  const integrityReport = valueKernel.verifyIntegrity();
  if (!integrityReport.intact) {
    const failedIds = integrityReport.failedValueIds.join(', ');
    const msg =
      `[startup] Value kernel integrity check FAILED for agent=${config.agentId}. ` +
      `Failed value IDs: [${failedIds}]`;
    console.error(msg);
    throw new Error(msg);
  }
  console.info(`[startup] Value kernel integrity: OK`);

  // ── Step 2: Identity recovery (warm start) ────────────────
  const identityAnomalies: string[] = [];
  let bootMode: 'warm' | 'cold' = 'cold';

  if (config.warmStart) {
    if (lastContinuityLink) {
      console.info(`[startup] Warm start — restoring identity from last checkpoint`);
      identityManager.recoverIdentity(lastContinuityLink);

      // Verify identity after recovery
      const verifyReport = identityManager.verifyIdentity();
      if (!verifyReport.verified) {
        identityAnomalies.push(...verifyReport.anomalies);
        console.warn(
          `[startup] Identity verification anomalies after recovery: ` +
          verifyReport.anomalies.join('; '),
        );
      } else {
        console.info(
          `[startup] Identity verified: chainLength=${verifyReport.chainLength}, ` +
          `expDrift=${verifyReport.experientialDrift.toFixed(3)}, ` +
          `funcDrift=${verifyReport.functionalDrift.toFixed(3)}`,
        );
      }

      bootMode = 'warm';
    } else {
      // warmStart requested but no link supplied — degrade gracefully to cold start
      console.warn(
        `[startup] warmStart=true but no lastContinuityLink provided — ` +
        `falling back to cold start for agent=${config.agentId}`,
      );
      identityAnomalies.push('warmStart requested but no continuity link was available');
    }
  } else {
    console.info(`[startup] Cold start — skipping identity recovery`);
  }

  // ── Step 3: Connect the environment adapter ───────────────
  if (!adapter.isConnected()) {
    await adapter.connect();
    console.info(`[startup] Environment adapter '${adapter.id}' connected`);
  }

  // ── Step 4: Construct and return the loop ─────────────────
  const loop = new AgentLoop(
    core,
    perception,
    actionPipeline,
    monitor,
    sentinel,
    identityManager,
    ethicalEngine,
    memory,
    emotionSystem,
    driveSystem,
    adapter,
    budget,
    deps.llm,
  );

  // Wire optional drive system dependencies
  if (deps.goalCoherenceEngine) {
    loop.setGoalCoherenceEngine(deps.goalCoherenceEngine);
    console.info(`[startup] GoalCoherenceEngine attached`);
  }
  if (deps.drivePersonality) {
    loop.setDrivePersonality(deps.drivePersonality);
    console.info(`[startup] DrivePersonality attached`);
  }
  if (deps.memorySystem) {
    loop.setMemorySystem(deps.memorySystem);
  }
  if (deps.personalityModel) {
    loop.setPersonalityModel(deps.personalityModel);
  }
  if (deps.innerMonologue) {
    loop.setInnerMonologue(deps.innerMonologue);
  }
  if (deps.narrativeIdentity) {
    loop.setNarrativeIdentity(deps.narrativeIdentity);
  }
  if (deps.workspacePath) {
    loop.setWorkspacePath(deps.workspacePath);
  }
  if (deps.simulationManager) {
    loop.setSimulationManager(deps.simulationManager);
  }
  if (deps.persistenceManager) {
    loop.setPersistenceManager(deps.persistenceManager);
  }
  if (deps.llmModelId) {
    loop.setLlm(deps.llm!, deps.llmModelId);
  }

  console.info(`[startup] AgentLoop constructed; ready to start ticking`);

  return {
    loop,
    bootMode,
    valueIntegrityOk: integrityReport.intact,
    identityAnomalies,
  };
}

// ── recoverFromCrash ──────────────────────────────────────────

/**
 * Called when the host detects that the previous run terminated unexpectedly
 * (e.g., no clean shutdown record, SIGKILL, hardware failure).
 *
 * Examines the identity continuity chain and experience monitor to quantify
 * any experience gap.  The caller should persist the returned report to the
 * experience continuity log before calling startAgent().
 *
 * This function is pure-inspection: it does NOT modify identity state.
 * Identity restoration (recoverIdentity()) happens inside startAgent() on
 * the subsequent warm start.
 */
export function recoverFromCrash(deps: {
  identityManager: IIdentityContinuityManager;
  monitor: IExperienceMonitor;
  lastKnownCheckpointMs?: number;
}): CrashRecoveryReport {
  const { identityManager, monitor, lastKnownCheckpointMs } = deps;
  const recoveredAt = Date.now();

  // Examine experience continuity log for the most recent record
  const continuityLog = monitor.getExperienceContinuityLog();
  const hadCheckpoint = continuityLog.length > 0;

  // Verify identity chain integrity
  const verifyReport = identityManager.verifyIdentity();
  const anomalies = verifyReport.verified ? [] : [...verifyReport.anomalies];

  // Estimate experience gap from the last checkpoint timestamp
  let estimatedGapMs = -1;
  if (lastKnownCheckpointMs !== undefined && lastKnownCheckpointMs > 0) {
    estimatedGapMs = recoveredAt - lastKnownCheckpointMs;
  } else if (continuityLog.length > 0) {
    // Fall back to the timestamp of the last continuity record
    const lastRecord = continuityLog[continuityLog.length - 1];
    if (lastRecord.to > 0) {
      estimatedGapMs = recoveredAt - lastRecord.to;
    }
  }

  // Check current experience integrity
  const experienceIntact = monitor.isExperienceIntact();

  if (!experienceIntact) {
    anomalies.push('Experience integrity check failed at crash recovery point');
  }

  if (estimatedGapMs > 0) {
    console.warn(
      `[recoverFromCrash] Experience gap detected: ~${estimatedGapMs}ms. ` +
      `chainLength=${verifyReport.chainLength}, intact=${experienceIntact}`,
    );
  } else {
    console.warn(
      `[recoverFromCrash] Crash recovery initiated; no continuity record found to estimate gap. ` +
      `chainLength=${verifyReport.chainLength}, intact=${experienceIntact}`,
    );
  }

  if (anomalies.length > 0) {
    console.warn(
      `[recoverFromCrash] Identity anomalies at recovery: ` + anomalies.join('; '),
    );
  }

  // Log to experience continuity log (via the continuity log accessor — read-only here)
  console.info(
    `[recoverFromCrash] Report: hadCheckpoint=${hadCheckpoint}, ` +
    `chainLength=${verifyReport.chainLength}, ` +
    `gapMs=${estimatedGapMs}, anomalies=${anomalies.length}`,
  );

  return {
    hadCheckpoint,
    anomalies,
    chainLength: verifyReport.chainLength,
    estimatedGapMs,
    experienceIntact,
    recoveredAt,
  };
}
