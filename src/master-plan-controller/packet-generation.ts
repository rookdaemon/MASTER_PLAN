import type { PacketGeneratorPort } from './ports.js';
import type {
  GraphDiagnosis,
  Portfolio,
  StrategyState,
  Timestamp,
  WorkPacket,
} from './types.js';

export type DiagnosticTrigger =
  | { kind: 'high-value-uncertainty'; nodeId: string }
  | { kind: 'bottleneck'; nodeId: string }
  | { kind: 'neglected-portfolio'; portfolio: Portfolio }
  | { kind: 'failure-mode'; nodeId: string };

export type DiagnosticPacketTemplate = Omit<WorkPacket, 'lifecycle' | 'attempt' | 'reviewedAt'> & {
  trigger: DiagnosticTrigger;
  recurrence?: {
    kind: 'versioned';
    minimumIntervalMs: number;
    requiresNewEvidence: true;
  };
};

const PORTFOLIOS: readonly Portfolio[] = [
  'consciousness-epistemics',
  'near-term-preservation',
  'enabling-capabilities',
  'institutional-continuity',
];

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalized(entry)]));
  }
  return value;
}

export function sameWorkPacketDefinition(left: WorkPacket, right: WorkPacket): boolean {
  const withoutRuntimeState = (packet: WorkPacket) => {
    const { lifecycle: _lifecycle, attempt: _attempt, reviewedAt: _reviewedAt, ...definition } = packet;
    return definition;
  };
  return JSON.stringify(normalized(withoutRuntimeState(left))) ===
    JSON.stringify(normalized(withoutRuntimeState(right)));
}

function matches(trigger: DiagnosticTrigger, diagnosis: GraphDiagnosis): boolean {
  switch (trigger.kind) {
    case 'high-value-uncertainty':
      return diagnosis.highValueUncertainties.some((item) => item.nodeId === trigger.nodeId);
    case 'bottleneck':
      return diagnosis.bottlenecks.some((item) => item.nodeId === trigger.nodeId);
    case 'neglected-portfolio':
      return diagnosis.neglectedPortfolios.some((item) => item.portfolio === trigger.portfolio);
    case 'failure-mode':
      return diagnosis.failureModes.some((item) => item.nodeId === trigger.nodeId);
  }
}

function validateTemplate(template: DiagnosticPacketTemplate): void {
  if (!template.id.trim()) throw new Error('Packet template identities must not be empty');
  if (template.recurrence !== undefined) {
    if (template.recurrence.kind !== 'versioned') {
      throw new Error(`Packet template ${template.id} has an invalid recurrence kind`);
    }
    if (!Number.isSafeInteger(template.recurrence.minimumIntervalMs) ||
      template.recurrence.minimumIntervalMs <= 0) {
      throw new Error(`Versioned packet template ${template.id} must have a positive minimum interval`);
    }
    if (template.recurrence.requiresNewEvidence !== true) {
      throw new Error(`Versioned packet template ${template.id} must require new evidence`);
    }
    if (!/^.+-v1$/.test(template.id)) {
      throw new Error(`Versioned packet template ${template.id} must begin at v1`);
    }
    if (!template.retrySignature.endsWith('-v1')) {
      throw new Error(`Versioned packet template ${template.id} retry signature must end in v1`);
    }
    if (template.deliverables.some((deliverable) => !deliverable.endsWith('-v1'))) {
      throw new Error(`Versioned packet template ${template.id} deliverable identities must end in v1`);
    }
  }
  const trigger = template.trigger as unknown;
  if (trigger === null || typeof trigger !== 'object' || !('kind' in trigger)) {
    throw new Error(`Packet template ${template.id} has an invalid trigger kind`);
  }
  const candidate = trigger as Record<string, unknown>;
  switch (candidate.kind) {
    case 'high-value-uncertainty':
    case 'bottleneck':
    case 'failure-mode':
      if (typeof candidate.nodeId !== 'string' || !candidate.nodeId.trim() || candidate.nodeId !== template.nodeId) {
        throw new Error(`Packet template ${template.id} trigger must match its target node`);
      }
      return;
    case 'neglected-portfolio':
      if (!PORTFOLIOS.includes(candidate.portfolio as Portfolio)) {
        throw new Error(`Packet template ${template.id} has an invalid trigger portfolio`);
      }
      if (candidate.portfolio !== template.portfolio) {
        throw new Error(`Packet template ${template.id} trigger must match its portfolio`);
      }
      return;
    default:
      throw new Error(`Packet template ${template.id} has an invalid trigger kind`);
  }
}

interface VersionedIdentity {
  family: string;
  version: number;
}

function versionedIdentity(id: string): VersionedIdentity | null {
  const match = /^(.*)-v([1-9]\d*)$/.exec(id);
  if (!match) return null;
  return { family: match[1], version: Number(match[2]) };
}

function replaceVersionSuffix(value: string, fromVersion: number, toVersion: number): string {
  const suffix = `-v${fromVersion}`;
  return value.endsWith(suffix) ? `${value.slice(0, -suffix.length)}-v${toVersion}` : value;
}

function versionedPacket(
  template: DiagnosticPacketTemplate,
  state: StrategyState,
  now: Timestamp,
): Omit<DiagnosticPacketTemplate, 'trigger' | 'recurrence'> | null {
  const identity = versionedIdentity(template.id);
  if (!identity) throw new Error(`Versioned packet template ${template.id} has an invalid identity`);
  const familyPackets = state.packets
    .map((packet) => ({ packet, identity: versionedIdentity(packet.id) }))
    .filter(({ identity: candidate }) => candidate?.family === identity.family);
  if (familyPackets.some(({ packet }) => !['verified', 'invalidated', 'retired'].includes(packet.lifecycle))) {
    return null;
  }
  const latest = familyPackets.reduce<WorkPacket | null>((current, candidate) => {
    if (current === null) return candidate.packet;
    return Date.parse(candidate.packet.reviewedAt) > Date.parse(current.reviewedAt) ? candidate.packet : current;
  }, null);
  if (latest !== null) {
    const nowEpoch = Date.parse(now);
    const latestEpoch = Date.parse(latest.reviewedAt);
    if (Number.isNaN(nowEpoch) || Number.isNaN(latestEpoch)) {
      throw new Error('Versioned packet recurrence requires valid caller-supplied timestamps');
    }
    if (nowEpoch - latestEpoch < template.recurrence!.minimumIntervalMs) return null;
    if (template.recurrence!.requiresNewEvidence && !state.evidence.some((evidence) => {
      const observedEpoch = Date.parse(evidence.observedAt);
      return !Number.isNaN(observedEpoch) && observedEpoch > latestEpoch && observedEpoch <= nowEpoch;
    })) return null;
  }
  const version = familyPackets.reduce(
    (highest, candidate) => Math.max(highest, candidate.identity?.version ?? 0),
    0,
  ) + 1;
  const { trigger: _trigger, recurrence: _recurrence, ...definition } = template;
  return {
    ...structuredClone(definition),
    id: `${identity.family}-v${version}`,
    retrySignature: replaceVersionSuffix(template.retrySignature, identity.version, version),
    deliverables: template.deliverables.map((deliverable) =>
      replaceVersionSuffix(deliverable, identity.version, version)),
  };
}

export class DiagnosticPacketGenerator implements PacketGeneratorPort {
  private readonly templates: DiagnosticPacketTemplate[];

  constructor(
    templates: readonly DiagnosticPacketTemplate[],
    private readonly maximumCandidates = 5,
  ) {
    if (!Number.isSafeInteger(maximumCandidates) || maximumCandidates < 1 || maximumCandidates > 5) {
      throw new Error('maximumCandidates must be an integer from 1 through 5');
    }
    const ids = new Set<string>();
    for (const template of templates) {
      validateTemplate(template);
      if (ids.has(template.id)) throw new Error(`Packet template identities must be unique: ${template.id}`);
      ids.add(template.id);
    }
    this.templates = structuredClone([...templates]);
  }

  async generate(
    state: StrategyState,
    diagnosis: GraphDiagnosis,
    now: Timestamp,
  ): Promise<WorkPacket[]> {
    return this.templates
      .filter((template) => matches(template.trigger, diagnosis))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((template) => {
        if (template.recurrence?.kind === 'versioned') return versionedPacket(template, state, now);
        if (state.packets.some((packet) => packet.id === template.id)) return null;
        const { trigger: _trigger, recurrence: _recurrence, ...definition } = template;
        return definition;
      })
      .filter((template): template is Omit<DiagnosticPacketTemplate, 'trigger' | 'recurrence'> => template !== null)
      .slice(0, this.maximumCandidates)
      .map((template) => ({
        ...structuredClone(template),
        lifecycle: 'eligible' as const,
        attempt: 0,
        reviewedAt: now,
      }));
  }
}
