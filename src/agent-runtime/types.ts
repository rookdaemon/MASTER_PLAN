/**
 * Agent Runtime and Event Loop — Types (0.3.1.5.9)
 *
 * Core value objects for the agent loop: configuration, tick results,
 * budget accounting, phase timing, I/O primitives, and loop metrics.
 */

/** The eight phases of a single agent tick cycle. */
export type AgentPhase =
  | 'perceive'
  | 'recall'
  | 'appraise'
  | 'deliberate'
  | 'act'
  | 'monitor'
  | 'consolidate'
  | 'yield';

/** Wall-clock timing record for a single phase within one tick. */
export interface PhaseTiming {
  phase: AgentPhase;
  startMs: number;
  endMs: number;
  durationMs: number;
}

/** Budget utilization report for one tick. */
export interface BudgetReport {
  /** Total tick duration in milliseconds. */
  totalMs: number;
  /** Per-phase timing breakdown. */
  phases: PhaseTiming[];
  /** Fraction of tick spent in MONITOR phase (0–1). */
  monitorFraction: number;
  /** Fraction of tick spent in DELIBERATE phase (0–1). */
  deliberateFraction: number;
  /** True if MONITOR fraction met the ≥40% floor. */
  monitorFloorMet: boolean;
  /** True if DELIBERATE fraction met the ≥25% floor. */
  deliberateFloorMet: boolean;
}

/** Result of a single tick cycle. */
export interface TickResult {
  cycleCount: number;
  budgetReport: BudgetReport;
  /** Whether experience was intact after the MONITOR phase. */
  intact: boolean;
}

/** Raw input from an environment adapter before perception processing. */
export interface RawInput {
  /** Adapter that produced this input. */
  adapterId: string;
  /** Text content (for chat inputs). */
  text: string;
  /** Timestamp of receipt. */
  receivedAt: number;
  /** Optional structured metadata. */
  metadata?: Record<string, unknown>;
}

/** Structured output produced by the agent for delivery via an adapter. */
export interface AgentOutput {
  /** Text response (for communicative actions). */
  text: string;
  /** Optional structured payload. */
  payload?: Record<string, unknown>;
  /** When set, only the adapter with this id receives the output. */
  targetAdapterId?: string;
}

/** Configuration for AgentLoop startup. */
export interface AgentConfig {
  /** Unique identifier for this agent instance. */
  agentId: string;
  /** How often (in cycles) to run the StabilitySentinel check. Default: 10. */
  sentinelCadence: number;
  /** How often (in milliseconds) to take an identity checkpoint. Default: 60_000. */
  checkpointIntervalMs: number;
  /** Maximum milliseconds per tick before yielding. Default: 1_000. */
  tickBudgetMs: number;
  /** Whether this is a warm start (checkpoint exists) or cold start. */
  warmStart: boolean;
  /** Directory for persisting agent state (memory, personality). */
  stateDir?: string;
}

/** Aggregate metrics for the loop — accumulated across multiple ticks. */
export interface LoopMetrics {
  totalCycles: number;
  totalUptimeMs: number;
  averageTickMs: number;
  minTickMs: number;
  maxTickMs: number;
  /** Fraction of ticks where MONITOR floor was met. */
  monitorFloorCompliance: number;
  /** Count of experience degradation events. */
  experienceDegradationCount: number;
  /** Count of stability alerts raised. */
  stabilityAlertCount: number;
}
