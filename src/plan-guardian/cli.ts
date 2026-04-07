/**
 * CLI Argument Parser — Plan Guardian
 *
 * Pure function: argv → config values. No side effects.
 * Single provider — the system is designed so a 7B handles everything.
 *
 * Domain: Plan Guardian
 */

export type LlmProvider = 'anthropic' | 'openai' | 'openrouter' | 'local';

export interface CliOptions {
  planDir: string;
  provider: LlmProvider;
  model: string;
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
  provider: 'openrouter',
  model: 'gpt-oss-120b:free',
  concurrency: 20,
  maxIterations: Infinity,
  maxDepth: 8,
  dryRun: false,
  cycleThreshold: 3,
  strictIntegrity: true,
  maxNewFilesPerAction: 5,
  quarantineBranch: undefined,
};

const VALID_PROVIDERS = new Set<string>(['anthropic', 'openai', 'openrouter', 'local']);

export function parseCli(argv: string[]): CliOptions {
  const opts = { ...DEFAULTS };
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
        opts.model = next();
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
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function validateProvider(value: string): LlmProvider {
  if (!VALID_PROVIDERS.has(value)) {
    throw new Error(`Invalid provider: ${value}. Must be one of: ${[...VALID_PROVIDERS].join(', ')}`);
  }
  return value as LlmProvider;
}
