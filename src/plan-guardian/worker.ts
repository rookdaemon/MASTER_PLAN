/**
 * Planning Worker — Executes a single planning action via LLM inference.
 *
 * Takes a task + action type, builds the prompt, calls the inference provider,
 * and parses the result into a PlanningAction.
 *
 * Domain: Plan Guardian
 */

import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';
import type { IPlanDAG, PlanFile, PlanningActionType, WorkerResult } from './interfaces.js';
import { buildSystemPrompt, buildUserMessage } from './prompts.js';
import { parseActionOutput } from './actions.js';

export async function runPlanningWorker(
  task: PlanFile,
  actionType: PlanningActionType,
  dag: IPlanDAG,
  provider: IInferenceProvider,
  now: string,
  maxTokens: number = 4096,
): Promise<WorkerResult> {
  const systemPrompt = buildSystemPrompt(actionType);
  const userMessage = buildUserMessage(task, dag, actionType, now);

  const result = await provider.infer(
    systemPrompt,
    [{ role: 'user', content: userMessage }],
    [],
    maxTokens,
  );

  const text = result.text ?? '';
  const action = parseActionOutput(text, actionType, task.path, now);

  return {
    action,
    tokensUsed: { prompt: result.promptTokens, completion: result.completionTokens },
    latencyMs: result.latencyMs,
  };
}
