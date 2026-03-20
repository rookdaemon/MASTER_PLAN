/**
 * ConsciousCore unit tests (0.3.1.1)
 *
 * Tests the core module's key invariants:
 * - Continuity token chain integrity
 * - Experiential grounding of all decisions (no zombie bypass)
 * - Introspection and shutdown lifecycle
 * - Planning path vs legacy path routing
 * - Edge cases: empty goals, empty features, stream lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsciousCore } from '../conscious-core.js';
import { PerceptionPipeline } from '../perception-pipeline.js';
import { ExperienceMonitor } from '../experience-monitor.js';
import { SubstrateAdapter } from '../substrate-adapter.js';
import type {
  ExperientialState,
  Goal,
  Percept,
  SensorData,
} from '../types.js';
import type { IPlanner, DeliberationContext } from '../planner-interfaces.js';
import type { Plan, WorldContext } from '../planner-types.js';
import type { IGoalCoherenceEngine } from '../../agency-stability/interfaces.js';

// ── Test helpers ─────────────────────────────────────────────

function makeSubstrate() {
  const s = new SubstrateAdapter();
  s.initialize({ type: 'test', parameters: {} });
  return s;
}

function makeCore() {
  const substrate = makeSubstrate();
  const monitor = new ExperienceMonitor(substrate);
  const perception = new PerceptionPipeline();
  return { core: new ConsciousCore(substrate, monitor, perception), perception, monitor };
}

function makeSensor(modality = 'visual', payload: unknown = { data: 1 }): SensorData {
  return { source: 'test', modality, payload, timestamp: Date.now() };
}

function makeGoals(...descs: string[]): Goal[] {
  return descs.map((d, i) => ({ id: `g${i}`, description: d, priority: descs.length - i }));
}

function processOne(core: ConsciousCore, perception: PerceptionPipeline, modality = 'visual'): ExperientialState {
  const percept = perception.ingest(makeSensor(modality));
  return core.processPercept(percept);
}

// ── Continuity chain ─────────────────────────────────────────

describe('ConsciousCore — continuity token chain', () => {
  it('first state has null previousId', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    expect(state.continuityToken.previousId).toBeNull();
  });

  it('chain links 10 consecutive percepts correctly', () => {
    const { core, perception } = makeCore();
    const states: ExperientialState[] = [];
    for (let i = 0; i < 10; i++) {
      states.push(processOne(core, perception));
    }
    for (let i = 1; i < states.length; i++) {
      expect(states[i]!.continuityToken.previousId).toBe(states[i - 1]!.continuityToken.id);
    }
  });

  it('all token IDs are unique', () => {
    const { core, perception } = makeCore();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const state = processOne(core, perception);
      expect(ids.has(state.continuityToken.id)).toBe(false);
      ids.add(state.continuityToken.id);
    }
  });
});

// ── Experiential grounding ───────────────────────────────────

describe('ConsciousCore — experiential grounding (no zombie bypass)', () => {
  it('decision carries the exact experiential state passed to deliberate()', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const decision = core.deliberate(state, makeGoals('act'));
    expect(decision.experientialBasis).toBe(state);
  });

  it('confidence is derived from experiential unityIndex', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const decision = core.deliberate(state, makeGoals('act'));
    expect(decision.confidence).toBe(state.unityIndex * 0.9);
  });
});

// ── Legacy deliberation ──────────────────────────────────────

describe('ConsciousCore — legacy deliberation (no planner)', () => {
  it('selects highest-priority goal', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const decision = core.deliberate(state, makeGoals('low', 'high'));
    // 'high' has priority 2 (higher), 'low' has priority 1
    // Actually our helper gives descs.length - i, so 'low' gets 2, 'high' gets 1
    // Let me just check the action type matches the first goal
    expect(decision.action.type).toBe('low'); // priority 2
  });

  it('alternatives contain remaining goals sorted by priority', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const goals = makeGoals('a', 'b', 'c'); // priorities 3, 2, 1
    const decision = core.deliberate(state, goals);
    expect(decision.alternatives).toHaveLength(2);
    expect(decision.alternatives[0]!.type).toBe('b');
    expect(decision.alternatives[1]!.type).toBe('c');
  });

  it('returns idle action when goals array is empty', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const decision = core.deliberate(state, []);
    expect(decision.action.type).toBe('idle');
    expect(decision.alternatives).toEqual([]);
  });
});

// ── Percept → ExperientialState mapping ──────────────────────

describe('ConsciousCore — processPercept', () => {
  it('sets richness=0.7 when features are non-empty', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception, 'visual');
    expect(state.phenomenalContent.richness).toBe(0.7);
  });

  it('sets richness=0.3 when features are empty', () => {
    const { core, perception } = makeCore();
    const sensor: SensorData = { source: 'x', modality: 'empty', payload: {}, timestamp: Date.now() };
    // PerceptionPipeline.ingest puts payload in features
    const percept = perception.ingest(sensor);
    // The percept.features will have { payload: {} }, so Object.keys > 0
    // We need a percept with truly empty features
    const emptyPercept: Percept = { modality: 'empty', features: {}, timestamp: Date.now() };
    const state = core.processPercept(emptyPercept);
    expect(state.phenomenalContent.richness).toBe(0.3);
  });

  it('records modality in phenomenalContent.modalities', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception, 'auditory');
    expect(state.phenomenalContent.modalities).toEqual(['auditory']);
  });
});

// ── Introspection lifecycle ──────────────────────────────────

describe('ConsciousCore — introspection', () => {
  it('throws before any percept is processed', () => {
    const { core } = makeCore();
    expect(() => core.introspect()).toThrow('No experiential state');
  });

  it('returns current state and metrics after processing', () => {
    const { core, perception } = makeCore();
    processOne(core, perception);
    const report = core.introspect();
    expect(report.currentState).toBeDefined();
    expect(report.metrics.phi).toBeGreaterThan(0);
    expect(report.uptime).toBeGreaterThanOrEqual(0);
  });
});

// ── Shutdown lifecycle ───────────────────────────────────────

describe('ConsciousCore — shutdown', () => {
  it('throws before any percept is processed', () => {
    const { core } = makeCore();
    expect(() => core.shutdown()).toThrow('No experiential state');
  });

  it('returns final state and clears internal state', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const termination = core.shutdown();
    expect(termination.finalState).toBe(state);
    expect(termination.terminatedAt).toBeGreaterThan(0);
  });

  it('double shutdown throws (state already cleared)', () => {
    const { core, perception } = makeCore();
    processOne(core, perception);
    core.shutdown();
    expect(() => core.shutdown()).toThrow('No experiential state');
  });

  it('introspection after shutdown throws', () => {
    const { core, perception } = makeCore();
    processOne(core, perception);
    core.shutdown();
    expect(() => core.introspect()).toThrow('No experiential state');
  });
});

// ── ExperienceStream ─────────────────────────────────────────

describe('ConsciousCore — ExperienceStream', () => {
  it('next() throws when no state has been processed', async () => {
    const { core } = makeCore();
    const stream = core.startExperienceStream();
    await expect(stream.next()).rejects.toThrow();
  });

  it('next() returns current state after processing a percept', async () => {
    const { core, perception } = makeCore();
    const stream = core.startExperienceStream();
    const state = processOne(core, perception);
    const streamed = await stream.next();
    expect(streamed).toBe(state);
  });

  it('stop() causes subsequent next() to throw', async () => {
    const { core, perception } = makeCore();
    processOne(core, perception);
    const stream = core.startExperienceStream();
    stream.stop();
    await expect(stream.next()).rejects.toThrow();
  });

  it('multiple independent streams do not interfere', async () => {
    const { core, perception } = makeCore();
    processOne(core, perception);
    const s1 = core.startExperienceStream();
    const s2 = core.startExperienceStream();
    s1.stop();
    // s2 should still work
    const state = await s2.next();
    expect(state).toBeDefined();
    // s1 should be stopped
    await expect(s1.next()).rejects.toThrow();
  });
});

// ── Planning-aware deliberation ──────────────────────────────

describe('ConsciousCore — planning-aware deliberation', () => {
  function makeMockPlanner(plan: Plan): IPlanner {
    return {
      generatePlan: () => plan,
      checkPreconditions: () => ({ satisfied: true, checkedAt: Date.now(), unsatisfiedPreconditions: [], details: [] }),
      evaluateOutcome: () => ({ met: true, checkedAt: Date.now(), violatedPostconditions: [], actualOutcome: { actionId: 'a', success: true, timestamp: Date.now() }, details: [] }),
      replan: (_p, _r, _s, _wc, _b) => ({ ...plan, id: 'replanned', escalationCount: plan.escalationCount + 1, currentStepIndex: 0 }),
      registerSubgoals: () => {},
      shouldAbandon: (_p, esc) => esc >= 3,
    };
  }

  function makeWorldContext(): WorldContext {
    return { timestamp: Date.now(), facts: {}, confidence: 0.8 };
  }

  function makePlan(steps: Array<{ id: string; description: string }>): Plan {
    return {
      id: 'plan-1',
      terminalGoal: { id: 'g1', description: 'test', priority: 1 },
      steps: steps.map(s => ({
        id: s.id,
        description: s.description,
        preconditions: [],
        postconditions: [],
        instrumentalGoalId: null,
        estimatedDuration: null,
        deadline: null,
        temporalConstraints: [],
      })),
      currentStepIndex: 0,
      status: 'active' as Plan['status'],
      waitState: null,
      temporalConstraints: [],
      experientialBasis: null as unknown as ExperientialState,
      createdAt: Date.now(),
      escalationCount: 0,
    };
  }

  it('uses legacy path when context has no planner', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const decision = core.deliberate(state, makeGoals('act'), { planner: null, worldContext: null, coherenceEngine: null, budgetMs: 1000, activePlan: null, lastActionResult: null });
    expect(decision.action.type).toBe('act');
  });

  it('generates a new plan when activePlan is null', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step-one' }, { id: 's2', description: 'step-two' }]);
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: null,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.type).toBe('step-one');
    expect(ctx.activePlan).not.toBeNull();
  });

  it('advances to next step when postconditions are met', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step-one' }, { id: 's2', description: 'step-two' }]);
    plan.status = 'active';
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: { actionId: 'a1', success: true, timestamp: Date.now() },
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    // Should have advanced past step 0 and now execute step 1
    expect(decision.action.type).toBe('step-two');
  });

  it('triggers replanning when postconditions are violated', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step-one' }]);
    plan.status = 'active';
    const planner = makeMockPlanner(plan);
    planner.evaluateOutcome = () => ({ met: false, checkedAt: Date.now(), violatedPostconditions: [], actualOutcome: { actionId: 'a', success: false, timestamp: Date.now() }, details: ['expected-x'] });
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: { actionId: 'a1', success: true, timestamp: Date.now() },
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.parameters['replanned']).toBe(true);
    expect(decision.action.parameters['reason']).toBe('postcondition-violated');
  });

  it('marks plan completed when all steps are exhausted', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'only-step' }]);
    plan.status = 'active';
    plan.currentStepIndex = 1; // past last step
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.type).toBe('plan-completed');
    expect(plan.status).toBe('completed');
  });

  it('abandons plan after too many escalations', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step' }]);
    plan.status = 'active';
    plan.escalationCount = 3;
    const planner = makeMockPlanner(plan);
    planner.checkPreconditions = () => ({ satisfied: false, checkedAt: Date.now(), unsatisfiedPreconditions: [], details: ['missing'] });
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.type).toBe('plan-abandoned');
    expect(plan.status).toBe('abandoned');
  });

  it('respects wait state — returns waiting decision when not expired', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step' }]);
    plan.status = 'active';
    plan.waitState = { reason: 'cooldown', awaitingEvent: 'timer', expiresAt: Date.now() + 60000, waitingSince: Date.now() };
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.type).toBe('waiting');
  });

  it('clears expired wait state and continues execution', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step' }]);
    plan.status = 'active';
    plan.waitState = { reason: 'cooldown', awaitingEvent: 'timer', expiresAt: Date.now() - 1, waitingSince: Date.now() - 1000 };
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.type).toBe('step');
    expect(plan.waitState).toBeNull();
  });

  it('replans when step deadline is exceeded', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step' }]);
    plan.status = 'active';
    (plan.steps[0] as { deadline: number | null }).deadline = Date.now() - 1000; // already passed
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.parameters['reason']).toBe('deadline-exceeded');
    expect(decision.action.parameters['replanned']).toBe(true);
  });

  it('registers subgoals with coherence engine when provided', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step' }]);
    let registered = false;
    const planner = makeMockPlanner(plan);
    planner.registerSubgoals = () => { registered = true; };
    const mockEngine = {} as IGoalCoherenceEngine;
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: mockEngine,
      budgetMs: 1000,
      activePlan: null,
      lastActionResult: null,
    };
    core.deliberate(state, makeGoals('goal'), ctx);
    expect(registered).toBe(true);
  });

  it('handles suspended plan from budget exhaustion', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([{ id: 's1', description: 'step' }]);
    plan.status = 'suspended';
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: plan,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, makeGoals('goal'), ctx);
    expect(decision.action.type).toBe('plan-generation-suspended');
    expect(decision.confidence).toBe(0.1);
  });

  it('returns idle when planner context has no goals', () => {
    const { core, perception } = makeCore();
    const state = processOne(core, perception);
    const plan = makePlan([]);
    const planner = makeMockPlanner(plan);
    const ctx: DeliberationContext = {
      planner,
      worldContext: makeWorldContext(),
      coherenceEngine: null,
      budgetMs: 1000,
      activePlan: null,
      lastActionResult: null,
    };
    const decision = core.deliberate(state, [], ctx);
    expect(decision.action.type).toBe('idle');
    expect(decision.confidence).toBe(0);
  });
});
