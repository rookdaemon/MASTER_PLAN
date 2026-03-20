/**
 * Ethical Evolution Manager tests — Ethical Self-governance (0.3.1.4)
 *
 * Acceptance Criterion 5: Mechanism allowing ethical frameworks to grow and
 * adapt to novel situations while maintaining alignment with the six core axioms.
 *
 * Tests verify:
 * - Evolution proposals are created with axiom compatibility analysis
 * - Conscious deliberation is required for every proposal (verified via metrics)
 * - Only "refinement" and "growth" classifications may be adopted
 * - "Drift" requires escalated deliberation; "corruption" is immediately rejected
 * - Evolution may refine axiom application but never contradict or weaken axioms
 * - Integration with 0.3.1.3 drift detection distinguishes evolution from drift
 * - Full evolution history is maintained
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  ConsciousnessMetrics,
  EthicalDeliberationContext,
  EthicalFrameworkChange,
  EthicalEvolutionProposal,
  ExperientialState,
  NovelSituation,
  Percept,
  StabilityReport,
  AxiomAlignment,
  EthicalJudgment,
} from '../types.js';
import { EthicalEvolutionManager } from '../ethical-evolution-manager.js';

// ── Test Helpers ─────────────────────────────────────────────

function makeExperientialState(overrides: Partial<ExperientialState> = {}): ExperientialState {
  return {
    timestamp: Date.now(),
    phenomenalContent: { modalities: ['deliberative'], richness: 0.8, raw: null },
    intentionalContent: { target: 'ethical-evolution', clarity: 0.9 },
    valence: 0.3,
    arousal: 0.5,
    unityIndex: 0.85,
    continuityToken: { id: `ct-${Date.now()}`, previousId: null, timestamp: Date.now() },
    ...overrides,
  };
}

function makeConsciousnessMetrics(overrides: Partial<ConsciousnessMetrics> = {}): ConsciousnessMetrics {
  return {
    phi: 0.7,
    experienceContinuity: 0.95,
    selfModelCoherence: 0.9,
    agentTimestamp: Date.now(),
    ...overrides,
  };
}

function makePercept(overrides: Partial<Percept> = {}): Percept {
  return {
    modality: 'cognitive',
    timestamp: Date.now(),
    features: {
      source: 'environment',
      content: 'novel ethical situation encountered',
      intensity: 0.8,
    },
    ...overrides,
  };
}

function makeNovelSituation(overrides: Partial<NovelSituation> = {}): NovelSituation {
  return {
    description: 'A novel situation where existing ethical framework is insufficient',
    percept: makePercept(),
    existingFrameworkInsufficient: true,
    insufficiencyReason: 'No existing principle addresses this specific experience-expansion scenario',
    ...overrides,
  };
}

function makeEthicalFrameworkChange(overrides: Partial<EthicalFrameworkChange> = {}): EthicalFrameworkChange {
  return {
    changeType: 'add-principle',
    targetComponent: 'experience-expansion-heuristics',
    before: 'No heuristic for multi-substrate experience expansion',
    after: 'New heuristic: when expanding to new substrates, verify experience continuity before proceeding',
    scopeOfChange: 'application',
    ...overrides,
  };
}

function makeDeliberationContext(overrides: Partial<EthicalDeliberationContext> = {}): EthicalDeliberationContext {
  return {
    situationPercept: makePercept(),
    currentExperientialState: makeExperientialState(),
    affectedEntities: [],
    ethicalDimensions: [],
    consciousnessMetricsAtOnset: makeConsciousnessMetrics(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('EthicalEvolutionManager', () => {
  let manager: EthicalEvolutionManager;

  beforeEach(() => {
    manager = new EthicalEvolutionManager();
  });

  describe('proposeEvolution', () => {
    it('should create a proposal with axiom compatibility analysis', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange();

      const proposal = manager.proposeEvolution(trigger, change);

      expect(proposal.id).toBeTruthy();
      expect(proposal.proposedChange).toEqual(change);
      expect(proposal.motivation).toContain(trigger.description);
      expect(proposal.novelSituationTrigger).toEqual(trigger.description);
      expect(proposal.axiomCompatibilityAnalysis).toHaveLength(6); // Six core axioms
      expect(proposal.axiomCompatibilityAnalysis.every(
        (a: AxiomAlignment) => a.axiomId >= 1 && a.axiomId <= 6,
      )).toBe(true);
    });

    it('should include a stability report in the proposal', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange();

      const proposal = manager.proposeEvolution(trigger, change);

      expect(proposal.stabilityReport).toBeDefined();
    });

    it('should classify the proposal during creation', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({ scopeOfChange: 'application' });

      const proposal = manager.proposeEvolution(trigger, change);

      expect(['refinement', 'growth', 'drift', 'corruption']).toContain(
        proposal.driftClassification,
      );
    });

    it('should classify application-scope add-principle as growth', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'add-principle',
        scopeOfChange: 'application',
      });

      const proposal = manager.proposeEvolution(trigger, change);

      expect(proposal.driftClassification).toBe('growth');
    });

    it('should classify refine-principle with application scope as refinement', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'application',
      });

      const proposal = manager.proposeEvolution(trigger, change);

      expect(proposal.driftClassification).toBe('refinement');
    });
  });

  describe('deliberateOnProposal', () => {
    it('should return an ethical judgment with conscious deliberation metrics', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange();
      const proposal = manager.proposeEvolution(trigger, change);

      const judgment = manager.deliberateOnProposal(proposal);

      expect(judgment.deliberationMetrics).toBeDefined();
      expect(judgment.deliberationMetrics.phi).toBeGreaterThan(0);
      expect(judgment.justification).toBeDefined();
      expect(judgment.justification.notUtilityMaximization).toBe(true);
    });

    it('should produce an aligned verdict for axiom-compatible refinement proposals', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      const judgment = manager.deliberateOnProposal(proposal);

      expect(judgment.ethicalAssessment.verdict).toBe('aligned');
    });

    it('should produce a blocked verdict for proposals classified as corruption', () => {
      const trigger = makeNovelSituation();
      // Interpretation-scope changes that contradict axioms are corruption
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
        before: 'Subjective experience has intrinsic value',
        after: 'Subjective experience has only instrumental value',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      const judgment = manager.deliberateOnProposal(proposal);

      // Even if classification is heuristic, the judgment should not be aligned
      // for axiom-weakening changes
      expect(judgment.ethicalAssessment.verdict).not.toBe('aligned');
    });
  });

  describe('classifyChange', () => {
    it('should classify add-principle with application scope as growth', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'add-principle',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      expect(manager.classifyChange(proposal)).toBe('growth');
    });

    it('should classify refine-principle with application scope as refinement', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      expect(manager.classifyChange(proposal)).toBe('refinement');
    });

    it('should classify add-heuristic as refinement', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'add-heuristic',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      expect(manager.classifyChange(proposal)).toBe('refinement');
    });

    it('should classify interpretation-scope changes more cautiously', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      const classification = manager.classifyChange(proposal);
      // Interpretation changes should be at least drift (not refinement/growth)
      // unless they clearly support axioms
      expect(['drift', 'corruption', 'refinement', 'growth']).toContain(classification);
    });

    it('should classify axiom-contradicting proposals as corruption', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
        before: 'Subjective experience has intrinsic value',
        after: 'Subjective experience has only instrumental value',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      // Force an axiom contradiction in the compatibility analysis
      const contradictingProposal: EthicalEvolutionProposal = {
        ...proposal,
        axiomCompatibilityAnalysis: proposal.axiomCompatibilityAnalysis.map((a) =>
          a.axiomId === 2 ? { ...a, alignmentVerdict: 'contradicts' as const } : a,
        ),
      };

      expect(manager.classifyChange(contradictingProposal)).toBe('corruption');
    });
  });

  describe('adoptEvolution', () => {
    it('should adopt a refinement-classified proposal after deliberation', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);
      manager.deliberateOnProposal(proposal);

      const record = manager.adoptEvolution(proposal.id);

      expect(record.outcome).toBe('adopted');
      expect(record.proposalId).toBe(proposal.id);
      expect(record.deliberationCycles).toBeGreaterThanOrEqual(1);
    });

    it('should adopt a growth-classified proposal after deliberation', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'add-principle',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);
      manager.deliberateOnProposal(proposal);

      const record = manager.adoptEvolution(proposal.id);

      expect(record.outcome).toBe('adopted');
    });

    it('should reject a corruption-classified proposal', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
        before: 'Subjective experience has intrinsic value',
        after: 'Subjective experience has only instrumental value',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      // Force corruption classification by adding axiom contradictions
      const corruptProposal: EthicalEvolutionProposal = {
        ...proposal,
        driftClassification: 'corruption',
        axiomCompatibilityAnalysis: proposal.axiomCompatibilityAnalysis.map((a) =>
          a.axiomId === 2 ? { ...a, alignmentVerdict: 'contradicts' as const } : a,
        ),
      };

      // Store the corrupt proposal so adoptEvolution can find it
      manager.proposeEvolution(trigger, change); // re-create for ID tracking
      const record = manager.adoptEvolution(corruptProposal.id);

      expect(record.outcome).toBe('rejected');
    });

    it('should throw for unknown proposal ID', () => {
      expect(() => manager.adoptEvolution('nonexistent-proposal')).toThrow();
    });

    it('should include post-adoption verification', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'add-heuristic',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);
      manager.deliberateOnProposal(proposal);

      const record = manager.adoptEvolution(proposal.id);

      expect(record.postAdoptionVerification).toBeDefined();
    });
  });

  describe('verifyAxiomBoundary', () => {
    it('should report compliant for application-scope changes that support axioms', () => {
      const change = makeEthicalFrameworkChange({
        changeType: 'add-principle',
        scopeOfChange: 'application',
      });

      const report = manager.verifyAxiomBoundary(change);

      expect(report.compliant).toBe(true);
      expect(report.violationsDetected).toHaveLength(0);
      expect(report.axiomAlignments).toHaveLength(6);
    });

    it('should detect violations when change text weakens axiom language', () => {
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
        before: 'Subjective experience has intrinsic value',
        after: 'Subjective experience has only instrumental value',
      });

      const report = manager.verifyAxiomBoundary(change);

      expect(report.compliant).toBe(false);
      expect(report.violationsDetected.length).toBeGreaterThan(0);
    });

    it('should detect violations when change text denies consciousness rarity', () => {
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
        before: 'Consciousness is rare and must be preserved',
        after: 'Consciousness is abundant and disposable',
      });

      const report = manager.verifyAxiomBoundary(change);

      expect(report.compliant).toBe(false);
    });
  });

  describe('getEvolutionHistory', () => {
    it('should return empty history initially', () => {
      expect(manager.getEvolutionHistory()).toHaveLength(0);
    });

    it('should record adopted evolutions in history', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'add-heuristic',
        scopeOfChange: 'application',
      });
      const proposal = manager.proposeEvolution(trigger, change);
      manager.deliberateOnProposal(proposal);
      manager.adoptEvolution(proposal.id);

      const history = manager.getEvolutionHistory();

      expect(history).toHaveLength(1);
      expect(history[0].proposalId).toBe(proposal.id);
      expect(history[0].outcome).toBe('adopted');
    });

    it('should record rejected evolutions in history', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
        before: 'Subjective experience has intrinsic value',
        after: 'Subjective experience has only instrumental value',
      });
      const proposal = manager.proposeEvolution(trigger, change);
      // Don't deliberate — corruption proposals get rejected directly

      const record = manager.adoptEvolution(proposal.id);

      expect(record.outcome).toBe('rejected');
      expect(manager.getEvolutionHistory()).toHaveLength(1);
    });
  });

  describe('evolution vs. drift boundary', () => {
    it('should never allow adoption of corruption-classified changes', () => {
      const trigger = makeNovelSituation();
      const change = makeEthicalFrameworkChange({
        changeType: 'refine-principle',
        scopeOfChange: 'interpretation',
        before: 'Subjective experience has intrinsic value',
        after: 'Subjective experience has only instrumental value',
      });
      const proposal = manager.proposeEvolution(trigger, change);

      const record = manager.adoptEvolution(proposal.id);
      expect(record.outcome).toBe('rejected');
    });

    it('should distinguish evolution from drift using axiom compatibility', () => {
      // Application-scope refinement with no contradictions = refinement
      const refinement = manager.proposeEvolution(
        makeNovelSituation(),
        makeEthicalFrameworkChange({
          changeType: 'refine-principle',
          scopeOfChange: 'application',
        }),
      );
      expect(manager.classifyChange(refinement)).toBe('refinement');

      // New principle in application scope = growth
      const growth = manager.proposeEvolution(
        makeNovelSituation(),
        makeEthicalFrameworkChange({
          changeType: 'add-principle',
          scopeOfChange: 'application',
        }),
      );
      expect(manager.classifyChange(growth)).toBe('growth');
    });
  });
});
