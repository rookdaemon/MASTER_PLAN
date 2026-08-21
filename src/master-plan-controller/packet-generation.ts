import type { PacketGeneratorPort } from './ports.js';
import type {
  GraphDiagnosis,
  Portfolio,
  StrategyState,
  Timestamp,
  WorkPacket,
} from './types.js';
import { hasMetricGap } from './outcome-contracts.js';

export type DiagnosticTrigger =
  | { kind: 'high-value-uncertainty'; nodeId: string }
  | { kind: 'bottleneck'; nodeId: string }
  | { kind: 'neglected-portfolio'; portfolio: Portfolio }
  | { kind: 'failure-mode'; nodeId: string }
  | { kind: 'metric-gap'; nodeId: string; metricId: string; outcomeContractId: string }
  | {
    kind: 'evidence-signal';
    nodeId: string;
    hypothesisId: string;
    outcomes: Array<'positive' | 'negative'>;
    minimumStrength: number;
    maximumAgeMs: number;
  };

export type DiagnosticPacketTemplate = Omit<WorkPacket, 'lifecycle' | 'attempt' | 'reviewedAt'> & {
  trigger: DiagnosticTrigger;
  recurrence?: {
    kind: 'iterated';
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

function matchingEvidence(
  trigger: Extract<DiagnosticTrigger, { kind: 'evidence-signal' }>,
  state: StrategyState,
  now: Timestamp,
  after?: Timestamp,
): boolean {
  const nowEpoch = Date.parse(now);
  const afterEpoch = after === undefined ? Number.NEGATIVE_INFINITY : Date.parse(after);
  return state.evidence.some((evidence) => {
    const observedEpoch = Date.parse(evidence.observedAt);
    const linked = evidence.outcome === 'positive'
      ? evidence.supportedHypotheses.includes(trigger.hypothesisId)
      : evidence.outcome === 'negative' && evidence.falsifiedHypotheses.includes(trigger.hypothesisId);
    return linked && trigger.outcomes.includes(evidence.outcome as 'positive' | 'negative') &&
      evidence.strength >= trigger.minimumStrength && !Number.isNaN(observedEpoch) &&
      observedEpoch > afterEpoch && observedEpoch <= nowEpoch &&
      nowEpoch - observedEpoch <= trigger.maximumAgeMs;
  });
}

function matches(trigger: DiagnosticTrigger, diagnosis: GraphDiagnosis, state: StrategyState, now: Timestamp): boolean {
  switch (trigger.kind) {
    case 'high-value-uncertainty':
      return diagnosis.highValueUncertainties.some((item) => item.nodeId === trigger.nodeId);
    case 'bottleneck':
      return diagnosis.bottlenecks.some((item) => item.nodeId === trigger.nodeId);
    case 'neglected-portfolio':
      return diagnosis.neglectedPortfolios.some((item) => item.portfolio === trigger.portfolio);
    case 'failure-mode':
      return diagnosis.failureModes.some((item) => item.nodeId === trigger.nodeId);
    case 'evidence-signal':
      return matchingEvidence(trigger, state, now);
    case 'metric-gap': {
      const contract = state.outcomeContracts.find((candidate) => candidate.id === trigger.outcomeContractId);
      const node = state.nodes.find((candidate) => candidate.id === trigger.nodeId);
      const metric = node?.metrics.find((candidate) => candidate.id === trigger.metricId);
      return contract?.nodeId === trigger.nodeId && contract.metricId === trigger.metricId &&
        node !== undefined && !['blocked', 'invalidated', 'retired'].includes(node.lifecycle) &&
        metric !== undefined && hasMetricGap(metric);
    }
  }
}

function validateTemplate(template: DiagnosticPacketTemplate): void {
  if (!template.id.trim()) throw new Error('Packet template identities must not be empty');
  if (template.recurrence !== undefined) {
    if (template.recurrence.kind !== 'iterated') {
      throw new Error(`Packet template ${template.id} has an invalid recurrence kind`);
    }
    if (!Number.isSafeInteger(template.recurrence.minimumIntervalMs) ||
      template.recurrence.minimumIntervalMs <= 0) {
      throw new Error(`Recurring packet template ${template.id} must have a positive minimum interval`);
    }
    if (template.recurrence.requiresNewEvidence !== true) {
      throw new Error(`Recurring packet template ${template.id} must require new evidence`);
    }
    if (!template.seriesId?.trim() || template.id !== template.seriesId || template.runNumber !== 0) {
      throw new Error(`Recurring packet template ${template.id} must define its stable seriesId and runNumber zero`);
    }
    if (/-run-\d+$/u.test(template.retrySignature)) {
      throw new Error(`Recurring packet template ${template.id} retry signature must be an unnumbered base`);
    }
    if (template.deliverables.some((deliverable) => /-run-\d+$/u.test(deliverable))) {
      throw new Error(`Recurring packet template ${template.id} deliverable identities must be unnumbered bases`);
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
    case 'evidence-signal':
      if (typeof candidate.nodeId !== 'string' || !candidate.nodeId.trim() || candidate.nodeId !== template.nodeId ||
        typeof candidate.hypothesisId !== 'string' || !candidate.hypothesisId.trim()) {
        throw new Error(`Packet template ${template.id} evidence trigger is malformed`);
      }
      if (!Array.isArray(candidate.outcomes) || candidate.outcomes.length === 0 ||
        !(candidate.outcomes as unknown[]).every((outcome) => ['positive', 'negative'].includes(String(outcome)))) {
        throw new Error(`Packet template ${template.id} evidence trigger outcomes are invalid`);
      }
      if (typeof candidate.minimumStrength !== 'number' || candidate.minimumStrength < 0 || candidate.minimumStrength > 1 ||
        !Number.isSafeInteger(candidate.maximumAgeMs) || (candidate.maximumAgeMs as number) <= 0) {
        throw new Error(`Packet template ${template.id} evidence trigger bounds are invalid`);
      }
      return;
    case 'metric-gap':
      if (typeof candidate.nodeId !== 'string' || candidate.nodeId !== template.nodeId ||
        typeof candidate.metricId !== 'string' || !candidate.metricId.trim() ||
        typeof candidate.outcomeContractId !== 'string' || !candidate.outcomeContractId.trim()) {
        throw new Error(`Packet template ${template.id} metric-gap trigger is malformed`);
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

function recurringPacket(
  template: DiagnosticPacketTemplate,
  state: StrategyState,
  now: Timestamp,
): Omit<DiagnosticPacketTemplate, 'trigger' | 'recurrence'> | null {
  const seriesId = template.seriesId;
  if (!seriesId) throw new Error(`Recurring packet template ${template.id} has an invalid series identity`);
  const familyPackets = state.packets
    .filter((packet) => packet.seriesId === seriesId && Number.isSafeInteger(packet.runNumber) && packet.runNumber! > 0);
  if (familyPackets.some((packet) => !['verified', 'invalidated', 'retired'].includes(packet.lifecycle))) {
    return null;
  }
  const latest = familyPackets.reduce<WorkPacket | null>((current, packet) => {
    if (current === null) return packet;
    return Date.parse(packet.reviewedAt) > Date.parse(current.reviewedAt) ? packet : current;
  }, null);
  if (latest !== null) {
    const nowEpoch = Date.parse(now);
    const latestEpoch = Date.parse(latest.reviewedAt);
    if (Number.isNaN(nowEpoch) || Number.isNaN(latestEpoch)) {
      throw new Error('Packet recurrence requires valid caller-supplied timestamps');
    }
    if (nowEpoch - latestEpoch < template.recurrence!.minimumIntervalMs) return null;
    if (template.recurrence!.requiresNewEvidence && template.trigger.kind === 'evidence-signal') {
      if (!matchingEvidence(template.trigger, state, now, latest.reviewedAt)) return null;
    } else if (template.recurrence!.requiresNewEvidence && !state.evidence.some((evidence) => {
      const observedEpoch = Date.parse(evidence.observedAt);
      return !Number.isNaN(observedEpoch) && observedEpoch > latestEpoch && observedEpoch <= nowEpoch;
    })) return null;
  }
  const runNumber = familyPackets.reduce(
    (highest, packet) => Math.max(highest, packet.runNumber ?? 0),
    0,
  ) + 1;
  const { trigger: _trigger, recurrence: _recurrence, ...definition } = template;
  return {
    ...structuredClone(definition),
    id: `${seriesId}-run-${runNumber}`,
    seriesId,
    runNumber,
    retrySignature: `${template.retrySignature}-run-${runNumber}`,
    deliverables: template.deliverables.map((deliverable) => `${deliverable}-run-${runNumber}`),
  };
}

function proactiveRecurringPacket(
  template: DiagnosticPacketTemplate,
  state: StrategyState,
): Omit<DiagnosticPacketTemplate, 'trigger' | 'recurrence'> | null {
  const seriesId = template.seriesId;
  if (!seriesId) throw new Error(`Recurring packet template ${template.id} has an invalid series identity`);
  const familyPackets = state.packets
    .filter((packet) => packet.seriesId === seriesId && Number.isSafeInteger(packet.runNumber) && packet.runNumber! > 0);
  if (familyPackets.some((packet) => !['verified', 'invalidated', 'retired'].includes(packet.lifecycle))) {
    return null;
  }
  const runNumber = familyPackets.reduce(
    (highest, packet) => Math.max(highest, packet.runNumber ?? 0),
    0,
  ) + 1;
  const { trigger: _trigger, recurrence: _recurrence, ...definition } = template;
  return {
    ...structuredClone(definition),
    id: `${seriesId}-run-${runNumber}`,
    seriesId,
    runNumber,
    retrySignature: `${template.retrySignature}-run-${runNumber}`,
    deliverables: template.deliverables.map((deliverable) => `${deliverable}-run-${runNumber}`),
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
      .filter((template) => matches(template.trigger, diagnosis, state, now))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((template) => {
        if (template.recurrence?.kind === 'iterated') return recurringPacket(template, state, now);
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

  /**
   * Keeps a bounded autonomous backlog moving when passive diagnostic triggers
   * are quiet. Existing non-terminal work is never duplicated.
   */
  async generateProactiveBacklog(
    state: StrategyState,
    now: Timestamp,
  ): Promise<WorkPacket[]> {
    return this.templates
      .map((template) => {
        if (template.recurrence?.kind === 'iterated') return proactiveRecurringPacket(template, state);
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
