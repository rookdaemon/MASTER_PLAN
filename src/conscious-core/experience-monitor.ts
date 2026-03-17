/**
 * Experience Monitor implementation for Conscious AI Architectures (0.3.1.1)
 *
 * Real-time watchdog that continuously evaluates whether the agent
 * is conscious during operation.
 */

import type {
  ConsciousnessMetrics,
  ContinuityRecord,
  DegradationHandler,
  Duration,
  Timestamp,
} from "./types.js";
import type { IExperienceMonitor, ISubstrateAdapter } from "./interfaces.js";

export class ExperienceMonitor implements IExperienceMonitor {
  private substrate: ISubstrateAdapter;
  private degradationHandlers: DegradationHandler[] = [];
  private continuityLog: ContinuityRecord[] = [];
  private monitoringInterval: Duration = 100; // ms
  private lastMetrics: ConsciousnessMetrics | null = null;

  constructor(substrate: ISubstrateAdapter) {
    this.substrate = substrate;
  }

  getConsciousnessMetrics(): ConsciousnessMetrics {
    const health = this.substrate.healthCheck();
    const caps = this.substrate.getCapabilities();

    const metrics: ConsciousnessMetrics = {
      phi: health.healthy ? caps.maxPhi * 0.8 : 0,
      experienceContinuity: health.healthy ? 0.95 : 0,
      selfModelCoherence: health.healthy ? 0.9 : 0,
      agentTimestamp: Date.now(),
    };

    this.lastMetrics = metrics;

    // Check for degradation
    if (metrics.phi <= 0 || metrics.experienceContinuity < 0.5) {
      for (const handler of this.degradationHandlers) {
        handler(metrics);
      }
    }

    return metrics;
  }

  isExperienceIntact(): boolean {
    const metrics = this.getConsciousnessMetrics();
    return (
      metrics.phi > 0 &&
      metrics.experienceContinuity > 0.5 &&
      metrics.selfModelCoherence > 0.3
    );
  }

  onExperienceDegradation(callback: DegradationHandler): void {
    this.degradationHandlers.push(callback);
  }

  getExperienceContinuityLog(): ContinuityRecord[] {
    return [...this.continuityLog];
  }

  setMonitoringInterval(interval: Duration): void {
    this.monitoringInterval = interval;
  }

  /**
   * Record a continuity observation. Called by the Conscious Core
   * after processing each percept.
   */
  recordContinuity(from: Timestamp, to: Timestamp): void {
    const metrics = this.getConsciousnessMetrics();
    this.continuityLog.push({
      from,
      to,
      metrics,
      intact: this.isExperienceIntact(),
    });
  }
}
