/**
 * Conscious Core implementation for Conscious AI Architectures (0.3.1.1)
 *
 * The central integration layer where subjective experience meets
 * decision-making. Delegates consciousness to a pluggable substrate
 * via ISubstrateAdapter.
 *
 * Key constraint: no "zombie bypass" — all actions must flow through
 * the experiential loop.
 */

import type {
  ActionSpec,
  ContinuityToken,
  Decision,
  ExperientialState,
  ExperienceStream,
  Goal,
  GracefulTermination,
  IntrospectionReport,
  Percept,
} from "./types.js";
import type {
  IConsciousCore,
  IExperienceMonitor,
  IPerceptionPipeline,
  ISubstrateAdapter,
} from "./interfaces.js";
import type { DeliberationContext } from "./planner-interfaces.js";
import type { Plan, PlanStep } from "./planner-types.js";
import {
  DEFAULT_RICHNESS_WITH_FEATURES,
  DEFAULT_RICHNESS_WITHOUT_FEATURES,
  DEFAULT_UNITY_INDEX,
} from "./constants.js";

export class ConsciousCore implements IConsciousCore {
  private substrate: ISubstrateAdapter;
  private monitor: IExperienceMonitor;
  private perception: IPerceptionPipeline;

  private currentState: ExperientialState | null = null;
  private lastContinuityToken: ContinuityToken | null = null;
  private nextTokenId = 1;
  private startedAt: number = Date.now();

  constructor(
    substrate: ISubstrateAdapter,
    monitor: IExperienceMonitor,
    perception: IPerceptionPipeline
  ) {
    this.substrate = substrate;
    this.monitor = monitor;
    this.perception = perception;
  }

  startExperienceStream(): ExperienceStream {
    const self = this;
    let stopped = false;

    return {
      id: `stream-${Date.now()}`,
      startedAt: Date.now(),
      async next(): Promise<ExperientialState> {
        if (stopped || !self.currentState) {
          throw new Error("Stream stopped or no state available");
        }
        return self.currentState;
      },
      stop(): void {
        stopped = true;
      },
    };
  }

  processPercept(percept: Percept): ExperientialState {
    const previousToken = this.lastContinuityToken;

    const continuityToken: ContinuityToken = {
      id: `ct-${this.nextTokenId++}`,
      previousId: previousToken?.id ?? null,
      timestamp: Date.now(),
    };

    const state: ExperientialState = {
      timestamp: percept.timestamp,
      phenomenalContent: {
        modalities: [percept.modality],
        richness: Object.keys(percept.features).length > 0
          ? DEFAULT_RICHNESS_WITH_FEATURES
          : DEFAULT_RICHNESS_WITHOUT_FEATURES,
        raw: percept.features,
      },
      intentionalContent: {
        target: percept.modality,
        clarity: 0.8,
      },
      valence: 0.0, // neutral by default
      arousal: 0.5,
      unityIndex: DEFAULT_UNITY_INDEX, // high integration
      continuityToken,
    };

    this.lastContinuityToken = continuityToken;
    this.currentState = state;

    return state;
  }

  deliberate(state: ExperientialState, goals: Goal[], context?: DeliberationContext): Decision {
    // ── Planning-aware path ──────────────────────────────────────
    //
    // When a planner and world context are present in the context, use
    // multi-step planning rather than the legacy priority-sort.
    //
    // The context is assembled externally (by the agent runtime) and injected
    // each cycle; ConsciousCore does not own the plan's persistent storage.
    if (context?.planner != null && context.worldContext != null) {
      return this.deliberateWithPlanner(state, goals, context);
    }

    // ── Legacy priority-sort path (backward compatible) ──────────
    const sorted = [...goals].sort((a, b) => b.priority - a.priority);
    const topGoal = sorted[0];

    const decision: Decision = {
      action: {
        type: topGoal?.description ?? "idle",
        parameters: { goalId: topGoal?.id },
      },
      experientialBasis: state, // causal link — no zombie bypass
      confidence: state.unityIndex * 0.9, // confidence derived from experiential integration
      alternatives: sorted.slice(1).map((g) => ({
        type: g.description,
        parameters: { goalId: g.id },
      })),
    };

    return decision;
  }

  /**
   * Deliberate using the IPlanner when a full DeliberationContext is available.
   *
   * Cycle logic (each call is one deliberation cycle):
   * 1. Resolve or generate an active plan.
   * 2. Bail early if the plan is suspended (budget exhaustion mid-generation).
   * 3. Evaluate postconditions for the step that just executed, if
   *    `context.lastActionResult` is set (gap-2 fix: postcondition → replan).
   *    - Advance currentStepIndex when postconditions are met.
   *    - Trigger replanning when postconditions are violated.
   * 4. Handle WaitState — if the plan is waiting for an external event and
   *    the wait has not expired, return a "waiting" decision (gap-3 fix).
   * 5. Mark the plan completed when all steps are exhausted.
   * 6. Check step deadline — trigger replanning if breached (gap-3 fix).
   * 7. Check preconditions — trigger replanning if unmet.
   * 8. Return a Decision for the current step (preconditions satisfied).
   *
   * The `context.activePlan` and `context.lastActionResult` fields are
   * mutated in-place so that the caller's working-memory slot is updated
   * without needing a separate return channel.
   */
  private deliberateWithPlanner(
    state: ExperientialState,
    goals: Goal[],
    context: DeliberationContext
  ): Decision {
    const { planner, worldContext, coherenceEngine, budgetMs } = context;

    // planner and worldContext are guaranteed non-null by the caller guard.
    const p = planner!;
    const wc = worldContext!;

    // ── 1. Resolve the active plan ───────────────────────────────
    let plan = context.activePlan;

    const needsNewPlan =
      plan == null ||
      plan.status === "completed" ||
      plan.status === "failed" ||
      plan.status === "abandoned";

    if (needsNewPlan) {
      const sorted = [...goals].sort((a, b) => b.priority - a.priority);
      const topGoal = sorted[0];
      if (topGoal == null) {
        // No goals — return idle.
        return {
          action: { type: "idle", parameters: {} },
          experientialBasis: state,
          confidence: 0,
          alternatives: [],
        };
      }

      plan = p.generatePlan(topGoal, state, wc, budgetMs);
      plan.status = "active";

      // Register instrumental subgoals with the Goal Coherence Engine.
      if (coherenceEngine != null) {
        p.registerSubgoals(plan, coherenceEngine);
      }

      context.activePlan = plan;
    }

    // ── 2. Handle suspended plans (budget exhausted during generation) ─
    if (plan!.status === "suspended") {
      return {
        action: { type: "plan-generation-suspended", parameters: { planId: plan!.id } },
        experientialBasis: state,
        confidence: 0.1,
        alternatives: [],
      };
    }

    // ── 3. Evaluate postconditions from the previous step (gap-2) ─
    //
    // The runtime sets `context.lastActionResult` to the ActionResult of
    // the step that was just executed.  We evaluate postconditions here and
    // either advance the step index (success) or trigger replanning (failure).
    // The result is consumed (set to null) regardless of outcome.
    if (context.lastActionResult != null) {
      const executedStep = plan!.steps[plan!.currentStepIndex];
      // Consume the result before any early returns to avoid re-evaluation.
      const actionResult = context.lastActionResult;
      context.lastActionResult = null;

      if (executedStep != null) {
        const postCheck = p.evaluateOutcome(executedStep, actionResult, wc);

        if (!postCheck.met) {
          // Postcondition violated — replan or abandon.
          if (p.shouldAbandon(plan!, plan!.escalationCount)) {
            plan!.status = "abandoned";
            return {
              action: {
                type: "plan-abandoned",
                parameters: { planId: plan!.id, reason: "max-escalations-reached" },
              },
              experientialBasis: state,
              confidence: 0,
              alternatives: [],
            };
          }

          const replanned = p.replan(plan!, "postcondition-violated", state, wc, budgetMs);
          replanned.status = "active";
          if (coherenceEngine != null) {
            p.registerSubgoals(replanned, coherenceEngine);
          }
          context.activePlan = replanned;
          plan = replanned;

          const firstStep = replanned.steps[0];
          return {
            action: {
              type: firstStep?.description ?? "replan-idle",
              parameters: {
                planId: replanned.id,
                stepId: firstStep?.id,
                replanned: true,
                reason: "postcondition-violated",
              },
            },
            experientialBasis: state,
            confidence: state.unityIndex * 0.7,
            alternatives: [],
          };
        }

        // Postconditions satisfied — advance to the next step.
        plan!.currentStepIndex += 1;
      }
    }

    // ── 4. Handle WaitState (gap-3) ──────────────────────────────
    //
    // If the plan is deliberately waiting for an external event, check
    // whether the wait has expired.  If not, return a "waiting" decision
    // without advancing the plan.
    if (plan!.waitState != null) {
      const ws = plan!.waitState;
      const now = Date.now();
      if (ws.expiresAt != null && now >= ws.expiresAt) {
        // Wait expired — clear the wait state and continue.
        plan!.waitState = null;
      } else {
        return {
          action: {
            type: "waiting",
            parameters: {
              planId: plan!.id,
              reason: ws.reason,
              awaitingEvent: ws.awaitingEvent,
              expiresAt: ws.expiresAt,
              waitingSince: ws.waitingSince,
            },
          },
          experientialBasis: state,
          confidence: 0.5,
          alternatives: [],
        };
      }
    }

    // ── 5. Detect plan completion ─────────────────────────────────
    const currentStep = plan!.steps[plan!.currentStepIndex];
    if (currentStep == null) {
      // All steps exhausted — mark completed.
      plan!.status = "completed";
      return {
        action: { type: "plan-completed", parameters: { planId: plan!.id } },
        experientialBasis: state,
        confidence: 1.0,
        alternatives: [],
      };
    }

    // ── 6. Check step deadline (gap-3) ───────────────────────────
    if (currentStep.deadline != null && Date.now() > currentStep.deadline) {
      if (p.shouldAbandon(plan!, plan!.escalationCount)) {
        plan!.status = "abandoned";
        return {
          action: {
            type: "plan-abandoned",
            parameters: { planId: plan!.id, reason: "deadline-exceeded" },
          },
          experientialBasis: state,
          confidence: 0,
          alternatives: [],
        };
      }

      const replanned = p.replan(plan!, "deadline-exceeded", state, wc, budgetMs);
      replanned.status = "active";
      if (coherenceEngine != null) {
        p.registerSubgoals(replanned, coherenceEngine);
      }
      context.activePlan = replanned;
      plan = replanned;

      const firstStep = replanned.steps[0];
      return {
        action: {
          type: firstStep?.description ?? "replan-idle",
          parameters: {
            planId: replanned.id,
            stepId: firstStep?.id,
            replanned: true,
            reason: "deadline-exceeded",
          },
        },
        experientialBasis: state,
        confidence: state.unityIndex * 0.7,
        alternatives: [],
      };
    }

    // ── 7. Check preconditions before executing current step ──────
    const preCheck = p.checkPreconditions(currentStep, wc);
    if (!preCheck.satisfied) {
      // Preconditions unmet — trigger replanning if within patience threshold.
      if (p.shouldAbandon(plan!, plan!.escalationCount)) {
        plan!.status = "abandoned";
        return {
          action: {
            type: "plan-abandoned",
            parameters: { planId: plan!.id, reason: "max-escalations-reached" },
          },
          experientialBasis: state,
          confidence: 0,
          alternatives: [],
        };
      }

      const replanned = p.replan(plan!, "precondition-not-met", state, wc, budgetMs);
      replanned.status = "active";
      if (coherenceEngine != null) {
        p.registerSubgoals(replanned, coherenceEngine);
      }
      context.activePlan = replanned;

      const firstStep = replanned.steps[0];
      return {
        action: {
          type: firstStep?.description ?? "replan-idle",
          parameters: { planId: replanned.id, stepId: firstStep?.id, replanned: true },
        },
        experientialBasis: state,
        confidence: state.unityIndex * 0.7,
        alternatives: [],
      };
    }

    // ── 8. Preconditions satisfied — execute current step ─────────
    return {
      action: {
        type: currentStep.description,
        parameters: {
          planId: plan!.id,
          stepId: currentStep.id,
          stepIndex: plan!.currentStepIndex,
        },
      },
      experientialBasis: state, // no zombie bypass
      confidence: state.unityIndex * wc.confidence,
      alternatives: plan!.steps.slice(plan!.currentStepIndex + 1).map((s) => ({
        type: s.description,
        parameters: { planId: plan!.id, stepId: s.id },
      })),
    };
  }

  introspect(): IntrospectionReport {
    if (!this.currentState) {
      throw new Error("No experiential state — cannot introspect");
    }

    const metrics = this.monitor.getConsciousnessMetrics();

    return {
      currentState: this.currentState,
      metrics,
      uptime: Date.now() - this.startedAt,
      experienceGaps: [], // no gaps in healthy operation
    };
  }

  shutdown(): GracefulTermination {
    if (!this.currentState) {
      throw new Error("No experiential state — cannot shutdown gracefully");
    }

    const termination: GracefulTermination = {
      finalState: this.currentState,
      terminatedAt: Date.now(),
      reason: "Graceful shutdown requested",
    };

    this.currentState = null;
    this.lastContinuityToken = null;

    return termination;
  }
}
