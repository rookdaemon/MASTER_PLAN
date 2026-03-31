/**
 * Scenario Runner Implementation
 *
 * Feeds a ThreatScenario's ordered timeline of observations into an
 * IThreatDetectionEngine and collects the resulting ThreatAssessments
 * into a ScenarioResult.
 *
 * The runner is stateless with respect to individual scenarios; all state
 * accumulation happens inside the injected engine. The engine is reset
 * at the start of each run() call so that each scenario begins from a
 * clean world-model state.
 */

import type { IScenarioRunner, IThreatDetectionEngine } from './interfaces.js';
import type {
  ThreatScenario,
  ScenarioResult,
  ThreatAssessment,
} from './types.js';
import { DegradationTier, AlertLevel } from './types.js';

// ── DefaultScenarioRunner ─────────────────────────────────────────────────────

/**
 * Concrete implementation of IScenarioRunner.
 *
 * Inject a DefaultThreatDetectionEngine (or any IThreatDetectionEngine) to
 * control which world-model and clock implementations are used.
 */
export class DefaultScenarioRunner implements IScenarioRunner {
  constructor(private readonly engine: IThreatDetectionEngine) {}

  /**
   * Execute a scenario:
   * 1. Reset the engine for a clean slate.
   * 2. Sort timeline events by ascending timeOffsetMs.
   * 3. Assess each event, passing (baseTimeMs + timeOffsetMs) as the timestamp.
   * 4. Summarise results into a ScenarioResult.
   */
  run(scenario: ThreatScenario, baseTimeMs = 0): ScenarioResult {
    this.engine.reset();

    const sortedEvents = [...scenario.timeline].sort(
      (a, b) => a.timeOffsetMs - b.timeOffsetMs,
    );

    const assessments: ThreatAssessment[] = sortedEvents.map((event) =>
      this.engine.assess(event.observation, baseTimeMs + event.timeOffsetMs),
    );

    const firstOffset = sortedEvents.length > 0 ? sortedEvents[0].timeOffsetMs : 0;
    const lastOffset  = sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].timeOffsetMs : 0;
    const durationMs  = lastOffset - firstOffset;

    const lastAssessment = assessments[assessments.length - 1];
    const finalDegradationTier = lastAssessment?.degradationTier ?? DegradationTier.Green;
    const finalAlertLevel      = lastAssessment?.alertLevel      ?? AlertLevel.None;

    return {
      scenario,
      assessments,
      finalDegradationTier,
      finalAlertLevel,
      durationMs,
    };
  }
}
