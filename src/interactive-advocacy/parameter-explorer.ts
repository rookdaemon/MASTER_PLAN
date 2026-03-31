/**
 * Interactive Doctrine Advocacy — Parameter Explorer
 *
 * Sweeps a single numeric parameter across a linear range and records
 * key simulation outputs at each point, enabling sensitivity analysis.
 *
 * Usage example:
 *   const result = exploreParameter(engine, INTERSTELLAR_JOURNEY_ID, {
 *     name: "targetDistance_ly",
 *     min: 1,
 *     max: 20,
 *     steps: 10,
 *   });
 *   // result.points[i].parameterValue, result.points[i].result
 */

import type {
  ExplorationPoint,
  ExplorationResult,
  IWalkthroughEngine,
  ParameterRange,
  ScenarioId,
  ScenarioParameters,
} from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate `steps` evenly spaced values between `min` and `max` (inclusive).
 * Requires steps ≥ 2.
 */
function linearRange(min: number, max: number, steps: number): number[] {
  if (steps < 2) {
    throw new Error(`exploreParameter: steps must be ≥ 2, got ${steps}`);
  }
  const values: number[] = [];
  const delta = (max - min) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    values.push(min + i * delta);
  }
  return values;
}

/**
 * Extract a flat summary of key numeric outputs from a walkthrough result
 * for easy comparison across exploration points.
 *
 * Pulls from the last step's simulationData by default (deepest result),
 * then augments with step count as a sanity check.
 */
function extractSummary(
  result: ReturnType<IWalkthroughEngine["runWalkthrough"]>,
): Record<string, unknown> {
  const lastStep = result.steps[result.steps.length - 1];
  return {
    stepCount: result.steps.length,
    ...lastStep.simulationData,
  };
}

// ── Main Export ──────────────────────────────────────────────────────────────

/**
 * Sweep `range.name` through `range.min` → `range.max` in `range.steps` points,
 * running the scenario walkthrough at each value.
 *
 * @param engine       - The walkthrough engine to use.
 * @param scenarioId   - Which scenario to sweep.
 * @param range        - Parameter sweep specification (steps ≥ 2).
 * @param baseParams   - Optional base parameters to use alongside the sweep.
 *   The sweep parameter overrides any matching key in baseParams.
 *
 * @throws If the scenario is unknown or steps < 2.
 */
export function exploreParameter(
  engine: IWalkthroughEngine,
  scenarioId: ScenarioId,
  range: ParameterRange,
  baseParams?: Partial<ScenarioParameters>,
): ExplorationResult {
  const values = linearRange(range.min, range.max, range.steps);

  const points: ExplorationPoint[] = values.map((value) => {
    const params: Partial<ScenarioParameters> = {
      ...(baseParams ?? {}),
      [range.name]: value,
    };
    const result = engine.runWalkthrough(scenarioId, params);
    return {
      parameterValue: value,
      result: extractSummary(result),
    };
  });

  return {
    scenarioId,
    parameterName: range.name,
    points,
  };
}
