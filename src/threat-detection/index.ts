/**
 * Threat Detection and Situational Awareness Engine — Public API
 *
 * Barrel export for the threat-detection module.
 *
 * Public surface:
 *   - All data types (Observation, ThreatAssessment, ThreatScenario, …)
 *   - All interface contracts (IThreatDetectionEngine, IScenarioRunner)
 *   - Concrete implementations (DefaultThreatDetectionEngine, DefaultScenarioRunner)
 *   - Bundled example scenarios (asteroid impact, infrastructure failure, cascading degradation)
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  ObservationSource,
  ThreatCategory,
  Observation,
  ThreatAssessment,
  ScenarioEvent,
  ThreatScenario,
  ScenarioResult,
} from './types.js';

export { DegradationTier, AlertLevel } from './types.js';

// ── Interfaces ────────────────────────────────────────────────────────────────
export type {
  IThreatDetectionEngine,
  IScenarioRunner,
} from './interfaces.js';

// ── Implementations ───────────────────────────────────────────────────────────
export {
  DefaultThreatDetectionEngine,
  type Clock,
} from './threat-detection-engine.js';

export { DefaultScenarioRunner } from './scenario-runner.js';

// ── Example Scenarios ─────────────────────────────────────────────────────────
export { asteroidImpactScenario } from './scenarios/asteroid-impact.js';
export { infrastructureFailureScenario } from './scenarios/infrastructure-failure.js';
export { cascadingDegradationScenario } from './scenarios/cascading-degradation.js';
