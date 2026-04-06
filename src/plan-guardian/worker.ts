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

export type ActionValidator = (actionText: string) => string[];

export async function runPlanningWorker(
  task: PlanFile,
  actionType: PlanningActionType,
  dag: IPlanDAG,
  provider: IInferenceProvider,
  now: string,
  maxTokens: number = 4096,
  validateText?: ActionValidator,
): Promise<WorkerResult> {
  const systemPrompt = buildSystemPrompt(actionType);
  const userMessage = buildUserMessage(task, dag, actionType, now);

  const first = await provider.infer(
    systemPrompt,
    [{ role: 'user', content: userMessage }],
    [],
    maxTokens,
  );

  const firstText = first.text ?? '';
  const firstViolations = validateText?.(firstText) ?? [];

  if (firstViolations.length === 0) {
    const action = parseActionOutput(firstText, actionType, task.path, now);
    return {
      action,
      tokensUsed: { prompt: first.promptTokens, completion: first.completionTokens },
      latencyMs: first.latencyMs,
    };
  }

  const repairMessage = `${userMessage}\n\nREPAIR REQUIRED\nYour last output violated integrity constraints:\n${firstViolations.map(v => `- ${v}`).join('\n')}\n\nRegenerate output with the exact same action type and valid references only.`;

  const second = await provider.infer(
    systemPrompt,
    [{ role: 'user', content: repairMessage }],
    [],
    maxTokens,
  );

  const secondText = second.text ?? '';
  const secondViolations = validateText?.(secondText) ?? [];
  if (secondViolations.length > 0) {
    throw new Error(`Integrity retry failed: ${secondViolations.join('; ')}`);
  }

  const action = parseActionOutput(secondText, actionType, task.path, now);
  return {
    action,
    tokensUsed: {
      prompt: first.promptTokens + second.promptTokens,
      completion: first.completionTokens + second.completionTokens,
    },
    latencyMs: first.latencyMs + second.latencyMs,
  };
}
