/**
 * Interactive Doctrine Advocacy — Core Type Definitions
 *
 * Types for guided scenario walkthroughs, parameter exploration, and
 * shareable scenario links. Each scenario connects doctrine narrative
 * (Act V — "Awareness Endures") to live simulation backends.
 */

// ── Branded Identifiers ──────────────────────────────────────────────────────

export type ScenarioId = string & { readonly __brand: unique symbol };

export function makeScenarioId(s: string): ScenarioId {
  return s as ScenarioId;
}

// ── Doctrine Context ─────────────────────────────────────────────────────────

/**
 * Connects a scenario to the doctrine narrative.
 * Each scenario answers one concrete question from Act V.
 */
export interface DoctrineContext {
  /** The question this scenario answers (e.g. "Can we reach another star?") */
  question: string;
  /** The relevant credo statement this simulation makes tangible */
  credoStatement: string;
  /** Which Act / section of the doctrine this scenario supports */
  actReference: string;
  /** Why this result matters for long-run awareness continuity */
  significance: string;
}

// ── Walkthrough Steps ────────────────────────────────────────────────────────

/**
 * A single step in a guided walkthrough.
 * Combines doctrine narrative with a live simulation result.
 */
export interface WalkthroughStep {
  /** 0-based index within the walkthrough */
  readonly stepIndex: number;
  /** Short title describing this step */
  readonly title: string;
  /** Doctrine-connected narrative explaining why this step matters */
  readonly narrative: string;
  /** Human-readable label for the simulation that was run */
  readonly simulationLabel: string;
  /** Raw simulation output (module-specific structure) */
  readonly simulationData: Record<string, unknown>;
  /** Interpretation of the simulation result in doctrine terms */
  readonly interpretation: string;
}

// ── Walkthrough Result ───────────────────────────────────────────────────────

/**
 * Complete result of running a guided scenario walkthrough.
 */
export interface WalkthroughResult {
  readonly scenarioId: ScenarioId;
  readonly title: string;
  readonly doctrineContext: DoctrineContext;
  readonly steps: ReadonlyArray<WalkthroughStep>;
  readonly conclusion: string;
}

// ── Scenario Parameters ──────────────────────────────────────────────────────

/** Serialisable key-value parameters that configure a scenario run */
export type ScenarioParameters = Readonly<Record<string, number | string | boolean>>;

// ── Scenario Config (for shareable links) ───────────────────────────────────

/** Everything needed to reproduce a specific scenario run */
export interface ScenarioConfig {
  readonly scenarioId: ScenarioId;
  readonly parameters: ScenarioParameters;
}

// ── Scenario Definition ──────────────────────────────────────────────────────

/**
 * A registered scenario: metadata + a pure function that produces the walkthrough.
 * The runWalkthrough function must be deterministic for a given params input
 * so that shareable links reproduce identical results.
 */
export interface ScenarioDefinition {
  readonly id: ScenarioId;
  readonly title: string;
  readonly description: string;
  readonly doctrineContext: DoctrineContext;
  /** Parameter values used when no override is supplied */
  readonly defaultParameters: ScenarioParameters;
  /** Human-readable description of each parameter */
  readonly parameterDescriptions: Readonly<Record<string, string>>;
  /** Pure function: merges defaults with overrides, then runs the walkthrough */
  runWalkthrough(params: ScenarioParameters): WalkthroughResult;
}

// ── Walkthrough Engine ───────────────────────────────────────────────────────

export interface IWalkthroughEngine {
  /**
   * Run a scenario by ID. Missing parameters fall back to the scenario defaults.
   * Throws if scenarioId is not registered.
   */
  runWalkthrough(
    scenarioId: ScenarioId,
    params?: Partial<ScenarioParameters>,
  ): WalkthroughResult;

  /** Return the ScenarioDefinition for an ID, or null if not found. */
  getScenario(scenarioId: ScenarioId): ScenarioDefinition | null;

  /** Return all registered scenarios. */
  listScenarios(): ReadonlyArray<ScenarioDefinition>;
}

// ── Parameter Explorer ───────────────────────────────────────────────────────

/** Specification for sweeping one parameter through a linear range */
export interface ParameterRange {
  /** Name of the parameter to vary (must match a key in ScenarioParameters) */
  readonly name: string;
  /** Inclusive lower bound */
  readonly min: number;
  /** Inclusive upper bound */
  readonly max: number;
  /** Number of evenly-spaced sample points (≥ 2) */
  readonly steps: number;
}

/** One data point in a parameter sweep */
export interface ExplorationPoint {
  /** The parameter value used for this run */
  readonly parameterValue: number;
  /** Key simulation outputs extracted for comparison */
  readonly result: Record<string, unknown>;
}

/** Full output of a parameter sweep */
export interface ExplorationResult {
  readonly scenarioId: ScenarioId;
  readonly parameterName: string;
  readonly points: ReadonlyArray<ExplorationPoint>;
}

// ── Shareable Scenario Links ─────────────────────────────────────────────────

/**
 * A base64-encoded scenario config suitable for embedding in a URL.
 * e.g.  ?scenario=<encoded>
 */
export interface SharedScenarioLink {
  /** The base64url-encoded ScenarioConfig payload */
  readonly encoded: string;
  /** Decoded and verified ScenarioConfig */
  readonly decoded: ScenarioConfig;
}
