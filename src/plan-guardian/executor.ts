/**
 * Execution Worker — Dispatches promoted leaf tasks to a 7B model.
 *
 * The Execution Spec in the plan file contains everything the 7B needs.
 * The executor extracts it, sends it to the exec provider, and parses
 * the resulting artifact blocks.
 *
 * Domain: Plan Guardian
 */

import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';
import type { PlanFile, WorkerResult } from './interfaces.js';
import { buildSystemPrompt } from './prompts.js';
import { parseActionOutput } from './actions.js';

export async function runExecutionWorker(
  task: PlanFile,
  provider: IInferenceProvider,
  now: string,
  maxTokens: number = 4096,
): Promise<WorkerResult> {
  const systemPrompt = buildSystemPrompt('execute');
  const userMessage = buildExecutionMessage(task);

  const result = await provider.infer(
    systemPrompt,
    [{ role: 'user', content: userMessage }],
    [],
    maxTokens,
  );

  const text = result.text ?? '';
  const action = parseActionOutput(text, 'execute', task.path, now);

  return {
    action,
    tokensUsed: { prompt: result.promptTokens, completion: result.completionTokens },
    latencyMs: result.latencyMs,
  };
}

function buildExecutionMessage(task: PlanFile): string {
  // Extract the Execution Spec section if present, otherwise send the full body
  const execSpecMatch = task.body.match(/## Execution Spec\n([\s\S]*?)(?=\n## |\n*$)/);
  const spec = execSpecMatch ? execSpecMatch[1].trim() : task.body;

  return `## Task: ${task.numericId} ${task.title}

Path: ${task.path}

## Execution Spec

${spec}

Produce the artifact(s) as \`\`\`artifact:path/to/file\`\`\` blocks, then update the plan file status to [REVIEW] as a \`\`\`plan-file:${task.path}\`\`\` block with a revision history entry.`;
}
