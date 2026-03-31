/**
 * TaskJournal tests — 0.3.1.5.11 Task Journal and Goal Decomposition
 *
 * Covers all 5 behavioral spec scenarios, contract postconditions,
 * contract invariants, and threshold registry constants.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskJournal } from '../task-journal.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// ── Helpers ──────────────────────────────────────────────────────

const TEST_WORKSPACE = join(import.meta.dirname ?? __dirname, '__tmp_task_journal_test__');

function freshJournal(): TaskJournal {
  return new TaskJournal(TEST_WORKSPACE);
}

function threeSubtasks() {
  return [
    { description: 'Read plan cards', criterion: 'All plan cards listed' },
    { description: 'Summarize findings', criterion: 'Summary written to notes' },
    { description: 'Create follow-up tasks', criterion: 'At least one follow-up task created' },
  ];
}

// ── Setup / Teardown ─────────────────────────────────────────────

beforeEach(() => {
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
  mkdirSync(TEST_WORKSPACE, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
});

// ── Behavioral Spec Scenarios ────────────────────────────────────

describe('Behavioral Spec: Task creation with no active task', () => {
  it('creates a task with status "active" and first subtask "pending"', () => {
    const journal = freshJournal();
    const task = journal.createTask({
      title: 'Explore plan cards',
      description: 'Read and understand plan card structure',
      subtasks: threeSubtasks(),
      sourceGoalId: 'goal-curiosity-42',
    });

    expect(task.status).toBe('active');
    expect(task.subtasks).toHaveLength(3);
    expect(task.subtasks[0].status).toBe('pending');
    expect(task.sourceGoalId).toBe('goal-curiosity-42');
  });
});

describe('Behavioral Spec: Task creation while another is active', () => {
  it('queues the new task behind the active one', () => {
    const journal = freshJournal();

    const first = journal.createTask({
      title: 'Explore plan cards',
      description: 'Read plan cards',
      subtasks: threeSubtasks(),
    });

    const second = journal.createTask({
      title: 'Reply to peer message',
      description: 'Respond to incoming message',
      subtasks: [{ description: 'Draft reply', criterion: 'Reply sent' }],
    });

    expect(first.status).toBe('active');
    expect(second.status).toBe('queued');
    // Original task still active
    expect(journal.activeTask()?.id).toBe(first.id);
  });
});

describe('Behavioral Spec: Force-active abandons current task', () => {
  it('marks current task "abandoned" with completedAt and activates new task', () => {
    const journal = freshJournal();

    const first = journal.createTask({
      title: 'Explore plan cards',
      description: 'Read plan cards',
      subtasks: threeSubtasks(),
    });

    const urgent = journal.createTask({
      title: 'Urgent response',
      description: 'Handle urgent drive',
      subtasks: [{ description: 'Respond', criterion: 'Response sent' }],
      forceActive: true,
    });

    // Reload to check persisted state
    const all = journal.all();
    const abandoned = all.find(t => t.id === first.id)!;
    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.completedAt).toBeTypeOf('number');
    expect(urgent.status).toBe('active');
    expect(journal.activeTask()?.id).toBe(urgent.id);
  });
});

describe('Behavioral Spec: Subtask completion promotes next subtask', () => {
  it('marks completed subtask "done" with output and activates next pending', () => {
    const journal = freshJournal();

    const task = journal.createTask({
      title: 'Multi-step task',
      description: 'A task with 3 subtasks',
      subtasks: threeSubtasks(),
    });

    const subA = task.subtasks[0];
    const subB = task.subtasks[1];

    const result = journal.completeSubtask(task.id, subA.id, 'found 3 cards');

    expect(result.taskDone).toBe(false);

    // Re-fetch to verify persisted state
    const updated = journal.getById(task.id)!;
    expect(updated.subtasks[0].status).toBe('done');
    expect(updated.subtasks[0].output).toBe('found 3 cards');
    expect(updated.subtasks[1].status).toBe('active');
  });
});

describe('Behavioral Spec: All subtasks done promotes queued task', () => {
  it('completes the task and promotes next queued task with its first subtask activated', () => {
    const journal = freshJournal();

    const first = journal.createTask({
      title: 'Single-step task',
      description: 'Task with one subtask',
      subtasks: [{ description: 'Do the thing', criterion: 'Thing done' }],
    });

    const second = journal.createTask({
      title: 'Queued task',
      description: 'Waiting in queue',
      subtasks: [
        { description: 'Step 1', criterion: 'Step 1 done' },
        { description: 'Step 2', criterion: 'Step 2 done' },
      ],
    });

    expect(second.status).toBe('queued');

    // Complete the only subtask of the first task
    const result = journal.completeSubtask(first.id, first.subtasks[0].id, 'completed');

    expect(result.taskDone).toBe(true);

    const all = journal.all();
    const completedFirst = all.find(t => t.id === first.id)!;
    expect(completedFirst.status).toBe('done');
    expect(completedFirst.completedAt).toBeTypeOf('number');

    const promotedSecond = all.find(t => t.id === second.id)!;
    expect(promotedSecond.status).toBe('active');
    expect(promotedSecond.subtasks[0].status).toBe('active');
  });
});

// ── Contract Postconditions ──────────────────────────────────────

describe('Contract: createTask postconditions', () => {
  it('returns active when no other task active', () => {
    const journal = freshJournal();
    const task = journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });
    expect(task.status).toBe('active');
  });

  it('returns queued when another task is active', () => {
    const journal = freshJournal();
    journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });
    const t2 = journal.createTask({
      title: 'T2',
      description: 'D2',
      subtasks: [{ description: 'S2', criterion: 'C2' }],
    });
    expect(t2.status).toBe('queued');
  });
});

describe('Contract: completeSubtask postconditions', () => {
  it('throws on invalid taskId', () => {
    const journal = freshJournal();
    expect(() => journal.completeSubtask('nonexistent', 'sub0')).toThrow('not found');
  });

  it('throws on invalid subtaskId', () => {
    const journal = freshJournal();
    const task = journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });
    expect(() => journal.completeSubtask(task.id, 'nonexistent')).toThrow('not found');
  });
});

describe('Contract: abandonTask postconditions', () => {
  it('sets status to "abandoned" with completedAt', () => {
    const journal = freshJournal();
    const task = journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });
    journal.abandonTask(task.id);
    const updated = journal.getById(task.id)!;
    expect(updated.status).toBe('abandoned');
    expect(updated.completedAt).toBeTypeOf('number');
  });

  it('throws on invalid taskId', () => {
    const journal = freshJournal();
    expect(() => journal.abandonTask('nonexistent')).toThrow('not found');
  });
});

describe('Contract: mutations persist immediately', () => {
  it('survives re-instantiation after createTask', () => {
    const j1 = freshJournal();
    const task = j1.createTask({
      title: 'Persistent',
      description: 'Should survive',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });

    // Create new instance reading from same file
    const j2 = new TaskJournal(TEST_WORKSPACE);
    const reloaded = j2.getById(task.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.title).toBe('Persistent');
    expect(reloaded!.status).toBe('active');
  });

  it('survives re-instantiation after completeSubtask', () => {
    const j1 = freshJournal();
    const task = j1.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [
        { description: 'S1', criterion: 'C1' },
        { description: 'S2', criterion: 'C2' },
      ],
    });
    j1.completeSubtask(task.id, task.subtasks[0].id, 'output1');

    const j2 = new TaskJournal(TEST_WORKSPACE);
    const reloaded = j2.getById(task.id)!;
    expect(reloaded.subtasks[0].status).toBe('done');
    expect(reloaded.subtasks[0].output).toBe('output1');
    expect(reloaded.subtasks[1].status).toBe('active');
  });
});

// ── Contract Invariants ──────────────────────────────────────────

describe('Invariant: at most one task active at any time', () => {
  it('maintains single active invariant through multiple operations', () => {
    const journal = freshJournal();

    journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });

    journal.createTask({
      title: 'T2',
      description: 'D2',
      subtasks: [{ description: 'S2', criterion: 'C2' }],
    });

    journal.createTask({
      title: 'T3',
      description: 'D3',
      subtasks: [{ description: 'S3', criterion: 'C3' }],
    });

    const activeCount = journal.all().filter(t => t.status === 'active').length;
    expect(activeCount).toBe(1);
  });

  it('maintains invariant after force-active', () => {
    const journal = freshJournal();

    journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });

    journal.createTask({
      title: 'T2',
      description: 'D2',
      subtasks: [{ description: 'S2', criterion: 'C2' }],
      forceActive: true,
    });

    const activeCount = journal.all().filter(t => t.status === 'active').length;
    expect(activeCount).toBe(1);
  });
});

describe('Invariant: Task IDs are unique', () => {
  it('generates unique task IDs', () => {
    const journal = freshJournal();
    const t1 = journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });
    // Force a different timestamp
    const t2 = journal.createTask({
      title: 'T2',
      description: 'D2',
      subtasks: [{ description: 'S2', criterion: 'C2' }],
    });
    expect(t1.id).not.toBe(t2.id);
  });
});

describe('Invariant: Subtask IDs unique within parent task', () => {
  it('generates unique subtask IDs within a task', () => {
    const journal = freshJournal();
    const task = journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: threeSubtasks(),
    });
    const ids = task.subtasks.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('Invariant: all() returns defensive copy', () => {
  it('does not allow mutation of internal state via returned array', () => {
    const journal = freshJournal();
    journal.createTask({
      title: 'T1',
      description: 'D1',
      subtasks: [{ description: 'S1', criterion: 'C1' }],
    });

    const copy = journal.all();
    copy.pop();
    expect(journal.all().length).toBe(1);
  });
});

// ── Threshold Registry ───────────────────────────────────────────

describe('Threshold: MAX_RECENT_DONE = 3', () => {
  it('formatRecentDone defaults to showing 3 completed tasks', () => {
    const journal = freshJournal();

    // Create and complete 5 tasks
    for (let i = 0; i < 5; i++) {
      const t = journal.createTask({
        title: `Task ${i}`,
        description: `D${i}`,
        subtasks: [{ description: `S${i}`, criterion: `C${i}` }],
      });
      journal.completeSubtask(t.id, t.subtasks[0].id);
    }

    const output = journal.formatRecentDone();
    // Should show exactly 3 completed tasks (the most recent)
    const lines = output.split('\n').filter(l => l.trim().length > 0);
    expect(lines.length).toBe(3);
  });
});

// ── Formatting ───────────────────────────────────────────────────

describe('formatActiveTask', () => {
  it('returns null when no active task', () => {
    const journal = freshJournal();
    expect(journal.formatActiveTask()).toBeNull();
  });

  it('returns compact summary with progress fraction and next subtask', () => {
    const journal = freshJournal();
    const task = journal.createTask({
      title: 'Explore plan cards',
      description: 'Read plan cards',
      subtasks: threeSubtasks(),
    });

    const summary = journal.formatActiveTask()!;
    expect(summary).toContain('Explore plan cards');
    expect(summary).toContain('[0/3 subtasks done]');
    expect(summary).toContain('Next: Read plan cards');
    expect(summary).toContain('Done when: All plan cards listed');
  });

  it('updates progress after subtask completion', () => {
    const journal = freshJournal();
    const task = journal.createTask({
      title: 'Multi-step',
      description: 'D',
      subtasks: threeSubtasks(),
    });

    journal.completeSubtask(task.id, task.subtasks[0].id);
    const summary = journal.formatActiveTask()!;
    expect(summary).toContain('[1/3 subtasks done]');
  });
});
