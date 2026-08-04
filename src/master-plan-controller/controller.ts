import { evaluateActivationGates } from './gates.js';
import { integrateEvidence } from './evidence.js';
import { diagnoseStrategy } from './diagnosis.js';
import { isValidHumanApproval } from './human-authorization.js';
import { assessHumanEscalation } from './escalation-policy.js';
import type {
  AdvanceResult,
  AuditEvent,
  ControllerConfig,
  PacketResult,
  RankedFrontier,
  StrategyState,
  Timestamp,
  WorkPacket,
} from './types.js';
import { applyMetricMeasurements } from './outcome-contracts.js';

function cloneState(state: StrategyState): StrategyState {
  return structuredClone(state);
}

function event(
  type: AuditEvent['type'],
  packetId: string,
  occurredAt: Timestamp,
  details: Record<string, unknown>,
): AuditEvent {
  return { id: `audit:${packetId}:${type}:${occurredAt}`, type, packetId, occurredAt, details };
}

function scorePacket(packet: WorkPacket, state: StrategyState, config: ControllerConfig): number {
  const factors = packet.priority;
  const weights = config.scoreWeights;
  const base =
    factors.impact * weights.impact +
    factors.urgency * weights.urgency +
    factors.tractability * weights.tractability +
    factors.informationValue * weights.informationValue +
    factors.reversibility * weights.reversibility +
    (1 - factors.cost) * weights.cost +
    (1 - factors.downsideRisk) * weights.downsideRisk;
  const allocationGap = config.portfolioWeights[packet.portfolio] - state.portfolioEffort[packet.portfolio];
  return base + allocationGap;
}

function addEvent(state: StrategyState, auditEvent: AuditEvent): StrategyState {
  return { ...state, auditEvents: [...state.auditEvents, auditEvent] };
}

function qualifiedEscalation(state: StrategyState, packet: WorkPacket, now: Timestamp) {
  const escalation = state.escalations.find(
    (candidate) => candidate.id === packet.escalationId && candidate.packetId === packet.id,
  );
  if (!escalation || escalation.assessedBy !== 'escalation-policy') {
    return null;
  }
  const assessedAt = Date.parse(escalation.assessedAt);
  const evaluatedAt = Date.parse(now);
  if (Number.isNaN(assessedAt) || Number.isNaN(evaluatedAt) || assessedAt > evaluatedAt) {
    return null;
  }
  const evidenceById = new Map(state.evidence.map((record) => [record.id, record]));
  return assessHumanEscalation(escalation, escalation.assessedAt, evidenceById).escalate ? escalation : null;
}

function validatedPortfolioEffort(result: PacketResult): StrategyState['portfolioEffort'] {
  const entries = Object.entries(result.portfolioEffortAfter);
  if (entries.length !== 4 || entries.some(([, value]) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error('portfolioEffortAfter must contain four finite allocations between 0 and 1');
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-9) throw new Error(`portfolioEffortAfter must sum to 1, received ${total}`);
  return structuredClone(result.portfolioEffortAfter);
}

export class Controller {
  constructor(
    private readonly state: StrategyState,
    private readonly config: ControllerConfig,
  ) {}

  evaluate(state: StrategyState, now: Timestamp): RankedFrontier {
    const diagnosis = diagnoseStrategy(state, now, this.config);
    if (state.activePacketId !== null) {
      const active = state.packets.find(
        (packet) => packet.id === state.activePacketId && packet.lifecycle === 'active',
      );
      if (!active) {
        return {
          ranked: [],
          diagnosis,
          rejected: state.packets
            .filter((packet) => packet.lifecycle === 'eligible')
            .map((packet) => ({ packet, reasons: ['State references a missing or non-active packet'] })),
        };
      }
      return {
        ranked: [{ packet: active, score: scorePacket(active, state, this.config), lexicalPriority: active.credibleExtinctionPrevention, reasons: ['Already active'] }],
        rejected: [],
        diagnosis,
      };
    }

    const ranked: RankedFrontier['ranked'] = [];
    const rejected: RankedFrontier['rejected'] = [];
    for (const packet of state.packets.filter((candidate) => candidate.lifecycle === 'eligible')) {
      const node = state.nodes.find((candidate) => candidate.id === packet.nodeId);
      if (!node) {
        rejected.push({ packet, reasons: [`Target node does not exist: ${packet.nodeId}`] });
        continue;
      }
      if (['blocked', 'invalidated', 'retired'].includes(node.lifecycle)) {
        rejected.push({ packet, reasons: [`Target node is ${node.lifecycle}: ${node.id}`] });
        continue;
      }
      const gateAssessment = evaluateActivationGates(node, state, now, this.config);
      if (!gateAssessment.satisfied) {
        rejected.push({ packet, reasons: gateAssessment.failures });
        continue;
      }
      if (
        packet.authorityClass === 'human-escalation' && !qualifiedEscalation(state, packet, now)
      ) {
        rejected.push({
          packet,
          reasons: ['Human escalation lacks a qualified, evidence-bound assessment'],
        });
        continue;
      }
      if (packet.authorityClass === 'human-escalation') {
        const escalation = qualifiedEscalation(state, packet, now)!;
        if (!state.approvals.some((approval) =>
          isValidHumanApproval(approval, packet.id, now, escalation.id, escalation.assessedAt))) {
          rejected.push({ packet, reasons: ['Human escalation is pending the bounded servant-leader decision'] });
          continue;
        }
      }
      ranked.push({
        packet,
        score: scorePacket(packet, state, this.config),
        lexicalPriority: packet.credibleExtinctionPrevention,
        reasons: [
          packet.credibleExtinctionPrevention
            ? 'Credible G1 extinction-prevention lexical priority'
            : 'Risk-weighted priority score',
        ],
      });
    }
    ranked.sort(
      (left, right) =>
        Number(right.lexicalPriority) - Number(left.lexicalPriority) ||
        right.score - left.score ||
        left.packet.id.localeCompare(right.packet.id),
    );
    return { ranked, rejected, diagnosis };
  }

  advance(packet: WorkPacket, result: PacketResult, now: Timestamp): AdvanceResult {
    let next = cloneState(this.state);
    const index = next.packets.findIndex((candidate) => candidate.id === packet.id);
    if (index < 0) throw new Error(`Unknown packet: ${packet.id}`);
    const current = next.packets[index];

    if (result.artifactReferences.length === 0 || result.evidence.length === 0) {
      const rejected = event('result-rejected', packet.id, now, { reason: 'evidence-bearing-artifact-required' });
      return { state: addEvent(next, rejected), event: rejected };
    }

    const reviewEpoch = Date.parse(result.verification.reviewedAt);
    const nowEpoch = Date.parse(now);
    const freshReview =
      result.verification.verifier.trim().length > 0 &&
      !Number.isNaN(reviewEpoch) &&
      !Number.isNaN(nowEpoch) &&
      reviewEpoch <= nowEpoch &&
      nowEpoch - reviewEpoch <= this.config.verificationFreshnessMs;
    const independentReviewer = result.verification.verifier !== current.owner;

    if (result.verification.status === 'failed') {
      next.packets[index] = { ...current, lifecycle: 'blocked', attempt: current.attempt + 1 };
      next.activePacketId = null;
      const failed = event('verification-failed', packet.id, now, { reason: 'independent-verification-failed' });
      return { state: addEvent(next, failed), event: failed };
    }

    if (result.verification.status !== 'passed' || !independentReviewer || !freshReview) {
      next.packets[index] = { ...current, lifecycle: 'verifying' };
      next.activePacketId = null;
      const verification = event('verification-required', packet.id, now, {
        reason: !independentReviewer
          ? 'independent-review-required'
          : !freshReview
            ? 'fresh-review-required'
            : 'verification-pending',
      });
      return { state: addEvent(next, verification), event: verification };
    }

    if (current.authorityClass === 'human-escalation') {
      const escalation = qualifiedEscalation(next, current, now);
      const approval = escalation && next.approvals.find((candidate) =>
        isValidHumanApproval(candidate, current.id, now, escalation.id, escalation.assessedAt));
      if (!approval) {
        next.packets[index] = { ...current, lifecycle: 'verifying' };
        next.activePacketId = null;
        const required = event('approval-required', packet.id, now, { authorityClass: current.authorityClass });
        return { state: addEvent(next, required), event: required };
      }
    }

    const measurements = applyMetricMeasurements(
      next,
      result.metricMeasurements ?? [],
      result.evidence,
      current.nodeId,
      now,
    );
    if (measurements.errors.length > 0) {
      const rejected = event('result-rejected', packet.id, now, {
        reason: 'invalid-metric-measurement',
        errors: measurements.errors,
      });
      return { state: addEvent(next, rejected), event: rejected };
    }
    next = measurements.state;
    next.portfolioEffort = validatedPortfolioEffort(result);

    for (const evidence of result.evidence) {
      next = integrateEvidence(next, evidence, now, this.config);
    }

    if (result.outcome === 'crashed') {
      next.packets[index] = { ...current, lifecycle: 'blocked', attempt: current.attempt + 1 };
      next.activePacketId = null;
      const crashed = event('packet-blocked', packet.id, now, { reason: 'execution-crashed' });
      return { state: addEvent(next, crashed), event: crashed };
    }

    if (result.outcome === 'failed' || !result.acceptanceCriteriaMet) {
      const retrySignature = result.retrySignature ?? current.retrySignature;
      const identicalRetry = retrySignature === current.retrySignature;
      const retryLimitReached = current.attempt + 1 >= this.config.maxRetries;
      const missingStrategyAdjustment = !result.strategyAdjustment?.trim();
      const lifecycle = identicalRetry || retryLimitReached || missingStrategyAdjustment ? 'blocked' : 'eligible';
      next.packets[index] = {
        ...current,
        lifecycle,
        attempt: current.attempt + 1,
        retrySignature,
      };
      next.activePacketId = null;
      const auditEvent = event(
        lifecycle === 'blocked' ? 'packet-blocked' : 'packet-retry-eligible',
        packet.id,
        now,
        {
          reason: identicalRetry
            ? 'identical-retry-prohibited'
            : retryLimitReached
              ? 'retry-limit-reached'
              : missingStrategyAdjustment
                ? 'strategy-adjustment-required'
                : 'strategy-adjusted',
          strategyAdjustment: result.strategyAdjustment,
        },
      );
      return { state: addEvent(next, auditEvent), event: auditEvent };
    }

    next.packets[index] = { ...current, lifecycle: 'verified' };
    next.activePacketId = null;
    const verified = event('packet-verified', packet.id, now, {
      outcome: result.outcome,
      artifactReferences: result.artifactReferences,
      verifier: result.verification.verifier,
      metricUpdates: measurements.updates,
    });
    return { state: addEvent(next, verified), event: verified };
  }
}
