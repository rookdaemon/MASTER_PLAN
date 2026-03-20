/**
 * MessagePipeline — Event-Driven Conscious Processing
 *
 * Runs the 8-phase conscious processing cycle on demand (no polling loop).
 * Each call to processMessage() executes:
 *
 *   1. PERCEIVE  — ingest text as SensorData → Percept → ExperientialState
 *   2. RECALL    — retrieve relevant memories
 *   3. APPRAISE  — emotional appraisal
 *   4. DELIBERATE — conscious deliberation + ethical judgment + LLM inference
 *   5. ACT       — execute the decided action
 *   6. MONITOR   — check experience integrity
 *   7. CONSOLIDATE — background memory + drive maintenance
 *   8. YIELD     — return result
 *
 * When an ILlmClient is provided, the DELIBERATE phase uses the LLM to
 * generate actual responses. Without an LLM, it falls back to the stub
 * text from DefaultConsciousCore (for testing only).
 *
 * All subsystems are injected. The pipeline holds no mutable state between
 * calls — each invocation is self-contained.
 */

import type {
  IConsciousCore,
  IPerceptionPipeline,
  IActionPipeline,
  IExperienceMonitor,
} from '../conscious-core/interfaces.js';
import type {
  ExperientialState,
  SensorData,
} from '../conscious-core/types.js';
import type { IEthicalDeliberationEngine } from '../ethical-self-governance/interfaces.js';
import type { EthicalDeliberationContext } from '../ethical-self-governance/types.js';
import type { IMemoryStore, IEmotionSystem, IDriveSystem } from './interfaces.js';
import type { Goal } from '../conscious-core/types.js';
import type { ILlmClient } from '../llm-substrate/llm-substrate-adapter.js';
import { isCommunicativeAction, extractOutputText, buildSystemPrompt, defaultSystemPrompt } from './llm-helpers.js';

// ── Public types ─────────────────────────────────────────────

export interface MessagePipelineDeps {
  core: IConsciousCore;
  perception: IPerceptionPipeline;
  actionPipeline: IActionPipeline;
  monitor: IExperienceMonitor;
  ethicalEngine: IEthicalDeliberationEngine;
  memory: IMemoryStore;
  emotionSystem: IEmotionSystem;
  driveSystem: IDriveSystem;
  /** Optional LLM client for real inference. Without this, uses stub responses. */
  llm?: ILlmClient;
}

export interface MessagePipelineConfig {
  /** Source identifier for SensorData. Default: 'web-chat'. */
  source?: string;
  /** System prompt for LLM inference. */
  systemPrompt?: string;
  /** Max tokens for LLM response. Default: 4096. */
  maxTokens?: number;
}

export interface PipelineResult {
  /** Response text, or null if the action was non-communicative. */
  text: string | null;
  /** The experiential state produced during perception. */
  experientialState: ExperientialState;
  /** Whether experience integrity held during this cycle. */
  intact: boolean;
}

// ── MessagePipeline ──────────────────────────────────────────

export class MessagePipeline {
  private readonly _deps: MessagePipelineDeps;
  private readonly _source: string;
  private readonly _systemPrompt: string;
  private readonly _maxTokens: number;
  private _goals: Goal[] = [];
  private _values: unknown[] = [];
  private _conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(deps: MessagePipelineDeps, config: MessagePipelineConfig = {}) {
    this._deps = deps;
    this._source = config.source ?? 'web-chat';
    this._systemPrompt = config.systemPrompt ?? defaultSystemPrompt();
    this._maxTokens = config.maxTokens ?? 4096;
  }

  setGoals(goals: Goal[]): void { this._goals = goals; }
  setValues(values: unknown[]): void { this._values = values; }

  async processMessage(text: string, receivedAt: number): Promise<PipelineResult> {
    const { core, perception, actionPipeline, monitor, ethicalEngine, memory, emotionSystem, driveSystem, llm } = this._deps;

    // 1. PERCEIVE
    const sensorData: SensorData = {
      source: this._source,
      modality: 'text',
      payload: text,
      timestamp: receivedAt,
    };
    const percept = perception.ingest(sensorData);
    const expState = core.processPercept(percept);

    // 2. RECALL
    await memory.retrieve(expState);

    // 3. APPRAISE
    await emotionSystem.appraise(percept, this._goals, this._values);

    // 4. DELIBERATE
    const metricsAtOnset = monitor.getConsciousnessMetrics();
    const baseDecision = core.deliberate(expState, this._goals);

    const deliberationContext: EthicalDeliberationContext = {
      situationPercept: percept,
      currentExperientialState: expState,
      affectedEntities: [],
      ethicalDimensions: [],
      consciousnessMetricsAtOnset: metricsAtOnset,
    };
    const judgment = ethicalEngine.extendDeliberation(baseDecision, deliberationContext);

    // 5. ACT — if the conscious pipeline decided to communicate, generate
    //    the actual response via the LLM (when available).
    const actionResult = actionPipeline.execute(judgment.decision);

    let responseText: string | null = null;
    if (actionResult.success && isCommunicativeAction(judgment.decision.action.type)) {
      if (llm) {
        // Real LLM inference — build context-enriched prompt
        const enrichedSystemPrompt = buildSystemPrompt(this._systemPrompt, expState, metricsAtOnset);
        this._conversationHistory.push({ role: 'user', content: text });
        const llmResult = await llm.infer(enrichedSystemPrompt, [...this._conversationHistory], this._maxTokens);
        responseText = llmResult.content;
        this._conversationHistory.push({ role: 'assistant', content: responseText });
      } else {
        // Stub fallback (testing only)
        responseText = extractOutputText(judgment);
      }
    }

    // 6. MONITOR
    const intact = monitor.isExperienceIntact();

    // 7. CONSOLIDATE
    await memory.consolidate();
    // Drive system tick — in reactive-only mode (one-shot / web-chat) this
    // uses the DefaultDriveSystem stub which returns inert defaults.
    const metrics = monitor.getConsciousnessMetrics();
    driveSystem.tick(expState, {
      currentState: expState,
      worldModelUncertainty: 1 - metrics.selfModelCoherence,
      timeSinceLastSocialInteraction: 0,
      recentActivity: [],
      currentCognitiveLoad: 0.3,
      currentNovelty: 0.6,
      selfModelCoherence: metrics.selfModelCoherence,
      personality: {
        curiosityTrait: 0.5, warmthTrait: 0.5, volatilityTrait: 0.4,
        preferredArousal: 0.4, preferredLoad: 0.4, preferredNovelty: 0.5,
        opennessTrait: 0.5, deliberatenessTrait: 0.5,
      },
      now: Date.now(),
    });

    // 8. YIELD
    return { text: responseText, experientialState: expState, intact };
  }
}

