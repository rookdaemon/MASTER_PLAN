import { Controller } from './controller.js';
import { DiagnosticPacketGenerator } from './packet-generation.js';
import type { FileSystemPort } from './ports.js';
import { loadRepositoryStrategy, verifyRepositoryStrategy } from './repository-strategy.js';
import { workPacketValidationErrors } from './strategy-validation.js';
import { appendRepositoryJsonArrayItems } from './repository-json.js';
import type { AuditEvent, Timestamp, WorkPacket } from './types.js';

export interface RepositoryCandidateGeneration {
  generatedPacketIds: string[];
  selectedPacketId: string | null;
}

function generatedEvent(packet: WorkPacket, now: Timestamp): AuditEvent {
  return {
    id: `audit:${packet.id}:packet-generated:${now}`,
    type: 'packet-generated',
    packetId: packet.id,
    occurredAt: now,
    details: { source: 'diagnosis', portfolio: packet.portfolio },
  };
}

export async function runRepositoryCandidateGeneration(
  fileSystem: FileSystemPort,
  now: Timestamp,
): Promise<RepositoryCandidateGeneration> {
  if (Number.isNaN(Date.parse(now))) throw new Error('A valid caller-supplied timestamp is required');
  const bundle = await loadRepositoryStrategy(fileSystem);
  const before = await verifyRepositoryStrategy(fileSystem, bundle, now);
  if (before.errors.length > 0) throw new Error(`Strategy verification failed: ${before.errors.join('; ')}`);

  let frontier = new Controller(bundle.state, bundle.config).evaluate(bundle.state, now);
  if (frontier.ranked.length > 0) {
    return { generatedPacketIds: [], selectedPacketId: frontier.ranked[0].packet.id };
  }

  const generator = new DiagnosticPacketGenerator(bundle.packetTemplates);
  const diagnosticCandidates = await generator.generate(bundle.state, frontier.diagnosis, now);
  const candidates = diagnosticCandidates.length > 0
    ? diagnosticCandidates
    : await generator.generateProactiveBacklog(bundle.state, now);
  const accepted: WorkPacket[] = [];
  for (const packet of candidates) {
    const errors = workPacketValidationErrors(packet, bundle.state, now);
    if (packet.lifecycle !== 'eligible') errors.push('Generated packet lifecycle must be eligible');
    if (packet.attempt !== 0) errors.push('Generated packet attempt must be zero');
    if (packet.reviewedAt !== now) errors.push('Generated packet review timestamp must equal the supplied timestamp');
    if (errors.length > 0) throw new Error(`Generated packet ${packet.id} failed validation: ${errors.join('; ')}`);
    accepted.push(structuredClone(packet));
  }
  if (accepted.length === 0) {
    throw new Error('No bounded work packet is available after proactive backlog generation');
  }

  const state = {
    ...bundle.state,
    packets: [...bundle.state.packets, ...accepted],
    auditEvents: [...bundle.state.auditEvents, ...accepted.map((packet) => generatedEvent(packet, now))],
  };
  const updatedBundle = { ...bundle, state };
  const after = await verifyRepositoryStrategy(fileSystem, updatedBundle, now);
  if (after.errors.length > 0) throw new Error(`Generated strategy failed verification: ${after.errors.join('; ')}`);

  frontier = new Controller(state, bundle.config).evaluate(state, now);
  const selectedPacketId = frontier.ranked[0]?.packet.id;
  if (!selectedPacketId) {
    throw new Error('Proactive backlog generation did not produce a feasible bounded packet');
  }
  const [packetsText, auditText] = await Promise.all([
    fileSystem.readText('strategy/work-packets.json'),
    fileSystem.readText('strategy/audit-log.json'),
  ]);
  await fileSystem.writeText(
    'strategy/work-packets.json',
    appendRepositoryJsonArrayItems(packetsText, bundle.state.packets, state.packets),
  );
  await fileSystem.writeText(
    'strategy/audit-log.json',
    appendRepositoryJsonArrayItems(auditText, bundle.state.auditEvents, state.auditEvents),
  );
  return {
    generatedPacketIds: accepted.map((packet) => packet.id),
    selectedPacketId,
  };
}
