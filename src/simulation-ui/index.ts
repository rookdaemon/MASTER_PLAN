/**
 * Simulation UI — public barrel export (simulation-ui/)
 */

export { SimulationManager } from './simulation-manager.js';
export type {
  SimulationRecord,
  SimulationSummary,
  SimulationStatus,
  ScenarioId,
  ScenarioDescriptor,
  CreateSimulationOptions,
  ISimulationManagerDeps,
} from './simulation-manager.js';

export { SimulationServer } from './simulation-server.js';
export type { SimulationServerConfig } from './simulation-server.js';

export { SIMULATION_HTML } from './simulation-html.js';
