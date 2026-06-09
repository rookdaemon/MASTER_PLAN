# Simulation UI

Browser-based control panel for the NPC world simulation. Runs a local HTTP server — open the page, create a simulation, and step or auto-run it. No external dependencies; uses only Node built-ins.

## Quick start

```bash
# from the repo root
npx tsx src/simulation-ui/run.ts
```

Then open **http://localhost:1339** in a browser.

> `run.ts` does not exist yet — see [Creating a launcher](#creating-a-launcher) below.

## Creating a launcher

There is no top-level script for the UI yet. Create `src/simulation-ui/run.ts`:

```ts
import { SimulationManager } from './simulation-manager.js';
import { SimulationServer } from './simulation-server.js';

const manager = new SimulationManager();
const server = new SimulationServer(manager, { port: 1339 });

await server.start();
console.log(`Simulation UI → http://localhost:${server.port}`);
```

Then run it:

```bash
npx tsx src/simulation-ui/run.ts
```

## Available scenarios

| ID | Name | Agents | Description |
|----|------|--------|-------------|
| `village` | Village | 5 | Five villagers with distinct personalities in a medieval village |
| `colony` | Off-World Colony | 6 | Six colonists managing life aboard a remote outpost |

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `1339` | TCP port for the HTTP server |
| `maxTicks` | `100` | Ticks before a simulation stops automatically |

Auto-run fires a tick every **250 ms** of wall-clock time.

## REST API

All endpoints return JSON. Base URL: `http://localhost:1339`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the browser UI (HTML) |
| `GET` | `/api/scenarios` | List available scenarios |
| `GET` | `/api/simulations` | List all simulations |
| `POST` | `/api/simulations` | Create a simulation — body: `{ name, scenarioId, maxTicks? }` |
| `GET` | `/api/simulations/:id` | Get simulation state + recent history |
| `DELETE` | `/api/simulations/:id` | Delete simulation |
| `POST` | `/api/simulations/:id/step` | Advance one tick |
| `POST` | `/api/simulations/:id/run` | Start auto-run |
| `POST` | `/api/simulations/:id/pause` | Pause auto-run |
| `POST` | `/api/simulations/:id/stop` | Stop simulation permanently |
| `GET` | `/api/simulations/:id/agents/:agentId` | Get NPC detail (traits, mood timeline, drive history) |
| `POST` | `/api/simulations/:id/agents/:agentId/trait` | Set NPC trait — body: `{ traitId, value }` |
| `POST` | `/api/simulations/:id/inject` | Inject world event — body: `{ description, locationId, valenceHint?, noveltyHint? }` |
| `GET` | `/api/simulations/:id/events` | SSE stream — emits `tick` and `status` events |

### Example: create and step a simulation

```bash
# Create
curl -X POST http://localhost:1339/api/simulations \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","scenarioId":"village"}'

# Step one tick (replace <id> with the returned id)
curl -X POST http://localhost:1339/api/simulations/<id>/step

# Auto-run
curl -X POST http://localhost:1339/api/simulations/<id>/run

# Pause
curl -X POST http://localhost:1339/api/simulations/<id>/pause
```

## SSE events

Connect to `/api/simulations/:id/events` to receive a live stream:

```
data: {"type":"tick","dump":{...SimulationStateDump}}
data: {"type":"status","status":"stopped","tick":100}
```

The browser UI subscribes to this stream automatically when a simulation is selected.
