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
const MAX_REPAIR_ATTEMPTS = 3;

const REPAIR_REMINDER = [
  'Regenerate output with the exact same action type and valid references only.',
  'For every plan-file block, the H1 numeric ID must exactly match the numeric prefix in the file path.',
  'Example: `# 0.7.3.2 Child [PLAN]` must use `plan/0.7.3.2-child.md`, not `plan/0.7.3-2-child.md` or `plan/0.7.3-2-slug.md`.',
].join('\n');

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

  let prompt = userMessage;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalLatencyMs = 0;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    const response = await provider.infer(
      systemPrompt,
      [{ role: 'user', content: prompt }],
      [],
      maxTokens,
    );

    totalPromptTokens += response.promptTokens;
    totalCompletionTokens += response.completionTokens;
    totalLatencyMs += response.latencyMs;

    const text = response.text ?? '';
    const violations = validateText?.(text) ?? [];

    if (violations.length === 0) {
      let action;
      try {
        action = parseActionOutput(text, actionType, task.path, now);
      } catch (parseErr) {
        const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new Error(`Failed to parse attempt ${attempt} output: ${parseMsg}`);
      }

      return {
        action,
        tokensUsed: { prompt: totalPromptTokens, completion: totalCompletionTokens },
        latencyMs: totalLatencyMs,
      };
    }

    if (attempt >= MAX_REPAIR_ATTEMPTS) {
      throw new Error(`Integrity retry failed after ${MAX_REPAIR_ATTEMPTS} attempts: ${violations.join('; ')}`);
    }

    prompt = buildRepairPrompt(userMessage, attempt + 1, text, violations);
  }

  throw new Error('Unreachable: repair loop exited unexpectedly');
}

function buildRepairPrompt(
  originalUserMessage: string,
  attempt: number,
  previousOutput: string,
  violations: string[],
): string {
  const excerpt = previousOutput.length > 1200
    ? `${previousOutput.slice(0, 1200)}\n...[truncated]`
    : previousOutput;

  return `${originalUserMessage}\n\nREPAIR REQUIRED (attempt ${attempt})\nYour last output violated integrity constraints:\n${violations.map(v => `- ${v}`).join('\n')}\n\nPrevious output excerpt:\n${excerpt}\n\n${REPAIR_REMINDER}`;
}
