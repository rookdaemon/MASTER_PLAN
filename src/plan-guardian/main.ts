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
import { PriorityModelSelector } from './model-selector.js';
import { GuardianDebugLog } from './debug-log.js';
import { NodeClaudeInvoker } from './claude-invoker.js';
import { NodeWorktreePool } from './worktree-pool.js';
import { GuardianDashboard, type PlanStats } from './dashboard.js';
import type { IFileSystem } from '../agent-runtime/filesystem.js';
import type { PlanStatus } from './interfaces.js';
import type { IInferenceProvider, InferenceResult } from '../llm-substrate/inference-provider.js';

/** Tally plan cards by their H1 status tag (flat plan dir). */
async function scanPlanStats(fs: IFileSystem, planDir: string): Promise<PlanStats> {
  const byStatus: Record<PlanStatus, number> = { PLAN: 0, ARCHITECT: 0, IMPLEMENT: 0, REVIEW: 0, DONE: 0 };
  let total = 0;
  for (const name of await fs.listFiles(planDir)) {
    if (!name.endsWith('.md')) continue;
    total += 1;
    try {
      const content = await fs.readFile(`${planDir}/${name}`, 'utf-8');
      const m = content.match(/^#\s+.*\[(PLAN|ARCHITECT|IMPLEMENT|REVIEW|DONE)\]/m);
      if (m) byStatus[m[1] as PlanStatus] += 1;
    } catch {
      // ignore unreadable files
    }
  }
  return { total, byStatus };
}

/** Stub provider for agentic mode — the CLI is the brain, so this is never called. */
const AGENTIC_STUB_PROVIDER: IInferenceProvider = {
  async probe() {
    return { reachable: true, latencyMs: 0 };
  },
  async infer(): Promise<InferenceResult> {
    throw new Error('agentic mode does not use an inference provider');
  },
};

async function main() {
  const opts = parseCli(process.argv);
  const repoRoot = resolve('.');

  const debugLog = new GuardianDebugLog(resolve('.guardian', 'guardian-debug.log'));
  debugLog.rotateOnStart();

  const fs = new NodeFileSystem();
  const git = new NodeGitOperations(repoRoot);
  const clock = { now: () => new Date().toISOString() };
  const sleeper = {
    sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
  };

  let config: GuardianConfig;

  let agenticPool: NodeWorktreePool | undefined;

  if (opts.executionMode === 'agentic') {
    // ── Agentic mode: the Claude Code CLI is the brain (Ralph-Wiggum). ──
    const rootPlanFile = `${opts.planDir}/root.md`;
    // Each concurrent agent runs in its own git worktree so parallel Claude
    // processes can't collide; results are applied to main serially.
    const concurrency = Math.max(1, opts.concurrency);
    agenticPool = new NodeWorktreePool(repoRoot, resolve('.guardian', 'wt'), concurrency);
    config = {
      planDir: opts.planDir,
      repoRoot,
      concurrency,
      requestedConcurrency: opts.concurrency,
      maxIterations: opts.maxIterations,
      maxDepth: opts.maxDepth,
      dryRun: opts.dryRun,
      cycleThreshold: opts.cycleThreshold,
      strictIntegrity: opts.strictIntegrity,
      maxNewFilesPerAction: opts.maxNewFilesPerAction,
      maxTokensPerCall: 0,
      quarantineBranch: opts.quarantineBranch,
      provider: AGENTIC_STUB_PROVIDER,
      fs,
      git,
      clock,
      sleeper,
      executionMode: 'agentic',
      claudeInvoker: new NodeClaudeInvoker(),
      rootPlanFile,
      claudeTimeoutMs: opts.claudeTimeoutMs,
      modelBounds: {
        modelFloor: opts.modelFloor,
        modelCeiling: opts.modelCeiling,
        effortCeiling: opts.effortCeiling,
      },
      worktreePool: agenticPool,
      proceduralRollup: opts.proceduralRollup,
    };

    console.log(`[guardian] Starting Plan Guardian (AGENTIC — Claude Code CLI)`);
    console.log(`[guardian] Plan dir: ${opts.planDir} | root: ${rootPlanFile}`);
    console.log(`[guardian] Concurrency: ${concurrency} (parallel, ${concurrency} worktree${concurrency === 1 ? '' : 's'}) | Max iterations: ${opts.maxIterations} | Dry run: ${opts.dryRun} | Claude timeout: ${opts.claudeTimeoutMs}ms`);
    console.log(`[guardian] Model policy: floor=${opts.modelFloor ?? 'haiku'} ceiling=${opts.modelCeiling ?? 'opus'} effort-ceiling=${opts.effortCeiling ?? 'max'}`);
    console.log(`[guardian] Strict integrity: ${opts.strictIntegrity} | Max new files/action: ${opts.maxNewFilesPerAction} | Quarantine branch: ${opts.quarantineBranch ?? 'none'}`);

    debugLog.log('startup', 'guardian started (agentic)', {
      executionMode: 'agentic',
      planDir: opts.planDir,
      rootPlanFile,
      concurrency,
      maxIterations: opts.maxIterations,
      claudeTimeoutMs: opts.claudeTimeoutMs,
      strictIntegrity: opts.strictIntegrity,
      quarantineBranch: opts.quarantineBranch ?? null,
      dryRun: opts.dryRun,
    });
  } else {
    // ── Provider mode: inference API + apply parsed file blocks. ──
    const provider = buildProvider(opts.provider, opts.models[0]);
    const metadata = await fetchModelMetadata(opts.provider, opts.models[0]);

    // opts.models is already priority-ordered (from --model flags or the CLI defaults).
    const modelSelector =
      opts.provider === 'openrouter' && opts.models.length > 1
        ? new PriorityModelSelector(
            opts.models.map(modelId => ({
              modelId,
              provider: buildProvider(opts.provider, modelId),
            })),
          )
        : undefined;
    const budget = deriveExecutionBudget(opts.concurrency, metadata);

    config = {
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
      modelSelector,
      fs,
      git,
      clock,
      sleeper,
    };

    console.log(`[guardian] Starting Plan Guardian`);
    console.log(`[guardian] Provider: ${opts.provider}/${opts.models[0]}`);
    if (modelSelector) {
      console.log(`[guardian] Model priority: ${modelSelector.modelIds.join(' → ')}`);
    }
    console.log(`[guardian] Concurrency: ${config.concurrency} (requested ${config.requestedConcurrency}) | Max iterations: ${opts.maxIterations} | Dry run: ${opts.dryRun}`);
    console.log(`[guardian] Strict integrity: ${opts.strictIntegrity} | Max new files/action: ${opts.maxNewFilesPerAction} | Quarantine branch: ${opts.quarantineBranch ?? 'none'}`);
    console.log(`[guardian] Max tokens/call: ${config.maxTokensPerCall}`);

    debugLog.log('startup', 'guardian started', {
      provider: opts.provider,
      models: opts.models,
      requestedConcurrency: config.requestedConcurrency,
      effectiveConcurrency: config.concurrency,
      maxTokensPerCall: config.maxTokensPerCall,
      strictIntegrity: config.strictIntegrity,
      quarantineBranch: config.quarantineBranch ?? null,
      metadata,
      budgetNotes: budget.notes,
    });
  }

  // Live TUI for interactive agentic runs; plain logs when piped / in provider mode.
  const useTui = !!process.stdout.isTTY && opts.executionMode === 'agentic';
  const dashboard = useTui
    ? new GuardianDashboard(
        {
          mode: opts.executionMode,
          concurrency: config.concurrency,
          modelPolicy: `floor=${opts.modelFloor ?? 'haiku'} ceiling=${opts.modelCeiling ?? 'opus'} eff=${opts.effortCeiling ?? 'max'}`,
        },
        { write: s => process.stdout.write(s), now: () => Date.now() },
      )
    : null;

  let statsTimer: ReturnType<typeof setInterval> | null = null;
  if (dashboard) {
    dashboard.setStats(await scanPlanStats(fs, opts.planDir));
    statsTimer = setInterval(() => {
      scanPlanStats(fs, opts.planDir).then(s => dashboard.setStats(s)).catch(() => {});
    }, 3000);
    dashboard.start();
  }

  const handle = runScheduler(config, {
    onEpochStart(epoch, batchSize) {
      if (dashboard) dashboard.epochStart(epoch);
      else console.log(`[guardian] Epoch ${epoch}: dispatching ${batchSize} task(s)`);
      debugLog.log('epoch', 'epoch start', { epoch, batchSize });
    },
    onWorkerStart(task, actionType, model) {
      if (dashboard) dashboard.workerStart(task, actionType, model);
      else console.log(`[guardian]   → starting ${actionType}: ${task}${model ? ` [${model}]` : ''}`);
      debugLog.log('worker', 'worker start', { task, actionType, model });
    },
    onWorkerComplete(result) {
      if (dashboard) dashboard.workerComplete(result.action.targetPath, result.action.summary, result.costUsd);
      else console.log(`[guardian]   ✓ ${result.action.type}: ${result.action.summary} (${result.tokensUsed.prompt + result.tokensUsed.completion} tokens, ${result.latencyMs}ms)`);
      debugLog.log('worker', 'worker complete', {
        actionType: result.action.type,
        targetPath: result.action.targetPath,
        summary: result.action.summary,
        promptTokens: result.tokensUsed.prompt,
        completionTokens: result.tokensUsed.completion,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      });
    },
    onWorkerError(task, error) {
      const rateLimited = /rate limit/i.test(error.message);
      if (dashboard) dashboard.workerError(task, error.message, rateLimited);
      else console.error(`[guardian]   ✗ ${task}: ${error.message}`);
      debugLog.log('worker', 'worker error', { task, error: error.message });
    },
    onCommit(hash, message) {
      if (dashboard) dashboard.commit(message);
      else console.log(`[guardian]   → ${hash} ${message}`);
      debugLog.log('commit', 'commit', { hash, message });
    },
    onEpochEnd(result) {
      if (!dashboard) console.log(`[guardian] Epoch ${result.epoch} done: ${result.completed} completed, ${result.failed} failed`);
      debugLog.log('epoch', 'epoch end', {
        epoch: result.epoch,
        dispatched: result.dispatched,
        completed: result.completed,
        failed: result.failed,
        commits: result.commits,
        totalTokens: result.totalTokens,
      });
    },
    onRateLimitBackoff(delayMs, failures, reasons) {
      const seconds = Math.ceil(delayMs / 1000);
      const reasonText = reasons.length > 0 ? ` | reason: ${reasons[0]}` : '';
      const untilIso = new Date(Date.now() + delayMs).toISOString();
      if (!dashboard) console.log(`[guardian] Rate-limit backoff: waiting ${seconds}s (until ${untilIso}) after ${failures} rate-limit failure(s)${reasonText}`);
      debugLog.log('backoff', 'rate-limit backoff', { delayMs, resumeAtIso: untilIso, failures, reasons });
    },
    onSoftStop() {
      if (!dashboard) console.log('[guardian] Soft stop requested — finishing current epoch then exiting...');
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

  // Tear down the dashboard + parallel worktrees.
  if (statsTimer) clearInterval(statsTimer);
  if (dashboard) dashboard.stop();
  if (agenticPool) {
    await agenticPool.cleanup().catch(() => {});
  }

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
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  debugLog.log('fatal', 'guardian fatal error', { error: err instanceof Error ? err.message : String(err), stack });
  console.error(`[guardian] Fatal: ${stack}`);
  process.exit(1);
});
