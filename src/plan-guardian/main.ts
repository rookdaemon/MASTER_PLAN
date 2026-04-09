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
import { fetchModelMetadata, deriveExecutionBudget } from './model-metadata.js';
import { GuardianDebugLog } from './debug-log.js';

async function main() {
  const opts = parseCli(process.argv);
  const repoRoot = resolve('.');

  const debugLog = new GuardianDebugLog(resolve('.guardian', 'guardian-debug.log'));
  debugLog.rotateOnStart();

  const provider = buildProvider(opts.provider, opts.model);
  const metadata = await fetchModelMetadata(opts.provider, opts.model);
  const budget = deriveExecutionBudget(opts.concurrency, metadata);

  const config: GuardianConfig = {
    planDir: opts.planDir,
    repoRoot,
    concurrency: budget.concurrency,
    requestedConcurrency: opts.concurrency,
    maxIterations: opts.maxIterations,
    maxDepth: opts.maxDepth,
    dryRun: opts.dryRun,
    cycleThreshold: opts.cycleThreshold,
    strictIntegrity: opts.strictIntegrity,
    maxNewFilesPerAction: opts.maxNewFilesPerAction,
    maxTokensPerCall: budget.maxTokensPerCall,
    quarantineBranch: opts.quarantineBranch,
    modelMetadata: metadata,
    provider,
    fs: new NodeFileSystem(),
    git: new NodeGitOperations(repoRoot),
    clock: { now: () => new Date().toISOString() },
  };

  console.log(`[guardian] Starting Plan Guardian`);
  console.log(`[guardian] Provider: ${opts.provider}/${opts.model}`);
  console.log(`[guardian] Concurrency: ${config.concurrency} (requested ${config.requestedConcurrency}) | Max iterations: ${opts.maxIterations} | Dry run: ${opts.dryRun}`);
  console.log(`[guardian] Strict integrity: ${opts.strictIntegrity} | Max new files/action: ${opts.maxNewFilesPerAction} | Quarantine branch: ${opts.quarantineBranch ?? 'none'}`);
  console.log(`[guardian] Max tokens/call: ${config.maxTokensPerCall}`);

  debugLog.log('startup', 'guardian started', {
    provider: opts.provider,
    model: opts.model,
    requestedConcurrency: config.requestedConcurrency,
    effectiveConcurrency: config.concurrency,
    maxTokensPerCall: config.maxTokensPerCall,
    strictIntegrity: config.strictIntegrity,
    quarantineBranch: config.quarantineBranch ?? null,
    metadata,
    budgetNotes: budget.notes,
  });

  const handle = runScheduler(config, {
    onEpochStart(epoch, batchSize) {
      console.log(`[guardian] Epoch ${epoch}: dispatching ${batchSize} task(s)`);
      debugLog.log('epoch', 'epoch start', { epoch, batchSize });
    },
    onWorkerStart(task, actionType) {
      console.log(`[guardian]   → starting ${actionType}: ${task}`);
      debugLog.log('worker', 'worker start', { task, actionType });
    },
    onWorkerComplete(result) {
      console.log(`[guardian]   ✓ ${result.action.type}: ${result.action.summary} (${result.tokensUsed.prompt + result.tokensUsed.completion} tokens, ${result.latencyMs}ms)`);
      debugLog.log('worker', 'worker complete', {
        actionType: result.action.type,
        targetPath: result.action.targetPath,
        summary: result.action.summary,
        promptTokens: result.tokensUsed.prompt,
        completionTokens: result.tokensUsed.completion,
        latencyMs: result.latencyMs,
      });
    },
    onWorkerError(task, error) {
      console.error(`[guardian]   ✗ ${task}: ${error.message}`);
      debugLog.log('worker', 'worker error', { task, error: error.message });
    },
    onCommit(hash, message) {
      console.log(`[guardian]   → ${hash} ${message}`);
      debugLog.log('commit', 'commit', { hash, message });
    },
    onEpochEnd(result) {
      console.log(`[guardian] Epoch ${result.epoch} done: ${result.completed} completed, ${result.failed} failed`);
      debugLog.log('epoch', 'epoch end', {
        epoch: result.epoch,
        dispatched: result.dispatched,
        completed: result.completed,
        failed: result.failed,
        commits: result.commits,
        totalTokens: result.totalTokens,
      });
    },
    onSoftStop() {
      console.log('[guardian] Soft stop requested — finishing current epoch then exiting...');
      debugLog.log('shutdown', 'soft stop requested', {});
    },
  });

  // ESC key triggers a clean exit after the current epoch finishes.
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk: Buffer) => {
      if (chunk[0] === 0x1b) { // ESC
        handle.stop();
      }
    });
  }

  const results = await handle.done;

  // Stop listening for keystrokes once the scheduler exits.
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  const totalTokens = results.reduce((acc, r) => ({
    prompt: acc.prompt + r.totalTokens.prompt,
    completion: acc.completion + r.totalTokens.completion,
  }), { prompt: 0, completion: 0 });

  console.log(`[guardian] Done. ${results.length} epoch(s), ${totalTokens.prompt + totalTokens.completion} total tokens.`);
  debugLog.log('shutdown', 'guardian completed', {
    epochs: results.length,
    totalPromptTokens: totalTokens.prompt,
    totalCompletionTokens: totalTokens.completion,
    totalTokens: totalTokens.prompt + totalTokens.completion,
  });
}

main().catch(err => {
  const debugLog = new GuardianDebugLog(resolve('.guardian', 'guardian-debug.log'));
  debugLog.log('fatal', 'guardian fatal error', { error: err instanceof Error ? err.message : String(err) });
  console.error(`[guardian] Fatal: ${err.message}`);
  process.exit(1);
});
