/**
 * AgentDigest — The Knowledge Map
 *
 * A compact, agent-maintained index of everything the agent knows.
 * Injected into every LLM call so the agent always has full landscape
 * awareness without needing to retrieve memories first.
 *
 * Structure:
 *   [stable]   identity, plan location, peer names
 *   [focus]    active task + next subtask (from TaskJournal)
 *   [findings] recent semantic memory topics (last N)
 *   [frontier] known-but-unread resources to explore
 *
 * The agent can update the digest via the `update_digest` tool.
 * Frontier items are added via `frontier_add` and marked done via `frontier_done`.
 *
 * Storage: ~/.local/share/MASTER_PLAN/state/digest.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FrontierPriority = 'high' | 'medium' | 'low';
export type FrontierStatus = 'unread' | 'in-progress' | 'done' | 'skipped';

export interface FrontierItem {
  id: string;
  resource: string;       // file path or concept name
  type: 'file' | 'plan-card' | 'concept' | 'peer-thread';
  priority: FrontierPriority;
  status: FrontierStatus;
  addedAt: number;
  completedAt?: number;
  note?: string;
}

export interface DigestData {
  /** Free-form notes the agent writes about its identity / stable context */
  identityNotes: string[];
  /** Recent semantic memory topics (auto-updated, last 15) */
  recentTopics: string[];
  /** Exploration frontier */
  frontier: FrontierItem[];
  /** Timestamp of last update */
  updatedAt: number;
}

// ── AgentDigest ───────────────────────────────────────────────────────────────

export class AgentDigest {
  private _data: DigestData;
  private readonly _file: string;

  constructor(workspacePath: string) {
    const stateDir = join(workspacePath, 'state');
    this._file = join(stateDir, 'digest.json');
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
    this._data = this._load();
  }

  // ── Frontier ───────────────────────────────────────────────────────────────

  /** Add an item to the frontier. No-op if the resource already exists. */
  frontierAdd(params: {
    resource: string;
    type: FrontierItem['type'];
    priority?: FrontierPriority;
    note?: string;
  }): FrontierItem | null {
    const existing = this._data.frontier.find(f => f.resource === params.resource);
    if (existing) return null;

    const item: FrontierItem = {
      id: `frontier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      resource: params.resource,
      type: params.type,
      priority: params.priority ?? 'medium',
      status: 'unread',
      addedAt: Date.now(),
      note: params.note,
    };

    this._data.frontier.push(item);
    this._data.updatedAt = Date.now();
    this._save();
    return item;
  }

  /** Mark a frontier item as done (explored). */
  frontierDone(resource: string, note?: string): boolean {
    const item = this._data.frontier.find(f => f.resource === resource);
    if (!item) return false;
    item.status = 'done';
    item.completedAt = Date.now();
    if (note) item.note = note;
    this._data.updatedAt = Date.now();
    this._save();
    return true;
  }

  /** Get unexplored frontier items, sorted by priority. */
  unread(maxItems = 10): FrontierItem[] {
    const priorityOrder: Record<FrontierPriority, number> = { high: 0, medium: 1, low: 2 };
    return this._data.frontier
      .filter(f => f.status === 'unread' || f.status === 'in-progress')
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, maxItems);
  }

  // ── Identity notes ─────────────────────────────────────────────────────────

  /** Add a note to the identity section (stable facts about self). */
  addIdentityNote(note: string): void {
    if (!this._data.identityNotes.includes(note)) {
      this._data.identityNotes.push(note);
      this._data.updatedAt = Date.now();
      this._save();
    }
  }

  /** Replace all identity notes. */
  setIdentityNotes(notes: string[]): void {
    this._data.identityNotes = notes;
    this._data.updatedAt = Date.now();
    this._save();
  }

  // ── Recent topics (auto-synced from memory system) ─────────────────────────

  /** Update the recent topics list from current semantic memory. */
  syncTopics(topics: string[]): void {
    // Keep unique, most recent first, cap at 20
    const unique = [...new Set(topics)];
    this._data.recentTopics = unique.slice(-20);
    this._data.updatedAt = Date.now();
    this._save();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  /**
   * Render the full digest for LLM injection.
   * Accepts optional live data (active task, peer names) that isn't persisted.
   */
  render(opts?: {
    activeTaskSummary?: string | null;
    peerNames?: string[];
  }): string {
    const lines: string[] = ['## Agent Knowledge Map'];

    // [stable] identity
    lines.push('');
    lines.push('### Identity [stable]');
    lines.push('- I am an agent running the MASTER_PLAN → plan/root.md');
    for (const note of this._data.identityNotes) {
      lines.push(`- ${note}`);
    }
    if (opts?.peerNames && opts.peerNames.length > 0) {
      lines.push(`- Known peers: ${opts.peerNames.join(', ')}`);
    }

    // [current focus]
    lines.push('');
    lines.push('### Current Focus');
    if (opts?.activeTaskSummary) {
      for (const line of opts.activeTaskSummary.split('\n')) {
        lines.push(line);
      }
    } else {
      lines.push('No active task. Check task journal or create a new task.');
    }

    // [findings] — recent memory topics
    lines.push('');
    lines.push('### What I Know [memory topics]');
    if (this._data.recentTopics.length > 0) {
      lines.push(this._data.recentTopics.join(', '));
    } else {
      lines.push('No memories yet.');
    }

    // [frontier] — unexplored items
    const unread = this.unread(8);
    lines.push('');
    lines.push('### Frontier [unexplored]');
    if (unread.length > 0) {
      for (const item of unread) {
        const pri = item.priority === 'high' ? '↑' : item.priority === 'low' ? '↓' : '·';
        lines.push(`  ${pri} ${item.resource} [${item.type}]${item.note ? ` — ${item.note}` : ''}`);
      }
    } else {
      lines.push('Frontier empty — use frontier_add to register things to explore.');
    }

    return lines.join('\n');
  }

  // ── Raw access ─────────────────────────────────────────────────────────────

  getData(): Readonly<DigestData> {
    return this._data;
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private _load(): DigestData {
    if (!existsSync(this._file)) {
      return {
        identityNotes: [],
        recentTopics: [],
        frontier: [],
        updatedAt: Date.now(),
      };
    }
    try {
      return JSON.parse(readFileSync(this._file, 'utf-8')) as DigestData;
    } catch {
      return {
        identityNotes: [],
        recentTopics: [],
        frontier: [],
        updatedAt: Date.now(),
      };
    }
  }

  private _save(): void {
    const dir = dirname(this._file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this._file, JSON.stringify(this._data, null, 2));
  }
}
