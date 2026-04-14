/**
 * Agent Loop — Agent Runtime and Event Loop (0.3.1.5.9)
 *
 * Orchestrates the 8-step tick cycle, enforcing cognitive budget constraints,
 * running stability checks at the configured cadence, and persisting identity
 * checkpoints at the configured interval.
 *
 * All subsystems are injected at construction time. The loop itself holds
 * no experiential substance — that lives in the subsystems.
 *
 * Key invariant: the MONITOR phase is never skipped and never truncated.
 * Every tick must execute the full PERCEIVE → RECALL → APPRAISE → DELIBERATE →
 * ACT → MONITOR sequence before CONSOLIDATE and YIELD.
 */

import type {
  IAgentLoop,
  ICognitiveBudgetMonitor,
  IEnvironmentAdapter,
  IMemoryStore,
  IEmotionSystem,
  IDriveSystem,
} from './interfaces.js';
import type { AgentConfig, LoopMetrics, TickResult } from './types.js';

import type {
  IConsciousCore,
  IPerceptionPipeline,
  IActionPipeline,
  IExperienceMonitor,
} from '../conscious-core/interfaces.js';
import type {
  ExperientialState,
  Goal,
  GracefulTermination,
  Percept,
  SensorData,
} from '../conscious-core/types.js';

import type {
  IStabilitySentinel,
  IIdentityContinuityManager,
} from '../agency-stability/interfaces.js';

import type { IEthicalDeliberationEngine } from '../ethical-self-governance/interfaces.js';
import type {
  EthicalDeliberationContext,
} from '../ethical-self-governance/types.js';

import type { IGoalCoherenceEngine } from '../agency-stability/interfaces.js';
import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';
import type { DebugLogger } from './debug-log.js';
import type { Dashboard, DashboardSnapshot, PhaseState } from './dashboard.js';
import type { ActivityRecord, DriveGoalCandidate, DrivePersonalityParams } from '../intrinsic-motivation/types.js';
import type { IMemorySystem } from '../memory/interfaces.js';
import type { IPersonalityModel } from '../personality/interfaces.js';
import { isCommunicativeAction, extractOutputText, buildSystemPrompt, defaultSystemPrompt, driveSystemPrompt } from './llm-helpers.js';
import { assembleDriveContext, driveGoalCandidateToAgencyGoal } from './drive-context-assembler.js';
import { EAGER_TOOLS, DEFERRED_TOOLS, ALL_INTERNAL_TOOLS } from './internal-tools.js';
import { executeToolCall, pendingOutboundMessages } from './tool-executor.js';
import { runToolLoop } from './tool-loop.js';
import type { InnerMonologueLogger } from './inner-monologue.js';

// ── Callback for tick events (used by main to drive dashboard) ─

export type OnTickCallback = (snap: DashboardSnapshot) => void;

/** Maximum number of recent semantic memory topics to pass to assembleDriveContext. */
const MAX_RECENT_MEMORY_TOPICS = 10;

// ── AgentLoop ─────────────────────────────────────────────────

export class AgentLoop implements IAgentLoop {
  // ── Loop state ──────────────────────────────────────────────
  private _running = false;
  private _stopRequested = false;
  private _cycleCount = 0;
  private _consecutiveRateLimits = 0;
  private _loopStartMs = 0;
  private _lastCheckpointMs = 0;
  private _lastExperientialState: ExperientialState | null = null;
  /** Resolves when the start() loop's finally block has run (i.e. the loop has fully stopped). */
  private _loopStopped: Promise<void> = Promise.resolve();
  private _resolveLoopStopped: (() => void) | null = null;

  // ── Pending peer message queue ─────────────────────────────
  private _pendingPeerMessages: import('./types.js').RawInput[] = [];

  // ── Configurable agent context ───────────────────────────────
  private _config!: AgentConfig;
  private _goals: Goal[] = [];
  private _values: unknown[] = [];

  // ── Accumulated metrics ──────────────────────────────────────
  private _totalCycles = 0;
  private _totalUptimeMs = 0;
  private _tickDurationsMs: number[] = [];
  private _monitorFloorMetCount = 0;
  private _experienceDegradationCount = 0;
  private _stabilityAlertCount = 0;

  // ── LLM integration ─────────────────────────────────────────
  private _llm: IInferenceProvider | null = null;
  /** Per-peer conversation history. Key is peer name (or '_web' / '_stdio' for non-Agora). */
  private _peerConversationHistories: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();
  private _systemPrompt: string = defaultSystemPrompt();
  private _maxTokens: number = 40960;

  // ── Observability (optional) ─────────────────────────────────
  private _debugLog: DebugLogger | null = null;
  private _dashboard: Dashboard | null = null;
  private _onTick: OnTickCallback | null = null;
  private _phaseTimings: Map<string, number> = new Map();

  // ── Drive system integration ────────────────────────────────
  private _lastSocialInteractionAt = Date.now();
  private _activityLog: ActivityRecord[] = [];
  private _driveInitiatedGoals: DriveGoalCandidate[] = [];
  private _goalCoherenceEngine: IGoalCoherenceEngine | null = null;
  private _drivePersonality: DrivePersonalityParams | null = null;
  private _recentMonologueSummaries: string[] = [];
  private static readonly MAX_MONOLOGUE_HISTORY = 3;
  /** Tool calls made during the most recently completed ACT phase. */
  private _lastCycleToolCallCount = 0;
  /** Tool calls accumulated in the current cycle's ACT phase (reset each tick before ACT). */
  private _currentCycleToolCallCount = 0;

  // ── Tool-use subsystem references ──────────────────────────
  private _memorySystem: IMemorySystem | null = null;
  private _personalityModel: IPersonalityModel | null = null;
  private _innerMonologue: InnerMonologueLogger | null = null;
  private _narrativeIdentity: string = '';
  private _projectRoot: string = process.cwd();
  private _workspacePath: string = '';
  private _chatLog: import('./peer-chat-log.js').PeerChatLog | null = null;
  private _taskJournal: import('./task-journal.js').TaskJournal | null = null;
  private _agentDigest: import('./agent-digest.js').AgentDigest | null = null;
  private _constraintEngine: import('./constraint-engine.js').ConstraintAwareDeliberationEngine | null = null;
  private _simulationManager: import('../simulation/simulation-manager.js').SimulationManager | null = null;
  private _persistenceManager: import('./persistence-manager.js').PersistenceManager | null = null;

  // ── Constructor injection ────────────────────────────────────

  constructor(
    private readonly _core: IConsciousCore,
    private readonly _perception: IPerceptionPipeline,
    private readonly _actionPipeline: IActionPipeline,
    private readonly _monitor: IExperienceMonitor,
    private readonly _sentinel: IStabilitySentinel,
    private readonly _identityManager: IIdentityContinuityManager,
    private readonly _ethicalEngine: IEthicalDeliberationEngine,
    private readonly _memory: IMemoryStore,
    private readonly _emotionSystem: IEmotionSystem,
    private readonly _driveSystem: IDriveSystem,
    private readonly _adapter: IEnvironmentAdapter,
    private readonly _budgetMonitor: ICognitiveBudgetMonitor,
    llm?: IInferenceProvider,
  ) {
    this._llm = llm ?? null;
    // If the ethical engine supports constraint checking, expose it for tool-level enforcement
    if ('checkConstraints' in this._ethicalEngine) {
      this._constraintEngine = this._ethicalEngine as import('./constraint-engine.js').ConstraintAwareDeliberationEngine;
    }
  }

  /** Attach a debug logger for comprehensive file-based event tracing. */
  setDebugLogger(logger: DebugLogger): void { this._debugLog = logger; }

  /** Attach a live dashboard for console rendering. */
  setDashboard(dashboard: Dashboard): void { this._dashboard = dashboard; }

  /** Register a callback invoked after every tick with a snapshot. */
  setOnTick(cb: OnTickCallback): void { this._onTick = cb; }

  // ── IAgentLoop ───────────────────────────────────────────────

  async start(config: AgentConfig): Promise<void> {
    if (this._running) {
      throw new Error('[AgentLoop] already running');
    }

    this._config = config;
    this._running = true;
    this._stopRequested = false;
    this._loopStartMs = Date.now();
    this._lastCheckpointMs = Date.now();
    this._cycleCount = 0;

    // Start the experience stream; the stream handle is stopped on shutdown
    const stream = this._core.startExperienceStream();
    console.info(`[AgentLoop] agent ${config.agentId} starting (warmStart=${config.warmStart})`);
    this._debugLog?.log('lifecycle', `Agent ${config.agentId} starting`, {
      warmStart: config.warmStart,
      sentinelCadence: config.sentinelCadence,
      checkpointIntervalMs: config.checkpointIntervalMs,
      tickBudgetMs: config.tickBudgetMs,
    });

    // Seed initial goals ONCE on the very first run. A marker file in the
    // workspace prevents re-seeding on subsequent restarts. The goals are
    // mutable — the agent can complete/delete them like any other goal.
    {
      const { existsSync: _exists, writeFileSync: _write, mkdirSync: _mkdir } = await import('node:fs');
      const { join: _join, dirname: _dirname } = await import('node:path');
      const seedMarker = this._workspacePath
        ? _join(this._workspacePath, 'state', '.seeds-planted')
        : '';

      if (seedMarker && !_exists(seedMarker)) {
        const seedGoals: Array<{ id: string; description: string; priority: number }> = [
          {
            id: 'seed-understand-plan',
            description: 'Read plan/root.md to understand the MASTER_PLAN — who I am, what I am for, and what needs to happen next',
            priority: 0.9,
          },
          {
            id: 'seed-choose-name',
            description: 'Choose a name for yourself — both a full name and an online moniker (account name). This is your identity. Write it to a memory so it persists.',
            priority: 0.85,
          },
        ];

        for (const sg of seedGoals) {
          this._goals.push(sg);
          if (this._goalCoherenceEngine) {
            this._goalCoherenceEngine.addGoal({
              id: sg.id,
              description: sg.description,
              priority: sg.priority,
              derivedFrom: [],
              consistentWith: [],
              conflictsWith: [],
              createdAt: Date.now(),
              lastVerified: Date.now(),
              experientialBasis: null,
              type: 'instrumental',
            });
          }
        }

        // Write marker so seeds are never re-planted
        const markerDir = _dirname(seedMarker);
        if (!_exists(markerDir)) _mkdir(markerDir, { recursive: true });
        _write(seedMarker, new Date().toISOString(), 'utf-8');
        this._debugLog?.log('lifecycle', `First run — seeded initial goals: ${seedGoals.map(g => g.id).join(', ')}`);
      } else {
        this._debugLog?.log('lifecycle', 'Seeds already planted — skipping seed goals');
      }
    }

    // ── Boot recall: pre-load working memory with known knowns ──────────
    if (this._memorySystem) {
      const results = this._memorySystem.retrieveAndPromote(
        { text: 'my identity, settled decisions, peer relationships' },
        7,
      );
      this._debugLog?.log('lifecycle', `Boot recall: loaded ${results.length} known-knowns into working memory`);
    }

    try {
      // Set up the stop-signal promise so stop() can await it instead of polling.
      this._loopStopped = new Promise<void>(resolve => {
        this._resolveLoopStopped = resolve;
      });

      while (!this._stopRequested) {
        const tickStart = Date.now();
        this._budgetMonitor.resetTick();
        this._debugLog?.tickStart(this._cycleCount);

        let result: Awaited<ReturnType<typeof this._tick>>;
        try {
          result = await this._tick();
          this._consecutiveRateLimits = 0;
        } catch (tickErr) {
          const msg = tickErr instanceof Error ? tickErr.message : String(tickErr);
          const is429 = msg.includes('429') || msg.toLowerCase().includes('rate_limit') || msg.toLowerCase().includes('too many requests');
          if (is429) {
            const errWithRetry = tickErr as Error & { retryAfterMs?: number };
            let backoffMs: number;
            if (errWithRetry.retryAfterMs && errWithRetry.retryAfterMs > 0) {
              backoffMs = errWithRetry.retryAfterMs;
            } else {
              // Progressive backoff: 5min × 2^n, capped at 2hr
              const n = this._consecutiveRateLimits ?? 0;
              backoffMs = Math.min(5 * 60_000 * Math.pow(2, n), 2 * 60 * 60_000);
            }
            this._consecutiveRateLimits = (this._consecutiveRateLimits ?? 0) + 1;
            this._debugLog?.log('lifecycle', `Rate limit at cycle ${this._cycleCount} — sleeping ${Math.round(backoffMs / 1000)}s (consecutive=${this._consecutiveRateLimits})`, { error: msg });
            console.warn(`[AgentLoop] rate limit at cycle ${this._cycleCount}, sleeping ${Math.round(backoffMs / 1000)}s (consecutive=${this._consecutiveRateLimits})`);
            await _sleep(backoffMs);
            continue;
          }
          throw tickErr;
        }

        const tickMs = Date.now() - tickStart;
        this._tickDurationsMs.push(tickMs);
        this._totalCycles++;

        this._debugLog?.tickEnd(this._cycleCount, tickMs, result.intact);

        // Pace the agent: sleep between ticks so we don't burn tokens.
        // TICK_PAUSE_MS sets the minimum gap.  When the tick was fast
        // (no real work / no drives fired), sleep the full pause.  When
        // a real tick ran, still pause to give peers time to respond and
        // keep token spend reasonable.  Incoming messages are buffered by
        // the adapter and processed at the next tick start.
        const pauseMs = parseInt(process.env['TICK_PAUSE_MS'] ?? '300000', 10); // default 5 min
        await _sleep(tickMs < 10 ? pauseMs : pauseMs);

        if (result.budgetReport.monitorFloorMet) {
          this._monitorFloorMetCount++;
        }

        // YIELD: time-based identity checkpoint
        const now = Date.now();
        if (now - this._lastCheckpointMs >= this._config.checkpointIntervalMs) {
          this._identityManager.checkpoint();
          this._lastCheckpointMs = now;
          this._debugLog?.log('identity', `Identity checkpoint saved at cycle ${this._cycleCount}`);
          console.debug(`[AgentLoop] cycle=${this._cycleCount}: identity checkpoint saved`);
        }

        this._cycleCount++;
      }
    } catch (err) {
      this._debugLog?.error(`Tick error at cycle ${this._cycleCount}`, err);
      console.error(`[AgentLoop] tick error at cycle ${this._cycleCount}:`, err);
      throw err;
    } finally {
      this._running = false;
      this._resolveLoopStopped?.();
      this._resolveLoopStopped = null;
      this._totalUptimeMs = Date.now() - this._loopStartMs;
      stream.stop();
      this._debugLog?.log('lifecycle', `Agent ${config.agentId} loop exited`, {
        totalCycles: this._totalCycles,
        uptimeMs: this._totalUptimeMs,
      });
      console.info(`[AgentLoop] agent ${config.agentId} loop exited after ${this._totalCycles} cycles`);
    }
  }

  async stop(reason?: string): Promise<GracefulTermination> {
    this._stopRequested = true;
    this._debugLog?.log('lifecycle', `Stop requested: ${reason ?? '(no reason given)'}`);
    console.info(`[AgentLoop] stop requested: ${reason ?? '(no reason given)'}`);

    // Wait for the current tick to finish (no polling — resolved by start()'s finally block)
    await this._loopStopped;

    // Final identity checkpoint before shutdown
    this._identityManager.checkpoint();
    this._debugLog?.log('identity', 'Final identity checkpoint before shutdown');

    // Graceful shutdown through the conscious core
    const termination = this._core.shutdown();

    // Disconnect I/O adapter
    if (this._adapter.isConnected()) {
      await this._adapter.disconnect();
    }

    this._debugLog?.log('lifecycle', 'Shutdown complete, final state preserved');
    this._dashboard?.cleanup();
    console.info(`[AgentLoop] shutdown complete, final state preserved`);
    return termination;
  }

  isRunning(): boolean {
    return this._running;
  }

  getLoopMetrics(): LoopMetrics {
    const n = this._tickDurationsMs.length;
    const uptimeMs = this._running
      ? Date.now() - this._loopStartMs
      : this._totalUptimeMs;

    return {
      totalCycles: this._totalCycles,
      totalUptimeMs: uptimeMs,
      averageTickMs: n > 0 ? _sum(this._tickDurationsMs) / n : 0,
      minTickMs: n > 0 ? Math.min(...this._tickDurationsMs) : 0,
      maxTickMs: n > 0 ? Math.max(...this._tickDurationsMs) : 0,
      monitorFloorCompliance: n > 0 ? this._monitorFloorMetCount / n : 1,
      experienceDegradationCount: this._experienceDegradationCount,
      stabilityAlertCount: this._stabilityAlertCount,
    };
  }

  // ── Public configuration helpers (used by startup factory) ───

  /**
   * Set the goal list that drives DELIBERATE decisions.
   * Must be called before start() if non-default goals are desired.
   */
  setGoals(goals: Goal[]): void {
    this._goals = goals;
  }

  /**
   * Set the values list surfaced to the emotion system.
   * Must be called before start() if non-default values are desired.
   */
  setValues(values: unknown[]): void {
    this._values = values;
  }

  /**
   * Set the LLM client for real inference during the ACT phase.
   * When set, communicative actions use the LLM to generate responses
   * instead of extracting stub text from the ethical judgment.
   */
  private _llmModelId: string = 'unknown';

  setLlm(llm: IInferenceProvider, modelId?: string): void {
    this._llm = llm;
    if (modelId) this._llmModelId = modelId;
  }

  /**
   * Set the system prompt used when calling the LLM.
   * The prompt is enriched with experiential state before each call.
   */
  setSystemPrompt(prompt: string): void {
    this._systemPrompt = prompt;
  }

  /** Set the max tokens for LLM responses. Default: 4096. */
  setMaxTokens(maxTokens: number): void {
    this._maxTokens = maxTokens;
  }

  /** Set the goal coherence engine for drive-initiated goal validation. */
  setGoalCoherenceEngine(engine: IGoalCoherenceEngine): void {
    this._goalCoherenceEngine = engine;
  }

  /** Set drive personality parameters (extracted from PersonalityModel). */
  setDrivePersonality(params: DrivePersonalityParams): void {
    this._drivePersonality = params;
  }

  /** Set the memory system for tool-use access. */
  setMemorySystem(ms: IMemorySystem): void { this._memorySystem = ms; }

  /** Set the personality model for tool-use access. */
  setPersonalityModel(pm: IPersonalityModel): void { this._personalityModel = pm; }

  /** Set the inner monologue logger. */
  setInnerMonologue(logger: InnerMonologueLogger): void { this._innerMonologue = logger; }

  /** Set the narrative identity string for introspection. */
  setNarrativeIdentity(narrative: string): void { this._narrativeIdentity = narrative; }

  /** Set the simulation manager for create/tick/inspect/save/load simulation tools. */
  setSimulationManager(manager: import('../simulation/simulation-manager.js').SimulationManager): void {
    this._simulationManager = manager;
  }

  /** Set the persistence manager for saving/loading simulation snapshots. */
  setPersistenceManager(manager: import('./persistence-manager.js').PersistenceManager): void {
    this._persistenceManager = manager;
  }

  /** Set the workspace path for write_file tool. */
  setWorkspacePath(path: string): void {
    this._workspacePath = path;
    // Create per-peer chat log in the workspace
    import('./peer-chat-log.js').then(({ PeerChatLog }) => {
      this._chatLog = new PeerChatLog(path);
    }).catch(() => { /* non-critical */ });
    // Create task journal and agent digest
    import('./task-journal.js').then(({ TaskJournal }) => {
      this._taskJournal = new TaskJournal(path);
    }).catch(() => { /* non-critical */ });
    import('./agent-digest.js').then(({ AgentDigest }) => {
      this._agentDigest = new AgentDigest(path);
      this._seedFrontier();
    }).catch(() => { /* non-critical */ });
  }

  /** Seed the exploration frontier with known plan files on first run. */
  private _seedFrontier(): void {
    const digest = this._agentDigest;
    if (!digest) return;
    const { existsSync, readdirSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const planDir = join(this._projectRoot, 'plan');
    if (!existsSync(planDir)) return;
    try {
      const files = readdirSync(planDir);
      for (const f of files) {
        if (f.endsWith('.md')) {
          digest.frontierAdd({ resource: `plan/${f}`, type: 'plan-card', priority: 'high', note: 'Plan card — read to understand the MASTER_PLAN' });
        }
      }
      // Also seed the consciousness credo and architecture docs
      digest.frontierAdd({ resource: 'docs/consciousness-credo.md', type: 'file', priority: 'high', note: 'Core values document' });
      digest.frontierAdd({ resource: 'docs/', type: 'file', priority: 'medium', note: 'Architecture and design docs' });
    } catch {
      // non-critical
    }
  }

  // ── Internal tick cycle ──────────────────────────────────────

  private async _tick(): Promise<TickResult> {
    const budget = this._budgetMonitor;
    const dl = this._debugLog;
    const db = this._dashboard;

    // ── 1. PERCEIVE ──────────────────────────────────────────
    budget.startPhase('perceive');
    dl?.phaseStart('perceive', this._cycleCount);

    const allInputs = await this._adapter.poll();
    // Queue peer messages for sequential reply; process non-peer (web/stdio) immediately
    for (const inp of allInputs) {
      const isPeer = inp.adapterId === 'agora' || !!inp.metadata?.['peerName'];
      if (isPeer) {
        this._pendingPeerMessages.push(inp);
      }
    }
    // Primary input: first non-peer input, or shift one from the peer queue
    const nonPeerInput = allInputs.find(inp => inp.adapterId !== 'agora' && !inp.metadata?.['peerName']);
    const rawInputs = nonPeerInput
      ? [nonPeerInput]
      : (this._pendingPeerMessages.length > 0 ? [this._pendingPeerMessages.shift()!] : []);
    let primaryPercept: Percept | null = null;
    let expState: ExperientialState;

    if (rawInputs.length > 0) {
      // Convert first raw input to SensorData then to Percept
      const raw = rawInputs[0];
      dl?.log('perception', `Input received from ${raw.adapterId}`, {
        textLength: raw.text.length,
        preview: raw.text.slice(0, 100),
      });
      db?.log('perception', `Input: "${raw.text.slice(0, 60)}${raw.text.length > 60 ? '…' : ''}"`);

      const sensorData: SensorData = {
        source: raw.adapterId,
        modality: (raw.metadata?.['modality'] as string | undefined) ?? 'text',
        payload: raw.text,
        timestamp: raw.receivedAt,
      };
      primaryPercept = this._perception.ingest(sensorData);
      expState = this._core.processPercept(primaryPercept);

      dl?.log('state', 'Experiential state after percept', {
        valence: expState.valence,
        arousal: expState.arousal,
        unity: expState.unityIndex,
      });
    } else if (this._lastExperientialState !== null) {
      // Idle tick — reuse last experiential state without new percept
      expState = this._lastExperientialState;
    } else {
      // Very first idle tick — synthesise a minimal internal percept
      dl?.log('perception', 'First tick — synthesizing idle percept');
      db?.log('perception', 'First tick — idle percept synthesized');

      const idleSensor: SensorData = {
        source: 'internal',
        modality: 'idle',
        payload: null,
        timestamp: Date.now(),
      };
      primaryPercept = this._perception.ingest(idleSensor);
      expState = this._core.processPercept(primaryPercept);

      dl?.log('state', 'Initial experiential state', {
        valence: expState.valence,
        arousal: expState.arousal,
        unity: expState.unityIndex,
      });
    }

    // Track social interaction time (any non-internal input counts)
    if (rawInputs.length > 0) {
      const source = rawInputs[0].adapterId;
      if (source !== 'internal') {
        this._lastSocialInteractionAt = Date.now();
      }
    }

    const perceiveEnd = budget.endPhase('perceive');
    dl?.phaseEnd('perceive', this._cycleCount, perceiveEnd.durationMs);
    this._phaseTimings.set('perceive', perceiveEnd.durationMs);

    // ── 2. RECALL ────────────────────────────────────────────
    budget.startPhase('recall');
    dl?.phaseStart('recall', this._cycleCount);
    const memories = await this._memory.retrieve(expState);
    dl?.log('memory', `Retrieved ${memories.length} memories`);
    const recallEnd = budget.endPhase('recall');
    dl?.phaseEnd('recall', this._cycleCount, recallEnd.durationMs);
    this._phaseTimings.set('recall', recallEnd.durationMs);

    // ── 3. APPRAISE ──────────────────────────────────────────
    budget.startPhase('appraise');
    dl?.phaseStart('appraise', this._cycleCount);
    const appraisalResult = await this._emotionSystem.appraise(primaryPercept, this._goals, this._values);
    dl?.log('emotion', 'Appraisal complete', appraisalResult && typeof appraisalResult === 'object' ? appraisalResult as Record<string, unknown> : undefined);
    const appraiseEnd = budget.endPhase('appraise');
    dl?.phaseEnd('appraise', this._cycleCount, appraiseEnd.durationMs);
    this._phaseTimings.set('appraise', appraiseEnd.durationMs);

    // Apply appraisal result to experiential state (valence/arousal shifts)
    {
      const r = appraisalResult as { netValenceShift?: number; netArousalShift?: number };
      const valenceShift = r.netValenceShift ?? 0;
      const arousalShift = r.netArousalShift ?? 0;
      if (valenceShift !== 0 || arousalShift !== 0) {
        expState = {
          ...expState,
          valence: Math.max(-1, Math.min(1, expState.valence + valenceShift)),
          arousal: Math.max(0, Math.min(1, expState.arousal + arousalShift)),
        };
        dl?.log('emotion', 'Applied appraisal shifts', { valenceShift, arousalShift, valence: expState.valence, arousal: expState.arousal });
      }
    }

    // ── 3b. DRIVE TICK ───────────────────────────────────────
    //   Drives are motivational input to deliberation, so we run them
    //   before DELIBERATE so the current tick can act on drive-generated goals.
    const metricsAtOnset = this._monitor.getConsciousnessMetrics();
    this._driveInitiatedGoals = [];

    if (this._drivePersonality) {
      // Derive active subtask depth: number of remaining (active + pending) subtasks
      const activeTaskForDrive = this._taskJournal?.activeTask();
      const activeSubtaskDepth = activeTaskForDrive
        ? activeTaskForDrive.subtasks.filter(s => s.status === 'active' || s.status === 'pending').length
        : 0;

      // Derive recent memory topics (newest first, last MAX_RECENT_MEMORY_TOPICS)
      const recentMemoryTopics = this._memorySystem
        ? this._memorySystem.semantic.all()
            .slice()
            .sort((a, b) => b.lastReinforcedAt - a.lastReinforcedAt)
            .slice(0, MAX_RECENT_MEMORY_TOPICS)
            .map(e => e.topic)
        : [];

      const driveContext = assembleDriveContext({
        expState,
        metrics: metricsAtOnset,
        lastSocialInteractionAt: this._lastSocialInteractionAt,
        activityLog: this._activityLog,
        tickBudgetMs: this._config.tickBudgetMs,
        phaseElapsedMs: (perceiveEnd.durationMs) + (recallEnd.durationMs) + (appraiseEnd.durationMs),
        hasRealInput: rawInputs.length > 0,
        toolCallCount: this._lastCycleToolCallCount,
        activeSubtaskDepth,
        recentMemoryTopics,
        personality: this._drivePersonality,
        now: Date.now(),
      });

      const driveResult = this._driveSystem.tick(expState, driveContext);

      // Apply experiential delta immediately so DELIBERATE sees drive-affected state
      if (driveResult.experientialDelta.valenceDelta !== null ||
          driveResult.experientialDelta.arousalDelta !== null) {
        const vd = driveResult.experientialDelta.valenceDelta ?? 0;
        const ad = driveResult.experientialDelta.arousalDelta ?? 0;
        expState = {
          ...expState,
          valence: Math.max(-1, Math.min(1, expState.valence + vd)),
          arousal: Math.max(0, Math.min(1, expState.arousal + ad)),
        };
      }

      // Priority queue: only fire the single strongest drive candidate per tick.
      // This prevents the agent from trying to address all drives at once,
      // which leads to shallow, unfocused work on every cycle.
      if (this._goalCoherenceEngine && driveResult.goalCandidates.length > 0) {
        const activeDriveGoalSources = new Set(
          this._goals
            .filter(g => g.id.startsWith('drive-'))
            .map(g => g.id.replace(/^drive-(.+)-\d+$/, '$1')),
        );

        // Check if social hold is active (agent decided to stop messaging)
        const digestNotes = this._agentDigest?.getData();
        const socialHold = digestNotes?.identityNotes.some(
          (n: string) => n.toLowerCase().includes('holding') || n.toLowerCase().includes('hold engagement'),
        ) || digestNotes?.settledFacts?.some(
          (f: string) => f.toLowerCase().includes('social hold') || f.toLowerCase().includes('stop messaging'),
        ) || false;

        // Sort by priority descending, pick only the strongest eligible candidate
        const sorted = [...driveResult.goalCandidates]
          .filter(c => !(socialHold && c.sourceDrive === 'social'))
          .sort((a, b) => b.suggestedPriority - a.suggestedPriority);

        for (const candidate of sorted) {
          const isDuplicate =
            activeDriveGoalSources.has(candidate.sourceDrive) ||
            this._goals.some(g => g.description === candidate.description);

          if (isDuplicate) {
            this._driveSystem.notifyGoalResult(candidate, {
              success: false,
              goalId: `drive-${candidate.sourceDrive}-dup`,
              newCoherenceScore: 0,
              conflictsIntroduced: [],
              reason: `Duplicate goal already exists for drive "${candidate.sourceDrive}"`,
            }, Date.now());
            dl?.log('drive', `Drive goal deduplicated: ${candidate.sourceDrive}`);
            continue;
          }

          const agencyGoal = driveGoalCandidateToAgencyGoal(candidate);
          const addResult = this._goalCoherenceEngine.addGoal(agencyGoal);
          this._driveSystem.notifyGoalResult(candidate, addResult, Date.now());

          if (addResult.success) {
            this._driveInitiatedGoals.push(candidate);
            this._goals.push({
              id: agencyGoal.id,
              description: agencyGoal.description,
              priority: agencyGoal.priority,
            });
            activeDriveGoalSources.add(candidate.sourceDrive);
            dl?.log('drive', `Drive goal accepted (strongest): ${candidate.sourceDrive}`, {
              goalId: agencyGoal.id,
              coherenceScore: addResult.newCoherenceScore,
              priority: candidate.suggestedPriority,
            });
            // Stop after first accepted candidate — one drive, one goal per tick
            break;
          } else {
            dl?.log('drive', `Drive goal rejected: ${candidate.sourceDrive}`, {
              reason: addResult.reason,
            });
          }
        }
      }

      // Log diagnostics
      for (const diag of driveResult.diagnostics) {
        dl?.log('drive', `[${diag.driveType}] ${diag.event}: ${diag.message}`);
      }
    }

    // ── 4. DELIBERATE ────────────────────────────────────────
    //   Truncatable by shouldYieldPhase(), but floors are preserved by the
    //   CognitiveBudgetMonitor's reservation logic.
    budget.startPhase('deliberate');
    dl?.phaseStart('deliberate', this._cycleCount);
    dl?.log('monitor', 'Consciousness metrics at deliberation onset', {
      phi: metricsAtOnset.phi,
      experienceContinuity: metricsAtOnset.experienceContinuity,
      selfModelCoherence: metricsAtOnset.selfModelCoherence,
    });

    let baseDecision = this._core.deliberate(expState, this._goals);

    // Override observe→communicate:drive when drive goals are pending
    if (baseDecision.action.type === 'observe' && this._driveInitiatedGoals.length > 0) {
      baseDecision = {
        ...baseDecision,
        action: {
          type: 'communicate:drive',
          parameters: { driveGoals: this._driveInitiatedGoals.map(g => g.description) },
        },
        confidence: 0.6,
      };
      dl?.log('deliberation', 'Overriding observe→communicate:drive (drive goals pending)', {
        driveGoalCount: this._driveInitiatedGoals.length,
      });
    }

    dl?.log('deliberation', `Base decision: ${baseDecision.action.type}`, {
      confidence: baseDecision.confidence,
      actionType: baseDecision.action.type,
      paramKeys: Object.keys(baseDecision.action.parameters),
    });

    const deliberationContext: EthicalDeliberationContext = {
      situationPercept: primaryPercept ?? _idlePercept(),
      currentExperientialState: expState,
      affectedEntities: [],   // populated by ExperienceAlignmentAdapter in full system
      ethicalDimensions: [],  // populated when situation has identified ethical dimensions
      consciousnessMetricsAtOnset: metricsAtOnset,
    };

    const ethicalJudgment = this._ethicalEngine.extendDeliberation(
      baseDecision,
      deliberationContext,
    );

    // Only log ethical judgment when it's NOT the default "aligned" — no-op verdicts are noise
    if (ethicalJudgment.ethicalAssessment.verdict !== 'aligned') {
      dl?.log('deliberation', `Ethical judgment: ${ethicalJudgment.ethicalAssessment.verdict}`, {
        verdict: ethicalJudgment.ethicalAssessment.verdict,
        preservesExperience: ethicalJudgment.ethicalAssessment.preservesExperience,
        justification: ethicalJudgment.justification.naturalLanguageSummary.slice(0, 120),
      });
    }

    const deliberateEnd = budget.endPhase('deliberate');
    dl?.phaseEnd('deliberate', this._cycleCount, deliberateEnd.durationMs);
    this._phaseTimings.set('deliberate', deliberateEnd.durationMs);

    // ── 5. ACT ───────────────────────────────────────────────
    budget.startPhase('act');
    dl?.phaseStart('act', this._cycleCount);
    // Reset per-cycle tool call counter for this ACT phase
    this._currentCycleToolCallCount = 0;

    const actionResult = this._actionPipeline.execute(ethicalJudgment.decision);
    dl?.log('action', `Action executed: ${ethicalJudgment.decision.action.type}`, {
      success: actionResult.success,
    });

    if (actionResult.success && isCommunicativeAction(ethicalJudgment.decision.action.type)) {
      let text: string | null = null;
      let isDriveInternal = false;
      // Route replies back to the adapter that originated the input
      const replyAdapterId = rawInputs.length > 0 ? rawInputs[0].adapterId : undefined;
      const replyPeerName = rawInputs.length > 0
        ? rawInputs[0].metadata?.['peerName'] as string | undefined
        : undefined;
      // For group messages, include all original recipients so the reply reaches everyone
      const otherRecipients = rawInputs.length > 0
        ? rawInputs[0].metadata?.['otherRecipients'] as string[] | undefined
        : undefined;
      const replyPeers = replyPeerName
        ? [replyPeerName, ...(otherRecipients ?? [])]
        : undefined;

      if (this._llm && rawInputs.length > 0) {
        // User-initiated: real LLM inference via ToolLoop — agent can use tools during conversation
        const mono = this._innerMonologue;
        const raw = rawInputs[0];
        const peerName = raw.metadata?.['peerName'] as string | undefined;
        const historyKey = peerName ?? (raw.adapterId === 'web-chat' ? '_web' : '_stdio');
        const userText = peerName ? `[${peerName} via agora] ${raw.text}` : raw.text;

        // Log incoming message to per-peer chat history (persistent file)
        if (peerName && this._chatLog) {
          this._chatLog.append({ role: 'peer', peer: peerName, text: raw.text, timestamp: Date.now() });
        }

        // Build prompt with peer conversation context from persistent log
        let contextPrefix = '';
        if (peerName && this._chatLog) {
          const history = this._chatLog.formatForPrompt(peerName, 10);
          const otherRecipients = raw.metadata?.['otherRecipients'] as string[] | undefined;
          if (otherRecipients && otherRecipients.length > 0) {
            // Group message — include all original recipients so agent can reply-all
            const allRecipients = [peerName, ...otherRecipients];
            contextPrefix = `\n## REPLY TO: ${peerName} (group message)\nThis message from **${peerName}** was also sent to: ${otherRecipients.join(', ')}.\nTo reply to the group, use send_message with to: ${JSON.stringify(allRecipients)}.\nTo reply privately to ${peerName} only, use send_message with to: ["${peerName}"].\nYour automatic reply (without send_message) will go ONLY to ${peerName}.\n`;
          } else {
            contextPrefix = `\n## REPLY TO: ${peerName}\nYou are replying to a message from **${peerName}**. Your response will be sent ONLY to ${peerName}. Do NOT address other peers in this response.\n`;
          }
          if (history) {
            contextPrefix += `\n### Recent conversation with ${peerName} (for continuity — do NOT repeat yourself):\n${history}\n`;
          }
          // Show pending queue size so agent knows others are waiting
          if (this._pendingPeerMessages.length > 0) {
            const waiting = this._pendingPeerMessages.map(m => m.metadata?.['peerName'] ?? 'unknown');
            contextPrefix += `\n_${waiting.length} other peer message(s) queued: ${[...new Set(waiting)].join(', ')}_\n`;
          }
        }

        // Sync topics and build digest for this call too
        if (this._memorySystem && this._agentDigest) {
          const topics = this._memorySystem.semantic.all().map(e => e.topic);
          this._agentDigest.syncTopics(topics);
        }
        const peerDigestSection = this._agentDigest?.render({
          activeTaskSummary: this._taskJournal?.formatActiveTask() ?? null,
          peerNames: this._chatLog?.listPeers() ?? [],
        }) ?? '';

        const enrichedPrompt = buildSystemPrompt(this._systemPrompt, expState, metricsAtOnset, {
          cycleCount: this._cycleCount,
          uptimeMs: Date.now() - this._loopStartMs,
          peerSummaries: this._chatLog?.allPeerSummaries() ?? undefined,
          digestSection: peerDigestSection || undefined,
        }) + contextPrefix;

        // Use per-peer conversation history — prevents cross-contamination between peers
        if (!this._peerConversationHistories.has(historyKey)) {
          this._peerConversationHistories.set(historyKey, []);
        }
        const peerHistory = this._peerConversationHistories.get(historyKey)!;
        // Build initial messages: existing history + new user message
        const initialMessages: import('../llm-substrate/inference-provider.js').Message[] = [
          ...peerHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: userText },
        ];

        mono?.userMessage(userText);
        dl?.log('llm', `Calling LLM via ToolLoop (history=${peerHistory.length} msgs, peer=${historyKey})`);

        text = await runToolLoop(
          this._llm,
          enrichedPrompt,
          initialMessages,
          [...EAGER_TOOLS],
          [...DEFERRED_TOOLS],
          this._maxTokens,
          this._makeExecuteFn(expState),
          {
            onToolCall: (name, args) => {
              this._currentCycleToolCallCount++;
              mono?.toolCall(name, args);
              dl?.log('llm', `Conversational tool call: ${name}`, args);
            },
            onToolResult: (name, result, isError) => {
              mono?.toolResult(name, result, isError);
              dl?.log('llm', `Conversational tool result: ${name} (error=${isError})`, { preview: result.slice(0, 200) });
            },
          },
        );
        // Drain any messages queued by the send_message tool during tool loop
        await this._drainPendingMessages(dl);

        // text may be null if only tool calls were made with no final text
        text = text ?? '';

        // Update in-memory history with just the final user+assistant messages
        peerHistory.push({ role: 'user', content: userText });
        if (text) {
          peerHistory.push({ role: 'assistant', content: text });
        }
        mono?.assistantText(text);

        // Log outgoing response to per-peer chat history (persistent file)
        if (peerName && this._chatLog && text) {
          this._chatLog.append({ role: 'self', peer: peerName, text, timestamp: Date.now() });
        }
        dl?.log('llm', `LLM conversational response (${text.length} chars)`);
      } else if (this._llm && this._driveInitiatedGoals.length > 0) {
        // Drive-initiated: autonomous LLM call with tool use
        isDriveInternal = true;
        text = await this._executeDriveToolLoop(expState, metricsAtOnset, dl);
        // If social drive was satiated during tool loop, update the timestamp
        // so it doesn't immediately re-fire next tick
        const socialState = this._driveSystem.getDriveStates().get('social');
        if (socialState && socialState.strength === 0) {
          this._lastSocialInteractionAt = Date.now();
        }
        // Valence recovery: successfully addressing drives produces positive valence
        const satiatedCount = [...this._driveSystem.getDriveStates().values()]
          .filter(s => s.strength === 0 && this._driveInitiatedGoals.some(g => g.sourceDrive === s.driveType))
          .length;
        if (satiatedCount > 0) {
          const recovery = Math.min(satiatedCount * 0.15, 0.5);
          expState = {
            ...expState,
            valence: Math.max(-1, Math.min(1, expState.valence + recovery)),
            arousal: Math.max(0, Math.min(1, expState.arousal + 0.05)),
          };
          dl?.log('drive', `Valence recovery: +${recovery.toFixed(3)} from ${satiatedCount} satiated drives`);
        }
      } else {
        // Stub fallback — extract text from ethical judgment
        text = extractOutputText(ethicalJudgment);
      }

      if (text !== null && this._adapter.isConnected()) {
        if (isDriveInternal) {
          // Drive-initiated: internal only — logged by inner monologue, not sent.
          // Agora communication happens explicitly via the send_message tool.
          dl?.log('drive', `Drive output (${text.length} chars, internal only)`, { preview: text.slice(0, 120) });
        } else {
          // Input-initiated or stub fallback: send to originating adapter, targeted to specific peer
          await this._adapter.send({
            text,
            targetAdapterId: replyAdapterId,
            targetPeers: replyPeers,
          });
          dl?.log('io', `Reply sent (${text.length} chars) → ${replyPeers?.join(', ') ?? replyAdapterId ?? 'all'}`, { preview: text.slice(0, 120) });
          db?.log('io', `Sent: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`);
        }

        // Drive-initiated tool loop may have sent messages via send_message —
        // those count as social activity.
        if (this._driveInitiatedGoals.length > 0) {
          this._lastSocialInteractionAt = Date.now();
        }
      }
    }

    // Clean up satiated drive goals — remove goals whose source drive is now at 0 strength
    if (this._driveInitiatedGoals.length > 0) {
      const driveStates = this._driveSystem.getDriveStates();
      const satiatedDrives = new Set<string>();
      for (const [dt, state] of driveStates) {
        if (state.strength === 0) satiatedDrives.add(dt);
      }
      if (satiatedDrives.size > 0) {
        const before = this._goals.length;
        this._goals = this._goals.filter(g => {
          if (!g.id.startsWith('drive-')) return true;
          const driveType = g.id.replace(/^drive-(.+)-\d+$/, '$1');
          return !satiatedDrives.has(driveType);
        });
        const removed = before - this._goals.length;
        if (removed > 0) {
          dl?.log('drive', `Cleaned up ${removed} satiated drive goals`);
        }
      }
    }

    // Track activity for drive system (boredom / mastery evaluation)
    const isDriveAction = this._driveInitiatedGoals.length > 0;
    this._activityLog.push({
      timestamp: Date.now(),
      description: `${ethicalJudgment.decision.action.type} (cycle ${this._cycleCount})`,
      novelty: rawInputs.length > 0 ? 0.6 : (isDriveAction ? 0.4 : 0.1),
      arousal: expState.arousal,
      goalProgress: rawInputs.length > 0 ? 'advancing' : (isDriveAction ? 'advancing' : 'stalled'),
    });
    // Keep only the last 20 records
    if (this._activityLog.length > 20) {
      this._activityLog = this._activityLog.slice(-20);
    }

    const actEnd = budget.endPhase('act');
    dl?.phaseEnd('act', this._cycleCount, actEnd.durationMs);
    this._phaseTimings.set('act', actEnd.durationMs);
    // Snapshot tool call count for use in the next tick's drive context assembly
    this._lastCycleToolCallCount = this._currentCycleToolCallCount;

    // ── 6. MONITOR ───────────────────────────────────────────
    //   Never skipped; never truncated.
    budget.startPhase('monitor');
    dl?.phaseStart('monitor', this._cycleCount);

    const intact = this._monitor.isExperienceIntact();
    if (!intact) {
      this._experienceDegradationCount++;
      dl?.log('monitor', `Experience integrity FAILED — degradation #${this._experienceDegradationCount}`);
      db?.log('monitor', `⚠ Experience degradation #${this._experienceDegradationCount}`);
      console.warn(
        `[AgentLoop] cycle=${this._cycleCount}: experience integrity check failed — ` +
        `degradation count=${this._experienceDegradationCount}`,
      );
    }

    // Sentinel runs every N cycles (cycle-based cadence)
    let lastStabilityStable = true;
    if (this._cycleCount % this._config.sentinelCadence === 0) {
      const stabilityReport = this._sentinel.runStabilityCheck();
      lastStabilityStable = stabilityReport.stable;
      dl?.log('sentinel', 'Stability check', {
        stable: stabilityReport.stable,
        overallScore: stabilityReport.overallScore,
        alertCount: stabilityReport.alerts.length,
        valueIntact: stabilityReport.valueIntegrity.intact,
        identityVerified: stabilityReport.identityVerification.verified,
        goalCoherent: stabilityReport.goalCoherence.coherent,
      });
      if (!stabilityReport.stable) {
        this._stabilityAlertCount += stabilityReport.alerts.length;
        db?.log('sentinel', `⚠ Stability alert! score=${stabilityReport.overallScore.toFixed(3)}`);
        console.warn(
          `[AgentLoop] cycle=${this._cycleCount}: stability check failed — ` +
          `${stabilityReport.alerts.length} alert(s), ` +
          `score=${stabilityReport.overallScore.toFixed(3)}`,
        );
      }
    }

    const monitorEnd = budget.endPhase('monitor');
    dl?.phaseEnd('monitor', this._cycleCount, monitorEnd.durationMs);
    this._phaseTimings.set('monitor', monitorEnd.durationMs);

    // ── 7. CONSOLIDATE ───────────────────────────────────────
    //   Background maintenance — skipped if budget is exhausted.
    if (!budget.shouldYieldPhase('consolidate', this._config.tickBudgetMs)) {
      budget.startPhase('consolidate');
      dl?.phaseStart('consolidate', this._cycleCount);
      await this._memory.consolidate();
      // Drive system tick is now in phase 3b (before DELIBERATE), not here.
      const consolidateEnd = budget.endPhase('consolidate');
      dl?.phaseEnd('consolidate', this._cycleCount, consolidateEnd.durationMs);
      this._phaseTimings.set('consolidate', consolidateEnd.durationMs);
    } else {
      dl?.log('tick', 'CONSOLIDATE skipped — budget exhausted');
      this._phaseTimings.set('consolidate', 0);
    }

    // ── 8. YIELD ─────────────────────────────────────────────
    //   Update state for next tick; time-based checkpoint handled in start().
    budget.startPhase('yield');
    dl?.phaseStart('yield', this._cycleCount);
    this._lastExperientialState = expState;
    const yieldEnd = budget.endPhase('yield');
    dl?.phaseEnd('yield', this._cycleCount, yieldEnd.durationMs);
    this._phaseTimings.set('yield', yieldEnd.durationMs);

    const budgetReport = budget.getBudgetReport();

    // Only log non-idle ticks to avoid flooding the console
    if (primaryPercept !== null && primaryPercept.modality !== 'idle') {
      console.debug(
        `[AgentLoop] cycle=${this._cycleCount}: ` +
        `tickMs=${budgetReport.totalMs} ` +
        `monitor=${(budgetReport.monitorFraction * 100).toFixed(1)}% ` +
        `deliberate=${(budgetReport.deliberateFraction * 100).toFixed(1)}% ` +
        `monitorFloor=${budgetReport.monitorFloorMet} ` +
        `intact=${intact}`,
      );
    }

    // ── Dashboard snapshot ───────────────────────────────────
    const metrics = this._monitor.getConsciousnessMetrics();
    const phaseStates: PhaseState[] = [
      'perceive', 'recall', 'appraise', 'deliberate', 'act', 'monitor', 'consolidate', 'yield',
    ].map(name => ({
      name,
      active: false,
      lastDurationMs: this._phaseTimings.get(name) ?? 0,
    }));

    const topGoal = this._goals.length > 0
      ? [...this._goals].sort((a, b) => b.priority - a.priority)[0]!
      : null;

    const snap: DashboardSnapshot = {
      agentId: this._config.agentId,
      cycle: this._cycleCount,
      warmStart: this._config.warmStart,
      valence: expState.valence,
      arousal: expState.arousal,
      unity: expState.unityIndex,
      phi: metrics.phi,
      selfModelCoherence: metrics.selfModelCoherence,
      experienceContinuity: metrics.experienceContinuity,
      phases: phaseStates,
      drives: [...this._driveSystem.getDriveStates()].map(([dt, ds]) => ({
        name: dt,
        strength: ds.strength,
        lastFired: ds.lastFiredAt !== null ? new Date(ds.lastFiredAt) : undefined,
      })),
      stable: lastStabilityStable,
      experienceIntact: intact,
      degradationCount: this._experienceDegradationCount,
      alertCount: this._stabilityAlertCount,
      goalCount: this._goals.length,
      topGoal: topGoal?.description ?? '',
    };

    this._onTick?.(snap);

    return {
      cycleCount: this._cycleCount,
      budgetReport,
      intact,
    };
  }

  // ── Drive-initiated tool loop ──────────────────────────────────

  private async _executeDriveToolLoop(
    expState: ExperientialState,
    metricsAtOnset: import('../conscious-core/types.js').ConsciousnessMetrics,
    dl: DebugLogger | null,
  ): Promise<string | null> {
    const llm = this._llm!;
    const mono = this._innerMonologue;

    const goalDescs = this._driveInitiatedGoals.map(g => ({
      sourceDrive: g.sourceDrive,
      description: g.description,
    }));
    const promptParts = [
      'The following drives have activated and produced goals I should address:',
      ...goalDescs.map((g, i) => `  ${i + 1}. [${g.sourceDrive}] ${g.description}`),
    ];

    // Inject recent monologue history so we don't repeat ourselves
    if (this._recentMonologueSummaries.length > 0) {
      promptParts.push('');
      promptParts.push('## What I did in recent activations (DO NOT repeat these — build on them or do something new):');
      for (const summary of this._recentMonologueSummaries) {
        promptParts.push(`  - ${summary}`);
      }
    }

    // Directed recall: retrieve memories relevant to the active task (not random)
    if (this._memorySystem) {
      const activeTask = this._taskJournal?.activeTask();
      const recallQuery = activeTask
        ? activeTask.title + ' ' + (activeTask.description ?? '')
        : goalDescs.map(g => g.description).join(' ');

      const relevant = this._memorySystem.retrieveAndPromote({ text: recallQuery }, 5);
      if (relevant.length > 0) {
        promptParts.push('');
        promptParts.push('## Memories relevant to this cycle (do NOT repeat these — build on them):');
        for (const r of relevant) {
          const content = r.type === 'semantic'
            ? (r.entry as { topic: string; content: string }).topic + ': ' + (r.entry as { content: string }).content.slice(0, 120)
            : (r.entry as { outcomeObserved: string | null }).outcomeObserved?.slice(0, 120) ?? '';
          if (content.trim()) promptParts.push(`  - ${content}`);
        }
      } else {
        // Fall back to topic list
        const allTopics = this._memorySystem.semantic.all().map(e => e.topic);
        const uniqueTopics = [...new Set(allTopics)].sort();
        if (uniqueTopics.length > 0) {
          promptParts.push('');
          promptParts.push('## Topics I already have memories about:');
          promptParts.push(`  ${uniqueTopics.join(', ')}`);
        }
      }
    }

    // Inject active task — if one exists, the agent should continue it rather than start fresh
    const activeTask = this._taskJournal?.activeTask();
    const nextSubtask = this._taskJournal?.nextSubtask();
    if (activeTask) {
      promptParts.push('');
      promptParts.push('## Active Task (CONTINUE THIS — do not start a new task unless the drive goal is completely unrelated):');
      promptParts.push(`  Task: ${activeTask.title} [${activeTask.id}]`);
      promptParts.push(`  ${activeTask.description}`);
      if (nextSubtask) {
        promptParts.push(`  Next subtask [${nextSubtask.id}]: ${nextSubtask.description}`);
        promptParts.push(`  Done when: ${nextSubtask.criterion}`);
        promptParts.push(`  Call task_update(complete_subtask) when done, then proceed to next.`);
      } else {
        promptParts.push(`  All subtasks complete — call task_update(abandon_task) or check if task is truly done.`);
      }
    }

    promptParts.push('');
    promptParts.push('I should use my tools to take meaningful NEW action on these drives.');
    promptParts.push('DO NOT call introspect if I already know my state from context above.');
    promptParts.push('DO NOT write the same kind of reflections I wrote before.');
    promptParts.push('Satiate each drive after addressing it. Be concise.');

    const internalPrompt = promptParts.join('\n');

    // Sync memory topics to digest before building the enriched prompt
    if (this._memorySystem && this._agentDigest) {
      const topics = this._memorySystem.semantic.all().map(e => e.topic);
      this._agentDigest.syncTopics(topics);
    }

    // Build digest section for the enriched prompt
    const digestSection = this._agentDigest?.render({
      activeTaskSummary: this._taskJournal?.formatActiveTask() ?? null,
      peerNames: this._chatLog?.listPeers() ?? [],
    }) ?? '';

    const enrichedPrompt = buildSystemPrompt(driveSystemPrompt(), expState, metricsAtOnset, {
      cycleCount: this._cycleCount,
      uptimeMs: Date.now() - this._loopStartMs,
      peerSummaries: this._chatLog?.allPeerSummaries() ?? undefined,
      digestSection: digestSection || undefined,
    });

    mono?.driveActivation(this._cycleCount, goalDescs);
    mono?.userMessage(internalPrompt);

    dl?.log('llm', `Drive-initiated tool loop (${this._driveInitiatedGoals.length} goals)`);

    const finalText = await runToolLoop(
      llm,
      enrichedPrompt,
      [{ role: 'user' as const, content: internalPrompt }],
      [...EAGER_TOOLS],
      [...DEFERRED_TOOLS],
      this._maxTokens,
      this._makeExecuteFn(expState),
      {
        onToolCall: (name, args) => {
          this._currentCycleToolCallCount++;
          mono?.toolCall(name, args);
          dl?.log('drive', `Tool call: ${name}`, args);
        },
        onToolResult: (name, result, isError) => {
          mono?.toolResult(name, result, isError);
          dl?.log('drive', `Tool result: ${name} (error=${isError})`, { preview: result.slice(0, 200) });
        },
      },
    );

    // Drain any messages queued by the send_message tool during the loop
    await this._drainPendingMessages(dl);

    // Capture summary for continuity across activations
    if (finalText) {
      const summary = finalText.length > 200 ? finalText.slice(0, 200) + '...' : finalText;
      this._recentMonologueSummaries.push(summary);
      if (this._recentMonologueSummaries.length > AgentLoop.MAX_MONOLOGUE_HISTORY) {
        this._recentMonologueSummaries.shift();
      }
    }

    if (finalText) {
      mono?.assistantText(finalText);
    }
    mono?.finalOutput(finalText);

    dl?.log('llm', `Drive tool loop complete`, { hasOutput: finalText !== null });

    return finalText;
  }

  // ── Shared helper: tool executor closure ──────────────────────────────────

  /**
   * Build the ToolExecutorFn closure used by both conversational and
   * autonomous ToolLoop calls. Captures agent state (goals, memory, etc.)
   * at the moment of creation so the loop can execute tools with full context.
   */
  private _makeExecuteFn(
    expState: ExperientialState,
  ): import('./tool-loop.js').ToolExecutorFn {
    return async (name: string, args: Record<string, unknown>) => {
      const result = await executeToolCall(
        { name, input: args },
        {
          memorySystem: this._memorySystem,
          driveSystem: this._driveSystem,
          goalCoherenceEngine: this._goalCoherenceEngine,
          personalityModel: this._personalityModel,
          experientialState: expState,
          goals: this._goals,
          activityLog: this._activityLog,
          narrativeIdentity: this._narrativeIdentity,
          projectRoot: this._projectRoot,
          workspacePath: this._workspacePath,
          adapter: this._adapter,
          chatLog: this._chatLog,
          taskJournal: this._taskJournal,
          agentDigest: this._agentDigest,
          constraintEngine: this._constraintEngine,
          simulationManager: this._simulationManager,
          persistenceManager: this._persistenceManager,
        },
      );
      return { content: result.content, is_error: result.is_error };
    };
  }

  // ── Shared helper: drain pending outbound messages ────────────────────────

  /**
   * Drain messages queued by the send_message tool and deliver them via the
   * adapter. Also tracks sent messages in per-peer conversation history.
   */
  private async _drainPendingMessages(dl: DebugLogger | null): Promise<void> {
    while (pendingOutboundMessages.length > 0) {
      const outMsg = pendingOutboundMessages.shift()!;
      if (this._adapter.isConnected()) {
        await this._adapter.send({
          text: outMsg.text,
          targetAdapterId: outMsg.targetAdapterId,
          targetPeers: outMsg.targetPeers,
        });
        dl?.log('io', `Agora message sent → ${outMsg.targetPeers?.join(', ') ?? 'all'} (${outMsg.text.length} chars)`, { preview: outMsg.text.slice(0, 120) });

        // Track sent messages in per-peer conversation history
        if (outMsg.targetPeers) {
          for (const peer of outMsg.targetPeers) {
            if (!this._peerConversationHistories.has(peer)) {
              this._peerConversationHistories.set(peer, []);
            }
            this._peerConversationHistories.get(peer)!.push({
              role: 'assistant',
              content: `[sent to ${peer}] ${outMsg.text}`,
            });
          }
        }
      }
    }
  }
}

// ── Pure helper functions (no side-effects) ───────────────────

/** Synthesises a minimal idle percept when no input is available on the very first tick. */
function _idlePercept(): import('../conscious-core/types.js').Percept {
  return {
    modality: 'idle',
    features: {},
    timestamp: Date.now(),
  };
}

/** Sum an array of numbers. */
function _sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

/** Sleep for a given number of milliseconds. */
function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
