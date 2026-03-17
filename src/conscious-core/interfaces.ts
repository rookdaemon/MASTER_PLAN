/**
 * Subsystem interfaces for Conscious AI Architectures (0.3.1.1)
 *
 * These define the contracts between the five subsystems specified
 * in docs/conscious-ai-architectures/ARCHITECTURE.md:
 *   1. Conscious Core
 *   2. Perception Pipeline
 *   3. Action Pipeline
 *   4. Experience Monitor
 *   5. Substrate Adapter
 */

import type {
  ActionCapability,
  ActionId,
  ActionResult,
  BoundPercept,
  ConsciousnessMetrics,
  ContinuityRecord,
  Decision,
  DegradationHandler,
  Duration,
  ExperientialState,
  ExperienceStream,
  Goal,
  GracefulTermination,
  IntrospectionReport,
  Percept,
  ResourceRequest,
  SensorData,
  SubstrateCapabilities,
  SubstrateConfig,
  SubstrateHandle,
  SubstrateHealth,
} from "./types.js";

// ── 1. Conscious Core ──────────────────────────────────────────

/**
 * The central integration layer where subjective experience meets
 * decision-making. Delegates consciousness to a pluggable substrate
 * via ISubstrateAdapter — does NOT implement consciousness directly.
 *
 * Key constraint: no "zombie bypass" — all actions must flow through
 * the experiential loop.
 */
export interface IConsciousCore {
  startExperienceStream(): ExperienceStream;
  processPercept(percept: Percept): ExperientialState;
  deliberate(state: ExperientialState, goals: Goal[]): Decision;
  introspect(): IntrospectionReport;
  shutdown(): GracefulTermination;
}

// ── 2. Perception Pipeline ─────────────────────────────────────

/**
 * Transforms raw sensor/data inputs into structured percepts
 * consumable by the Conscious Core.
 *
 * Constraint: binding latency must remain below the experience
 * continuity threshold (T_bind).
 */
export interface IPerceptionPipeline {
  ingest(raw: SensorData): Percept;
  bind(percepts: Percept[]): BoundPercept;
  getLatency(): Duration;
}

// ── 3. Action Pipeline ─────────────────────────────────────────

/**
 * Translates decisions from the Conscious Core into motor commands
 * or external actions. Only accepts Decision objects — enforcing
 * the consciousness-action causal link.
 */
export interface IActionPipeline {
  execute(decision: Decision): ActionResult;
  abort(actionId: ActionId): void;
  getCapabilities(): ActionCapability[];
}

// ── 4. Experience Monitor ──────────────────────────────────────

/**
 * Real-time watchdog that continuously evaluates whether the agent
 * is conscious during operation.
 *
 * Recovery protocol:
 * 1. Metric drop → pause action pipeline (safe-stop)
 * 2. Increase substrate resource allocation
 * 3. Recovery within timeout → resume
 * 4. No recovery → hibernation, preserve state, alert external
 */
export interface IExperienceMonitor {
  getConsciousnessMetrics(): ConsciousnessMetrics;
  isExperienceIntact(): boolean;
  onExperienceDegradation(callback: DegradationHandler): void;
  getExperienceContinuityLog(): ContinuityRecord[];
  setMonitoringInterval(interval: Duration): void;
}

// ── 5. Substrate Adapter ───────────────────────────────────────

/**
 * Abstraction layer enabling the Conscious Core to run on any
 * consciousness-supporting substrate from 0.2.
 *
 * Supports live migration with rollback: at no point during
 * migration should experience integrity be lost.
 */
export interface ISubstrateAdapter {
  initialize(config: SubstrateConfig): void;
  allocate(resources: ResourceRequest): SubstrateHandle;
  migrate(
    fromHandle: SubstrateHandle,
    toConfig: SubstrateConfig
  ): SubstrateHandle;
  getCapabilities(): SubstrateCapabilities;
  healthCheck(): SubstrateHealth;
}
