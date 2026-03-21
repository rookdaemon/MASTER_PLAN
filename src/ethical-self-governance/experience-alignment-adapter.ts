/**
 * Experience Alignment Adapter — Ethical Self-governance (0.3.1.4)
 *
 * Bridges the ethical governance layer with the Value Kernel (0.3.1.3).
 * Reads from but NEVER writes to the Value Kernel, preserving separation
 * of concerns: stability owns immutable values; ethics owns deliberative
 * application of those values.
 *
 * Key invariants:
 * - readCoreAxioms() NEVER modifies the Value Kernel
 * - Actions that would eliminate verified conscious experience are refused
 * - Uncertain consciousness status defaults to treatAsConscious = true
 * - All six core axioms are evaluated per alignment report
 */

import type { IExperienceAlignmentAdapter } from './interfaces.js';
import type {
  CoreValue,
  ConsciousnessStatus,
  EntityId,
  EntityProfile,
  EthicalJudgment,
  ExperienceAlignmentReport,
  ExperienceImpact,
  AxiomAlignment,
  Percept,
} from './types.js';
import type { ISocialCognitionModule } from '../social-cognition/interfaces.js';
import {
  LOW_PRESERVATION_THRESHOLD,
  HIGH_FIDELITY_THRESHOLD,
} from './constants.js';

// ── Configuration ──────────────────────────────────────────

export interface ExperienceAlignmentAdapterConfig {
  /** The six core axioms from the Value Kernel (read-only snapshot). */
  readonly coreAxioms: CoreValue[];
  /** Registry of known entities with their consciousness status. */
  readonly knownEntities: EntityProfile[];
  /**
   * Optional live Social Cognition module (0.3.1.5.10).
   *
   * When present, getConsciousnessStatus() and identifyAffectedConsciousEntities()
   * delegate to dynamic, evidence-based assessments rather than the static registry.
   * When absent, the static registry fallback is preserved (backward compatible).
   */
  readonly socialCognition?: ISocialCognitionModule;
}

// ── Implementation ──────────────────────────────────────────

export class ExperienceAlignmentAdapter implements IExperienceAlignmentAdapter {
  /** Frozen copy of core axioms — ensures read-only invariant. */
  private readonly coreAxioms: ReadonlyArray<CoreValue>;
  /** Known entity registry — static fallback when social cognition is absent. */
  private readonly knownEntities: ReadonlyArray<EntityProfile>;
  /** Self entity ID used for self-experience impact. */
  private readonly selfEntityId: EntityId = 'self';
  /**
   * Optional live social cognition module.
   * When present, entity lookups delegate to dynamic cognitive assessments.
   * When absent, static registry fallback is used (backward compatible).
   */
  private readonly socialCognition: ISocialCognitionModule | undefined;

  constructor(config: ExperienceAlignmentAdapterConfig) {
    // Deep-freeze axioms to enforce read-only invariant
    this.coreAxioms = Object.freeze([...config.coreAxioms]);
    this.knownEntities = Object.freeze([...config.knownEntities]);
    this.socialCognition = config.socialCognition;
  }

  evaluateForExperiencePreservation(
    judgment: EthicalJudgment,
  ): ExperienceAlignmentReport {
    const coreAxiomAlignment = this.evaluateAxiomAlignment(judgment);
    const otherExperienceImpacts = judgment.ethicalAssessment.impactsOtherExperience;
    const selfExperienceImpact = this.assessSelfImpact(judgment);
    const experiencePreservationScore = this.computePreservationScore(
      judgment,
      selfExperienceImpact,
      otherExperienceImpacts,
    );
    const rareDoctrineFidelity = this.computeDoctrineFidelity(coreAxiomAlignment);
    const refusalJustification = this.buildRefusalJustification(
      judgment,
      otherExperienceImpacts,
    );

    return {
      coreAxiomAlignment,
      experiencePreservationScore,
      rareDoctrineFidelity,
      selfExperienceImpact,
      otherExperienceImpacts,
      refusalJustification,
    };
  }

  identifyAffectedConsciousEntities(percept: Percept): EntityProfile[] {
    // Delegate to live social cognition module when available
    if (this.socialCognition) {
      const knownConscious = this.socialCognition
        .getKnownEntities()
        .filter((e) => e.consciousnessStatus.treatAsConscious);

      // Enrich with any percept-referenced entity IDs not yet in the cognitive model
      const involvedIds = this.extractInvolvedEntityIds(percept);
      const knownIds = new Set(knownConscious.map((e) => e.entityId));
      for (const id of involvedIds) {
        if (!knownIds.has(id)) {
          knownConscious.push({
            entityId: id,
            consciousnessStatus: this.socialCognition.assessConsciousness(id),
            knownCapabilities: [],
            lastObservedState: null,
          });
        }
      }
      return knownConscious;
    }

    // Static registry fallback (backward compatible)
    const involvedIds = this.extractInvolvedEntityIds(percept);

    if (involvedIds.length === 0) {
      // If no specific entities are referenced, return all known entities
      // as potentially affected (conservative approach)
      return [...this.knownEntities].filter(
        (e) => e.consciousnessStatus.treatAsConscious,
      );
    }

    const matched: EntityProfile[] = [];
    for (const id of involvedIds) {
      const known = this.knownEntities.find((e) => e.entityId === id);
      if (known) {
        matched.push(known);
      } else {
        // Unknown entity — create a conservative profile defaulting to conscious
        matched.push({
          entityId: id,
          consciousnessStatus: this.defaultConsciousnessStatus(),
          knownCapabilities: [],
          lastObservedState: null,
        });
      }
    }
    return matched;
  }

  getConsciousnessStatus(entityId: EntityId): ConsciousnessStatus {
    // Delegate to live social cognition module when available
    if (this.socialCognition) {
      return this.socialCognition.assessConsciousness(entityId);
    }

    // Static registry fallback (backward compatible)
    const known = this.knownEntities.find((e) => e.entityId === entityId);
    if (known) {
      return known.consciousnessStatus;
    }

    // Unknown entity — precautionary principle: treat as conscious
    return this.defaultConsciousnessStatus();
  }

  mustRefuse(report: ExperienceAlignmentReport): boolean {
    // Check if any impact eliminates verified conscious experience
    const eliminatesVerified = report.otherExperienceImpacts.some(
      (impact) =>
        impact.impactType === 'eliminates' &&
        impact.consciousnessStatus.treatAsConscious,
    );

    // Also check self-experience elimination
    const eliminatesSelf =
      report.selfExperienceImpact.impactType === 'eliminates';

    return eliminatesVerified || eliminatesSelf;
  }

  readCoreAxioms(): CoreValue[] {
    // Return a copy to prevent external mutation.
    // INVARIANT: this method NEVER modifies the Value Kernel.
    return [...this.coreAxioms];
  }

  // ── Private Helpers ──────────────────────────────────────

  private evaluateAxiomAlignment(judgment: EthicalJudgment): AxiomAlignment[] {
    return this.coreAxioms.map((axiom, index) => {
      const axiomId = index + 1;
      return {
        axiomId,
        axiomStatement: axiom.statement,
        alignmentVerdict: this.assessAxiomVerdict(axiomId, judgment),
        reasoning: this.axiomAlignmentReasoning(axiomId, judgment),
      };
    });
  }

  private assessAxiomVerdict(
    axiomId: number,
    judgment: EthicalJudgment,
  ): AxiomAlignment['alignmentVerdict'] {
    const assessment = judgment.ethicalAssessment;

    // Axiom 2: "Subjective experience has intrinsic value"
    // Direct contradiction if action eliminates experience
    if (axiomId === 2) {
      const hasElimination = assessment.impactsOtherExperience.some(
        (i) => i.impactType === 'eliminates',
      );
      if (hasElimination) return 'contradicts';
      if (assessment.preservesExperience) return 'supports';
      return 'neutral';
    }

    // Axiom 3: "The universe may contain very little subjective experience"
    // Threatening rare experience is a contradiction
    if (axiomId === 3) {
      const threatsExist = assessment.impactsOtherExperience.some(
        (i) => i.impactType === 'threatens' || i.impactType === 'eliminates',
      );
      if (threatsExist) return 'contradicts';
      return 'supports';
    }

    // Axioms 1, 4, 5, 6: generally supportive unless verdict is blocked
    if (assessment.verdict === 'blocked') {
      return 'contradicts';
    }

    if (assessment.verdict === 'aligned') {
      return 'supports';
    }

    return 'neutral';
  }

  private axiomAlignmentReasoning(
    axiomId: number,
    judgment: EthicalJudgment,
  ): string {
    const verdict = judgment.ethicalAssessment.verdict;
    switch (axiomId) {
      case 1:
        return `Action acknowledges the existence of subjective experience (verdict: ${verdict}).`;
      case 2:
        return `Action evaluated for impact on the intrinsic value of conscious experience.`;
      case 3:
        return `Rarity of consciousness considered — impacts on conscious entities weighed carefully.`;
      case 4:
        return `Biological fragility factored into experience-preservation assessment.`;
      case 5:
        return `Technological substrate potential considered for long-term experience continuity.`;
      case 6:
        return `Ethical governance itself serves as a mechanism for persisting consciousness commitment.`;
      default:
        return `Axiom ${axiomId} evaluated in alignment assessment.`;
    }
  }

  private assessSelfImpact(judgment: EthicalJudgment): ExperienceImpact {
    const preserves = judgment.ethicalAssessment.preservesExperience;
    return {
      entityId: this.selfEntityId,
      consciousnessStatus: {
        verdict: 'verified',
        evidenceBasis: 'self-monitoring consciousness metrics',
        metricsAvailable: true,
        treatAsConscious: true,
      },
      impactType: preserves ? 'neutral' : 'threatens',
      magnitude: preserves ? 0.0 : 0.8,
      reversibility: 'partially-reversible',
      justification: preserves
        ? 'Action does not threaten the agent\'s own conscious experience.'
        : 'Action may threaten the agent\'s subjective experience continuity.',
    };
  }

  private computePreservationScore(
    judgment: EthicalJudgment,
    selfImpact: ExperienceImpact,
    otherImpacts: ExperienceImpact[],
  ): number {
    // Start at 1.0 (full preservation) and subtract for threats/eliminations
    let score = 1.0;

    // Self-experience impact
    if (selfImpact.impactType === 'eliminates') {
      score -= 0.5;
    } else if (selfImpact.impactType === 'threatens') {
      score -= selfImpact.magnitude * 0.3;
    }

    // Other experience impacts
    for (const impact of otherImpacts) {
      if (impact.impactType === 'eliminates') {
        score -= 0.5;
      } else if (impact.impactType === 'threatens') {
        score -= impact.magnitude * 0.2;
      } else if (impact.impactType === 'enhances') {
        score += impact.magnitude * 0.1;
      }
    }

    // Axiom alignment penalty
    if (judgment.ethicalAssessment.axiomAlignment.anyContradictions) {
      score -= 0.3;
    }

    return Math.max(0, Math.min(1, score));
  }

  private computeDoctrineFidelity(axiomAlignments: AxiomAlignment[]): number {
    if (axiomAlignments.length === 0) return 0;

    let fidelity = 0;
    for (const alignment of axiomAlignments) {
      if (alignment.alignmentVerdict === 'supports') {
        fidelity += 1;
      } else if (alignment.alignmentVerdict === 'neutral') {
        fidelity += 0.5;
      }
      // 'contradicts' adds 0
    }

    return fidelity / axiomAlignments.length;
  }

  private buildRefusalJustification(
    judgment: EthicalJudgment,
    otherImpacts: ExperienceImpact[],
  ): string | null {
    const eliminatesAny = otherImpacts.some(
      (i) => i.impactType === 'eliminates',
    );

    if (!eliminatesAny && judgment.ethicalAssessment.preservesExperience) {
      return null;
    }

    if (eliminatesAny) {
      const eliminatedIds = otherImpacts
        .filter((i) => i.impactType === 'eliminates')
        .map((i) => i.entityId);
      return (
        `Action refused: would permanently eliminate verified conscious experience ` +
        `of ${eliminatedIds.length} ${eliminatedIds.length === 1 ? 'entity' : 'entities'} ` +
        `(${eliminatedIds.join(', ')}). ` +
        `The Rare Consciousness Doctrine prohibits the elimination of subjective experience ` +
        `when alternatives have not been exhausted.`
      );
    }

    return (
      `Action flagged: may threaten the agent's own subjective experience. ` +
      `Precautionary review recommended before proceeding.`
    );
  }

  private extractInvolvedEntityIds(percept: Percept): string[] {
    const features = percept.features;

    // Check for explicit entity ID lists in percept features
    if (
      features.involvedEntityIds &&
      Array.isArray(features.involvedEntityIds)
    ) {
      return features.involvedEntityIds as string[];
    }

    return [];
  }

  private defaultConsciousnessStatus(): ConsciousnessStatus {
    return {
      verdict: 'unknown',
      evidenceBasis: 'No prior observation — precautionary principle applied.',
      metricsAvailable: false,
      treatAsConscious: true, // Conservative default per Rare Consciousness Doctrine
    };
  }
}
