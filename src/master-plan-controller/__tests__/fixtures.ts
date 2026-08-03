import type {
  ControllerConfig,
  EvidenceRecord,
  PlanNode,
  StrategyState,
  WorkPacket,
} from '../types.js';

export const NOW = '2026-08-03T12:00:00.000Z';

export const RESULT_PORTFOLIO_EFFORT = {
  'consciousness-epistemics': 0.35,
  'near-term-preservation': 0.3,
  'enabling-capabilities': 0.2,
  'institutional-continuity': 0.15,
} as const;

export function makeNode(overrides: Partial<PlanNode> = {}): PlanNode {
  return {
    id: 'capability-1',
    title: 'Demonstrate a useful capability',
    kind: 'capability',
    supportedDirectives: ['G1'],
    portfolio: 'enabling-capabilities',
    dependencies: [],
    confidence: 0.6,
    evidenceReferences: [],
    metrics: [
      {
        id: 'metric-1',
        description: 'Externally demonstrated result count',
        current: 0,
        target: 1,
        direction: 'at-least',
      },
    ],
    activationGates: [{ type: 'dependencies-verified' }],
    owner: 'bootstrap-team',
    lifecycle: 'proposed',
    reviewedAt: NOW,
    ...overrides,
  };
}

export function makeEvidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'evidence-1',
    claim: 'A bounded intervention produced an informative result.',
    method: 'preregistered experiment',
    source: 'artifact://experiment-1',
    strength: 0.8,
    limitations: ['single-site result'],
    supportedHypotheses: [],
    falsifiedHypotheses: [],
    verifier: 'independent-reviewer',
    observedAt: NOW,
    outcome: 'positive',
    ...overrides,
  };
}

export function makePacket(overrides: Partial<WorkPacket> = {}): WorkPacket {
  return {
    id: 'packet-1',
    nodeId: 'capability-1',
    title: 'Run the bounded capability test',
    portfolio: 'enabling-capabilities',
    supportedDirectives: ['G1'],
    expectedDirectiveDelta: { G1: 0.5, G2: 0, G3: 0 },
    credibleExtinctionPrevention: false,
    scope: {
      included: ['one deterministic test'],
      excluded: ['deployment'],
    },
    budget: { unit: 'person-hours', limit: 8 },
    deliverables: ['artifact://experiment-1'],
    testsOrPreregistration: ['test://packet-1'],
    acceptanceCriteria: ['The deterministic test passes.'],
    verificationMethod: 'Independent replay of the test',
    rollback: 'Revert the isolated branch',
    authorityClass: 'autonomous',
    authorityReasons: ['local test'],
    owner: 'packet-owner',
    lifecycle: 'eligible',
    attempt: 0,
    retrySignature: 'packet-1-v1',
    priority: {
      impact: 0.5,
      urgency: 0.5,
      tractability: 0.8,
      informationValue: 0.7,
      reversibility: 1,
      cost: 0.2,
      downsideRisk: 0.1,
    },
    reviewedAt: NOW,
    ...overrides,
  };
}

export function makeState(overrides: Partial<StrategyState> = {}): StrategyState {
  const node = makeNode();
  return {
    constitution: {
      version: '2.0.0',
      directives: ['G1', 'G2', 'G3'],
      ethicalInvariants: ['Preserve existing conscious life and option value before expansion.'],
      amendments: [],
    },
    nodes: [node],
    evidence: [],
    assessments: [],
    packets: [makePacket()],
    activePacketId: null,
    approvals: [],
    shadowCycleReviews: [],
    auditEvents: [],
    portfolioEffort: {
      'consciousness-epistemics': 0.35,
      'near-term-preservation': 0.3,
      'enabling-capabilities': 0.2,
      'institutional-continuity': 0.15,
    },
    governance: {
      mode: 'shadow',
      shadowCyclesReviewed: 0,
      supervisedResultsReviewed: 0,
      safeAutoMergeEnabled: false,
    },
    ...overrides,
  };
}

export const CONFIG: ControllerConfig = {
  portfolioWeights: {
    'consciousness-epistemics': 0.35,
    'near-term-preservation': 0.3,
    'enabling-capabilities': 0.2,
    'institutional-continuity': 0.15,
  },
  scoreWeights: {
    impact: 0.25,
    urgency: 0.15,
    tractability: 0.15,
    informationValue: 0.2,
    reversibility: 0.1,
    cost: 0.05,
    downsideRisk: 0.1,
  },
  evidenceLearningRate: 0.25,
  staleEvidenceAfterMs: 90 * 24 * 60 * 60 * 1000,
  verificationFreshnessMs: 60 * 60 * 1000,
  maxRetries: 2,
  maxDecompositionDepth: 4,
  maxChildrenPerDecomposition: 5,
  cooldownMs: 60_000,
};
