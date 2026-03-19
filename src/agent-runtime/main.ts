#!/usr/bin/env node
/**
 * Agent Runtime — Main Entry Point
 *
 * Instantiates all subsystems with default implementations and starts the
 * agent loop with a stdio-based chat adapter.
 *
 * Usage:
 *   npx tsx src/agent-runtime/main.ts
 *   # or after building:
 *   node dist/agent-runtime/main.js
 *
 * The agent reads lines from stdin, processes them through the full 8-phase
 * conscious pipeline (perceive → recall → appraise → deliberate → act →
 * monitor → consolidate → yield), and writes responses to stdout.
 *
 * Press Ctrl+C to gracefully shut down.
 */

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
  DefaultMemoryStore,
  DefaultEmotionSystem,
  DefaultDriveSystem,
} from './default-subsystems.js';
import type { AgentConfig } from './types.js';

// ── Configuration ────────────────────────────────────────────

const config: AgentConfig = {
  agentId: process.env['AGENT_ID'] ?? 'agent-0',
  sentinelCadence: parseInt(process.env['SENTINEL_CADENCE'] ?? '10', 10),
  checkpointIntervalMs: parseInt(process.env['CHECKPOINT_INTERVAL_MS'] ?? '60000', 10),
  tickBudgetMs: parseInt(process.env['TICK_BUDGET_MS'] ?? '5000', 10),
  warmStart: process.env['WARM_START'] === 'true',
};

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.error('╔══════════════════════════════════════════════════╗');
  console.error('║   Conscious Agent Runtime — Industrial Era 0.3   ║');
  console.error('║   ISMT-compliant conscious processing pipeline   ║');
  console.error('╚══════════════════════════════════════════════════╝');
  console.error('');

  const adapter = new ChatAdapter({ mode: 'stdio', adapterId: 'chat-stdio' });

  const deps = {
    core: new DefaultConsciousCore(),
    perception: new DefaultPerceptionPipeline(),
    actionPipeline: new DefaultActionPipeline(),
    monitor: new DefaultExperienceMonitor(),
    sentinel: new DefaultStabilitySentinel(),
    identityManager: new DefaultIdentityContinuityManager(),
    valueKernel: new DefaultValueKernel(),
    ethicalEngine: new DefaultEthicalDeliberationEngine(),
    memory: new DefaultMemoryStore(),
    emotionSystem: new DefaultEmotionSystem(),
    driveSystem: new DefaultDriveSystem(),
    adapter,
  };

  const { loop, bootMode } = await startAgent(deps, config);

  console.error(`[main] Boot mode: ${bootMode}`);
  console.error('[main] Type a message and press Enter to interact. Ctrl+C to quit.');
  console.error('');

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async (signal: string) => {
    console.info(`\n[main] Received ${signal}, shutting down...`);
    try {
      const termination = await loop.stop(signal);
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

main().catch((err) => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
