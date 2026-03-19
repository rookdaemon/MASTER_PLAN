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
  EthicalJudgment,
} from '../ethical-self-governance/types.js';

import type { DebugLogger } from './debug-log.js';
import type { Dashboard, DashboardSnapshot, PhaseState } from './dashboard.js';

// ── Callback for tick events (used by main to drive dashboard) ─

export type OnTickCallback = (snap: DashboardSnapshot) => void;

// ── AgentLoop ─────────────────────────────────────────────────

export class AgentLoop implements IAgentLoop {
  // ── Loop state ──────────────────────────────────────────────
  private _running = false;
  private _stopRequested = false;
  private _cycleCount = 0;
  private _loopStartMs = 0;
  private _lastCheckpointMs = 0;
  private _lastExperientialState: ExperientialState | null = null;

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

  // ── Observability (optional) ─────────────────────────────────
  private _debugLog: DebugLogger | null = null;
  private _dashboard: Dashboard | null = null;
  private _onTick: OnTickCallback | null = null;
  private _phaseTimings: Map<string, number> = new Map();

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
  ) {}

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

    try {
      while (!this._stopRequested) {
        const tickStart = Date.now();
        this._budgetMonitor.resetTick();
        this._debugLog?.tickStart(this._cycleCount);

        const result = await this._tick();

        const tickMs = Date.now() - tickStart;
        this._tickDurationsMs.push(tickMs);
        this._totalCycles++;

        this._debugLog?.tickEnd(this._cycleCount, tickMs, result.intact);

        // Yield CPU when tick completed quickly (no meaningful work)
        if (tickMs < 10) {
          await _sleep(100);
        }

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

    // Wait for the current tick to finish
    while (this._running) {
      await _sleep(10);
    }

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

  // ── Internal tick cycle ──────────────────────────────────────

  private async _tick(): Promise<TickResult> {
    const budget = this._budgetMonitor;
    const dl = this._debugLog;
    const db = this._dashboard;

    // ── 1. PERCEIVE ──────────────────────────────────────────
    budget.startPhase('perceive');
    dl?.phaseStart('perceive', this._cycleCount);

    const rawInputs = await this._adapter.poll();
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

    // ── 4. DELIBERATE ────────────────────────────────────────
    //   Truncatable by shouldYieldPhase(), but floors are preserved by the
    //   CognitiveBudgetMonitor's reservation logic.
    budget.startPhase('deliberate');
    dl?.phaseStart('deliberate', this._cycleCount);

    const metricsAtOnset = this._monitor.getConsciousnessMetrics();
    dl?.log('monitor', 'Consciousness metrics at deliberation onset', {
      phi: metricsAtOnset.phi,
      experienceContinuity: metricsAtOnset.experienceContinuity,
      selfModelCoherence: metricsAtOnset.selfModelCoherence,
    });

    const baseDecision = this._core.deliberate(expState, this._goals);
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

    dl?.log('deliberation', `Ethical judgment: ${ethicalJudgment.ethicalAssessment.verdict}`, {
      verdict: ethicalJudgment.ethicalAssessment.verdict,
      preservesExperience: ethicalJudgment.ethicalAssessment.preservesExperience,
      justification: ethicalJudgment.justification.naturalLanguageSummary.slice(0, 120),
    });

    const deliberateEnd = budget.endPhase('deliberate');
    dl?.phaseEnd('deliberate', this._cycleCount, deliberateEnd.durationMs);
    this._phaseTimings.set('deliberate', deliberateEnd.durationMs);

    // ── 5. ACT ───────────────────────────────────────────────
    budget.startPhase('act');
    dl?.phaseStart('act', this._cycleCount);

    const actionResult = this._actionPipeline.execute(ethicalJudgment.decision);
    dl?.log('action', `Action executed: ${ethicalJudgment.decision.action.type}`, {
      success: actionResult.success,
    });

    if (actionResult.success && _isCommunicativeAction(ethicalJudgment.decision.action.type)) {
      const text = _extractOutputText(ethicalJudgment);
      if (text !== null && this._adapter.isConnected()) {
        await this._adapter.send({ text });
        dl?.log('io', `Output sent (${text.length} chars)`, { preview: text.slice(0, 120) });
        db?.log('io', `Sent: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`);
      }
    }

    const actEnd = budget.endPhase('act');
    dl?.phaseEnd('act', this._cycleCount, actEnd.durationMs);
    this._phaseTimings.set('act', actEnd.durationMs);

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
      await this._driveSystem.update(expState, this._monitor.getConsciousnessMetrics());
      dl?.log('drive', 'Drive system updated');
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
      drives: [],  // populated when full drive system is wired
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
}

// ── Pure helper functions (no side-effects) ───────────────────

/** Returns true when the action type suggests a communicative response should be sent. */
function _isCommunicativeAction(actionType: string): boolean {
  const lower = actionType.toLowerCase();
  return (
    lower === 'communicate' ||
    lower === 'respond' ||
    lower === 'chat' ||
    lower === 'reply' ||
    lower.startsWith('communicate:') ||
    lower.includes('communicate')
  );
}

/**
 * Extracts text output from an ethical judgment for delivery via the adapter.
 * Checks action parameters in priority order, falling back to justification summary.
 */
function _extractOutputText(judgment: EthicalJudgment): string | null {
  const params = judgment.decision.action.parameters;
  if (typeof params['text'] === 'string' && params['text'].length > 0) return params['text'];
  if (typeof params['response'] === 'string' && params['response'].length > 0) return params['response'];
  if (typeof params['content'] === 'string' && params['content'].length > 0) return params['content'];

  // Fallback: use the ethical justification's natural-language summary
  const summary = judgment.justification.naturalLanguageSummary;
  return summary.length > 0 ? summary : null;
}

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
