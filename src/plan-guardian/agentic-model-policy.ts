/**
 * Agentic model/effort policy — picks which model + effort to spend on a card.
 *
 * Pure function of the parsed card and the heuristic action (no I/O), so the
 * routing is fully testable and config-overridable. The principle: match Opus +
 * high effort to genuine judgment (structuring subtrees, design decisions,
 * verification) and drop to Sonnet/Haiku + low effort for mechanical work.
 *
 * Domain: Plan Guardian (agentic mode)
 */

import type { PlanFile, PlanningActionType } from './interfaces.js';

export type ModelTier = 'haiku' | 'sonnet' | 'opus';
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelEffort {
  /** A `--model` alias the Claude CLI accepts. */
  model: ModelTier;
  /** A `--effort` level the Claude CLI accepts. */
  effort: EffortLevel;
}

/** Optional bounds to shift the whole policy cheaper or stronger without code. */
export interface ModelPolicyBounds {
  /** Never route below this tier (force quality). Default 'haiku'. */
  modelFloor?: ModelTier;
  /** Never route above this tier (cost cap). Default 'opus'. */
  modelCeiling?: ModelTier;
  /** Never spend more than this effort. Default 'max'. */
  effortCeiling?: EffortLevel;
}

const MODEL_RANK: Record<ModelTier, number> = { haiku: 0, sonnet: 1, opus: 2 };
const MODEL_BY_RANK: ModelTier[] = ['haiku', 'sonnet', 'opus'];
const EFFORT_RANK: Record<EffortLevel, number> = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 };
const EFFORT_BY_RANK: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Base routing by operation — the strongest single signal of cognitive load. */
const BASE: Record<PlanningActionType, ModelEffort> = {
  decompose: { model: 'opus', effort: 'high' },
  reconcile: { model: 'opus', effort: 'high' },
  consolidate: { model: 'opus', effort: 'high' },
  research: { model: 'sonnet', effort: 'medium' },
  refine: { model: 'sonnet', effort: 'medium' },
  promote: { model: 'sonnet', effort: 'medium' },
  execute: { model: 'sonnet', effort: 'high' },
  'status-update': { model: 'haiku', effort: 'low' },
};

const LIGHT_ACTIONS = new Set<PlanningActionType>(['refine', 'promote', 'status-update', 'research']);
const HEAVY_ACTIONS = new Set<PlanningActionType>(['decompose', 'reconcile', 'consolidate', 'execute']);

const SHALLOW_DEPTH = 2; // near the root: mistakes cascade
const DEEP_DEPTH = 6; // narrow leaves: mechanical
const COMPLEX_BODY_CHARS = 4000;
const COMPLEX_CRITERIA = 8;

export function selectModelEffort(
  card: PlanFile,
  action: PlanningActionType,
  bounds: ModelPolicyBounds = {},
): ModelEffort {
  let model = BASE[action].model;
  let effort = BASE[action].effort;

  // Phase floor: ARCHITECT (design) and REVIEW (verification) are judgment-heavy
  // regardless of the heuristic action assigned.
  if (card.status === 'ARCHITECT' || card.status === 'REVIEW') {
    model = strongerModel(model, 'opus');
    effort = strongerEffort(effort, 'high');
  }

  // Shallow decompose is the highest-leverage structural decision.
  if (action === 'decompose' && card.depth <= SHALLOW_DEPTH) {
    model = 'opus';
    effort = strongerEffort(effort, 'xhigh');
  }

  // Deep + light work is mechanical: spend less.
  if (card.depth >= DEEP_DEPTH && LIGHT_ACTIONS.has(action)) {
    model = weakerModel(model);
    effort = 'low';
  }

  // Content-heavy cards on heavy actions: there is more to get right.
  if (HEAVY_ACTIONS.has(action) && isComplex(card)) {
    effort = bumpEffort(effort, 1);
  }

  // Apply configured bounds last.
  model = clampModel(model, bounds.modelFloor, bounds.modelCeiling);
  if (bounds.effortCeiling) effort = weakerEffort(effort, bounds.effortCeiling);

  return { model, effort };
}

function isComplex(card: PlanFile): boolean {
  if (card.body.length >= COMPLEX_BODY_CHARS) return true;
  const bullets = card.body.match(/^[ \t]*[-*]\s+/gm)?.length ?? 0;
  return bullets >= COMPLEX_CRITERIA;
}

function strongerModel(a: ModelTier, b: ModelTier): ModelTier {
  return MODEL_RANK[a] >= MODEL_RANK[b] ? a : b;
}
function weakerModel(a: ModelTier): ModelTier {
  return MODEL_BY_RANK[Math.max(0, MODEL_RANK[a] - 1)];
}
function strongerEffort(a: EffortLevel, b: EffortLevel): EffortLevel {
  return EFFORT_RANK[a] >= EFFORT_RANK[b] ? a : b;
}
function weakerEffort(a: EffortLevel, b: EffortLevel): EffortLevel {
  return EFFORT_RANK[a] <= EFFORT_RANK[b] ? a : b;
}
function bumpEffort(a: EffortLevel, by: number): EffortLevel {
  return EFFORT_BY_RANK[Math.min(EFFORT_BY_RANK.length - 1, EFFORT_RANK[a] + by)];
}
function clampModel(m: ModelTier, floor?: ModelTier, ceiling?: ModelTier): ModelTier {
  let r = MODEL_RANK[m];
  if (floor) r = Math.max(r, MODEL_RANK[floor]);
  if (ceiling) r = Math.min(r, MODEL_RANK[ceiling]);
  return MODEL_BY_RANK[r];
}
