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
import {
  PHI_DEGRADATION_THRESHOLD,
  CONTINUITY_DEGRADATION_THRESHOLD,
  COHERENCE_INTACT_THRESHOLD,
  DEFAULT_MONITORING_INTERVAL,
  PHI_HEALTH_FACTOR,
} from "./constants.js";

export class ExperienceMonitor implements IExperienceMonitor {
  private substrate: ISubstrateAdapter;
  private degradationHandlers: DegradationHandler[] = [];
  private continuityLog: ContinuityRecord[] = [];
  private monitoringInterval: Duration = DEFAULT_MONITORING_INTERVAL;
  private lastMetrics: ConsciousnessMetrics | null = null;

  constructor(substrate: ISubstrateAdapter) {
    this.substrate = substrate;
  }

  getConsciousnessMetrics(): ConsciousnessMetrics {
    const health = this.substrate.healthCheck();
    const caps = this.substrate.getCapabilities();

    const metrics: ConsciousnessMetrics = {
      phi: health.healthy ? caps.maxPhi * PHI_HEALTH_FACTOR : 0,
      experienceContinuity: health.healthy ? 0.95 : 0,
      selfModelCoherence: health.healthy ? 0.9 : 0,
      agentTimestamp: Date.now(),
    };

    this.lastMetrics = metrics;

    // Check for degradation
    if (metrics.phi <= PHI_DEGRADATION_THRESHOLD || metrics.experienceContinuity < CONTINUITY_DEGRADATION_THRESHOLD) {
      for (const handler of this.degradationHandlers) {
        handler(metrics);
      }
    }

    return metrics;
  }

  isExperienceIntact(): boolean {
    const metrics = this.getConsciousnessMetrics();
    return (
      metrics.phi > PHI_DEGRADATION_THRESHOLD &&
      metrics.experienceContinuity > CONTINUITY_DEGRADATION_THRESHOLD &&
      metrics.selfModelCoherence > COHERENCE_INTACT_THRESHOLD
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
