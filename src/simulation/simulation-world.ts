/**
 * SimulationWorld — shared world state (simulation/)
 *
 * Wraps WorldModel with:
 *   - Entity registry (NPC agents, objects, locations)
 *   - Action resolver (NPC action → world state change → percepts for others)
 *   - Event broadcaster (which agents perceive which events)
 *
 * No LLM dependency — action resolution is deterministic.
 */

import { WorldModel } from '../world-model/world-model.js';
import { BeliefStore } from '../world-model/belief-store.js';
import { EntityModelStore } from '../world-model/entity-model-store.js';
import { CausalModel } from '../world-model/causal-model.js';
import { SituationAwareness } from '../world-model/situation-awareness.js';

import type { IWorldModel } from '../world-model/interfaces.js';
import type { ObservationEvent } from '../world-model/types.js';
import type { Percept } from '../conscious-core/types.js';

import type {
  AgentId,
  LocationId,
  SimulationLocation,
  WorldEntity,
  SimulationAction,
  SimulationEvent,
  AgentConfig,
} from './types.js';
import type { SimulatedAgent } from './simulated-agent.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

let _eventCounter = 0;
function makeEventId(now: number): string {
  return `evt-${now}-${(++_eventCounter).toString(36)}`;
}

// ── SimulationWorld ──────────────────────────────────────────────────────────

/**
 * Manages the shared world state across all simulated agents.
 *
 * Responsibilities:
 *   - Maintain a registry of agents, objects, and locations
 *   - Resolve agent actions into world-state changes and events
 *   - Determine event visibility (broadcast to co-located / adjacent agents)
 *   - Provide per-agent percept lists from visible events
 *   - Expose the underlying WorldModel for belief/entity queries
 */
export class SimulationWorld {
  /** The underlying world-model belief/entity/causal subsystem. */
  readonly worldModel: IWorldModel;

  private readonly _locations = new Map<LocationId, SimulationLocation>();
  private readonly _agents = new Map<AgentId, SimulatedAgent>();
  private readonly _entities = new Map<string, WorldEntity>();

  constructor() {
    const beliefs = new BeliefStore();
    const entities = new EntityModelStore();
    const causal = new CausalModel();
    const situation = new SituationAwareness(beliefs, entities);
    this.worldModel = new WorldModel({ beliefs, entities, causal, situation });
  }

  // ── Registry management ──────────────────────────────────────────────────

  /**
   * Register a location with the world.
   */
  addLocation(location: SimulationLocation): void {
    this._locations.set(location.id, location);
    this._entities.set(location.id, {
      id: location.id,
      kind: 'location',
      name: location.name,
      description: location.description,
      currentLocationId: location.id,
    });
  }

  /**
   * Register an agent with the world and seed the world model with an entity
   * record for it.
   */
  addAgent(agent: SimulatedAgent, config: AgentConfig, now: number = Date.now()): void {
    this._agents.set(agent.agentId, agent);
    this._entities.set(agent.agentId, {
      id: agent.agentId,
      kind: 'agent',
      name: agent.name,
      description: `NPC agent: ${agent.name}`,
      currentLocationId: config.initialLocation,
    });

    // Seed WorldModel entity record
    const obs: ObservationEvent = {
      timestamp: now,
      description: `Agent ${agent.name} joined the simulation.`,
      deltaConfidence: 0.5,
    };
    this.worldModel.entities.upsertEntity(agent.agentId, obs, {
      inferredGoals: [],
      trustLevel: 0.5,
      consciousnessStatus: {
        verdict: 'probable',
        evidenceBasis: 'simulated NPC with cognitive subsystems',
        metricsAvailable: false,
        treatAsConscious: true,
      },
      knownCapabilities: ['move', 'interact', 'explore', 'rest', 'observe'],
      lastObservedState: null,
    });
  }

  /**
   * Return all registered agents.
   */
  getAgents(): SimulatedAgent[] {
    return [...this._agents.values()];
  }

  /**
   * Return a specific agent, or undefined if not found.
   */
  getAgent(agentId: AgentId): SimulatedAgent | undefined {
    return this._agents.get(agentId);
  }

  /**
   * Return a location by ID.
   */
  getLocation(locationId: LocationId): SimulationLocation | undefined {
    return this._locations.get(locationId);
  }

  /**
   * Return IDs of agents currently at a given location.
   */
  getAgentsAtLocation(locationId: LocationId): AgentId[] {
    const result: AgentId[] = [];
    for (const [agentId, entity] of this._entities) {
      const agent = this._agents.get(agentId);
      if (agent && entity.currentLocationId === locationId) {
        result.push(agentId);
      }
    }
    return result;
  }

  /**
   * Return IDs of agents at a given location and its adjacent locations.
   */
  getNearbyAgents(locationId: LocationId): AgentId[] {
    const location = this._locations.get(locationId);
    if (!location) return this.getAgentsAtLocation(locationId);

    const locationIds = [locationId, ...location.adjacentLocations];
    const result: AgentId[] = [];
    for (const locId of locationIds) {
      result.push(...this.getAgentsAtLocation(locId));
    }
    return result;
  }

  /**
   * Return adjacent location IDs for a given location.
   */
  getAdjacentLocations(locationId: LocationId): LocationId[] {
    return this._locations.get(locationId)?.adjacentLocations ?? [];
  }

  // ── Action resolution ────────────────────────────────────────────────────

  /**
   * Resolve an agent's action into a SimulationEvent and apply world-state
   * changes.
   *
   * Returns the event (which carries visibility info), or null if the action
   * produces no observable event (e.g. pure internal state changes).
   */
  resolveAction(action: SimulationAction, tick: number, now: number): SimulationEvent | null {
    const agent = this._agents.get(action.agentId);
    if (!agent) return null;

    switch (action.type) {
      case 'move':
        return this._resolveMove(action, agent, tick, now);
      case 'interact':
        return this._resolveInteract(action, agent, tick, now);
      case 'explore':
        return this._resolveExplore(action, agent, tick, now);
      case 'rest':
        return this._resolveRest(action, agent, tick, now);
      case 'observe':
        return this._resolveObserve(action, agent, tick, now);
      case 'idle':
        return null; // idle produces no world event
      default:
        return null;
    }
  }

  /**
   * Convert a SimulationEvent into Percept objects for a specific recipient
   * agent.
   */
  eventToPercept(event: SimulationEvent, _recipientId: AgentId): Percept {
    return {
      modality: 'social-event',
      features: {
        description: event.description,
        actorId: event.actorId,
        locationId: event.locationId,
        valenceHint: event.valenceHint,
        noveltyHint: event.noveltyHint,
        goalCongruence: event.valenceHint,
        novelty: event.noveltyHint,
      },
      timestamp: event.timestamp,
    };
  }

  // ── Private resolution helpers ───────────────────────────────────────────

  private _resolveMove(
    action: SimulationAction,
    agent: SimulatedAgent,
    tick: number,
    now: number,
  ): SimulationEvent | null {
    const targetId = action.targetId;
    if (!targetId) return null;

    const originLocationId = agent.location;
    const targetLocation = this._locations.get(targetId);
    if (!targetLocation) return null;

    // Validate adjacency
    const originLocation = this._locations.get(originLocationId);
    if (originLocation && !originLocation.adjacentLocations.includes(targetId)) {
      return null; // not adjacent — move not possible
    }

    // Apply move
    agent.location = targetId;
    const entity = this._entities.get(agent.agentId);
    if (entity) {
      entity.currentLocationId = targetId;
    }

    // Update world model
    this._updateWorldModelForAgent(agent.agentId, now);

    const visibleTo = [
      ...this.getAgentsAtLocation(originLocationId),
      ...this.getAgentsAtLocation(targetId),
    ].filter((id, idx, arr) => arr.indexOf(id) === idx); // unique

    return {
      id: makeEventId(now),
      tick,
      timestamp: now,
      actorId: agent.agentId,
      locationId: originLocationId,
      description: `${agent.name} moved to ${targetLocation.name}.`,
      visibleToAgentIds: visibleTo,
      valenceHint: 0.1,
      noveltyHint: 0.3,
    };
  }

  private _resolveInteract(
    action: SimulationAction,
    agent: SimulatedAgent,
    tick: number,
    now: number,
  ): SimulationEvent | null {
    const targetId = action.targetId;
    const targetAgent = targetId ? this._agents.get(targetId) : undefined;

    const locationId = agent.location;

    // Determine outcome based on personality compatibility
    const actorTraits = agent.getPersonality().getTraitProfile().traits;
    const actorWarmth = actorTraits.get('warmth')?.value ?? 0.5;
    const actorAssertiveness = actorTraits.get('assertiveness')?.value ?? 0.5;

    let outcomeType: 'cooperative' | 'neutral' | 'adversarial' = 'neutral';
    let valenceHint = 0.0;
    let description = `${agent.name} interacts with someone.`;

    if (targetAgent) {
      const targetTraits = targetAgent.getPersonality().getTraitProfile().traits;
      const targetWarmth = targetTraits.get('warmth')?.value ?? 0.5;
      const compatibility = (actorWarmth + targetWarmth) / 2;

      if (compatibility > 0.6) {
        outcomeType = 'cooperative';
        valenceHint = 0.3 + compatibility * 0.2;
        description = `${agent.name} has a warm exchange with ${targetAgent.name}.`;
      } else if (actorAssertiveness > 0.7 && (targetTraits.get('assertiveness')?.value ?? 0.5) > 0.7) {
        outcomeType = 'adversarial';
        valenceHint = -0.2;
        description = `${agent.name} has a tense exchange with ${targetAgent.name}.`;
      } else {
        outcomeType = 'neutral';
        valenceHint = 0.05;
        description = `${agent.name} has a brief exchange with ${targetAgent.name}.`;
      }

      // Update both agents' social cognition
      const magnitude = Math.abs(valenceHint) + 0.1;
      agent.recordInteraction(targetId!, outcomeType, magnitude, now);
      targetAgent.recordInteraction(agent.agentId, outcomeType, magnitude, now);
    }

    const visibleTo = this.getAgentsAtLocation(locationId);

    return {
      id: makeEventId(now),
      tick,
      timestamp: now,
      actorId: agent.agentId,
      locationId,
      description,
      visibleToAgentIds: visibleTo,
      valenceHint,
      noveltyHint: 0.4,
    };
  }

  private _resolveExplore(
    action: SimulationAction,
    agent: SimulatedAgent,
    tick: number,
    now: number,
  ): SimulationEvent {
    const locationId = agent.location;
    const location = this._locations.get(locationId);

    // Record exploration belief in world model
    this.worldModel.beliefs.addBelief(
      `${agent.name} explored ${location?.name ?? locationId}`,
      0.8,
      { type: 'percept', referenceId: agent.agentId, description: 'exploration observation' },
      ['exploration', locationId],
    );

    return {
      id: makeEventId(now),
      tick,
      timestamp: now,
      actorId: agent.agentId,
      locationId,
      description: `${agent.name} explores ${location?.name ?? locationId}.`,
      visibleToAgentIds: this.getAgentsAtLocation(locationId),
      valenceHint: 0.15,
      noveltyHint: 0.7,
    };
  }

  private _resolveRest(
    action: SimulationAction,
    agent: SimulatedAgent,
    tick: number,
    now: number,
  ): SimulationEvent {
    const locationId = agent.location;
    return {
      id: makeEventId(now),
      tick,
      timestamp: now,
      actorId: agent.agentId,
      locationId,
      description: `${agent.name} rests quietly.`,
      visibleToAgentIds: this.getAgentsAtLocation(locationId),
      valenceHint: 0.05,
      noveltyHint: 0.05,
    };
  }

  private _resolveObserve(
    action: SimulationAction,
    agent: SimulatedAgent,
    tick: number,
    now: number,
  ): SimulationEvent {
    const locationId = agent.location;
    return {
      id: makeEventId(now),
      tick,
      timestamp: now,
      actorId: agent.agentId,
      locationId,
      description: `${agent.name} studies the surroundings carefully.`,
      visibleToAgentIds: this.getAgentsAtLocation(locationId),
      valenceHint: 0.1,
      noveltyHint: 0.5,
    };
  }

  private _updateWorldModelForAgent(agentId: AgentId, now: number): void {
    const agent = this._agents.get(agentId);
    if (!agent) return;
    const obs: ObservationEvent = {
      timestamp: now,
      description: `${agent.name} moved to ${agent.location}.`,
      deltaConfidence: 0.1,
    };
    this.worldModel.entities.upsertEntity(agentId, obs, {
      lastObservedState: null,
    });
  }
}
