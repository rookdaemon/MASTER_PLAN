import type {
  NodeMetrics,
  ClusterSnapshot,
  ExpansionTrigger,
  DegradationAlert,
} from './types.js';

export interface TelemetryConfig {
  headroomThreshold: number;       // default 0.20
  slaMissThreshold: number;        // default 0.01
  slaMissDurationMs: number;       // default 60_000
  cooldownMs: number;              // default 300_000 (5 min)
  energyAlertThreshold: number;    // default 0.15
  materialAlertThreshold: number;  // default 0.10
  metricsHistoryLimit: number;     // default 100
}

const DEFAULT_CONFIG: TelemetryConfig = {
  headroomThreshold: 0.20,
  slaMissThreshold: 0.01,
  slaMissDurationMs: 60_000,
  cooldownMs: 300_000,
  energyAlertThreshold: 0.15,
  materialAlertThreshold: 0.10,
  metricsHistoryLimit: 100,
};

export class CapacityTelemetry {
  private config: TelemetryConfig;
  private nodeMetrics: Map<string, NodeMetrics[]> = new Map();
  private lastExpansionTriggerAt: number | null = null;
  private slaMissSince: Map<string, number> = new Map();

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  recordMetrics(metrics: NodeMetrics): void {
    const history = this.nodeMetrics.get(metrics.nodeId) ?? [];
    history.push(metrics);
    // Keep only last metricsHistoryLimit entries per node
    if (history.length > this.config.metricsHistoryLimit) history.shift();
    this.nodeMetrics.set(metrics.nodeId, history);

    // Track SLA miss duration
    if (metrics.consciousnessSlaMissRate > this.config.slaMissThreshold) {
      if (!this.slaMissSince.has(metrics.nodeId)) {
        this.slaMissSince.set(metrics.nodeId, metrics.timestamp);
      }
    } else {
      this.slaMissSince.delete(metrics.nodeId);
    }
  }

  evaluateExpansion(snapshot: ClusterSnapshot, now: number = Date.now()): ExpansionTrigger | null {
    // Respect cooldown window
    if (this.lastExpansionTriggerAt !== null && now - this.lastExpansionTriggerAt < this.config.cooldownMs) {
      return null;
    }

    // Check headroom
    if (snapshot.headroomFraction < this.config.headroomThreshold) {
      const trigger: ExpansionTrigger = {
        triggeredAt: now,
        reason: 'headroom_low',
        suggestedNodeCount: Math.ceil(snapshot.totalNodes * 0.25),
        priority: snapshot.headroomFraction < 0.05 ? 'urgent' : 'planned',
      };
      this.lastExpansionTriggerAt = now;
      return trigger;
    }

    // Check SLA miss sustained duration
    for (const [, since] of this.slaMissSince.entries()) {
      if (now - since >= this.config.slaMissDurationMs) {
        const trigger: ExpansionTrigger = {
          triggeredAt: now,
          reason: 'sla_breach',
          suggestedNodeCount: Math.max(1, Math.ceil(snapshot.totalNodes * 0.10)),
          priority: 'urgent',
        };
        this.lastExpansionTriggerAt = now;
        return trigger;
      }
    }

    return null;
  }

  evaluateDegradation(snapshot: ClusterSnapshot, now: number = Date.now()): DegradationAlert | null {
    if (snapshot.energyBudgetRemaining < this.config.energyAlertThreshold) {
      return {
        alertedAt: now,
        reason: 'energy_low',
        budgetRemaining: snapshot.energyBudgetRemaining,
      };
    }
    if (snapshot.materialBudgetRemaining < this.config.materialAlertThreshold) {
      return {
        alertedAt: now,
        reason: 'material_low',
        budgetRemaining: snapshot.materialBudgetRemaining,
      };
    }
    return null;
  }

  getNodeMetrics(nodeId: string): NodeMetrics[] {
    return this.nodeMetrics.get(nodeId) ?? [];
  }

  resetCooldown(): void {
    this.lastExpansionTriggerAt = null;
  }
}
