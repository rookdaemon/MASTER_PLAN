import { Controller } from './controller.js';
import type { FileSystemPort } from './ports.js';
import { renderOperationsDocument, renderPlanDocument } from './roadmap.js';
import { loadRepositoryStrategy } from './repository-strategy.js';
import {
  appendRepositoryJsonArrayItems,
  formattedRepositoryJson,
  sameRepositoryJson,
} from './repository-json.js';
import type { AuditEvent, PacketResult, Portfolio, Timestamp } from './types.js';

interface PortfolioFile {
  weights: Record<Portfolio, number>;
  currentEffort: Record<Portfolio, number>;
  scoreWeights: Record<string, number>;
  evidenceLearningRate: number;
  staleEvidenceAfterMs: number;
  verificationFreshnessMs: number;
  maxRetries: number;
  maxDecompositionDepth: number;
  maxChildrenPerDecomposition: number;
  cooldownMs: number;
}

export interface RepositoryPacketIntegration {
  event: AuditEvent;
}

function withPacketLifecycle(
  content: string,
  packetId: string,
  previousLifecycle: string,
  nextLifecycle: string,
): string {
  if (previousLifecycle === nextLifecycle) return content;
  const idToken = `"id": "${packetId}"`;
  const start = content.indexOf(idToken);
  if (start < 0) throw new Error(`Cannot locate packet ${packetId} in work-packets.json`);
  const nextRecord = content.indexOf('\n  {', start + idToken.length);
  const end = nextRecord < 0 ? content.length : nextRecord;
  const lifecycleToken = `"lifecycle": "${previousLifecycle}"`;
  const lifecycle = content.indexOf(lifecycleToken, start);
  if (lifecycle < 0 || lifecycle >= end) throw new Error(`Cannot locate lifecycle for packet ${packetId}`);
  return `${content.slice(0, lifecycle)}"lifecycle": "${nextLifecycle}"${content.slice(lifecycle + lifecycleToken.length)}`;
}

export async function integrateRepositoryPacketResult(
  fileSystem: FileSystemPort,
  packetId: string,
  result: PacketResult,
  now: Timestamp,
): Promise<RepositoryPacketIntegration> {
  const bundle = await loadRepositoryStrategy(fileSystem);
  const packet = bundle.state.packets.find((candidate) => candidate.id === packetId);
  if (!packet) throw new Error(`Unknown packet: ${packetId}`);
  if (packet.lifecycle === 'verified') throw new Error(`Packet ${packetId} is already verified`);
  if (packet.lifecycle !== 'eligible' && packet.lifecycle !== 'active') {
    throw new Error(`Packet ${packetId} cannot integrate a result from lifecycle ${packet.lifecycle}`);
  }

  const advanced = new Controller(bundle.state, bundle.config).advance(packet, result, now);
  if (advanced.event.type !== 'packet-verified') {
    throw new Error(`Expected packet-verified, received ${advanced.event.type}`);
  }

  const state = {
    ...advanced.state,
    governance: {
      ...advanced.state.governance,
      reviewedResultCount: advanced.state.governance.reviewedResultCount + 1,
    },
  };
  const updatedBundle = { ...bundle, state };
  const [graphText, evidenceText, assessmentsText, packetsText, auditText, portfolioText] = await Promise.all([
    fileSystem.readText('strategy/graph.json'),
    fileSystem.readText('strategy/evidence.json'),
    fileSystem.readText('strategy/assessments.json'),
    fileSystem.readText('strategy/work-packets.json'),
    fileSystem.readText('strategy/audit-log.json'),
    fileSystem.readText('strategy/portfolio.json'),
  ]);
  const portfolio = JSON.parse(portfolioText) as PortfolioFile;
  const [planDocument, operationsDocument] = await Promise.all([
    fileSystem.readText('docs/PLAN.md'),
    fileSystem.readText('docs/OPERATIONS.md'),
  ]);
  const previousPacket = bundle.state.packets.find((candidate) => candidate.id === packetId)!;
  const nextPacket = state.packets.find((candidate) => candidate.id === packetId)!;
  const unchangedPacketFields = { ...previousPacket, lifecycle: nextPacket.lifecycle };
  if (!sameRepositoryJson(unchangedPacketFields, nextPacket)) {
    throw new Error('Verified packet integration changed fields beyond lifecycle');
  }
  const writes: Array<[string, string]> = [
    ['strategy/graph.json', sameRepositoryJson(bundle.state.nodes, state.nodes) ? graphText : formattedRepositoryJson(state.nodes)],
    ['strategy/evidence.json', appendRepositoryJsonArrayItems(evidenceText, bundle.state.evidence, state.evidence)],
    ['strategy/assessments.json', sameRepositoryJson(bundle.state.assessments, state.assessments) ? assessmentsText : formattedRepositoryJson(state.assessments)],
    ['strategy/work-packets.json', withPacketLifecycle(
      packetsText, packetId, previousPacket.lifecycle, nextPacket.lifecycle,
    )],
    ['strategy/audit-log.json', appendRepositoryJsonArrayItems(auditText, bundle.state.auditEvents, state.auditEvents)],
    ['strategy/portfolio.json', formattedRepositoryJson({ ...portfolio, currentEffort: state.portfolioEffort })],
    ['strategy/governance.json', formattedRepositoryJson(state.governance)],
    ['docs/PLAN.md', renderPlanDocument(updatedBundle, planDocument)],
    ['docs/OPERATIONS.md', renderOperationsDocument(updatedBundle, operationsDocument)],
  ];
  for (const [path, content] of writes) await fileSystem.writeText(path, content);
  return { event: advanced.event };
}
