/**
 * TaskJournal — Goal Decomposition and Task Tracking
 *
 * Provides persistent task decomposition: a high-level goal breaks into
 * ordered subtasks, each with a completion criterion and an output slot.
 * The journal survives restarts and gives the agent cross-tick continuity.
 *
 * Storage: ~/.local/share/MASTER_PLAN/state/tasks.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubTaskStatus = 'pending' | 'active' | 'done' | 'skipped';
export type TaskStatus = 'active' | 'done' | 'abandoned';

export interface SubTask {
  id: string;
  description: string;
  /** What "done" looks like — concrete observable outcome */
  criterion: string;
  status: SubTaskStatus;
  /** What was produced / learned when this subtask completed */
  output?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  subtasks: SubTask[];
  createdAt: number;
  completedAt?: number;
  /** ID of the drive goal candidate that spawned this task */
  sourceGoalId?: string;
}

// ── TaskJournal ───────────────────────────────────────────────────────────────

export class TaskJournal {
  private _tasks: Task[] = [];
  private readonly _file: string;

  constructor(workspacePath: string) {
    const stateDir = join(workspacePath, 'state');
    this._file = join(stateDir, 'tasks.json');
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
    this._load();
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Currently active task (first with status 'active'), or null. */
  activeTask(): Task | null {
    return this._tasks.find(t => t.status === 'active') ?? null;
  }

  /** Next pending subtask of the active task, or null. */
  nextSubtask(): SubTask | null {
    const task = this.activeTask();
    if (!task) return null;
    return task.subtasks.find(s => s.status === 'pending' || s.status === 'active') ?? null;
  }

  /** All tasks (active, done, abandoned). */
  all(): Task[] {
    return [...this._tasks];
  }

  /** Get a task by ID. */
  getById(id: string): Task | undefined {
    return this._tasks.find(t => t.id === id);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Create a new task with subtasks.
   * If another task is already active, the new task is queued (pending).
   * Pass `forceActive: true` to make it active immediately (abandons current).
   */
  createTask(params: {
    title: string;
    description: string;
    subtasks: Array<{ description: string; criterion: string }>;
    sourceGoalId?: string;
    forceActive?: boolean;
  }): Task {
    const now = Date.now();
    const id = `task-${now}`;

    const hasActive = this._tasks.some(t => t.status === 'active');

    // If forcing active, abandon the current task
    if (params.forceActive && hasActive) {
      for (const t of this._tasks) {
        if (t.status === 'active') {
          t.status = 'abandoned';
          t.completedAt = now;
        }
      }
    }

    const subtasks: SubTask[] = params.subtasks.map((s, i) => ({
      id: `${id}-sub${i}`,
      description: s.description,
      criterion: s.criterion,
      status: 'pending' as SubTaskStatus,
    }));

    const task: Task = {
      id,
      title: params.title,
      description: params.description,
      status: (!hasActive || params.forceActive) ? 'active' : 'active',
      subtasks,
      createdAt: now,
      sourceGoalId: params.sourceGoalId,
    };

    this._tasks.push(task);
    this._save();
    return task;
  }

  /**
   * Advance the current active subtask: mark it done with optional output,
   * and activate the next pending subtask. If all subtasks are done,
   * marks the task itself as done.
   */
  completeSubtask(taskId: string, subtaskId: string, output?: string): { taskDone: boolean } {
    const task = this._tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task "${taskId}" not found`);

    const sub = task.subtasks.find(s => s.id === subtaskId);
    if (!sub) throw new Error(`Subtask "${subtaskId}" not found in task "${taskId}"`);

    sub.status = 'done';
    if (output) sub.output = output;

    // Activate next pending subtask
    const nextPending = task.subtasks.find(s => s.status === 'pending');
    if (nextPending) {
      nextPending.status = 'active';
      this._save();
      return { taskDone: false };
    }

    // All subtasks done → complete the task
    const allDone = task.subtasks.every(s => s.status === 'done' || s.status === 'skipped');
    if (allDone) {
      task.status = 'done';
      task.completedAt = Date.now();
      this._save();
      return { taskDone: true };
    }

    this._save();
    return { taskDone: false };
  }

  /** Update a subtask's status directly (e.g. skip it). */
  updateSubtask(taskId: string, subtaskId: string, fields: Partial<Pick<SubTask, 'status' | 'output'>>): void {
    const task = this._tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task "${taskId}" not found`);
    const sub = task.subtasks.find(s => s.id === subtaskId);
    if (!sub) throw new Error(`Subtask "${subtaskId}" not found`);
    Object.assign(sub, fields);
    this._save();
  }

  /** Abandon a task by ID. */
  abandonTask(taskId: string): void {
    const task = this._tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task "${taskId}" not found`);
    task.status = 'abandoned';
    task.completedAt = Date.now();
    this._save();
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  /** Compact summary for digest injection. */
  formatActiveTask(): string | null {
    const task = this.activeTask();
    if (!task) return null;

    const total = task.subtasks.length;
    const done = task.subtasks.filter(s => s.status === 'done' || s.status === 'skipped').length;
    const next = this.nextSubtask();

    const lines = [
      `Task: ${task.title} [${done}/${total} subtasks done] → ${task.id}`,
    ];

    if (next) {
      lines.push(`  Next: ${next.description}`);
      lines.push(`  Done when: ${next.criterion}`);
    } else {
      lines.push(`  All subtasks complete — ready to close.`);
    }

    return lines.join('\n');
  }

  /** Recent completed tasks for digest. */
  formatRecentDone(count = 3): string {
    const done = this._tasks
      .filter(t => t.status === 'done')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, count);

    if (done.length === 0) return '';
    return done.map(t => `  ✓ ${t.title} (${_ago(t.completedAt!)})`).join('\n');
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private _load(): void {
    if (!existsSync(this._file)) return;
    try {
      const raw = readFileSync(this._file, 'utf-8');
      this._tasks = JSON.parse(raw) as Task[];
    } catch {
      this._tasks = [];
    }
  }

  private _save(): void {
    const dir = dirname(this._file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this._file, JSON.stringify(this._tasks, null, 2));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _ago(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  return `${Math.round(d / 3_600_000)}h ago`;
}
