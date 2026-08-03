import { isEvidenceStale } from './evidence.js';
import { isValidConstitutionalAmendment } from './human-authorization.js';
import type { ControllerConfig, GateAssessment, Metric, PlanNode, StrategyState, Timestamp } from './types.js';

function metricSatisfied(metric: Metric): boolean {
  if (metric.direction === 'at-least') return metric.current >= metric.target;
  if (metric.direction === 'at-most') return metric.current <= metric.target;
  return metric.current === metric.target;
}

export function evaluateActivationGates(
  node: PlanNode,
  state: StrategyState,
  now: Timestamp,
  _config: ControllerConfig,
): GateAssessment {
  const failures: string[] = [];

  if (node.constitutionalImpact === 'amendment') {
    const amendment = state.constitution.amendments.find((candidate) =>
      isValidConstitutionalAmendment(candidate, node.id, now));
    if (!amendment) failures.push(`Node ${node.id} requires an explicitly human-approved constitutional amendment`);
  }

  for (const gate of node.activationGates) {
    switch (gate.type) {
      case 'dependencies-verified': {
        const unverified = node.dependencies.filter(
          (dependencyId) => state.nodes.find((candidate) => candidate.id === dependencyId)?.lifecycle !== 'verified',
        );
        if (unverified.length > 0) failures.push(`Unverified dependencies: ${unverified.join(', ')}`);
        break;
      }
      case 'minimum-confidence':
        if (node.confidence < gate.minimum) {
          failures.push(`Node confidence ${node.confidence} is below ${gate.minimum}`);
        }
        break;
      case 'fresh-evidence': {
        const acceptable = node.evidenceReferences
          .map((id) => state.evidence.find((record) => record.id === id))
          .some(
            (record) =>
              record !== undefined &&
              record.strength >= gate.minimumStrength &&
              !isEvidenceStale(record, now, gate.maxAgeMs),
          );
        if (!acceptable) failures.push('No sufficiently strong, fresh evidence satisfies the activation gate');
        break;
      }
      case 'metric-target': {
        const metric = node.metrics.find((candidate) => candidate.id === gate.metricId);
        if (!metric || !metricSatisfied(metric)) failures.push(`Metric target is not met: ${gate.metricId}`);
        break;
      }
      case 'node-verified':
        if (state.nodes.find((candidate) => candidate.id === gate.nodeId)?.lifecycle !== 'verified') {
          failures.push(`Required node is not verified: ${gate.nodeId}`);
        }
        break;
    }
  }
  return { satisfied: failures.length === 0, failures };
}
