/**
 * Interactive Doctrine Advocacy — Walkthrough Engine
 *
 * Creates an IWalkthroughEngine from a collection of ScenarioDefinitions.
 * The engine merges caller-supplied parameters with scenario defaults,
 * then delegates to the scenario's pure runWalkthrough function.
 */

import type {
  IWalkthroughEngine,
  ScenarioDefinition,
  ScenarioId,
  ScenarioParameters,
  WalkthroughResult,
} from "./types.js";

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a walkthrough engine backed by the supplied scenario definitions.
 *
 * @param scenarios - Array of scenario definitions to register. Duplicate
 *   IDs are silently deduplicated (first definition wins).
 */
export function createWalkthroughEngine(
  scenarios: ReadonlyArray<ScenarioDefinition>,
): IWalkthroughEngine {
  // Build an immutable lookup map (first definition wins on duplicate IDs)
  const registry = new Map<string, ScenarioDefinition>();
  for (const scenario of scenarios) {
    if (!registry.has(scenario.id as string)) {
      registry.set(scenario.id as string, scenario);
    }
  }

  return {
    runWalkthrough(
      scenarioId: ScenarioId,
      params?: Partial<ScenarioParameters>,
    ): WalkthroughResult {
      const definition = registry.get(scenarioId as string);
      if (!definition) {
        throw new Error(
          `WalkthroughEngine: unknown scenario "${scenarioId}". ` +
            `Registered IDs: ${[...registry.keys()].join(", ")}`,
        );
      }

      // Merge defaults with caller overrides — caller values take precedence
      const mergedParams = { ...definition.defaultParameters } as Record<string, string | number | boolean>;
      for (const [k, v] of Object.entries(params ?? {})) {
        if (v !== undefined) mergedParams[k] = v;
      }

      return definition.runWalkthrough(mergedParams);
    },

    getScenario(scenarioId: ScenarioId): ScenarioDefinition | null {
      return registry.get(scenarioId as string) ?? null;
    },

    listScenarios(): ReadonlyArray<ScenarioDefinition> {
      return [...registry.values()];
    },
  };
}
