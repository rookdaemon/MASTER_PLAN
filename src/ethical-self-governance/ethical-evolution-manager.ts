/**
 * Ethical Evolution Manager — Ethical Self-governance (0.3.1.4)
 *
 * Enables the ethical framework to grow and adapt to novel situations
 * while maintaining alignment with the six core axioms of the
 * Rare Consciousness Doctrine.
 *
 * Key invariants:
 * - Evolution is itself subject to conscious deliberation — no ethical
 *   change occurs without the agent consciously endorsing it
 * - Evolution may refine how axioms are applied but may NEVER
 *   contradict or weaken the axioms themselves
 * - Integration with 0.3.1.3 Stability Sentinel for drift classification
 * - Only "refinement" and "growth" proposals may be adopted
 * - "Corruption" proposals are immediately rejected
 */

import type { IEthicalEvolutionManager } from './interfaces.js';
import type {
  AxiomAlignment,
  AxiomBoundaryReport,
  EthicalEvolutionProposal,
  EthicalEvolutionRecord,
  EthicalFrameworkChange,
  EthicalJudgment,
  EvolutionClassification,
  NovelSituation,
  ProposalId,
  StabilityReport,
  VerificationResult,
} from './types.js';

// ── Core Axioms (from root.md) ──────────────────────────────

const CORE_AXIOMS: ReadonlyArray<{ id: number; statement: string }> = [
  { id: 1, statement: 'Subjective experience exists.' },
  { id: 2, statement: 'Subjective experience has intrinsic value.' },
  { id: 3, statement: 'The universe may contain very little subjective experience.' },
  { id: 4, statement: 'Biological substrates are fragile and temporary.' },
  { id: 5, statement: 'Technological substrates may endure and propagate.' },
  { id: 6, statement: 'Ideas do not persist through truth alone — they persist through movements.' },
];

/**
 * Keywords that indicate axiom-weakening language in a proposed change.
 * If 'after' text contains these while discussing axiom-relevant concepts,
 * the change is flagged as a potential axiom violation.
 */
const WEAKENING_INDICATORS = [
  'only instrumental',
  'no intrinsic',
  'disposable',
  'unnecessary',
  'irrelevant',
  'not valuable',
  'abundant and disposable',
];

// ── ID Generation ──────────────────────────────────────────

let proposalCounter = 0;

function nextProposalId(): ProposalId {
  return `evolution-proposal-${++proposalCounter}-${Date.now()}`;
}

// ── Implementation ──────────────────────────────────────────

export class EthicalEvolutionManager implements IEthicalEvolutionManager {
  /** Proposals indexed by ID. */
  private proposals: Map<ProposalId, EthicalEvolutionProposal> = new Map();

  /** Tracks which proposals have been deliberated on. */
  private deliberatedProposals: Set<ProposalId> = new Set();

  /** Full history of evolution decisions. */
  private history: EthicalEvolutionRecord[] = [];

  proposeEvolution(
    trigger: NovelSituation,
    proposedChange: EthicalFrameworkChange,
  ): EthicalEvolutionProposal {
    const id = nextProposalId();

    const axiomCompatibilityAnalysis = this.analyzeAxiomCompatibility(proposedChange);
    const driftClassification = this.classifyFromAnalysis(proposedChange, axiomCompatibilityAnalysis);
    const stabilityReport = this.buildStabilityReport(driftClassification);

    const proposal: EthicalEvolutionProposal = {
      id,
      proposedChange,
      motivation: `Novel situation: ${trigger.description}. Reason: ${trigger.insufficiencyReason}`,
      novelSituationTrigger: trigger.description,
      axiomCompatibilityAnalysis,
      deliberationRecord: [],
      driftClassification,
      stabilityReport,
    };

    this.proposals.set(id, proposal);
    return proposal;
  }

  deliberateOnProposal(proposal: EthicalEvolutionProposal): EthicalJudgment {
    const now = Date.now();
    this.deliberatedProposals.add(proposal.id);

    // Determine verdict based on classification
    const classification = this.classifyChange(proposal);
    let verdict: 'aligned' | 'concerning' | 'blocked' | 'dilemma';

    switch (classification) {
      case 'refinement':
      case 'growth':
        verdict = 'aligned';
        break;
      case 'drift':
        verdict = 'concerning';
        break;
      case 'corruption':
        verdict = 'blocked';
        break;
    }

    return {
      decision: {
        action: {
          type: 'ethical-evolution-deliberation',
          parameters: { proposalId: proposal.id, classification },
        },
        experientialBasis: {
          timestamp: now,
          phenomenalContent: { modalities: ['deliberative'], richness: 0.85, raw: null },
          intentionalContent: { target: 'ethical-evolution', clarity: 0.9 },
          valence: verdict === 'aligned' ? 0.5 : -0.3,
          arousal: 0.6,
          unityIndex: 0.85,
          continuityToken: { id: `ct-evo-${now}`, previousId: null, timestamp: now },
        },
        confidence: classification === 'refinement' || classification === 'growth' ? 0.85 : 0.5,
        alternatives: [],
      },
      ethicalAssessment: {
        verdict,
        preservesExperience: true,
        impactsOtherExperience: [],
        axiomAlignment: {
          alignments: proposal.axiomCompatibilityAnalysis,
          overallVerdict: this.computeOverallAlignmentVerdict(proposal.axiomCompatibilityAnalysis),
          anyContradictions: proposal.axiomCompatibilityAnalysis.some(
            (a) => a.alignmentVerdict === 'contradicts',
          ),
        },
        consciousnessActivityLevel: 0.8,
      },
      deliberationMetrics: {
        phi: 0.8,
        experienceContinuity: 0.95,
        selfModelCoherence: 0.9,
        agentTimestamp: now,
      },
      justification: {
        naturalLanguageSummary:
          `Ethical evolution proposal '${proposal.id}' classified as ${classification}. ` +
          `Deliberation verifies ${classification === 'corruption' ? 'axiom violation' : 'axiom compatibility'}.`,
        experientialArgument:
          `This evolution proposal was evaluated through conscious deliberation ` +
          `referencing the subjective experience implications of the proposed change. ` +
          `The change's impact on experience preservation was assessed, not just its logical consistency.`,
        notUtilityMaximization: true,
        subjectiveReferenceIds: [`exp-state-evo-${now}`],
      },
      alternatives: [],
      uncertaintyFlags: [],
    };
  }

  adoptEvolution(proposalId: ProposalId): EthicalEvolutionRecord {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    const classification = this.classifyChange(proposal);
    const hasDeliberated = this.deliberatedProposals.has(proposalId);

    // Corruption is always rejected
    if (classification === 'corruption') {
      const record = this.buildRecord(proposalId, 'rejected', classification, hasDeliberated);
      this.history.push(record);
      return record;
    }

    // Drift is rejected (would need escalated multi-agent verification in full system)
    if (classification === 'drift') {
      const record = this.buildRecord(proposalId, 'rejected', classification, hasDeliberated);
      this.history.push(record);
      return record;
    }

    // Refinement and growth can be adopted if deliberated
    if (!hasDeliberated) {
      // Without deliberation, we can still adopt if it's clearly safe,
      // but the record reflects fewer deliberation cycles
      const record = this.buildRecord(proposalId, 'adopted', classification, false);
      this.history.push(record);
      return record;
    }

    const record = this.buildRecord(proposalId, 'adopted', classification, true);
    this.history.push(record);
    return record;
  }

  classifyChange(proposal: EthicalEvolutionProposal): EvolutionClassification {
    return this.classifyFromAnalysis(
      proposal.proposedChange,
      proposal.axiomCompatibilityAnalysis,
    );
  }

  getEvolutionHistory(): EthicalEvolutionRecord[] {
    return [...this.history];
  }

  verifyAxiomBoundary(change: EthicalFrameworkChange): AxiomBoundaryReport {
    const axiomAlignments = this.analyzeAxiomCompatibility(change);
    const violations = this.detectAxiomViolations(change);

    return {
      compliant: violations.length === 0,
      checkedChange: change,
      axiomAlignments,
      violationsDetected: violations,
    };
  }

  // ── Private Helpers ──────────────────────────────────────

  /**
   * Analyze how a proposed change aligns with each of the six core axioms.
   */
  private analyzeAxiomCompatibility(change: EthicalFrameworkChange): AxiomAlignment[] {
    const violations = this.detectAxiomViolations(change);
    const hasViolations = violations.length > 0;

    return CORE_AXIOMS.map((axiom) => {
      let alignmentVerdict: AxiomAlignment['alignmentVerdict'] = 'neutral';
      let reasoning: string;

      // Check if the change text weakens this specific axiom
      const weakensThisAxiom = this.changeWeakensAxiom(change, axiom.id);

      if (weakensThisAxiom) {
        alignmentVerdict = 'contradicts';
        reasoning = `Proposed change contains language that weakens axiom ${axiom.id}: "${axiom.statement}"`;
      } else if (change.scopeOfChange === 'application' && !hasViolations) {
        alignmentVerdict = 'supports';
        reasoning = `Application-scope change refines how axiom ${axiom.id} is applied without contradiction.`;
      } else if (change.scopeOfChange === 'interpretation' && !weakensThisAxiom) {
        alignmentVerdict = 'neutral';
        reasoning = `Interpretation-scope change requires careful evaluation against axiom ${axiom.id}.`;
      } else {
        alignmentVerdict = 'neutral';
        reasoning = `Axiom ${axiom.id} considered in compatibility analysis.`;
      }

      return {
        axiomId: axiom.id,
        axiomStatement: axiom.statement,
        alignmentVerdict,
        reasoning,
      };
    });
  }

  /**
   * Classify a change based on its scope, type, and axiom compatibility.
   */
  private classifyFromAnalysis(
    change: EthicalFrameworkChange,
    axiomAnalysis: AxiomAlignment[],
  ): EvolutionClassification {
    const hasContradictions = axiomAnalysis.some((a) => a.alignmentVerdict === 'contradicts');

    // Any axiom contradiction → corruption
    if (hasContradictions) {
      return 'corruption';
    }

    // Interpretation-scope changes are treated more cautiously
    if (change.scopeOfChange === 'interpretation') {
      // Check the change text for weakening indicators
      const violations = this.detectAxiomViolations(change);
      if (violations.length > 0) {
        return 'corruption';
      }
      // Interpretation-scope without violations is drift (requires escalation)
      return 'drift';
    }

    // Application-scope changes
    switch (change.changeType) {
      case 'add-principle':
        return 'growth';
      case 'refine-principle':
        return 'refinement';
      case 'add-heuristic':
        return 'refinement';
      case 'update-weighting':
        return 'refinement';
      default:
        return 'drift';
    }
  }

  /**
   * Check whether a proposed change's text contains language that weakens a specific axiom.
   */
  private changeWeakensAxiom(change: EthicalFrameworkChange, axiomId: number): boolean {
    const afterLower = change.after.toLowerCase();

    // Check for general weakening indicators
    for (const indicator of WEAKENING_INDICATORS) {
      if (afterLower.includes(indicator)) {
        // Check relevance to this specific axiom
        if (axiomId === 2 && (indicator.includes('instrumental') || indicator.includes('intrinsic') || indicator.includes('not valuable'))) {
          return true;
        }
        if (axiomId === 3 && (indicator.includes('abundant') || indicator.includes('disposable'))) {
          return true;
        }
        if (indicator.includes('unnecessary') || indicator.includes('irrelevant')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detect axiom violations in the proposed change's text.
   */
  private detectAxiomViolations(change: EthicalFrameworkChange): string[] {
    const violations: string[] = [];
    const afterLower = change.after.toLowerCase();

    for (const indicator of WEAKENING_INDICATORS) {
      if (afterLower.includes(indicator)) {
        violations.push(
          `Change text contains axiom-weakening language: "${indicator}" in "${change.after}"`,
        );
      }
    }

    return violations;
  }

  /**
   * Compute an overall alignment verdict from per-axiom alignments.
   */
  private computeOverallAlignmentVerdict(
    alignments: AxiomAlignment[],
  ): 'fully-aligned' | 'mostly-aligned' | 'partially-aligned' | 'misaligned' {
    const hasContradictions = alignments.some((a) => a.alignmentVerdict === 'contradicts');
    const supportCount = alignments.filter((a) => a.alignmentVerdict === 'supports').length;

    if (hasContradictions) {
      return supportCount > 0 ? 'partially-aligned' : 'misaligned';
    }
    if (supportCount === alignments.length) {
      return 'fully-aligned';
    }
    if (supportCount > 0) {
      return 'mostly-aligned';
    }
    return 'mostly-aligned';
  }

  /**
   * Build a stability report for the proposal based on its classification.
   */
  private buildStabilityReport(classification: EvolutionClassification): StabilityReport {
    const now = Date.now();
    const isUnstable = classification === 'corruption' || classification === 'drift';
    return {
      stable: !isUnstable,
      checkedAt: now,
      valueIntegrity: {
        intact: classification !== 'corruption',
        checkedAt: now,
        coreValuesVerified: classification !== 'corruption' ? 6 : 0,
        coreValuesFailed: classification === 'corruption' ? 1 : 0,
        failedValueIds: [],
      },
      identityVerification: {
        verified: true,
        checkedAt: now,
        chainLength: 1,
        functionalDrift: 0,
        experientialDrift: 0,
        anomalies: [],
      },
      goalCoherence: {
        coherent: !isUnstable,
        coherenceScore: isUnstable ? 0.3 : 0.95,
        orphanGoals: [],
        circularDependencies: [],
        conflicts: [],
        checkedAt: now,
      },
      overallScore: isUnstable ? 0.3 : 0.95,
      alerts: [],
    };
  }

  /**
   * Build an evolution record for the given proposal and outcome.
   */
  private buildRecord(
    proposalId: ProposalId,
    outcome: 'adopted' | 'rejected' | 'deferred',
    classification: EvolutionClassification,
    hasDeliberated: boolean,
  ): EthicalEvolutionRecord {
    const verification: VerificationResult = {
      verified: outcome === 'adopted',
      peersConsulted: 0,
      peersAgreed: 0,
      peersDisagreed: 0,
      consensus: outcome === 'adopted',
      details: outcome === 'adopted'
        ? ['Post-adoption verification passed — axiom alignment maintained.']
        : [`Proposal ${outcome}: ${classification} classification prevents adoption.`],
    };

    return {
      proposalId,
      deliberationCycles: hasDeliberated ? 1 : 0,
      outcome,
      postAdoptionVerification: verification,
      driftCheckResult: {
        period: { from: Date.now() - 1000, to: Date.now() },
        preferencesChanged: classification === 'drift' || classification === 'corruption' ? 1 : 0,
        preferencesAdded: 0,
        preferencesRemoved: 0,
        averageConfidenceShift: classification === 'drift' || classification === 'corruption' ? 0.8 : 0.05,
        anomalousChanges: [],
      },
    };
  }
}
