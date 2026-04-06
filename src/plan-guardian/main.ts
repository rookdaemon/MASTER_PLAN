#!/usr/bin/env node
/**
 * Plan Guardian — Entry Point
 *
 * Single-provider architecture: the system is designed so that even a 7B model
 * can handle every action (decompose, research, refine, execute, etc.).
 * Quality comes from prompt engineering and context assembly, not model size.
 *
 * Usage:
 *   npx tsx src/plan-guardian/main.ts                           # local gemma4:e4b (default)
 *   npx tsx src/plan-guardian/main.ts --provider anthropic --model claude-sonnet-4-20250514
 *   npx tsx src/plan-guardian/main.ts --concurrency 30 --max-iterations 10
 *   npx tsx src/plan-guardian/main.ts --dry-run
 *
 * Domain: Plan Guardian
 */

import { resolve } from 'node:path';
import { parseCli, type LlmProvider } from './cli.js';
import { runScheduler } from './scheduler.js';
import { NodeFileSystem } from '../agent-runtime/filesystem.js';
import { NodeGitOperations } from './git-state.js';
import { AnthropicInferenceProvider } from '../llm-substrate/anthropic-inference-provider.js';
import { OllamaInferenceProvider } from '../llm-substrate/ollama-inference-provider.js';
import { ApiKeyAuthProvider, NoopAuthProvider } from '../llm-substrate/auth-providers.js';
import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';
import type { GuardianConfig } from './interfaces.js';

const PROVIDER_ENDPOINTS: Record<LlmProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  local: process.env['LLM_ENDPOINT'] ?? 'http://localhost:11434/v1',
};

function buildProvider(providerType: LlmProvider, model: string): IInferenceProvider {
  const endpoint = PROVIDER_ENDPOINTS[providerType];
  const thinkingBudget = parseInt(process.env['THINKING_BUDGET_TOKENS'] ?? '0', 10);

  switch (providerType) {
    case 'anthropic': {
      const apiKey = process.env['LLM_API_KEY'];
      if (!apiKey) throw new Error('LLM_API_KEY required for Anthropic provider');
      return new AnthropicInferenceProvider(model, new ApiKeyAuthProvider('anthropic', apiKey), endpoint, thinkingBudget);
    }
    case 'openai':
    case 'local':
    default: {
      const apiKey = process.env['LLM_API_KEY'];
      const auth = apiKey ? new ApiKeyAuthProvider(providerType, apiKey) : new NoopAuthProvider();
      return new OllamaInferenceProvider(model, auth, endpoint);
    }
  }
}

async function main() {
  const opts = parseCli(process.argv);
  const repoRoot = resolve('.');

  const provider = buildProvider(opts.provider, opts.model);

  const config: GuardianConfig = {
    planDir: opts.planDir,
    repoRoot,
    concurrency: opts.concurrency,
    maxIterations: opts.maxIterations,
    maxDepth: opts.maxDepth,
    dryRun: opts.dryRun,
    cycleThreshold: opts.cycleThreshold,
    strictIntegrity: opts.strictIntegrity,
    maxNewFilesPerAction: opts.maxNewFilesPerAction,
    quarantineBranch: opts.quarantineBranch,
    provider,
    fs: new NodeFileSystem(),
    git: new NodeGitOperations(repoRoot),
    clock: { now: () => new Date().toISOString() },
  };

  console.log(`[guardian] Starting Plan Guardian`);
  console.log(`[guardian] Provider: ${opts.provider}/${opts.model}`);
  console.log(`[guardian] Concurrency: ${opts.concurrency} | Max iterations: ${opts.maxIterations} | Dry run: ${opts.dryRun}`);
  console.log(`[guardian] Strict integrity: ${opts.strictIntegrity} | Max new files/action: ${opts.maxNewFilesPerAction} | Quarantine branch: ${opts.quarantineBranch ?? 'none'}`);

  const results = await runScheduler(config, {
    onEpochStart(epoch, batchSize) {
      console.log(`[guardian] Epoch ${epoch}: dispatching ${batchSize} task(s)`);
    },
    onWorkerComplete(result) {
      console.log(`[guardian]   ✓ ${result.action.type}: ${result.action.summary} (${result.tokensUsed.prompt + result.tokensUsed.completion} tokens, ${result.latencyMs}ms)`);
    },
    onWorkerError(task, error) {
      console.error(`[guardian]   ✗ ${task}: ${error.message}`);
    },
    onCommit(hash, message) {
      console.log(`[guardian]   → ${hash} ${message}`);
    },
    onEpochEnd(result) {
      console.log(`[guardian] Epoch ${result.epoch} done: ${result.completed} completed, ${result.failed} failed`);
    },
  });

  const totalTokens = results.reduce((acc, r) => ({
    prompt: acc.prompt + r.totalTokens.prompt,
    completion: acc.completion + r.totalTokens.completion,
  }), { prompt: 0, completion: 0 });

  console.log(`[guardian] Done. ${results.length} epoch(s), ${totalTokens.prompt + totalTokens.completion} total tokens.`);
}

main().catch(err => {
  console.error(`[guardian] Fatal: ${err.message}`);
  process.exit(1);
});
