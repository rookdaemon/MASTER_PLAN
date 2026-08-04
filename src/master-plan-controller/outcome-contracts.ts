import type {
  EvidenceRecord,
  Metric,
  MetricMeasurement,
  OutcomeContract,
  StrategyState,
  Timestamp,
} from './types.js';

export interface AppliedMetricUpdate {
  nodeId: string;
  metricId: string;
  value: number;
}

export interface MetricMeasurementApplication {
  state: StrategyState;
  updates: AppliedMetricUpdate[];
  errors: string[];
}

function metricSatisfied(metric: Metric): boolean {
  if (metric.direction === 'at-least') return metric.current >= metric.target;
  if (metric.direction === 'at-most') return metric.current <= metric.target;
  return metric.current === metric.target;
}

export function hasMetricGap(metric: Metric): boolean {
  return !metricSatisfied(metric);
}

function contractShapeErrors(contract: OutcomeContract): string[] {
  const errors: string[] = [];
  if (!contract.id?.trim() || !contract.nodeId?.trim() || !contract.metricId?.trim()) {
    errors.push('Outcome contract identity, node, and metric must be non-empty');
  }
  if (!Array.isArray(contract.allowedSourcePrefixes) || contract.allowedSourcePrefixes.length === 0 ||
    contract.allowedSourcePrefixes.some((prefix) => !prefix.startsWith('https://'))) {
    errors.push(`Outcome contract ${contract.id} must allow one or more HTTPS evidence sources`);
  }
  if (!Number.isFinite(contract.minimumEvidenceStrength) || contract.minimumEvidenceStrength < 0 ||
    contract.minimumEvidenceStrength > 1) {
    errors.push(`Outcome contract ${contract.id} evidence threshold is invalid`);
  }
  if (!Number.isSafeInteger(contract.maximumEvidenceAgeMs) || contract.maximumEvidenceAgeMs <= 0) {
    errors.push(`Outcome contract ${contract.id} freshness bound is invalid`);
  }
  if (!contract.requiredVerifierPrefix?.trim() || !contract.verificationMethod?.trim()) {
    errors.push(`Outcome contract ${contract.id} verifier contract is incomplete`);
  }
  if (!Number.isFinite(contract.minimumValue) || !Number.isFinite(contract.maximumValue) ||
    contract.minimumValue > contract.maximumValue) {
    errors.push(`Outcome contract ${contract.id} value bounds are invalid`);
  }
  if (contract.requiresExternalDemonstration !== true) {
    errors.push(`Outcome contract ${contract.id} must require external demonstration`);
  }
  return errors;
}

export function outcomeContractErrors(state: StrategyState): string[] {
  const errors: string[] = [];
  const identities = new Set<string>();
  const bindings = new Map<string, number>();
  for (const contract of state.outcomeContracts) {
    errors.push(...contractShapeErrors(contract));
    if (identities.has(contract.id)) errors.push(`Duplicate outcome contract identity: ${contract.id}`);
    identities.add(contract.id);
    const binding = `${contract.nodeId}:${contract.metricId}`;
    bindings.set(binding, (bindings.get(binding) ?? 0) + 1);
    const node = state.nodes.find((candidate) => candidate.id === contract.nodeId);
    const metric = node?.metrics.find((candidate) => candidate.id === contract.metricId);
    if (!metric) errors.push(`Outcome contract ${contract.id} references a missing node metric`);
    else if (contract.minimumValue > Math.min(metric.current, metric.target) ||
      contract.maximumValue < Math.max(metric.current, metric.target)) {
      errors.push(`Outcome contract ${contract.id} bounds exclude the current or target metric value`);
    }
  }
  for (const node of state.nodes) {
    for (const metric of node.metrics) {
      const count = bindings.get(`${node.id}:${metric.id}`) ?? 0;
      if (count === 0) errors.push(`Metric ${node.id}/${metric.id} has no outcome contract`);
      if (count > 1) errors.push(`Metric ${node.id}/${metric.id} has duplicate outcome contracts`);
    }
  }
  return errors;
}

function measurementError(
  state: StrategyState,
  measurement: MetricMeasurement,
  evidenceRecords: readonly EvidenceRecord[],
  packetNodeId: string,
  now: Timestamp,
): string | null {
  const contract = state.outcomeContracts.find((candidate) => candidate.id === measurement.outcomeContractId);
  if (!contract || contract.nodeId !== packetNodeId) return 'metric measurement has no packet-bound outcome contract';
  const node = state.nodes.find((candidate) => candidate.id === contract.nodeId);
  if (!node?.metrics.some((metric) => metric.id === contract.metricId)) return 'metric measurement target is missing';
  const evidence = evidenceRecords.find((candidate) => candidate.id === measurement.evidenceId);
  if (!evidence || evidence.outcome !== 'positive') return 'metric measurement requires positive outcome evidence';
  if (measurement.observedAt !== evidence.observedAt) return 'metric measurement timestamp must match its evidence';
  const nowEpoch = Date.parse(now);
  const observedEpoch = Date.parse(measurement.observedAt);
  if (Number.isNaN(nowEpoch) || Number.isNaN(observedEpoch) || observedEpoch > nowEpoch ||
    nowEpoch - observedEpoch > contract.maximumEvidenceAgeMs) return 'metric measurement evidence is not fresh';
  if (evidence.strength < contract.minimumEvidenceStrength) return 'metric measurement evidence is too weak';
  if (!contract.allowedSourcePrefixes.some((prefix) => evidence.source.startsWith(prefix))) {
    return 'metric measurement evidence source is not allowed';
  }
  if (!evidence.verifier.startsWith(contract.requiredVerifierPrefix)) {
    return 'metric measurement evidence verifier is not qualified';
  }
  if (!Number.isFinite(measurement.value) || measurement.value < contract.minimumValue ||
    measurement.value > contract.maximumValue) return 'metric measurement value is outside contract bounds';
  return null;
}

export function applyMetricMeasurements(
  state: StrategyState,
  measurements: readonly MetricMeasurement[],
  evidenceRecords: readonly EvidenceRecord[],
  packetNodeId: string,
  now: Timestamp,
): MetricMeasurementApplication {
  const next = structuredClone(state);
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const measurement of measurements) {
    if (seen.has(measurement.outcomeContractId)) errors.push('duplicate metric measurement contract');
    seen.add(measurement.outcomeContractId);
    const error = measurementError(state, measurement, evidenceRecords, packetNodeId, now);
    if (error) errors.push(error);
  }
  if (errors.length > 0) return { state: next, updates: [], errors };
  const updates = measurements.map((measurement) => {
    const contract = next.outcomeContracts.find((candidate) => candidate.id === measurement.outcomeContractId)!;
    const node = next.nodes.find((candidate) => candidate.id === contract.nodeId)!;
    const metric = node.metrics.find((candidate) => candidate.id === contract.metricId)!;
    metric.current = measurement.value;
    if (contract.requiresExternalDemonstration) node.externallyDemonstrated = true;
    return { nodeId: node.id, metricId: metric.id, value: measurement.value };
  });
  return { state: next, updates, errors: [] };
}
