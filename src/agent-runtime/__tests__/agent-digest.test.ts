/**
 * Tests for AgentDigest — covers all 5 Behavioral Spec scenarios
 * from plan/0.3.1.5.13-agent-digest.md plus Contracts postconditions/invariants.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentDigest, MAX_RECENT_TOPICS, MAX_FRONTIER_RENDERED } from '../agent-digest.js';

describe('AgentDigest', () => {
  let workspace: string;
  let digest: AgentDigest;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'digest-test-'));
    digest = new AgentDigest(workspace);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // ── Threshold Registry ──────────────────────────────────────────

  describe('Threshold Registry constants', () => {
    it('MAX_RECENT_TOPICS is 20', () => {
      expect(MAX_RECENT_TOPICS).toBe(20);
    });

    it('MAX_FRONTIER_RENDERED is 8', () => {
      expect(MAX_FRONTIER_RENDERED).toBe(8);
    });
  });

  // ── Behavioral Spec: Identity notes persist and render ──────────

  describe('Scenario: Identity notes persist and render', () => {
    it('renders identity note under Identity [stable] and persists to digest.json', () => {
      digest.addIdentityNote('I prefer reading plan cards depth-first');

      const rendered = digest.render();
      expect(rendered).toContain('Identity [stable]');
      expect(rendered).toContain('I prefer reading plan cards depth-first');

      // Verify persistence
      const file = join(workspace, 'state', 'digest.json');
      expect(existsSync(file)).toBe(true);
      const saved = JSON.parse(readFileSync(file, 'utf-8'));
      expect(saved.identityNotes).toContain('I prefer reading plan cards depth-first');
    });
  });

  // ── Behavioral Spec: Settled facts render with strong framing ──

  describe('Scenario: Settled facts render with strong framing', () => {
    it('shows "Settled Facts (DO NOT re-decide)" section with the fact', () => {
      digest.addSettledFact('Communication style: concise and direct');

      const rendered = digest.render();
      expect(rendered).toContain('Settled Facts (DO NOT re-decide)');
      expect(rendered).toContain('Communication style: concise and direct');
    });

    it('does not show settled facts section when empty', () => {
      const rendered = digest.render();
      expect(rendered).not.toContain('Settled Facts');
    });
  });

  // ── Behavioral Spec: Frontier item lifecycle ────────────────────

  describe('Scenario: Frontier item lifecycle', () => {
    it('adds item, shows in unread with up-arrow, marks done with timestamp', () => {
      // Add
      const item = digest.frontierAdd({
        resource: 'plan/0.3.1.5.1-llm-consciousness-substrate.md',
        type: 'plan-card',
        priority: 'high',
      });
      expect(item).not.toBeNull();
      expect(item!.status).toBe('unread');

      // Appears in unread
      const unreadItems = digest.unread();
      expect(unreadItems.some(u => u.resource === 'plan/0.3.1.5.1-llm-consciousness-substrate.md')).toBe(true);

      // Renders with up-arrow
      const rendered = digest.render();
      expect(rendered).toContain('↑ plan/0.3.1.5.1-llm-consciousness-substrate.md');

      // Mark done
      const done = digest.frontierDone(
        'plan/0.3.1.5.1-llm-consciousness-substrate.md',
        'reviewed — good substrate design',
      );
      expect(done).toBe(true);

      // Verify done state
      const data = digest.getData();
      const doneItem = data.frontier.find(f => f.resource === 'plan/0.3.1.5.1-llm-consciousness-substrate.md');
      expect(doneItem!.status).toBe('done');
      expect(doneItem!.completedAt).toBeTypeOf('number');

      // No longer in unread
      const unreadAfter = digest.unread();
      expect(unreadAfter.some(u => u.resource === 'plan/0.3.1.5.1-llm-consciousness-substrate.md')).toBe(false);
    });
  });

  // ── Behavioral Spec: Duplicate frontier add is no-op ────────────

  describe('Scenario: Duplicate frontier add is no-op', () => {
    it('returns null and creates no duplicate', () => {
      digest.frontierAdd({ resource: 'plan/root.md', type: 'plan-card' });

      const duplicate = digest.frontierAdd({ resource: 'plan/root.md', type: 'plan-card' });
      expect(duplicate).toBeNull();

      const matching = digest.getData().frontier.filter(f => f.resource === 'plan/root.md');
      expect(matching).toHaveLength(1);
    });
  });

  // ── Behavioral Spec: Active task summary injected from TaskJournal

  describe('Scenario: Active task summary injected from TaskJournal', () => {
    it('shows task summary with progress in Current Focus section', () => {
      const rendered = digest.render({
        activeTaskSummary: 'Task: Read plan cards [2/5 subtasks done]\n  Next: Read 0.3.1.5.3',
      });

      expect(rendered).toContain('Current Focus');
      expect(rendered).toContain('Task: Read plan cards [2/5 subtasks done]');
      expect(rendered).toContain('Next: Read 0.3.1.5.3');
    });

    it('shows fallback when no active task', () => {
      const rendered = digest.render();
      expect(rendered).toContain('Current Focus');
      expect(rendered).toContain('No active task');
    });
  });

  // ── Contracts: postconditions ──────────────────────────────────

  describe('Contracts postconditions', () => {
    it('addIdentityNote is idempotent', () => {
      digest.addIdentityNote('Note A');
      digest.addIdentityNote('Note A');
      expect(digest.getData().identityNotes.filter(n => n === 'Note A')).toHaveLength(1);
    });

    it('addSettledFact is idempotent', () => {
      digest.addSettledFact('Fact X');
      digest.addSettledFact('Fact X');
      expect(digest.getData().settledFacts.filter(f => f === 'Fact X')).toHaveLength(1);
    });

    it('syncTopics replaces with unique capped at MAX_RECENT_TOPICS', () => {
      const topics = Array.from({ length: 30 }, (_, i) => `topic-${i}`);
      digest.syncTopics(topics);
      expect(digest.getData().recentTopics).toHaveLength(MAX_RECENT_TOPICS);
    });

    it('syncTopics deduplicates', () => {
      digest.syncTopics(['a', 'b', 'a', 'c', 'b']);
      const topics = digest.getData().recentTopics;
      expect(topics).toEqual(['a', 'b', 'c']);
    });

    it('unread returns frontier items sorted by priority (high first)', () => {
      digest.frontierAdd({ resource: 'low.md', type: 'file', priority: 'low' });
      digest.frontierAdd({ resource: 'high.md', type: 'file', priority: 'high' });
      digest.frontierAdd({ resource: 'med.md', type: 'file', priority: 'medium' });

      const items = digest.unread();
      expect(items[0].resource).toBe('high.md');
      expect(items[1].resource).toBe('med.md');
      expect(items[2].resource).toBe('low.md');
    });

    it('frontierDone returns false for unknown resource', () => {
      expect(digest.frontierDone('nonexistent.md')).toBe(false);
    });

    it('getData returns read-only snapshot', () => {
      const data = digest.getData();
      expect(data).toBeDefined();
      expect(data.identityNotes).toBeInstanceOf(Array);
    });

    it('all mutations persist to digest.json immediately', () => {
      digest.addIdentityNote('persist-test');
      const file = join(workspace, 'state', 'digest.json');
      const saved = JSON.parse(readFileSync(file, 'utf-8'));
      expect(saved.identityNotes).toContain('persist-test');
    });
  });

  // ── Contracts: invariants ──────────────────────────────────────

  describe('Contracts invariants', () => {
    it('render() always includes Identity section with base agent context', () => {
      const rendered = digest.render();
      expect(rendered).toContain('Identity [stable]');
      expect(rendered).toContain('MASTER_PLAN');
    });

    it('frontier items render with correct priority indicators', () => {
      digest.frontierAdd({ resource: 'h.md', type: 'file', priority: 'high' });
      digest.frontierAdd({ resource: 'm.md', type: 'file', priority: 'medium' });
      digest.frontierAdd({ resource: 'l.md', type: 'file', priority: 'low' });

      const rendered = digest.render();
      expect(rendered).toContain('↑ h.md');
      expect(rendered).toContain('· m.md');
      expect(rendered).toContain('↓ l.md');
    });
  });

  // ── Persistence across instances ──────────────────────────────

  describe('Persistence across restarts', () => {
    it('data survives constructor reload', () => {
      digest.addIdentityNote('survives restart');
      digest.addSettledFact('decided forever');
      digest.frontierAdd({ resource: 'x.md', type: 'file', priority: 'high' });

      // Create new instance from same workspace
      const digest2 = new AgentDigest(workspace);
      const data = digest2.getData();
      expect(data.identityNotes).toContain('survives restart');
      expect(data.settledFacts).toContain('decided forever');
      expect(data.frontier.some(f => f.resource === 'x.md')).toBe(true);
    });
  });
});
