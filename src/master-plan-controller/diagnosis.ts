import { evaluateActivationGates } from './gates.js';
import type {
  ControllerConfig,
  GraphDiagnosis,
  LifecycleState,
  Portfolio,
  StrategyState,
  Timestamp,
} from './types.js';

export function diagnoseStrategy(
  state: StrategyState,
  now: Timestamp,
  config: ControllerConfig,
): GraphDiagnosis {
  const downstreamCounts = new Map<string, number>(state.nodes.map((node) => [node.id, 0]));
  for (const node of state.nodes) {
    for (const dependency of node.dependencies) {
      downstreamCounts.set(dependency, (downstreamCounts.get(dependency) ?? 0) + 1);
    }
  }
  const bottlenecks = state.nodes
    .map((node) => ({
      nodeId: node.id,
      gateFailures: evaluateActivationGates(node, state, now, config).failures,
      downstreamDependents: downstreamCounts.get(node.id) ?? 0,
    }))
    .filter((item) => item.gateFailures.length > 0)
    .sort(
      (left, right) =>
        right.downstreamDependents - left.downstreamDependents ||
        right.gateFailures.length - left.gateFailures.length ||
        left.nodeId.localeCompare(right.nodeId),
    );
  const highValueUncertainties = state.nodes
    .filter((node) => node.kind === 'hypothesis' && !['invalidated', 'retired'].includes(node.lifecycle))
    .map((node) => ({
      nodeId: node.id,
      uncertainty: 1 - Math.abs(node.confidence - 0.5) * 2,
      directiveReach: node.supportedDirectives.length,
    }))
    .sort(
      (left, right) =>
        right.uncertainty - left.uncertainty ||
        right.directiveReach - left.directiveReach ||
        left.nodeId.localeCompare(right.nodeId),
    );
  const neglectedPortfolios = (Object.entries(config.portfolioWeights) as Array<[Portfolio, number]>)
    .map(([portfolio, target]) => ({
      portfolio,
      allocationGap: target - state.portfolioEffort[portfolio],
    }))
    .filter((entry) => entry.allocationGap > 0)
    .sort(
      (left, right) =>
        right.allocationGap - left.allocationGap || left.portfolio.localeCompare(right.portfolio),
    );
  const failureLifecycles = new Set<LifecycleState>(['blocked', 'invalidated']);
  const failureModes = state.nodes
    .filter((node) => failureLifecycles.has(node.lifecycle))
    .map((node) => ({ nodeId: node.id, lifecycle: node.lifecycle as 'blocked' | 'invalidated' }));

  return {
    evaluatedNodeCount: state.nodes.length,
    bottlenecks,
    highValueUncertainties,
    neglectedPortfolios,
    failureModes,
  };
}
