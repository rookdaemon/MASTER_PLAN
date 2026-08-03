import { Controller } from './controller.js';
import { integrateEvidence } from './evidence.js';
import type {
  ExecutionResult,
  ExternalDataPort,
  PacketExecutorPort,
  ReviewerPort,
  StateStorePort,
} from './ports.js';
import type {
  AuditEvent,
  ControllerConfig,
  PacketVerification,
  StrategyState,
  Timestamp,
  WorkPacket,
} from './types.js';

export interface CycleRunnerPorts {
  store: StateStorePort;
  executor: PacketExecutorPort;
  reviewer: ReviewerPort;
  externalData: ExternalDataPort;
}

export interface CycleResult {
  status: 'proposed' | 'waiting' | 'verified' | 'blocked' | 'verifying' | 'crashed' | 'recovered';
  selectedPacketId: string | null;
  rejections: Array<{ packetId: string; reasons: string[] }>;
}

function appendEvent(state: StrategyState, auditEvent: AuditEvent): StrategyState {
  return { ...state, auditEvents: [...state.auditEvents, auditEvent] };
}

function recoveryEvent(packet: WorkPacket, now: Timestamp): AuditEvent {
  return {
    id: `audit:${packet.id}:crash-recovered:${now}`,
    type: 'crash-recovered',
    packetId: packet.id,
    occurredAt: now,
    details: { reason: 'active-packet-found-on-cycle-start', retrySuppressed: true },
  };
}

export class CycleRunner {
  private running = false;

  constructor(
    private readonly ports: CycleRunnerPorts,
    private readonly config: ControllerConfig,
  ) {}

  async runCycle(now: Timestamp): Promise<CycleResult> {
    if (this.running) throw new Error('A controller cycle is already running');
    this.running = true;
    try {
      return await this.runCycleExclusively(now);
    } finally {
      this.running = false;
    }
  }

  private async runCycleExclusively(now: Timestamp): Promise<CycleResult> {
    let state = await this.ports.store.load();
    if (state.activePacketId !== null) {
      const activeIndex = state.packets.findIndex((packet) => packet.id === state.activePacketId);
      if (activeIndex >= 0) {
        const packet = state.packets[activeIndex];
        state.packets[activeIndex] = { ...packet, lifecycle: 'blocked', attempt: packet.attempt + 1 };
        state.activePacketId = null;
        state = appendEvent(state, recoveryEvent(packet, now));
        await this.ports.store.save(state);
        return { status: 'recovered', selectedPacketId: packet.id, rejections: [] };
      }
    }

    const observed = await this.ports.externalData.observe(now);
    for (const evidence of observed) state = integrateEvidence(state, evidence, now, this.config);

    const frontier = new Controller(state, this.config).evaluate(state, now);
    const rejections = frontier.rejected.map(({ packet, reasons }) => ({ packetId: packet.id, reasons }));
    const selected = frontier.ranked[0]?.packet;
    if (!selected) {
      await this.ports.store.save(state);
      return { status: 'waiting', selectedPacketId: null, rejections };
    }

    if (state.governance.mode === 'shadow') {
      const auditEvent: AuditEvent = {
        id: `audit:${selected.id}:cycle-observed:${now}`,
        type: 'cycle-observed',
        packetId: selected.id,
        occurredAt: now,
        details: { mode: 'shadow', executed: false },
      };
      await this.ports.store.save(appendEvent(state, auditEvent));
      return { status: 'proposed', selectedPacketId: selected.id, rejections };
    }

    const activeState = structuredClone(state);
    const packetIndex = activeState.packets.findIndex((packet) => packet.id === selected.id);
    const activePacket = { ...selected, lifecycle: 'active' as const };
    activeState.packets[packetIndex] = activePacket;
    activeState.activePacketId = activePacket.id;
    activeState.auditEvents.push({
      id: `audit:${activePacket.id}:packet-activated:${now}`,
      type: 'packet-activated',
      packetId: activePacket.id,
      occurredAt: now,
      details: { mode: state.governance.mode },
    });
    await this.ports.store.save(activeState);

    let execution: ExecutionResult;
    try {
      execution = await this.ports.executor.execute(activePacket, now);
    } catch {
      return { status: 'crashed', selectedPacketId: activePacket.id, rejections };
    }

    let verification: PacketVerification;
    try {
      verification = await this.ports.reviewer.verify(activePacket, execution, now);
    } catch {
      verification = { status: 'pending', verifier: '', reviewedAt: now };
    }
    const advanced = new Controller(activeState, this.config).advance(
      activePacket,
      { ...execution, verification },
      now,
    );
    const next = {
      ...advanced.state,
      governance: {
        ...advanced.state.governance,
        supervisedResultsReviewed: [
          'packet-verified',
          'packet-blocked',
          'packet-retry-eligible',
        ].includes(advanced.event.type)
          ? advanced.state.governance.supervisedResultsReviewed + 1
          : advanced.state.governance.supervisedResultsReviewed,
      },
    };
    await this.ports.store.save(next);
    const lifecycle = next.packets.find((packet) => packet.id === activePacket.id)?.lifecycle;
    return {
      status: lifecycle === 'verified' ? 'verified' : lifecycle === 'blocked' ? 'blocked' : 'verifying',
      selectedPacketId: activePacket.id,
      rejections,
    };
  }
}
