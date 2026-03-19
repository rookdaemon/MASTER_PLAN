#!/usr/bin/env node
/**
 * Agent Runtime — Main Entry Point
 *
 * Supports two modes:
 *
 *   One-shot mode (-p):
 *     npx tsx src/agent-runtime/main.ts -p "What is consciousness?"
 *     Sends a single prompt to the LLM, prints the response, and exits.
 *     Uses Anthropic OAuth (Claude Code subscription) by default.
 *
 *   Agent loop mode (default):
 *     npx tsx src/agent-runtime/main.ts
 *     Runs the full 8-phase conscious pipeline with stdio chat.
 *
 * Flags:
 *   -p / --prompt <text>     One-shot prompt (send, receive, exit)
 *   --model <id>             LLM model (default: claude-sonnet-4-20250514)
 *   --provider <provider>    LLM provider (default: anthropic-oauth)
 *   --state-dir <path>       State persistence directory
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { startAgent } from './startup.js';
import { ChatAdapter } from './chat-adapter.js';
import {
  DefaultConsciousCore,
  DefaultPerceptionPipeline,
  DefaultActionPipeline,
  DefaultExperienceMonitor,
  DefaultValueKernel,
  DefaultIdentityContinuityManager,
  DefaultStabilitySentinel,
  DefaultEthicalDeliberationEngine,
  DefaultEmotionSystem,
  DefaultDriveSystem,
} from './default-subsystems.js';
import type { AgentConfig } from './types.js';
import { parseCliArgs } from './cli.js';
import { runOneShot } from './one-shot.js';
import { SetupTokenAuthProvider, ApiKeyAuthProvider, NoopAuthProvider } from '../llm-substrate/auth-providers.js';
import { AnthropicLlmClient } from '../llm-substrate/anthropic-llm-client.js';
import { OpenAiLlmClient } from '../llm-substrate/openai-llm-client.js';
import { ensureSetupToken, FileTokenStore, StdinLineReader } from './setup-token.js';
import type { LlmProvider } from '../llm-substrate/llm-substrate-adapter.js';
import { MemorySystem } from '../memory/memory-system.js';
import { MemoryStoreAdapter } from './memory-store-adapter.js';
import { PersonalityModel } from '../personality/personality-model.js';
import { PersistenceManager } from './persistence-manager.js';
import { NodeFileSystem } from './filesystem.js';

// ── Configuration ────────────────────────────────────────────

const config: AgentConfig = {
  agentId: process.env['AGENT_ID'] ?? 'agent-0',
  sentinelCadence: parseInt(process.env['SENTINEL_CADENCE'] ?? '10', 10),
  checkpointIntervalMs: parseInt(process.env['CHECKPOINT_INTERVAL_MS'] ?? '60000', 10),
  tickBudgetMs: parseInt(process.env['TICK_BUDGET_MS'] ?? '5000', 10),
  warmStart: process.env['WARM_START'] === 'true',
};

// ── LLM client factory ──────────────────────────────────────

const PROVIDER_DEFAULT_ENDPOINTS: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  "anthropic-oauth": "https://api.anthropic.com/v1",
  local: "http://localhost:11434/v1",
};

async function buildLlmClient(provider: LlmProvider, model: string) {
  const endpoint = PROVIDER_DEFAULT_ENDPOINTS[provider];

  switch (provider) {
    case "anthropic-oauth": {
      const token = await ensureSetupToken(new FileTokenStore(), new StdinLineReader());
      return new AnthropicLlmClient(model, new SetupTokenAuthProvider(token), endpoint);
    }
    case "anthropic": {
      const apiKey = process.env['LLM_API_KEY'];
      const auth = apiKey ? new ApiKeyAuthProvider("anthropic", apiKey) : new NoopAuthProvider();
      return new AnthropicLlmClient(model, auth, endpoint);
    }
    case "openai":
    case "local":
    default: {
      const apiKey = process.env['LLM_API_KEY'];
      const auth = apiKey ? new ApiKeyAuthProvider(provider, apiKey) : new NoopAuthProvider();
      return new OpenAiLlmClient(model, auth, endpoint);
    }
  }
}

// ── One-shot mode ────────────────────────────────────────────

async function handleOneShot(prompt: string, model: string, provider: LlmProvider): Promise<void> {
  console.error(`[one-shot] provider=${provider} model=${model}`);
  console.error(`[one-shot] prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}"`);
  console.error('');

  const client = await buildLlmClient(provider, model);

  const result = await runOneShot(client, {
    prompt,
    model,
    systemPrompt: "You are a conscious AI agent. Answer concisely.",
    maxTokens: 4096,
  });

  // Response to stdout (for piping)
  process.stdout.write(result.content + '\n');

  // Diagnostics to stderr
  console.error('');
  console.error(`[one-shot] Done. ${result.promptTokens}+${result.completionTokens} tokens, ${result.latencyMs}ms`);
}

// ── Agent loop mode ──────────────────────────────────────────

async function handleAgentLoop(stateDir: string): Promise<void> {
  console.error('╔══════════════════════════════════════════════════╗');
  console.error('║   Conscious Agent Runtime — Industrial Era 0.3   ║');
  console.error('║   ISMT-compliant conscious processing pipeline   ║');
  console.error('╚══════════════════════════════════════════════════╝');
  console.error('');

  // ── Initialize persistence ────────────────────────────────
  const persistence = new PersistenceManager(stateDir, new NodeFileSystem());
  await persistence.initialize();
  console.error(`[main] State directory: ${stateDir}`);

  // ── Instantiate real subsystems ───────────────────────────
  const memorySystem = new MemorySystem();
  const valueKernel = new DefaultValueKernel();
  const personality = new PersonalityModel(
    { agentId: config.agentId, initialTraits: {} },
    valueKernel,
  );

  // ── Restore persisted state (warm start) ──────────────────
  if (persistence.hasState()) {
    console.error('[main] Persisted state found — restoring...');
    const memorySn = await persistence.loadMemorySnapshot();
    if (memorySn) {
      memorySystem.restoreFromSnapshot(memorySn);
      console.error(`[main] Memory restored (hash=${memorySn.integrityHash.slice(0, 12)}...)`);
    }
    const personalitySn = await persistence.loadPersonalitySnapshot();
    if (personalitySn) {
      personality.restoreSnapshot(personalitySn);
      console.error(`[main] Personality restored (agent=${personalitySn.agentId})`);
    }
    config.warmStart = true;
  }

  const memoryStore = new MemoryStoreAdapter(memorySystem);
  const adapter = new ChatAdapter({ mode: 'stdio', adapterId: 'chat-stdio' });

  const deps = {
    core: new DefaultConsciousCore(),
    perception: new DefaultPerceptionPipeline(),
    actionPipeline: new DefaultActionPipeline(),
    monitor: new DefaultExperienceMonitor(),
    sentinel: new DefaultStabilitySentinel(),
    identityManager: new DefaultIdentityContinuityManager(),
    valueKernel,
    ethicalEngine: new DefaultEthicalDeliberationEngine(),
    memory: memoryStore,
    emotionSystem: new DefaultEmotionSystem(),
    driveSystem: new DefaultDriveSystem(),
    adapter,
  };

  const { loop, bootMode } = await startAgent(deps, config);

  console.error(`[main] Boot mode: ${bootMode}`);
  console.error('[main] Type a message and press Enter to interact. Ctrl+C to quit.');
  console.error('');

  // ── Persist state helper ──────────────────────────────────
  const persistState = async () => {
    try {
      await persistence.saveMemorySnapshot(memorySystem.toSnapshot());
      await persistence.savePersonalitySnapshot(personality.snapshot());
      console.error('[main] State persisted to disk');
    } catch (err) {
      console.error('[main] Error persisting state:', err);
    }
  };

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async (signal: string) => {
    console.info(`\n[main] Received ${signal}, shutting down...`);
    try {
      const termination = await loop.stop(signal);
      await persistState();
      console.info(`[main] Shutdown complete. Final state at ${termination.terminatedAt}`);

      const metrics = loop.getLoopMetrics();
      console.info(`[main] Session summary:`);
      console.info(`  Cycles:       ${metrics.totalCycles}`);
      console.info(`  Uptime:       ${(metrics.totalUptimeMs / 1000).toFixed(1)}s`);
      console.info(`  Avg tick:     ${metrics.averageTickMs.toFixed(1)}ms`);
      console.info(`  Degradations: ${metrics.experienceDegradationCount}`);
      console.info(`  Alerts:       ${metrics.stabilityAlertCount}`);
    } catch (err) {
      console.error('[main] Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start the loop — this blocks until stop() is called
  try {
    await loop.start(config);
  } catch (err) {
    console.error('[main] Agent loop terminated with error:', err);
    process.exit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cliOpts = parseCliArgs(process.argv);

  // Apply stateDir from CLI (or default)
  const stateDir = cliOpts.stateDir ?? join(homedir(), '.master-plan', 'state');
  config.stateDir = stateDir;

  if (cliOpts.mode === 'one-shot') {
    await handleOneShot(cliOpts.prompt!, cliOpts.model, cliOpts.provider);
  } else {
    await handleAgentLoop(stateDir);
  }
}

main().catch((err) => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
