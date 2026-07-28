/**
 * CLI Argument Parser — Plan Guardian
 *
 * Pure function: argv → config values. No side effects.
 * Supports multiple --model flags to build a priority fallback list.
 *
 * Domain: Plan Guardian
 */

import type { LlmProvider } from '../llm-substrate/llm-substrate-adapter.js';
export type { LlmProvider };

export type ExecutionMode = 'provider' | 'agentic';
export type AgenticProvider = 'claude' | 'codex';

export type ModelTier = 'haiku' | 'sonnet' | 'opus';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const DEFAULT_CODEX_AGENTIC_MODEL = 'gpt-5.6-sol';

export interface CliOptions {
  planDir: string;
  /**
   * 'provider' (default) calls an inference API and applies parsed file blocks.
   * 'agentic' shells out to the Claude Code CLI, which edits files directly.
   */
  executionMode: ExecutionMode;
  /** Agentic CLI backend. Claude is the legacy/default behavior. */
  agenticProvider: AgenticProvider;
  /** Provider-specific model id for the agentic CLI. Codex defaults to gpt-5.6-sol. */
  agenticModel?: string;
  /** Per-invocation Claude CLI timeout in ms (agentic mode). */
  claudeTimeoutMs: number;
  /** Per-card model/effort policy bounds (agentic mode). */
  modelFloor?: ModelTier;
  modelCeiling?: ModelTier;
  effortCeiling?: EffortLevel;
  /** Use the cheap deterministic node roll-up instead of a model completion-review. */
  proceduralRollup: boolean;
  provider: LlmProvider;
  /** Priority-ordered model list; index 0 is most preferred. */
  models: string[];
  concurrency: number;
  maxIterations: number;
  maxDepth: number;
  dryRun: boolean;
  cycleThreshold: number;
  strictIntegrity: boolean;
  maxNewFilesPerAction: number;
  quarantineBranch?: string;
}

const DEFAULTS: CliOptions = {
  planDir: 'plan',
  executionMode: 'provider',
  agenticProvider: 'claude',
  agenticModel: undefined,
  claudeTimeoutMs: 5 * 60 * 1000,
  proceduralRollup: false,
  provider: 'openrouter',
  models: [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'qwen/qwen3-coder:free',
    'gpt-oss-120b:free',
  ],
  concurrency: 5,
  maxIterations: Infinity,
  maxDepth: 8,
  dryRun: false,
  cycleThreshold: 3,
  strictIntegrity: true,
  maxNewFilesPerAction: 5,
  quarantineBranch: undefined,
};

const VALID_PROVIDERS = new Set<string>(['anthropic', 'openai', 'openrouter', 'local']);
const VALID_AGENTIC_PROVIDERS = new Set<string>(['claude', 'codex']);

export function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = { ...DEFAULTS, models: [...DEFAULTS.models] };
  let modelsExplicit = false;
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => {
      if (i + 1 >= args.length) throw new Error(`Missing value for ${arg}`);
      return args[++i];
    };

    switch (arg) {
      case '--plan-dir':
        opts.planDir = next();
        break;
      case '--provider':
        opts.provider = validateProvider(next());
        break;
      case '--model':
        // First explicit --model clears the defaults; subsequent ones append in priority order.
        if (!modelsExplicit) { opts.models = []; modelsExplicit = true; }
        opts.models.push(next());
        break;
      case '--concurrency':
        opts.concurrency = parseInt(next(), 10);
        break;
      case '--max-iterations':
        opts.maxIterations = parseInt(next(), 10);
        break;
      case '--max-depth':
        opts.maxDepth = parseInt(next(), 10);
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--cycle-threshold':
        opts.cycleThreshold = parseInt(next(), 10);
        break;
      case '--strict-integrity': {
        const value = next().toLowerCase();
        if (value !== 'true' && value !== 'false') {
          throw new Error('--strict-integrity must be true or false');
        }
        opts.strictIntegrity = value === 'true';
        break;
      }
      case '--max-new-files':
        opts.maxNewFilesPerAction = parseInt(next(), 10);
        break;
      case '--quarantine-branch':
        opts.quarantineBranch = next();
        break;
      case '--agentic':
        opts.executionMode = 'agentic';
        break;
      case '--agentic-provider':
        opts.agenticProvider = validateAgenticProvider(next());
        break;
      case '--agentic-model':
      case '--codex-model':
        opts.agenticModel = next();
        break;
      case '--claude-timeout':
        opts.claudeTimeoutMs = parseInt(next(), 10);
        break;
      case '--model-ceiling':
        opts.modelCeiling = validateModelTier(next());
        break;
      case '--model-floor':
        opts.modelFloor = validateModelTier(next());
        break;
      case '--effort-ceiling':
        opts.effortCeiling = validateEffort(next());
        break;
      case '--procedural-rollup':
        opts.proceduralRollup = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.models.length === 0) throw new Error('At least one --model is required');
  if (opts.executionMode === 'agentic' && opts.agenticProvider === 'codex' && !opts.agenticModel) {
    opts.agenticModel = DEFAULT_CODEX_AGENTIC_MODEL;
  }
  return opts;
}

function validateProvider(value: string): LlmProvider {
  if (!VALID_PROVIDERS.has(value)) {
    throw new Error(`Invalid provider: ${value}. Must be one of: ${[...VALID_PROVIDERS].join(', ')}`);
  }
  return value as LlmProvider;
}

function validateAgenticProvider(value: string): AgenticProvider {
  if (!VALID_AGENTIC_PROVIDERS.has(value)) {
    throw new Error(`Invalid agentic provider: ${value}. Must be one of: ${[...VALID_AGENTIC_PROVIDERS].join(', ')}`);
  }
  return value as AgenticProvider;
}

const VALID_MODEL_TIERS = new Set<string>(['haiku', 'sonnet', 'opus']);
const VALID_EFFORTS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max']);

function validateModelTier(value: string): ModelTier {
  if (!VALID_MODEL_TIERS.has(value)) {
    throw new Error(`Invalid model tier: ${value}. Must be one of: ${[...VALID_MODEL_TIERS].join(', ')}`);
  }
  return value as ModelTier;
}

function validateEffort(value: string): EffortLevel {
  if (!VALID_EFFORTS.has(value)) {
    throw new Error(`Invalid effort level: ${value}. Must be one of: ${[...VALID_EFFORTS].join(', ')}`);
  }
  return value as EffortLevel;
}
