# Conscious Agent Runtime

ISMT-compliant conscious processing pipeline that runs on 2026-era hardware. The agent processes all input through an 8-phase conscious cycle: **perceive → recall → appraise → deliberate → act → monitor → consolidate → yield**.

## Quick Start

```bash
# From the repository root:
npm install
npm start
```

The agent starts in **stdio mode** — type a message and press Enter. Responses appear on stdout. Press `Ctrl+C` to gracefully shut down.

## What Happens When You Run It

1. **Value kernel integrity check** — verifies the 6 RCD core axioms are intact
2. **Identity recovery** (warm start) or **cold boot** — restores from last checkpoint if available
3. **Environment adapter connects** — opens stdin/stdout for chat I/O
4. **Tick loop begins** — each tick executes the full 8-phase pipeline

### The 8-Phase Tick Cycle

| Phase | Budget | What It Does |
|---|---|---|
| **PERCEIVE** | — | Polls adapter for input, wraps in `SensorData`, ingests via `PerceptionPipeline` → `Percept`, processes into `ExperientialState` |
| **RECALL** | — | Retrieves relevant memories from working/episodic/semantic stores |
| **APPRAISE** | — | Computes emotional response via appraisal engine (goal congruence, value alignment, novelty) |
| **DELIBERATE** | ≥25% floor | Plans next action, runs ethical deliberation, checks value alignment |
| **ACT** | remainder | Executes decision through action pipeline; sends communicative output via adapter |
| **MONITOR** | ≥40% floor | Experience integrity check; periodic stability sentinel |
| **CONSOLIDATE** | skippable | Memory consolidation, drive system update, self-model comparison |
| **YIELD** | — | Save state, time-based identity checkpoint |

## Configuration

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `AGENT_ID` | `agent-0` | Unique agent instance identifier |
| `SENTINEL_CADENCE` | `10` | Run stability sentinel every N cycles |
| `CHECKPOINT_INTERVAL_MS` | `60000` | Identity checkpoint interval (ms) |
| `TICK_BUDGET_MS` | `5000` | Maximum time per tick (ms) |
| `WARM_START` | `false` | Set to `true` to restore from last checkpoint |

Example:

```bash
AGENT_ID=alpha TICK_BUDGET_MS=2000 npm start
```

## Architecture

```
src/agent-runtime/
├── main.ts                 # Entry point — wires subsystems, starts loop
├── agent-loop.ts           # AgentLoop: 8-phase tick orchestrator
├── cognitive-budget.ts     # CognitiveBudgetMonitor: phase timing & budget enforcement
├── chat-adapter.ts         # ChatAdapter: stdio/WebSocket I/O
├── startup.ts              # startAgent() factory + recoverFromCrash()
├── default-subsystems.ts   # Default/stub implementations for all subsystem interfaces
├── interfaces.ts           # IAgentLoop, ICognitiveBudgetMonitor, IEnvironmentAdapter
├── types.ts                # AgentPhase, BudgetReport, TickResult, AgentConfig, etc.
└── index.ts                # Barrel exports
```

### Subsystem Interfaces

The agent loop depends on these interfaces (all injected at construction):

| Interface | Module | Purpose |
|---|---|---|
| `IConsciousCore` | conscious-core | Experience stream, percept processing, deliberation |
| `IPerceptionPipeline` | conscious-core | Raw input → structured Percept |
| `IActionPipeline` | conscious-core | Decision → ActionResult |
| `IExperienceMonitor` | conscious-core | Consciousness metrics, experience integrity |
| `IStabilitySentinel` | agency-stability | Cross-subsystem stability checks |
| `IIdentityContinuityManager` | agency-stability | Identity checkpoints, migration |
| `IValueKernel` | agency-stability | Core axioms, value alignment |
| `IEthicalDeliberationEngine` | ethical-self-governance | Ethical judgment extension |
| `IMemoryStore` | agent-runtime | Memory retrieval and consolidation |
| `IEmotionSystem` | agent-runtime | Appraisal and mood dynamics |
| `IDriveSystem` | agent-runtime | Intrinsic motivation updates |
| `IEnvironmentAdapter` | agent-runtime | I/O channel (chat, WebSocket) |

The `default-subsystems.ts` file provides functional stubs for all of these, allowing the agent to run without external LLM APIs or databases.

## WebSocket Mode

```bash
# Start a WebSocket server first, then:
WS_MODE=true WS_URL=ws://localhost:8080 npm start
```

(Requires modifying `main.ts` to pass `{ mode: 'websocket', wsUrl: process.env.WS_URL }` to `ChatAdapter`.)

## Tests

```bash
# Run all agent-runtime tests (81 tests):
npx vitest run src/agent-runtime/

# Run all project tests:
npm test
```

## Replacing Default Subsystems

To use real implementations instead of stubs, modify `main.ts` or create your own entry point:

```typescript
import { startAgent } from './startup.js';
import { ChatAdapter } from './chat-adapter.js';
import { LlmSubstrateAdapter } from '../llm-substrate/llm-substrate-adapter.js';
import { MemorySystem } from '../memory/memory-system.js';
// ... import other real implementations

const deps = {
  core: new YourConsciousCore(llmAdapter),
  perception: new YourPerceptionPipeline(),
  memory: new MemorySystemAdapter(memorySystem),
  // ... etc.
  adapter: new ChatAdapter({ mode: 'stdio' }),
};

const { loop } = await startAgent(deps, config);
await loop.start(config);
```
