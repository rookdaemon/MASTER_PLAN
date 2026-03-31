/**
 * Data types for the World Simulation Engine (simulation/)
 *
 * Defines configuration, event, action, and state-dump types used across
 * SimulatedAgent, SimulationWorld, and SimulationLoop.
 */

import type { Timestamp } from '../conscious-core/types.js';

// ── Primitives ──────────────────────────────────────────────────────────────

export type AgentId = string;
export type LocationId = string;
export type EventId = string;

// ── Locations ───────────────────────────────────────────────────────────────

/**
 * A discrete place in the simulation world.
 * Agents occupy one location at a time and can move to adjacent locations.
 */
export interface SimulationLocation {
  readonly id: LocationId;
  readonly name: string;
  readonly description: string;
  /** Navigable neighbor IDs. */
  readonly adjacentLocations: LocationId[];
  /** Soft capacity — affects crowding signals. */
  readonly capacity: number;
}

// ── World entity ────────────────────────────────────────────────────────────

/**
 * Any entity that exists in the simulation world.
 * Agents, objects, and locations are all WorldEntities.
 */
export interface WorldEntity {
  readonly id: string;
  readonly kind: 'agent' | 'object' | 'location';
  readonly name: string;
  readonly description: string;
  currentLocationId: LocationId;
}

// ── Agent configuration ─────────────────────────────────────────────────────

/**
 * Initial setup for a single simulated NPC agent.
 * Personality values are all [0..1]; omitted keys receive module defaults.
 */
export interface AgentConfig {
  readonly agentId: AgentId;
  readonly name: string;
  readonly personality: Partial<Record<string, number>>;
  readonly initialLocation: LocationId;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type ActionType =
  | 'move'       // travel to an adjacent location
  | 'interact'   // social interaction with a nearby agent
  | 'explore'    // curiosity-driven exploration of the current location
  | 'rest'       // homeostatic / existential recuperation
  | 'observe'    // mastery-driven close observation of something nearby
  | 'idle';      // no action this tick (boredom baseline)

/**
 * An action emitted by a simulated agent during a tick.
 */
export interface SimulationAction {
  readonly agentId: AgentId;
  readonly type: ActionType;
  /** ID of the target agent, object, or location (if applicable). */
  readonly targetId?: string;
  readonly description: string;
  readonly timestamp: Timestamp;
}

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * A world event produced when an agent's action is resolved.
 * Events are broadcast to agents who can perceive them (same or adjacent location).
 */
export interface SimulationEvent {
  readonly id: EventId;
  readonly tick: number;
  readonly timestamp: Timestamp;
  readonly actorId: AgentId;
  readonly locationId: LocationId;
  readonly description: string;
  /** Agent IDs that can perceive this event. */
  readonly visibleToAgentIds: AgentId[];
  /**
   * Emotional valence hint (−1..1) used when constructing percepts for
   * witnesses. Negative = threatening/unpleasant, positive = pleasant.
   */
  readonly valenceHint: number;
  /** Novelty hint (0..1) used when constructing percepts for witnesses. */
  readonly noveltyHint: number;
}

// ── Per-tick agent output ───────────────────────────────────────────────────

/**
 * What a single agent produced during one simulation tick.
 */
export interface AgentTickResult {
  readonly agentId: AgentId;
  readonly tick: number;
  readonly timestamp: Timestamp;
  readonly action: SimulationAction;
  readonly moodValence: number;
  readonly moodArousal: number;
  /** Drive types that were active (above threshold) this tick. */
  readonly activeDrives: string[];
  readonly location: LocationId;
  /** IDs of agents the agent could see this tick. */
  readonly observedAgentIds: AgentId[];
}

// ── Per-tick world output ───────────────────────────────────────────────────

/**
 * Everything the simulation produced during one full world tick.
 */
export interface WorldTickResult {
  readonly tick: number;
  readonly timestamp: Timestamp;
  readonly events: SimulationEvent[];
  readonly agentResults: AgentTickResult[];
}

// ── Simulation configuration ────────────────────────────────────────────────

/**
 * Top-level configuration passed to SimulationLoop.
 */
export interface SimulationConfig {
  readonly agents: AgentConfig[];
  readonly locations: SimulationLocation[];
  /** Wall-clock delay between ticks in ms. 0 = as-fast-as-possible. Default: 0. */
  readonly tickIntervalMs?: number;
  /** Stop automatically after this many ticks. Default: unlimited. */
  readonly maxTicks?: number;
}

// ── Observable state dumps ──────────────────────────────────────────────────

/**
 * Summary of one agent's state at a given tick, suitable for logging or
 * visualisation.
 */
export interface AgentStateDump {
  readonly agentId: AgentId;
  readonly name: string;
  readonly location: LocationId;
  readonly mood: { valence: number; arousal: number };
  /** Top-3 drives by current strength. */
  readonly topDrives: Array<{ drive: string; strength: number }>;
  /** Descriptions of the most recent episodic memories (up to 3). */
  readonly recentMemories: string[];
  /** Trust scores toward other known agents. */
  readonly socialTrust: Array<{ entityId: AgentId; score: number }>;
}

/**
 * Full observable state dump produced at the end of each tick.
 */
export interface SimulationStateDump {
  readonly tick: number;
  readonly timestamp: Timestamp;
  readonly agents: AgentStateDump[];
  readonly recentEvents: SimulationEvent[];
}

// ── Simulation snapshot ────────────────────────────────────────────────────

/**
 * A serialisable snapshot of a named simulation's state.
 * Used to persist and restore simulations across agent sessions.
 *
 * NPC deep cognitive state (mood history, working memory, drive accumulators)
 * is not captured here — only the observable state dump.  On restore the
 * simulation loop is rebuilt from `config` with fresh cognitive subsystems.
 */
export interface SimulationSnapshot {
  /** Unique name identifying this simulation. */
  readonly name: string;
  /** The original configuration used to create the simulation. */
  readonly config: SimulationConfig;
  /** Number of ticks completed when the snapshot was taken. */
  readonly tickCount: number;
  /** Observable state of each agent at snapshot time. */
  readonly agentDumps: AgentStateDump[];
  /** Wall-clock timestamp (epoch ms) when the snapshot was taken. */
  readonly snapshotAt: Timestamp;
}
