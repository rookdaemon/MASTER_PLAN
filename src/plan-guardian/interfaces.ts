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
}

// ── Clock ───────────────────────────────────────────────────

export interface IClock {
  now(): string;
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
  /** Single provider for all actions — planning and execution alike. */
  provider: IInferenceProvider;
  fs: IFileSystem;
  git: IGitOperations;
  clock: IClock;
}
