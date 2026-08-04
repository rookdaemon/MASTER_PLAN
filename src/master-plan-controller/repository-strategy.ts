import { validateDependencyGraph, parsePlanNodes } from './graph.js';
import { verifyLegacyAuditCoverage } from './legacy-audit.js';
import { strategyContractErrors } from './strategy-validation.js';
import { workPacketValidationErrors } from './strategy-validation.js';
import { periodicReviewValidationErrors, type PeriodicReviewRecord } from './periodic-review.js';
import {
  publicSourceSnapshotConfigErrors,
  type PublicSourceSnapshotConfig,
} from './public-source-observation.js';
import {
  DiagnosticPacketGenerator,
  sameWorkPacketDefinition,
  type DiagnosticPacketTemplate,
} from './packet-generation.js';
import type { LegacyAuditRecord } from './legacy-audit.js';
import type { FileSystemPort } from './ports.js';
import type {
  Approval,
  AuditEvent,
  Constitution,
  ControllerConfig,
  EvidenceRecord,
  EscalationRecord,
  GovernanceState,
  Portfolio,
  StrategyState,
  ShadowCycleReview,
  ShadowCycleRecord,
  SupersedingAssessment,
  Timestamp,
  WorkPacket,
} from './types.js';

interface PortfolioFile {
  weights: ControllerConfig['portfolioWeights'];
  currentEffort: Record<Portfolio, number>;
  scoreWeights: ControllerConfig['scoreWeights'];
  evidenceLearningRate: number;
  staleEvidenceAfterMs: number;
  verificationFreshnessMs: number;
  maxRetries: number;
  maxDecompositionDepth: number;
  maxChildrenPerDecomposition: number;
  cooldownMs: number;
}

export interface RepositoryStrategyBundle {
  state: StrategyState;
  config: ControllerConfig;
  legacyAudit: LegacyAuditRecord[];
  packetTemplates: DiagnosticPacketTemplate[];
  observationSources: RepositoryObservationSource[];
  periodicReviews: PeriodicReviewRecord[];
}

export interface RepositoryControlObservationSource {
  kind: 'github-repository-controls';
  branch: string;
  hypothesisId: string;
}

export type RepositoryObservationSource = RepositoryControlObservationSource | PublicSourceSnapshotConfig;

async function json<T>(fileSystem: FileSystemPort, path: string): Promise<T> {
  return JSON.parse(await fileSystem.readText(path)) as T;
}

export async function loadRepositoryStrategy(fileSystem: FileSystemPort): Promise<RepositoryStrategyBundle> {
  const [
    constitution,
    graphInput,
    evidence,
    packets,
    approvals,
    assessments,
    auditEvents,
    portfolio,
    governance,
    escalations,
    shadowCyclesReport,
    shadowCycleReviews,
    legacyAudit,
    packetTemplates,
    observationSourcesFile,
    periodicReviews,
  ] = await Promise.all([
    json<Constitution>(fileSystem, 'strategy/constitution.json'),
    json<unknown>(fileSystem, 'strategy/graph.json'),
    json<EvidenceRecord[]>(fileSystem, 'strategy/evidence.json'),
    json<WorkPacket[]>(fileSystem, 'strategy/work-packets.json'),
    json<Approval[]>(fileSystem, 'strategy/approvals.json'),
    json<SupersedingAssessment[]>(fileSystem, 'strategy/assessments.json'),
    json<AuditEvent[]>(fileSystem, 'strategy/audit-log.json'),
    json<PortfolioFile>(fileSystem, 'strategy/portfolio.json'),
    json<GovernanceState>(fileSystem, 'strategy/governance.json'),
    json<EscalationRecord[]>(fileSystem, 'strategy/escalations.json'),
    json<{ cycles: ShadowCycleRecord[] }>(fileSystem, 'strategy/shadow-cycles.json'),
    json<ShadowCycleReview[]>(fileSystem, 'strategy/shadow-reviews.json'),
    json<LegacyAuditRecord[]>(fileSystem, 'strategy/legacy-audit.json'),
    json<DiagnosticPacketTemplate[]>(fileSystem, 'strategy/packet-templates.json'),
    json<{ sources: RepositoryObservationSource[] }>(fileSystem, 'strategy/observation-sources.json'),
    json<PeriodicReviewRecord[]>(fileSystem, 'strategy/periodic-reviews.json'),
  ]);
  const nodes = parsePlanNodes(graphInput);
  const state: StrategyState = {
    constitution,
    nodes,
    evidence,
    assessments,
    packets,
    activePacketId: packets.find((packet) => packet.lifecycle === 'active')?.id ?? null,
    approvals,
    auditEvents,
    portfolioEffort: portfolio.currentEffort,
    governance,
    escalations,
    shadowCycles: shadowCyclesReport.cycles,
    shadowCycleReviews,
  };
  return {
    state,
    legacyAudit,
    packetTemplates,
    observationSources: observationSourcesFile.sources,
    periodicReviews,
    config: {
      portfolioWeights: portfolio.weights,
      scoreWeights: portfolio.scoreWeights,
      evidenceLearningRate: portfolio.evidenceLearningRate,
      staleEvidenceAfterMs: portfolio.staleEvidenceAfterMs,
      verificationFreshnessMs: portfolio.verificationFreshnessMs,
      maxRetries: portfolio.maxRetries,
      maxDecompositionDepth: portfolio.maxDecompositionDepth,
      maxChildrenPerDecomposition: portfolio.maxChildrenPerDecomposition,
      cooldownMs: portfolio.cooldownMs,
    },
  };
}

export interface StrategyVerificationReport {
  errors: string[];
  legacyPlanFileCount: number;
  verifiedAt: Timestamp;
}

export async function verifyRepositoryStrategy(
  fileSystem: FileSystemPort,
  bundle: RepositoryStrategyBundle,
  now: Timestamp,
  expectedConfig?: ControllerConfig,
): Promise<StrategyVerificationReport> {
  const errors: string[] = [];
  const planFiles = (await fileSystem.listFiles('plan/')).filter((path) => path.endsWith('.md'));
  const coverage = verifyLegacyAuditCoverage(planFiles, bundle.legacyAudit);
  if (!coverage.complete) {
    if (coverage.missing.length > 0) errors.push(`Legacy audit is missing: ${coverage.missing.join(', ')}`);
    if (coverage.extra.length > 0) errors.push(`Legacy audit has extra entries: ${coverage.extra.join(', ')}`);
  }
  if (bundle.legacyAudit.some((record) => record.realWorldOutcomeAttainment !== 'not-verified')) {
    errors.push('Legacy audit improperly treats a plan artifact as a verified real-world outcome');
  }
  const graph = validateDependencyGraph(bundle.state.nodes);
  errors.push(...graph.errors.map((error) => error.detail));
  errors.push(...strategyContractErrors(bundle.state, bundle.config, now));

  try {
    new DiagnosticPacketGenerator(bundle.packetTemplates);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Packet template configuration is invalid');
  }
  for (const template of bundle.packetTemplates) {
    const { trigger: _trigger, recurrence: _recurrence, ...definition } = template;
    const packet: WorkPacket = { ...definition, lifecycle: 'eligible', attempt: 0, reviewedAt: now };
    errors.push(...workPacketValidationErrors(packet, bundle.state, now));
    const persisted = bundle.state.packets.find((candidate) => candidate.id === template.id);
    if (persisted && !sameWorkPacketDefinition(packet, persisted)) {
      errors.push(`Packet template ${template.id} collides with a different persisted packet`);
    }
  }

  const evidenceIds = new Set(bundle.state.evidence.map((record) => record.id));
  for (const node of bundle.state.nodes) {
    for (const evidenceId of node.evidenceReferences) {
      if (!evidenceIds.has(evidenceId)) errors.push(`Node ${node.id} references missing evidence ${evidenceId}`);
    }
    if (node.lifecycle === 'active') {
      if (node.evidenceReferences.length === 0) errors.push(`Active node ${node.id} lacks evidence`);
      if (node.metrics.length === 0) errors.push(`Active node ${node.id} lacks metrics`);
      if (node.dependencies.length === 0) errors.push(`Active node ${node.id} lacks dependencies`);
      if (node.activationGates.length === 0) errors.push(`Active node ${node.id} lacks activation gates`);
    }
  }
  const nodeIds = new Set(bundle.state.nodes.map((node) => node.id));
  const periodicReviewIds = new Set<string>();
  if (!Array.isArray(bundle.periodicReviews)) {
    errors.push('Periodic review registry must be an array');
  } else {
    for (const review of bundle.periodicReviews) {
      errors.push(...periodicReviewValidationErrors(review, now));
      if (periodicReviewIds.has(review.id)) errors.push(`Duplicate periodic review identity: ${review.id}`);
      periodicReviewIds.add(review.id);
    }
  }
  if (!Array.isArray(bundle.observationSources) || bundle.observationSources.length === 0) {
    errors.push('At least one external observation source is required');
  } else {
    const sourceKeys = new Set<string>();
    for (const source of bundle.observationSources) {
      const key = source.kind === 'github-repository-controls'
        ? `${source.kind}:${source.branch}:${source.hypothesisId}`
        : `${source.kind}:${source.id}`;
      if (sourceKeys.has(key)) errors.push(`Duplicate observation source: ${key}`);
      sourceKeys.add(key);
      if (source.kind === 'github-repository-controls') {
        const hypothesis = bundle.state.nodes.find((node) => node.id === source.hypothesisId);
        if (!source.branch?.trim()) errors.push(`Observation source ${key} is malformed`);
        if (!hypothesis) errors.push(`Observation source ${key} references a missing hypothesis`);
        else if (hypothesis.kind !== 'hypothesis') errors.push(`Observation source ${key} does not target a hypothesis`);
      } else {
        errors.push(...publicSourceSnapshotConfigErrors(source)
          .map((error) => `Observation source ${key} is malformed: ${error}`));
      }
    }
  }
  for (const packet of bundle.state.packets) {
    if (!nodeIds.has(packet.nodeId)) errors.push(`Packet ${packet.id} targets missing node ${packet.nodeId}`);
    if (packet.deliverables.length === 0) errors.push(`Packet ${packet.id} has no deliverable`);
    if (packet.acceptanceCriteria.length === 0) errors.push(`Packet ${packet.id} has no acceptance criteria`);
    if (packet.testsOrPreregistration.length === 0) errors.push(`Packet ${packet.id} has no tests or preregistration`);
  }
  if (bundle.state.packets.filter((packet) => packet.lifecycle === 'active').length > 1) {
    errors.push('More than one work packet is active');
  }
  const weightTotal = Object.values(bundle.config.portfolioWeights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(weightTotal - 1) > 1e-9) errors.push(`Portfolio weights sum to ${weightTotal}, not 1`);
  if (
    expectedConfig &&
    JSON.stringify(bundle.config.portfolioWeights) !== JSON.stringify(expectedConfig.portfolioWeights)
  ) {
    errors.push('Portfolio weights do not match the v2 constitutional rollout specification');
  }
  for (const id of ['program-space-settlement', 'program-self-replication', 'program-cosmological-engineering']) {
    const node = bundle.state.nodes.find((candidate) => candidate.id === id);
    if (!node) errors.push(`Deferred map node is missing: ${id}`);
    else if (node.lifecycle !== 'proposed' || !node.activationGates.some((gate) => gate.type === 'node-verified')) {
      errors.push(`Deferred map node ${id} is not protected by activation gates`);
    }
  }
  if (bundle.state.constitution.directives.join(',') !== 'G1,G2,G3') errors.push('Constitution must preserve G1, G2, and G3');

  return { errors, legacyPlanFileCount: planFiles.length, verifiedAt: now };
}
