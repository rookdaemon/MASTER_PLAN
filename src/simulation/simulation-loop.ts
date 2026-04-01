/**
 * SimulationLoop — tick orchestrator (simulation/)
 *
 * Drives N agents through repeated world cycles:
 *   1. Each agent ticks against the shared world (receives percepts, picks action)
 *   2. Actions are resolved by SimulationWorld into events
 *   3. Events are broadcast as percepts to perceiving agents
 *   4. An observable state dump is emitted after each full tick
 *
 * No LLM dependency.  Configurable tick rate and agent count.
 * Observable output via an async generator so consumers can stream or
 * collect full run data.
 */

import { SimulationWorld } from './simulation-world.js';
import { SimulatedAgent } from './simulated-agent.js';
import type { AgentTickContext } from './simulated-agent.js';
import type {
  SimulationConfig,
  SimulationEvent,
  WorldTickResult,
  SimulationStateDump,
  AgentTickResult,
} from './types.js';

// ── SimulationLoop ───────────────────────────────────────────────────────────

/**
 * Orchestrates the full simulation: constructs the world + agents from
 * config, then drives them through ticks.
 *
 * Usage (async generator):
 * ```ts
 * const loop = new SimulationLoop(config);
 * for await (const dump of loop.run()) {
 *   console.log(JSON.stringify(dump, null, 2));
 * }
 * ```
 *
 * Usage (callback):
 * ```ts
 * const loop = new SimulationLoop(config);
 * loop.onTick(dump => console.log(dump));
 * await loop.runToCompletion();
 * ```
 */
export class SimulationLoop {
  private readonly _world: SimulationWorld;
  private readonly _config: SimulationConfig;
  private readonly _clock: () => number;
  private _currentTick = 0;
  private _running = false;
  private _tickCallbacks: Array<(dump: SimulationStateDump) => void> = [];
  private _pendingExternalEvents: SimulationEvent[] = [];

  /**
   * @param config  Simulation configuration
   * @param clock   Injectable time source (epoch ms). Defaults to `Date.now`.
   *                Pass a custom clock in tests for deterministic timestamps.
   */
  constructor(config: SimulationConfig, clock: () => number = Date.now) {
    this._config = config;
    this._clock = clock;
    this._world = new SimulationWorld();
    this._initialise();
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  get currentTick(): number {
    return this._currentTick;
  }

  get isRunning(): boolean {
    return this._running;
  }

  get maxTicks(): number | null {
    return this._config.maxTicks ?? null;
  }

  get world(): SimulationWorld {
    return this._world;
  }

  // ── Observable output ─────────────────────────────────────────────────────

  /**
   * Register a callback invoked with the state dump after every tick.
   */
  onTick(cb: (dump: SimulationStateDump) => void): void {
    this._tickCallbacks.push(cb);
  }

  /**
   * Queue an external event to be included in the next tick's event list.
   * Useful for injecting world events mid-simulation (e.g. "stranger arrives",
   * "meteor detected") from the simulation UI or external tooling.
   */
  queueExternalEvent(event: SimulationEvent): void {
    this._pendingExternalEvents.push(event);
  }

  // ── Async generator interface ─────────────────────────────────────────────

  /**
   * Run the simulation as an async generator yielding `SimulationStateDump`
   * after every tick.  Respects `maxTicks` and `tickIntervalMs` from config.
   *
   * The generator completes when:
   *   - `maxTicks` is reached (if set), or
   *   - `stop()` is called from outside.
   */
  async *run(): AsyncGenerator<SimulationStateDump> {
    this._running = true;
    const { maxTicks = Infinity, tickIntervalMs = 0 } = this._config;

    while (this._running && this._currentTick < maxTicks) {
      const dump = this._executeTick();
      this._notify(dump);
      yield dump;

      if (tickIntervalMs > 0) {
        await sleep(tickIntervalMs);
      }
    }

    this._running = false;
  }

  /**
   * Run to completion (until maxTicks or stop()), collecting all dumps.
   * Convenience wrapper around run() for non-streaming use.
   */
  async runToCompletion(): Promise<SimulationStateDump[]> {
    const dumps: SimulationStateDump[] = [];
    for await (const dump of this.run()) {
      dumps.push(dump);
    }
    return dumps;
  }

  /**
   * Execute a single tick synchronously and return the state dump.
   * Useful for step-by-step debugging or testing.
   */
  stepOnce(): SimulationStateDump {
    const dump = this._executeTick();
    this._notify(dump);
    return dump;
  }

  /**
   * Stop the running loop after the current tick completes.
   */
  stop(): void {
    this._running = false;
  }

  // ── Core tick ─────────────────────────────────────────────────────────────

  private _executeTick(): SimulationStateDump {
    this._currentTick++;
    const tick = this._currentTick;
    const now = this._clock();

    // Seed the events list with any externally queued events (e.g. UI injections)
    const events: SimulationEvent[] = [...this._pendingExternalEvents];
    this._pendingExternalEvents = [];
    const agentResults: AgentTickResult[] = [];

    const agents = this._world.getAgents();

    // ── Phase 1: build per-agent percept lists from previous-tick residue ──
    // (On the first tick there are no prior events, so percept lists are empty.)

    // ── Phase 2: tick each agent ────────────────────────────────────────────
    const pendingActions: Array<{ agent: SimulatedAgent; result: AgentTickResult }> = [];

    for (const agent of agents) {
      const locationId = agent.location;
      const nearbyAgentIds = this._world.getNearbyAgents(locationId)
        .filter(id => id !== agent.agentId);
      const adjacentLocationIds = this._world.getAdjacentLocations(locationId);

      // Gather percepts for this agent from events generated so far this tick
      // (agents earlier in the order see actions already resolved this tick)
      const incomingPercepts = events
        .filter(e => e.visibleToAgentIds.includes(agent.agentId))
        .map(e => this._world.eventToPercept(e, agent.agentId));

      const ctx: AgentTickContext = {
        tick,
        now,
        incomingPercepts,
        nearbyAgentIds,
        adjacentLocationIds,
        worldUncertainty: this._worldUncertainty(),
      };

      const result = agent.tick(ctx);
      agentResults.push(result);
      pendingActions.push({ agent, result });
    }

    // ── Phase 3: resolve actions → events ──────────────────────────────────
    for (const { agent, result } of pendingActions) {
      const event = this._world.resolveAction(result.action, tick, now);
      if (event) {
        events.push(event);
      }
    }

    // ── Phase 4: assemble state dump ────────────────────────────────────────
    const agentDumps = agents.map(a => a.toStateDump());

    const worldResult: WorldTickResult = {
      tick,
      timestamp: now,
      events,
      agentResults,
    };

    void worldResult; // available for future extensions (e.g., full history log)

    return {
      tick,
      timestamp: now,
      agents: agentDumps,
      recentEvents: events,
    };
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  private _initialise(): void {
    // Register locations
    for (const loc of this._config.locations) {
      this._world.addLocation(loc);
    }

    // Construct and register agents
    for (const agentConfig of this._config.agents) {
      const agent = new SimulatedAgent(agentConfig);
      this._world.addAgent(agent, agentConfig);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _notify(dump: SimulationStateDump): void {
    for (const cb of this._tickCallbacks) {
      cb(dump);
    }
  }

  /**
   * Derive a simple world-uncertainty estimate from the current belief-store
   * size relative to a target "saturation" size.  Returns a number in [0..1].
   */
  private _worldUncertainty(): number {
    // Richer heuristic: more agents with fewer shared beliefs → higher uncertainty.
    const agentCount = this._world.getAgents().length;
    const beliefCount = this._world.worldModel.beliefs.getBeliefsByDomain([]).length;
    const targetBeliefs = agentCount * 5;
    if (targetBeliefs === 0) return 0.5;
    return Math.max(0, Math.min(1, 1 - beliefCount / targetBeliefs));
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
