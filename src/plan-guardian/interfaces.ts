/**
 * Plan Guardian — Type Definitions
 *
 * All interfaces and types for the plan guardian agent.
 * The guardian recursively decomposes plan items — planning AND execution
 * are both handled by a single model (designed for 7B). Quality comes
 * from prompt engineering and context assembly, not model size.
 *
 * Domain: Plan Guardian (separate from agent-runtime)
 */

import type { IInferenceProvider } from '../llm-substrate/inference-provider.js';
import type { IFileSystem } from '../agent-runtime/filesystem.js';
import type { ModelMetadata } from './model-metadata.js';
import type { IModelSelector } from './model-selector.js';

// ── Plan File Model ──────────────────────────────────────────

export interface PlanFrontmatter {
  parent?: string;
  root?: string;
  children?: string[];
  'blocked-by'?: string[];
  'depends-on'?: string[];
}

export type PlanStatus = 'PLAN' | 'ARCHITECT' | 'IMPLEMENT' | 'REVIEW' | 'DONE';

export interface PlanFile {
  /** Relative path from repo root, e.g. "plan/0.1.2.3-some-task.md" */
  path: string;
  frontmatter: PlanFrontmatter;
  status: PlanStatus;
  /** The hierarchical numeric ID, e.g. "0.1.2.3" */
  numericId: string;
  /** Depth = number of dots in the numeric ID */
  depth: number;
  /** H1 heading text (without status tag) */
  title: string;
  /** Full markdown body (everything after frontmatter) */
  body: string;
  /** Whether this is a leaf (no children field or empty children) */
  isLeaf: boolean;
  /** Last revision timestamp (ISO string from revision history), or null */
  lastRevision: string | null;
}

// ── DAG ─────────────────────────────────────────────────────

export interface IPlanDAG {
  readonly nodes: ReadonlyMap<string, PlanFile>;
  childrenOf(path: string): PlanFile[];
  parentOf(path: string): PlanFile | null;
  blockers(path: string): PlanFile[];
  dependants(path: string): PlanFile[];
  leaves(): PlanFile[];
  roots(): PlanFile[];
  byStatus(status: PlanStatus): PlanFile[];
}

// ── Planning Actions ────────────────────────────────────────

export type PlanningActionType =
  | 'decompose'
  | 'research'
  | 'refine'
  | 'reconcile'
  | 'consolidate'
  | 'promote'
  | 'status-update'
  | 'execute';

export interface FileWrite {
  path: string;
  content: string;
}

export interface PlanningAction {
  type: PlanningActionType;
  /** The plan file being acted upon */
  targetPath: string;
  /** Human-readable summary */
  summary: string;
  /** Files created */
  filesCreated: FileWrite[];
  /** Files modified */
  filesModified: FileWrite[];
  /** Paths in the write-set (for file-level locking) */
  writeSet: string[];
}

// ── Worker Types ────────────────────────────────────────────

export interface WorkerResult {
  action: PlanningAction;
  tokensUsed: { prompt: number; completion: number };
  latencyMs: number;
  /** Dollar cost reported by the agentic CLI for this action, if known. */
  costUsd?: number;
}

export interface DispatchItem {
  task: PlanFile;
  actionType: PlanningActionType;
  /** Pre-computed write-set for file-level locking */
  writeSet: string[];
}

// ── Git Operations ──────────────────────────────────────────

export interface IGitOperations {
  add(paths: string[]): Promise<void>;
  commit(message: string, branch?: string): Promise<string>;
  status(): Promise<string>;
  stagedPaths(): Promise<string[]>;
  /**
   * Discard working-tree changes to `paths`: revert tracked modifications to
   * HEAD and remove any untracked files among them. Used by agentic mode to
   * roll back an edit that fails the integrity gate.
   */
  restore(paths: string[]): Promise<void>;
}

// ── Clock ───────────────────────────────────────────────────

export interface IClock {
  now(): string;
}

// ── Sleeper ─────────────────────────────────────────────────

export interface ISleeper {
  sleep(ms: number): Promise<void>;
}

// ── Guardian Configuration ──────────────────────────────────

export interface GuardianConfig {
  planDir: string;
  repoRoot: string;
  concurrency: number;
  requestedConcurrency: number;
  maxIterations: number;
  maxDepth: number;
  dryRun: boolean;
  cycleThreshold: number;
  strictIntegrity: boolean;
  maxNewFilesPerAction: number;
  maxTokensPerCall: number;
  quarantineBranch?: string;
  modelMetadata?: ModelMetadata;
  /** Single provider used when no modelSelector is configured. */
  provider: IInferenceProvider;
  /**
   * Optional priority-ordered model selector. When present, replaces `provider`
   * for all inference dispatch — the selector handles per-model rate-limit
   * circuit breaking and automatic fallback to the next available model.
   */
  modelSelector?: IModelSelector;
  fs: IFileSystem;
  git: IGitOperations;
  clock: IClock;
  sleeper: ISleeper;

  // ── Agentic mode (Claude Code CLI / Ralph-Wiggum) ──────────
  /**
   * Execution brain. 'provider' (default) calls an inference API and applies
   * parsed file blocks. 'agentic' shells out to the Claude Code CLI, which
   * edits files directly; the scheduler commits the observed diff.
   */
  executionMode?: 'provider' | 'agentic';
  /** Claude CLI invoker — required when executionMode === 'agentic'. */
  claudeInvoker?: import('./claude-invoker.js').ClaudeInvoker;
  /** Plan root file passed to the CLI as whole-plan context (agentic mode). */
  rootPlanFile?: string;
  /** Per-invocation timeout for the Claude CLI in ms (agentic mode). */
  claudeTimeoutMs?: number;
  /** Bounds for the per-card model/effort policy (agentic mode). */
  modelBounds?: import('./agentic-model-policy.js').ModelPolicyBounds;
  /**
   * Worktree pool for parallel agentic execution. When present (and concurrency
   * > 1), the scheduler runs each agent in its own worktree and applies results
   * to main serially. Absent → single-card serial agentic on the main tree.
   */
  worktreePool?: import('./worktree-pool.js').IWorktreePool;
  /**
   * When true, a node whose children are all DONE is rolled up to DONE
   * deterministically (no model call). Default false: instead the model runs a
   * completion-review to confirm the card's own criteria are met / fix gaps
   * before advancing. (Agentic mode.)
   */
  proceduralRollup?: boolean;
}
