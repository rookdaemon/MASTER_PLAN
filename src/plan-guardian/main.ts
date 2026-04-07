#!/usr/bin/env node
/**
 * Plan Guardian — Entry Point
 *
 * Single-provider architecture: the system is designed so that even a 7B model
 * can handle every action (decompose, research, refine, execute, etc.).
 * Quality comes from prompt engineering and context assembly, not model size.
 *
 * Usage:
 *   npx tsx src/plan-guardian/main.ts                           # openrouter gpt-oss-120b:free (default)
 *   npx tsx src/plan-guardian/main.ts --provider anthropic --model claude-sonnet-4-20250514
 *   npx tsx src/plan-guardian/main.ts --provider openrouter --model google/gemma-3-27b-it
 *   npx tsx src/plan-guardian/main.ts --concurrency 30 --max-iterations 10
 *   npx tsx src/plan-guardian/main.ts --dry-run
 *
 * Domain: Plan Guardian
 */

import { resolve } from 'node:path';
import { parseCli } from './cli.js';
import { runScheduler } from './scheduler.js';
import { NodeFileSystem } from '../agent-runtime/filesystem.js';
import { NodeGitOperations } from './git-state.js';
import type { GuardianConfig } from './interfaces.js';
import { buildProvider } from './provider-factory.js';

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
