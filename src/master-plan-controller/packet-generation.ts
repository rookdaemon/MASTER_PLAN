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
    const existingIds = new Set(state.packets.map((packet) => packet.id));
    return this.templates
      .filter((template) => !existingIds.has(template.id) && matches(template.trigger, diagnosis))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, this.maximumCandidates)
      .map(({ trigger: _trigger, ...template }) => ({
        ...structuredClone(template),
        lifecycle: 'eligible' as const,
        attempt: 0,
        reviewedAt: now,
      }));
  }
}
