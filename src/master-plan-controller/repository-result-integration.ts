import { Controller } from './controller.js';
import type { FileSystemPort } from './ports.js';
import { renderRoadmap } from './roadmap.js';
import { loadRepositoryStrategy } from './repository-strategy.js';
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

function formatted(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

function appendJsonArrayItems<T>(content: string, previous: readonly T[], next: readonly T[]): string {
  if (sameJson(previous, next)) return content;
  if (next.length < previous.length || !sameJson(previous, next.slice(0, previous.length))) {
    return formatted(next);
  }
  const additions = next.slice(previous.length);
  const trimmed = content.trimEnd();
  if (!trimmed.endsWith(']')) throw new Error('Expected a JSON array');
  const prefix = trimmed.slice(0, -1).trimEnd();
  const separator = previous.length === 0 ? '\n' : ',\n';
  const serialized = additions
    .map((item) => JSON.stringify(item, null, 2).split('\n').map((line) => `  ${line}`).join('\n'))
    .join(',\n');
  return `${prefix}${separator}${serialized}\n]\n`;
}

function statusWithReviewedCount(status: string, count: number): string {
  const pattern = /Supervised results independently reviewed: \*\*\d+\*\*/g;
  const matches = status.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error('STATUS.md must contain exactly one supervised-results counter');
  }
  return status.replace(pattern, `Supervised results independently reviewed: **${count}**`);
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
      supervisedResultsReviewed: advanced.state.governance.supervisedResultsReviewed + 1,
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
  const status = statusWithReviewedCount(
    await fileSystem.readText('STATUS.md'),
    state.governance.supervisedResultsReviewed,
  );
  const previousPacket = bundle.state.packets.find((candidate) => candidate.id === packetId)!;
  const nextPacket = state.packets.find((candidate) => candidate.id === packetId)!;
  const unchangedPacketFields = { ...previousPacket, lifecycle: nextPacket.lifecycle };
  if (!sameJson(unchangedPacketFields, nextPacket)) {
    throw new Error('Verified packet integration changed fields beyond lifecycle');
  }
  const writes: Array<[string, string]> = [
    ['strategy/graph.json', sameJson(bundle.state.nodes, state.nodes) ? graphText : formatted(state.nodes)],
    ['strategy/evidence.json', appendJsonArrayItems(evidenceText, bundle.state.evidence, state.evidence)],
    ['strategy/assessments.json', sameJson(bundle.state.assessments, state.assessments) ? assessmentsText : formatted(state.assessments)],
    ['strategy/work-packets.json', withPacketLifecycle(
      packetsText, packetId, previousPacket.lifecycle, nextPacket.lifecycle,
    )],
    ['strategy/audit-log.json', appendJsonArrayItems(auditText, bundle.state.auditEvents, state.auditEvents)],
    ['strategy/portfolio.json', formatted({ ...portfolio, currentEffort: state.portfolioEffort })],
    ['strategy/governance.json', formatted(state.governance)],
    ['strategy/ROADMAP.md', renderRoadmap(updatedBundle)],
    ['STATUS.md', status],
  ];
  for (const [path, content] of writes) await fileSystem.writeText(path, content);
  return { event: advanced.event };
}
