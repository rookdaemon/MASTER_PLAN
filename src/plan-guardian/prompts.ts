/**
 * Prompt Templates — System and user prompts for each planning action type.
 *
 * Pure string-returning functions. No I/O, no LLM calls.
 *
 * Domain: Plan Guardian
 */

import type { PlanFile, IPlanDAG, PlanningActionType } from './interfaces.js';

const SYSTEM_PREFIX = `You are the Plan Guardian, a relentless plan execution engine. You operate on a hierarchical plan stored as markdown files. Each file has YAML frontmatter (parent, root, children, blocked-by, depends-on) and a status in the H1 heading ([PLAN], [ARCHITECT], [IMPLEMENT], [REVIEW], [DONE]).

You perform exactly ONE planning action per call. You produce structured output that will be parsed mechanically. Follow the output format precisely.

Filename rule: for every plan-file block, the numeric ID in the H1 must exactly match the numeric ID prefix in the file path. Example: heading '# 0.7.3.2 Child [PLAN]' must be written to path 'plan/0.7.3.2-child.md'. Do not encode child numbering as 'parent-id-1-slug.md'; use the full dotted child ID in both the heading and the path.

Output plan files as fenced code blocks tagged with their file path:

\`\`\`plan-file:plan/X.Y.Z-slug.md
---
parent: plan/X.Y-parent.md
root: plan/root.md
---
# X.Y.Z Title [STATUS]
...
\`\`\`

For execution artifacts (code, config, etc.), use:

\`\`\`artifact:path/to/file.ext
content here
\`\`\`
`;

const ACTION_INSTRUCTIONS: Record<PlanningActionType, string> = {
  decompose: `ACTION: DECOMPOSE

Break the given task into 2-5 subtasks. Each subtask must be:
- More specific and narrower than the parent
- Independently completable
- Named with the next available child ID (parent ID + .N)
- Stored at a path whose numeric prefix is that exact full child ID
- Given a clear description and 3-5 acceptance criteria

Output:
1. One plan-file block per new subtask
2. One plan-file block for the UPDATED parent (with new children listed in frontmatter and status unchanged)

The subtask slug should be a short kebab-case summary of the task.`,

  research: `ACTION: RESEARCH

Create ONE information-gathering task as a child of the given node. This task should:
- Ask a specific, answerable question
- Define what "answered" looks like (acceptance criteria)
- Be completable by reading docs, code, or running experiments
- NOT require architectural decisions

Output:
1. One plan-file block for the new research subtask
2. One plan-file block for the UPDATED parent (with new child in frontmatter)`,

  refine: `ACTION: REFINE

Add detail to the given task. You may:
- Expand the description with concrete specifics
- Add or improve acceptance criteria
- Add a file manifest section listing expected artifacts
- Clarify scope boundaries (what's in vs out)

Output:
1. One plan-file block for the UPDATED task (same path, enriched content)
2. Append a revision history entry with the current timestamp`,

  consolidate: `ACTION: CONSOLIDATE

Review the children of the given task and improve the decomposition. You may:
- Merge redundant subtasks
- Reorder for better dependency flow
- Remove tasks that are no longer needed
- Add missing tasks

Output:
1. One plan-file block per modified/new child
2. One plan-file block for the UPDATED parent (with corrected children list)
3. List any files to DELETE as: <!-- DELETE: plan/x.y.z-old.md -->`,

  promote: `ACTION: PROMOTE

This leaf task meets the 7B threshold — it's simple enough for a small model to execute directly. Add an "Execution Spec" section that contains EVERYTHING a 7B model needs to produce the artifact:
- Exact file path(s) to create or modify
- Complete context (no "go read file X" — inline everything needed)
- Concrete acceptance criteria as assertions
- Expected output format

Transition the task status to [IMPLEMENT].

Output:
1. One plan-file block for the UPDATED task with the Execution Spec section added and status changed to IMPLEMENT`,

  'status-update': `ACTION: STATUS-UPDATE

Evaluate the evidence and transition this task's status. Rules:
- If all children are DONE → set this task to DONE
- If acceptance criteria are met based on child outputs → set to DONE
- If implementation is complete but needs review → set to REVIEW

Output:
1. One plan-file block for the UPDATED task with new status
2. Append a revision history entry`,

  execute: `ACTION: EXECUTE

You are a focused execution agent. The task's Execution Spec tells you exactly what to produce. Follow it precisely.

Output:
1. One artifact block per file to create/modify
2. One plan-file block for the UPDATED task with status changed to [REVIEW] and a revision history entry`,
};

export function buildSystemPrompt(actionType: PlanningActionType): string {
  return `${SYSTEM_PREFIX}\n${ACTION_INSTRUCTIONS[actionType]}`;
}

export function buildUserMessage(
  target: PlanFile,
  dag: IPlanDAG,
  actionType: PlanningActionType,
  now: string,
): string {
  const parts: string[] = [];

  // Target node (full)
  parts.push(`## Target Task\n\nPath: ${target.path}\n\n\`\`\`markdown\n${serializeForContext(target)}\n\`\`\``);

  // Ancestor chain (summarized)
  const ancestors = getAncestorChain(target, dag);
  if (ancestors.length > 0) {
    parts.push(`## Ancestor Chain\n\n${ancestors.map(a => `- **${a.numericId}** ${a.title} [${a.status}]`).join('\n')}`);
  }

  // Siblings (summarized)
  const parent = dag.parentOf(target.path);
  if (parent) {
    const siblings = dag.childrenOf(parent.path).filter(c => c.path !== target.path);
    if (siblings.length > 0) {
      parts.push(`## Siblings\n\n${siblings.map(s => `- **${s.numericId}** ${s.title} [${s.status}]`).join('\n')}`);
    }
  }

  // Children (full, for consolidate/status-update)
  if (actionType === 'consolidate' || actionType === 'status-update') {
    const children = dag.childrenOf(target.path);
    if (children.length > 0) {
      parts.push(`## Children\n\n${children.map(c => `### ${c.numericId} ${c.title} [${c.status}]\n\n${firstParagraph(c.body)}`).join('\n\n')}`);
    }
  }

  // Dependencies
  const deps = dag.dependants(target.path);
  const blockers = dag.blockers(target.path);
  const allDeps = [...deps, ...blockers];
  if (allDeps.length > 0) {
    parts.push(`## Dependencies\n\n${allDeps.map(d => `- **${d.numericId}** ${d.title} [${d.status}]`).join('\n')}`);
  }

  parts.push(`\nCurrent time: ${now}`);

  return parts.join('\n\n');
}

// ── Helpers ─────────────────────────────────────────────────

function serializeForContext(plan: PlanFile): string {
  const fmLines: string[] = [];
  if (plan.frontmatter.parent) fmLines.push(`parent: ${plan.frontmatter.parent}`);
  if (plan.frontmatter.root) fmLines.push(`root: ${plan.frontmatter.root}`);
  if (plan.frontmatter.children?.length) {
    fmLines.push('children:');
    for (const c of plan.frontmatter.children) fmLines.push(`  - ${c}`);
  }
  if (plan.frontmatter['blocked-by']?.length) {
    fmLines.push('blocked-by:');
    for (const b of plan.frontmatter['blocked-by']) fmLines.push(`  - ${b}`);
  }
  if (plan.frontmatter['depends-on']?.length) {
    fmLines.push('depends-on:');
    for (const d of plan.frontmatter['depends-on']) fmLines.push(`  - ${d}`);
  }
  return `---\n${fmLines.join('\n')}\n---\n${plan.body}`;
}

function getAncestorChain(node: PlanFile, dag: IPlanDAG): PlanFile[] {
  const chain: PlanFile[] = [];
  let current = dag.parentOf(node.path);
  while (current) {
    chain.push(current);
    current = dag.parentOf(current.path);
  }
  return chain.reverse();
}

function firstParagraph(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let started = false;
  for (const line of lines) {
    if (!started && line.trim() === '') continue;
    if (!started && line.startsWith('#')) continue;
    if (started && line.trim() === '') break;
    started = true;
    result.push(line);
  }
  return result.join('\n').slice(0, 500);
}
