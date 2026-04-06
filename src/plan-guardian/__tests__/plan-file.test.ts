import { describe, it, expect } from 'vitest';
import {
  parsePlanFile,
  serializePlanFile,
  extractStatus,
  extractNumericId,
  extractLastRevision,
} from '../plan-file.js';
import type { PlanFile } from '../interfaces.js';

const LEAF_FILE = `---
parent: plan/0.3.1.5-industrial-era-conscious-agent.md
root: plan/root.md
depends-on:
  - plan/0.3.1.5.1-llm-consciousness-substrate.md
  - plan/0.3.1.5.2-personality-and-trait-model.md
---
# 0.3.1.5.9 Agent Runtime and Event Loop [DONE]
## Description

The scheduler that makes everything actually run.

## Revision History
- 2026-03-31T08:08:03.155Z: status REVIEW → DONE
- 2026-03-31T07:20:08.766Z: status ARCHITECT → IMPLEMENT
`;

const ROOT_FILE = `---
root: plan/root.md
children:
  - plan/0.0-current-substrate.md
  - plan/0.1-foundational-capabilities.md
  - plan/0.2-experience-substrates.md
---
# 0 MASTER_PLAN [DONE]

**Version:** 0.4 (Recursive Draft)
`;

const BRANCH_FILE = `---
parent: plan/0.3-autonomous-entities.md
root: plan/root.md
children:
  - plan/0.3.1.1-conscious-ai-architectures.md
  - plan/0.3.1.5-industrial-era-conscious-agent.md
blocked-by:
  - plan/0.2-experience-substrates.md
---
# 0.3.1 Autonomous Entities with Subjective Experience [PLAN]

## Description

Building conscious agents.
`;

const MINIMAL_FILE = `---
root: plan/root.md
---
# 0.99 Minimal Task [PLAN]

Just a task.
`;

// ── extractStatus ───────────────────────────────────────────

describe('extractStatus', () => {
  it('extracts DONE from heading', () => {
    expect(extractStatus('# 0.3.1.5.9 Agent Runtime [DONE]')).toBe('DONE');
  });

  it('extracts PLAN from heading', () => {
    expect(extractStatus('# 0.3.1 Something [PLAN]')).toBe('PLAN');
  });

  it('extracts ARCHITECT', () => {
    expect(extractStatus('# 0.1 Foo [ARCHITECT]')).toBe('ARCHITECT');
  });

  it('extracts IMPLEMENT', () => {
    expect(extractStatus('# 0.1 Foo [IMPLEMENT]')).toBe('IMPLEMENT');
  });

  it('extracts REVIEW', () => {
    expect(extractStatus('# 0.1 Foo [REVIEW]')).toBe('REVIEW');
  });

  it('returns PLAN when no status tag', () => {
    expect(extractStatus('# 0.1 No Status')).toBe('PLAN');
  });
});

// ── extractNumericId ────────────────────────────────────────

describe('extractNumericId', () => {
  it('extracts from leaf path', () => {
    expect(extractNumericId('plan/0.3.1.5.9-agent-runtime.md')).toBe('0.3.1.5.9');
  });

  it('extracts from root path', () => {
    expect(extractNumericId('plan/root.md')).toBe('0');
  });

  it('extracts from simple path', () => {
    expect(extractNumericId('plan/0.0-current-substrate.md')).toBe('0.0');
  });

  it('extracts from two-digit segment', () => {
    expect(extractNumericId('plan/0.3.1.5.10-social-cognition.md')).toBe('0.3.1.5.10');
  });
});

// ── extractLastRevision ─────────────────────────────────────

describe('extractLastRevision', () => {
  it('extracts most recent ISO timestamp', () => {
    const body = `## Revision History
- 2026-03-31T08:08:03.155Z: status REVIEW → DONE
- 2026-03-31T07:20:08.766Z: status ARCHITECT → IMPLEMENT`;
    expect(extractLastRevision(body)).toBe('2026-03-31T08:08:03.155Z');
  });

  it('extracts date-only format', () => {
    const body = `## Revision History
- 2026-03-31: status PLAN → DONE`;
    expect(extractLastRevision(body)).toBe('2026-03-31');
  });

  it('returns null when no revision history', () => {
    expect(extractLastRevision('Just some text')).toBeNull();
  });
});

// ── parsePlanFile ───────────────────────────────────────────

describe('parsePlanFile', () => {
  it('parses a leaf file', () => {
    const result = parsePlanFile('plan/0.3.1.5.9-agent-runtime.md', LEAF_FILE);
    expect(result.path).toBe('plan/0.3.1.5.9-agent-runtime.md');
    expect(result.status).toBe('DONE');
    expect(result.numericId).toBe('0.3.1.5.9');
    expect(result.depth).toBe(4);
    expect(result.title).toBe('Agent Runtime and Event Loop');
    expect(result.isLeaf).toBe(true);
    expect(result.frontmatter.parent).toBe('plan/0.3.1.5-industrial-era-conscious-agent.md');
    expect(result.frontmatter.root).toBe('plan/root.md');
    expect(result.frontmatter['depends-on']).toHaveLength(2);
    expect(result.frontmatter.children).toBeUndefined();
    expect(result.lastRevision).toBe('2026-03-31T08:08:03.155Z');
  });

  it('parses root file', () => {
    const result = parsePlanFile('plan/root.md', ROOT_FILE);
    expect(result.path).toBe('plan/root.md');
    expect(result.status).toBe('DONE');
    expect(result.numericId).toBe('0');
    expect(result.depth).toBe(0);
    expect(result.isLeaf).toBe(false);
    expect(result.frontmatter.children).toHaveLength(3);
    expect(result.frontmatter.parent).toBeUndefined();
  });

  it('parses branch file with blocked-by', () => {
    const result = parsePlanFile('plan/0.3.1-autonomous-entities.md', BRANCH_FILE);
    expect(result.isLeaf).toBe(false);
    expect(result.frontmatter.children).toHaveLength(2);
    expect(result.frontmatter['blocked-by']).toEqual(['plan/0.2-experience-substrates.md']);
    expect(result.status).toBe('PLAN');
  });

  it('parses minimal file', () => {
    const result = parsePlanFile('plan/0.99-minimal.md', MINIMAL_FILE);
    expect(result.numericId).toBe('0.99');
    expect(result.depth).toBe(1);
    expect(result.isLeaf).toBe(true);
    expect(result.status).toBe('PLAN');
    expect(result.lastRevision).toBeNull();
  });

  it('computes depth correctly', () => {
    const r1 = parsePlanFile('plan/root.md', ROOT_FILE);
    const r2 = parsePlanFile('plan/0.3.1.5.9-agent-runtime.md', LEAF_FILE);
    expect(r1.depth).toBe(0);
    expect(r2.depth).toBe(4);
  });
});

// ── serializePlanFile ───────────────────────────────────────

describe('serializePlanFile', () => {
  it('round-trips a leaf file', () => {
    const parsed = parsePlanFile('plan/0.3.1.5.9-agent-runtime.md', LEAF_FILE);
    const serialized = serializePlanFile(parsed);
    const reparsed = parsePlanFile('plan/0.3.1.5.9-agent-runtime.md', serialized);
    expect(reparsed.status).toBe(parsed.status);
    expect(reparsed.frontmatter).toEqual(parsed.frontmatter);
    expect(reparsed.title).toBe(parsed.title);
    expect(reparsed.isLeaf).toBe(parsed.isLeaf);
  });

  it('round-trips a branch file with children and blocked-by', () => {
    const parsed = parsePlanFile('plan/0.3.1-autonomous-entities.md', BRANCH_FILE);
    const serialized = serializePlanFile(parsed);
    const reparsed = parsePlanFile('plan/0.3.1-autonomous-entities.md', serialized);
    expect(reparsed.frontmatter.children).toEqual(parsed.frontmatter.children);
    expect(reparsed.frontmatter['blocked-by']).toEqual(parsed.frontmatter['blocked-by']);
  });

  it('round-trips root file', () => {
    const parsed = parsePlanFile('plan/root.md', ROOT_FILE);
    const serialized = serializePlanFile(parsed);
    const reparsed = parsePlanFile('plan/root.md', serialized);
    expect(reparsed.frontmatter.children).toEqual(parsed.frontmatter.children);
    expect(reparsed.numericId).toBe('0');
  });
});
