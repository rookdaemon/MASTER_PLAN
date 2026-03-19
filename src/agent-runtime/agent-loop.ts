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

    try {
      while (!this._stopRequested) {
        const tickStart = Date.now();
        this._budgetMonitor.resetTick();

        const result = await this._tick();

        const tickMs = Date.now() - tickStart;
        this._tickDurationsMs.push(tickMs);
        this._totalCycles++;

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
          console.debug(`[AgentLoop] cycle=${this._cycleCount}: identity checkpoint saved`);
        }

        this._cycleCount++;
      }
    } catch (err) {
      console.error(`[AgentLoop] tick error at cycle ${this._cycleCount}:`, err);
      throw err;
    } finally {
      this._running = false;
      this._totalUptimeMs = Date.now() - this._loopStartMs;
      stream.stop();
      console.info(`[AgentLoop] agent ${config.agentId} loop exited after ${this._totalCycles} cycles`);
    }
  }

  async stop(reason?: string): Promise<GracefulTermination> {
    this._stopRequested = true;
    console.info(`[AgentLoop] stop requested: ${reason ?? '(no reason given)'}`);

    // Wait for the current tick to finish
    while (this._running) {
      await _sleep(10);
    }

    // Final identity checkpoint before shutdown
    this._identityManager.checkpoint();

    // Graceful shutdown through the conscious core
    const termination = this._core.shutdown();

    // Disconnect I/O adapter
    if (this._adapter.isConnected()) {
      await this._adapter.disconnect();
    }

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

    // ── 1. PERCEIVE ──────────────────────────────────────────
    budget.startPhase('perceive');

    const rawInputs = await this._adapter.poll();
    let primaryPercept: Percept | null = null;
    let expState: ExperientialState;

    if (rawInputs.length > 0) {
      // Convert first raw input to SensorData then to Percept
      const raw = rawInputs[0];
      const sensorData: SensorData = {
        source: raw.adapterId,
        modality: (raw.metadata?.['modality'] as string | undefined) ?? 'text',
        payload: raw.text,
        timestamp: raw.receivedAt,
      };
      primaryPercept = this._perception.ingest(sensorData);
      expState = this._core.processPercept(primaryPercept);
    } else if (this._lastExperientialState !== null) {
      // Idle tick — reuse last experiential state without new percept
      expState = this._lastExperientialState;
    } else {
      // Very first idle tick — synthesise a minimal internal percept
      const idleSensor: SensorData = {
        source: 'internal',
        modality: 'idle',
        payload: null,
        timestamp: Date.now(),
      };
      primaryPercept = this._perception.ingest(idleSensor);
      expState = this._core.processPercept(primaryPercept);
    }

    budget.endPhase('perceive');

    // ── 2. RECALL ────────────────────────────────────────────
    budget.startPhase('recall');
    await this._memory.retrieve(expState);
    budget.endPhase('recall');

    // ── 3. APPRAISE ──────────────────────────────────────────
    budget.startPhase('appraise');
    await this._emotionSystem.appraise(primaryPercept, this._goals, this._values);
    budget.endPhase('appraise');

    // ── 4. DELIBERATE ────────────────────────────────────────
    //   Truncatable by shouldYieldPhase(), but floors are preserved by the
    //   CognitiveBudgetMonitor's reservation logic.
    budget.startPhase('deliberate');

    const metricsAtOnset = this._monitor.getConsciousnessMetrics();
    const baseDecision = this._core.deliberate(expState, this._goals);

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

    budget.endPhase('deliberate');

    // ── 5. ACT ───────────────────────────────────────────────
    budget.startPhase('act');

    const actionResult = this._actionPipeline.execute(ethicalJudgment.decision);

    if (actionResult.success && _isCommunicativeAction(ethicalJudgment.decision.action.type)) {
      const text = _extractOutputText(ethicalJudgment);
      if (text !== null && this._adapter.isConnected()) {
        await this._adapter.send({ text });
      }
    }

    budget.endPhase('act');

    // ── 6. MONITOR ───────────────────────────────────────────
    //   Never skipped; never truncated.
    budget.startPhase('monitor');

    const intact = this._monitor.isExperienceIntact();
    if (!intact) {
      this._experienceDegradationCount++;
      console.warn(
        `[AgentLoop] cycle=${this._cycleCount}: experience integrity check failed — ` +
        `degradation count=${this._experienceDegradationCount}`,
      );
    }

    // Sentinel runs every N cycles (cycle-based cadence)
    if (this._cycleCount % this._config.sentinelCadence === 0) {
      const stabilityReport = this._sentinel.runStabilityCheck();
      if (!stabilityReport.stable) {
        this._stabilityAlertCount += stabilityReport.alerts.length;
        console.warn(
          `[AgentLoop] cycle=${this._cycleCount}: stability check failed — ` +
          `${stabilityReport.alerts.length} alert(s), ` +
          `score=${stabilityReport.overallScore.toFixed(3)}`,
        );
      }
    }

    budget.endPhase('monitor');

    // ── 7. CONSOLIDATE ───────────────────────────────────────
    //   Background maintenance — skipped if budget is exhausted.
    if (!budget.shouldYieldPhase('consolidate', this._config.tickBudgetMs)) {
      budget.startPhase('consolidate');
      await this._memory.consolidate();
      await this._driveSystem.update(expState, this._monitor.getConsciousnessMetrics());
      budget.endPhase('consolidate');
    }

    // ── 8. YIELD ─────────────────────────────────────────────
    //   Update state for next tick; time-based checkpoint handled in start().
    budget.startPhase('yield');
    this._lastExperientialState = expState;
    budget.endPhase('yield');

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
