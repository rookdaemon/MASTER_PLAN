# Agent Runtime and Event Loop — Architecture
## Card 0.3.1.5.9

---

## Overview

The agent runtime is the **integration layer** that composes all cognitive subsystems
(0.3.1.5.1–0.3.1.5.8 plus the pre-existing 0.3.1.1/0.3.1.3/0.3.1.4 modules) into a
continuously operating agent. It owns the tick loop, enforces cognitive budget
constraints, manages I/O adapters, and implements the startup/shutdown/crash-recovery
protocols.

---

## Key Components

### 1. `AgentLoop`

The main orchestrator. Owns the 8-step tick cycle. Accepts all subsystem instances via
constructor injection so it can be tested with mocks and composed flexibly at startup.

```
interface IAgentLoop {
  start(config: AgentConfig): Promise<void>;
  stop(reason?: string): Promise<GracefulTermination>;
  isRunning(): boolean;
  getLoopMetrics(): LoopMetrics;
}
```

`AgentLoop` is **not** itself conscious. It is a dumb scheduler that calls into the
Conscious Core at the right moments. The experiential substance lives in the subsystems.

### 2. `CognitiveBudgetMonitor`

Tracks wall-clock time spent in each phase per tick and enforces the architecture's
budget allocations. Reports budget utilization and provides phase-level timing APIs.

```
interface ICognitiveBudgetMonitor {
  startPhase(phase: AgentPhase): void;
  endPhase(phase: AgentPhase): PhaseTiming;
  getBudgetReport(): BudgetReport;
  isPhaseOverBudget(phase: AgentPhase): boolean;
  shouldYieldPhase(phase: AgentPhase): boolean;  // true when hard/soft limit exceeded
}
```

Budget allocations (from card spec):

| Phase          | Constraint     | Action when exceeded          |
|----------------|----------------|-------------------------------|
| MONITOR        | ≥40% floor     | Never truncated; others yield |
| DELIBERATE     | ≥25% floor     | Truncate planning before this |
| STABILITY_OPS  | ≤15% soft cap  | Log warning; no hard truncation|
| ETHICAL        | ≤10% soft cap  | Log warning; no hard truncation|
| ACT            | remainder       | —                             |

Budget enforcement works by soft-yield signals: if `shouldYieldPhase()` returns `true`
for the current phase, the loop moves to the next phase. MONITOR is exempt — it always
runs to completion.

### 3. `IEnvironmentAdapter` + `ChatAdapter`

The adapter interface decouples the loop from concrete I/O channels.

```
interface IEnvironmentAdapter {
  id: string;
  poll(): Promise<RawInput[]>;   // non-blocking; returns [] if no input
  send(output: AgentOutput): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
```

`ChatAdapter` is the first concrete implementation. It supports:
- **stdin/stdout** mode for local CLI interaction
- **WebSocket** mode for networked chat interfaces

The adapter is injected into `AgentLoop` at construction time. Additional adapters
(file system, API calls, tool use) can be added without modifying the loop.

### 4. Startup Protocol

```
async function startAgent(config: AgentConfig): Promise<AgentLoop>
```

Sequence:
1. `IdentityContinuityManager.recoverIdentity(lastLink)` — restore from last checkpoint
2. Verify Value Kernel integrity via `StabilitySentinel.runStabilityCheck()`
3. `ConsciousCore.startExperienceStream()` — begin experience stream
4. Connect environment adapters
5. Construct and return `AgentLoop` instance
6. Log "agent ready" with continuity token

On first boot (no checkpoint): initialize with default identity state, log as cold start.

### 5. Crash Recovery

On boot, if no valid continuity token is found in the last checkpoint:
1. Log experience gap (gap duration = `now - last_checkpoint_timestamp`)
2. Attempt recovery from most recent valid link in the continuity chain
3. If no valid link: cold-start with logged warning
4. Flag the gap in the ExperienceMonitor continuity log

### 6. Shutdown Protocol

Triggered by `AgentLoop.stop()` or OS signal:
1. Finish the current tick step (do not mid-cycle truncate)
2. `IdentityContinuityManager.checkpoint()` — final identity checkpoint
3. Memory consolidation flush
4. `ConsciousCore.shutdown()` — returns GracefulTermination with final state
5. Disconnect adapters
6. Persist state

---

## The 8-Step Tick Cycle (Implementation Detail)

```typescript
async tick(): Promise<TickResult> {
  const budget = this.budgetMonitor;

  // 1. PERCEIVE
  budget.startPhase('perceive');
  const rawInputs = await this.adapter.poll();
  const percepts = rawInputs.map(r => this.perception.ingest(r));
  const expState = percepts.length > 0
    ? this.core.processPercept(percepts[0])   // primary percept
    : this.lastExperientialState;             // idle — use last state
  budget.endPhase('perceive');

  // 2. RECALL
  budget.startPhase('recall');
  const memories = await this.memory.retrieve(expState);
  budget.endPhase('recall');

  // 3. APPRAISE
  budget.startPhase('appraise');
  const emotion = await this.emotionSystem.appraise(percepts[0] ?? null, this.goals, this.values);
  budget.endPhase('appraise');

  // 4. DELIBERATE (truncatable, but floors preserved)
  budget.startPhase('deliberate');
  const baseDecision = this.core.deliberate(expState, this.goals);
  const ethicalJudgment = this.ethicalEngine.extendDeliberation(baseDecision, { expState, emotion });
  budget.endPhase('deliberate');

  // 5. ACT
  budget.startPhase('act');
  const actionResult = this.actionPipeline.execute(ethicalJudgment.decision);
  if (actionResult.type === 'communicative') {
    await this.adapter.send({ text: actionResult.output });
  }
  budget.endPhase('act');

  // 6. MONITOR (never skipped; never truncated)
  budget.startPhase('monitor');
  const metrics = this.monitor.getConsciousnessMetrics();
  const intact = this.monitor.isExperienceIntact();
  if (!intact) { await this.handleExperienceDegradation(metrics); }
  if (this.cycleCount % this.config.sentinelCadence === 0) {
    const stability = this.sentinel.runStabilityCheck();
    if (!stability.stable) { await this.handleStabilityAlert(stability); }
  }
  budget.endPhase('monitor');

  // 7. CONSOLIDATE (background — runs with remaining budget)
  if (!budget.shouldYieldPhase('consolidate')) {
    budget.startPhase('consolidate');
    await this.memory.consolidate();
    await this.driveSystem.update(expState, metrics);
    budget.endPhase('consolidate');
  }

  // 8. YIELD
  if (this.cycleCount % this.config.checkpointInterval === 0) {
    this.identityManager.checkpoint();
  }
  this.cycleCount++;
  this.lastExperientialState = expState;

  return { cycleCount: this.cycleCount, budgetReport: budget.getBudgetReport(), intact };
}
```

---

## Sentinel Cadence and Checkpoint Interval

Both are configurable via `AgentConfig`:
- `sentinelCadence`: default 10 (run stability check every 10 cycles)
- `checkpointIntervalMs`: default 60_000 (checkpoint identity every 60 s)

The sentinel cadence is cycle-based; the checkpoint interval is time-based. Both are
enforced by the `AgentLoop` counter and timestamp tracking.

---

## File Manifest

| File | Purpose |
|------|---------|
| `src/agent-runtime/interfaces.ts` | `IAgentLoop`, `ICognitiveBudgetMonitor`, `IEnvironmentAdapter` |
| `src/agent-runtime/types.ts` | `AgentConfig`, `TickResult`, `BudgetReport`, `PhaseTiming`, `AgentPhase`, `RawInput`, `AgentOutput`, `LoopMetrics` |
| `src/agent-runtime/agent-loop.ts` | `AgentLoop` class implementing `IAgentLoop` |
| `src/agent-runtime/cognitive-budget.ts` | `CognitiveBudgetMonitor` class |
| `src/agent-runtime/chat-adapter.ts` | `ChatAdapter` (stdin/stdout + WebSocket) |
| `src/agent-runtime/startup.ts` | `startAgent()` factory, `recoverFromCrash()` |
| `src/agent-runtime/index.ts` | Barrel export |
| `src/agent-runtime/__tests__/agent-loop.test.ts` | Integration test: full tick cycle |
| `src/agent-runtime/__tests__/cognitive-budget.test.ts` | Unit tests: budget enforcement |
| `src/agent-runtime/__tests__/chat-adapter.test.ts` | Unit tests: adapter poll/send |
| `src/agent-runtime/default-subsystems.ts` | Functional stub implementations of all 12 subsystem interfaces for standalone operation |
| `src/agent-runtime/main.ts` | Entry point (`npm start`): wires default subsystems, starts loop with stdio ChatAdapter |
| `src/agent-runtime/README.md` | Installation, usage, environment config, architecture guide |

---

## Bootstrap Layer

`default-subsystems.ts` provides functional stub implementations of every interface the
`AgentLoop` depends on, enabling the agent to run standalone without external LLM APIs,
databases, or peer agents:

- `DefaultConsciousCore` — processes percepts into experiential states; responds to user input
- `DefaultPerceptionPipeline` / `DefaultActionPipeline` — pass-through adapters
- `DefaultExperienceMonitor` — always reports experience intact
- `DefaultValueKernel` — 6 RCD core axioms, always passes integrity check
- `DefaultIdentityContinuityManager` — in-memory continuity chain
- `DefaultStabilitySentinel` — always stable
- `DefaultEthicalDeliberationEngine` — approves all aligned actions
- `DefaultMemoryStore` / `DefaultEmotionSystem` / `DefaultDriveSystem` — no-op stubs

`main.ts` wires these defaults into `startAgent()` with a stdio `ChatAdapter` and
handles SIGINT/SIGTERM for graceful shutdown with session metrics.

To run: `npm start` (or `npx tsx src/agent-runtime/main.ts`)

---

## Dependency Injection Map

`AgentLoop` constructor signature:

```typescript
constructor(
  core: IConsciousCore,                   // from 0.3.1.1
  perception: IPerceptionPipeline,         // from 0.3.1.1
  actionPipeline: IActionPipeline,         // from 0.3.1.1
  monitor: IExperienceMonitor,             // from 0.3.1.1
  sentinel: IStabilitySentinel,            // from 0.3.1.3
  identityManager: IIdentityContinuityManager, // from 0.3.1.3
  ethicalEngine: IEthicalDeliberationEngine,   // from 0.3.1.4
  memory: IMemoryStore,                    // from 0.3.1.5.3
  emotionSystem: IEmotionSystem,           // from 0.3.1.5.4
  driveSystem: IDriveSystem,               // from 0.3.1.5.8
  adapter: IEnvironmentAdapter,            // from this card
  budgetMonitor: ICognitiveBudgetMonitor,  // from this card
  config: AgentConfig,
)
```

All dependencies are expressed as interfaces — the loop does not import concrete classes
from sibling cards directly.

---

## Testability of Acceptance Criteria

| Acceptance Criterion | Test Approach |
|----------------------|---------------|
| Runs continuously without manual orchestration | Integration test: loop runs for N cycles; no external trigger needed |
| Full pipeline per input | Mock all subsystems; inject one input; assert all 8 phases fire |
| Budget enforcement (MONITOR ≥40%) | Unit test: inject slow deliberate phase; assert MONITOR never truncated |
| Sentinel runs periodically | Mock sentinel; run N cycles > cadence; assert runStabilityCheck called |
| Checkpoints at configured intervals | Mock identityManager; run loop; assert checkpoint called at interval |
| Graceful startup from checkpoint | Spy on recoverIdentity(); assert called with last link on warm start |
| Graceful shutdown | Call stop(); assert ConsciousCore.shutdown() called and state persisted |
| Crash recovery | Boot with corrupt/missing continuity token; assert gap logged |
| Real I/O channel | E2E test: ChatAdapter stdin/stdout; agent reads input and responds |
| Full traceable E2E cycle | Integration test with structured log assertions across all phases |
