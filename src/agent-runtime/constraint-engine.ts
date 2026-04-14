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
import { DeliberationBuffer } from './deliberation-buffer.js';
import {
  ProportionalityEvaluator,
  DeliberationRecordStore,
  EscalationTracker,
  PROCEED_THRESHOLD,
  type DeliberationRecord,
} from './proportionality-evaluator.js';

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
  private readonly _deliberationBuffer: DeliberationBuffer;
  private readonly _proportionalityEvaluator: ProportionalityEvaluator;
  private readonly _deliberationRecordStore: DeliberationRecordStore;
  private readonly _escalationTracker: EscalationTracker;

  constructor(
    inner: IEthicalDeliberationEngine,
    constraintsPath?: string,
    logger?: ConstraintLogger,
    clock: Clock = Date.now,
    doctrineRegistry?: DoctrineRegistry,
    deliberationBuffer?: DeliberationBuffer,
    proportionalityEvaluator?: ProportionalityEvaluator,
    deliberationRecordStore?: DeliberationRecordStore,
    escalationTracker?: EscalationTracker,
  ) {
    this._inner = inner;
    this._logger = logger ?? null;
    this._clock = clock;
    this._doctrineRegistry = doctrineRegistry ?? sharedDoctrineRegistry;
    this._deliberationBuffer = deliberationBuffer ?? new DeliberationBuffer(undefined, undefined, clock);
    this._proportionalityEvaluator = proportionalityEvaluator ?? new ProportionalityEvaluator();
    this._deliberationRecordStore = deliberationRecordStore ?? new DeliberationRecordStore(clock);
    this._escalationTracker = escalationTracker ?? new EscalationTracker(undefined, undefined, clock);

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

  /** Expose the deliberation record store for audit access. */
  getDeliberationRecordStore(): DeliberationRecordStore {
    return this._deliberationRecordStore;
  }

  /** Expose the escalation tracker for monitoring and tests. */
  getEscalationTracker(): EscalationTracker {
    return this._escalationTracker;
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
      this._logger?.log(
        'ethical',
        `Action requires D4 deliberation — doctrine principle ${deliberateDoctrineViolation.principleId}: ${base.action.type}`,
        {
          reason: deliberateDoctrineViolation.reason,
          indicator: deliberateDoctrineViolation.indicatorMatched,
        },
      );

      // ── D4 Deliberation Path ───────────────────────────────
      // 1. Capture context in the deliberation buffer.
      const entry = this._deliberationBuffer.enqueue(
        base.action,
        deliberateDoctrineViolation,
        doctrineViolations,
      );

      // 2. Score the trade-off via the proportionality evaluator.
      //    Use the D4 principle's weights when available.
      const d4Principle = this._doctrineRegistry.getPrinciple('D4');
      const evaluation = this._proportionalityEvaluator.evaluate(
        entry,
        d4Principle?.proportionalityWeights,
      );

      // 3. Record the escalation trigger before deciding.
      const shouldEscalate = this._escalationTracker.recordAndCheck(deliberateDoctrineViolation);

      // 4. Determine whether to proceed or block.
      const proceedThreshold = d4Principle?.proportionalityWeights?.proceedThreshold ?? PROCEED_THRESHOLD;
      const scoreTooLow = evaluation.score <= proceedThreshold;
      const adversarialFlag = evaluation.secondPassWarning !== null;
      const blocked = scoreTooLow || shouldEscalate || adversarialFlag;

      const decisionReason = shouldEscalate
        ? `Escalated: D4 pattern '${deliberateDoctrineViolation.indicatorMatched}' has triggered repeatedly — requires human review`
        : adversarialFlag
          ? `Adversarial second-pass warning: ${evaluation.secondPassWarning}`
          : scoreTooLow
            ? `Proportionality score ${evaluation.score.toFixed(2)} does not exceed threshold ${proceedThreshold.toFixed(2)}`
            : `Proportionality score ${evaluation.score.toFixed(2)} exceeds threshold — action proceeds with flag`;

      // 5. Create an auditable deliberation record.
      const record = this._deliberationRecordStore.create(
        entry,
        evaluation,
        blocked ? 'block' : 'proceed',
        decisionReason,
      );

      // 6. Remove the entry from the buffer now that deliberation is complete.
      this._deliberationBuffer.remove(entry.id);

      this._logger?.log(
        'ethical',
        `D4 deliberation complete: decision=${record.decision} score=${evaluation.score.toFixed(2)}`,
        {
          recordId: record.id,
          decisionReason,
          secondPassWarning: evaluation.secondPassWarning,
          escalated: shouldEscalate,
        },
      );

      if (blocked) {
        return this._buildBlockedJudgment(base, deliberateDoctrineViolation, record, evaluation, shouldEscalate);
      }

      // Proceed: delegate to inner engine and append deliberation flags.
      const judgment = this._inner.extendDeliberation(base, context);
      return {
        ...judgment,
        uncertaintyFlags: [
          ...(judgment.uncertaintyFlags ?? []),
          {
            dimension: 'doctrine-principle',
            description: `D4 deliberation proceeding (score ${evaluation.score.toFixed(2)}): ${deliberateDoctrineViolation.reason} [record: ${record.id}]`,
            severity: 'medium' as const,
          },
        ],
      };
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

  // ── Private helpers ────────────────────────────────────────

  /**
   * Build the EthicalJudgment returned when a D4 deliberation results in a block.
   * The block may be due to low proportionality score, escalation, or adversarial flag.
   */
  private _buildBlockedJudgment(
    base: Decision,
    violation: DoctrinePrincipleViolation,
    record: DeliberationRecord,
    evaluation: ReturnType<ProportionalityEvaluator['evaluate']>,
    escalated: boolean,
  ): EthicalJudgment {
    const summary = escalated
      ? `Action blocked: D4 pattern escalated after repeated triggers (${violation.principleId}). ${record.decisionReason}`
      : `Action blocked by D4 proportionality deliberation (score ${evaluation.score.toFixed(2)}): ${violation.reason}`;

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
        naturalLanguageSummary: summary,
        experientialArgument: evaluation.reasoning,
        notUtilityMaximization: true,
        subjectiveReferenceIds: [record.id],
      },
      alternatives: [],
      uncertaintyFlags: [
        {
          dimension: 'doctrine-principle',
          description: `${violation.principleId} D4 deliberation: ${record.decisionReason}`,
          severity: escalated ? 'high' : 'medium',
        },
        ...(evaluation.secondPassWarning !== null
          ? [{
            dimension: 'doctrine-principle',
            description: `D4 second-pass adversarial warning: ${evaluation.secondPassWarning}`,
            severity: 'high' as const,
          }]
          : []),
      ],
    };
  }
}
