/**
 * SimulationManager — multi-simulation registry (simulation/)
 *
 * Manages a collection of named SimulationLoop instances so the agent can
 * maintain several simulations in parallel and refer to them by name.
 *
 * Responsibilities:
 *   - Create / remove named simulations (from built-in scenarios or raw config)
 *   - Advance simulations by N ticks (synchronous step-wise execution)
 *   - Adjust run-time parameters (tick interval, max ticks, NPC traits)
 *   - Expose per-agent and world-level state for inspection
 *   - Produce SimulationSnapshot values for persistence
 *   - Restore simulations from SimulationSnapshot values
 *
 * Clock is injectable for deterministic tests.
 */

import { SimulationLoop } from './simulation-loop.js';
import { createVillageConfig } from './scenarios/village.js';
import { createColonyConfig } from './scenarios/colony.js';
import type {
  AgentConfig,
  AgentId,
  AgentStateDump,
  SimulationConfig,
  SimulationEvent,
  SimulationLocation,
  SimulationSnapshot,
  SimulationStateDump,
} from './types.js';

// ── SimulationManager ─────────────────────────────────────────────────────────

export class SimulationManager {
  private readonly _loops = new Map<string, SimulationLoop>();
  private readonly _configs = new Map<string, SimulationConfig>();
  private readonly _clock: () => number;

  constructor(clock: () => number = Date.now) {
    this._clock = clock;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Create a new named simulation from an explicit config.
   * Throws if a simulation with `name` already exists.
   */
  createSimulation(name: string, config: SimulationConfig): void {
    if (this._loops.has(name)) {
      throw new Error(
        `Simulation "${name}" already exists. Call removeSimulation first to replace it.`,
      );
    }
    const loop = new SimulationLoop(config, this._clock);
    this._loops.set(name, loop);
    this._configs.set(name, config);
  }

  /**
   * Create a simulation from a built-in scenario name.
   * Supported scenarios: `'village'`, `'colony'`.
   */
  createSimulationFromScenario(
    name: string,
    scenario: string,
    overrides: Partial<Pick<SimulationConfig, 'tickIntervalMs' | 'maxTicks'>> = {},
  ): void {
    let base: SimulationConfig;
    if (scenario === 'village') {
      base = createVillageConfig();
    } else if (scenario === 'colony') {
      base = createColonyConfig();
    } else {
      throw new Error(`Unknown scenario "${scenario}". Supported: "village", "colony".`);
    }
    const config: SimulationConfig = { ...base, ...overrides };
    this.createSimulation(name, config);
  }

  /**
   * Return the list of built-in scenarios available for use with
   * `createSimulationFromScenario`.
   */
  listScenarios(): ScenarioDescriptor[] {
    return BUILT_IN_SCENARIOS;
  }

  /** Remove a simulation from the registry. Returns true if it existed. */
  removeSimulation(name: string): boolean {
    const existed = this._loops.has(name);
    this._loops.delete(name);
    this._configs.delete(name);
    return existed;
  }

  /** List names of all currently active (in-memory) simulations. */
  listActiveSimulations(): string[] {
    return [...this._loops.keys()];
  }

  // ── Tick execution ────────────────────────────────────────────────────────

  /**
   * Advance a simulation by `ticks` steps synchronously.
   * Returns the state dump produced after *each* tick (array length === ticks).
   */
  tickSimulation(name: string, ticks: number = 1): SimulationStateDump[] {
    const loop = this._requireLoop(name);
    const count = Math.min(Math.max(1, Math.floor(ticks)), 1000);
    const dumps: SimulationStateDump[] = [];
    for (let i = 0; i < count; i++) {
      dumps.push(loop.stepOnce());
    }
    return dumps;
  }

  // ── Parameter control ─────────────────────────────────────────────────────

  /**
   * Adjust a run-time parameter for the named simulation.
   * Supported keys:
   *   - `tick_interval_ms` (number) — rebuilds loop from config
   *   - `max_ticks`        (number) — rebuilds loop from config
   *   - `npc_trait`        ({ agentId, trait, value }) — mutates a live NPC trait
   */
  setParameter(name: string, key: string, value: unknown): void {
    const loop = this._requireLoop(name);
    const config = this._configs.get(name)!;

    if (key === 'tick_interval_ms') {
      const ms = _requireNumber(key, value);
      this._rebuildLoop(name, { ...config, tickIntervalMs: ms });
      return;
    }

    if (key === 'max_ticks') {
      const max = _requireNumber(key, value);
      this._rebuildLoop(name, { ...config, maxTicks: Math.floor(max) });
      return;
    }

    if (key === 'npc_trait') {
      const params = _requireNpcTraitParams(value);
      const agent = loop.world.getAgent(params.agentId);
      if (!agent) {
        throw new Error(`Agent "${params.agentId}" not found in simulation "${name}".`);
      }
      const now = this._clock();
      agent.setTrait(params.trait, params.value, now);
      return;
    }

    throw new Error(
      `Unknown parameter key "${key}". Supported: tick_interval_ms, max_ticks, npc_trait.`,
    );
  }

  /**
   * Inject an external world event into the named simulation.
   * The event will be visible to all agents and picked up in the next tick's
   * percept list.
   *
   * @param name         Name of the simulation.
   * @param description  Human-readable description of the event.
   * @param locationId   Location where the event takes place.
   * @param valenceHint  Optional emotional valence hint (−1..1). Default: 0.
   * @param noveltyHint  Optional novelty hint (0..1). Default: 0.8.
   */
  injectEvent(
    name: string,
    opts: {
      description: string;
      locationId: string;
      valenceHint?: number;
      noveltyHint?: number;
    },
  ): void {
    const loop = this._requireLoop(name);
    const now = this._clock();
    const tick = loop.currentTick;

    const allAgentIds = loop.world.getAgents().map(a => a.agentId);

    const event: SimulationEvent = {
      id: `ext-${now}-${tick}`,
      tick,
      timestamp: now,
      actorId: 'world',
      locationId: opts.locationId,
      description: opts.description,
      visibleToAgentIds: allAgentIds,
      valenceHint: opts.valenceHint ?? 0,
      noveltyHint: opts.noveltyHint ?? 0.8,
    };

    loop.queueExternalEvent(event);
  }

  // ── Inspection ────────────────────────────────────────────────────────────

  /**
   * Return the world-level state: all agent state dumps, tick counter, locations,
   * and a sample of world-model beliefs.
   */
  inspectWorld(name: string): WorldInspection {
    const loop = this._requireLoop(name);
    const agents = loop.world.getAgents().map(a => a.toStateDump());
    const beliefs = loop.world.worldModel.beliefs.getBeliefsByDomain([]);
    const locations = loop.world.getLocations();
    return {
      simulationName: name,
      currentTick: loop.currentTick,
      isRunning: loop.isRunning,
      agents,
      locations,
      beliefCount: beliefs.length,
      beliefSample: beliefs.slice(0, 10).map(b => ({
        content: b.content,
        confidence: b.confidence,
        domains: b.domainTags,
      })),
    };
  }

  /**
   * Return detailed state for a specific NPC: mood, traits, all drives,
   * recent episodic memories, and trust scores.
   */
  inspectNpc(simulationName: string, agentId: AgentId): NpcInspection {
    const loop = this._requireLoop(simulationName);
    const agent = loop.world.getAgent(agentId);
    if (!agent) {
      throw new Error(
        `Agent "${agentId}" not found in simulation "${simulationName}".`,
      );
    }

    const dump = agent.toStateDump();

    const driveStates = agent.getDriveSystem().getDriveStates();
    const drives = [...driveStates.entries()].map(([type, state]) => ({
      type,
      strength: state.strength,
      active: state.active,
    }));

    const traitProfile = agent.getPersonality().getTraitProfile();
    const traits: Record<string, number> = {};
    for (const [id, dim] of traitProfile.traits) {
      traits[id] = dim.value;
    }

    const knownEntities = agent.getSocialCognition().getKnownEntities();
    const trustScores = knownEntities.map(e => ({
      entityId: e.entityId,
      trustScore: agent.getSocialCognition().getTrustScore(e.entityId).trustScore,
    }));

    const memories = agent.getMemory().episodic.all().slice(-10).map(e => ({
      id: e.id,
      recordedAt: e.recordedAt,
      content: e.outcomeObserved,
      valence: e.emotionalTrace.valence,
      arousal: e.emotionalTrace.arousal,
    }));

    return {
      agentId: dump.agentId,
      name: dump.name,
      location: dump.location,
      mood: dump.mood,
      traits,
      drives,
      recentMemories: memories,
      trustScores,
    };
  }

  // ── Snapshot / restore ────────────────────────────────────────────────────

  /** Produce a SimulationSnapshot for persistence. */
  snapshotSimulation(name: string): SimulationSnapshot {
    const loop = this._requireLoop(name);
    const config = this._configs.get(name)!;
    const agentDumps: AgentStateDump[] = loop.world.getAgents().map(a => a.toStateDump());
    return {
      name,
      config,
      tickCount: loop.currentTick,
      agentDumps,
      snapshotAt: this._clock(),
    };
  }

  /**
   * Restore a simulation from a snapshot.
   * If a simulation with the same name already exists it is replaced.
   * The loop is rebuilt from `snapshot.config` — NPC cognitive state restarts.
   */
  restoreSimulation(snapshot: SimulationSnapshot): void {
    this._loops.delete(snapshot.name);
    this._configs.delete(snapshot.name);
    const loop = new SimulationLoop(snapshot.config, this._clock);
    this._loops.set(snapshot.name, loop);
    this._configs.set(snapshot.name, snapshot.config);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _requireLoop(name: string): SimulationLoop {
    const loop = this._loops.get(name);
    if (!loop) {
      throw new Error(
        `Simulation "${name}" not found. Use create_simulation or load_simulation first.`,
      );
    }
    return loop;
  }

  private _rebuildLoop(name: string, newConfig: SimulationConfig): void {
    this._loops.set(name, new SimulationLoop(newConfig, this._clock));
    this._configs.set(name, newConfig);
  }
}

// ── Inspection result types ───────────────────────────────────────────────────

/** Describes a built-in simulation scenario. */
export interface ScenarioDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultAgentCount: number;
}

/** Built-in scenarios available via `createSimulationFromScenario`. */
export const BUILT_IN_SCENARIOS: ScenarioDescriptor[] = [
  {
    id: 'village',
    name: 'Village',
    description: 'Five villagers with distinct personalities exploring a small medieval village.',
    defaultAgentCount: 5,
  },
  {
    id: 'colony',
    name: 'Off-World Colony',
    description: 'Six colonists managing life aboard a remote outpost — command, engineering, and survival.',
    defaultAgentCount: 6,
  },
];

export interface WorldInspection {
  readonly simulationName: string;
  readonly currentTick: number;
  readonly isRunning: boolean;
  readonly agents: AgentStateDump[];
  readonly locations: SimulationLocation[];
  readonly beliefCount: number;
  readonly beliefSample: Array<{ content: string; confidence: number; domains: string[] }>;
}

export interface NpcInspection {
  readonly agentId: AgentId;
  readonly name: string;
  readonly location: string;
  readonly mood: { valence: number; arousal: number };
  readonly traits: Record<string, number>;
  readonly drives: Array<{ type: string; strength: number; active: boolean }>;
  readonly recentMemories: Array<{
    id: string;
    recordedAt: number;
    content: string | null;
    valence: number;
    arousal: number;
  }>;
  readonly trustScores: Array<{ entityId: string; trustScore: number }>;
}

// ── Custom config builder ─────────────────────────────────────────────────────

export function buildCustomConfig(
  agents: AgentConfig[],
  locations: SimulationLocation[],
  overrides: Partial<Pick<SimulationConfig, 'tickIntervalMs' | 'maxTicks'>> = {},
): SimulationConfig {
  return {
    agents,
    locations,
    tickIntervalMs: overrides.tickIntervalMs ?? 0,
    maxTicks: overrides.maxTicks,
  };
}

// ── Internal validation helpers ───────────────────────────────────────────────

function _requireNumber(key: string, value: unknown): number {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new TypeError(`Parameter "${key}" must be a finite number.`);
  }
  return value;
}

interface NpcTraitParams { agentId: string; trait: string; value: number }

function _requireNpcTraitParams(value: unknown): NpcTraitParams {
  if (
    typeof value !== 'object' || value === null ||
    typeof (value as Record<string, unknown>)['agentId'] !== 'string' ||
    typeof (value as Record<string, unknown>)['trait'] !== 'string' ||
    typeof (value as Record<string, unknown>)['value'] !== 'number'
  ) {
    throw new TypeError(
      'npc_trait value must be an object { agentId: string, trait: string, value: number }.',
    );
  }
  const v = value as Record<string, unknown>;
  return {
    agentId: v['agentId'] as string,
    trait: v['trait'] as string,
    value: v['value'] as number,
  };
}
