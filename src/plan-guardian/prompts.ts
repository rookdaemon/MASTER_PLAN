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

  reconcile: `ACTION: RECONCILE

Repair structural consistency between this node, its parent/children, and close peers. Focus on frontmatter correctness and pruning stale links.

You may:
- Remove stale child references that point to missing or renamed files
- Correct child parent links so parent/child reciprocity is consistent
- Merge duplicate peer tasks into one canonical node and remove redundant references
- Normalize child ordering for deterministic traversal

Output:
1. One plan-file block for the UPDATED target node
2. One plan-file block per child/peer file that must be updated for reciprocity
3. Optional delete markers for obsolete duplicate files: <!-- DELETE: plan/x.y.z-old.md -->`,

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

const AGENTIC_PREFIX = `You are the Plan Guardian running in AGENTIC mode inside Claude Code. You operate on a hierarchical plan stored as markdown files. Each file has YAML frontmatter (parent, root, children, blocked-by, depends-on) and a status in the H1 heading ([PLAN], [ARCHITECT], [IMPLEMENT], [REVIEW], [DONE]).

You have direct file-editing tools. Use them to read and modify the plan files ON DISK. Do NOT print fenced code blocks of file contents — wherever the action instructions below say to "output a plan-file block" or "artifact block", instead make the equivalent edit directly to the real file using your tools.

Perform exactly ONE planning operation this turn, then stop. Keep edits minimal and well-scoped — only touch files the operation requires.

Filename rule: the numeric ID in a card's H1 must exactly match the numeric ID prefix in its file path. Example: heading '# 0.7.3.2 Child [PLAN]' lives at path 'plan/0.7.3.2-child.md'. Use the full dotted child ID in both the heading and the path; never encode child numbering as 'parent-id-1-slug.md'.`;

const AGENTIC_OPERATIONS = `## Your job

First ASSESS this card honestly — never assume it's fine just because of its status or because its children are done. Ask:
- Is the **description** concrete and complete enough to act on?
- Are the **acceptance criteria** present, specific, and testable?
- Is the content **consistent** with its parent, siblings, and children (no contradictions, stale references, or gaps the children don't cover)?
- For a **node**: are the children the *right* decomposition, and does this card still need its own synthesis/integration (a summary tying children together, cross-references, an updated file manifest)?
- For a **leaf**: do the decisions/contracts/specs hold up, and do the referenced artifacts actually exist and meet the criteria?

Then perform the single most valuable operation to close the biggest real gap:

- **ADVANCE** — Move the H1 status one step along PLAN → ARCHITECT → IMPLEMENT → REVIEW → DONE. Do this when the card genuinely satisfies its acceptance criteria for the next phase (for a node, that includes its children being [DONE] AND its own synthesis being complete).
- **DECOMPOSE** — Only if the card is too large or abstract to implement directly, break it into 2-5 child cards (full dotted child ID in heading and path, parent/root frontmatter; add them to this card's \`children:\`). Keep status [PLAN].
- **REFINE** — If under-specified or improvable in a material way, add/sharpen the description, acceptance criteria, file manifest, or fix an inconsistency.
- **IMPLEMENT** — If [ARCHITECT]/[IMPLEMENT] and artifacts are specified, create/update those files, then advance.
- **RECONCILE** — If parent/child links are broken or stale, repair the frontmatter.

Convergence rules (important — avoid both premature DONE and endless polishing):
- Perform exactly ONE operation, then stop, and append a one-line "## Revision History" entry (operation + timestamp).
- ADVANCE decisively once the acceptance criteria for the next phase are met — do NOT keep polishing a card that already meets its criteria; advancing IS the forward progress.
- Conversely, do NOT advance (especially to [DONE]) while a *material* gap remains — fix the gap instead.
- Make NO change ONLY when the card is already [DONE] and correct, OR it fully meets its current-phase criteria and cannot advance yet (e.g. blocked). "Could be marginally nicer" is not a reason to edit — reserve edits for material gaps and genuine advancement.`;

/**
 * System prompt for agentic mode. Unlike provider mode (which executes one
 * rigidly-assigned action), the CLI agent is given the full operations menu and
 * chooses the best next operation — crucially, it can ADVANCE a card whose
 * content is already complete instead of pointlessly trying to decompose it.
 * The scheduler's suggested action is passed only as a soft hint.
 */
export function buildAgenticSystemPrompt(suggestedAction?: PlanningActionType): string {
  const hint = suggestedAction
    ? `\n\nThe scheduler's heuristic suggests "${suggestedAction}", but use your own judgment — if a different operation above fits the card's actual state better, do that instead.`
    : '';
  return `${AGENTIC_PREFIX}\n\n${AGENTIC_OPERATIONS}${hint}`;
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

  // Children (full, for reconcile/consolidate/status-update)
  if (actionType === 'reconcile' || actionType === 'consolidate' || actionType === 'status-update') {
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
