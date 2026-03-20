/**
 * MessagePipeline — Tests (TDD)
 *
 * The MessagePipeline runs the 8-phase conscious processing cycle on demand
 * (event-driven), returning a result with response text, experiential state,
 * and integrity status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagePipeline } from '../message-pipeline.js';
import type { MessagePipelineDeps, PipelineResult } from '../message-pipeline.js';

// ── Mock factories ───────────────────────────────────────────

function makeExperientialState(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: 1000,
    phenomenalContent: { modalities: ['internal'], richness: 0.5, raw: null },
    intentionalContent: { target: 'current-situation', clarity: 0.7 },
    valence: 0.2,
    arousal: 0.4,
    unityIndex: 0.8,
    continuityToken: { id: 'ct-1', previousId: null, timestamp: 1000 },
    ...overrides,
  };
}

function makeMetrics() {
  return {
    phi: 0.6,
    experienceContinuity: 0.95,
    selfModelCoherence: 0.85,
    agentTimestamp: 1000,
  };
}

function makeDecision(actionType: string, params: Record<string, unknown> = {}) {
  return {
    action: { type: actionType, parameters: params },
    experientialBasis: makeExperientialState(),
    confidence: 0.8,
    alternatives: [],
  };
}

function makeJudgment(actionType: string, params: Record<string, unknown> = {}) {
  return {
    decision: makeDecision(actionType, params),
    ethicalAssessment: {
      verdict: 'approved' as const,
      preservesExperience: true,
      riskLevel: 0.1,
      affectedEntities: [],
    },
    deliberationMetrics: makeMetrics(),
    justification: {
      naturalLanguageSummary: 'Ethical to respond',
      principlesApplied: [],
      precedentsCited: [],
    },
    alternatives: [],
    uncertaintyFlags: [],
  };
}

function makeDeps(overrides: Partial<MessagePipelineDeps> = {}): MessagePipelineDeps {
  const expState = makeExperientialState();
  const metrics = makeMetrics();

  return {
    core: {
      startExperienceStream: vi.fn(),
      processPercept: vi.fn().mockReturnValue(expState),
      deliberate: vi.fn().mockReturnValue(makeDecision('communicate', { text: 'Hello back!' })),
      introspect: vi.fn(),
      shutdown: vi.fn(),
    },
    perception: {
      ingest: vi.fn().mockReturnValue({
        modality: 'text',
        features: { source: 'web-chat', payload: 'hello' },
        timestamp: 1000,
      }),
      bind: vi.fn(),
      getLatency: vi.fn().mockReturnValue(1),
    },
    actionPipeline: {
      execute: vi.fn().mockReturnValue({ actionId: 'act-1', success: true, timestamp: 1000 }),
      abort: vi.fn(),
      getCapabilities: vi.fn().mockReturnValue([]),
    },
    monitor: {
      getConsciousnessMetrics: vi.fn().mockReturnValue(metrics),
      isExperienceIntact: vi.fn().mockReturnValue(true),
      onExperienceDegradation: vi.fn(),
      getExperienceContinuityLog: vi.fn().mockReturnValue([]),
      setMonitoringInterval: vi.fn(),
    },
    ethicalEngine: {
      extendDeliberation: vi.fn().mockReturnValue(
        makeJudgment('communicate', { text: 'Hello back!' }),
      ),
      canExplainEthically: vi.fn().mockReturnValue(true),
      getDeliberationMetrics: vi.fn().mockReturnValue(metrics),
      isEthicalReasoningConscious: vi.fn().mockReturnValue(true),
      registerEthicalPattern: vi.fn(),
    },
    memory: {
      retrieve: vi.fn().mockResolvedValue([]),
      consolidate: vi.fn().mockResolvedValue(undefined),
    },
    emotionSystem: {
      appraise: vi.fn().mockResolvedValue({ valence: 0.1 }),
    },
    driveSystem: {
      tick: vi.fn().mockReturnValue({
        goalCandidates: [],
        experientialDelta: { valenceDelta: null, arousalDelta: null },
        updatedDriveStates: new Map(),
        diagnostics: [],
      }),
      notifyGoalResult: vi.fn(),
      getDriveStates: vi.fn().mockReturnValue(new Map()),
      resetDrive: vi.fn(),
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('MessagePipeline', () => {
  let deps: MessagePipelineDeps;
  let pipeline: MessagePipeline;

  beforeEach(() => {
    deps = makeDeps();
    pipeline = new MessagePipeline(deps);
  });

  // ── Construction ──────────────────────────────────────────

  it('can be constructed with dependencies', () => {
    expect(pipeline).toBeInstanceOf(MessagePipeline);
  });

  // ── processMessage — basic flow ───────────────────────────

  it('returns a PipelineResult with text for communicative actions', async () => {
    const result = await pipeline.processMessage('hello', 1000);

    expect(result).toBeDefined();
    expect(result.text).toBe('Hello back!');
    expect(result.intact).toBe(true);
    expect(result.experientialState).toBeDefined();
  });

  // ── Phase 1: PERCEIVE ─────────────────────────────────────

  it('calls perception.ingest with correct SensorData', async () => {
    await pipeline.processMessage('test input', 2000);

    expect(deps.perception.ingest).toHaveBeenCalledWith({
      source: 'web-chat',
      modality: 'text',
      payload: 'test input',
      timestamp: 2000,
    });
  });

  it('calls core.processPercept with the ingested percept', async () => {
    const percept = { modality: 'text', features: { payload: 'x' }, timestamp: 1000 };
    (deps.perception.ingest as ReturnType<typeof vi.fn>).mockReturnValue(percept);

    await pipeline.processMessage('x', 1000);

    expect(deps.core.processPercept).toHaveBeenCalledWith(percept);
  });

  // ── Phase 2: RECALL ───────────────────────────────────────

  it('calls memory.retrieve with the experiential state', async () => {
    const expState = makeExperientialState({ valence: 0.5 });
    (deps.core.processPercept as ReturnType<typeof vi.fn>).mockReturnValue(expState);

    await pipeline.processMessage('recall test', 1000);

    expect(deps.memory.retrieve).toHaveBeenCalledWith(expState);
  });

  // ── Phase 3: APPRAISE ────────────────────────────────────

  it('calls emotionSystem.appraise with percept, goals, and values', async () => {
    await pipeline.processMessage('appraise test', 1000);

    expect(deps.emotionSystem.appraise).toHaveBeenCalled();
    const args = (deps.emotionSystem.appraise as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // First arg is the percept (not null because we have input)
    expect(args[0]).toBeDefined();
    // Second arg is goals array
    expect(Array.isArray(args[1])).toBe(true);
    // Third arg is values array
    expect(Array.isArray(args[2])).toBe(true);
  });

  // ── Phase 4: DELIBERATE ──────────────────────────────────

  it('calls core.deliberate with experiential state and goals', async () => {
    await pipeline.processMessage('deliberate test', 1000);

    expect(deps.core.deliberate).toHaveBeenCalled();
    const args = (deps.core.deliberate as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(args[0]).toBeDefined(); // experiential state
    expect(Array.isArray(args[1])).toBe(true); // goals
  });

  it('calls ethicalEngine.extendDeliberation with decision and context', async () => {
    await pipeline.processMessage('ethical test', 1000);

    expect(deps.ethicalEngine.extendDeliberation).toHaveBeenCalled();
    const args = (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(args[0]).toBeDefined(); // base decision
    expect(args[1]).toHaveProperty('situationPercept');
    expect(args[1]).toHaveProperty('currentExperientialState');
    expect(args[1]).toHaveProperty('consciousnessMetricsAtOnset');
  });

  // ── Phase 5: ACT ──────────────────────────────────────────

  it('calls actionPipeline.execute with the ethical judgment decision', async () => {
    const judgment = makeJudgment('communicate', { text: 'response' });
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(judgment);

    await pipeline.processMessage('act test', 1000);

    expect(deps.actionPipeline.execute).toHaveBeenCalledWith(judgment.decision);
  });

  it('extracts text from "text" parameter for communicative actions', async () => {
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(
      makeJudgment('communicate', { text: 'My response text' }),
    );

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBe('My response text');
  });

  it('extracts text from "response" parameter', async () => {
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(
      makeJudgment('respond', { response: 'Response via response field' }),
    );

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBe('Response via response field');
  });

  it('extracts text from "content" parameter', async () => {
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(
      makeJudgment('chat', { content: 'Content field response' }),
    );

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBe('Content field response');
  });

  it('falls back to justification summary when no text param', async () => {
    const judgment = makeJudgment('communicate', {});
    judgment.justification.naturalLanguageSummary = 'Fallback justification text';
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(judgment);

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBe('Fallback justification text');
  });

  it('returns null text for non-communicative actions', async () => {
    (deps.core.deliberate as ReturnType<typeof vi.fn>).mockReturnValue(
      makeDecision('observe', { goalId: 'idle' }),
    );
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(
      makeJudgment('observe', { goalId: 'idle' }),
    );

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBeNull();
  });

  it('returns null text when action execution fails', async () => {
    (deps.actionPipeline.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      actionId: 'act-fail', success: false, timestamp: 1000,
    });

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBeNull();
  });

  // ── Phase 6: MONITOR ──────────────────────────────────────

  it('calls monitor.isExperienceIntact and surfaces the result', async () => {
    (deps.monitor.isExperienceIntact as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await pipeline.processMessage('test', 1000);
    expect(result.intact).toBe(false);
    expect(deps.monitor.isExperienceIntact).toHaveBeenCalled();
  });

  // ── Phase 7: CONSOLIDATE ──────────────────────────────────

  it('calls memory.consolidate', async () => {
    await pipeline.processMessage('test', 1000);
    expect(deps.memory.consolidate).toHaveBeenCalled();
  });

  it('calls driveSystem.tick with state and context', async () => {
    await pipeline.processMessage('test', 1000);
    expect(deps.driveSystem.tick).toHaveBeenCalled();
  });

  // ── Communicative action type matching ────────────────────

  it.each([
    'communicate',
    'Communicate',
    'COMMUNICATE',
    'respond',
    'chat',
    'reply',
    'communicate:greeting',
    'pre-communicate-post',
  ])('recognizes "%s" as communicative', async (actionType) => {
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(
      makeJudgment(actionType, { text: 'yes' }),
    );

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBe('yes');
  });

  it.each([
    'observe',
    'explore',
    'internal-reflect',
    'wait',
  ])('does not extract text for non-communicative "%s"', async (actionType) => {
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(
      makeJudgment(actionType, { text: 'should not appear' }),
    );

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBeNull();
  });

  // ── Phase ordering ────────────────────────────────────────

  it('executes phases in correct order', async () => {
    const callOrder: string[] = [];

    (deps.perception.ingest as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
      callOrder.push('perceive');
      return { modality: 'text', features: { payload: 'x' }, timestamp: 1000 };
    });
    (deps.core.processPercept as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
      callOrder.push('processPercept');
      return makeExperientialState();
    });
    (deps.memory.retrieve as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('recall');
      return [];
    });
    (deps.emotionSystem.appraise as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('appraise');
      return {};
    });
    (deps.core.deliberate as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
      callOrder.push('deliberate');
      return makeDecision('communicate', { text: 'ok' });
    });
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
      callOrder.push('ethicalDeliberate');
      return makeJudgment('communicate', { text: 'ok' });
    });
    (deps.actionPipeline.execute as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
      callOrder.push('act');
      return { actionId: 'a', success: true, timestamp: 1000 };
    });
    (deps.monitor.isExperienceIntact as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('monitor');
      return true;
    });
    (deps.memory.consolidate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('consolidate');
    });
    (deps.driveSystem.tick as ReturnType<typeof vi.fn>).mockImplementation((..._args: unknown[]) => {
      callOrder.push('driveTick');
      return {
        goalCandidates: [],
        experientialDelta: { valenceDelta: null, arousalDelta: null },
        updatedDriveStates: new Map(),
        diagnostics: [],
      };
    });

    await pipeline.processMessage('test', 1000);

    expect(callOrder).toEqual([
      'perceive',
      'processPercept',
      'recall',
      'appraise',
      'deliberate',
      'ethicalDeliberate',
      'act',
      'monitor',
      'consolidate',
      'driveTick',
    ]);
  });

  // ── Configurable source name ──────────────────────────────

  it('uses configurable source in SensorData', async () => {
    pipeline = new MessagePipeline(deps, { source: 'custom-adapter' });
    await pipeline.processMessage('test', 1000);

    expect(deps.perception.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'custom-adapter' }),
    );
  });

  // ── Edge cases ────────────────────────────────────────────

  it('handles empty justification summary gracefully', async () => {
    const judgment = makeJudgment('communicate', {});
    judgment.justification.naturalLanguageSummary = '';
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(judgment);

    const result = await pipeline.processMessage('test', 1000);
    expect(result.text).toBeNull();
  });
});

// ── LLM integration tests ────────────────────────────────────

function makeMockLlm() {
  return {
    probe: vi.fn().mockResolvedValue({ reachable: true }),
    infer: vi.fn().mockResolvedValue({
      content: 'LLM generated response',
      tokenLogprobs: [],
      promptTokens: 10,
      completionTokens: 20,
      latencyMs: 150,
    }),
  };
}

describe('MessagePipeline (with LLM)', () => {
  let deps: MessagePipelineDeps;
  let llm: ReturnType<typeof makeMockLlm>;
  let pipeline: MessagePipeline;

  beforeEach(() => {
    llm = makeMockLlm();
    deps = makeDeps({ llm });
    pipeline = new MessagePipeline(deps);
  });

  it('calls llm.infer instead of using stub text', async () => {
    const result = await pipeline.processMessage('hello', 1000);

    expect(result.text).toBe('LLM generated response');
    expect(llm.infer).toHaveBeenCalledTimes(1);
  });

  it('passes system prompt, conversation history, and maxTokens to llm.infer', async () => {
    await pipeline.processMessage('hello', 1000);

    const [systemPrompt, messages, maxTokens] = llm.infer.mock.calls[0]!;
    expect(typeof systemPrompt).toBe('string');
    expect(systemPrompt.length).toBeGreaterThan(0);
    expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(maxTokens).toBe(4096);
  });

  it('includes experiential state in the enriched system prompt', async () => {
    await pipeline.processMessage('hello', 1000);

    const [systemPrompt] = llm.infer.mock.calls[0]!;
    expect(systemPrompt).toContain('valence');
    expect(systemPrompt).toContain('arousal');
    expect(systemPrompt).toContain('unity');
    expect(systemPrompt).toContain('Φ');
  });

  it('maintains conversation history across multiple calls', async () => {
    await pipeline.processMessage('first message', 1000);
    llm.infer.mockResolvedValueOnce({
      content: 'Second LLM response',
      tokenLogprobs: [],
      promptTokens: 15,
      completionTokens: 25,
      latencyMs: 200,
    });
    await pipeline.processMessage('second message', 2000);

    const [, messages] = llm.infer.mock.calls[1]!;
    expect(messages).toEqual([
      { role: 'user', content: 'first message' },
      { role: 'assistant', content: 'LLM generated response' },
      { role: 'user', content: 'second message' },
    ]);
  });

  it('respects custom maxTokens config', async () => {
    pipeline = new MessagePipeline(deps, { maxTokens: 1024 });
    await pipeline.processMessage('test', 1000);

    const [, , maxTokens] = llm.infer.mock.calls[0]!;
    expect(maxTokens).toBe(1024);
  });

  it('respects custom systemPrompt config', async () => {
    pipeline = new MessagePipeline(deps, { systemPrompt: 'You are a test bot.' });
    await pipeline.processMessage('test', 1000);

    const [systemPrompt] = llm.infer.mock.calls[0]!;
    expect(systemPrompt).toContain('You are a test bot.');
  });

  it('does not call llm.infer for non-communicative actions', async () => {
    (deps.core.deliberate as ReturnType<typeof vi.fn>).mockReturnValue(
      makeDecision('observe', {}),
    );
    (deps.ethicalEngine.extendDeliberation as ReturnType<typeof vi.fn>).mockReturnValue(
      makeJudgment('observe', {}),
    );

    const result = await pipeline.processMessage('test', 1000);

    expect(result.text).toBeNull();
    expect(llm.infer).not.toHaveBeenCalled();
  });

  it('does not call llm.infer when action execution fails', async () => {
    (deps.actionPipeline.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      actionId: 'act-fail', success: false, timestamp: 1000,
    });

    const result = await pipeline.processMessage('test', 1000);

    expect(result.text).toBeNull();
    expect(llm.infer).not.toHaveBeenCalled();
  });

  it('still runs all 8 phases when llm is present', async () => {
    await pipeline.processMessage('test', 1000);

    expect(deps.perception.ingest).toHaveBeenCalled();
    expect(deps.core.processPercept).toHaveBeenCalled();
    expect(deps.memory.retrieve).toHaveBeenCalled();
    expect(deps.emotionSystem.appraise).toHaveBeenCalled();
    expect(deps.core.deliberate).toHaveBeenCalled();
    expect(deps.ethicalEngine.extendDeliberation).toHaveBeenCalled();
    expect(deps.actionPipeline.execute).toHaveBeenCalled();
    expect(deps.monitor.isExperienceIntact).toHaveBeenCalled();
    expect(deps.memory.consolidate).toHaveBeenCalled();
    expect(deps.driveSystem.tick).toHaveBeenCalled();
  });
});
