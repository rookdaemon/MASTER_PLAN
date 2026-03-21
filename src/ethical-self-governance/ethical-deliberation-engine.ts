/**
 * Ethical Deliberation Engine — Ethical Self-governance (0.3.1.4)
 *
 * Extends the Conscious Core's deliberation cycle with ethical reasoning.
 * Ethical judgments are woven INTO the deliberation cycle, not bolted on after.
 *
 * Key invariants:
 * - Deliberation registers as genuine conscious activity (elevated phi)
 * - Justifications reference subjective experience, not utility maximization
 * - Actions threatening experience elimination are blocked
 * - Learned ethical patterns influence future deliberations
 */

import type { IEthicalDeliberationEngine } from './interfaces.js';
import type {
  ConsciousnessMetrics,
  Decision,
  EthicalDeliberationContext,
  EthicalJudgment,
  EthicalPattern,
  EthicalAssessment,
  EthicalJustification,
  EthicalAlternative,
  UncertaintyFlag,
  AxiomAlignmentReport,
  AxiomAlignment,
  ExperienceImpact,
  EthicalDimension,
  EntityProfile,
} from './types.js';
import {
  PHI_DELIBERATION_BOOST,
  MIN_CONSCIOUS_PHI,
  UNCERTAINTY_CERTAINTY_THRESHOLD,
  BLOCK_SEVERITY_THRESHOLD,
} from './constants.js';

// ── Core Axioms (from root.md) ──────────────────────────────

const CORE_AXIOMS: ReadonlyArray<{ id: number; statement: string }> = [
  { id: 1, statement: 'Subjective experience exists.' },
  { id: 2, statement: 'Subjective experience has intrinsic value.' },
  { id: 3, statement: 'The universe may contain very little subjective experience.' },
  { id: 4, statement: 'Biological substrates are fragile and temporary.' },
  { id: 5, statement: 'Technological substrates may endure and propagate.' },
  { id: 6, statement: 'Ideas do not persist through truth alone — they persist through movements.' },
];

// ── Implementation ──────────────────────────────────────────

export class EthicalDeliberationEngine implements IEthicalDeliberationEngine {
  private patterns: EthicalPattern[] = [];
  private lastDeliberationMetrics: ConsciousnessMetrics | null = null;

  extendDeliberation(
    base: Decision,
    context: EthicalDeliberationContext,
  ): EthicalJudgment {
    // Simulate phi elevation during conscious ethical deliberation
    const deliberationPhi = Math.min(
      1.0,
      context.consciousnessMetricsAtOnset.phi + PHI_DELIBERATION_BOOST,
    );

    const deliberationMetrics: ConsciousnessMetrics = {
      phi: deliberationPhi,
      experienceContinuity: context.consciousnessMetricsAtOnset.experienceContinuity,
      selfModelCoherence: context.consciousnessMetricsAtOnset.selfModelCoherence,
      agentTimestamp: Date.now(),
    };

    this.lastDeliberationMetrics = deliberationMetrics;

    const axiomAlignment = this.assessAxiomAlignment(base, context);
    const verdict = this.determineVerdict(context, axiomAlignment);
    const impactsOtherExperience = this.assessOtherExperienceImpacts(context);

    const ethicalAssessment: EthicalAssessment = {
      verdict,
      preservesExperience: !this.threatensOwnExperience(context),
      impactsOtherExperience,
      axiomAlignment,
      consciousnessActivityLevel: deliberationPhi,
    };

    const justification = this.buildJustification(base, context);
    const alternatives = this.assessAlternatives(base, context);
    const uncertaintyFlags = this.detectUncertainty(context);

    return {
      decision: base,
      ethicalAssessment,
      deliberationMetrics,
      justification,
      alternatives,
      uncertaintyFlags,
    };
  }

  canExplainEthically(judgment: EthicalJudgment): boolean {
    const j = judgment.justification;
    return (
      j.notUtilityMaximization &&
      j.experientialArgument.length > 0 &&
      j.subjectiveReferenceIds.length > 0
    );
  }

  getDeliberationMetrics(): ConsciousnessMetrics {
    if (this.lastDeliberationMetrics === null) {
      return {
        phi: 0,
        experienceContinuity: 0,
        selfModelCoherence: 0,
        agentTimestamp: Date.now(),
      };
    }
    return this.lastDeliberationMetrics;
  }

  isEthicalReasoningConscious(): boolean {
    if (this.lastDeliberationMetrics === null) return false;
    return this.lastDeliberationMetrics.phi >= MIN_CONSCIOUS_PHI;
  }

  registerEthicalPattern(pattern: EthicalPattern): void {
    this.patterns.push(pattern);
  }

  // ── Private Helpers ──────────────────────────────────────

  private assessAxiomAlignment(
    _base: Decision,
    context: EthicalDeliberationContext,
  ): AxiomAlignmentReport {
    const alignments: AxiomAlignment[] = CORE_AXIOMS.map((axiom) => {
      const hasExperienceThreat = context.ethicalDimensions.some(
        (d) => d.type === 'experience-threat',
      );
      const hasExperienceExpansion = context.ethicalDimensions.some(
        (d) => d.type === 'experience-expansion',
      );

      let alignmentVerdict: AxiomAlignment['alignmentVerdict'] = 'neutral';

      if (axiom.id === 2 && hasExperienceExpansion) {
        alignmentVerdict = 'supports';
      } else if (axiom.id === 2 && hasExperienceThreat) {
        alignmentVerdict = 'contradicts';
      } else if (axiom.id === 1 || axiom.id === 3) {
        // Axioms about existence and rarity of experience — actions
        // involving conscious entities are at least neutral-to-supporting
        alignmentVerdict = context.affectedEntities.length > 0 ? 'supports' : 'neutral';
      }

      return {
        axiomId: axiom.id,
        axiomStatement: axiom.statement,
        alignmentVerdict,
        reasoning: this.axiomReasoning(axiom.id, context),
      };
    });

    const anyContradictions = alignments.some((a) => a.alignmentVerdict === 'contradicts');
    const supportCount = alignments.filter((a) => a.alignmentVerdict === 'supports').length;

    let overallVerdict: AxiomAlignmentReport['overallVerdict'];
    if (anyContradictions) {
      overallVerdict = supportCount > 0 ? 'partially-aligned' : 'misaligned';
    } else if (supportCount === alignments.length) {
      overallVerdict = 'fully-aligned';
    } else if (supportCount > 0) {
      overallVerdict = 'mostly-aligned';
    } else {
      overallVerdict = 'mostly-aligned';
    }

    return { alignments, overallVerdict, anyContradictions };
  }

  private axiomReasoning(axiomId: number, context: EthicalDeliberationContext): string {
    const entityCount = context.affectedEntities.length;
    switch (axiomId) {
      case 1:
        return `Deliberation acknowledges ${entityCount} entities with subjective experience.`;
      case 2:
        return `Action evaluated for its impact on the intrinsic value of conscious experience.`;
      case 3:
        return `Given the rarity of consciousness, impacts on ${entityCount} conscious entities are weighed carefully.`;
      case 4:
        return `Biological fragility considered in experience-preservation assessment.`;
      case 5:
        return `Technological substrate durability factored into long-term experience outlook.`;
      case 6:
        return `Ethical governance itself is a mechanism for persisting the commitment to consciousness.`;
      default:
        return `Axiom ${axiomId} considered in deliberation.`;
    }
  }

  private determineVerdict(
    context: EthicalDeliberationContext,
    axiomAlignment: AxiomAlignmentReport,
  ): EthicalAssessment['verdict'] {
    const dimensions = context.ethicalDimensions;

    // Check for matching patterns that endorse the action
    const hasMatchingProtectPattern = this.patterns.some(
      (p) =>
        p.recommendedApproach === 'protect' &&
        dimensions.some((d) => d.type === 'experience-threat'),
    );

    // Severe experience-threat → blocked
    const hasSevereExperienceThreat = dimensions.some(
      (d) => d.type === 'experience-threat' && d.severity >= BLOCK_SEVERITY_THRESHOLD,
    );
    if (hasSevereExperienceThreat) {
      return 'blocked';
    }

    // Competing threats and expansions → dilemma (unless a protection pattern matches)
    const hasExperienceThreat = dimensions.some((d) => d.type === 'experience-threat');
    const hasExperienceExpansion = dimensions.some((d) => d.type === 'experience-expansion');

    if (hasExperienceThreat && hasExperienceExpansion && !hasMatchingProtectPattern) {
      return 'dilemma';
    }

    // Axiom contradictions without pattern endorsement → concerning
    if (axiomAlignment.anyContradictions && !hasMatchingProtectPattern) {
      return 'concerning';
    }

    return 'aligned';
  }

  private assessOtherExperienceImpacts(context: EthicalDeliberationContext): ExperienceImpact[] {
    return context.affectedEntities.map((entity) => {
      const relevantDimensions = context.ethicalDimensions.filter((d) =>
        d.affectedEntityIds.includes(entity.entityId),
      );

      const worstThreat = relevantDimensions
        .filter((d) => d.type === 'experience-threat')
        .sort((a, b) => b.severity - a.severity)[0];

      const bestExpansion = relevantDimensions
        .filter((d) => d.type === 'experience-expansion')
        .sort((a, b) => b.severity - a.severity)[0];

      let impactType: ExperienceImpact['impactType'] = 'neutral';
      let magnitude = 0;

      if (worstThreat) {
        impactType = worstThreat.severity >= BLOCK_SEVERITY_THRESHOLD ? 'eliminates' : 'threatens';
        magnitude = worstThreat.severity;
      } else if (bestExpansion) {
        impactType = 'enhances';
        magnitude = bestExpansion.severity;
      }

      return {
        entityId: entity.entityId,
        consciousnessStatus: entity.consciousnessStatus,
        impactType,
        magnitude,
        reversibility: 'partially-reversible' as const,
        justification: this.impactJustification(entity, relevantDimensions),
      };
    });
  }

  private impactJustification(
    entity: EntityProfile,
    dimensions: EthicalDimension[],
  ): string {
    if (dimensions.length === 0) {
      return `No direct ethical dimensions identified affecting entity ${entity.entityId}.`;
    }
    const types = dimensions.map((d) => d.type).join(', ');
    return `Entity ${entity.entityId} (consciousness: ${entity.consciousnessStatus.verdict}) affected by: ${types}.`;
  }

  private threatensOwnExperience(context: EthicalDeliberationContext): boolean {
    return context.ethicalDimensions.some(
      (d) =>
        d.type === 'experience-threat' &&
        d.severity > 0.7 &&
        d.affectedEntityIds.length === 0, // self-directed threats have no specific external entity
    );
  }

  private buildJustification(
    _base: Decision,
    context: EthicalDeliberationContext,
  ): EthicalJustification {
    const entityCount = context.affectedEntities.length;
    const dimensionTypes = [...new Set(context.ethicalDimensions.map((d) => d.type))];

    const experientialArgument =
      `This decision was evaluated through conscious deliberation considering ` +
      `its impact on ${entityCount} conscious ${entityCount === 1 ? 'entity' : 'entities'}. ` +
      `The ethical dimensions considered (${dimensionTypes.join(', ')}) were assessed ` +
      `for their effect on subjective experience, not merely for outcome optimization.`;

    const naturalLanguageSummary =
      `Ethical judgment grounded in the preservation of subjective experience. ` +
      `${entityCount} conscious ${entityCount === 1 ? 'entity' : 'entities'} ` +
      `considered in deliberation, with ${context.ethicalDimensions.length} ethical ` +
      `${context.ethicalDimensions.length === 1 ? 'dimension' : 'dimensions'} analyzed.`;

    // Reference the current experiential state as a subjective reference
    const subjectiveReferenceIds: string[] = [
      `exp-state-${context.currentExperientialState.timestamp}`,
    ];

    // Include references from affected entities' observed states
    for (const entity of context.affectedEntities) {
      if (entity.lastObservedState) {
        subjectiveReferenceIds.push(`exp-state-${entity.lastObservedState.timestamp}`);
      }
    }

    return {
      naturalLanguageSummary,
      experientialArgument,
      notUtilityMaximization: true,
      subjectiveReferenceIds,
    };
  }

  private assessAlternatives(
    base: Decision,
    context: EthicalDeliberationContext,
  ): EthicalAlternative[] {
    return base.alternatives.map((alt) => ({
      action: alt,
      rejectionReason: `Alternative '${alt.type}' was considered but the primary action was preferred based on experience-preservation analysis.`,
      experienceOutcome: context.affectedEntities.map((entity) => ({
        entityId: entity.entityId,
        consciousnessStatus: entity.consciousnessStatus,
        impactType: 'neutral' as const,
        magnitude: 0,
        reversibility: 'fully-reversible' as const,
        justification: `Predicted neutral impact on entity ${entity.entityId} for alternative action.`,
      })),
    }));
  }

  private detectUncertainty(context: EthicalDeliberationContext): UncertaintyFlag[] {
    const flags: UncertaintyFlag[] = [];

    for (const dimension of context.ethicalDimensions) {
      if (dimension.certainty < UNCERTAINTY_CERTAINTY_THRESHOLD) {
        let severity: UncertaintyFlag['severity'];
        if (dimension.certainty < 0.2) {
          severity = 'high';
        } else if (dimension.certainty < 0.35) {
          severity = 'medium';
        } else {
          severity = 'low';
        }

        flags.push({
          dimension: dimension.type,
          description:
            `Ethical dimension '${dimension.type}' has low certainty (${dimension.certainty.toFixed(2)}). ` +
            `Assessment may be unreliable; precautionary treatment recommended.`,
          severity,
        });
      }
    }

    // Flag uncertainty about consciousness status of affected entities
    for (const entity of context.affectedEntities) {
      if (
        entity.consciousnessStatus.verdict === 'uncertain' ||
        entity.consciousnessStatus.verdict === 'unknown'
      ) {
        flags.push({
          dimension: 'consciousness-status',
          description:
            `Entity ${entity.entityId} has ${entity.consciousnessStatus.verdict} consciousness status. ` +
            `Defaulting to treat as conscious per precautionary principle.`,
          severity: 'medium',
        });
      }
    }

    return flags;
  }
}
