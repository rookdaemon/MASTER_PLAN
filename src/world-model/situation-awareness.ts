/**
 * In-memory implementation of ISituationAwareness (0.3.1.5.5)
 *
 * Assembles a structured SituationReport each processing cycle by combining
 * current percepts, active goals, relevant beliefs, recent events, and
 * relevant entity models into a coherent context summary.
 *
 * The assembled SituationReport is the primary context input to deliberate().
 */

import type { Percept, Goal, Timestamp } from '../conscious-core/types.js';
import type {
  SituationReport,
  Belief,
  WorldModelEntityProfile,
} from './types.js';
import type { IBeliefStore, IEntityModelStore, ISituationAwareness } from './interfaces.js';

export class SituationAwareness implements ISituationAwareness {
  private lastReport: SituationReport | null = null;

  constructor(
    private readonly beliefStore: IBeliefStore,
    private readonly entityStore: IEntityModelStore,
  ) {}

  assembleSituationReport(
    currentPercepts: Percept[],
    activeGoals: Goal[],
    recentEvents: string[],
    relevantDomains: string[],
  ): SituationReport {
    // Retrieve beliefs matching the relevant domains
    const relevantBeliefs: Belief[] =
      relevantDomains.length > 0
        ? this.beliefStore.getBeliefsByDomain(relevantDomains)
        : [];

    // Retrieve relevant entities
    const relevantEntities: WorldModelEntityProfile[] =
      this.entityStore.listEntities(relevantDomains);

    // Generate natural-language summary
    const summary = this.generateSummary(
      currentPercepts,
      activeGoals,
      relevantBeliefs,
      recentEvents,
      relevantEntities,
    );

    const now: Timestamp = Date.now();

    const report: SituationReport = {
      timestamp: now,
      currentPercepts,
      activeGoals,
      relevantBeliefs,
      recentEvents,
      relevantEntities,
      summary,
    };

    this.lastReport = report;
    return report;
  }

  getLastReport(): SituationReport | null {
    return this.lastReport;
  }

  /**
   * Generate a natural-language summary of the current situation.
   * In production, this would delegate to the LLM substrate for
   * a richer, more contextual summary.
   */
  private generateSummary(
    percepts: Percept[],
    goals: Goal[],
    beliefs: Belief[],
    events: string[],
    entities: WorldModelEntityProfile[],
  ): string {
    const parts: string[] = [];

    // Perception summary
    if (percepts.length > 0) {
      const modalities = [...new Set(percepts.map((p) => p.modality))];
      parts.push(
        `Perceiving ${percepts.length} input(s) via ${modalities.join(', ')}.`,
      );
    } else {
      parts.push('No new percepts this cycle.');
    }

    // Goal summary
    if (goals.length > 0) {
      const sorted = [...goals].sort((a, b) => b.priority - a.priority);
      const topGoals = sorted.slice(0, 3).map((g) => g.description);
      parts.push(`Active goals (top ${topGoals.length}): ${topGoals.join('; ')}.`);
    }

    // Belief summary
    if (beliefs.length > 0) {
      const highConfidence = beliefs.filter((b) => b.confidence >= 0.7);
      parts.push(
        `${beliefs.length} relevant belief(s), ${highConfidence.length} with high confidence.`,
      );
    }

    // Events summary
    if (events.length > 0) {
      parts.push(`Recent events: ${events.slice(0, 3).join('; ')}.`);
    }

    // Entity summary
    if (entities.length > 0) {
      const conscious = entities.filter(
        (e) => e.consciousnessStatus.treatAsConscious,
      );
      parts.push(
        `${entities.length} known entity/entities, ${conscious.length} treated as conscious.`,
      );
    }

    return parts.join(' ');
  }
}
