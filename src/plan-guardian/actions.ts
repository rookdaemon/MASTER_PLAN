/**
 * Action Output Parser
 *
 * Parses LLM output into PlanningAction structs by extracting
 * fenced `plan-file:` and `artifact:` blocks.
 *
 * Domain: Plan Guardian
 */

import type { PlanningAction, PlanningActionType, FileWrite } from './interfaces.js';

const PLAN_FILE_RE = /```plan-file:([^\n]+)\n([\s\S]*?)```/g;
const ARTIFACT_RE = /```artifact:([^\n]+)\n([\s\S]*?)```/g;
const DELETE_RE = /<!-- DELETE: ([^\s]+) -->/g;

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
      path: match[1].trim(),
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
    deletes.push(match[1].trim());
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
