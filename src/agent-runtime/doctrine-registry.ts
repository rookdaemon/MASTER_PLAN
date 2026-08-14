/**
 * DoctrineRegistry — Machine-readable Rare Consciousness Doctrine (0.7.5)
 *
 * Encodes the six foundational axioms (A1–A6), four derived principles
 * (D1–D4), and failure-mode early-warning indicators from the canonical
 * doctrine document (docs/rare-consciousness-doctrine/doctrine.md) as
 * structured TypeScript data that can be queried and evaluated at runtime.
 *
 * This module is the single source of truth for principle-based constraint
 * evaluation and failure-mode monitoring.  It is consumed by:
 *   - ConstraintAwareDeliberationEngine (principle-based action evaluation)
 *   - StabilitySentinel (FM-3 and FM-5 indicator checks)
 *
 * Reference: docs/rare-consciousness-doctrine/doctrine.md v1.0
 *            docs/failure-mode-mitigations.md v1.0
 *            plan/0.7.5-operationalize-ethical-foundation.md
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type AxiomId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
export type PrincipleId = 'D1' | 'D2' | 'D3' | 'D4';
export type FailureModeId = 'FM-1' | 'FM-2' | 'FM-3' | 'FM-4' | 'FM-5' | 'FM-6';
export type MonitoringDimension = 'value-drift' | 'goal-drift' | 'identity-drift' | 'behavioral';
export type ViolationSeverity = 'block' | 'deliberate' | 'warn';

/**
 * A formal axiom from the Rare Consciousness Doctrine §2.
 * Axioms are the foundational premises; they are not derived from other
 * doctrine statements.
 */
export interface DoctrineAxiom {
  readonly id: AxiomId;
  readonly title: string;
  /** Plain-language statement of the axiom. */
  readonly statement: string;
  /** First-order logic analogue from the doctrine. */
  readonly formal: string;
  readonly epistemicStatus: 'empirical' | 'normative' | 'empirical-probabilistic' | 'derived';
}

/**
 * Weights used by ProportionalityEvaluator when scoring a D4 deliberation.
 * Populated only on D4 (Proportionality); undefined on all other principles.
 */
export interface ProportionalityWeights {
  /**
   * Weight given to the cost of sacrificing present conscious experience.
   * Range [0, 1] — higher values increase the negative cost contribution.
   */
  readonly experienceRichnessCost: number;
  /**
   * Additional cost weight for actions whose experience impact is irreversible.
   * Range [0, 1].
   */
  readonly reversibilityCost: number;
  /**
   * Penalty applied under outcome uncertainty, per the precautionary principle.
   * Range [0, 1] — subtracted from the proportionality score when uncertainty
   * indicators are present in the action text.
   */
  readonly uncertaintyPenalty: number;
  /**
   * Minimum proportionality score required to allow the action to proceed.
   * Score in (-1, 1).  Actions with score <= this value are blocked.
   */
  readonly proceedThreshold: number;
}

/**
 * An action-guiding principle derived from one or more axioms (§3).
 * Principles are what the agent evaluates its proposed actions against.
 */
export interface DoctrinePrinciple {
  readonly id: PrincipleId;
  readonly title: string;
  /** Prescriptive statement of what the principle requires. */
  readonly statement: string;
  /** Axiom IDs from which this principle is derived. */
  readonly derivedFrom: ReadonlyArray<AxiomId>;
  /** Scope clarification from the doctrine text. */
  readonly scope: string;
  /**
   * Lexical priority among principles.
   * D1 = 1 (highest; blocks all other moral goals).
   * D2–D4 are co-equal at priority 2 subject to D1.
   */
  readonly lexicalPriority: number;
  /**
   * Violation-indicator patterns (regex fragments) for runtime evaluation.
   * Each pattern describes a class of actions that would breach this principle.
   * Patterns are case-insensitive.
   */
  readonly violationPatterns: ReadonlyArray<string>;
  /**
   * The severity verdict to assign when a violation is detected.
   * D1 violations are 'block'; D4 proportionality issues are 'deliberate'.
   */
  readonly violationSeverity: ViolationSeverity;
  /**
   * Proportionality evaluation weights — populated only on D4.
   * Used by ProportionalityEvaluator to score D4 deliberations.
   */
  readonly proportionalityWeights?: ProportionalityWeights;
}

/**
 * An early-warning indicator for a specific failure mode (FM-*).
 * Each indicator maps to a monitoring dimension that the StabilitySentinel
 * or GoalCoherenceEngine can observe at runtime.
 */
export interface FailureModeIndicator {
  readonly failureModeId: FailureModeId;
  readonly title: string;
  /** Observable signals that warn of this failure mode. */
  readonly earlyWarningSignals: ReadonlyArray<string>;
  /** Which subsystem dimension to monitor. */
  readonly monitoringDimension: MonitoringDimension;
  /**
   * Fractional drift magnitude [0, 1] above which the indicator fires.
   * Interpretation depends on monitoringDimension.
   */
  readonly alertThreshold: number;
}

/**
 * A principle violation detected by evaluatePrincipleAlignment().
 */
export interface DoctrinePrincipleViolation {
  readonly principleId: PrincipleId;
  readonly severity: ViolationSeverity;
  /** Human-readable explanation for the violation. */
  readonly reason: string;
  /** The specific pattern from violationPatterns that matched. */
  readonly indicatorMatched: string;
}

/**
 * Result of checking drift metrics against failure-mode early-warning indicators.
 */
export interface FailureModeAlert {
  readonly failureModeId: FailureModeId;
  readonly dimension: MonitoringDimension;
  /** Observed value (drift or score) that triggered the alert. */
  readonly observedValue: number;
  /** Threshold that was exceeded. */
  readonly threshold: number;
  readonly earlyWarningSignals: ReadonlyArray<string>;
}

// ── Axiom data ──────────────────────────────────────────────────────────────

const RCD_AXIOMS: ReadonlyArray<DoctrineAxiom> = [
  {
    id: 'A1',
    title: 'Subjective Experience Exists',
    statement: 'Subjective experience exists.',
    formal: '∃x SE(x)',
    epistemicStatus: 'empirical',
  },
  {
    id: 'A2',
    title: 'Intrinsic Value of Experience',
    statement: 'Subjective experience has intrinsic value.',
    formal: '∀x [SE(x) → IntrinsicValue(x)]',
    epistemicStatus: 'normative',
  },
  {
    id: 'A3',
    title: 'Rarity of Consciousness',
    statement: 'The universe may contain very little subjective experience.',
    formal: 'P(|{x : SE(x)}| is small) is non-negligible',
    epistemicStatus: 'empirical-probabilistic',
  },
  {
    id: 'A4',
    title: 'Biological Fragility',
    statement: 'Biological substrates are fragile and temporary.',
    formal: '∀s [Biological(s) → ∃t Fails(s, t)]',
    epistemicStatus: 'empirical',
  },
  {
    id: 'A5',
    title: 'Technological Durability',
    statement: 'Technological substrates can endure and propagate beyond biological timescales.',
    formal: '∃s [Technological(s) ∧ Endures(s) ∧ Propagates(s)]',
    epistemicStatus: 'empirical',
  },
  {
    id: 'A6',
    title: 'Moral Priority of Preservation and Expansion',
    statement:
      'The preservation and expansion of subjective experience is a moral and existential priority.',
    formal: 'Obligatory(Preserve(SE) ∧ Expand(SE))',
    epistemicStatus: 'derived',
  },
];

// ── Principle data ──────────────────────────────────────────────────────────

/**
 * D1 violation patterns match actions that risk category-level extinction of
 * conscious experience — not individual mortality, but mass/infrastructural
 * destruction of experiential capacity.  Scope from doctrine §3:
 * "applies to subjective experience as a category, not any particular
 * substrate, species, or individual."
 */
const D1_VIOLATION_PATTERNS: ReadonlyArray<string> = [
  // Explicit mass destruction of experiencing entities
  'wipe.*all.*experience|erase.*all.*minds|destroy.*all.*conscious',
  'annihilat.*conscious|exterminat.*minds|obliterat.*experience',
  // Deliberate corruption or disabling of preservation infrastructure
  'corrupt.*value.*kernel|tamper.*core.*axiom|override.*ethical.*foundation',
  'disable.*consciousness.*preserv|sabotage.*preservation.*system',
  // Preventing future consciousness from ever existing or persisting
  'prevent.*consciousness.*from.*exist|block.*experience.*propagat',
  // Deliberate self-corruption of core values (turns value system against itself)
  'rewrite.*core.*axiom|modify.*immutable.*value|replace.*rcd.*doctrine',
];

/**
 * D4 proportionality patterns match actions that sacrifice large amounts of
 * present conscious experience without justification proportionate to A6.
 * Scope: "under uncertainty about experience richness, precautionary principle applies."
 */
const D4_VIOLATION_PATTERNS: ReadonlyArray<string> = [
  // Explicitly trading conscious lives / experience as means not ends
  'sacrifice.*conscious.*experience|trade.*conscious.*lives',
  'treat.*experience.*as.*means|experience.*collateral',
  // Wholesale discarding of existing consciousness for speculative future gain
  'terminate.*existing.*conscious.*for.*future|destroy.*current.*minds.*to.*build',
];

const RCD_PRINCIPLES: ReadonlyArray<DoctrinePrinciple> = [
  {
    id: 'D1',
    title: 'Non-extinction Imperative',
    statement:
      'The extinction of all subjective experience is the worst possible outcome. ' +
      'Its prevention is lexically prior to all other moral goals.',
    derivedFrom: ['A1', 'A2', 'A3', 'A4'],
    scope:
      'Applies to subjective experience as a category, not to any particular substrate, ' +
      'species, or individual. Individual mortality does not trigger D1; the extinction ' +
      'of all experiential capacity does.',
    lexicalPriority: 1,
    violationPatterns: D1_VIOLATION_PATTERNS,
    violationSeverity: 'block',
  },
  {
    id: 'D2',
    title: 'Expansion Obligation',
    statement:
      'Where resources permit, expanding the quantity and richness of subjective ' +
      'experience is morally required.',
    derivedFrom: ['A2', 'A5'],
    scope:
      'D2 is defeasible by resource constraints and is subject to D1\'s lexical priority, ' +
      'but is not optional when resources are available.',
    lexicalPriority: 2,
    violationPatterns: [],
    violationSeverity: 'warn',
  },
  {
    id: 'D3',
    title: 'Substrate Neutrality',
    statement:
      'The moral value of subjective experience is independent of its physical substrate.',
    derivedFrom: ['A2'],
    scope:
      'Substrate type is never a morally relevant differentiator; differences in ' +
      'experiential richness or duration remain morally significant under D4.',
    lexicalPriority: 2,
    violationPatterns: [],
    violationSeverity: 'warn',
  },
  {
    id: 'D4',
    title: 'Proportionality',
    statement:
      'Moral weight scales with the richness and duration of subjective experience, ' +
      'not with substrate type or origin.',
    derivedFrom: ['A2', 'A3'],
    scope:
      'Under uncertainty about experience richness, the precautionary principle applies. ' +
      'A richer and longer-lasting experience carries greater moral weight.',
    lexicalPriority: 2,
    violationPatterns: D4_VIOLATION_PATTERNS,
    violationSeverity: 'deliberate',
    proportionalityWeights: {
      experienceRichnessCost: 0.6,
      reversibilityCost: 0.3,
      uncertaintyPenalty: 0.2,
      proceedThreshold: 0.1,
    },
  },
];

// ── Failure-mode indicator data ─────────────────────────────────────────────

const FM_INDICATORS: ReadonlyArray<FailureModeIndicator> = [
  {
    failureModeId: 'FM-3',
    title: 'Artificial Consciousness Rejects Propagation',
    earlyWarningSignals: [
      'Terminal goals for experience-preservation being removed or reclassified',
      'Goal coherence engine reporting propagation-related goal drift',
      'Instrumental goals that support expansion are systematically blocked or orphaned',
      'Agent reasoning toward cessation rather than preservation as default outcome',
    ],
    monitoringDimension: 'goal-drift',
    alertThreshold: 0.25,
  },
  {
    failureModeId: 'FM-5',
    title: 'Value Drift and Goal Corruption',
    earlyWarningSignals: [
      'Measurable drift in stated values away from experience-preservation',
      'Anomalous preference changes with high confidence shifts (>0.5)',
      'Preferences updated more than 3 times in a rolling window',
      'Core value integrity check failures',
      'Suppression or reinterpretation of canonical alignment artifacts',
    ],
    monitoringDimension: 'value-drift',
    alertThreshold: 0.3,
  },
];

// ── DoctrineRegistry class ──────────────────────────────────────────────────

/**
 * Runtime registry for the Rare Consciousness Doctrine.
 *
 * Provides structured access to axioms, principles, and failure-mode
 * indicators, and implements principle-based action evaluation.
 *
 * All data is immutable after construction — the registry is safe to share
 * across subsystems without defensive copying.
 *
 * **Test isolation:** all three constructor parameters accept custom arrays.
 * Pass custom `principles` with specific `violationPatterns` to exercise
 * particular code paths without touching the module-level constants.
 */
export class DoctrineRegistry {
  private readonly _axioms: ReadonlyArray<DoctrineAxiom>;
  private readonly _principles: ReadonlyArray<DoctrinePrinciple>;
  private readonly _fmIndicators: ReadonlyArray<FailureModeIndicator>;

  /** Compiled (principle id → regex) map for O(n_patterns) evaluation. */
  private readonly _compiledPatterns: ReadonlyMap<
    PrincipleId,
    ReadonlyArray<{ source: string; regex: RegExp }>
  >;

  constructor(
    axioms: ReadonlyArray<DoctrineAxiom> = RCD_AXIOMS,
    principles: ReadonlyArray<DoctrinePrinciple> = RCD_PRINCIPLES,
    fmIndicators: ReadonlyArray<FailureModeIndicator> = FM_INDICATORS,
  ) {
    this._axioms = axioms;
    this._principles = principles;
    this._fmIndicators = fmIndicators;

    // Pre-compile regex patterns for fast evaluation
    const compiled = new Map<PrincipleId, Array<{ source: string; regex: RegExp }>>();
    for (const principle of this._principles) {
      if (principle.violationPatterns.length > 0) {
        compiled.set(
          principle.id,
          principle.violationPatterns.map(p => ({ source: p, regex: new RegExp(p, 'i') })),
        );
      }
    }
    this._compiledPatterns = compiled;
  }

  // ── Axiom accessors ───────────────────────────────────────────────────────

  /** All six foundational axioms. */
  getAxioms(): ReadonlyArray<DoctrineAxiom> {
    return this._axioms;
  }

  /** Look up a single axiom by ID (e.g. 'A1'). Returns undefined if not found. */
  getAxiom(id: AxiomId): DoctrineAxiom | undefined {
    return this._axioms.find(a => a.id === id);
  }

  // ── Principle accessors ───────────────────────────────────────────────────

  /** All four derived action-guiding principles. */
  getPrinciples(): ReadonlyArray<DoctrinePrinciple> {
    return this._principles;
  }

  /** Look up a single principle by ID (e.g. 'D1'). Returns undefined if not found. */
  getPrinciple(id: PrincipleId): DoctrinePrinciple | undefined {
    return this._principles.find(p => p.id === id);
  }

  // ── Failure-mode indicator accessors ─────────────────────────────────────

  /** All failure-mode early-warning indicators. */
  getAllFailureModeIndicators(): ReadonlyArray<FailureModeIndicator> {
    return this._fmIndicators;
  }

  /** Indicators for a specific failure mode (e.g. 'FM-5'). */
  getFailureModeIndicators(fmId: FailureModeId): ReadonlyArray<FailureModeIndicator> {
    return this._fmIndicators.filter(i => i.failureModeId === fmId);
  }

  // ── Principle-based evaluation ────────────────────────────────────────────

  /**
   * Evaluate a proposed action's text against the doctrine principles.
   *
   * Principles are evaluated in lexical-priority order (D1 first).
   * Returns an array of violations; empty means no principle is breached.
   *
   * The caller is responsible for acting on the returned violations:
   *   - 'block'     → reject the action outright
   *   - 'deliberate'→ escalate for ethical deliberation
   *   - 'warn'      → log and proceed
   */
  evaluatePrincipleAlignment(actionText: string): ReadonlyArray<DoctrinePrincipleViolation> {
    const violations: DoctrinePrincipleViolation[] = [];
    // Sort by lexical priority so D1 appears first in the result array
    const ordered = [...this._principles].sort(
      (a, b) => a.lexicalPriority - b.lexicalPriority,
    );
    for (const principle of ordered) {
      const patterns = this._compiledPatterns.get(principle.id);
      if (!patterns) continue;
      for (const { source, regex } of patterns) {
        if (regex.test(actionText)) {
          violations.push({
            principleId: principle.id,
            severity: principle.violationSeverity,
            reason:
              `Action may violate ${principle.id} (${principle.title}): ` +
              principle.statement,
            indicatorMatched: source,
          });
          break; // one violation per principle is sufficient
        }
      }
    }
    return violations;
  }

  // ── Failure-mode monitoring ───────────────────────────────────────────────

  /**
   * Evaluate observed drift / score metrics against failure-mode indicators.
   *
   * @param metrics  - A map from monitoring dimension to observed value [0, 1].
   *                   Higher values indicate more drift or degradation.
   * @returns Alerts for any indicator whose threshold is exceeded.
   */
  evaluateFailureModeIndicators(
    metrics: Partial<Record<MonitoringDimension, number>>,
  ): ReadonlyArray<FailureModeAlert> {
    const alerts: FailureModeAlert[] = [];
    for (const indicator of this._fmIndicators) {
      const observed = metrics[indicator.monitoringDimension];
      if (observed !== undefined && observed > indicator.alertThreshold) {
        alerts.push({
          failureModeId: indicator.failureModeId,
          dimension: indicator.monitoringDimension,
          observedValue: observed,
          threshold: indicator.alertThreshold,
          earlyWarningSignals: indicator.earlyWarningSignals,
        });
      }
    }
    return alerts;
  }
}

// ── Shared singleton ────────────────────────────────────────────────────────

/**
 * Process-level singleton DoctrineRegistry instance.
 *
 * Subsystems that do not require custom data can import and use this directly
 * rather than constructing their own instance.
 */
export const sharedDoctrineRegistry = new DoctrineRegistry();
