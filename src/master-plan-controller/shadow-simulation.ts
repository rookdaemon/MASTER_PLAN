import { Controller } from './controller.js';
import type { ControllerConfig, ShadowCycleRecord, StrategyState, Timestamp } from './types.js';

export interface ShadowSimulationReport {
  cycles: ShadowCycleRecord[];
  summary: {
    cyclesGenerated: number;
    cyclesReviewed: number;
    anyExecution: boolean;
    anyMerge: boolean;
    stableFrontier: boolean;
    automatedReviewPending: boolean;
  };
}

export function simulateShadowCycles(
  state: StrategyState,
  timestamps: readonly Timestamp[],
  config: ControllerConfig,
): ShadowSimulationReport {
  if (state.governance.mode !== 'shadow') throw new Error('Shadow simulation requires shadow governance mode');
  const initialState = JSON.stringify(state);
  const cycles = timestamps.map((observedAt, index) => {
    const frontier = new Controller(state, config).evaluate(state, observedAt);
    if (JSON.stringify(state) !== initialState) {
      throw new Error('Controller.evaluate mutated state during shadow simulation');
    }
    return {
      cycle: index + 1,
      observedAt,
      rankedFrontier: frontier.ranked.map((entry) => entry.packet.id),
      selectedPacketId: frontier.ranked[0]?.packet.id ?? null,
      executed: false as const,
      merged: false as const,
      stateMutated: false as const,
    };
  });
  const frontierSignatures = new Set(cycles.map((cycle) => JSON.stringify(cycle.rankedFrontier)));
  return {
    cycles,
    summary: {
      cyclesGenerated: cycles.length,
      cyclesReviewed: state.governance.shadowCyclesReviewed,
      anyExecution: cycles.some((cycle) => cycle.executed),
      anyMerge: cycles.some((cycle) => cycle.merged),
      stableFrontier: frontierSignatures.size <= 1,
      automatedReviewPending: state.governance.shadowCyclesReviewed < cycles.length,
    },
  };
}
