import type { ControllerConfig, EvidenceRecord, StrategyState, Timestamp } from './types.js';

function epoch(timestamp: Timestamp, label: string): number {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) throw new Error(`${label} must be an ISO timestamp`);
  return parsed;
}

export function evidenceValidationErrors(
  state: StrategyState,
  evidence: EvidenceRecord,
  now: Timestamp,
): string[] {
  const errors: string[] = [];
  const currentEpoch = Date.parse(now);
  const observedEpoch = Date.parse(evidence.observedAt);
  if (Number.isNaN(currentEpoch)) errors.push('now must be an ISO timestamp');
  if (Number.isNaN(observedEpoch)) errors.push('Evidence observedAt must be an ISO timestamp');
  else if (!Number.isNaN(currentEpoch) && observedEpoch > currentEpoch) {
    errors.push('Evidence observedAt cannot be in the future');
  }
  for (const [label, value] of [
    ['id', evidence.id],
    ['claim', evidence.claim],
    ['method', evidence.method],
    ['source', evidence.source],
    ['verifier', evidence.verifier],
  ] as const) {
    if (typeof value !== 'string' || !value.trim()) errors.push(`Evidence ${label} must be non-empty`);
  }
  if (!Number.isFinite(evidence.strength) || evidence.strength < 0 || evidence.strength > 1) {
    errors.push('Evidence strength must be between 0 and 1');
  }
  if (!Array.isArray(evidence.limitations) || evidence.limitations.length === 0 ||
      !evidence.limitations.every((limitation) => typeof limitation === 'string' && limitation.trim().length > 0)) {
    errors.push('Evidence limitations must contain at least one explicit limitation');
  }
  if (!['positive', 'negative', 'null'].includes(evidence.outcome)) errors.push('Evidence outcome is invalid');
  const supported = Array.isArray(evidence.supportedHypotheses) ? evidence.supportedHypotheses : [];
  const falsified = Array.isArray(evidence.falsifiedHypotheses) ? evidence.falsifiedHypotheses : [];
  const overlap = supported.filter((id) => falsified.includes(id));
  if (overlap.length > 0) errors.push(`Evidence cannot both support and falsify: ${overlap.join(', ')}`);
  for (const hypothesisId of [...supported, ...falsified]) {
    const target = state.nodes.find((node) => node.id === hypothesisId);
    if (!target) errors.push(`Evidence references missing hypothesis ${hypothesisId}`);
    else if (target.kind !== 'hypothesis') errors.push(`Evidence target ${hypothesisId} is not a hypothesis`);
  }
  return errors;
}

export function isEvidenceStale(evidence: EvidenceRecord, now: Timestamp, maxAgeMs: number): boolean {
  return epoch(now, 'now') - epoch(evidence.observedAt, 'evidence.observedAt') > maxAgeMs;
}

export function integrateEvidence(
  state: StrategyState,
  evidence: EvidenceRecord,
  now: Timestamp,
  config: ControllerConfig,
): StrategyState {
  const errors = evidenceValidationErrors(state, evidence, now);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (state.evidence.some((record) => record.id === evidence.id)) return state;

  const supported = new Set(evidence.supportedHypotheses);
  const falsified = new Set(evidence.falsifiedHypotheses);
  const assessments = [...state.assessments];
  const nodes = state.nodes.map((node) => {
    let confidence = node.confidence;
    if (evidence.outcome !== 'null' && supported.has(node.id)) {
      confidence += (1 - confidence) * evidence.strength * config.evidenceLearningRate;
    }
    if (evidence.outcome !== 'null' && falsified.has(node.id)) {
      confidence -= confidence * evidence.strength * config.evidenceLearningRate;
      if (node.lifecycle === 'verified') {
        assessments.push({
          id: `assessment:${node.id}:${evidence.id}`,
          nodeId: node.id,
          evidenceId: evidence.id,
          supersedesLifecycle: 'verified',
          status: 'proposed',
          createdAt: now,
        });
      }
    }
    if (!supported.has(node.id) && !falsified.has(node.id)) return node;
    return {
      ...node,
      confidence: Math.max(0, Math.min(1, confidence)),
      evidenceReferences: node.evidenceReferences.includes(evidence.id)
        ? node.evidenceReferences
        : [...node.evidenceReferences, evidence.id],
    };
  });

  return {
    ...state,
    nodes,
    assessments,
    evidence: [...state.evidence, evidence],
  };
}
