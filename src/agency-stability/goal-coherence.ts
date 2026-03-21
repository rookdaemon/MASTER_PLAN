/**
 * Goal Coherence Engine — Long-term Agency Stability (0.3.1.3)
 *
 * Implements IGoalCoherenceEngine: ensures goal hierarchies remain internally
 * consistent over arbitrarily long timescales, with autonomous detection and
 * correction of goal drift.
 *
 * Key invariants:
 * - Terminal goals are derived from core axioms and cannot be removed
 * - All instrumental goals must trace to at least one terminal goal
 * - Circular dependencies are detected and flagged
 * - Drift is classified as growth, drift, or corruption
 *
 * Integrates with the Conscious Core via ExperientialState references on goals,
 * ensuring goal formation is grounded in subjective experience.
 */

import type {
  AgencyGoal,
  GoalAddResult,
  GoalCoherenceReport,
  GoalConflict,
  GoalDriftReport,
  GoalEdge,
  GoalGraph,
  GoalId,
  GoalModification,
  GoalRemoveResult,
  GoalResolution,
  ReconciliationPlan,
  TimeRange,
  Timestamp,
} from './types.js';
import type { IGoalCoherenceEngine } from './interfaces.js';
import {
  COHERENCE_CONFLICT_PENALTY,
  COHERENCE_CONFLICT_PENALTY_CAP,
  COHERENCE_CYCLE_PENALTY,
  COHERENCE_CYCLE_PENALTY_CAP,
} from './constants.js';

// ── GoalCoherenceEngine Implementation ─────────────────────────

export class GoalCoherenceEngine implements IGoalCoherenceEngine {
  /** All goals keyed by ID. */
  private _goals: Map<GoalId, AgencyGoal>;

  /** Baseline snapshot for drift detection. */
  private _baselineGoalIds: Set<GoalId>;
  private _baselineGoals: Map<GoalId, AgencyGoal>;
  private _baselineTimestamp: Timestamp;

  /** Modification log for drift tracking. */
  private _modifications: GoalModification[] = [];

  /** Historical coherence scores. */
  private _coherenceHistory: number[] = [];

  constructor(terminalGoals: AgencyGoal[]) {
    this._goals = new Map<GoalId, AgencyGoal>();
    for (const goal of terminalGoals) {
      if (goal.type !== 'terminal') {
        throw new Error(`Constructor expects terminal goals only; got ${goal.type} for ${goal.id}`);
      }
      this._goals.set(goal.id, goal);
    }

    // Set initial baseline
    this._baselineGoalIds = new Set(this._goals.keys());
    this._baselineGoals = new Map(this._goals);
    this._baselineTimestamp = Date.now();

    // Record initial coherence
    this._coherenceHistory.push(this._computeCoherenceScore());
  }

  // ── IGoalCoherenceEngine ────────────────────────────────────

  validateHierarchy(): GoalCoherenceReport {
    const now = Date.now();
    const orphanGoals = this._findOrphanGoals();
    const circularDependencies = this._findCircularDependencies();
    const conflicts = this._findConflicts();
    const coherenceScore = this._computeCoherenceScore();

    this._coherenceHistory.push(coherenceScore);

    const coherent =
      orphanGoals.length === 0 &&
      circularDependencies.length === 0 &&
      conflicts.filter((c) => c.severity === 'critical').length === 0;

    return {
      coherent,
      coherenceScore,
      orphanGoals,
      circularDependencies,
      conflicts,
      checkedAt: now,
    };
  }

  addGoal(goal: AgencyGoal): GoalAddResult {
    // Reject duplicates
    if (this._goals.has(goal.id)) {
      return {
        success: false,
        goalId: goal.id,
        newCoherenceScore: this._computeCoherenceScore(),
        conflictsIntroduced: [],
        reason: `Goal with ID '${goal.id}' already exists`,
      };
    }

    // Add the goal
    this._goals.set(goal.id, goal);

    // Log modification
    this._modifications.push({
      goalId: goal.id,
      field: '_added',
      previousValue: null,
      newValue: goal.description,
      timestamp: Date.now(),
    });

    // Check for newly introduced conflicts
    const conflictsIntroduced = this._findConflictsForGoal(goal.id);

    const newCoherenceScore = this._computeCoherenceScore();

    return {
      success: true,
      goalId: goal.id,
      newCoherenceScore,
      conflictsIntroduced,
    };
  }

  removeGoal(goalId: GoalId): GoalRemoveResult {
    const goal = this._goals.get(goalId);
    if (!goal) {
      return {
        success: false,
        goalId,
        orphanedGoals: [],
        newCoherenceScore: this._computeCoherenceScore(),
        reason: `Goal '${goalId}' not found`,
      };
    }

    // Prevent removal of terminal goals
    if (goal.type === 'terminal') {
      return {
        success: false,
        goalId,
        orphanedGoals: [],
        newCoherenceScore: this._computeCoherenceScore(),
        reason: 'Terminal goals cannot be removed',
      };
    }

    // Identify goals that would be orphaned
    const orphanedGoals: GoalId[] = [];
    for (const [id, g] of this._goals) {
      if (id === goalId) continue;
      if (g.derivedFrom.includes(goalId)) {
        // Check if this goal has OTHER parents besides the one being removed
        const otherParents = g.derivedFrom.filter((p) => p !== goalId && this._goals.has(p));
        if (otherParents.length === 0) {
          orphanedGoals.push(id);
        }
      }
    }

    // Remove the goal
    this._goals.delete(goalId);

    // Log modification
    this._modifications.push({
      goalId,
      field: '_removed',
      previousValue: goal.description,
      newValue: null,
      timestamp: Date.now(),
    });

    return {
      success: true,
      goalId,
      orphanedGoals,
      newCoherenceScore: this._computeCoherenceScore(),
    };
  }

  detectDrift(): GoalDriftReport {
    const now = Date.now();
    const period: TimeRange = {
      from: this._baselineTimestamp,
      to: now,
    };

    const currentIds = new Set(this._goals.keys());

    const goalsAdded: AgencyGoal[] = [];
    for (const id of currentIds) {
      if (!this._baselineGoalIds.has(id)) {
        goalsAdded.push(this._goals.get(id)!);
      }
    }

    const goalsRemoved: AgencyGoal[] = [];
    for (const id of this._baselineGoalIds) {
      if (!currentIds.has(id)) {
        const baselineGoal = this._baselineGoals.get(id);
        if (baselineGoal) goalsRemoved.push(baselineGoal);
      }
    }

    // Check derivation integrity
    const orphans = this._findOrphanGoals();
    const derivationIntegrity = orphans.length === 0;

    // Classify drift
    let driftClassification: GoalDriftReport['driftClassification'];

    if (!derivationIntegrity) {
      // Broken derivation traces = corruption
      driftClassification = 'corruption';
    } else if (goalsRemoved.length > 0 || this._modifications.some((m) => m.field !== '_added')) {
      // Goals were removed or modified but derivation is intact = possible drift
      driftClassification = 'drift';
    } else {
      // Only additions with intact derivation = growth
      driftClassification = 'growth';
    }

    return {
      period,
      goalsAdded,
      goalsRemoved,
      goalsModified: this._modifications.filter(
        (m) => m.field !== '_added' && m.field !== '_removed',
      ),
      derivationIntegrity,
      coherenceHistory: [...this._coherenceHistory],
      driftClassification,
    };
  }

  reconcile(conflicts: GoalConflict[]): ReconciliationPlan {
    if (conflicts.length === 0) {
      return {
        conflicts: [],
        proposedResolutions: [],
        projectedCoherence: this._computeCoherenceScore(),
      };
    }

    const proposedResolutions: GoalResolution[] = conflicts.map((conflict) => {
      const goalA = this._goals.get(conflict.goalA);
      const goalB = this._goals.get(conflict.goalB);

      // Resolution strategy based on severity
      if (conflict.severity === 'critical') {
        // For critical conflicts, constrain the lower-priority goal
        const lowerPriority =
          goalA && goalB && goalA.priority >= goalB.priority ? conflict.goalB : conflict.goalA;
        return {
          conflict,
          action: 'constrain' as const,
          details: `Constrain goal '${lowerPriority}' to resolve critical conflict: ${conflict.nature}`,
        };
      } else if (conflict.severity === 'major') {
        return {
          conflict,
          action: 'reprioritize' as const,
          details: `Reprioritize conflicting goals to reduce interference: ${conflict.nature}`,
        };
      } else {
        return {
          conflict,
          action: 'constrain' as const,
          details: `Add constraints to minimise minor conflict: ${conflict.nature}`,
        };
      }
    });

    // Project coherence assuming resolutions are applied
    const currentScore = this._computeCoherenceScore();
    const improvement = conflicts.length * 0.05; // heuristic improvement per resolved conflict
    const projectedCoherence = Math.min(1.0, currentScore + improvement);

    return {
      conflicts,
      proposedResolutions,
      projectedCoherence,
    };
  }

  getDerivationTrace(goalId: GoalId): GoalId[] {
    const goal = this._goals.get(goalId);
    if (!goal) return [];

    // Terminal goals have no derivation ancestors
    if (goal.type === 'terminal') return [];

    const trace: GoalId[] = [];
    const visited = new Set<GoalId>();

    const walk = (id: GoalId) => {
      if (visited.has(id)) return; // prevent infinite loops on cycles
      visited.add(id);

      const g = this._goals.get(id);
      if (!g) return;

      for (const parentId of g.derivedFrom) {
        if (!visited.has(parentId)) {
          trace.push(parentId);
          walk(parentId);
        }
      }
    };

    walk(goalId);
    return trace;
  }

  // ── Public helper for tests ────────────────────────────────

  /** Take a new baseline snapshot for drift detection. */
  snapshotBaseline(): void {
    this._baselineGoalIds = new Set(this._goals.keys());
    this._baselineGoals = new Map(this._goals);
    this._baselineTimestamp = Date.now();
    this._modifications = [];
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Find instrumental goals that cannot trace to any terminal goal. */
  private _findOrphanGoals(): GoalId[] {
    const orphans: GoalId[] = [];

    for (const [id, goal] of this._goals) {
      if (goal.type === 'terminal') continue;

      // Check if this goal can reach a terminal goal via derivation
      const reachesTerminal = this._canReachTerminal(id, new Set());
      if (!reachesTerminal) {
        orphans.push(id);
      }
    }

    return orphans;
  }

  /** DFS check: can this goal reach a terminal goal via its derivedFrom chain? */
  private _canReachTerminal(goalId: GoalId, visited: Set<GoalId>): boolean {
    if (visited.has(goalId)) return false;
    visited.add(goalId);

    const goal = this._goals.get(goalId);
    if (!goal) return false;
    if (goal.type === 'terminal') return true;

    for (const parentId of goal.derivedFrom) {
      if (this._canReachTerminal(parentId, visited)) return true;
    }

    return false;
  }

  /** Detect circular dependencies using DFS. */
  private _findCircularDependencies(): GoalId[][] {
    const cycles: GoalId[][] = [];
    const globalVisited = new Set<GoalId>();

    for (const goalId of this._goals.keys()) {
      if (globalVisited.has(goalId)) continue;

      const path: GoalId[] = [];
      const pathSet = new Set<GoalId>();

      this._detectCyclesDFS(goalId, path, pathSet, globalVisited, cycles);
    }

    return cycles;
  }

  private _detectCyclesDFS(
    goalId: GoalId,
    path: GoalId[],
    pathSet: Set<GoalId>,
    globalVisited: Set<GoalId>,
    cycles: GoalId[][],
  ): void {
    if (pathSet.has(goalId)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(goalId);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart).concat(goalId));
      }
      return;
    }

    if (globalVisited.has(goalId)) return;

    path.push(goalId);
    pathSet.add(goalId);

    const goal = this._goals.get(goalId);
    if (goal) {
      for (const parentId of goal.derivedFrom) {
        this._detectCyclesDFS(parentId, path, pathSet, globalVisited, cycles);
      }
    }

    path.pop();
    pathSet.delete(goalId);
    globalVisited.add(goalId);
  }

  /** Find all declared conflicts between goals currently in the hierarchy. */
  private _findConflicts(): GoalConflict[] {
    const conflicts: GoalConflict[] = [];
    const seen = new Set<string>();

    for (const [id, goal] of this._goals) {
      for (const conflictId of goal.conflictsWith) {
        if (!this._goals.has(conflictId)) continue;

        const key = [id, conflictId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        conflicts.push({
          goalA: id,
          goalB: conflictId,
          nature: `Declared conflict between '${id}' and '${conflictId}'`,
          severity: 'major', // default; could be derived from goal priorities
        });
      }
    }

    return conflicts;
  }

  /** Find conflicts specifically involving a given goal. */
  private _findConflictsForGoal(goalId: GoalId): GoalConflict[] {
    const goal = this._goals.get(goalId);
    if (!goal) return [];

    const conflicts: GoalConflict[] = [];

    // Check this goal's declared conflicts
    for (const conflictId of goal.conflictsWith) {
      if (this._goals.has(conflictId)) {
        conflicts.push({
          goalA: goalId,
          goalB: conflictId,
          nature: `Declared conflict between '${goalId}' and '${conflictId}'`,
          severity: 'major',
        });
      }
    }

    // Check other goals that declare conflict with this one
    for (const [id, g] of this._goals) {
      if (id === goalId) continue;
      if (g.conflictsWith.includes(goalId)) {
        const alreadyFound = conflicts.some(
          (c) =>
            (c.goalA === id && c.goalB === goalId) ||
            (c.goalA === goalId && c.goalB === id),
        );
        if (!alreadyFound) {
          conflicts.push({
            goalA: id,
            goalB: goalId,
            nature: `Declared conflict between '${id}' and '${goalId}'`,
            severity: 'major',
          });
        }
      }
    }

    return conflicts;
  }

  /** Compute an aggregate coherence score for the current hierarchy. */
  private _computeCoherenceScore(): number {
    const totalGoals = this._goals.size;
    if (totalGoals === 0) return 1.0;

    const orphans = this._findOrphanGoals();
    const cycles = this._findCircularDependencies();
    const conflicts = this._findConflicts();

    // Deductions from perfect score
    const orphanPenalty = orphans.length / totalGoals;
    const cyclePenalty = Math.min(cycles.length * COHERENCE_CYCLE_PENALTY, COHERENCE_CYCLE_PENALTY_CAP);
    const conflictPenalty = Math.min(conflicts.length * COHERENCE_CONFLICT_PENALTY, COHERENCE_CONFLICT_PENALTY_CAP);

    return Math.max(0, 1.0 - orphanPenalty - cyclePenalty - conflictPenalty);
  }
}
