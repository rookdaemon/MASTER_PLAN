/**
 * Agent Runtime and Event Loop — Interfaces (0.3.1.5.9)
 *
 * Three primary interfaces:
 *   - IAgentLoop: the main orchestration loop
 *   - ICognitiveBudgetMonitor: phase-level budget tracking
 *   - IEnvironmentAdapter: decoupled I/O channel
 *
 * Also defines minimal interfaces for sibling-card subsystems that the
 * loop depends on but that may not yet have their own interface files:
 *   - IMemoryStore (from 0.3.1.5.3)
 *   - IEmotionSystem (from 0.3.1.5.4)
 *   - IDriveSystem (from 0.3.1.5.8)
 */

import type {
  AgentConfig,
  AgentOutput,
  AgentPhase,
  BudgetReport,
  LoopMetrics,
  PhaseTiming,
  RawInput,
  TickResult,
} from './types.js';
import type { ExperientialState } from '../conscious-core/types.js';
import type { GracefulTermination } from '../conscious-core/types.js';
import type { Percept } from '../conscious-core/types.js';
import type { Goal } from '../conscious-core/types.js';

// ── Core loop ─────────────────────────────────────────────────

export interface IAgentLoop {
  /** Start the tick loop. Resolves when the loop terminates. */
  start(config: AgentConfig): Promise<void>;
  /** Gracefully stop the loop after the current tick completes. */
  stop(reason?: string): Promise<GracefulTermination>;
  /** Whether the loop is currently running. */
  isRunning(): boolean;
  /** Current accumulated loop metrics. */
  getLoopMetrics(): LoopMetrics;
}

// ── Cognitive budget ───────────────────────────────────────────

export interface ICognitiveBudgetMonitor {
  /** Record start of a phase within the current tick. */
  startPhase(phase: AgentPhase): void;
  /** Record end of a phase; returns timing record. */
  endPhase(phase: AgentPhase): PhaseTiming;
  /** Aggregate report for the current tick. */
  getBudgetReport(): BudgetReport;
  /** True if the phase has exceeded its allocated budget. */
  isPhaseOverBudget(phase: AgentPhase, totalBudgetMs: number): boolean;
  /**
   * True when the current phase should yield to preserve higher-priority phases.
   * MONITOR phase is never truncatable — always returns false for it.
   */
  shouldYieldPhase(phase: AgentPhase, totalBudgetMs: number): boolean;
  /** Reset for a new tick. */
  resetTick(): void;
}

// ── Environment adapter ────────────────────────────────────────

export interface IEnvironmentAdapter {
  readonly id: string;
  /** Non-blocking poll — returns [] if no input available. */
  poll(): Promise<RawInput[]>;
  /** Send output to the environment channel. */
  send(output: AgentOutput): Promise<void>;
  /** Open the channel. */
  connect(): Promise<void>;
  /** Close the channel. */
  disconnect(): Promise<void>;
  /** Whether the channel is currently connected. */
  isConnected(): boolean;
}

// ── Sibling-card subsystem interfaces ─────────────────────────

/**
 * Memory store (0.3.1.5.3) — minimal surface needed by agent loop.
 */
export interface IMemoryStore {
  /** Retrieve memories relevant to the current experiential state. */
  retrieve(state: ExperientialState): Promise<unknown[]>;
  /** Background consolidation of working memory into long-term store. */
  consolidate(): Promise<void>;
}

/**
 * Emotion system (0.3.1.5.4) — minimal surface needed by agent loop.
 */
export interface IEmotionSystem {
  /** Compute emotional response to a percept given current goals and values. */
  appraise(percept: Percept | null, goals: Goal[], values: unknown[]): Promise<unknown>;
}

/**
 * Drive system / intrinsic motivation (0.3.1.5.8) — re-exported from the
 * real interface so agent loop, startup, and all consumers see the full
 * surface: tick(), notifyGoalResult(), getDriveStates(), resetDrive().
 */
export type { IDriveSystem } from '../intrinsic-motivation/interfaces.js';
