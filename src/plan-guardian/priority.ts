/**
 * Priority Selection — Picks the next batch of tasks for the guardian to work on.
 *
 * Scores tasks by depth, status progression, staleness, and focus.
 * Selects independent batches using file-level write-set locking.
 *
 * Domain: Plan Guardian
 */

import type { IPlanDAG, PlanFile, PlanStatus, PlanningActionType, DispatchItem } from './interfaces.js';
import { normalizePlanPath } from './actions.js';

// ── Public API ───────────────────────────────────��──────────

export interface PrioritizedItem {
  task: PlanFile;
  actionType: PlanningActionType;
  writeSet: string[];
  score: number;
}

export function prioritize(dag: IPlanDAG, now: string): PrioritizedItem[] {
  const allNonDone = [
    ...dag.byStatus('PLAN'),
    ...dag.byStatus('ARCHITECT'),
    ...dag.byStatus('IMPLEMENT'),
    ...dag.byStatus('REVIEW'),
  ];

  if (allNonDone.length === 0) return [];

  const unblocked = allNonDone.filter(p => {
    const blockers = dag.blockers(p.path);
    return blockers.every(b => b.status === 'DONE');
  });

  // Parent-first gating: block a child only when an ancestor has no children yet
  // (i.e., it hasn't been decomposed). Once an ancestor has children it has already
  // set up the work breakdown, and its children should be free to proceed.
  const ancestorEligible = unblocked.filter(p => !hasActiveAncestor(p, dag));

  if (ancestorEligible.length === 0) {
    // Everything blocked — return shallowest as research candidate
    const sorted = [...allNonDone].sort((a, b) => a.depth - b.depth);
    const target = sorted[0];
    const parentPath = target.frontmatter.parent;
    return [{
      task: target,
      actionType: 'research' as PlanningActionType,
      writeSet: computeWriteSet('research', target.path, parentPath),
      score: 1,
    }];
  }

  // A branch node whose children are still in progress yields to its children.
  // Only schedule a branch for reconcile (lineage fix) or status-update (all done).
  const actionable = ancestorEligible.filter(p => {
    const children = dag.childrenOf(p.path);
    if (children.length === 0) return true; // leaf — always actionable
    if (children.every(c => c.status === 'DONE')) return true; // → status-update
    if (hasLineageInconsistency(p, dag)) return true; // → reconcile
    return false; // branch waiting for children — let children run
  });

  const scored = actionable.map(p => {
    const actionType = determineActionType(p, dag);
    const parentPath = dag.parentOf(p.path)?.path;
    return {
      task: p,
      actionType,
      writeSet: computeWriteSet(actionType, p.path, parentPath),
      score: priorityScore(p, dag, now),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function hasActiveAncestor(node: PlanFile, dag: IPlanDAG): boolean {
  let current = dag.parentOf(node.path);
  while (current) {
    // Only block if the ancestor is a leaf (no children yet) and not done.
    // A branch that already has children has been decomposed — its children can proceed.
    if (current.status !== 'DONE' && dag.childrenOf(current.path).length === 0) {
      return true;
    }
    current = dag.parentOf(current.path);
  }
  return false;
}

export function selectIndependentBatch(
  candidates: PrioritizedItem[],
  concurrency: number,
): DispatchItem[] {
  const batch: DispatchItem[] = [];
  const lockedPaths = new Set<string>();

  for (const candidate of candidates) {
    if (batch.length >= concurrency) break;

    const hasConflict = candidate.writeSet.some(p => lockedPaths.has(p));
    if (hasConflict) continue;

    for (const p of candidate.writeSet) lockedPaths.add(p);
    batch.push({
      task: candidate.task,
      actionType: candidate.actionType,
      writeSet: candidate.writeSet,
    });
  }

  return batch;
}

export function determineActionType(node: PlanFile, dag: IPlanDAG): PlanningActionType {
  const children = dag.childrenOf(node.path);

  // Branch with children: check if all are DONE → status-update
  if (children.length > 0) {
    const allDone = children.every(c => c.status === 'DONE');
    if (allDone) return 'status-update';
    if (hasLineageInconsistency(node, dag)) return 'reconcile';
    // Branch with undone children — let children be worked on instead
    // But if this branch node is itself in PLAN, it might need consolidation
    return 'consolidate';
  }

  // Leaf nodes
  switch (node.status) {
    case 'PLAN':
      return 'decompose';
    case 'ARCHITECT':
      return 'refine';
    case 'IMPLEMENT':
      return 'promote';
    case 'REVIEW':
      return 'status-update';
    default:
      return 'decompose';
  }
}

export function computeWriteSet(
  actionType: PlanningActionType,
  targetPath: string,
  parentPath?: string,
): string[] {
  switch (actionType) {
    case 'decompose':
    case 'research':
      // Writes: target (may update it) + parent (update children list)
      // New child files are not yet known but won't conflict since they don't exist
      return parentPath ? [targetPath, parentPath] : [targetPath];
    case 'consolidate':
    case 'reconcile':
      // Writes: target + parent (conservative — may touch siblings)
      return parentPath ? [targetPath, parentPath] : [targetPath];
    case 'refine':
    case 'promote':
    case 'status-update':
    case 'execute':
      return [targetPath];
    default:
      return [targetPath];
  }
}

function hasLineageInconsistency(node: PlanFile, dag: IPlanDAG): boolean {
  const children = node.frontmatter.children ?? [];
  for (const raw of children) {
    const childPath = normalizePlanPath(raw);
    const child = dag.nodes.get(childPath);
    if (!child) return true;

    const childParent = child.frontmatter.parent ? normalizePlanPath(child.frontmatter.parent) : null;
    if (childParent !== node.path) return true;
  }
  return false;
}

// ── Internal ────────────────────────────────────────────────

const STATUS_SCORE: Record<PlanStatus, number> = {
  REVIEW: 40,
  IMPLEMENT: 30,
  ARCHITECT: 20,
  PLAN: 10,
  DONE: 0,
};

function priorityScore(p: PlanFile, dag: IPlanDAG, now: string): number {
  let score = 0;

  // 1. Breadth-first: shallower tasks score higher
  score -= p.depth * 10;

  // 2. Leaves get a bonus (they need decomposition or promotion)
  if (p.isLeaf) score += 50;

  // 3. Focus: fewer incomplete siblings = higher priority
  const parent = dag.parentOf(p.path);
  if (parent) {
    const siblings = dag.childrenOf(parent.path);
    const incomplete = siblings.filter(s => s.status !== 'DONE').length;
    score += (10 - Math.min(incomplete, 10)) * 5;
  }

  // 4. Staleness bonus
  if (p.lastRevision) {
    const hoursSince = (Date.parse(now) - Date.parse(p.lastRevision)) / 3_600_000;
    if (hoursSince > 24) score += Math.min(hoursSince, 168) * 0.5;
  }

  // 5. Status progression
  score += STATUS_SCORE[p.status];

  return score;
}
