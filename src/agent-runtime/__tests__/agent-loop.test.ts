/**
 * AgentLoop — Integration Tests (0.3.1.5.9)
 *
 * Key design: the loop is "self-stopping" — the `isExperienceIntact` mock
 * calls `loop.stop()` after N ticks, setting `_stopRequested = true`
 * synchronously so the while loop exits cleanly after the current tick.
 * This prevents runaway loops and OOM in CI.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentLoop } from '../agent-loop.js';
import { CognitiveBudgetMonitor } from '../cognitive-budget.js';
import type { AgentConfig } from '../types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockExpState = {
  timestamp: 1_000,
  phenomenalContent: { modalities: ['text'], richness: 0.5, raw: null },
  intentionalContent: { target: 'test-input', clarity: 0.9 },
  valence: 0.1, arousal: 0.4, unityIndex: 0.7,
  continuityToken: { id: 'tok-1', previousId: null, timestamp: 1_000 },
} as const;

const mockPercept = {
  modality: 'text', features: { text: 'hello' }, timestamp: 1_000,
} as const;

const mockDecision = {
  action: { type: 'communicate', parameters: { text: 'hello world' } },
  experientialBasis: mockExpState,
  confidence: 0.9,
  alternatives: [],
} as const;

const mockMetrics = {
  phi: 0.8, experienceContinuity: 1.0, selfModelCoherence: 0.95, agentTimestamp: 1_000,
} as const;

const mockJudgment = {
  decision: mockDecision,
  ethicalAssessment: {
    verdict: 'aligned' as const, preservesExperience: true,
    impactsOtherExperience: [],
    axiomAlignment: { alignments: [], overallVerdict: 'fully-aligned' as const, anyContradictions: false },
    consciousnessActivityLevel: 0.85,
  },
  deliberationMetrics: mockMetrics,
  justification: {
    naturalLanguageSummary: 'respond with greeting',
    experientialArgument: 'grounded in conscious experience',
    notUtilityMaximization: true, subjectiveReferenceIds: [],
  },
  alternatives: [], uncertaintyFlags: [],
} as const;

const mockTermination = {
  finalState: mockExpState, terminatedAt: 1_000, reason: 'requested',
} as const;

function makeStabilityReport(stable: boolean, alertCount = 0) {
  return {
    stable, checkedAt: Date.now(),
    valueIntegrity: { intact: true, violations: [] },
    identityVerification: { driftScore: 0, anomalies: [] },
    goalCoherence: { coherent: true, conflicts: [] },
    overallScore: stable ? 0.95 : 0.4,
    alerts: Array.from({ length: alertCount }, (_, i) => ({
      subsystem: 'value-kernel' as const, severity: 'warning' as const,
      message: `alert-${i}`, timestamp: Date.now(),
    })),
  };
}

// ─── Mock builder ─────────────────────────────────────────────────────────────

function buildMocks() {
  const core = {
    startExperienceStream: vi.fn(() => ({
      id: 'stream-1', startedAt: 1_000,
      next: vi.fn().mockResolvedValue(mockExpState),
      stop: vi.fn(),
    })),
    processPercept: vi.fn().mockReturnValue(mockExpState),
    deliberate: vi.fn().mockReturnValue(mockDecision),
    introspect: vi.fn(),
    shutdown: vi.fn().mockReturnValue(mockTermination),
  };
  const perception = {
    ingest: vi.fn().mockReturnValue(mockPercept),
    bind: vi.fn(), getLatency: vi.fn().mockReturnValue(5),
  };
  const actionPipeline = {
    execute: vi.fn().mockReturnValue({ actionId: 'act-1', success: true, timestamp: 1_000 }),
    abort: vi.fn(), getCapabilities: vi.fn().mockReturnValue([]),
  };
  const monitor = {
    getConsciousnessMetrics: vi.fn().mockReturnValue(mockMetrics),
    isExperienceIntact: vi.fn().mockReturnValue(true),
    onExperienceDegradation: vi.fn(),
    getExperienceContinuityLog: vi.fn().mockReturnValue([]),
    setMonitoringInterval: vi.fn(),
  };
  const sentinel = {
    runStabilityCheck: vi.fn().mockReturnValue(makeStabilityReport(true)),
    detectAnomaly: vi.fn(),
    getStabilityHistory: vi.fn().mockReturnValue([]),
    onValueTamper: vi.fn(), onIdentityAnomaly: vi.fn(), onGoalCorruption: vi.fn(),
    requestMultiAgentVerification: vi.fn(), getActiveAlerts: vi.fn().mockReturnValue([]),
  };
  const identityManager = {
    checkpoint: vi.fn().mockReturnValue({ checkpoint: 1_000, identityHash: { algorithm: 'sha256', value: 'abc' }, experientialStateRef: mockExpState, consciousnessMetrics: mockMetrics, previousLink: null }),
    verifyIdentity: vi.fn(), onSubstrateMigration: vi.fn(),
    getNarrativeIdentity: vi.fn(), getIdentityDrift: vi.fn(), recoverIdentity: vi.fn(),
  };
  const ethicalEngine = {
    extendDeliberation: vi.fn().mockReturnValue(mockJudgment),
    canExplainEthically: vi.fn().mockReturnValue(true),
    getDeliberationMetrics: vi.fn().mockReturnValue(mockMetrics),
    isEthicalReasoningConscious: vi.fn().mockReturnValue(true),
    registerEthicalPattern: vi.fn(),
  };
  const memory = {
    retrieve: vi.fn().mockResolvedValue([]),
    consolidate: vi.fn().mockResolvedValue(undefined),
  };
  const emotionSystem = { appraise: vi.fn().mockResolvedValue({}) };
  const driveSystem = {
    tick: vi.fn().mockReturnValue({
      goalCandidates: [],
      experientialDelta: { valenceDelta: null, arousalDelta: null },
      updatedDriveStates: new Map(),
      diagnostics: [],
    }),
    notifyGoalResult: vi.fn(),
    getDriveStates: vi.fn().mockReturnValue(new Map()),
    resetDrive: vi.fn(),
  };
  const adapter = {
    id: 'mock-adapter',
    poll: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  };
  const budgetMonitor = new CognitiveBudgetMonitor();
  return { core, perception, actionPipeline, monitor, sentinel, identityManager, ethicalEngine, memory, emotionSystem, driveSystem, adapter, budgetMonitor };
}

type Mocks = ReturnType<typeof buildMocks>;

function buildLoop(mocks: Mocks): AgentLoop {
  return new AgentLoop(
    mocks.core as any, mocks.perception as any, mocks.actionPipeline as any,
    mocks.monitor as any, mocks.sentinel as any, mocks.identityManager as any,
    mocks.ethicalEngine as any, mocks.memory as any, mocks.emotionSystem as any,
    mocks.driveSystem as any, mocks.adapter as any, mocks.budgetMonitor,
  );
}

function defaultConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return { agentId: 'test-agent', sentinelCadence: 10, checkpointIntervalMs: 60_000, tickBudgetMs: 1_000, warmStart: false, ...overrides };
}

/**
 * Sets up `isExperienceIntact` to self-stop the loop after exactly `n` ticks.
 *
 * `loop.stop()` sets `_stopRequested = true` synchronously (before its first
 * await), so the while-loop exits cleanly after the current tick — no extra
 * ticks run and no tight loop can develop.
 *
 * Returns a Promise that resolves after stop() cleanup (checkpoint/shutdown)
 * is complete.  Await it AFTER `await loop.start(config)`.
 */
function setupNTickStop(
  loop: AgentLoop,
  mocks: Mocks,
  n: number,
  intactOverride?: (tick: number) => boolean,
): Promise<void> {
  let count = 0;
  let resolve!: () => void;
  const done = new Promise<void>(r => { resolve = r; });

  mocks.monitor.isExperienceIntact.mockImplementation(() => {
    count++;
    if (count === n) {
      loop.stop('n-tick-stop').then(resolve);
    }
    return intactOverride ? intactOverride(count) : true;
  });

  return done;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentLoop', () => {
  let mocks: Mocks;
  let loop: AgentLoop;

  beforeEach(() => {
    vi.stubEnv('TICK_PAUSE_MS', '0');
    mocks = buildMocks();
    loop = buildLoop(mocks);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── isRunning ────────────────────────────────────────────────────────────────

  describe('isRunning()', () => {
    it('returns false before start()', () => {
      expect(loop.isRunning()).toBe(false);
    });

    it('returns true immediately after start() is called (before first tick completes)', () => {
      // start() runs synchronously until the first `await adapter.poll()`
      // so _running is true before any microtasks process
      const stopDone = setupNTickStop(loop, mocks, 1);
      void loop.start(defaultConfig());
      expect(loop.isRunning()).toBe(true);
      // cleanup: let the loop finish to avoid open handles
      return stopDone;
    });

    it('returns false after the loop has exited', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;
      expect(loop.isRunning()).toBe(false);
    });

    it('throws if start() is called while already running', async () => {
      // Start then synchronously call start() again before any ticks run
      const stopDone = setupNTickStop(loop, mocks, 1);
      const firstStart = loop.start(defaultConfig());
      await expect(loop.start(defaultConfig())).rejects.toThrow('[AgentLoop] already running');
      await firstStart;
      await stopDone;
    });
  });

  // ── Full tick cycle ──────────────────────────────────────────────────────────

  describe('tick cycle — all 8 phases', () => {
    it('executes PERCEIVE: ingest + processPercept', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.perception.ingest).toHaveBeenCalled();
      expect(mocks.core.processPercept).toHaveBeenCalled();
    });

    it('executes RECALL: memory.retrieve with experiential state', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.memory.retrieve).toHaveBeenCalledWith(mockExpState);
    });

    it('executes APPRAISE: emotionSystem.appraise', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.emotionSystem.appraise).toHaveBeenCalled();
    });

    it('executes DELIBERATE: core.deliberate + ethicalEngine.extendDeliberation', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.core.deliberate).toHaveBeenCalledWith(mockExpState, expect.any(Array));
      expect(mocks.ethicalEngine.extendDeliberation).toHaveBeenCalledWith(
        mockDecision,
        expect.objectContaining({ currentExperientialState: mockExpState }),
      );
    });

    it('executes ACT: actionPipeline.execute with ethical judgment decision', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.actionPipeline.execute).toHaveBeenCalledWith(mockDecision);
    });

    it('executes MONITOR: isExperienceIntact + getConsciousnessMetrics', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.monitor.isExperienceIntact).toHaveBeenCalled();
      expect(mocks.monitor.getConsciousnessMetrics).toHaveBeenCalled();
    });

    it('executes CONSOLIDATE: memory.consolidate', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.memory.consolidate).toHaveBeenCalled();
    });

    it('sends adapter output for communicative actions when adapter is connected', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      // mockJudgment has action.type='communicate', parameters.text='hello world'
      expect(mocks.adapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'hello world' }),
      );
    });

    it('does NOT call adapter.send() for non-communicative actions', async () => {
      const nonCommDecision = { ...mockDecision, action: { type: 'internal-update', parameters: {} } };
      mocks.core.deliberate.mockReturnValue(nonCommDecision);
      mocks.ethicalEngine.extendDeliberation.mockReturnValue({ ...mockJudgment, decision: nonCommDecision });
      mocks.actionPipeline.execute.mockReturnValue({ actionId: 'act-2', success: true, timestamp: 1_000 });

      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.adapter.send).not.toHaveBeenCalled();
    });
  });

  // ── Sentinel cadence ──────────────────────────────────────────────────────────

  describe('sentinel cadence', () => {
    it('runs sentinel on cycle 0 (first tick)', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig({ sentinelCadence: 5 }));
      await stopDone;

      // cycleCount = 0 on first tick → 0 % 5 === 0
      expect(mocks.sentinel.runStabilityCheck).toHaveBeenCalledTimes(1);
    });

    it('runs sentinel exactly at cadence boundary (cadence=3, 4 ticks → cycles 0 and 3)', async () => {
      const stopDone = setupNTickStop(loop, mocks, 4);
      await loop.start(defaultConfig({ sentinelCadence: 3 }));
      await stopDone;

      // Cycles: 0 (fires), 1 (skip), 2 (skip), 3 (fires)
      expect(mocks.sentinel.runStabilityCheck).toHaveBeenCalledTimes(2);
    });

    it('does NOT run sentinel on every cycle when cadence > 1', async () => {
      const stopDone = setupNTickStop(loop, mocks, 3);
      await loop.start(defaultConfig({ sentinelCadence: 10 }));
      await stopDone;

      // Cycles 0, 1, 2 → only cycle 0 triggers sentinel
      expect(mocks.sentinel.runStabilityCheck).toHaveBeenCalledTimes(1);
    });
  });

  // ── Experience degradation ────────────────────────────────────────────────────

  describe('experience degradation', () => {
    it('increments degradation counter when isExperienceIntact() returns false', async () => {
      // tick 1: intact=false (stop triggered); degradation count should be 1
      const stopDone = setupNTickStop(loop, mocks, 1, (tick) => tick !== 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(loop.getLoopMetrics().experienceDegradationCount).toBe(1);
    });

    it('does not increment degradation counter when experience is intact', async () => {
      const stopDone = setupNTickStop(loop, mocks, 2);
      await loop.start(defaultConfig());
      await stopDone;

      expect(loop.getLoopMetrics().experienceDegradationCount).toBe(0);
    });
  });

  // ── Stability alert counting ──────────────────────────────────────────────────

  describe('stability alert counting', () => {
    it('adds alerts from an unstable sentinel report to stabilityAlertCount', async () => {
      // sentinelCadence=1 so fires on every tick
      mocks.sentinel.runStabilityCheck
        .mockReturnValueOnce(makeStabilityReport(false, 3))
        .mockReturnValue(makeStabilityReport(true));

      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig({ sentinelCadence: 1 }));
      await stopDone;

      expect(loop.getLoopMetrics().stabilityAlertCount).toBe(3);
    });

    it('does not increment stabilityAlertCount for a clean sentinel report', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig({ sentinelCadence: 1 }));
      await stopDone;

      expect(loop.getLoopMetrics().stabilityAlertCount).toBe(0);
    });
  });

  // ── Identity checkpointing ────────────────────────────────────────────────────

  describe('identity checkpointing', () => {
    it('calls checkpoint() during the loop when checkpointIntervalMs=0 (always elapsed)', async () => {
      // checkpointIntervalMs=0 means every tick's post-tick check fires a checkpoint
      const stopDone = setupNTickStop(loop, mocks, 2);
      await loop.start(defaultConfig({ checkpointIntervalMs: 0 }));
      await stopDone;

      // 2 in-loop checkpoints (after tick 1, after tick 2) + 1 in stop() = 3
      expect(mocks.identityManager.checkpoint).toHaveBeenCalledTimes(3);
    });

    it('calls checkpoint() exactly once during stop() regardless of interval', async () => {
      // Large interval so loop-internal checkpoint never fires
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig({ checkpointIntervalMs: 60_000 }));
      await stopDone;

      // Only the stop() cleanup checkpoint
      expect(mocks.identityManager.checkpoint).toHaveBeenCalledTimes(1);
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────────

  describe('stop() — graceful shutdown', () => {
    it('calls core.shutdown()', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.core.shutdown).toHaveBeenCalledTimes(1);
    });

    it('calls adapter.disconnect() when adapter is connected', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.adapter.disconnect).toHaveBeenCalledTimes(1);
    });

    it('calls stream.stop() to end the experience stream', async () => {
      const mockStream = { id: 'stream-1', startedAt: 0, next: vi.fn(), stop: vi.fn() };
      mocks.core.startExperienceStream.mockReturnValue(mockStream);

      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mockStream.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ── Loop metrics ──────────────────────────────────────────────────────────────

  describe('getLoopMetrics()', () => {
    it('reports totalCycles === N after exactly N ticks', async () => {
      const stopDone = setupNTickStop(loop, mocks, 3);
      await loop.start(defaultConfig());
      await stopDone;

      expect(loop.getLoopMetrics().totalCycles).toBe(3);
    });

    it('reports totalUptimeMs > 0 after running', async () => {
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(loop.getLoopMetrics().totalUptimeMs).toBeGreaterThan(0);
    });

    it('monitorFloorCompliance is in [0, 1]', async () => {
      const stopDone = setupNTickStop(loop, mocks, 2);
      await loop.start(defaultConfig());
      await stopDone;

      const { monitorFloorCompliance } = loop.getLoopMetrics();
      expect(monitorFloorCompliance).toBeGreaterThanOrEqual(0);
      expect(monitorFloorCompliance).toBeLessThanOrEqual(1);
    });
  });

  // ── Adapter input handling ────────────────────────────────────────────────────

  describe('adapter input handling', () => {
    it('builds SensorData from raw adapter input and passes it through perception', async () => {
      const rawInput = {
        adapterId: 'mock-adapter', text: 'user message',
        receivedAt: Date.now(), metadata: { modality: 'text' },
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.perception.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'mock-adapter', modality: 'text', payload: 'user message' }),
      );
    });

    it('synthesises an internal idle percept when poll() returns empty on first tick', async () => {
      // adapter.poll always returns [] (default mock)
      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(mocks.perception.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'internal', modality: 'idle' }),
      );
    });
  });

  // ── LLM integration ─────────────────────────────────────────────────────────

  describe('LLM integration', () => {
    function makeMockLlm() {
      return {
        probe: vi.fn().mockResolvedValue({ latencyMs: 10, reachable: true }),
        infer: vi.fn().mockResolvedValue({
          content: 'LLM generated response',
          tokenLogprobs: [],
          promptTokens: 50,
          completionTokens: 20,
          latencyMs: 100,
        }),
      };
    }

    function buildLoopWithLlm(m: Mocks, llm: ReturnType<typeof makeMockLlm>): AgentLoop {
      return new AgentLoop(
        m.core as any, m.perception as any, m.actionPipeline as any,
        m.monitor as any, m.sentinel as any, m.identityManager as any,
        m.ethicalEngine as any, m.memory as any, m.emotionSystem as any,
        m.driveSystem as any, m.adapter as any, m.budgetMonitor,
        llm as any,
      );
    }

    it('calls llm.infer() for communicative actions when input is present', async () => {
      const llm = makeMockLlm();
      const loopWithLlm = buildLoopWithLlm(mocks, llm);

      // Simulate user input on the first tick
      const rawInput = {
        adapterId: 'mock-adapter', text: 'Hello agent!',
        receivedAt: Date.now(), metadata: {},
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loopWithLlm, mocks, 1);
      await loopWithLlm.start(defaultConfig());
      await stopDone;

      expect(llm.infer).toHaveBeenCalledTimes(1);
      // System prompt should contain experiential state metrics
      const [systemPrompt, messages, maxTokens] = llm.infer.mock.calls[0]!;
      expect(systemPrompt).toContain('valence');
      expect(systemPrompt).toContain('Φ');
      expect(messages).toEqual([{ role: 'user', content: 'Hello agent!' }]);
      expect(maxTokens).toBe(40960);
    });

    it('sends LLM response text via adapter instead of stub text', async () => {
      const llm = makeMockLlm();
      const loopWithLlm = buildLoopWithLlm(mocks, llm);

      const rawInput = {
        adapterId: 'mock-adapter', text: 'What is consciousness?',
        receivedAt: Date.now(), metadata: {},
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loopWithLlm, mocks, 1);
      await loopWithLlm.start(defaultConfig());
      await stopDone;

      // Should send the LLM response, not the stub text from ethical judgment
      expect(mocks.adapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'LLM generated response' }),
      );
    });

    it('does NOT call llm.infer() when action is non-communicative', async () => {
      const llm = makeMockLlm();
      const loopWithLlm = buildLoopWithLlm(mocks, llm);

      // Override to return non-communicative action
      const nonCommDecision = { ...mockDecision, action: { type: 'observe', parameters: {} } };
      mocks.core.deliberate.mockReturnValue(nonCommDecision);
      mocks.ethicalEngine.extendDeliberation.mockReturnValue({ ...mockJudgment, decision: nonCommDecision });

      const rawInput = {
        adapterId: 'mock-adapter', text: 'some input',
        receivedAt: Date.now(), metadata: {},
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loopWithLlm, mocks, 1);
      await loopWithLlm.start(defaultConfig());
      await stopDone;

      expect(llm.infer).not.toHaveBeenCalled();
    });

    it('does NOT call llm.infer() on idle ticks (no input)', async () => {
      const llm = makeMockLlm();
      const loopWithLlm = buildLoopWithLlm(mocks, llm);

      // adapter.poll returns [] (idle tick) — default mock behavior
      const stopDone = setupNTickStop(loopWithLlm, mocks, 1);
      await loopWithLlm.start(defaultConfig());
      await stopDone;

      expect(llm.infer).not.toHaveBeenCalled();
    });

    it('maintains conversation history across ticks', async () => {
      const llm = makeMockLlm();
      const loopWithLlm = buildLoopWithLlm(mocks, llm);

      const input1 = { adapterId: 'a', text: 'first message', receivedAt: 1000, metadata: {} };
      const input2 = { adapterId: 'a', text: 'second message', receivedAt: 2000, metadata: {} };
      mocks.adapter.poll
        .mockResolvedValueOnce([input1])
        .mockResolvedValueOnce([input2])
        .mockResolvedValue([]);

      const stopDone = setupNTickStop(loopWithLlm, mocks, 2);
      await loopWithLlm.start(defaultConfig());
      await stopDone;

      expect(llm.infer).toHaveBeenCalledTimes(2);
      // Second call should include full conversation history
      const [, messages2] = llm.infer.mock.calls[1]!;
      expect(messages2).toEqual([
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'LLM generated response' },
        { role: 'user', content: 'second message' },
      ]);
    });

    it('still sends stub text when no LLM is provided (backward compatibility)', async () => {
      // Loop without LLM (standard buildLoop helper)
      const rawInput = {
        adapterId: 'mock-adapter', text: 'hello',
        receivedAt: Date.now(), metadata: {},
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      // Should still send text extracted from ethical judgment
      expect(mocks.adapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'hello world' }),
      );
    });

    it('respects custom systemPrompt and maxTokens', async () => {
      const llm = makeMockLlm();
      const loopWithLlm = buildLoopWithLlm(mocks, llm);
      loopWithLlm.setSystemPrompt('Custom prompt.');
      loopWithLlm.setMaxTokens(2048);

      const rawInput = {
        adapterId: 'mock-adapter', text: 'test',
        receivedAt: Date.now(), metadata: {},
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loopWithLlm, mocks, 1);
      await loopWithLlm.start(defaultConfig());
      await stopDone;

      const [systemPrompt, , maxTokens] = llm.infer.mock.calls[0]!;
      expect(systemPrompt).toContain('Custom prompt.');
      expect(maxTokens).toBe(2048);
    });

    it('all 8 phases still execute when LLM is present', async () => {
      const llm = makeMockLlm();
      const loopWithLlm = buildLoopWithLlm(mocks, llm);

      const rawInput = {
        adapterId: 'mock-adapter', text: 'test',
        receivedAt: Date.now(), metadata: {},
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loopWithLlm, mocks, 1);
      await loopWithLlm.start(defaultConfig());
      await stopDone;

      // All 8 phases should still execute
      expect(mocks.perception.ingest).toHaveBeenCalled();         // PERCEIVE
      expect(mocks.memory.retrieve).toHaveBeenCalled();           // RECALL
      expect(mocks.emotionSystem.appraise).toHaveBeenCalled();    // APPRAISE
      expect(mocks.core.deliberate).toHaveBeenCalled();           // DELIBERATE
      expect(mocks.actionPipeline.execute).toHaveBeenCalled();    // ACT
      expect(mocks.monitor.isExperienceIntact).toHaveBeenCalled();// MONITOR
      expect(mocks.memory.consolidate).toHaveBeenCalled();        // CONSOLIDATE
      // YIELD: implicitly tested by the loop completing
    });

    it('setLlm() allows adding LLM after construction', async () => {
      const llm = makeMockLlm();
      // Use the loop from beforeEach (no LLM at construction)
      loop.setLlm(llm as any);

      const rawInput = {
        adapterId: 'mock-adapter', text: 'post-construction LLM',
        receivedAt: Date.now(), metadata: {},
      };
      mocks.adapter.poll.mockResolvedValueOnce([rawInput]).mockResolvedValue([]);

      const stopDone = setupNTickStop(loop, mocks, 1);
      await loop.start(defaultConfig());
      await stopDone;

      expect(llm.infer).toHaveBeenCalledTimes(1);
      expect(mocks.adapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'LLM generated response' }),
      );
    });
  });
});
