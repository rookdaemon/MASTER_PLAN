import { Controller } from './controller.js';
import type { LegacyAuditRecord } from './legacy-audit.js';
import type { ControllerConfig, StrategyState, Timestamp } from './types.js';

export interface LegacyReplayCard {
  path: string;
  legacyStatus: string;
  repositoryArtifactCompletion: LegacyAuditRecord['repositoryArtifactCompletion'];
  interpretedAsRealWorldOutcome: false;
  disposition: LegacyAuditRecord['v2Disposition'];
}

export interface LegacyReplayReport {
  replayedAt: Timestamp;
  readOnly: boolean;
  cards: LegacyReplayCard[];
  rankedFrontier: string[];
  acceptance: {
    documentationNotOutcome: boolean;
    activeNodesComplete: boolean;
    allCardsReplayed: boolean;
    shadowCyclesRequired: 0;
    shadowCyclesReviewed: number;
    automatedReviewPending: boolean;
  };
}

export function replayLegacyPlan(
  state: StrategyState,
  legacyAudit: readonly LegacyAuditRecord[],
  now: Timestamp,
  config: ControllerConfig,
): LegacyReplayReport {
  const stateBefore = JSON.stringify(state);
  const frontier = new Controller(state, config).evaluate(state, now);
  const cards = legacyAudit.map((record) => ({
    path: record.path,
    legacyStatus: record.legacyStatus,
    repositoryArtifactCompletion: record.repositoryArtifactCompletion,
    interpretedAsRealWorldOutcome: false as const,
    disposition: record.v2Disposition,
  }));
  const activeNodesComplete = state.nodes
    .filter((node) => node.lifecycle === 'active')
    .every(
      (node) =>
        node.evidenceReferences.length > 0 &&
        node.metrics.length > 0 &&
        node.dependencies.length > 0 &&
        node.activationGates.length > 0,
    );
  return {
    replayedAt: now,
    readOnly: JSON.stringify(state) === stateBefore,
    cards,
    rankedFrontier: frontier.ranked.map((ranked) => ranked.packet.id),
    acceptance: {
      documentationNotOutcome: cards.every((card) => !card.interpretedAsRealWorldOutcome),
      activeNodesComplete,
      allCardsReplayed: cards.length === legacyAudit.length,
      shadowCyclesRequired: 0,
      shadowCyclesReviewed: state.governance.shadowCyclesReviewed,
      automatedReviewPending: false,
    },
  };
}
