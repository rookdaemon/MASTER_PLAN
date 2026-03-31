/**
 * Threat Detection and Situational Awareness Engine — Interface Contracts
 *
 * Two cooperating interfaces implement the threat detection pipeline:
 *   1. IThreatDetectionEngine — processes a single observation and returns an assessment
 *   2. IScenarioRunner        — processes a full scenario timeline, returns all assessments
 *
 * Both depend on the world-model and graceful-degradation subsystems injected
 * via IThreatDetectionEngine so that they can be stubbed in tests.
 */

import type {
  Observation,
  ThreatAssessment,
  ThreatScenario,
  ScenarioResult,
} from './types.js';

// ── 1. Threat Detection Engine ────────────────────────────────────────────────

/**
 * Processes a single observation through the threat detection pipeline.
 *
 * On each call to assess():
 *   1. The observation is translated into a belief update in the world-model.
 *   2. The causal model predicts consequences of the observed event.
 *   3. Severity is mapped to bio/synth health proxies.
 *   4. classifyDegradationTier() produces a DegradationTier.
 *   5. The tier is mapped to an AlertLevel.
 *   6. A consistency check is run over all current beliefs.
 *   7. A ThreatAssessment is returned.
 *
 * The engine is stateful: subsequent observations accumulate in the world-model,
 * so rising threat levels are reflected in escalating degradation tiers.
 */
export interface IThreatDetectionEngine {
  /**
   * Process an observation and return a threat assessment.
   *
   * @param observation  The discrete event or sensor reading to assess.
   * @param now          Optional override for the current time (ms since epoch).
   *                     Defaults to Date.now(). Useful for deterministic tests.
   */
  assess(observation: Observation, now?: number): ThreatAssessment;

  /**
   * Reset the engine's internal world-model state (beliefs, entities, causal
   * predictions). Useful between scenario runs or at the start of a new session.
   */
  reset(): void;
}

// ── 2. Scenario Runner ────────────────────────────────────────────────────────

/**
 * Runs a complete ThreatScenario by feeding its timeline of observations into
 * an IThreatDetectionEngine and collecting the resulting assessments.
 *
 * The runner is stateless with respect to scenarios — it delegates all state
 * accumulation to the injected engine.
 */
export interface IScenarioRunner {
  /**
   * Execute a scenario and return the full result set.
   *
   * Events are processed in ascending timeOffsetMs order. The engine is reset
   * before the scenario starts so that each run begins from a clean state.
   *
   * @param scenario   The scenario to execute.
   * @param baseTimeMs Optional base timestamp (ms since epoch) for the scenario.
   *                   Defaults to 0 for deterministic scenario output.
   */
  run(scenario: ThreatScenario, baseTimeMs?: number): ScenarioResult;
}
