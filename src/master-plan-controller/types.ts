export type Timestamp = string;

export type Directive = 'G1' | 'G2' | 'G3';
export type NodeKind = 'objective' | 'hypothesis' | 'capability' | 'program' | 'work_packet';
export type Portfolio =
  | 'consciousness-epistemics'
  | 'near-term-preservation'
  | 'enabling-capabilities'
  | 'institutional-continuity';
export type LifecycleState =
  | 'proposed'
  | 'eligible'
  | 'active'
  | 'verifying'
  | 'verified'
  | 'blocked'
  | 'invalidated'
  | 'retired';

export interface Metric {
  id: string;
  description: string;
  current: number;
  target: number;
  direction: 'at-least' | 'at-most' | 'exactly';
}

export type ActivationGate =
  | { type: 'dependencies-verified' }
  | { type: 'minimum-confidence'; minimum: number }
  | { type: 'fresh-evidence'; minimumStrength: number; maxAgeMs: number }
  | { type: 'metric-target'; metricId: string }
  | { type: 'node-verified'; nodeId: string };

export interface PlanNode {
  id: string;
  title: string;
  kind: NodeKind;
  supportedDirectives: Directive[];
  portfolio?: Portfolio;
  dependencies: string[];
  confidence: number;
  evidenceReferences: string[];
  metrics: Metric[];
  activationGates: ActivationGate[];
  owner: string | null;
  lifecycle: LifecycleState;
  reviewedAt: Timestamp;
  constitutionalImpact?: 'none' | 'interpretation' | 'amendment';
  legacyPlanReferences?: string[];
  externallyDemonstrated?: boolean;
}

export interface EvidenceRecord {
  id: string;
  claim: string;
  method: string;
  source: string;
  strength: number;
  limitations: string[];
  supportedHypotheses: string[];
  falsifiedHypotheses: string[];
  verifier: string;
  observedAt: Timestamp;
  outcome: 'positive' | 'negative' | 'null';
}

export type AuthorityClass = 'autonomous' | 'agent-reviewed' | 'human-escalation';

export type EscalationIssueKind =
  | 'owner-credential'
  | 'physical-presence'
  | 'legal-consent'
  | 'constitutional-conflict'
  | 'ci-failure'
  | 'review-unavailable'
  | 'uncertainty'
  | 'novelty'
  | 'high-risk';

export interface AutomatedAttempt {
  description: string;
  evidenceReference: string;
  outcome: 'failed' | 'succeeded';
  attemptedAt: Timestamp;
}

export type BoundedHumanOperation =
  | 'provide-owner-credential'
  | 'perform-physical-act'
  | 'record-legal-consent'
  | 'resolve-constitutional-conflict';

export interface BoundedHumanDecision {
  operation: BoundedHumanOperation;
  scope: string;
  expectedOutput: string;
}

export interface EscalationRecord {
  id: string;
  packetId: string;
  kind: EscalationIssueKind;
  automationImpossibility: string;
  automatedAttempts: AutomatedAttempt[];
  decisionRequested: BoundedHumanDecision;
  assessedBy: 'escalation-policy';
  assessedAt: Timestamp;
}

export interface PriorityFactors {
  impact: number;
  urgency: number;
  tractability: number;
  informationValue: number;
  reversibility: number;
  cost: number;
  downsideRisk: number;
}

export interface WorkPacket {
  id: string;
  nodeId: string;
  title: string;
  portfolio: Portfolio;
  supportedDirectives: Directive[];
  expectedDirectiveDelta: Record<Directive, number>;
  credibleExtinctionPrevention: boolean;
  scope: { included: string[]; excluded: string[] };
  budget: { unit: string; limit: number };
  deliverables: string[];
  testsOrPreregistration: string[];
  acceptanceCriteria: string[];
  verificationMethod: string;
  rollback: string;
  authorityClass: AuthorityClass;
  escalationId?: string;
  authorityReasons: string[];
  owner: string;
  lifecycle: LifecycleState;
  attempt: number;
  retrySignature: string;
  priority: PriorityFactors;
  reviewedAt: Timestamp;
}

export interface ConstitutionalAmendment {
  id: string;
  rationale: string;
  objections: string[];
  consequences: string[];
  approvedBy: string;
  approverRole: 'human';
  approvedAt: Timestamp;
  affectedNodeIds: string[];
}

export interface Constitution {
  version: string;
  directives: Directive[];
  ethicalInvariants: string[];
  amendments: ConstitutionalAmendment[];
}

export interface Approval {
  id: string;
  scope: string;
  approvedBy: string;
  approverRole: 'human';
  approvedAt: Timestamp;
  escalationId?: string;
}

export interface SupersedingAssessment {
  id: string;
  nodeId: string;
  evidenceId: string;
  supersedesLifecycle: 'verified';
  status: 'proposed';
  createdAt: Timestamp;
}

export interface AuditEvent {
  id: string;
  type:
    | 'result-rejected'
    | 'packet-verified'
    | 'approval-required'
    | 'verification-required'
    | 'verification-failed'
    | 'packet-retry-eligible'
    | 'packet-blocked'
    | 'packet-activated'
    | 'packet-generated'
    | 'cycle-observed'
    | 'crash-recovered';
  packetId?: string;
  occurredAt: Timestamp;
  details: Record<string, unknown>;
}

export interface GovernanceState {
  mode: 'shadow' | 'supervised' | 'safe-code';
  shadowCyclesReviewed: number;
  supervisedResultsReviewed: number;
  safeAutoMergeEnabled: boolean;
}

export interface ShadowCycleReview {
  cycle: number;
  cycleObservedAt: Timestamp;
  reviewer: string;
  reviewerRole: 'agent';
  reviewRunId: string;
  selectedPacketId: string | null;
  cycleFingerprint: string;
  reviewedAt: Timestamp;
  useful: boolean;
  nonChurning: boolean;
  decision: 'accept' | 'revise' | 'reject';
  rationale: string;
}

export interface ShadowCycleRecord {
  cycle: number;
  observedAt: Timestamp;
  rankedFrontier: string[];
  selectedPacketId: string | null;
  executed: false;
  merged: false;
  stateMutated: false;
}

export interface StrategyState {
  constitution: Constitution;
  nodes: PlanNode[];
  evidence: EvidenceRecord[];
  assessments: SupersedingAssessment[];
  packets: WorkPacket[];
  activePacketId: string | null;
  approvals: Approval[];
  auditEvents: AuditEvent[];
  portfolioEffort: Record<Portfolio, number>;
  governance: GovernanceState;
  escalations: EscalationRecord[];
  shadowCycles: ShadowCycleRecord[];
  shadowCycleReviews: ShadowCycleReview[];
}

export interface ControllerConfig {
  portfolioWeights: Record<Portfolio, number>;
  scoreWeights: Record<keyof PriorityFactors, number>;
  evidenceLearningRate: number;
  staleEvidenceAfterMs: number;
  verificationFreshnessMs: number;
  maxRetries: number;
  maxDecompositionDepth: number;
  maxChildrenPerDecomposition: number;
  cooldownMs: number;
}

export interface PacketVerification {
  status: 'passed' | 'failed' | 'pending';
  verifier: string;
  reviewedAt: Timestamp;
}

export interface PacketResult {
  outcome: 'positive' | 'negative' | 'null' | 'failed' | 'crashed';
  artifactReferences: string[];
  evidence: EvidenceRecord[];
  acceptanceCriteriaMet: boolean;
  verification: PacketVerification;
  portfolioEffortAfter: Record<Portfolio, number>;
  retrySignature?: string;
  strategyAdjustment?: string;
}

export interface RankedPacket {
  packet: WorkPacket;
  score: number;
  lexicalPriority: boolean;
  reasons: string[];
}

export interface RankedFrontier {
  ranked: RankedPacket[];
  rejected: Array<{ packet: WorkPacket; reasons: string[] }>;
  diagnosis: GraphDiagnosis;
}

export interface GraphDiagnosis {
  evaluatedNodeCount: number;
  bottlenecks: Array<{ nodeId: string; gateFailures: string[]; downstreamDependents: number }>;
  highValueUncertainties: Array<{ nodeId: string; uncertainty: number; directiveReach: number }>;
  neglectedPortfolios: Array<{ portfolio: Portfolio; allocationGap: number }>;
  failureModes: Array<{ nodeId: string; lifecycle: 'blocked' | 'invalidated' }>;
}

export interface AdvanceResult {
  state: StrategyState;
  event: AuditEvent;
}

export interface GateAssessment {
  satisfied: boolean;
  failures: string[];
}

export interface InterventionCandidate {
  id: string;
  title: string;
  depth: number;
  executable: boolean;
  owner?: string;
  resourceBound?: string;
  primaryDeliverable?: string;
  acceptanceCriteria?: string[];
  verificationMethod?: string;
}

export interface DecompositionResult {
  status: 'converged' | 'depth-limit' | 'no-candidates';
  leaves: InterventionCandidate[];
  blocked: InterventionCandidate[];
  maxDepth: number;
  occurredAt: Timestamp;
}
