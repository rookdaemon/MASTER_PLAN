/**
 * World Simulation Engine — public barrel export (simulation/)
 *
 * Exports everything needed to build, run, and observe a multi-agent
 * simulation composed entirely from the existing cognitive modules.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  AgentId,
  LocationId,
  EventId,
  SimulationLocation,
  WorldEntity,
  AgentConfig,
  ActionType,
  SimulationAction,
  SimulationEvent,
  AgentTickResult,
  WorldTickResult,
  SimulationConfig,
  AgentStateDump,
  SimulationStateDump,
} from './types.js';

// ── Core components ───────────────────────────────────────────────────────────
export { SimulatedAgent } from './simulated-agent.js';
export type { AgentTickContext } from './simulated-agent.js';
export { SimulationWorld } from './simulation-world.js';
export { SimulationLoop } from './simulation-loop.js';

// ── Demo scenarios ────────────────────────────────────────────────────────────
export { createVillageConfig, VILLAGE_LOCATIONS } from './scenarios/village.js';
