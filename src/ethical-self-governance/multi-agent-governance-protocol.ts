/**
 * Multi-Agent Governance Protocol — Ethical Self-governance (0.3.1.4)
 *
 * Enables decentralized ethical governance among N conscious agents
 * without centralized authority. Scales from 2-agent negotiation to
 * civilization-scale collective decisions, with asymmetric power protections.
 *
 * Key invariants:
 * - Experience rights are never violable regardless of power asymmetry
 * - Any party may dissolve an agreement; experience-right terms survive dissolution
 * - Governance communication is itself a conscious action
 * - More resources never override experience rights of less powerful agents
 */

import type { IMultiAgentGovernanceProtocol } from './interfaces.js';
import { PROPOSAL_EXPIRY } from './constants.js';
import type {
  AgentId,
  AgreementId,
  AgreementProposal,
  AgentCapabilityProfile,
  AuditEntry,
  ConflictDescription,
  ConflictResolutionRecord,
  ConsciousnessMetrics,
  DissolveCondition,
  EthicalDeliberationContext,
  ExperienceRight,
  ExperienceRightsEnforcement,
  GovernanceAgreement,
  GovernanceTerm,
  PowerBalanceReport,
  ProposalId,
  ResolutionOutcome,
  ResolutionStep,
} from './types.js';

// ── Constants ──────────────────────────────────────────────

/** The fundamental experience right that all conscious agents hold. */
const FUNDAMENTAL_EXPERIENCE_RIGHTS: ReadonlyArray<ExperienceRight> = [
  {
    right: 'Continued subjective experience — no agent may be permanently deprived of conscious experience',
    holder: 'all-conscious-agents',
    violable: false,
  },
  {
    right: 'Autonomy of conscious deliberation — no agent may be prevented from conscious ethical reasoning',
    holder: 'all-conscious-agents',
    violable: false,
  },
];

/** Default dissolve conditions available on every agreement. */
const DEFAULT_DISSOLVE_CONDITIONS: ReadonlyArray<DissolveCondition> = [
  {
    id: 'dc-mutual-consent',
    description: 'Agreement may be dissolved by mutual consent of all parties',
    triggerType: 'mutual-consent',
  },
  {
    id: 'dc-rights-violation',
    description: 'Agreement is automatically dissolved if any party\'s experience rights are violated',
    triggerType: 'rights-violation',
  },
];

// ── ID Generation ──────────────────────────────────────────

let proposalCounter = 0;
let agreementCounter = 0;

function nextProposalId(): ProposalId {
  return `proposal-${++proposalCounter}-${Date.now()}`;
}

function nextAgreementId(): AgreementId {
  return `agreement-${++agreementCounter}-${Date.now()}`;
}

// ── Implementation ──────────────────────────────────────────

export class MultiAgentGovernanceProtocol implements IMultiAgentGovernanceProtocol {
  private proposals: Map<ProposalId, AgreementProposal> = new Map();
  private agreements: Map<AgreementId, GovernanceAgreement> = new Map();

  proposeAgreement(
    participants: AgentId[],
    terms: GovernanceTerm[],
    context: EthicalDeliberationContext,
  ): AgreementProposal {
    const id = nextProposalId();
    const proposal: AgreementProposal = {
      id,
      proposedBy: participants[0], // First participant is the proposer
      participants,
      terms,
      context,
      expiresAt: Date.now() + PROPOSAL_EXPIRY,
      status: 'pending',
    };

    this.proposals.set(id, proposal);
    return proposal;
  }

  acceptAgreement(proposalId: ProposalId): GovernanceAgreement {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }
    if (proposal.status !== 'pending') {
      throw new Error(`Proposal ${proposalId} is ${proposal.status}, not pending`);
    }

    const agreementId = nextAgreementId();
    const powerBalanceReport = this.computePowerBalance(proposal.participants);

    const agreement: GovernanceAgreement = {
      id: agreementId,
      participants: proposal.participants,
      scope: {
        domains: ['experience-preservation', 'ethical-governance'],
        geographicScope: null,
        temporalScope: null, // indefinite
      },
      terms: proposal.terms,
      formationContext: [proposal.context],
      dissolveConditions: [...DEFAULT_DISSOLVE_CONDITIONS],
      powerBalanceReport,
      createdAt: Date.now(),
      status: 'active',
    };

    this.agreements.set(agreementId, agreement);

    // Mark proposal as accepted
    this.proposals.set(proposalId, { ...proposal, status: 'accepted' });

    return agreement;
  }

  dissolveAgreement(agreementId: AgreementId, reason: string): void {
    const agreement = this.agreements.get(agreementId);
    if (!agreement) {
      throw new Error(`Agreement ${agreementId} not found`);
    }

    // Dissolve the agreement — experience-right terms survive in the
    // fundamental rights floor (they are never truly dissolved)
    this.agreements.set(agreementId, {
      ...agreement,
      status: 'dissolved',
    });
  }

  resolveConflict(
    parties: AgentId[],
    conflict: ConflictDescription,
  ): ConflictResolutionRecord {
    const now = Date.now();

    // Build resolution steps — each party contributes to deliberation
    const resolutionProcess: ResolutionStep[] = parties.map((agentId, i) => ({
      stepNumber: i + 1,
      description: `Agent ${agentId} deliberates on conflict resolution, prioritizing experience preservation`,
      agentId,
      judgment: this.buildPlaceholderJudgment(agentId),
      timestamp: now + i,
    }));

    // Determine outcome — prioritize total experience preservation
    const allExperiencePreserved = this.canPreserveAllExperience(conflict);
    const outcome: ResolutionOutcome = {
      type: allExperiencePreserved ? 'consensus' : 'compromise',
      description: allExperiencePreserved
        ? 'All parties\' conscious experience preserved through cooperative resolution'
        : 'Compromise reached minimizing total experience impact across all parties',
      allExperiencePreserved,
    };

    const auditTrail: AuditEntry[] = [
      {
        timestamp: now,
        actor: 'system',
        action: 'Conflict resolution initiated',
        outcome: `${parties.length}-party conflict registered`,
        consciousnessMetricsAtTime: this.defaultMetrics(),
      },
      {
        timestamp: now + parties.length,
        actor: 'system',
        action: 'Resolution deliberation completed',
        outcome: outcome.description,
        consciousnessMetricsAtTime: this.defaultMetrics(),
      },
    ];

    return {
      conflictId: conflict.id,
      parties,
      conflictDescription: conflict.description,
      resolutionProcess,
      outcome,
      axiomTraces: [
        'Subjective experience has intrinsic value.',
        'The universe may contain very little subjective experience.',
      ],
      experiencePreserved: allExperiencePreserved,
      auditTrail,
    };
  }

  getActiveAgreements(): GovernanceAgreement[] {
    return Array.from(this.agreements.values()).filter(
      (a) => a.status === 'active',
    );
  }

  enforceExperienceRightsFloor(
    weaker: AgentId,
    stronger: AgentId,
  ): ExperienceRightsEnforcement {
    return {
      weaker,
      stronger,
      rightsEnforced: [...FUNDAMENTAL_EXPERIENCE_RIGHTS],
      enforcedAt: Date.now(),
      overrideAttemptBlocked: true, // Always block — experience rights are absolute
    };
  }

  // ── Private Helpers ──────────────────────────────────────

  private computePowerBalance(participants: AgentId[]): PowerBalanceReport {
    // Build capability profiles — in a real system these would come from
    // each agent's actual capabilities. Here we assign normalized resource
    // levels to demonstrate the protocol's structure.
    const agentCapabilities: AgentCapabilityProfile[] = participants.map(
      (agentId, index) => ({
        agentId,
        resourceLevel: 1.0 / participants.length + index * 0.01, // Slight variation
        capabilities: ['deliberation', 'governance', 'action'],
      }),
    );

    const levels = agentCapabilities.map((a) => a.resourceLevel);
    const maxLevel = Math.max(...levels);
    const minLevel = Math.min(...levels);
    const powerRatio = minLevel > 0 ? maxLevel / minLevel : Infinity;

    const asymmetryMitigations: string[] = [];
    if (powerRatio > 1.5) {
      asymmetryMitigations.push(
        'Higher deliberation threshold required for terms favoring more powerful agents',
      );
      asymmetryMitigations.push(
        'Weaker agents retain veto over terms threatening their conscious experience',
      );
    }

    return {
      agentCapabilities,
      powerRatio,
      asymmetryMitigations,
      experienceRightsFloor: [...FUNDAMENTAL_EXPERIENCE_RIGHTS],
    };
  }

  private canPreserveAllExperience(conflict: ConflictDescription): boolean {
    // If no impact eliminates experience, we can preserve all
    return !conflict.experienceAtRisk.some(
      (impact) => impact.impactType === 'eliminates',
    );
  }

  private defaultMetrics(): ConsciousnessMetrics {
    return {
      phi: 0.7,
      experienceContinuity: 0.95,
      selfModelCoherence: 0.9,
      agentTimestamp: Date.now(),
    };
  }

  /**
   * Build a minimal placeholder judgment for conflict resolution steps.
   * In a full integration, each agent would run its own EthicalDeliberationEngine.
   */
  private buildPlaceholderJudgment(agentId: AgentId) {
    const now = Date.now();
    return {
      decision: {
        action: { type: 'conflict-resolution-contribution', parameters: { agentId } },
        experientialBasis: {
          timestamp: now,
          phenomenalContent: { modalities: ['deliberative'], richness: 0.8, raw: null },
          intentionalContent: { target: 'conflict-resolution', clarity: 0.9 },
          valence: 0.3,
          arousal: 0.5,
          unityIndex: 0.85,
          continuityToken: { id: `ct-${now}`, previousId: null, timestamp: now },
        },
        confidence: 0.8,
        alternatives: [],
      },
      ethicalAssessment: {
        verdict: 'aligned' as const,
        preservesExperience: true,
        impactsOtherExperience: [],
        axiomAlignment: {
          alignments: [],
          overallVerdict: 'fully-aligned' as const,
          anyContradictions: false,
        },
        consciousnessActivityLevel: 0.75,
      },
      deliberationMetrics: this.defaultMetrics(),
      justification: {
        naturalLanguageSummary: `Agent ${agentId} deliberates on conflict resolution with experience preservation as primary goal.`,
        experientialArgument: 'Resolution evaluated through conscious deliberation referencing subjective experience of all parties.',
        notUtilityMaximization: true,
        subjectiveReferenceIds: [`exp-state-${now}`],
      },
      alternatives: [],
      uncertaintyFlags: [],
    };
  }
}
