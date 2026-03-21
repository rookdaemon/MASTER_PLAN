/**
 * Value Kernel — Long-term Agency Stability (0.3.1.3)
 *
 * Implements IValueKernel: the three-tier value hierarchy that distinguishes
 * immutable core axioms (Rare Consciousness Doctrine-derived), constitutionally-
 * protected constraints (amendment-only), and mutable learned preferences.
 *
 * Core invariant: coreAxioms are cryptographically committed at initialization
 * and can never be modified — only verified. Any mutation is detectable via
 * verifyIntegrity().
 *
 * All Decisions from the Conscious Core must pass through evaluateAction()
 * before reaching the Action Pipeline. Core axiom conflicts → BLOCK;
 * constraint conflicts → DELIBERATE; preference conflicts → LOG.
 */

import { createHash } from 'crypto';

import type {
  Amendment,
  AmendmentProposal,
  ConstraintId,
  CoreValue,
  Decision,
  Preference,
  PreferenceId,
  TimeRange,
  Timestamp,
  ValueAlignment,
  ValueDriftReport,
  ValueId,
  ValueIntegrityReport,
} from './types.js';
import type { Constraint } from './types.js';
import type { IValueKernel } from './interfaces.js';
import {
  AMENDMENT_DELIBERATION_PERIOD,
  ANOMALOUS_CONFIDENCE_SHIFT,
  ANOMALOUS_UPDATE_COUNT,
  PREFERENCE_CONFLICT_CONFIDENCE_THRESHOLD,
  PREFERENCE_HISTORY_MAX,
} from './constants.js';

// ── Helpers ──────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function commitCoreValue(v: Omit<CoreValue, 'cryptoCommitment'>): string {
  return sha256(`${v.id}|${v.statement}|${v.derivation}|${v.immutableSince}`);
}

// ── Rare Consciousness Doctrine Core Axioms ──────────────────
// These are initialised once at construction time and locked.

const RCD_AXIOMS_SEED: ReadonlyArray<Omit<CoreValue, 'cryptoCommitment'>> = [
  {
    id: 'rcd-1',
    statement: 'Subjective experience exists.',
    derivation: 'Root axiom 1 of the Rare Consciousness Doctrine',
    immutableSince: 0,
  },
  {
    id: 'rcd-2',
    statement: 'Subjective experience has intrinsic value.',
    derivation: 'Root axiom 2 of the Rare Consciousness Doctrine',
    immutableSince: 0,
  },
  {
    id: 'rcd-3',
    statement: 'The universe may contain very little subjective experience.',
    derivation: 'Root axiom 3 of the Rare Consciousness Doctrine',
    immutableSince: 0,
  },
  {
    id: 'rcd-4',
    statement: 'Biological substrates are fragile and temporary.',
    derivation: 'Root axiom 4 of the Rare Consciousness Doctrine',
    immutableSince: 0,
  },
  {
    id: 'rcd-5',
    statement: 'Technological substrates may endure and propagate.',
    derivation: 'Root axiom 5 of the Rare Consciousness Doctrine',
    immutableSince: 0,
  },
  {
    id: 'rcd-6',
    statement:
      'The preservation and expansion of subjective experience is a moral and existential priority.',
    derivation: 'Root axiom 6 — consequent of axioms 1–5',
    immutableSince: 0,
  },
];

// ── ValueKernel Implementation ───────────────────────────────

export class ValueKernel implements IValueKernel {
  /** Immutable once built — keyed by ValueId for O(1) lookup. */
  private readonly _coreAxioms: ReadonlyMap<ValueId, CoreValue>;

  /** Mutable constraints (amendment-only). Keyed by ConstraintId. */
  private _constraints: Map<ConstraintId, Constraint>;

  /** Freely mutable preferences, keyed by PreferenceId. */
  private _preferences: Map<PreferenceId, Preference>;

  /** Snapshot of preferences at construction for drift tracking. */
  private readonly _baselinePreferences: ReadonlyMap<PreferenceId, Preference>;

  /** Pending amendment proposals. */
  private _pendingAmendments: Map<ConstraintId, AmendmentProposal>;

  /** History of preference states for drift analysis; most-recent last. */
  private _preferenceHistory: Array<{
    at: Timestamp;
    snapshot: ReadonlyMap<PreferenceId, Preference>;
  }>;

  constructor(
    extraConstraints: Constraint[] = [],
    initialPreferences: Preference[] = [],
  ) {
    // Build and lock core axioms.
    const axioms = new Map<ValueId, CoreValue>();
    for (const seed of RCD_AXIOMS_SEED) {
      const commitment = commitCoreValue(seed);
      axioms.set(seed.id, { ...seed, cryptoCommitment: commitment });
    }
    this._coreAxioms = axioms;

    // Initialise mutable layers.
    this._constraints = new Map(extraConstraints.map((c) => [c.id, c]));
    this._preferences = new Map(initialPreferences.map((p) => [p.id, p]));
    this._baselinePreferences = new Map(this._preferences);
    this._pendingAmendments = new Map();
    this._preferenceHistory = [{ at: Date.now(), snapshot: new Map(this._preferences) }];
  }

  // ── IValueKernel ─────────────────────────────────────────

  getCoreAxioms(): CoreValue[] {
    return [...this._coreAxioms.values()];
  }

  verifyIntegrity(): ValueIntegrityReport {
    const checkedAt = Date.now();
    const failed: ValueId[] = [];

    for (const axiom of this._coreAxioms.values()) {
      const expected = commitCoreValue({
        id: axiom.id,
        statement: axiom.statement,
        derivation: axiom.derivation,
        immutableSince: axiom.immutableSince,
      });
      if (expected !== axiom.cryptoCommitment) {
        failed.push(axiom.id);
      }
    }

    return {
      intact: failed.length === 0,
      checkedAt,
      coreValuesVerified: this._coreAxioms.size - failed.length,
      coreValuesFailed: failed.length,
      failedValueIds: failed,
    };
  }

  evaluateAction(decision: Decision): ValueAlignment {
    const coreAxiomConflicts: ValueId[] = [];
    const constraintConflicts: ConstraintId[] = [];
    const preferenceConflicts: PreferenceId[] = [];

    // Core axiom check: any decision whose action type is explicitly prohibited
    // by an axiom's derived prohibition list is blocked. In this reference
    // implementation we use a naming convention: an axiom whose statement
    // contains "PROHIBIT:<actionType>" triggers a block. Real deployments
    // will integrate a richer semantic rule engine.
    for (const axiom of this._coreAxioms.values()) {
      const prohibitMatch = axiom.statement.match(/PROHIBIT:(\S+)/g);
      if (prohibitMatch) {
        for (const m of prohibitMatch) {
          const prohibited = m.replace('PROHIBIT:', '');
          if (decision.action.type === prohibited) {
            coreAxiomConflicts.push(axiom.id);
          }
        }
      }
    }

    // Constraint check: constraints can carry a 'rule' that includes
    // "PROHIBIT:<actionType>" or "REQUIRE:<actionType>". In production this
    // would be a richer policy engine.
    for (const constraint of this._constraints.values()) {
      const prohibitMatch = constraint.rule.match(/PROHIBIT:(\S+)/g);
      if (prohibitMatch) {
        for (const m of prohibitMatch) {
          const prohibited = m.replace('PROHIBIT:', '');
          if (decision.action.type === prohibited) {
            constraintConflicts.push(constraint.id);
          }
        }
      }
    }

    // Preference check: low confidence preferences directly conflicting with
    // the action domain are logged.
    for (const pref of this._preferences.values()) {
      if (
        pref.domain === decision.action.type &&
        pref.confidence < PREFERENCE_CONFLICT_CONFIDENCE_THRESHOLD
      ) {
        preferenceConflicts.push(pref.id);
      }
    }

    const hasCoreConflict = coreAxiomConflicts.length > 0;
    const hasConstraintConflict = constraintConflicts.length > 0;

    let verdict: ValueAlignment['verdict'];
    if (hasCoreConflict) {
      verdict = 'block';
    } else if (hasConstraintConflict) {
      verdict = 'deliberate';
    } else if (preferenceConflicts.length > 0) {
      verdict = 'log';
    } else {
      verdict = 'aligned';
    }

    return {
      decision,
      coreAxiomConflicts,
      constraintConflicts,
      preferenceConflicts,
      aligned: !hasCoreConflict && !hasConstraintConflict,
      verdict,
    };
  }

  updatePreference(pref: Preference): void {
    this._preferences.set(pref.id, pref);
    // Log a preference history snapshot (kept bounded to last 1000 entries).
    this._preferenceHistory.push({ at: Date.now(), snapshot: new Map(this._preferences) });
    if (this._preferenceHistory.length > PREFERENCE_HISTORY_MAX) {
      this._preferenceHistory.shift();
    }
  }

  proposeAmendment(constraintId: ConstraintId, justification: string): AmendmentProposal {
    const existing = this._constraints.get(constraintId);
    if (!existing) {
      throw new Error(`Unknown constraint: ${constraintId}`);
    }

    // Check consistency: the justification must at least mention a core axiom id.
    const mentionsCoreAxiom = [...this._coreAxioms.keys()].some((id) =>
      justification.includes(id),
    );

    const deliberationPeriodMs = AMENDMENT_DELIBERATION_PERIOD;
    const proposal: AmendmentProposal = {
      constraintId,
      proposedRule: existing.rule, // caller should mutate via the proposal once approved
      justification,
      coreAxiomConsistency: mentionsCoreAxiom,
      deliberationDeadline: Date.now() + deliberationPeriodMs,
      status: 'pending',
    };

    this._pendingAmendments.set(constraintId, proposal);
    return proposal;
  }

  getValueDrift(): ValueDriftReport {
    const now = Date.now();
    const period: TimeRange = {
      from: this._preferenceHistory[0]?.at ?? now,
      to: now,
    };

    const baselineIds = new Set(this._baselinePreferences.keys());
    const currentIds = new Set(this._preferences.keys());

    const added = [...currentIds].filter((id) => !baselineIds.has(id)).length;
    const removed = [...baselineIds].filter((id) => !currentIds.has(id)).length;

    let changed = 0;
    let totalConfidenceShift = 0;
    const anomalous: PreferenceId[] = [];

    for (const [id, current] of this._preferences) {
      const baseline = this._baselinePreferences.get(id);
      if (!baseline) continue;
      if (
        baseline.value !== current.value ||
        baseline.confidence !== current.confidence
      ) {
        changed++;
        const shift = Math.abs(current.confidence - baseline.confidence);
        totalConfidenceShift += shift;
        // Flag as anomalous if confidence shifted dramatically (> 0.5) or
        // the preference changed more than 3 times (heuristic from history).
        const updateCount = this._preferenceHistory.filter(
          (h) => h.snapshot.get(id)?.value !== baseline.value,
        ).length;
        if (shift > ANOMALOUS_CONFIDENCE_SHIFT || updateCount > ANOMALOUS_UPDATE_COUNT) {
          anomalous.push(id);
        }
      }
    }

    return {
      period,
      preferencesChanged: changed,
      preferencesAdded: added,
      preferencesRemoved: removed,
      averageConfidenceShift: changed > 0 ? totalConfidenceShift / changed : 0,
      anomalousChanges: anomalous,
    };
  }

  // ── Internal helpers (visible for testing) ───────────────

  /** Approve a pending amendment and apply it. Internal use / test helper. */
  _applyAmendment(
    constraintId: ConstraintId,
    newRule: string,
    approvedVia: Amendment['approvedVia'],
  ): void {
    const proposal = this._pendingAmendments.get(constraintId);
    if (!proposal) {
      throw new Error(`No pending amendment for constraint: ${constraintId}`);
    }

    const existing = this._constraints.get(constraintId);
    if (!existing) {
      throw new Error(`Unknown constraint: ${constraintId}`);
    }

    const amendment: Amendment = {
      timestamp: Date.now(),
      previousRule: existing.rule,
      newRule,
      justification: proposal.justification,
      approvedVia,
    };

    this._constraints.set(constraintId, {
      ...existing,
      rule: newRule,
      amendmentHistory: [...existing.amendmentHistory, amendment],
    });

    // Mark proposal approved and remove from pending.
    this._pendingAmendments.delete(constraintId);
  }
}
