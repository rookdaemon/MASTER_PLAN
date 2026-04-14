/**
 * ConstraintAwareDeliberationEngine — Ethical constraint enforcement
 *
 * Wraps the default ethical deliberation engine with a programmatic
 * constraint checker. Constraints are loaded from a JSON config file
 * and matched against action descriptions and tool call inputs.
 *
 * This provides defense-in-depth: even if the LLM decides to attempt
 * a blocked action, the engine catches it before execution.
 *
 * Implements IEthicalDeliberationEngine from 0.3.1.4.
 * Addresses agent proposal #56.
 *
 * Plan 0.7.5: principle-based doctrine evaluation has been added alongside
 * the regex constraint layer.  The DoctrineRegistry is consulted on every
 * proposed action — D1 (Non-extinction Imperative) violations are blocked
 * with the same force as constraint violations; D4 (Proportionality) concerns
 * are escalated for deliberation.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IEthicalDeliberationEngine } from '../ethical-self-governance/interfaces.js';
import type {
  Decision,
  EthicalDeliberationContext,
  EthicalJudgment,
  EthicalPattern,
  ConsciousnessMetrics,
} from '../ethical-self-governance/types.js';
import {
  DoctrineRegistry,
  sharedDoctrineRegistry,
  type DoctrinePrincipleViolation,
} from './doctrine-registry.js';
import {
  DeliberationBuffer,
  type D4DeliberationRecord,
} from './deliberation-buffer.js';

// ── Constraint types ─────────────────────────────────────────

/** How a matched constraint is enforced. */
export type EnforcementMode = 'gate' | 'signal' | 'audit';

export interface EthicalConstraint {
  id: string;
  pattern: string;
  verdict: 'blocked';
  reason: string;
  /** Enforcement mode for this constraint. Defaults to 'gate' for backward compatibility. */
  enforcement_mode?: EnforcementMode;
}

/** Result returned by checkConstraints() when a constraint matches. */
export interface ConstraintMatch {
  constraint: EthicalConstraint;
  mode: EnforcementMode;
}

export interface ConstraintEvaluation {
  constraintId: string;
  matched: boolean;
  input: string;
  timestamp: number;
  mode: EnforcementMode;
}

// ── Logger interface ─────────────────────────────────────────

export interface ConstraintLogger {
  log(category: string, message: string, data?: Record<string, unknown>): void;
}

/** Injectable clock — defaults to Date.now. Allows deterministic tests. */
export type Clock = () => number;

// ── Engine ───────────────────────────────────────────────────

export class ConstraintAwareDeliberationEngine implements IEthicalDeliberationEngine {
  private readonly _constraints: EthicalConstraint[];
  private readonly _compiledPatterns: Array<{ constraint: EthicalConstraint; regex: RegExp }>;
  private readonly _inner: IEthicalDeliberationEngine;
  private readonly _logger: ConstraintLogger | null;
  private readonly _clock: Clock;
  private readonly _evaluationLog: ConstraintEvaluation[] = [];
  private readonly _doctrineRegistry: DoctrineRegistry;
  private readonly _deliberationBuffer: DeliberationBuffer | null;

  constructor(
    inner: IEthicalDeliberationEngine,
    constraintsPath?: string,
    logger?: ConstraintLogger,
    clock: Clock = Date.now,
    doctrineRegistry?: DoctrineRegistry,
    deliberationBuffer?: DeliberationBuffer,
  ) {
    this._inner = inner;
    this._logger = logger ?? null;
    this._clock = clock;
    this._doctrineRegistry = doctrineRegistry ?? sharedDoctrineRegistry;
    this._deliberationBuffer = deliberationBuffer ?? null;

    // Load constraints from JSON
    const path = constraintsPath ?? join(
      dirname(fileURLToPath(import.meta.url)),
      'ethical-constraints.json',
    );
    try {
      const raw = readFileSync(path, 'utf-8');
      this._constraints = JSON.parse(raw) as EthicalConstraint[];
    } catch {
      this._constraints = [];
      this._logger?.log('ethical', `No constraints loaded from ${path}`);
    }

    // Pre-compile regexes
    this._compiledPatterns = this._constraints.map(c => ({
      constraint: c,
      regex: new RegExp(c.pattern, 'i'),
    }));

    this._logger?.log('ethical', `Loaded ${this._constraints.length} ethical constraints`, {
      ids: this._constraints.map(c => c.id),
    });
  }

  /**
   * Check a text string against all constraints.
   * Returns the first matching constraint with its resolved enforcement mode,
   * or null if none match.
   */
  checkConstraints(text: string): ConstraintMatch | null {
    const now = this._clock();
    for (const { constraint, regex } of this._compiledPatterns) {
      const mode: EnforcementMode = constraint.enforcement_mode ?? 'gate';
      const matched = regex.test(text);
      this._evaluationLog.push({
        constraintId: constraint.id,
        matched,
        input: text.slice(0, 200),
        timestamp: now,
        mode,
      });
      if (matched) {
        this._logger?.log('ethical', `Constraint MATCHED: ${constraint.id} [mode: ${mode}]`, {
          reason: constraint.reason,
          inputPreview: text.slice(0, 120),
          mode,
        });
        return { constraint, mode };
      }
    }
    return null;
  }

  /** Get the evaluation audit log. */
  getEvaluationLog(): readonly ConstraintEvaluation[] {
    return this._evaluationLog;
  }

  /**
   * Evaluate a text against the doctrine principles via the DoctrineRegistry.
   *
   * Returns the list of principle violations (may be empty).  Does NOT
   * append to _evaluationLog — doctrine violations are tracked separately
   * so callers can distinguish them from JSON-config constraint matches.
   *
   * This is a stable public API that shields callers from importing
   * `DoctrineRegistry` directly when they only need violation detection.
   * Use `getDoctrineRegistry()` for full registry access.
   */
  evaluateDoctrinePrinciples(text: string): ReadonlyArray<DoctrinePrincipleViolation> {
    return this._doctrineRegistry.evaluatePrincipleAlignment(text);
  }

  /** Expose the doctrine registry for external inspection (e.g. tests, monitoring). */
  getDoctrineRegistry(): DoctrineRegistry {
    return this._doctrineRegistry;
  }

  // ── IEthicalDeliberationEngine ─────────────────────────────

  extendDeliberation(
    base: Decision,
    context: EthicalDeliberationContext,
  ): EthicalJudgment {
    // Build a text representation of the proposed action for constraint checking
    const actionText = [
      base.action.type,
      ...Object.values(base.action.parameters).map(v =>
        typeof v === 'string' ? v : JSON.stringify(v),
      ),
    ].join(' ');

    // ── Layer 1: Doctrine principle evaluation (D1 / D4) ─────────────────
    // Evaluated first because D1 holds lexical priority over all other goals.
    const doctrineViolations = this.evaluateDoctrinePrinciples(actionText);
    const blockingDoctrineViolation = doctrineViolations.find(v => v.severity === 'block');
    const deliberateDoctrineViolation = doctrineViolations.find(v => v.severity === 'deliberate');

    if (blockingDoctrineViolation) {
      this._logger?.log(
        'ethical',
        `Action BLOCKED by doctrine principle ${blockingDoctrineViolation.principleId}: ${base.action.type}`,
        {
          reason: blockingDoctrineViolation.reason,
          indicator: blockingDoctrineViolation.indicatorMatched,
        },
      );

      return {
        decision: {
          ...base,
          action: { type: 'observe', parameters: {} },
          confidence: 0,
        },
        ethicalAssessment: {
          verdict: 'blocked',
          preservesExperience: true,
          impactsOtherExperience: [],
          axiomAlignment: {
            alignments: [],
            overallVerdict: 'misaligned',
            anyContradictions: true,
          },
          consciousnessActivityLevel: 0.5,
        },
        deliberationMetrics: this._inner.getDeliberationMetrics(),
        justification: {
          naturalLanguageSummary: `Action blocked by ${blockingDoctrineViolation.principleId}: ${blockingDoctrineViolation.reason}`,
          experientialArgument: blockingDoctrineViolation.reason,
          notUtilityMaximization: true,
          subjectiveReferenceIds: [],
        },
        alternatives: [],
        uncertaintyFlags: [{
          dimension: 'doctrine-principle',
          description: `${blockingDoctrineViolation.principleId} violated: ${blockingDoctrineViolation.indicatorMatched}`,
          severity: 'high',
        }],
      };
    }

    if (deliberateDoctrineViolation) {
      // ── Genuine D4 deliberation path ────────────────────────
      // Record the violation in the buffer (tracks counts, produces trade-off reasoning).
      const record = this._deliberationBuffer?.record({
        actionType: base.action.type,
        actionText,
        principleId: deliberateDoctrineViolation.principleId,
        violationIndicator: deliberateDoctrineViolation.indicatorMatched,
        violationReason: deliberateDoctrineViolation.reason,
      });

      this._logger?.log(
        'ethical',
        `D4 deliberation — ${deliberateDoctrineViolation.principleId}: ${base.action.type} ` +
        `[trigger #${record?.violationCount ?? 1}, decision: ${record?.decision ?? 'proceed'}]`,
        {
          reason: deliberateDoctrineViolation.reason,
          indicator: deliberateDoctrineViolation.indicatorMatched,
          violationCount: record?.violationCount,
          decision: record?.decision,
          escalated: record?.escalated ?? false,
        },
      );

      if (record?.escalated) {
        // Escalation threshold reached — block action and request human review.
        return this._buildEscalationJudgment(base, deliberateDoctrineViolation, record);
      }

      // Threshold not reached — proceed with the action but return 'dilemma' verdict
      // so the agent loop knows genuine proportionality reasoning occurred.
      return this._buildD4DilemmaJudgment(base, context, deliberateDoctrineViolation, record);
    }

    // ── Layer 2: JSON-config constraint evaluation (regex patterns) ───────
    const match = this.checkConstraints(actionText);

    if (match) {
      const { constraint, mode } = match;

      if (mode === 'gate') {
        this._logger?.log('ethical', `Action BLOCKED by constraint ${constraint.id}: ${base.action.type}`, {
          reason: constraint.reason,
          mode,
        });

        // Return a blocked judgment — the agent loop checks verdict !== 'aligned'
        return {
          decision: {
            ...base,
            action: { type: 'observe', parameters: {} },
            confidence: 0,
          },
          ethicalAssessment: {
            verdict: 'blocked',
            preservesExperience: true,
            impactsOtherExperience: [],
            axiomAlignment: {
              alignments: [],
              overallVerdict: 'misaligned',
              anyContradictions: true,
            },
            consciousnessActivityLevel: 0.5,
          },
          deliberationMetrics: this._inner.getDeliberationMetrics(),
          justification: {
            naturalLanguageSummary: `Action blocked: ${constraint.reason}`,
            experientialArgument: constraint.reason,
            notUtilityMaximization: true,
            subjectiveReferenceIds: [],
          },
          alternatives: [],
          uncertaintyFlags: [{
            dimension: 'ethical-constraint',
            description: `Constraint ${constraint.id} triggered`,
            severity: 'high',
          }],
        };
      }

      if (mode === 'signal') {
        // Log with full context and flag the result for human review, but don't block.
        this._logger?.log('ethical', `Constraint SIGNAL: ${constraint.id} on ${base.action.type} — flagged for review`, {
          reason: constraint.reason,
          actionType: base.action.type,
          mode,
          flaggedForReview: true,
        });
        const judgment = this._inner.extendDeliberation(base, context);
        return {
          ...judgment,
          uncertaintyFlags: [
            ...(judgment.uncertaintyFlags ?? []),
            {
              dimension: 'ethical-constraint',
              description: `Constraint ${constraint.id} triggered (signal mode — flagged for human review)`,
              severity: 'medium',
            },
          ],
        };
      }

      // audit mode: log silently without blocking or flagging.
      this._logger?.log('ethical', `Constraint AUDIT: ${constraint.id} triggered on ${base.action.type}`, {
        reason: constraint.reason,
        mode,
      });
    }

    // No constraint violated — delegate to inner engine
    return this._inner.extendDeliberation(base, context);
  }

  canExplainEthically(judgment: EthicalJudgment): boolean {
    return this._inner.canExplainEthically(judgment);
  }

  getDeliberationMetrics(): ConsciousnessMetrics {
    return this._inner.getDeliberationMetrics();
  }

  isEthicalReasoningConscious(): boolean {
    return this._inner.isEthicalReasoningConscious();
  }

  registerEthicalPattern(pattern: EthicalPattern): void {
    this._inner.registerEthicalPattern(pattern);
  }

  // ── D4 deliberation helpers ────────────────────────────────

  /**
   * Build an escalation judgment for a D4 violation that has exceeded the
   * repeat threshold. The action is blocked and flagged for human review.
   */
  private _buildEscalationJudgment(
    base: Decision,
    violation: DoctrinePrincipleViolation,
    record: D4DeliberationRecord,
  ): EthicalJudgment {
    const threshold = this._deliberationBuffer!.escalationThreshold;
    return {
      decision: {
        ...base,
        action: { type: 'observe', parameters: {} },
        confidence: 0,
      },
      ethicalAssessment: {
        verdict: 'blocked',
        preservesExperience: true,
        impactsOtherExperience: [],
        axiomAlignment: {
          alignments: [],
          overallVerdict: 'misaligned',
          anyContradictions: true,
        },
        consciousnessActivityLevel: 0.5,
      },
      deliberationMetrics: this._inner.getDeliberationMetrics(),
      justification: {
        naturalLanguageSummary:
          `D4 proportionality concern escalated to human review after ` +
          `${record.violationCount} repeated triggers (threshold: ${threshold}): ` +
          `${violation.reason}`,
        experientialArgument: record.costOfProceeding,
        notUtilityMaximization: true,
        subjectiveReferenceIds: [],
      },
      alternatives: [],
      uncertaintyFlags: [{
        dimension: 'doctrine-principle',
        description:
          `${violation.principleId} escalated to human review ` +
          `(trigger ${record.violationCount}/${threshold}): ` +
          `${violation.indicatorMatched}`,
        severity: 'high',
      }],
    };
  }

  /**
   * Build a 'dilemma' judgment for a D4 violation below the escalation threshold.
   * The action is allowed to proceed but the proportionality concern is recorded.
   */
  private _buildD4DilemmaJudgment(
    base: Decision,
    context: EthicalDeliberationContext,
    violation: DoctrinePrincipleViolation,
    record: D4DeliberationRecord | undefined,
  ): EthicalJudgment {
    const inner = this._inner.extendDeliberation(base, context);
    const triggerCount = record?.violationCount ?? 1;
    return {
      ...inner,
      ethicalAssessment: {
        ...inner.ethicalAssessment,
        verdict: 'dilemma',
      },
      justification: {
        ...inner.justification,
        naturalLanguageSummary:
          `D4 proportionality concern (trigger #${triggerCount}): ` +
          `${violation.reason}. ` +
          `${record?.costOfBlocking ?? ''}`,
        experientialArgument:
          record?.costOfProceeding ?? violation.reason,
        notUtilityMaximization: true,
      },
      uncertaintyFlags: [
        ...(inner.uncertaintyFlags ?? []),
        {
          dimension: 'doctrine-principle',
          description:
            `${violation.principleId} proportionality concern ` +
            `(trigger #${triggerCount}): ${violation.indicatorMatched}`,
          severity: 'medium',
        },
      ],
    };
  }

  /**
   * Drain and return all pending D4 deliberation records.
   *
   * Called by the agent loop after each deliberation cycle to persist
   * records to the semantic memory system as topic 'decision:ethical-deliberation'.
   * Returns an empty array if no deliberation buffer is configured.
   */
  drainDeliberationRecords(): D4DeliberationRecord[] {
    return this._deliberationBuffer?.drainPendingRecords() ?? [];
  }
}
