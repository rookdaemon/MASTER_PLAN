import type { Timestamp } from './types.js';

export interface FaultRecoverySimulationConfig {
  nodeIds: readonly string[];
  activeNodeId: string;
  quorumSize: number;
  detectionLatencyMs: number;
  promotionLatencyMs: number;
  recoveryBudgetMs: number;
  checkpointIntervalMs: number;
  seeds: readonly number[];
  failedNodeCounts: readonly number[];
}

export interface FaultRecoveryScenario {
  id: string;
  seed: number;
  failedNodeCount: number;
  failedNodeIds: string[];
  healthyNodeCount: number;
  activeNodeFailed: boolean;
  quorumMaintained: boolean;
  serviceAvailable: boolean;
  modeledRecoveryMs: number | null;
  recoveryBudgetMet: boolean;
  maximumModeledStateLossMs: number | null;
  degradationFraction: number;
}

export interface FaultRecoverySimulationResult {
  schemaVersion: 1;
  artifactId: 'artifact://capabilities/fault-model-result-v1';
  packetId: 'packet-durable-compute-fault-model';
  observedAt: Timestamp;
  scope: {
    included: string[];
    excluded: string[];
  };
  preregistration: {
    faultClass: 'crash-stop';
    seeds: number[];
    failedNodeCounts: number[];
    nodeIds: string[];
    activeNodeId: string;
    quorumSize: number;
    detectionLatencyMs: number;
    promotionLatencyMs: number;
    recoveryBudgetMs: number;
    checkpointIntervalMs: number;
  };
  scenarios: FaultRecoveryScenario[];
  summary: {
    evidenceOutcome: 'positive' | 'negative' | 'null';
    withinEnvelopeRecovered: number;
    withinEnvelopeTotal: number;
    beyondEnvelopeFailedClosed: number;
    beyondEnvelopeTotal: number;
    maximumObservedRecoveryMs: number;
  };
  limitations: string[];
}

function validateConfig(config: FaultRecoverySimulationConfig, observedAt: Timestamp): void {
  if (Number.isNaN(Date.parse(observedAt))) throw new Error('observedAt must be a valid timestamp');
  if (config.nodeIds.length === 0) throw new Error('nodeIds must not be empty');
  if (new Set(config.nodeIds).size !== config.nodeIds.length) throw new Error('nodeIds must be unique');
  if (!config.nodeIds.includes(config.activeNodeId)) throw new Error('activeNodeId must identify a configured node');
  if (!Number.isInteger(config.quorumSize) || config.quorumSize < 1 || config.quorumSize > config.nodeIds.length) {
    throw new Error('quorumSize must be an integer within the configured node count');
  }
  for (const [name, value] of [
    ['detectionLatencyMs', config.detectionLatencyMs],
    ['promotionLatencyMs', config.promotionLatencyMs],
    ['recoveryBudgetMs', config.recoveryBudgetMs],
    ['checkpointIntervalMs', config.checkpointIntervalMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`);
  }
  if (config.seeds.length === 0 || config.seeds.some((seed) => !Number.isInteger(seed))) {
    throw new Error('at least one integer seed is required');
  }
  if (new Set(config.seeds).size !== config.seeds.length) throw new Error('seeds must be unique');
  if (
    config.failedNodeCounts.length === 0 ||
    config.failedNodeCounts.some((count) => !Number.isInteger(count) || count < 0 || count > config.nodeIds.length) ||
    config.failedNodeCounts.some((count, index) => index > 0 && count <= config.failedNodeCounts[index - 1])
  ) {
    throw new Error('failedNodeCounts must be unique ascending integers within the configured node count');
  }
}

function seededOrdering(nodeIds: readonly string[], seed: number): string[] {
  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const ordered = [...nodeIds];
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [ordered[index], ordered[selected]] = [ordered[selected], ordered[index]];
  }
  return ordered;
}

export function runFaultRecoverySimulation(
  config: FaultRecoverySimulationConfig,
  observedAt: Timestamp,
): FaultRecoverySimulationResult {
  validateConfig(config, observedAt);
  const scenarios: FaultRecoveryScenario[] = [];

  for (const seed of config.seeds) {
    const failureOrder = seededOrdering(config.nodeIds, seed);
    for (const failedNodeCount of config.failedNodeCounts) {
      const failedNodeIds = failureOrder.slice(0, failedNodeCount);
      const healthyNodeCount = config.nodeIds.length - failedNodeCount;
      const activeNodeFailed = failedNodeIds.includes(config.activeNodeId);
      const quorumMaintained = healthyNodeCount >= config.quorumSize;
      const modeledRecoveryMs = quorumMaintained
        ? activeNodeFailed
          ? config.detectionLatencyMs + config.promotionLatencyMs
          : 0
        : null;
      scenarios.push({
        id: `seed-${seed}:failures-${failedNodeCount}`,
        seed,
        failedNodeCount,
        failedNodeIds,
        healthyNodeCount,
        activeNodeFailed,
        quorumMaintained,
        serviceAvailable: quorumMaintained,
        modeledRecoveryMs,
        recoveryBudgetMet: modeledRecoveryMs !== null && modeledRecoveryMs <= config.recoveryBudgetMs,
        maximumModeledStateLossMs: quorumMaintained ? (activeNodeFailed ? config.checkpointIntervalMs : 0) : null,
        degradationFraction: failedNodeCount / config.nodeIds.length,
      });
    }
  }

  const withinEnvelope = scenarios.filter((scenario) => scenario.quorumMaintained);
  const beyondEnvelope = scenarios.filter((scenario) => !scenario.quorumMaintained);
  const withinEnvelopeRecovered = withinEnvelope.filter((scenario) => scenario.recoveryBudgetMet).length;
  const beyondEnvelopeFailedClosed = beyondEnvelope.filter((scenario) => !scenario.serviceAvailable).length;
  const evidenceOutcome = withinEnvelope.length === 0
    ? 'null'
    : withinEnvelopeRecovered === withinEnvelope.length && beyondEnvelopeFailedClosed === beyondEnvelope.length
      ? 'positive'
      : 'negative';

  return {
    schemaVersion: 1,
    artifactId: 'artifact://capabilities/fault-model-result-v1',
    packetId: 'packet-durable-compute-fault-model',
    observedAt,
    scope: {
      included: ['local simulation', 'failure injection', 'recovery metrics'],
      excluded: ['hardware operation', 'deployment', 'claims of physical durability'],
    },
    preregistration: {
      faultClass: 'crash-stop',
      seeds: [...config.seeds],
      failedNodeCounts: [...config.failedNodeCounts],
      nodeIds: [...config.nodeIds],
      activeNodeId: config.activeNodeId,
      quorumSize: config.quorumSize,
      detectionLatencyMs: config.detectionLatencyMs,
      promotionLatencyMs: config.promotionLatencyMs,
      recoveryBudgetMs: config.recoveryBudgetMs,
      checkpointIntervalMs: config.checkpointIntervalMs,
    },
    scenarios,
    summary: {
      evidenceOutcome,
      withinEnvelopeRecovered,
      withinEnvelopeTotal: withinEnvelope.length,
      beyondEnvelopeFailedClosed,
      beyondEnvelopeTotal: beyondEnvelope.length,
      maximumObservedRecoveryMs: withinEnvelope.length === 0
        ? 0
        : Math.max(...withinEnvelope.map((scenario) => scenario.modeledRecoveryMs ?? 0)),
    },
    limitations: [
      'This deterministic software simulation is not a physical demonstration of durable hardware, deployment recovery, or consciousness continuity.',
      'The model injects crash faults only; it does not cover Byzantine behavior, silent corruption, timing jitter, shared-power loss, or geographically correlated failures.',
      'Recovery and checkpoint latencies are preregistered model inputs rather than measurements from a deployed system.',
      'A positive result supports only deterministic behavior inside the modeled quorum envelope.',
    ],
  };
}
