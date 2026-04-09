/**
 * Action Output Parser
 *
 * Parses LLM output into PlanningAction structs by extracting
 * fenced `plan-file:` and `artifact:` blocks.
 *
 * Domain: Plan Guardian
 */

import type { PlanningAction, PlanningActionType, FileWrite } from './interfaces.js';

export function normalizePlanPath(path: string): string {
  const p = path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (p.startsWith('plan/')) return p;
  if (/^\d+(\.\d+)*-/.test(p) || p === 'root.md') return `plan/${p}`;
  return p;
}

const PLAN_FILE_RE = /```plan-file:([^\n]+)\n([\s\S]*?)```/g;
const ARTIFACT_RE = /```artifact:([^\n]+)\n([\s\S]*?)```/g;
const DELETE_RE = /<!-- DELETE: ([^\s]+) -->/g;

const VALID_STATUSES = new Set(['PLAN', 'ARCHITECT', 'IMPLEMENT', 'REVIEW', 'DONE']);

/**
 * Structural validator for raw LLM output.
 *
 * Checks every `plan-file:` block for:
 * - `root:` frontmatter field presence
 * - `parent:` frontmatter field presence (all non-root nodes)
 * - H1 heading with a valid `[STATUS]` tag
 * - H1 numeric ID matching the filename numeric prefix
 *
 * Returns a list of human-readable violation strings suitable for
 * feeding back into the repair prompt.
 */
export function validateOutputBlocks(text: string): string[] {
  const violations: string[] = [];
  const re = /```plan-file:([^\n]+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const rawPath = match[1].trim();
    const content = match[2];
    const normalizedPath = normalizePlanPath(rawPath);
    const filename = normalizedPath.split('/').pop() ?? '';
    const isRoot = filename === 'root.md';

    // Required frontmatter fields
    if (!content.includes('root:')) {
      violations.push(`plan-file:${rawPath}: missing required frontmatter field "root:"`);
    }
    if (!isRoot && !content.includes('parent:')) {
      violations.push(`plan-file:${rawPath}: missing required frontmatter field "parent:"`);
    }

    // H1 heading with valid [STATUS] tag
    const h1Match = content.match(/^#\s+([\d.]+)\s+.*\[(\w+)\]\s*$/m);
    if (!h1Match) {
      violations.push(`plan-file:${rawPath}: H1 heading missing or has no [STATUS] tag`);
    } else {
      const headingStatus = h1Match[2];
      if (!VALID_STATUSES.has(headingStatus)) {
        violations.push(
          `plan-file:${rawPath}: H1 has unknown status "[${headingStatus}]"; must be one of [${[...VALID_STATUSES].join('|')}]`,
        );
      }

      // Numeric ID in heading must match filename prefix
      const pathIdMatch = filename.match(/^([\d.]+)/);
      const pathId = pathIdMatch?.[1]?.replace(/\.$/, '') ?? null;
      const headingId = h1Match[1].replace(/\.$/, '');
      if (pathId && headingId !== pathId) {
        violations.push(
          `plan-file:${rawPath}: H1 numeric id "${headingId}" does not match filename id "${pathId}"`,
        );
      }
    }
  }

  return violations;
}

export function parseActionOutput(
  llmOutput: string,
  actionType: PlanningActionType,
  targetPath: string,
  now: string,
): PlanningAction {
  const planFiles = extractBlocks(llmOutput, PLAN_FILE_RE);
  const artifacts = extractBlocks(llmOutput, ARTIFACT_RE);
  const deletes = extractDeletes(llmOutput);

  if (planFiles.length === 0 && artifacts.length === 0) {
    throw new Error(`No plan-file or artifact blocks found in LLM output for ${actionType} on ${targetPath}`);
  }

  const filesCreated: FileWrite[] = [];
  const filesModified: FileWrite[] = [];

  for (const pf of planFiles) {
    if (pf.path === targetPath) {
      filesModified.push(pf);
    } else {
      // Could be a new file or a sibling update
      // For decompose/research: new children are created
      // For consolidate: existing children may be modified
      filesCreated.push(pf);
    }
  }

  for (const art of artifacts) {
    filesCreated.push(art);
  }

  const writeSet = new Set<string>();
  for (const f of filesCreated) writeSet.add(f.path);
  for (const f of filesModified) writeSet.add(f.path);
  for (const d of deletes) writeSet.add(d);

  const summary = buildSummary(actionType, targetPath, planFiles, artifacts);

  return {
    type: actionType,
    targetPath,
    summary,
    filesCreated,
    filesModified,
    writeSet: [...writeSet],
  };
}

// ── Helpers ─────────────────────────────────────────────────

function extractBlocks(text: string, regex: RegExp): FileWrite[] {
  const blocks: FileWrite[] = [];
  let match: RegExpExecArray | null;
  // Reset regex state
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      path: normalizePlanPath(match[1].trim()),
      content: match[2],
    });
  }
  return blocks;
}

function extractDeletes(text: string): string[] {
  const deletes: string[] = [];
  let match: RegExpExecArray | null;
  DELETE_RE.lastIndex = 0;
  while ((match = DELETE_RE.exec(text)) !== null) {
    deletes.push(normalizePlanPath(match[1].trim()));
  }
  return deletes;
}

function buildSummary(
  actionType: PlanningActionType,
  targetPath: string,
  planFiles: FileWrite[],
  artifacts: FileWrite[],
): string {
  const shortTarget = targetPath.split('/').pop()?.replace('.md', '') ?? targetPath;

  switch (actionType) {
    case 'decompose':
      return `${shortTarget} → ${planFiles.length - 1} subtasks`;
    case 'research':
      return `research task for ${shortTarget}`;
    case 'refine':
      return `refined ${shortTarget}`;
    case 'reconcile':
      return `reconciled lineage around ${shortTarget}`;
    case 'consolidate':
      return `consolidated children of ${shortTarget}`;
    case 'promote':
      return `promoted ${shortTarget} to 7B-ready`;
    case 'status-update':
      return `status update on ${shortTarget}`;
    case 'execute':
      return `executed ${shortTarget} → ${artifacts.length} artifact(s)`;
    default:
      return `${actionType} on ${shortTarget}`;
  }
}
