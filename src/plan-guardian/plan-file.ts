/**
 * Plan File Parser & Serializer
 *
 * Parses ./plan/*.md files with YAML frontmatter into PlanFile structs.
 * No external YAML dependency — the frontmatter uses a constrained subset:
 *   - Scalar values: `key: value`
 *   - List values: `key:\n  - item\n  - item`
 *
 * Domain: Plan Guardian
 */

import type { PlanFile, PlanFrontmatter, PlanStatus } from './interfaces.js';

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'PLAN', 'ARCHITECT', 'IMPLEMENT', 'REVIEW', 'DONE',
]);

// ── Public API ──────────────────────────────────────────────

export function parsePlanFile(path: string, content: string): PlanFile {
  const { frontmatter, body } = splitFrontmatter(content);
  const parsed = parseFrontmatter(frontmatter);
  const heading = extractHeading(body);
  const status = extractStatus(heading);
  const title = extractTitle(heading);
  const numericId = extractNumericId(path);
  const depth = numericId === '0' ? 0 : numericId.split('.').length - 1;
  const isLeaf = !parsed.children || parsed.children.length === 0;
  const lastRevision = extractLastRevision(body);

  return {
    path,
    frontmatter: parsed,
    status,
    numericId,
    depth,
    title,
    body,
    isLeaf,
    lastRevision,
  };
}

export function serializePlanFile(plan: PlanFile): string {
  const fm = serializeFrontmatter(plan.frontmatter);
  return `---\n${fm}---\n${plan.body}`;
}

export function extractStatus(heading: string): PlanStatus {
  const match = heading.match(/\[(\w+)\]\s*$/);
  if (match && VALID_STATUSES.has(match[1])) {
    return match[1] as PlanStatus;
  }
  return 'PLAN';
}

export function extractNumericId(path: string): string {
  const filename = path.split('/').pop() ?? '';
  if (filename === 'root.md') return '0';
  const match = filename.match(/^([\d.]+)/);
  return match ? match[1].replace(/\.$/, '') : '0';
}

export function extractLastRevision(body: string): string | null {
  const lines = body.split('\n');
  let inRevisionHistory = false;
  for (const line of lines) {
    if (line.startsWith('## Revision History')) {
      inRevisionHistory = true;
      continue;
    }
    if (inRevisionHistory && line.startsWith('- ')) {
      // Extract timestamp: ISO or date-only
      const isoMatch = line.match(/^- (\d{4}-\d{2}-\d{2}T[\d:.]+Z):/);
      if (isoMatch) return isoMatch[1];
      const dateMatch = line.match(/^- (\d{4}-\d{2}-\d{2}):/);
      if (dateMatch) return dateMatch[1];
    }
    if (inRevisionHistory && line.startsWith('## ') && !line.startsWith('## Revision')) {
      break;
    }
  }
  return null;
}

// ── Internal Helpers ────────────────────────────────────────

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1], body: match[2] };
}

function parseFrontmatter(raw: string): PlanFrontmatter {
  const result: PlanFrontmatter = {};
  const lines = raw.split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    // List item: "  - value"
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim();
      if (!currentList) currentList = [];
      currentList.push(value);
      continue;
    }

    // Flush previous list
    if (currentKey && currentList) {
      setFrontmatterField(result, currentKey, currentList);
      currentKey = null;
      currentList = null;
    }

    // Key: value or Key: (start of list)
    const kvMatch = line.match(/^(\S[\w-]*?):\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '' || value === '[]') {
        // Start of list
        currentKey = key;
        currentList = value === '[]' ? [] : null;
      } else {
        setFrontmatterField(result, key, value);
        currentKey = null;
        currentList = null;
      }
    }
  }

  // Flush final list
  if (currentKey && currentList) {
    setFrontmatterField(result, currentKey, currentList);
  }

  return result;
}

function setFrontmatterField(fm: PlanFrontmatter, key: string, value: string | string[]): void {
  switch (key) {
    case 'parent':
      fm.parent = value as string;
      break;
    case 'root':
      fm.root = value as string;
      break;
    case 'children':
      fm.children = value as string[];
      break;
    case 'blocked-by':
      fm['blocked-by'] = value as string[];
      break;
    case 'depends-on':
      fm['depends-on'] = value as string[];
      break;
  }
}

function serializeFrontmatter(fm: PlanFrontmatter): string {
  const lines: string[] = [];
  if (fm.parent) lines.push(`parent: ${fm.parent}`);
  if (fm.root) lines.push(`root: ${fm.root}`);
  if (fm.children && fm.children.length > 0) {
    lines.push('children:');
    for (const c of fm.children) lines.push(`  - ${c}`);
  }
  if (fm['blocked-by'] && fm['blocked-by'].length > 0) {
    lines.push('blocked-by:');
    for (const b of fm['blocked-by']) lines.push(`  - ${b}`);
  }
  if (fm['depends-on'] && fm['depends-on'].length > 0) {
    lines.push('depends-on:');
    for (const d of fm['depends-on']) lines.push(`  - ${d}`);
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

function extractHeading(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) return line;
  }
  return '';
}

function extractTitle(heading: string): string {
  // Remove "# 0.3.1.5.9 " prefix and " [STATUS]" suffix
  return heading
    .replace(/^#\s+[\d.]+\s*/, '')
    .replace(/\s*\[\w+\]\s*$/, '')
    .trim();
}
