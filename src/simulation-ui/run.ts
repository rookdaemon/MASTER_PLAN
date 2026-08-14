import { SimulationManager } from './simulation-manager.js';
import { SimulationServer } from './simulation-server.js';

const manager = new SimulationManager();
const server = new SimulationServer(manager, { port: 1339 });

await server.start();
console.log(`Simulation UI → http://localhost:${server.port}`);
